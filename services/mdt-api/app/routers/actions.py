from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..audit import record_audit
from ..auth import AuthContext, require_user
from ..supabase_client import user_client

UserRole = Literal["GP", "DN", "ADMIN", "SOCIAL_WORKER", "PCN_ADMIN"]

router = APIRouter(prefix="/actions", tags=["actions"])


class ActionOut(BaseModel):
    id: str
    session_id: str
    patient_id: str
    practice_id: str
    description: str
    owner_role: UserRole
    deadline: str | None
    confirmed: bool
    created_by_ai: bool
    human_edited: bool
    confirmed_task_id: str | None


class ActionEdit(BaseModel):
    description: str | None = Field(default=None, max_length=1000)
    owner_role: UserRole | None = None
    deadline: str | None = None


@router.get("", response_model=list[ActionOut])
def list_actions(
    session_id: str,
    auth: AuthContext = Depends(require_user),
) -> list[ActionOut]:
    sb = user_client(auth.raw_token)
    rows = (
        sb.table("actions")
        .select("*")
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
        .data
        or []
    )
    return [ActionOut(**r) for r in rows]


@router.patch("/{action_id}", response_model=ActionOut)
def edit_action(
    action_id: str,
    payload: ActionEdit,
    auth: AuthContext = Depends(require_user),
) -> ActionOut:
    updates = payload.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="no fields")
    updates["human_edited"] = True
    sb = user_client(auth.raw_token)
    result = sb.table("actions").update(updates).eq("id", action_id).execute()
    rows = result.data or []
    if not rows:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    row = rows[0]
    record_audit(
        user_id=auth.user_id,
        action="action.edit",
        resource_type="action",
        resource_id=action_id,
        practice_id=row["practice_id"],
        metadata={k: v for k, v in updates.items() if k == "owner_role"},
    )
    return ActionOut(**row)


@router.post("/{action_id}/confirm", response_model=ActionOut)
def confirm_action(
    action_id: str,
    auth: AuthContext = Depends(require_user),
) -> ActionOut:
    """Confirming an action creates a task and links it back."""
    sb = user_client(auth.raw_token)
    existing = (
        sb.table("actions").select("*").eq("id", action_id).maybe_single().execute()
    )
    if not existing.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    action = existing.data
    if action["confirmed"]:
        return ActionOut(**action)

    task_row = (
        sb.table("tasks")
        .insert(
            {
                "patient_id": action["patient_id"],
                "description": action["description"],
                "assigned_role": action["owner_role"],
                "deadline": action.get("deadline"),
                "created_by": auth.user_id,
            }
        )
        .execute()
        .data
    )
    if not task_row:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="not permitted to create task",
        )
    task_id = task_row[0]["id"]

    updated = (
        sb.table("actions")
        .update({"confirmed": True, "confirmed_task_id": task_id})
        .eq("id", action_id)
        .execute()
        .data
    )
    row = updated[0] if updated else action
    record_audit(
        user_id=auth.user_id,
        action="action.confirm",
        resource_type="action",
        resource_id=action_id,
        practice_id=row["practice_id"],
        metadata={"task_id": task_id},
    )
    return ActionOut(**row)
