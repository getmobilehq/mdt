"""
Nightly follow-up automation.

Scans tasks whose status != DONE and whose deadline is either
within the next 3 days (DUE_SOON) or in the past (OVERDUE).
For each match, inserts one reminder row per (task, kind, period_key)
and (if Twilio creds are set) sends a WhatsApp/SMS notification.

Idempotency is enforced by the unique index on
reminders(task_id, kind, period_key) — re-running the job on the same
day is a no-op.

Safety: message templates never include NHS numbers or full patient names.
"""

from __future__ import annotations

import logging
import os
from datetime import date, timedelta

from celery.schedules import crontab

from ..celery_app import app
from ..supabase_client import service_client

log = logging.getLogger(__name__)

DUE_SOON_WINDOW_DAYS = 3


def _twilio_send(to: str, body: str) -> str | None:
    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    from_ = os.environ.get("TWILIO_WHATSAPP_NUMBER")
    if not (sid and token and from_):
        log.info("twilio not configured; skipping send to %s", to[-4:] if to else "")
        return None
    from twilio.rest import Client  # type: ignore

    client = Client(sid, token)
    msg = client.messages.create(
        from_=f"whatsapp:{from_}",
        to=f"whatsapp:{to}",
        body=body,
    )
    return msg.sid


def _message_body(kind: str, task_description: str, deadline: str | None) -> str:
    # Keep neutral — never include patient identifiers.
    if kind == "OVERDUE":
        return (
            f"CareLoop MDT: overdue task — {task_description} "
            f"(was due {deadline}). Please update status or reassign."
        )
    return (
        f"CareLoop MDT: task due soon — {task_description}"
        f"{f' by {deadline}' if deadline else ''}."
    )


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

        # Find the recipient phone. Real implementation resolves via profiles.
        recipient_phone = None
        provider_ref = None
        if recipient_phone:
            provider_ref = _twilio_send(
                recipient_phone,
                _message_body(kind, t["description"], t.get("deadline")),
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
