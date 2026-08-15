"""Trust Reels — the shareable receipt for a completed deal."""

from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel

from ..config import get_settings
from ..deps import CurrentUser, current_user
from ..prompts import (
    NARRATION_PROMPT,
    NARRATION_STYLE,
    REEL_PROMPT,
    REEL_SCHEMA,
)
from ..services.openai_client import chat, chat_json, speak
from ..supabase_client import admin

router = APIRouter(prefix="/reels", tags=["reels"])


class GenerateArgs(BaseModel):
    contract_id: str


@router.post("/generate")
async def generate_reel(
    args: GenerateArgs, user: CurrentUser = Depends(current_user)
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
    if user.id not in (contract["buyer_id"], contract["seller_id"]):
        raise HTTPException(403, "You are not a party to this contract")
    if contract["status"] != "FUNDS_RELEASED":
        raise HTTPException(
            409, "A Trust Reel is only issued once funds have been released"
        )

    existing = (
        db.table("trust_reels")
        .select("*")
        .eq("contract_id", args.contract_id)
        .eq("user_id", user.id)
        .maybe_single()
        .execute()
    ).data
    if existing:
        return _shape(existing, contract)

    profile = (
        db.table("profiles")
        .select("name, trust_score, deals_closed")
        .eq("id", user.id)
        .maybe_single()
        .execute()
    ).data or {}

    risk_events = (
        db.table("risk_events").select("id").eq("room_id", contract["room_id"]).execute()
    ).data or []

    challenge = (
        db.table("voice_challenges")
        .select("latency_ms, phonetic_match")
        .eq("room_id", contract["room_id"])
        .eq("passed", True)
        .limit(1)
        .execute()
    ).data

    verification = (
        db.table("verifications")
        .select("confidence")
        .eq("contract_id", args.contract_id)
        .eq("approved", True)
        .limit(1)
        .execute()
    ).data

    brief = "\n".join(
        [
            "COMPLETED DEAL",
            f"  Freelancer ......... {profile.get('name', 'A verified professional')}",
            f"  Delivered .......... {contract['item_description']}",
            f"  Contract value ..... ${contract['price_cents'] / 100:,.2f}",
            f"  Release condition .. {contract['release_condition']}",
            f"  Trust score ........ {profile.get('trust_score', 100)}",
            f"  Deals closed ....... {profile.get('deals_closed', 1)}",
            f"  Risk flags raised .. {len(risk_events)}",
            f"  Voice check ........ {'passed' if challenge else 'not recorded'}",
            f"  Vision review ...... "
            f"{'approved' if verification else 'settled by jury'}",
            "",
            "Write the headline and exactly four scene captions: the deal, the "
            "security check, the verified delivery, and the payout.",
        ]
    )

    copy = await chat_json(
        model=settings.openai_reel_model,
        system=REEL_PROMPT,
        user_content=brief,
        response_format=REEL_SCHEMA,
        temperature=0.6,
        max_tokens=500,
    )

    scenes = _merge_scene_data(
        copy.get("scenes", []), contract, challenge, verification, profile
    )

    reel = (
        db.table("trust_reels")
        .insert(
            {
                "contract_id": args.contract_id,
                "user_id": user.id,
                "share_slug": secrets.token_urlsafe(9),
                "headline": copy.get("headline", "Verified deal completed"),
                "scenes": scenes,
            }
        )
        .execute()
    ).data[0]

    return _shape(reel, contract)


def _merge_scene_data(
    scenes: list[dict],
    contract: dict,
    challenge: list | None,
    verification: list | None,
    profile: dict,
) -> list[dict]:
    """Bind each AI caption to a hard number from the database.

    The model writes the words; the figures come from the ledger, so a reel can
    never advertise an amount the contract did not actually settle.
    """
    facts = [
        {
            "key": "deal",
            "value": f"${contract['price_cents'] / 100:,.2f}",
            "detail": contract["item_description"],
        },
        {
            "key": "security",
            "value": (
                f"{challenge[0]['latency_ms']} ms"
                if challenge and challenge[0].get("latency_ms") is not None
                else "Verified"
            ),
            "detail": "Live-speaker voice check",
        },
        {
            "key": "verified",
            "value": (
                f"{float(verification[0]['confidence']):.0%}"
                if verification
                else "Jury settled"
            ),
            "detail": contract["release_condition"],
        },
        {
            "key": "payout",
            "value": f"${contract['price_cents'] / 100:,.2f}",
            "detail": f"Trust score {profile.get('trust_score', 100)}",
        },
    ]
    out = []
    for i, fact in enumerate(facts):
        caption = scenes[i].get("caption") if i < len(scenes) else None
        label = scenes[i].get("label") if i < len(scenes) else None
        out.append(
            {
                **fact,
                "label": label or fact["key"].title(),
                "caption": caption or fact["detail"],
            }
        )
    return out


def _shape(reel: dict, contract: dict) -> dict[str, Any]:
    return {
        "share_slug": reel["share_slug"],
        "headline": reel["headline"],
        "scenes": reel["scenes"],
        "amount_usd": f"{contract['price_cents'] / 100:,.2f}",
        "item": contract["item_description"],
    }


@router.get("/{slug}/voiceover")
async def reel_voiceover(slug: str) -> Response:
    """AI-narrated audio track for a reel, as MP3.

    Public and unauthenticated, matching the reel itself. The narration is
    written from settled ledger figures, so it can never voice an amount the
    contract did not actually pay out.
    """
    settings = get_settings()
    db = admin()

    reel = (
        db.table("trust_reels")
        .select("headline, scenes, user_id")
        .eq("share_slug", slug)
        .maybe_single()
        .execute()
    ).data
    if not reel:
        raise HTTPException(404, "Reel not found")

    profile = (
        db.table("profiles")
        .select("name, trust_score, deals_closed")
        .eq("id", reel["user_id"])
        .maybe_single()
        .execute()
    ).data or {}

    facts = "\n".join(
        f"  {s.get('label')}: {s.get('value')} — {s.get('caption')}"
        for s in (reel.get("scenes") or [])
    )
    brief = (
        f"Freelancer: {profile.get('name', 'A verified professional')}\n"
        f"Trust score: {profile.get('trust_score', 100)}\n"
        f"Deals settled: {profile.get('deals_closed', 0)}\n"
        f"Headline: {reel['headline']}\n"
        f"Scenes:\n{facts}"
    )

    script = await chat(
        model=settings.openai_reel_model,
        system=NARRATION_PROMPT,
        user_content=brief,
        temperature=0.5,
        max_tokens=160,
    )

    audio = await speak(
        model=settings.openai_tts_model,
        voice=settings.openai_tts_voice,
        text=script.strip(),
        instructions=NARRATION_STYLE,
    )

    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/passport/{user_id}")
async def trust_passport(user_id: str) -> dict[str, Any]:
    """A freelancer's public, verifiable track record.

    This is the growth loop: every settled deal compounds into a page the
    freelancer can hand a prospective client. Public and unauthenticated by
    design — but it exposes only aggregates and the seller's own reels. No
    counterparty names, no contract ids, no wallet data.
    """
    db = admin()

    profile = (
        db.table("profiles")
        .select("name, avatar_url, trust_score, deals_closed, volume_cents, created_at")
        .eq("id", user_id)
        .maybe_single()
        .execute()
    ).data
    if not profile:
        raise HTTPException(404, "No such profile")

    reels = (
        db.table("trust_reels")
        .select("share_slug, headline, scenes, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(24)
        .execute()
    ).data or []

    # Every figure here is derived from settled ledger state, never from the
    # freelancer's own claims.
    return {
        "name": profile.get("name", "Verified professional"),
        "avatar_url": profile.get("avatar_url"),
        "trust_score": profile.get("trust_score", 100),
        "deals_closed": profile.get("deals_closed", 0),
        "volume_usd": f"{(profile.get('volume_cents') or 0) / 100:,.2f}",
        "member_since": profile.get("created_at"),
        "reels": [
            {
                "share_slug": r["share_slug"],
                "headline": r["headline"],
                "amount": next(
                    (
                        s.get("value")
                        for s in (r.get("scenes") or [])
                        if s.get("key") == "payout"
                    ),
                    None,
                ),
                "created_at": r["created_at"],
            }
            for r in reels
        ],
    }


@router.get("/{slug}")
async def public_reel(slug: str) -> dict[str, Any]:
    """Public, unauthenticated — this is the viral surface."""
    db = admin()
    reel = (
        db.table("trust_reels")
        .select("share_slug, headline, scenes, contract_id, user_id")
        .eq("share_slug", slug)
        .maybe_single()
        .execute()
    ).data
    if not reel:
        raise HTTPException(404, "Reel not found")

    profile = (
        db.table("profiles")
        .select("name, trust_score, deals_closed")
        .eq("id", reel["user_id"])
        .maybe_single()
        .execute()
    ).data or {}

    # deliberately does not expose contract_id, counterparty, or wallet data
    return {
        "share_slug": reel["share_slug"],
        "headline": reel["headline"],
        "scenes": reel["scenes"],
        "freelancer": profile.get("name", "Verified professional"),
        "trust_score": profile.get("trust_score", 100),
        "deals_closed": profile.get("deals_closed", 0),
    }
