"""Aegis Guardian — forensics and escrow for deals negotiated elsewhere.

Most gig work is agreed on Fiverr, Upwork, Discord or WhatsApp long before
anyone considers escrow. Guardian takes that conversation as-is: it runs the
same six-pattern analysis the voice arbitrator uses, extracts the deal, and
converts it into a funded escrow contract — without either party opening a
voice room.
"""

from __future__ import annotations

import secrets
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..config import get_settings
from ..deps import CurrentUser, current_user
from ..prompts import GUARDIAN_PROMPT, GUARDIAN_SCHEMA
from ..services.openai_client import chat_json
from ..supabase_client import admin

router = APIRouter(prefix="/guardian", tags=["guardian"])

MAX_CHARS = 24_000

SOURCES = (
    "FIVERR", "UPWORK", "DISCORD", "WHATSAPP", "TELEGRAM", "EMAIL", "OTHER",
)


def _to_cents(price_usd: float) -> int:
    try:
        d = Decimal(str(price_usd)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise HTTPException(400, "Extracted price is not a valid amount") from exc
    return int(d * 100)


# =============================================================================
# scan a pasted conversation
# =============================================================================


class ScanArgs(BaseModel):
    text: str = Field(min_length=20, max_length=MAX_CHARS)
    source: Literal[
        "FIVERR", "UPWORK", "DISCORD", "WHATSAPP", "TELEGRAM", "EMAIL", "OTHER"
    ] = "OTHER"


@router.post("/scan")
async def scan_conversation(
    args: ScanArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    settings = get_settings()
    db = admin()

    report = await chat_json(
        model=settings.openai_jury_model,
        system=GUARDIAN_PROMPT,
        user_content=(
            f"Conversation copied from {args.source.title()}:\n\n"
            f"---\n{args.text.strip()}\n---"
        ),
        response_format=GUARDIAN_SCHEMA,
        temperature=0.1,
        max_tokens=1600,
    )

    deal = report.get("deal") or {}
    price = deal.get("price_usd")
    price_cents = _to_cents(price) if isinstance(price, (int, float)) and price > 0 else None

    # The model's quotes are the evidence, so drop any it did not actually take
    # from the text. A fabricated quote would discredit the whole report.
    haystack = args.text.lower()
    findings = [
        f
        for f in (report.get("findings") or [])
        if isinstance(f.get("quote"), str)
        and _quote_present(f["quote"], haystack)
    ]

    risk_score = max(0, min(100, int(report.get("risk_score", 0))))

    row = (
        db.table("guardian_scans")
        .insert(
            {
                "user_id": user.id,
                "source": args.source,
                "raw_text": args.text.strip(),
                "risk_score": risk_score,
                "verdict": report.get("verdict", "SAFE"),
                "summary": report.get("summary", ""),
                "findings": findings,
                "extracted_item": deal.get("item_description"),
                "extracted_price_cents": price_cents,
                "extracted_condition": deal.get("release_condition"),
                "extraction_confidence": round(
                    max(0.0, min(1.0, float(deal.get("confidence") or 0))), 3
                ),
                "model": settings.openai_jury_model,
            }
        )
        .execute()
    ).data[0]

    return _shape_scan(row)


def _quote_present(quote: str, haystack_lower: str) -> bool:
    """Tolerant containment check.

    Models normalise smart quotes, ellipses and whitespace when quoting, so an
    exact match is too strict. Anything shorter than a few words is not
    meaningful evidence either way.
    """
    norm = " ".join(
        quote.lower()
        .replace("’", "'")
        .replace("‘", "'")
        .replace("“", '"')
        .replace("”", '"')
        .split()
    )
    if len(norm) < 8:
        return False
    hay = " ".join(
        haystack_lower.replace("’", "'")
        .replace("‘", "'")
        .replace("“", '"')
        .replace("”", '"')
        .split()
    )
    if norm in hay:
        return True
    # fall back to a generous prefix so light trailing edits still verify
    head = norm[: max(12, int(len(norm) * 0.6))]
    return head in hay


def _shape_scan(row: dict) -> dict[str, Any]:
    cents = row.get("extracted_price_cents")
    return {
        "id": row["id"],
        "source": row["source"],
        "risk_score": row["risk_score"],
        "verdict": row["verdict"],
        "summary": row["summary"],
        "findings": row["findings"],
        "deal": {
            "item_description": row.get("extracted_item"),
            "price_cents": cents,
            "price_usd": f"{cents / 100:,.2f}" if cents else None,
            "release_condition": row.get("extracted_condition"),
            "confidence": float(row.get("extraction_confidence") or 0),
            "complete": bool(
                row.get("extracted_item") and cents and row.get("extracted_condition")
            ),
        },
        "created_at": row["created_at"],
    }


@router.get("/scans")
async def my_scans(user: CurrentUser = Depends(current_user)) -> list[dict[str, Any]]:
    rows = (
        admin()
        .table("guardian_scans")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    ).data or []
    return [_shape_scan(r) for r in rows]


# =============================================================================
# turn an analysed deal into a real escrow contract
# =============================================================================


class InviteArgs(BaseModel):
    scan_id: str | None = None
    role: Literal["BUYER", "SELLER"]
    item_description: str = Field(min_length=3, max_length=500)
    price_usd: float = Field(gt=0)
    release_condition: str = Field(min_length=3, max_length=500)


@router.post("/invite")
async def create_invite(
    args: InviteArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    """Mint a link the counterparty can accept to fund the escrow."""
    settings = get_settings()
    db = admin()
    price_cents = _to_cents(args.price_usd)

    if price_cents > settings.aegis_max_auto_lock_cents:
        raise HTTPException(
            400,
            f"${price_cents / 100:,.2f} exceeds the "
            f"${settings.aegis_max_auto_lock_cents / 100:,.2f} automatic limit.",
        )

    # Warn early rather than at accept time, when it would be the other
    # party who sees the failure.
    if args.role == "BUYER":
        wallet = (
            db.table("wallets")
            .select("available_cents")
            .eq("user_id", user.id)
            .maybe_single()
            .execute()
        ).data
        if not wallet or wallet["available_cents"] < price_cents:
            have = (wallet or {}).get("available_cents", 0)
            raise HTTPException(
                409,
                f"Your available balance is ${have / 100:,.2f}, which does not "
                f"cover ${price_cents / 100:,.2f}.",
            )

    row = (
        db.table("guardian_invites")
        .insert(
            {
                "scan_id": args.scan_id,
                "created_by": user.id,
                "creator_role": args.role,
                "token": secrets.token_urlsafe(12),
                "item_description": args.item_description.strip(),
                "price_cents": price_cents,
                "release_condition": args.release_condition.strip(),
            }
        )
        .execute()
    ).data[0]

    return {
        "token": row["token"],
        "item_description": row["item_description"],
        "price_usd": f"{row['price_cents'] / 100:,.2f}",
        "release_condition": row["release_condition"],
        "creator_role": row["creator_role"],
        "expires_at": row["expires_at"],
    }


@router.get("/invite/{token}")
async def preview_invite(token: str) -> dict[str, Any]:
    """Public preview so the counterparty sees the terms before signing in."""
    db = admin()
    inv = (
        db.table("guardian_invites")
        .select("*")
        .eq("token", token)
        .maybe_single()
        .execute()
    ).data
    if not inv:
        raise HTTPException(404, "This invitation link is not valid")

    creator = (
        db.table("profiles")
        .select("name, trust_score, deals_closed")
        .eq("id", inv["created_by"])
        .maybe_single()
        .execute()
    ).data or {}

    return {
        "item_description": inv["item_description"],
        "price_usd": f"{inv['price_cents'] / 100:,.2f}",
        "release_condition": inv["release_condition"],
        # the accepter takes the opposite side
        "your_role": "SELLER" if inv["creator_role"] == "BUYER" else "BUYER",
        "from_name": creator.get("name", "An Aegis user"),
        "from_trust_score": creator.get("trust_score", 100),
        "from_deals_closed": creator.get("deals_closed", 0),
        "accepted": inv["contract_id"] is not None,
        "expires_at": inv["expires_at"],
    }


@router.post("/invite/{token}/accept")
async def accept_invite(
    token: str, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    db = admin()
    try:
        contract = db.rpc(
            "accept_guardian_invite", {"p_token": token, "p_user_id": user.id}
        ).execute().data
    except Exception as exc:  # noqa: BLE001 — surface the database's own message
        raise HTTPException(409, _clean_pg_error(exc)) from exc

    return {
        "contract_id": contract["id"],
        "status": contract["status"],
        "price_usd": f"{contract['price_cents'] / 100:,.2f}",
    }


def _clean_pg_error(exc: Exception) -> str:
    """Postgres wraps our RAISE messages in noise; show only what we wrote."""
    text = str(exc)
    for marker in ("Message: ", "message': '", '"message":"'):
        if marker in text:
            text = text.split(marker, 1)[1]
            break
    return text.strip().strip("'\"}").split("\\n")[0][:200] or "Could not accept this invitation"
