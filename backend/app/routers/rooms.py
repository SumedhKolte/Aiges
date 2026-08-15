"""Negotiation rooms and wallet reads."""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..deps import CurrentUser, current_user
from ..supabase_client import NO_ROW, admin

router = APIRouter(tags=["rooms"])


class CreateRoomArgs(BaseModel):
    title: str = Field(default="Untitled negotiation", max_length=140)
    role: Literal["BUYER", "SELLER"]


@router.post("/rooms")
async def create_room(
    args: CreateRoomArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    db = admin()
    code = db.rpc("generate_room_code", {}).execute().data

    payload = {
        "code": code,
        "title": args.title.strip() or "Untitled negotiation",
        "host_id": user.id,
        "status": "OPEN",
        "buyer_id": user.id if args.role == "BUYER" else None,
        "seller_id": user.id if args.role == "SELLER" else None,
    }
    room = db.table("rooms").insert(payload).execute().data[0]
    return room


class JoinRoomArgs(BaseModel):
    code: str = Field(min_length=4, max_length=12)


@router.post("/rooms/join")
async def join_room(
    args: JoinRoomArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    db = admin()
    code = args.code.strip().upper()

    room = (
        db.table("rooms").select("*").eq("code", code).maybe_single().execute() or NO_ROW
    ).data
    if not room:
        raise HTTPException(404, "No negotiation found with that code")

    # already seated
    if user.id in (room["buyer_id"], room["seller_id"]):
        return room

    if room["buyer_id"] and room["seller_id"]:
        raise HTTPException(409, "This negotiation already has both parties")

    seat = "seller_id" if room["buyer_id"] else "buyer_id"
    room = (
        db.table("rooms")
        .update({seat: user.id, "status": "NEGOTIATING"})
        .eq("id", room["id"])
        .execute()
    ).data[0]
    return room


@router.get("/wallet")
async def my_wallet(user: CurrentUser = Depends(current_user)) -> dict[str, Any]:
    db = admin()
    wallet = (
        db.table("wallets")
        .select("available_cents, held_cents")
        .eq("user_id", user.id)
        .maybe_single()
        .execute() or NO_ROW
    ).data
    if not wallet:
        raise HTTPException(404, "Wallet not provisioned")

    return {
        "available_cents": wallet["available_cents"],
        "held_cents": wallet["held_cents"],
        "available_usd": f"{wallet['available_cents'] / 100:,.2f}",
        "held_usd": f"{wallet['held_cents'] / 100:,.2f}",
    }


class TopUpArgs(BaseModel):
    amount_usd: float = Field(gt=0, le=10000)


@router.post("/wallet/topup")
async def top_up(
    args: TopUpArgs, user: CurrentUser = Depends(current_user)
) -> dict[str, Any]:
    """Demo funding. In production this is where a payment processor sits."""
    db = admin()
    cents = int(round(args.amount_usd * 100))
    wallet = db.rpc(
        "credit_wallet", {"p_user_id": user.id, "p_amount_cents": cents}
    ).execute().data
    return {
        "available_cents": wallet["available_cents"],
        "available_usd": f"{wallet['available_cents'] / 100:,.2f}",
    }
