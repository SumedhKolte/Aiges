"""What Aegis is told about a room, shared by both channels.

The voice arbitrator (Realtime, in the browser) and the text arbitrator (Chat
Completions, here on the server) are the same agent reached two different ways.
Building their briefing in one place is what keeps them that way: same rules,
same names, same already-captured terms, differing only in the addendum that
describes the channel.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from ..prompts import AEGIS_SYSTEM_PROMPT, AEGIS_TEXT_CHANNEL, room_context
from ..supabase_client import NO_ROW

# Matches the `stale` interval inside claim_voice_seat(). A holder that stopped
# heart-beating no longer counts as live.
SEAT_STALE = timedelta(seconds=90)


def voice_session_live(room: dict[str, Any]) -> bool:
    """Is someone currently hosting a Realtime session for this room?

    The text channel must not answer while a voice session is up, or the room
    gets two arbitrators talking over each other — one on air, one on screen.
    """
    holder, claimed = room.get("voice_holder_id"), room.get("voice_claimed_at")
    if not holder or not claimed:
        return False
    try:
        at = datetime.fromisoformat(str(claimed).replace("Z", "+00:00"))
    except ValueError:
        return False
    return at > datetime.now(timezone.utc) - SEAT_STALE


def room_instructions(
    db: Any, room_id: str | None, *, channel: Literal["voice", "text"] = "voice"
) -> str:
    """The full system prompt for one room: rules, channel, participants, terms."""
    base = AEGIS_SYSTEM_PROMPT
    if channel == "text":
        base = f"{base}\n\n{AEGIS_TEXT_CHANNEL}"

    if not room_id:
        return base

    room = (
        db.table("rooms")
        .select("buyer_id, seller_id, draft_item, draft_price_cents, draft_condition")
        .eq("id", room_id)
        .maybe_single()
        .execute()
        or NO_ROW
    ).data
    if not room:
        return base

    ids = [i for i in (room["buyer_id"], room["seller_id"]) if i]
    names: dict[str, str] = {}
    if ids:
        names = {
            p["id"]: p["name"]
            for p in (db.table("profiles").select("id, name").in_("id", ids).execute()).data
            or []
        }

    cents = room.get("draft_price_cents")
    return (
        base
        + "\n\n"
        + room_context(
            buyer_name=names.get(room["buyer_id"] or ""),
            seller_name=names.get(room["seller_id"] or ""),
            item=room.get("draft_item"),
            price_usd=f"{cents / 100:,.2f}" if cents else None,
            condition=room.get("draft_condition"),
        )
    )
