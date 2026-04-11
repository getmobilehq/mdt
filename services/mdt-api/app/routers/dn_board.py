from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..auth import AuthContext, require_user
from ..supabase_client import user_client

TaskStatus = Literal["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]

router = APIRouter(prefix="/dn-board", tags=["dn-board"])


class DnBoardTask(BaseModel):
    id: str
    patient_id: str
    patient_name: str
    patient_nhs_last4: str
    description: str
    status: TaskStatus
    deadline: str | None


@router.get("", response_model=list[DnBoardTask])
def list_dn_tasks(
    practice_id: str | None = None,
    auth: AuthContext = Depends(require_user),
) -> list[DnBoardTask]:
    sb = user_client(auth.raw_token)
    q = sb.table("dn_board_tasks").select("*")
    if practice_id:
        q = q.eq("practice_id", practice_id)
    rows = q.order("deadline").execute().data or []
    result: list[DnBoardTask] = []
    for r in rows:
        nhs = r.get("patient_nhs_number") or ""
        result.append(
            DnBoardTask(
                id=r["id"],
                patient_id=r["patient_id"],
                patient_name=r["patient_name"],
                patient_nhs_last4=nhs[-4:] if len(nhs) >= 4 else "",
                description=r["description"],
                status=r["status"],
                deadline=r.get("deadline"),
            )
        )
    return result
