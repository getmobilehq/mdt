"""
Transcription + action-extraction pipeline for MDT sessions.

Flow (triggered by Daily.co recording webhook or manual API call):
  1. transcribe_session(session_id, audio_url) — stream audio from the URL
     (Daily-hosted download link; R2 will move to a dedicated S3 eu-west-2
     bucket), call Whisper API, upsert transcripts row, chain into (2).
  2. extract_actions(session_id) — Claude API → unconfirmed actions rows.

Each task is idempotent: re-running with the same session_id replaces any
existing transcript / AI-created actions that have not been confirmed.

Safety rules:
  - Never log patient names or NHS numbers.
  - Claude prompt must return JSON only.
  - All AI-created actions require human confirmation before becoming tasks.
"""

from __future__ import annotations

import json
import logging
import os
import tempfile
from typing import Any
from urllib.parse import urlparse

import httpx

from ..audit import record_audit
from ..celery_app import app
from ..supabase_client import service_client

log = logging.getLogger(__name__)

CLAUDE_MODEL = "claude-sonnet-4-6"

ACTION_EXTRACTION_PROMPT = """\
You are extracting clinical actions from an MDT (multi-disciplinary team)
meeting transcript. The transcript covers one or more patients discussed
in sequence.

Return a JSON object with this exact shape — no prose, no markdown:

{
  "patients": [
    {
      "patient_hint": "name or descriptor used in the transcript",
      "summary": "1-2 sentence summary of the discussion",
      "actions": [
        {
          "description": "short imperative action",
          "owner_role": "GP" | "DN" | "ADMIN" | "SOCIAL_WORKER",
          "deadline": "YYYY-MM-DD or null"
        }
      ]
    }
  ]
}

Only return the JSON object. Do not invent patients or actions that are
not explicitly discussed in the transcript.
"""


def _download_to_temp(src: str) -> tuple[str, bool]:
    """
    If src looks like a URL, stream it to a temp file and return (path, True).
    Otherwise return (src, False) — it's already a local file path.
    """
    parsed = urlparse(src)
    if parsed.scheme not in {"http", "https"}:
        return src, False
    suffix = os.path.splitext(parsed.path)[1] or ".audio"
    fd, path = tempfile.mkstemp(prefix="mdt-recording-", suffix=suffix)
    os.close(fd)
    with httpx.stream("GET", src, timeout=120.0, follow_redirects=True) as r:
        r.raise_for_status()
        with open(path, "wb") as f:
            for chunk in r.iter_bytes(chunk_size=1 << 20):
                f.write(chunk)
    return path, True


def _whisper_transcribe(audio_path: str) -> dict[str, Any]:
    """Call OpenAI Whisper. Returns {text, language, duration}."""
    if not os.environ.get("OPENAI_API_KEY"):
        raise RuntimeError("OPENAI_API_KEY not set")
    from openai import OpenAI  # local import keeps worker start-up cheap

    client = OpenAI()
    with open(audio_path, "rb") as f:
        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=f,
            response_format="verbose_json",
        )
    return {
        "text": result.text,
        "language": getattr(result, "language", None),
        "duration": int(getattr(result, "duration", 0) or 0),
    }


class ClaudeResponseError(Exception):
    """Claude returned something that isn't the expected JSON envelope."""


def _extract_json_payload(text: str) -> str:
    """
    Strip Markdown code fences and surrounding prose so json.loads can parse.
    Falls back to the first '{' ... last '}' slice if fences aren't used.
    """
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.lower().startswith("json"):
            stripped = stripped[4:]
        stripped = stripped.strip()
    start = stripped.find("{")
    end = stripped.rfind("}")
    if start != -1 and end != -1 and end > start:
        return stripped[start : end + 1]
    return stripped


