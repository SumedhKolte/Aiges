"""Thin async OpenAI wrapper — chat/vision, structured output, and the
Realtime SDP handshake.

Deliberately hand-rolled over httpx rather than the SDK: the Realtime WebRTC
handshake is a raw SDP exchange, and keeping one transport for everything makes
the request path easy to reason about under demo pressure.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
from fastapi import HTTPException

from ..config import get_settings

OPENAI_BASE = "https://api.openai.com/v1"


async def chat(
    *,
    model: str,
    system: str,
    user_content: str | list[dict[str, Any]],
    response_format: dict | None = None,
    max_tokens: int = 900,
    temperature: float = 0.2,
) -> str:
    """One chat completion. `user_content` may be a string or multimodal parts."""
    settings = get_settings()
    payload: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ],
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if response_format:
        payload["response_format"] = response_format

    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{OPENAI_BASE}/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code != 200:
        raise HTTPException(502, f"OpenAI error ({resp.status_code}): {resp.text[:400]}")

    return resp.json()["choices"][0]["message"]["content"]


async def chat_json(**kwargs: Any) -> dict:
    """`chat` where a structured schema was supplied; parses the result."""
    raw = await chat(**kwargs)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(502, f"Model returned malformed JSON: {exc}") from exc


async def speak(
    *, model: str, voice: str, text: str, instructions: str | None = None
) -> bytes:
    """Text to speech. Returns MP3 bytes."""
    settings = get_settings()
    payload: dict[str, Any] = {
        "model": model,
        "voice": voice,
        "input": text,
        "response_format": "mp3",
    }
    if instructions:
        payload["instructions"] = instructions

    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{OPENAI_BASE}/audio/speech",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )

    if resp.status_code != 200:
        raise HTTPException(
            502, f"Speech synthesis failed ({resp.status_code}): {resp.text[:300]}"
        )
    return resp.content


async def realtime_sdp_exchange(offer_sdp: str) -> str:
    """Trade the browser's WebRTC offer for OpenAI's SDP answer.

    The browser never holds the API key: it posts its SDP offer to FastAPI,
    FastAPI signs the call, and only the resulting answer goes back. Media then
    flows browser <-> OpenAI directly, so this proxy costs exactly one round
    trip at setup and nothing thereafter.

    The agent's instructions and tools are applied separately, as a
    `session.update` over the data channel the moment it opens (see
    `GET /realtime/config`). Keeping configuration off the handshake makes this
    resilient to changes in what the calls endpoint accepts inline.
    """
    settings = get_settings()

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{OPENAI_BASE}/realtime/calls",
            headers={
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/sdp",
            },
            params={"model": settings.openai_realtime_model},
            content=offer_sdp,
        )

    if resp.status_code not in (200, 201):
        raise HTTPException(
            502, f"Realtime handshake failed ({resp.status_code}): {resp.text[:400]}"
        )
    return resp.text
