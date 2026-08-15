"""WebRTC bridge to the OpenAI Realtime API."""

from __future__ import annotations

from fastapi import APIRouter, Body, Depends, Response
from pydantic import BaseModel

from ..config import get_settings
from ..deps import CurrentUser, current_user
from ..prompts import AEGIS_SYSTEM_PROMPT, AEGIS_TOOLS
from ..services.openai_client import realtime_sdp_exchange
from ..supabase_client import admin

router = APIRouter(prefix="/realtime", tags=["realtime"])


@router.get("/config")
async def session_config(user: CurrentUser = Depends(current_user)) -> dict:
    """Agent configuration for the browser to apply as `session.update`.

    Instructions and tool schemas are not secrets, but the API key is — which
    is why config comes from here while the handshake goes through /sdp.
    """
    settings = get_settings()
    return {
        # `type` is REQUIRED by the GA Realtime API and must survive all the way
        # into the session.update payload. Dropping it makes the whole update
        # fail, which silently leaves the agent with no instructions and no
        # tools -- i.e. a generic assistant that rambles at itself.
        "type": "realtime",
        "instructions": AEGIS_SYSTEM_PROMPT,
        "tools": AEGIS_TOOLS,
        "tool_choice": "auto",
        "audio": {
            "input": {
                "transcription": {"model": "whisper-1"},
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
                    "create_response": True,
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
