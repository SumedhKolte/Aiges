"""Aegis backend — voice arbitration, forensics, vision, and settlement."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .routers import audit, jury, realtime, reels, rooms, tools, vision

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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(realtime.router)
app.include_router(tools.router)
app.include_router(vision.router)
app.include_router(jury.router)
app.include_router(reels.router)
app.include_router(rooms.router)
app.include_router(audit.router)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception) -> JSONResponse:
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal error", "path": request.url.path},
    )


@app.get("/health")
async def health() -> dict[str, object]:
    return {
        "status": "ok",
        "models": {
            "realtime": settings.openai_realtime_model,
            "vision": settings.openai_vision_model,
            "jury": settings.openai_jury_model,
            "reel": settings.openai_reel_model,
        },
    }
