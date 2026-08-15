"""Audit surfaces: the settlement receipt and counterparty risk preview."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from ..deps import CurrentUser, current_user
from ..supabase_client import admin

router = APIRouter(tags=["audit"])


@router.get("/contracts/{contract_id}/receipt")
async def settlement_receipt(
    contract_id: str, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    """Everything that happened to this contract, in order.

    An escrow that cannot show its work is just a promise. This assembles the
    terms, the forensics timeline, the liveness check, the vision verdict, any
    jury ruling, and the raw ledger entries into one record either party can
    export and keep.
    """
    db = admin()

    contract = (
        db.table("contracts").select("*").eq("id", contract_id).maybe_single().execute()
    ).data
    if not contract:
        raise HTTPException(404, "Contract not found")
    if user.id not in (contract["buyer_id"], contract["seller_id"]):
        raise HTTPException(403, "You are not a party to this contract")

    room_id = contract["room_id"]

    names = {
        p["id"]: p["name"]
        for p in (
            db.table("profiles")
            .select("id, name")
            .in_("id", [contract["buyer_id"], contract["seller_id"]])
            .execute()
        ).data
        or []
    }

    risks = (
        db.table("risk_events")
        .select("level, category, rationale, transcript_excerpt, created_at")
        .eq("room_id", room_id)
        .order("created_at")
        .execute()
    ).data or [] if room_id else []

    challenges = (
        db.table("voice_challenges")
        .select("phrase, latency_ms, phonetic_match, passed, verdict_note, issued_at")
        .eq("room_id", room_id)
        .order("issued_at")
        .execute()
    ).data or [] if room_id else []

    verifications = (
        db.table("verifications")
        .select("approved, confidence, reasoning, model, created_at")
        .eq("contract_id", contract_id)
        .order("created_at")
        .execute()
    ).data or []

    dispute = (
        db.table("disputes")
        .select("buyer_claim, seller_bps, buyer_bps, magistrate_ruling, resolved_at")
        .eq("contract_id", contract_id)
        .maybe_single()
        .execute()
    ).data

    deliberations = []
    if dispute:
        d = (
            db.table("disputes").select("id").eq("contract_id", contract_id)
            .maybe_single().execute()
        ).data
        if d:
            deliberations = (
                db.table("jury_deliberations")
                .select("agent_role, argument, seq")
                .eq("dispute_id", d["id"])
                .order("seq")
                .execute()
            ).data or []

    # The ledger is the only authoritative record of what actually moved.
    ledger = (
        db.table("ledger_entries")
        .select("entry_type, amount_cents, available_after, held_after, memo, created_at, wallet_id")
        .eq("contract_id", contract_id)
        .order("created_at")
        .execute()
    ).data or []

    wallets = {
        w["id"]: w["user_id"]
        for w in (db.table("wallets").select("id, user_id").execute()).data or []
    }

    net = sum(e["amount_cents"] for e in ledger)

    return {
        "contract": {
            "id": contract["id"],
            "item": contract["item_description"],
            "release_condition": contract["release_condition"],
            "amount_usd": f"{contract['price_cents'] / 100:,.2f}",
            "amount_cents": contract["price_cents"],
            "status": contract["status"],
            "risk_score_at_lock": contract["risk_score"],
            "buyer": names.get(contract["buyer_id"], "Buyer"),
            "seller": names.get(contract["seller_id"], "Seller"),
            "created_at": contract["created_at"],
            "locked_at": contract["locked_at"],
            "released_at": contract["released_at"],
        },
        "forensics": risks,
        "liveness_checks": challenges,
        "vision_reviews": verifications,
        "dispute": dispute,
        "jury": deliberations,
        "ledger": [
            {
                "party": names.get(wallets.get(e["wallet_id"], ""), "Party"),
                "entry_type": e["entry_type"],
                "amount_usd": f"{e['amount_cents'] / 100:,.2f}",
                "memo": e["memo"],
                "at": e["created_at"],
            }
            for e in ledger
        ],
        # Proof the settlement neither created nor destroyed money.
        "ledger_nets_to_zero": net == 0,
        "ledger_net_cents": net,
    }


@router.get("/profiles/{profile_id}/risk")
async def counterparty_risk(
    profile_id: str, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    """What Aegis knows about who you are about to deal with.

    Shown before agreement, because the moment to learn someone has a history
    of off-platform payment requests is before you commit money, not after.
    """
    db = admin()

    profile = (
        db.table("profiles")
        .select("name, trust_score, deals_closed, volume_cents, created_at")
        .eq("id", profile_id)
        .maybe_single()
        .execute()
    ).data
    if not profile:
        raise HTTPException(404, "No such profile")

    rooms = (
        db.table("rooms")
        .select("id")
        .or_(f"buyer_id.eq.{profile_id},seller_id.eq.{profile_id}")
        .execute()
    ).data or []
    room_ids = [r["id"] for r in rooms]

    flags: list[dict] = []
    if room_ids:
        flags = (
            db.table("risk_events")
            .select("level, category")
            .in_("room_id", room_ids)
            .execute()
        ).data or []

    by_category: dict[str, int] = {}
    serious = 0
    for f in flags:
        by_category[f["category"]] = by_category.get(f["category"], 0) + 1
        if f["level"] in ("HIGH", "CRITICAL"):
            serious += 1

    disputes = (
        db.table("disputes")
        .select("id, contract_id")
        .execute()
    ).data or []
    contracts = (
        db.table("contracts")
        .select("id")
        .or_(f"buyer_id.eq.{profile_id},seller_id.eq.{profile_id}")
        .execute()
    ).data or []
    contract_ids = {c["id"] for c in contracts}
    dispute_count = sum(1 for d in disputes if d["contract_id"] in contract_ids)

    if serious == 0 and profile["deals_closed"] >= 3:
        verdict = "ESTABLISHED"
    elif serious == 0:
        verdict = "CLEAN"
    elif serious <= 2:
        verdict = "CAUTION"
    else:
        verdict = "HIGH_RISK"

    return {
        "name": profile["name"],
        "trust_score": profile["trust_score"],
        "deals_closed": profile["deals_closed"],
        "volume_usd": f"{(profile['volume_cents'] or 0) / 100:,.2f}",
        "member_since": profile["created_at"],
        "flags_total": len(flags),
        "flags_serious": serious,
        "flags_by_category": by_category,
        "disputes": dispute_count,
        "verdict": verdict,
    }
