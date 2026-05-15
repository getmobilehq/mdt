"""
Nightly follow-up automation.

Scans tasks whose status != DONE and whose deadline is either
within the next 3 days (DUE_SOON) or in the past (OVERDUE).
For each match, inserts one reminder row per (task, kind, period_key)
and (if a provider is configured) sends a WhatsApp notification.

Provider switch — WHATSAPP_PROVIDER:
  "twilio" (default) — Meta-approved Business templates via Twilio. Production path.
  "openwa"           — @open-wa/wa-automate REST server. Free-form text from a
                       regular WhatsApp account; no Meta approval needed. For
                       rapid concept testing only — see services/mdt-whatsapp-dev/.

Idempotency is enforced by the unique index on
reminders(task_id, kind, period_key) — re-running the job on the same
day is a no-op.

Safety (both providers):
  - Body carries only the task description + deadline. Never include NHS
    numbers or full patient names.
  - The description is truncated to TEMPLATE_VAR_MAX_CHARS (well under Meta's
    1024-char template-variable limit).

Twilio templates (configure in Content Builder, approved by Meta):
  TWILIO_TEMPLATE_SID_OVERDUE   — "CareLoop MDT: overdue task — {{1}} (was due {{2}}). Please update or reassign."
  TWILIO_TEMPLATE_SID_DUE_SOON  — "CareLoop MDT: task due soon — {{1}} by {{2}}."
The openwa path renders the same two sentences as plain text locally.
"""

from __future__ import annotations

import json
import logging
import os
import re
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


def _provider() -> str:
    """twilio (default) | openwa. Unknown values fall back to twilio."""
    p = (os.environ.get("WHATSAPP_PROVIDER") or "twilio").strip().lower()
    return "openwa" if p == "openwa" else "twilio"


def _normalize_msisdn(phone: str) -> str:
    """E.164-ish phone → open-wa chat id ('<digits>@c.us', no '+')."""
    digits = re.sub(r"\D", "", phone or "")
    return f"{digits}@c.us"


def _render_message(kind: str, task_description: str, deadline: str) -> str:
    """Plain-text equivalent of the approved Twilio templates (openwa path).

    Same safety rule as the templated path: description only, capped — never
    NHS numbers or full patient names.
    """
    desc = (task_description or "")[:TEMPLATE_VAR_MAX_CHARS]
    if kind == "OVERDUE":
        return (
            f"CareLoop MDT: overdue task — {desc} (was due {deadline}). "
            "Please update or reassign."
        )
    return f"CareLoop MDT: task due soon — {desc} by {deadline}."


def _openwa_send(to_chat_id: str, message: str) -> str | None:
    """Send free-form text via a running @open-wa/wa-automate REST server.

    Expects the EASY API server (see services/mdt-whatsapp-dev/). Returns the
    provider message id on success, else None (logged, never raises).
    """
    base = (os.environ.get("OPENWA_API_URL") or "").rstrip("/")
    if not base:
        log.info("openwa not configured (OPENWA_API_URL unset); skipping send")
        return None
    key = os.environ.get("OPENWA_API_KEY") or ""
    headers = {"Content-Type": "application/json"}
    if key:
        # open-wa accepts either header depending on launch flags; send both.
        headers["api_key"] = key
        headers["Authorization"] = f"Bearer {key}"

    import httpx  # type: ignore

    try:
        resp = httpx.post(
            f"{base}/sendText",
            headers=headers,
            json={"args": {"to": to_chat_id, "content": message}},
            timeout=30.0,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:  # network / auth / not-logged-in
        log.warning("openwa send failed: %s", exc)
        return None

    ref = data.get("response") if isinstance(data, dict) else None
    if isinstance(ref, str) and ref:
        return ref
    return "openwa:sent" if (isinstance(data, dict) and data.get("success")) else None


def _send_whatsapp(
    kind: str, to: str, task_description: str, deadline: str
) -> str | None:
    """Provider-agnostic dispatch. Returns provider_ref or None (never raises)."""
    if _provider() == "openwa":
        return _openwa_send(
            _normalize_msisdn(to), _render_message(kind, task_description, deadline)
        )
    content_sid = _template_sid_for(kind)
    if not content_sid:
        log.warning("twilio template SID for kind=%s not configured; skipping send", kind)
        return None
    return _twilio_send(
        to, content_sid, _template_variables(task_description, deadline)
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

    provider = _provider()
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
        provider_ref = (
            _send_whatsapp(kind, recipient_phone, t["description"], t["deadline"])
            if recipient_phone
            else None
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
                "provider": provider,
                "period_key": period_key,
                "delivered": provider_ref is not None,
                "template_sid": (
                    _template_sid_for(kind) if provider == "twilio" else None
                ),
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
