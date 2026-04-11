"""
Daily.co REST + meeting token helpers.

Docs: https://docs.daily.co/reference/rest-api
"""

from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Any

import httpx

DAILY_API_BASE = "https://api.daily.co/v1"
ROOM_TTL_SECONDS = 60 * 60 * 4  # 4h max meeting window
TOKEN_TTL_SECONDS = 60 * 60 * 6  # token slightly longer than room


def _api_key() -> str:
    key = os.environ.get("DAILY_API_KEY")
    if not key:
        raise RuntimeError("DAILY_API_KEY not set")
    return key


def _headers() -> dict[str, str]:
    return {
        "Authorization": f"Bearer {_api_key()}",
        "Content-Type": "application/json",
    }


def create_room(session_id: str) -> dict[str, Any]:
    """Create a private, recording-enabled Daily room scoped to one session."""
    now = int(time.time())
    body = {
        "name": f"mdt-{session_id[:12]}",
        "privacy": "private",
        "properties": {
            "enable_chat": True,
            "enable_screenshare": True,
            "enable_recording": "cloud",
            "eject_at_room_exp": True,
            "nbf": now,
            "exp": now + ROOM_TTL_SECONDS,
            # EU region — matches our eu-west-2 data residency rule.
            "geo": "eu-central",
        },
    }
    with httpx.Client(timeout=10.0) as client:
        r = client.post(f"{DAILY_API_BASE}/rooms", json=body, headers=_headers())
        r.raise_for_status()
        return r.json()


def create_meeting_token(
    *,
    room_name: str,
    user_id: str,
    user_name: str,
    is_owner: bool,
) -> str:
    """Mint a participant token scoped to one room."""
    now = int(time.time())
    body = {
        "properties": {
            "room_name": room_name,
            "user_id": user_id,
            "user_name": user_name,
            "is_owner": is_owner,
            "exp": now + TOKEN_TTL_SECONDS,
            "enable_recording": "cloud" if is_owner else None,
        }
    }
    # Drop None so Daily doesn't reject.
    body["properties"] = {k: v for k, v in body["properties"].items() if v is not None}
    with httpx.Client(timeout=10.0) as client:
        r = client.post(
            f"{DAILY_API_BASE}/meeting-tokens", json=body, headers=_headers()
        )
        r.raise_for_status()
        return r.json()["token"]


def verify_webhook(body: bytes, signature: str | None, timestamp: str | None) -> bool:
    """
    Verify Daily's webhook HMAC.
    Daily signs `${timestamp}.${raw_body}` with the shared secret.
    """
    secret = os.environ.get("DAILY_WEBHOOK_SECRET")
    if not secret or not signature or not timestamp:
        return False
    payload = f"{timestamp}.".encode() + body
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
