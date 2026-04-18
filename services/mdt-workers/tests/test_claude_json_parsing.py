import json

import pytest

from mdt_workers.tasks.transcription import (
    ClaudeResponseError,
    _extract_json_payload,
)


def test_strips_markdown_fence():
    raw = "```json\n{\"patients\": []}\n```"
    assert json.loads(_extract_json_payload(raw)) == {"patients": []}


def test_handles_bare_json():
    raw = '{"patients": [{"patient_hint": "JD", "actions": []}]}'
    payload = json.loads(_extract_json_payload(raw))
    assert payload["patients"][0]["patient_hint"] == "JD"


def test_strips_prose_around_json():
    raw = 'Here is the JSON you asked for:\n{"patients": []}\nLet me know if...'
    assert json.loads(_extract_json_payload(raw)) == {"patients": []}


def test_claude_response_error_is_exception():
    with pytest.raises(ClaudeResponseError):
        raise ClaudeResponseError("boom")
