import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..audit import record_audit
from ..auth import AuthContext, require_user
from ..daily import create_meeting_token, create_room
from ..supabase_client import user_client

log = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionOut(BaseModel):
    id: str
    practice_id: str
    board_id: str
    daily_room_url: str | None
    daily_room_name: str | None
    started_at: str
    ended_at: str | None


class StartSession(BaseModel):
    board_id: str


class MeetingToken(BaseModel):
    token: str
    room_url: str


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def start_session(
    payload: StartSession,
    auth: AuthContext = Depends(require_user),
) -> SessionOut:
    sb = user_client(auth.raw_token)
    board = (
        sb.table("mdt_boards")
        .select("practice_id")
        .eq("id", payload.board_id)
        .maybe_single()
        .execute()
    )
    if not board.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="board not found")

    practice_id = board.data["practice_id"]
    inserted = (
        sb.table("sessions")
        .insert(
            {
                "practice_id": practice_id,
                "board_id": payload.board_id,
                "started_by": auth.user_id,
            }
        )
        .execute()
    )
    rows = inserted.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not permitted to start a session on this practice",
        )
    session = rows[0]

    # Snapshot patients in kanban order.
    patients = (
        sb.table("patients")
        .select("id")
        .eq("board_id", payload.board_id)
        .neq("column_id", "COMPLETED")
        .order("created_at")
        .execute()
        .data
        or []
    )
    if patients:
        sb.table("session_patients").insert(
            [
                {"session_id": session["id"], "patient_id": p["id"], "position": i}
                for i, p in enumerate(patients)
            ]
        ).execute()

    # Create the Daily.co room. Failure is not fatal — the meeting can still
    # be run without video, but without a room there is no recording pipeline.
    try:
        room = create_room(session["id"])
        sb.table("sessions").update(
            {"daily_room_url": room["url"], "daily_room_name": room["name"]}
        ).eq("id", session["id"]).execute()
        session["daily_room_url"] = room["url"]
        session["daily_room_name"] = room["name"]
    except Exception:
        log.exception("daily.co room creation failed for session %s", session["id"])

    record_audit(
        user_id=auth.user_id,
        action="session.start",
        resource_type="session",
        resource_id=session["id"],
        practice_id=practice_id,
        metadata={"board_id": payload.board_id, "patient_count": len(patients)},
    )
    return SessionOut(**session)


@router.post("/{session_id}/token", response_model=MeetingToken)
def mint_token(
    session_id: str,
    auth: AuthContext = Depends(require_user),
) -> MeetingToken:
    """Issue a Daily.co meeting token for the caller, scoped to this session's room."""
    sb = user_client(auth.raw_token)
    session_row = (
        sb.table("sessions")
        .select("daily_room_url, daily_room_name, started_by")
        .eq("id", session_id)
        .maybe_single()
        .execute()
    )
    if not session_row.data or not session_row.data.get("daily_room_name"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="session or room not found"
        )
    room_name = session_row.data["daily_room_name"]
    profile = (
        sb.table("profiles")
        .select("full_name")
        .eq("id", auth.user_id)
        .maybe_single()
        .execute()
    )
    full_name = (profile.data or {}).get("full_name") or (auth.email or "Clinician")
    is_owner = session_row.data.get("started_by") == auth.user_id

    try:
        token = create_meeting_token(
            room_name=room_name,
            user_id=auth.user_id,
            user_name=full_name,
            is_owner=is_owner,
        )
    except Exception as exc:
        log.exception("daily.co token mint failed for session %s", session_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail="token service unavailable"
        ) from exc
    return MeetingToken(token=token, room_url=session_row.data["daily_room_url"])


class EndSession(BaseModel):
    recording_s3_key: str | None = None


@router.post("/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: str,
    payload: EndSession,
    auth: AuthContext = Depends(require_user),
) -> SessionOut:
    sb = user_client(auth.raw_token)
    updates: dict[str, str] = {"ended_at": datetime.utcnow().isoformat()}
    if payload.recording_s3_key:
        updates["recording_s3_key"] = payload.recording_s3_key
    result = sb.table("sessions").update(updates).eq("id", session_id).execute()
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    row = rows[0]
    record_audit(
        user_id=auth.user_id,
        action="session.end",
        resource_type="session",
        resource_id=session_id,
        practice_id=row["practice_id"],
        metadata={},
    )
    return SessionOut(**row)
