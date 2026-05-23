from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from postgrest.exceptions import APIError
from pydantic import BaseModel, Field

from ..audit import record_audit
from ..auth import AuthContext, require_user
from ..supabase_client import user_client

BoardType = Literal[
    "FRAILTY",
    "COMMUNITY",
    "PSYCHIATRY",
    "CHILD_ENQUIRY",
    "CHILD_CONFERENCE",
    "ADULT_SAFEGUARDING",
]

# Human-friendly labels for messages shown to clinicians.
BOARD_TYPE_LABELS: dict[str, str] = {
    "FRAILTY": "Frailty",
    "COMMUNITY": "Community",
    "PSYCHIATRY": "Psychiatry",
    "CHILD_ENQUIRY": "Child Enquiry",
    "CHILD_CONFERENCE": "Child Conference",
    "ADULT_SAFEGUARDING": "Adult Safeguarding",
}

router = APIRouter(prefix="/boards", tags=["boards"])


class BoardOut(BaseModel):
    id: str
    practice_id: str
    board_type: BoardType
    name: str
    created_by: str | None
    created_at: str


class BoardCreate(BaseModel):
    practice_id: str
    board_type: BoardType
    name: str = Field(min_length=1, max_length=120)


@router.get("", response_model=list[BoardOut])
def list_boards(
    practice_id: str,
    auth: AuthContext = Depends(require_user),
) -> list[BoardOut]:
    sb = user_client(auth.raw_token)
    rows = (
        sb.table("mdt_boards")
        .select("*")
        .eq("practice_id", practice_id)
        .order("board_type")
        .execute()
        .data
        or []
    )
    return [BoardOut(**row) for row in rows]


@router.post("", response_model=BoardOut, status_code=status.HTTP_201_CREATED)
def create_board(
    payload: BoardCreate,
    auth: AuthContext = Depends(require_user),
) -> BoardOut:
    sb = user_client(auth.raw_token)
    try:
        insert = (
            sb.table("mdt_boards")
            .insert(
                {
                    "practice_id": payload.practice_id,
                    "board_type": payload.board_type,
                    "name": payload.name,
                    "created_by": auth.user_id,
                }
            )
            .execute()
        )
    except APIError as exc:
        # One board per (practice, board_type) is enforced by a UNIQUE
        # constraint; turn the raw 23505 into a message a clinician understands.
        code = getattr(exc, "code", None)
        message = (getattr(exc, "message", None) or str(exc)).lower()
        if code == "23505" or "duplicate key" in message:
            label = BOARD_TYPE_LABELS.get(payload.board_type, payload.board_type)
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"This practice already has a {label} board. "
                    "Each practice can have one board per category."
                ),
            ) from exc
        raise
    rows = insert.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not permitted to create a board on this practice",
        )
    row = rows[0]
    record_audit(
        user_id=auth.user_id,
        action="board.create",
        resource_type="mdt_board",
        resource_id=row["id"],
        practice_id=payload.practice_id,
        metadata={"board_type": payload.board_type},
    )
    return BoardOut(**row)
