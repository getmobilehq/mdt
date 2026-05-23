from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from ..audit import record_audit
from ..auth import AuthContext, require_user
from ..supabase_client import user_client

PatientSource = Literal["GP", "DN", "SW", "SP", "CONS", "PALL", "CC"]
BoardColumn = Literal["TO_DISCUSS", "IN_PROGRESS", "FOLLOW_UP", "COMPLETED"]

router = APIRouter(prefix="/patients", tags=["patients"])


class PatientCreate(BaseModel):
    practice_id: str
    board_id: str
    nhs_number: str
    full_name: str = Field(min_length=1, max_length=200)
    dob: date
    summary: str | None = None
    source: PatientSource

    @field_validator("nhs_number")
    @classmethod
    def check_nhs(cls, v: str) -> str:
        digits = "".join(ch for ch in v if ch.isdigit())
        if len(digits) != 10:
            raise ValueError("nhs_number must be 10 digits")
        return digits


class PatientCardOut(BaseModel):
    id: str
    board_id: str
    full_name: str
    nhs_last4: str
    source: PatientSource
    column_id: BoardColumn
    summary: str | None


class MoveRequest(BaseModel):
    column_id: BoardColumn


def _to_card(row: dict) -> PatientCardOut:
    nhs = row.get("nhs_number") or ""
    return PatientCardOut(
        id=row["id"],
        board_id=row["board_id"],
        full_name=row["full_name"],
        nhs_last4=nhs[-4:] if len(nhs) >= 4 else "",
        source=row["source"],
        column_id=row["column_id"],
        summary=row.get("summary"),
    )


@router.get("", response_model=list[PatientCardOut])
def list_patients(
    board_id: str,
    auth: AuthContext = Depends(require_user),
) -> list[PatientCardOut]:
    sb = user_client(auth.raw_token)
    rows = (
        sb.table("patients")
        .select("id,board_id,full_name,nhs_number,source,column_id,summary")
        .eq("board_id", board_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    return [_to_card(r) for r in rows]


@router.post("", response_model=PatientCardOut, status_code=status.HTTP_201_CREATED)
def create_patient(
    payload: PatientCreate,
    auth: AuthContext = Depends(require_user),
) -> PatientCardOut:
    sb = user_client(auth.raw_token)
    result = (
        sb.table("patients")
        .insert(
            {
                "practice_id": payload.practice_id,
                "board_id": payload.board_id,
                "nhs_number": payload.nhs_number,
                "full_name": payload.full_name,
                "dob": payload.dob.isoformat(),
                "summary": payload.summary,
                "source": payload.source,
            }
        )
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not permitted to add a patient to this practice",
        )
    row = rows[0]
    # Audit metadata must never include NHS number or full name.
    record_audit(
        user_id=auth.user_id,
        action="patient.create",
        resource_type="patient",
        resource_id=row["id"],
        practice_id=payload.practice_id,
        metadata={"board_id": payload.board_id, "source": payload.source},
    )
    return _to_card(row)


@router.patch("/{patient_id}/column", response_model=PatientCardOut)
def move_patient(
    patient_id: str,
    payload: MoveRequest,
    auth: AuthContext = Depends(require_user),
) -> PatientCardOut:
    sb = user_client(auth.raw_token)
    result = (
        sb.table("patients")
        .update({"column_id": payload.column_id})
        .eq("id", patient_id)
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    row = rows[0]
    record_audit(
        user_id=auth.user_id,
        action="patient.move",
        resource_type="patient",
        resource_id=row["id"],
        practice_id=row["practice_id"],
        metadata={"column_id": payload.column_id},
    )
    return _to_card(row)
