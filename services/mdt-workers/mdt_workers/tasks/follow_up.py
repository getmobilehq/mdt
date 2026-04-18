"""
Nightly follow-up automation.

Scans tasks whose status != DONE and whose deadline is either
within the next 3 days (DUE_SOON) or in the past (OVERDUE).
For each match, inserts one reminder row per (task, kind, period_key)
and (if Twilio creds + template SIDs are configured) sends a WhatsApp
notification via an approved Meta Business template.

Idempotency is enforced by the unique index on
reminders(task_id, kind, period_key) — re-running the job on the same
day is a no-op.

Safety:
  - Message body is controlled by the approved template; we only supply
    variables. Never include NHS numbers or full patient names.
  - Template variables are truncated to Meta's 1024-char limit (we cap
    lower for safety).

Templates (configure in Twilio Content Builder, approved by Meta):
  TWILIO_TEMPLATE_SID_OVERDUE   — "CareLoop MDT: overdue task — {{1}} (was due {{2}}). Please update or reassign."
  TWILIO_TEMPLATE_SID_DUE_SOON  — "CareLoop MDT: task due soon — {{1}} by {{2}}."
"""

from __future__ import annotations

import json
import logging
import os
from datetime import date, timedelta

from celery.schedules import crontab

from ..audit import record_audit
from ..celery_app import app
from ..supabase_client import service_client

log = logging.getLogger(__name__)

DUE_SOON_WINDOW_DAYS = 3
TEMPLATE_VAR_MAX_CHARS = 200


def _resolve_phone(sb, user_id: str | None) -> str | None:
    if not user_id:
        return None
    row = (
        sb.table("profiles")
        .select("phone")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    phone = row[0].get("phone") if row else None
    return phone or None


def _template_sid_for(kind: str) -> str | None:
    env_name = (
        "TWILIO_TEMPLATE_SID_OVERDUE"
        if kind == "OVERDUE"
        else "TWILIO_TEMPLATE_SID_DUE_SOON"
    )
    return os.environ.get(env_name)


def _template_variables(task_description: str, deadline: str) -> dict[str, str]:
    """Ordered vars for the approved WhatsApp Business template. Positional keys ('1','2',...) per Twilio contract."""
    return {
        "1": (task_description or "")[:TEMPLATE_VAR_MAX_CHARS],
        "2": deadline,
    }


def _twilio_send(
    to: str,
    content_sid: str,
    content_variables: dict[str, str],
) -> str | None:
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_ = os.environ.get("TWILIO_WHATSAPP_NUMBER")
    if not (sid and token and from_):
        log.info("twilio not configured; skipping send")
        return None
    from twilio.rest import Client  # type: ignore

    client = Client(sid, token)
    msg = client.messages.create(
        from_=f"whatsapp:{from_}",
        to=f"whatsapp:{to}",
        content_sid=content_sid,
        content_variables=json.dumps(content_variables),
    )
    return msg.sid


@app.task(bind=True)
def scan_followups(self) -> dict[str, int]:
    today = date.today()
    horizon = today + timedelta(days=DUE_SOON_WINDOW_DAYS)
    period_key = today.isoformat()

    sb = service_client()
    rows = (
        sb.table("tasks")
        .select("id, practice_id, description, deadline, status, assigned_to_user_id")
        .neq("status", "DONE")
        .neq("status", "CANCELLED")
        .not_.is_("deadline", "null")
        .lte("deadline", horizon.isoformat())
        .execute()
        .data
        or []
    )

    sent_due = 0
    sent_overdue = 0
    for t in rows:
        deadline = date.fromisoformat(t["deadline"])
        kind = "OVERDUE" if deadline < today else "DUE_SOON"

        existing = (
            sb.table("reminders")
            .select("id")
            .eq("task_id", t["id"])
            .eq("kind", kind)
            .eq("period_key", period_key)
            .execute()
            .data
            or []
        )
        if existing:
            continue

        recipient_phone = _resolve_phone(sb, t.get("assigned_to_user_id"))
        content_sid = _template_sid_for(kind)
        provider_ref = None
        if recipient_phone and content_sid:
            provider_ref = _twilio_send(
                recipient_phone,
                content_sid,
                _template_variables(t["description"], t["deadline"]),
            )
        elif recipient_phone and not content_sid:
            log.warning(
                "template SID for kind=%s not configured; skipping send", kind
            )

        sb.table("reminders").insert(
            {
                "task_id": t["id"],
                "practice_id": t["practice_id"],
                "kind": kind,
                "channel": "WHATSAPP",
                "period_key": period_key,
                "recipient_user_id": t.get("assigned_to_user_id"),
                "provider_ref": provider_ref,
            }
        ).execute()

        record_audit(
            action="REMINDER_DISPATCHED",
            resource_type="tasks",
            resource_id=t["id"],
            practice_id=t["practice_id"],
            metadata={
                "kind": kind,
                "channel": "WHATSAPP",
                "period_key": period_key,
                "delivered": provider_ref is not None,
                "template_sid": content_sid,
            },
        )

        if kind == "OVERDUE":
            sent_overdue += 1
        else:
            sent_due += 1

    log.info(
        "follow-up scan period=%s due_soon=%d overdue=%d scanned=%d",
        period_key,
        sent_due,
        sent_overdue,
        len(rows),
    )
    return {"due_soon": sent_due, "overdue": sent_overdue, "scanned": len(rows)}


# Celery Beat: run every day at 07:00 local time.
app.conf.beat_schedule = {
    "mdt-daily-follow-up-scan": {
        "task": "mdt_workers.tasks.follow_up.scan_followups",
        "schedule": crontab(hour=7, minute=0),
    },
}
