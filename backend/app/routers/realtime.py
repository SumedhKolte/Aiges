"""WebRTC bridge to the OpenAI Realtime API."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Response
from pydantic import BaseModel

from ..config import get_settings
from ..deps import CurrentUser, current_user
from ..prompts import AEGIS_SYSTEM_PROMPT, AEGIS_TOOLS, room_context
from ..services.openai_client import realtime_sdp_exchange
from ..supabase_client import NO_ROW, admin

router = APIRouter(prefix="/realtime", tags=["realtime"])


@router.get("/config")
async def session_config(
    room_id: str | None = None, user: CurrentUser = Depends(current_user)
) -> dict:
    """Agent configuration for the browser to apply as `session.update`.

    Instructions and tool schemas are not secrets, but the API key is — which
    is why config comes from here while the handshake goes through /sdp.

    The room's participants are folded into the instructions. Without that the
    agent does not know two distinct people are present, so it cannot address
    the Seller, relay the Buyer's offer, or ask a named party to accept — it
    just replies to whoever spoke last.
    """
    settings = get_settings()

    instructions = AEGIS_SYSTEM_PROMPT
    if room_id:
        db = admin()
        room = (
            db.table("rooms")
            .select(
                "buyer_id, seller_id, draft_item, draft_price_cents, draft_condition"
            )
            .eq("id", room_id)
            .maybe_single()
            .execute()
            or NO_ROW
        ).data

        if room:
            ids = [i for i in (room["buyer_id"], room["seller_id"]) if i]
            names: dict[str, str] = {}
            if ids:
                names = {
                    p["id"]: p["name"]
                    for p in (
                        db.table("profiles").select("id, name").in_("id", ids).execute()
                    ).data
                    or []
                }

            cents = room.get("draft_price_cents")
            instructions = (
                AEGIS_SYSTEM_PROMPT
                + "\n\n"
                + room_context(
                    buyer_name=names.get(room["buyer_id"] or ""),
                    seller_name=names.get(room["seller_id"] or ""),
                    item=room.get("draft_item"),
                    price_usd=f"{cents / 100:,.2f}" if cents else None,
                    condition=room.get("draft_condition"),
                )
            )

    return {
        # `type` is REQUIRED by the GA Realtime API and must survive all the way
        # into the session.update payload. Dropping it makes the whole update
        # fail, which silently leaves the agent with no instructions and no
        # tools -- i.e. a generic assistant that rambles at itself.
        "type": "realtime",
        "instructions": instructions,
        "tools": AEGIS_TOOLS,
        "tool_choice": "auto",
        "audio": {
            "input": {
                # The arbitrator receives one mixed room track. Whisper can
                # transcribe it, but cannot tell which person said a segment.
                "transcription": {
                    "model": settings.openai_transcription_model,
                    "language": "en",
                },
                # Server-side VAD: the parties talk to each other and Aegis
                # decides for itself when a turn ended. `interrupt_response`
                # lets a human cut Aegis off mid-sentence, which is what makes
                # a Security Halt feel like an interruption rather than a
                # queued announcement.
                "turn_detection": {
                    "type": "server_vad",
                    "threshold": 0.62,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 820,
                    # Audio alone has no trustworthy Buyer/Seller identity.
                    # Respond only after the client sends an attributed turn.
                    "create_response": False,
                    "interrupt_response": True,
                },
            },
            "output": {"voice": settings.openai_realtime_voice},
        },
    }


class SeatArgs(BaseModel):
    room_id: str


@router.post("/seat/claim")
async def claim_seat(
    args: SeatArgs, user: CurrentUser = Depends(current_user)
) -> dict:
    """Take the single arbitrator seat for a room, if it is free."""
    row = (
        admin()
        .rpc("claim_voice_seat", {"p_room_id": args.room_id, "p_user_id": user.id})
        .execute()
        .data
    )
    seat = row[0] if isinstance(row, list) else row
    return {
        "granted": bool(seat["granted"]),
        "holder_id": seat["holder_id"],
        "reason": seat["reason"],
    }


@router.post("/seat/heartbeat")
async def heartbeat_seat(
    args: SeatArgs, user: CurrentUser = Depends(current_user)
) -> dict:
    admin().rpc(
        "heartbeat_voice_seat", {"p_room_id": args.room_id, "p_user_id": user.id}
    ).execute()
    return {"ok": True}


@router.post("/seat/release")
async def release_seat(
    args: SeatArgs, user: CurrentUser = Depends(current_user)
) -> dict:
    admin().rpc(
        "release_voice_seat", {"p_room_id": args.room_id, "p_user_id": user.id}
    ).execute()
    return {"ok": True}


@router.post("/sdp")
async def sdp_proxy(
    offer: str = Body(..., media_type="application/sdp"),
    user: CurrentUser = Depends(current_user),
) -> Response:
    """Sign and forward the browser's SDP offer; return OpenAI's answer."""
    answer = await realtime_sdp_exchange(offer)
    return Response(content=answer, media_type="application/sdp")
