"""Work-proof verification with GPT-4o Vision."""

from __future__ import annotations

import base64
import mimetypes
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..config import get_settings
from ..deps import CurrentUser, current_user
from ..prompts import VISION_SCHEMA, VISION_SYSTEM_PROMPT, vision_user_prompt
from ..services.openai_client import chat_json
from ..supabase_client import admin

router = APIRouter(prefix="/vision", tags=["vision"])

BUCKET = "work-proofs"


class VerifyArgs(BaseModel):
    contract_id: str
    image_path: str  # storage key, e.g. "<contract_id>/proof-1712.png"


@router.post("/verify")
async def verify_work(
    args: VerifyArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    settings = get_settings()
    db = admin()

    contract = (
        db.table("contracts")
        .select("*")
        .eq("id", args.contract_id)
        .maybe_single()
        .execute()
    ).data
    if not contract:
        raise HTTPException(404, "Contract not found")
    if user.id != contract["seller_id"]:
        raise HTTPException(403, "Only the Seller submits proof of completion")
    if contract["status"] not in ("LOCKED", "PENDING_VERIFICATION"):
        raise HTTPException(
            409, f"Contract is {contract['status']} and cannot be verified"
        )

    # the storage key must sit under this contract's own prefix
    if not args.image_path.startswith(f"{args.contract_id}/"):
        raise HTTPException(400, "Image does not belong to this contract")

    try:
        blob = db.storage.from_(BUCKET).download(args.image_path)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(404, f"Could not read the uploaded image: {exc}") from exc

    mime = mimetypes.guess_type(args.image_path)[0] or "image/png"
    data_url = f"data:{mime};base64,{base64.b64encode(blob).decode()}"

    db.table("contracts").update({"status": "PENDING_VERIFICATION"}).eq(
        "id", args.contract_id
    ).execute()

    verdict = await chat_json(
        model=settings.openai_vision_model,
        system=VISION_SYSTEM_PROMPT,
        user_content=[
            {
                "type": "text",
                "text": vision_user_prompt(
                    contract["item_description"],
                    contract["release_condition"],
                    f"{contract['price_cents'] / 100:,.2f}",
                ),
            },
            {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
        ],
        response_format=VISION_SCHEMA,
        temperature=0.0,
    )

    approved = bool(verdict.get("approved"))
    confidence = max(0.0, min(1.0, float(verdict.get("confidence", 0))))
    reasoning = f"{verdict.get('observed', '')}\n\n{verdict.get('reasoning', '')}".strip()

    db.table("verifications").insert(
        {
            "contract_id": args.contract_id,
            "submitted_by": user.id,
            "image_path": args.image_path,
            "approved": approved,
            "confidence": round(confidence, 4),
            "reasoning": reasoning,
            "model": settings.openai_vision_model,
        }
    ).execute()

    released = None
    if approved:
        try:
            released = db.rpc(
                "release_escrow", {"p_contract_id": args.contract_id}
            ).execute().data
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(409, f"Payout failed: {exc}") from exc
    else:
        # leave it awaiting another submission rather than auto-refunding;
        # the Buyer may still dispute and the Seller may still resubmit
        db.table("contracts").update({"status": "LOCKED"}).eq(
            "id", args.contract_id
        ).execute()

    return {
        "approved": approved,
        "confidence": confidence,
        "observed": verdict.get("observed", ""),
        "reasoning": verdict.get("reasoning", ""),
        "status": (released or {}).get("status", "LOCKED"),
        "released_usd": (
            f"{released['price_cents'] / 100:,.2f}" if released else None
        ),
    }
