from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..audit import record_audit
from ..auth import AuthContext, require_user
from ..supabase_client import user_client

TaskStatus = Literal["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"]
UserRole = Literal["GP", "DN", "ADMIN", "SOCIAL_WORKER", "PCN_ADMIN"]

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskOut(BaseModel):
    id: str
    patient_id: str
    practice_id: str
    description: str
    assigned_role: UserRole
    assigned_to_user_id: str | None
    status: TaskStatus
    deadline: date | None
    created_at: str
    updated_at: str


class TaskCreate(BaseModel):
    patient_id: str
    description: str = Field(min_length=1, max_length=1000)
    assigned_role: UserRole
    assigned_to_user_id: str | None = None
    deadline: date | None = None


class TaskUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=1000)
    assigned_role: UserRole | None = None
    assigned_to_user_id: str | None = None
    status: TaskStatus | None = None
    deadline: date | None = None


@router.get("", response_model=list[TaskOut])
def list_tasks(
    patient_id: str,
    auth: AuthContext = Depends(require_user),
) -> list[TaskOut]:
    sb = user_client(auth.raw_token)
    rows = (
        sb.table("tasks")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    return [TaskOut(**r) for r in rows]


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    payload: TaskCreate,
    auth: AuthContext = Depends(require_user),
) -> TaskOut:
    sb = user_client(auth.raw_token)
    result = (
        sb.table("tasks")
        .insert(
            {
                "patient_id": payload.patient_id,
                "description": payload.description,
                "assigned_role": payload.assigned_role,
                "assigned_to_user_id": payload.assigned_to_user_id,
                "deadline": payload.deadline.isoformat() if payload.deadline else None,
                "created_by": auth.user_id,
            }
        )
        .execute()
    )
    rows = result.data or []
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not permitted to create a task for this patient",
        )
    row = rows[0]
    record_audit(
        user_id=auth.user_id,
        action="task.create",
        resource_type="task",
        resource_id=row["id"],
        practice_id=row["practice_id"],
        metadata={"assigned_role": payload.assigned_role},
    )
    return TaskOut(**row)


@router.patch("/{task_id}", response_model=TaskOut)
def update_task(
    task_id: str,
    payload: TaskUpdate,
    auth: AuthContext = Depends(require_user),
) -> TaskOut:
    updates = payload.model_dump(exclude_none=True)
    if "deadline" in updates and updates["deadline"] is not None:
        updates["deadline"] = updates["deadline"].isoformat()
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no fields")

    sb = user_client(auth.raw_token)
    result = sb.table("tasks").update(updates).eq("id", task_id).execute()
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    row = rows[0]
    record_audit(
        user_id=auth.user_id,
        action="task.update",
        resource_type="task",
        resource_id=row["id"],
        practice_id=row["practice_id"],
        metadata={k: v for k, v in updates.items() if k in {"status", "assigned_role"}},
    )
    return TaskOut(**row)
