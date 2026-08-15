"""Aegis backend — voice arbitration, forensics, vision, and settlement."""

from __future__ import annotations

import logging
import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .routers import audit, guardian, jury, realtime, reels, rooms, tools, vision

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("aegis")

settings = get_settings()

app = FastAPI(
    title="Aegis",
    description="The Viral P2P Trust Engine and AI Arbitrator",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# A CORS misconfiguration surfaces in the browser as an opaque network error
# and in the logs as a bare "OPTIONS ... 400", which says nothing about why.
# Logging the effective policy at startup makes it diagnosable from the Render
# log tail alone.
log.info("CORS exact origins : %s", settings.cors_origin_list or "(none)")
log.info("CORS origin regex  : %s", settings.cors_origin_regex or "(disabled)")

app.include_router(realtime.router)
app.include_router(tools.router)
app.include_router(vision.router)
app.include_router(jury.router)
app.include_router(reels.router)
app.include_router(rooms.router)
app.include_router(audit.router)
app.include_router(guardian.router)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal error", "path": request.url.path},
    )


@app.get("/health")
async def health(request: Request) -> dict[str, object]:
    """Liveness plus enough config echo to debug a deploy without a shell.

    Reports whether the caller's own Origin would pass CORS, which turns the
    most common deployment failure from an opaque browser error into a
    one-request answer. No secrets are exposed — only whether they are present.
    """
    origin = request.headers.get("origin")
    allowed: bool | None = None
    if origin:
        allowed = origin in settings.cors_origin_list or bool(
            settings.cors_origin_regex
            and re.fullmatch(settings.cors_origin_regex, origin)
        )

    return {
        "status": "ok",
        "models": {
            "realtime": settings.openai_realtime_model,
            "vision": settings.openai_vision_model,
            "jury": settings.openai_jury_model,
            "reel": settings.openai_reel_model,
        },
        "cors": {
            "your_origin": origin,
            "your_origin_allowed": allowed,
            "exact_origins": settings.cors_origin_list,
            "origin_regex": settings.cors_origin_regex or None,
        },
        "configured": {
            "openai_key": bool(settings.openai_api_key),
            "supabase_service_role_key": bool(settings.supabase_service_role_key),
            "supabase_jwt_secret": bool(settings.supabase_jwt_secret),
        },
    }
