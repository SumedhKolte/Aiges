"""The AI Jury: two advocates and a magistrate who settles in basis points."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..config import get_settings
from ..deps import CurrentUser, current_user
from ..prompts import (
    BUYER_ADVOCATE_PROMPT,
    MAGISTRATE_PROMPT,
    MAGISTRATE_SCHEMA,
    SELLER_ADVOCATE_PROMPT,
)
from ..services.openai_client import chat, chat_json
from ..supabase_client import admin

router = APIRouter(prefix="/jury", tags=["jury"])


class OpenDisputeArgs(BaseModel):
    contract_id: str
    buyer_claim: str = Field(min_length=10, max_length=2000)


@router.post("/open")
async def open_dispute(
    args: OpenDisputeArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    db = admin()
    contract = _load_contract(db, args.contract_id)

    if user.id != contract["buyer_id"]:
        raise HTTPException(403, "Only the Buyer can open a dispute")
    if contract["status"] not in ("LOCKED", "PENDING_VERIFICATION"):
        raise HTTPException(409, f"Contract is {contract['status']}; nothing to dispute")

    dispute = (
        db.table("disputes")
        .insert(
            {
                "contract_id": args.contract_id,
                "opened_by": user.id,
                "buyer_claim": args.buyer_claim.strip(),
            }
        )
        .execute()
    ).data[0]

    db.table("contracts").update({"status": "DISPUTED"}).eq(
        "id", args.contract_id
    ).execute()

    return {"dispute_id": dispute["id"], "status": "DISPUTED"}


class DeliberateArgs(BaseModel):
    dispute_id: str


@router.post("/deliberate")
async def deliberate(
    args: DeliberateArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    """Run the three agents in sequence and execute the settlement.

    Each argument is written to the database as it lands, so the UI's realtime
    subscription renders the deliberation unfolding rather than a single jump
    to the verdict.
    """
    settings = get_settings()
    db = admin()

    dispute = (
        db.table("disputes")
        .select("*")
        .eq("id", args.dispute_id)
        .maybe_single()
        .execute()
    ).data
    if not dispute:
        raise HTTPException(404, "Dispute not found")
    if dispute["resolved"]:
        raise HTTPException(409, "This dispute has already been settled")

    contract = _load_contract(db, dispute["contract_id"])
    if user.id not in (contract["buyer_id"], contract["seller_id"]):
        raise HTTPException(403, "You are not a party to this contract")

    verification = (
        db.table("verifications")
        .select("approved, confidence, reasoning")
        .eq("contract_id", contract["id"])
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data

    case_file = _build_case_file(contract, dispute, verification)

    # --- Agent 1: Buyer's Advocate -----------------------------------------
    buyer_arg = await chat(
        model=settings.openai_jury_model,
        system=BUYER_ADVOCATE_PROMPT,
        user_content=case_file,
        temperature=0.4,
        max_tokens=300,
    )
    _record(db, args.dispute_id, "BUYER_ADVOCATE", buyer_arg, 1)

    # --- Agent 2: Seller's Advocate ----------------------------------------
    seller_arg = await chat(
        model=settings.openai_jury_model,
        system=SELLER_ADVOCATE_PROMPT,
        user_content=f"{case_file}\n\nTHE BUYER'S ADVOCATE ARGUED:\n{buyer_arg}",
        temperature=0.4,
        max_tokens=300,
    )
    _record(db, args.dispute_id, "SELLER_ADVOCATE", seller_arg, 2)

    # --- Agent 3: The Magistrate -------------------------------------------
    ruling = await chat_json(
        model=settings.openai_jury_model,
        system=MAGISTRATE_PROMPT,
        user_content=(
            f"{case_file}\n\n"
            f"BUYER'S ADVOCATE:\n{buyer_arg}\n\n"
            f"SELLER'S ADVOCATE:\n{seller_arg}\n\n"
            f"Issue your settlement."
        ),
        response_format=MAGISTRATE_SCHEMA,
        temperature=0.1,
        max_tokens=500,
    )

    seller_bps = int(ruling.get("seller_bps", 0))
    if not 0 <= seller_bps <= 10000:
        raise HTTPException(502, f"Magistrate returned an invalid split: {seller_bps}")

    ruling_text = ruling.get("ruling", "").strip()
    _record(db, args.dispute_id, "MAGISTRATE", ruling_text, 3)

    try:
        settled = db.rpc(
            "settle_dispute",
            {
                "p_contract_id": contract["id"],
                "p_seller_bps": seller_bps,
                "p_ruling": ruling_text,
            },
        ).execute().data
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(409, f"Settlement failed: {exc}") from exc

    total = settled["price_cents"]
    seller_cents = (total * seller_bps) // 10000

    return {
        "seller_bps": seller_bps,
        "seller_pct": round(seller_bps / 100, 2),
        "buyer_pct": round((10000 - seller_bps) / 100, 2),
        "seller_payout_usd": f"{seller_cents / 100:,.2f}",
        "buyer_refund_usd": f"{(total - seller_cents) / 100:,.2f}",
        "ruling": ruling_text,
        "decisive_fact": ruling.get("decisive_fact", ""),
        "arguments": {"buyer": buyer_arg, "seller": seller_arg},
        "status": settled["status"],
    }


def _build_case_file(contract: dict, dispute: dict, verification: list | None) -> str:
    lines = [
        "CASE FILE",
        f"  Item ordered ....... {contract['item_description']}",
        f"  Release condition .. {contract['release_condition']}",
        f"  Amount in escrow ... ${contract['price_cents'] / 100:,.2f}",
        f"  Risk score at lock . {contract['risk_score']}/100",
        "",
        "BUYER'S COMPLAINT",
        f"  {dispute['buyer_claim']}",
    ]
    if verification:
        v = verification[0]
        lines += [
            "",
            "AUTOMATED VISION REVIEW OF THE SUBMITTED WORK",
            f"  Verdict ..... {'APPROVED' if v['approved'] else 'REJECTED'} "
            f"(confidence {float(v['confidence']):.0%})",
            f"  Findings .... {v['reasoning']}",
        ]
    else:
        lines += ["", "AUTOMATED VISION REVIEW", "  No work was ever submitted."]
    return "\n".join(lines)


def _record(db: Any, dispute_id: str, role: str, argument: str, seq: int) -> None:
    db.table("jury_deliberations").insert(
        {
            "dispute_id": dispute_id,
            "agent_role": role,
            "argument": argument.strip(),
            "seq": seq,
        }
    ).execute()


def _load_contract(db: Any, contract_id: str) -> dict:
    contract = (
        db.table("contracts")
        .select("*")
        .eq("id", contract_id)
        .maybe_single()
        .execute()
    ).data
    if not contract:
        raise HTTPException(404, "Contract not found")
    return contract
