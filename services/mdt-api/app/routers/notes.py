from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..audit import record_audit
from ..auth import AuthContext, require_user
from ..supabase_client import user_client

router = APIRouter(prefix="/notes", tags=["notes"])


class NoteOut(BaseModel):
    id: str
    patient_id: str
    practice_id: str
    content: str
    is_private: bool
    created_by: str
    created_at: str
    updated_at: str


class NoteCreate(BaseModel):
    patient_id: str
    content: str = Field(min_length=1, max_length=20_000)
    is_private: bool = False


@router.get("", response_model=list[NoteOut])
def list_notes(
    patient_id: str,
    auth: AuthContext = Depends(require_user),
) -> list[NoteOut]:
    sb = user_client(auth.raw_token)
    rows = (
        sb.table("notes")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .execute()
        .data
        or []
    )
    return [NoteOut(**r) for r in rows]


@router.post("", response_model=NoteOut, status_code=status.HTTP_201_CREATED)
def create_note(
    payload: NoteCreate,
    auth: AuthContext = Depends(require_user),
) -> NoteOut:
    sb = user_client(auth.raw_token)
    result = (
        sb.table("notes")
        .insert(
            {
                "patient_id": payload.patient_id,
                "content": payload.content,
                "is_private": payload.is_private,
                "created_by": auth.user_id,
            }
        )
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not permitted to add a note to this patient",
        )
    row = rows[0]
    # Never log note content in audit metadata.
    record_audit(
        user_id=auth.user_id,
        action="note.create",
        resource_type="note",
        resource_id=row["id"],
        practice_id=row["practice_id"],
        metadata={"is_private": payload.is_private},
    )
    return NoteOut(**row)
