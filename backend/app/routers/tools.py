"""Execution of the arbitrator's tool calls.

The Realtime agent runs in the browser and its tool calls arrive over the
WebRTC data channel. The browser relays each one here with the user's Supabase
JWT. Nothing the model says is trusted: every argument is re-validated against
the database before a single cent moves.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..config import get_settings
from ..deps import CurrentUser, current_user
from ..services import entropy
from ..supabase_client import admin

router = APIRouter(prefix="/tools", tags=["tools"])

# how much each risk level contributes to a room's cumulative score
RISK_WEIGHTS = {"INFO": 0, "ELEVATED": 15, "HIGH": 45, "CRITICAL": 100}

# a passed voice challenge is only good for this long
CHALLENGE_TTL = timedelta(minutes=10)


# =============================================================================
# create_escrow_contract
# =============================================================================


class CreateContractArgs(BaseModel):
    room_id: str
    item_description: str = Field(min_length=3, max_length=500)
    price_usd: float = Field(gt=0)
    release_condition: str = Field(min_length=3, max_length=500)


def _to_cents(price_usd: float) -> int:
    """Dollars -> cents through Decimal.

    float(0.1) + float(0.2) is not 0.3, and an escrow platform that displays a
    number different from the one it settles is worse than useless. Cents are
    the only authoritative unit past this line.
    """
    try:
        d = Decimal(str(price_usd)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise HTTPException(400, "Price is not a valid amount") from exc
    return int(d * 100)


@router.post("/create_escrow_contract")
async def create_escrow_contract(
    args: CreateContractArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    settings = get_settings()
    db = admin()

    room = (
        db.table("rooms").select("*").eq("id", args.room_id).maybe_single().execute()
    ).data
    if not room:
        raise HTTPException(404, "Negotiation room not found")
    if user.id not in (room["buyer_id"], room["seller_id"], room["host_id"]):
        raise HTTPException(403, "You are not a party to this negotiation")

    buyer_id, seller_id = room["buyer_id"], room["seller_id"]
    if not buyer_id or not seller_id:
        return _refuse(
            "BOTH_PARTIES_REQUIRED",
            "Both a Buyer and a Seller must be present before funds can be locked.",
        )
    if buyer_id == seller_id:
        return _refuse("SELF_DEALING", "Buyer and Seller cannot be the same person.")

    price_cents = _to_cents(args.price_usd)
    if price_cents > settings.aegis_max_auto_lock_cents:
        return _refuse(
            "AMOUNT_EXCEEDS_AUTO_LOCK",
            f"${price_cents / 100:,.2f} exceeds the "
            f"${settings.aegis_max_auto_lock_cents / 100:,.2f} automatic limit "
            f"and needs human review.",
        )

    # --- gate 1: deception forensics ---------------------------------------
    events = (
        db.table("risk_events")
        .select("level, category")
        .eq("room_id", args.room_id)
        .execute()
    ).data or []
    risk_score = min(100, sum(RISK_WEIGHTS.get(e["level"], 0) for e in events))
    if risk_score >= settings.aegis_risk_halt_threshold:
        categories = sorted({e["category"] for e in events if RISK_WEIGHTS.get(e["level"], 0) >= 45})
        return _refuse(
            "SECURITY_HALT",
            "Security Halt. This negotiation is blocked at risk score "
            f"{risk_score}. Detected: {', '.join(categories) or 'high-risk behaviour'}.",
            risk_score=risk_score,
        )

    # --- gate 2: vocal entropy trap -----------------------------------------
    cutoff = (datetime.now(timezone.utc) - CHALLENGE_TTL).isoformat()
    passed = (
        db.table("voice_challenges")
        .select("id, issued_at")
        .eq("room_id", args.room_id)
        .eq("passed", True)
        .gte("issued_at", cutoff)
        .limit(1)
        .execute()
    ).data
    if not passed:
        return _refuse(
            "CHALLENGE_REQUIRED",
            "Voice authenticity has not been confirmed. Issue a vocal challenge "
            "and have the Buyer repeat it before locking funds.",
        )

    # --- gate 3: the buyer can actually pay ---------------------------------
    wallet = (
        db.table("wallets")
        .select("available_cents")
        .eq("user_id", buyer_id)
        .maybe_single()
        .execute()
    ).data
    if not wallet or wallet["available_cents"] < price_cents:
        have = (wallet or {}).get("available_cents", 0)
        return _refuse(
            "INSUFFICIENT_FUNDS",
            f"The Buyer's available balance is ${have / 100:,.2f}, which does "
            f"not cover ${price_cents / 100:,.2f}.",
        )

    # --- all gates passed: write the contract, then lock atomically ---------
    contract = (
        db.table("contracts")
        .insert(
            {
                "room_id": args.room_id,
                "buyer_id": buyer_id,
                "seller_id": seller_id,
                "item_description": args.item_description.strip(),
                "price_cents": price_cents,
                "release_condition": args.release_condition.strip(),
                "risk_score": risk_score,
                "status": "NEGOTIATING",
            }
        )
        .execute()
    ).data[0]

    try:
        locked = db.rpc("lock_escrow", {"p_contract_id": contract["id"]}).execute().data
    except Exception as exc:  # noqa: BLE001 - surface the DB's own message
        db.table("contracts").update({"status": "CANCELLED"}).eq(
            "id", contract["id"]
        ).execute()
        raise HTTPException(409, f"Escrow lock failed: {exc}") from exc

    db.table("rooms").update({"status": "SEALED"}).eq("id", args.room_id).execute()

    return {
        "ok": True,
        "contract_id": locked["id"],
        "status": locked["status"],
        "price_usd": f"{locked['price_cents'] / 100:,.2f}",
        "spoken_summary": (
            f"Funds locked. ${locked['price_cents'] / 100:,.2f} is held in escrow "
            f"for {locked['item_description']}, releasing on: "
            f"{locked['release_condition']}."
        ),
    }


def _refuse(code: str, message: str, **extra: Any) -> dict[str, Any]:
    """A refusal the model can read aloud verbatim.

    Returned as 200 rather than an HTTP error on purpose: the agent must be
    able to explain the refusal to the parties, not just fail silently.
    """
    return {"ok": False, "error_code": code, "spoken_summary": message, **extra}


# =============================================================================
# update_deal_terms — live extraction, published to both parties
# =============================================================================


class DraftTermsArgs(BaseModel):
    room_id: str
    item_description: str | None = Field(default=None, max_length=500)
    price_usd: float | None = Field(default=None, gt=0)
    release_condition: str | None = Field(default=None, max_length=500)
    confidence: float | None = Field(default=None, ge=0, le=1)


@router.post("/update_deal_terms")
async def update_deal_terms(
    args: DraftTermsArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    db = admin()
    _assert_room_member(db, args.room_id, user.id)

    # Partial by design: the model publishes each term as it becomes confident,
    # so a null here means "not heard yet", not "cleared".
    patch: dict[str, Any] = {"draft_updated_at": datetime.now(timezone.utc).isoformat()}
    if args.item_description:
        patch["draft_item"] = args.item_description.strip()
    if args.price_usd is not None:
        patch["draft_price_cents"] = _to_cents(args.price_usd)
    if args.release_condition:
        patch["draft_condition"] = args.release_condition.strip()
    if args.confidence is not None:
        patch["draft_confidence"] = round(args.confidence, 3)

    room = db.table("rooms").update(patch).eq("id", args.room_id).execute().data[0]

    have = [
        k
        for k, v in (
            ("item", room.get("draft_item")),
            ("price", room.get("draft_price_cents")),
            ("release condition", room.get("draft_condition")),
        )
        if v
    ]
    missing = [k for k in ("item", "price", "release condition") if k not in have]

    return {
        "ok": True,
        "captured": have,
        "still_missing": missing,
        # Kept terse so the model does not read the whole thing back aloud.
        "spoken_summary": (
            "Terms updated on screen."
            if not missing
            else f"Noted. Still needed: {', '.join(missing)}."
        ),
    }


# =============================================================================
# flag_risk_event
# =============================================================================


class FlagRiskArgs(BaseModel):
    room_id: str
    level: Literal["INFO", "ELEVATED", "HIGH", "CRITICAL"]
    category: Literal[
        "PRICE_MANIPULATION",
        "OFF_PLATFORM_PAYMENT",
        "URGENCY_COERCION",
        "IDENTITY_SPOOFING",
        "SCOPE_CREEP",
        "THREAT_LANGUAGE",
    ]
    transcript_excerpt: str = Field(max_length=1000)
    rationale: str = Field(max_length=1000)


@router.post("/flag_risk_event")
async def flag_risk_event(
    args: FlagRiskArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    db = admin()
    _assert_room_member(db, args.room_id, user.id)

    weight = RISK_WEIGHTS[args.level]
    halted = args.level in ("HIGH", "CRITICAL")

    db.table("risk_events").insert(
        {
            "room_id": args.room_id,
            "level": args.level,
            "category": args.category,
            "score_delta": weight,
            "transcript_excerpt": args.transcript_excerpt,
            "rationale": args.rationale,
            "halted": halted,
        }
    ).execute()

    events = (
        db.table("risk_events")
        .select("level")
        .eq("room_id", args.room_id)
        .execute()
    ).data or []
    total = min(100, sum(RISK_WEIGHTS.get(e["level"], 0) for e in events))

    return {
        "ok": True,
        "risk_score": total,
        "halted": halted,
        "spoken_summary": (
            f"Security Halt. {args.rationale}"
            if halted
            else f"Noted. Risk score is now {total}."
        ),
    }


# =============================================================================
# vocal entropy challenge
# =============================================================================


class IssueChallengeArgs(BaseModel):
    room_id: str


@router.post("/issue_vocal_challenge")
async def issue_vocal_challenge(
    args: IssueChallengeArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    db = admin()
    _assert_room_member(db, args.room_id, user.id)

    phrase = entropy.generate_phrase()
    row = (
        db.table("voice_challenges")
        .insert({"room_id": args.room_id, "user_id": user.id, "phrase": phrase})
        .execute()
    ).data[0]

    return {
        "ok": True,
        "challenge_id": row["id"],
        "phrase": phrase,
        "spoken_summary": (
            "Before I lock the funds I need to confirm a live speaker. "
            f"Please repeat exactly: {phrase}."
        ),
    }


class VerifyChallengeArgs(BaseModel):
    challenge_id: str
    heard: str = Field(max_length=500)
    # Reaction latency measured in the browser: from the moment Aegis finishes
    # speaking the phrase to the moment the party starts speaking. Timing it
    # server-side from `issued_at` would fold in Aegis's own speech and the
    # length of the phrase, which is noise, not signal.
    latency_ms: int | None = Field(default=None, ge=0, le=120_000)


@router.post("/verify_vocal_challenge")
async def verify_vocal_challenge(
    args: VerifyChallengeArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    settings = get_settings()
    db = admin()

    row = (
        db.table("voice_challenges")
        .select("*")
        .eq("id", args.challenge_id)
        .maybe_single()
        .execute()
    ).data
    if not row:
        raise HTTPException(404, "Challenge not found")
    _assert_room_member(db, row["room_id"], user.id)
    if row["responded_at"]:
        raise HTTPException(409, "This challenge was already answered")

    now = datetime.now(timezone.utc)
    if args.latency_ms is not None:
        latency_ms = args.latency_ms
    else:
        # Fallback only. Wall-clock since issue includes Aegis reading the
        # phrase aloud, so it is compared against a correspondingly looser bar.
        issued = datetime.fromisoformat(row["issued_at"].replace("Z", "+00:00"))
        latency_ms = max(0, int((now - issued).total_seconds() * 1000))
        latency_ms = max(0, latency_ms - 6000)

    passed, similarity, note = entropy.evaluate(
        expected=row["phrase"],
        heard=args.heard,
        latency_ms=latency_ms,
        max_latency_ms=settings.aegis_entropy_max_latency_ms,
        min_match=settings.aegis_entropy_min_match,
    )

    db.table("voice_challenges").update(
        {
            "transcript": args.heard,
            "responded_at": now.isoformat(),
            "latency_ms": latency_ms,
            "phonetic_match": round(similarity, 4),
            "passed": passed,
            "verdict_note": note,
        }
    ).eq("id", args.challenge_id).execute()

    if not passed:
        db.table("risk_events").insert(
            {
                "room_id": row["room_id"],
                "level": "CRITICAL",
                "category": "IDENTITY_SPOOFING",
                "score_delta": RISK_WEIGHTS["CRITICAL"],
                "transcript_excerpt": args.heard,
                "rationale": note,
                "halted": True,
            }
        ).execute()

    return {
        "ok": True,
        "passed": passed,
        "latency_ms": latency_ms,
        "phonetic_match": round(similarity, 4),
        "spoken_summary": (
            note if passed else f"Security Halt. Voice authenticity check failed. {note}"
        ),
    }


# =============================================================================


def _assert_room_member(db: Any, room_id: str, user_id: str) -> dict:
    room = (
        db.table("rooms").select("*").eq("id", room_id).maybe_single().execute()
    ).data
    if not room:
        raise HTTPException(404, "Negotiation room not found")
    if user_id not in (room["buyer_id"], room["seller_id"], room["host_id"]):
        raise HTTPException(403, "You are not a party to this negotiation")
    return room
