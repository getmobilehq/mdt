"""
Inbound webhooks.

Daily.co posts recording lifecycle events here once a meeting ends.
We verify the HMAC signature, resolve the room name back to our session,
persist the recording pointer, and enqueue the transcription pipeline.

Docs: https://docs.daily.co/reference/rest-api/webhooks
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException, Request, status

from ..audit import record_audit
from ..celery_client import enqueue_transcription
from ..daily import verify_webhook
from ..supabase_client import service_client

log = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

# Daily events we act on.
RECORDING_READY_EVENT = "recording.ready-to-download"


@router.post("/daily")
async def daily_webhook(
    request: Request,
    x_webhook_signature: str | None = Header(default=None),
    x_webhook_timestamp: str | None = Header(default=None),
) -> dict[str, str]:
    body = await request.body()
    if not verify_webhook(body, x_webhook_signature, x_webhook_timestamp):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid signature"
        )

    payload = await request.json()
    event_type = payload.get("type") or payload.get("event")
    if event_type != RECORDING_READY_EVENT:
        return {"status": "ignored"}

    data = payload.get("payload") or payload.get("data") or {}
    room_name = data.get("room_name")
    download_link = data.get("download_link") or data.get("url")
    if not room_name or not download_link:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="missing room_name or download_link",
        )

    sb = service_client()
    sessions = (
        sb.table("sessions")
        .select("id, practice_id")
        .eq("daily_room_name", room_name)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not sessions:
        log.warning("recording webhook for unknown room %s", room_name)
        return {"status": "unknown_room"}

    session = sessions[0]
    sb.table("sessions").update(
        {
            "recording_s3_key": data.get("s3_key") or data.get("recording_id") or "",
        }
    ).eq("id", session["id"]).execute()

    enqueue_transcription(session["id"], download_link)

    record_audit(
        user_id=None,
        action="session.recording_ready",
        resource_type="session",
        resource_id=session["id"],
        practice_id=session["practice_id"],
        metadata={"source": "daily_webhook"},
    )
    return {"status": "queued", "session_id": session["id"]}
