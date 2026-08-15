"""The typed channel into the negotiation.

Not everyone wants to talk. A party can instead type their side of the deal,
and Aegis chairs it exactly as it chairs the call: same system prompt, same
tools, same server-side validation before anything touches money.

The browser writes the party's own line into `transcript_segments` (which is
what puts it on the counterparty's screen instantly, over the realtime channel
the room is already subscribed to) and then asks here for the arbitrator's
turn. So this endpoint takes no message text at all — it reads the room's own
transcript, which is the only version of the conversation anyone can be held to.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError

from ..config import get_settings
from ..deps import CurrentUser, current_user
from ..prompts import TERM_SWEEP_PROMPT, TERM_SWEEP_SCHEMA, chat_tool_schemas
from ..services.arbitrator import room_instructions, voice_session_live
from ..services.openai_client import chat_json, chat_tools
from ..supabase_client import admin
from .tools import (
    CreateContractArgs,
    DraftTermsArgs,
    FlagRiskArgs,
    IssueChallengeArgs,
    VerifyChallengeArgs,
    _assert_room_member,
    create_escrow_contract,
    flag_risk_event,
    issue_vocal_challenge,
    update_deal_terms,
    verify_vocal_challenge,
)

log = logging.getLogger("aegis.chat")

router = APIRouter(prefix="/chat", tags=["chat"])

# How much of the conversation the arbitrator is given. Long enough to hold a
# whole negotiation, short enough that a room left open all day still answers.
HISTORY_LIMIT = 60

# Tool calls that operate on a room carry its id from the server, never from
# the model — the same rule the browser applies on the voice path.
ROOM_SCOPED = {
    "create_escrow_contract",
    "flag_risk_event",
    "issue_vocal_challenge",
    "update_deal_terms",
}

# The vocal entropy trap is meaningless over a keyboard: a typed phrase proves
# nothing about who is at it. Withheld here so the model cannot stage a check
# that would look like liveness evidence in the audit trail.
TEXT_MODE_EXCLUDED = frozenset({"issue_vocal_challenge", "verify_vocal_challenge"})

# At most this many tool rounds per turn, so a confused model cannot spin.
MAX_TOOL_ROUNDS = 4


class TurnArgs(BaseModel):
    room_id: str


@router.post("/turn")
async def take_turn(
    args: TurnArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    """Let the arbitrator answer the latest typed message in a room."""
    db = admin()
    room = _assert_room_member(db, args.room_id, user.id)

    # A live call already has an arbitrator in it. The host's browser relays
    # typed lines into that session, so answering here as well would put two
    # Aegises in one room.
    if voice_session_live(room):
        return {"skipped": "voice_session_live", "reply": None}

    segments = (
        db.table("transcript_segments")
        .select("speaker, content, created_at")
        .eq("room_id", args.room_id)
        .order("created_at", desc=True)
        .limit(HISTORY_LIMIT)
        .execute()
    ).data or []
    segments.reverse()

    if not segments:
        return {"skipped": "nothing_said", "reply": None}
    # Both parties typing at once fires this endpoint twice. The second call
    # finds Aegis already holding the last word and stands down rather than
    # answering itself.
    if segments[-1]["speaker"] == "AEGIS":
        return {"skipped": "already_answered", "reply": None}

    messages: list[dict[str, Any]] = [
        {
            "role": "system",
            "content": room_instructions(db, args.room_id, channel="text"),
        }
    ]
    for seg in segments:
        if seg["speaker"] == "AEGIS":
            messages.append({"role": "assistant", "content": seg["content"]})
        else:
            # Bracketed rather than "SELLER: ...", which the model copies
            # straight back into its own reply. The voice path marks the floor
            # the same way, so the convention is one the agent already reads.
            messages.append(
                {
                    "role": "user",
                    "content": f"[{seg['speaker']} wrote]: {seg['content']}",
                }
            )

    # The sweep reads the same transcript and needs nothing from the reply, so
    # it runs alongside the arbitrator rather than after it — the terms panel
    # updates for free, in the time the reply was already going to take.
    reply, _ = await asyncio.gather(
        _arbitrate(messages, args.room_id, user),
        _sweep_terms(segments, args.room_id, user),
    )

    if not reply:
        return {"skipped": "no_reply", "reply": None}

    db.table("transcript_segments").insert(
        {
            "room_id": args.room_id,
            "speaker": "AEGIS",
            "user_id": None,
            "content": reply,
        }
    ).execute()

    return {"reply": reply}


async def _arbitrate(
    messages: list[dict[str, Any]], room_id: str, user: CurrentUser
) -> str:
    """Run the arbitrator until it stops calling tools and says something."""
    settings = get_settings()
    tools = chat_tool_schemas(exclude=TEXT_MODE_EXCLUDED)

    for _ in range(MAX_TOOL_ROUNDS):
        message = await chat_tools(
            model=settings.openai_chat_model, messages=messages, tools=tools
        )
        calls = message.get("tool_calls") or []
        if not calls:
            return (message.get("content") or "").strip()

        messages.append(message)
        for call in calls:
            fn = call.get("function", {})
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.get("id"),
                    "content": json.dumps(
                        await _run_tool(
                            fn.get("name", ""),
                            fn.get("arguments", "{}"),
                            room_id,
                            user,
                        )
                    ),
                }
            )

    return ""


async def _sweep_terms(
    segments: list[dict[str, Any]], room_id: str, user: CurrentUser
) -> None:
    """Publish the three terms as the transcript currently has them.

    The arbitrator is told to call `update_deal_terms` and often does, but the
    terms panel is what both parties watch to catch a misunderstanding early —
    too important to leave to whether the model reached for a tool this turn.
    This pass asks one narrow question of a small model and writes the answer
    through the same validated endpoint.
    """
    settings = get_settings()
    lines = "\n".join(f"{s['speaker']}: {s['content']}" for s in segments)

    try:
        found = await chat_json(
            model=settings.openai_reel_model,
            system=TERM_SWEEP_PROMPT,
            user_content=f"TRANSCRIPT\n\n{lines}",
            response_format=TERM_SWEEP_SCHEMA,
            max_tokens=300,
        )
    except Exception:  # noqa: BLE001 - a failed sweep must not cost the reply
        log.exception("Term sweep failed for room %s", room_id)
        return

    patch = {
        key: found.get(key)
        for key in ("item_description", "price_usd", "release_condition")
        if found.get(key)
    }
    if not patch:
        return

    try:
        await update_deal_terms(
            DraftTermsArgs(
                room_id=room_id,
                confidence=found.get("confidence"),
                **patch,
            ),
            user,
        )
    except (ValidationError, HTTPException):
        log.exception("Could not publish swept terms for room %s", room_id)


async def _run_tool(
    name: str, raw_args: str, room_id: str, user: CurrentUser
) -> dict[str, Any]:
    """Dispatch one tool call onto the very handler the voice path posts to.

    Routed in-process rather than over HTTP, but through the same Pydantic
    models and the same function bodies — so every gate (risk halt, voice
    challenge, buyer balance) applies identically no matter which channel the
    negotiation happened on.
    """
    try:
        parsed = json.loads(raw_args or "{}")
    except json.JSONDecodeError:
        parsed = {}
    if not isinstance(parsed, dict):
        parsed = {}
    if name in ROOM_SCOPED:
        parsed["room_id"] = room_id

    try:
        if name == "create_escrow_contract":
            return await create_escrow_contract(CreateContractArgs(**parsed), user)
        if name == "update_deal_terms":
            return await update_deal_terms(DraftTermsArgs(**parsed), user)
        if name == "flag_risk_event":
            return await flag_risk_event(FlagRiskArgs(**parsed), user)
        if name == "issue_vocal_challenge":
            return await issue_vocal_challenge(IssueChallengeArgs(**parsed), user)
        if name == "verify_vocal_challenge":
            return await verify_vocal_challenge(VerifyChallengeArgs(**parsed), user)
    except HTTPException as exc:
        # Handed back as a tool result, not raised: the model has to be able to
        # tell the parties why an action was refused.
        return {"ok": False, "spoken_summary": str(exc.detail)}
    except Exception as exc:  # noqa: BLE001 - a bad argument must not 500 the turn
        return {"ok": False, "spoken_summary": f"That action could not be completed: {exc}"}

    return {"ok": False, "spoken_summary": f"Unknown tool: {name}"}