def _claude_extract(transcript: str) -> dict[str, Any]:
    """Call Claude to extract structured actions. Returns parsed JSON."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        raise RuntimeError("ANTHROPIC_API_KEY not set")
    from anthropic import Anthropic

    client = Anthropic()
    response = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=4096,
        system=ACTION_EXTRACTION_PROMPT,
        messages=[{"role": "user", "content": transcript}],
    )
    text = "".join(block.text for block in response.content if block.type == "text")
    payload = _extract_json_payload(text)
    try:
        parsed = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise ClaudeResponseError(f"claude returned non-JSON response: {exc}") from exc
    if not isinstance(parsed, dict) or not isinstance(parsed.get("patients"), list):
        raise ClaudeResponseError("claude response missing 'patients' array")
    return parsed


@app.task(bind=True, max_retries=3, default_retry_delay=30)
def transcribe_session(self, session_id: str, audio_url_or_path: str) -> str:
    """
    Download audio (if a URL), transcribe with Whisper, upsert transcripts row,
    then chain into action extraction. Idempotent on session_id.
    """
    path, is_temp = _download_to_temp(audio_url_or_path)
    try:
        result = _whisper_transcribe(path)
    except Exception as exc:
        log.exception("whisper failed for session %s", session_id)
        raise self.retry(exc=exc)
    finally:
        if is_temp:
            try:
                os.unlink(path)
            except OSError:
                pass

    sb = service_client()
    sb.table("transcripts").delete().eq("session_id", session_id).execute()
    sb.table("transcripts").insert(
        {
            "session_id": session_id,
            "full_text": result["text"],
            "language": result.get("language"),
            "duration_s": result.get("duration"),
        }
    ).execute()
    log.info("transcript stored session=%s duration=%ss", session_id, result.get("duration"))

    practice_id = _session_practice_id(sb, session_id)
    record_audit(
        action="TRANSCRIPT_CREATED",
        resource_type="sessions",
        resource_id=session_id,
        practice_id=practice_id,
        metadata={"duration_s": result.get("duration"), "language": result.get("language")},
    )

    extract_actions.delay(session_id)
    return session_id


@app.task(bind=True, max_retries=3, default_retry_delay=30)
def extract_actions(self, session_id: str) -> int:
    """Run Claude extraction over the session transcript and insert unconfirmed actions."""
    sb = service_client()
    transcript_rows = (
        sb.table("transcripts").select("full_text").eq("session_id", session_id).execute().data or []
    )
    if not transcript_rows:
        log.warning("no transcript for session %s", session_id)
        return 0

    try:
        parsed = _claude_extract(transcript_rows[0]["full_text"])
    except Exception as exc:
        log.exception("claude extraction failed for session %s", session_id)
        raise self.retry(exc=exc)

    # Map patient_hint back to session_patients using the snapshot.
    snapshot = (
        sb.table("session_patients")
        .select("patient_id, patients(full_name)")
        .eq("session_id", session_id)
        .execute()
        .data
        or []
    )
    by_name: dict[str, str] = {}
    for row in snapshot:
        patient = row.get("patients") or {}
        name = (patient.get("full_name") or "").lower()
        if name:
            by_name[name] = row["patient_id"]

    # Drop any existing unconfirmed AI actions — idempotent re-runs.
    sb.table("actions").delete().eq("session_id", session_id).eq("confirmed", False).execute()

    inserted = 0
    for p in parsed.get("patients", []):
        hint = (p.get("patient_hint") or "").lower()
        patient_id = next(
            (pid for name, pid in by_name.items() if hint and hint in name),
            None,
        )
        if not patient_id:
            continue
        for action in p.get("actions", []):
            sb.table("actions").insert(
                {
                    "session_id": session_id,
                    "patient_id": patient_id,
                    "description": action.get("description", "")[:1000],
                    "owner_role": action.get("owner_role", "GP"),
                    "deadline": action.get("deadline"),
                    "created_by_ai": True,
                    "confirmed": False,
                }
            ).execute()
            inserted += 1
    log.info("actions extracted session=%s count=%d", session_id, inserted)

    practice_id = _session_practice_id(sb, session_id)
    record_audit(
        action="AI_ACTIONS_EXTRACTED",
        resource_type="sessions",
        resource_id=session_id,
        practice_id=practice_id,
        metadata={"count": inserted, "model": CLAUDE_MODEL},
    )
    return inserted


def _session_practice_id(sb, session_id: str) -> str | None:
    row = (
        sb.table("sessions")
        .select("practice_id")
        .eq("id", session_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return row[0].get("practice_id") if row else None
