import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..audit import record_audit
from ..auth import AuthContext, require_user
from ..supabase_client import user_client

router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionOut(BaseModel):
    id: str
    practice_id: str
    board_id: str
    daily_room_url: str | None
    started_at: str
    ended_at: str | None


class StartSession(BaseModel):
    board_id: str


def _create_daily_room_stub(session_id: str) -> str | None:
    """
    Placeholder. When DAILY_API_KEY is set this should POST to
    https://api.daily.co/v1/rooms and return the returned url.
    Epic 7 scaffolds the session flow; full Daily.co wiring is
    tracked as an integration TODO.
    """
    if not os.environ.get("DAILY_API_KEY"):
        return None
    return f"https://example.daily.co/pending-{session_id[:8]}"


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

    daily_url = _create_daily_room_stub(session["id"])
    if daily_url:
        sb.table("sessions").update({"daily_room_url": daily_url}).eq(
            "id", session["id"]
        ).execute()
        session["daily_room_url"] = daily_url

    record_audit(
        user_id=auth.user_id,
        action="session.start",
        resource_type="session",
        resource_id=session["id"],
        practice_id=practice_id,
        metadata={"board_id": payload.board_id, "patient_count": len(patients)},
    )
    return SessionOut(**session)


class EndSession(BaseModel):
    recording_s3_key: str | None = None


@router.post("/{session_id}/end", response_model=SessionOut)
def end_session(
    session_id: str,
    payload: EndSession,
    auth: AuthContext = Depends(require_user),
) -> SessionOut:
    sb = user_client(auth.raw_token)
    updates = {"ended_at": datetime.utcnow().isoformat()}
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
