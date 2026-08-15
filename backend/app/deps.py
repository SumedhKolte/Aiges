"""Request authentication.

The browser sends its Supabase access token as `Authorization: Bearer <jwt>`.
We verify it locally when we can (fast path) and fall back to asking the
Supabase auth server (always correct, ~50ms). Supabase issues HS256 tokens on
legacy projects and asymmetric ones on projects using the newer signing keys,
so both paths are supported rather than assuming either.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

import httpx
import jwt
from fastapi import Depends, HTTPException, Request, status
from jwt import PyJWKClient

from .config import get_settings

_jwk_client: PyJWKClient | None = None
_user_cache: dict[str, tuple[float, str]] = {}
_USER_CACHE_TTL = 300.0


@dataclass(frozen=True)
class CurrentUser:
    id: str
    token: str


def _jwks() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        url = f"{get_settings().supabase_url}/auth/v1/.well-known/jwks.json"
        _jwk_client = PyJWKClient(url, cache_keys=True)
    return _jwk_client


def _verify_locally(token: str) -> str | None:
    """Return the user id, or None if we can't verify without a network call."""
    settings = get_settings()
    try:
        alg = jwt.get_unverified_header(token).get("alg", "")
    except jwt.PyJWTError:
        return None

    try:
        if alg == "HS256":
            claims = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        elif alg in ("RS256", "ES256"):
            key = _jwks().get_signing_key_from_jwt(token).key
            claims = jwt.decode(
                token, key, algorithms=[alg], audience="authenticated"
            )
        else:
            return None
    except jwt.PyJWTError:
        return None

    return claims.get("sub")


async def _verify_remotely(token: str) -> str | None:
    now = time.time()
    hit = _user_cache.get(token)
    if hit and hit[0] > now:
        return hit[1]

    settings = get_settings()
    async with httpx.AsyncClient(timeout=8.0) as client:
        resp = await client.get(
            f"{settings.supabase_url}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.supabase_anon_key,
            },
        )
    if resp.status_code != 200:
        return None

    uid = resp.json().get("id")
    if uid:
        _user_cache[token] = (now + _USER_CACHE_TTL, uid)
    return uid


async def current_user(request: Request) -> CurrentUser:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Missing bearer token"
        )
    token = header.split(" ", 1)[1].strip()

    uid = _verify_locally(token) or await _verify_remotely(token)
    if not uid:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "Invalid or expired session"
        )
    return CurrentUser(id=uid, token=token)


CurrentUserDep = Depends(current_user)
