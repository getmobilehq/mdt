from typing import Any

from .supabase_client import service_client


def record_audit(
    *,
    action: str,
    resource_type: str,
    resource_id: str | None = None,
    practice_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """
    Append-only audit write from a Celery worker (service role, no end user).
    user_id/role are null to mark the actor as system automation.
    Never include NHS numbers or patient names in metadata.
    """
    service_client().table("audit_log").insert(
        {
            "user_id": None,
            "role": None,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "practice_id": practice_id,
            "metadata": {"actor": "worker", **(metadata or {})},
        }
    ).execute()
