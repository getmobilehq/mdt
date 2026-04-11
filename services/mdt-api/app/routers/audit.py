from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from ..auth import AuthContext, require_user
from ..supabase_client import user_client

router = APIRouter(prefix="/audit", tags=["audit"])


class AuditEntry(BaseModel):
    id: str
    user_id: str | None
    role: str | None
    action: str
    resource_type: str
    resource_id: str | None
    practice_id: str | None
    metadata: dict[str, Any]
    created_at: str


@router.get("", response_model=list[AuditEntry])
def list_audit(
    practice_id: str,
    limit: int = Query(default=100, ge=1, le=500),
    action: str | None = None,
    resource_type: str | None = None,
    auth: AuthContext = Depends(require_user),
) -> list[AuditEntry]:
    """List audit log entries. RLS restricts to practice admins."""
    sb = user_client(auth.raw_token)
    q = sb.table("audit_log").select("*").eq("practice_id", practice_id)
    if action:
        q = q.eq("action", action)
    if resource_type:
        q = q.eq("resource_type", resource_type)
    rows = q.order("created_at", desc=True).limit(limit).execute().data or []
    return [AuditEntry(**r) for r in rows]
