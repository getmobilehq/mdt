from typing import Any

from .supabase_client import service_client


def record_audit(
    *,
    user_id: str | None,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    practice_id: str | None = None,
    role: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Append-only audit write. Never include NHS numbers in metadata."""
    service_client().table("audit_log").insert(
        {
            "user_id": user_id,
            "role": role,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "practice_id": practice_id,
            "metadata": metadata or {},
        }
    ).execute()
