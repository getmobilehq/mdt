import os
from unittest import mock

import pytest

from mdt_workers.tasks import follow_up
from mdt_workers.tasks.follow_up import (
    TEMPLATE_VAR_MAX_CHARS,
    _normalize_msisdn,
    _openwa_send,
    _provider,
    _render_message,
    _send_whatsapp,
)


# --- provider switch -------------------------------------------------------

def test_provider_defaults_to_twilio_when_unset():
    with mock.patch.dict(os.environ, {}, clear=True):
        assert _provider() == "twilio"


def test_provider_openwa_case_insensitive():
    with mock.patch.dict(os.environ, {"WHATSAPP_PROVIDER": "  OpenWA "}):
        assert _provider() == "openwa"


def test_provider_unknown_value_falls_back_to_twilio():
    with mock.patch.dict(os.environ, {"WHATSAPP_PROVIDER": "signal"}):
        assert _provider() == "twilio"


# --- phone normalisation ---------------------------------------------------

def test_normalize_msisdn_strips_non_digits():
    assert _normalize_msisdn("+44 7700 900000") == "447700900000@c.us"


def test_normalize_msisdn_handles_empty():
    assert _normalize_msisdn("") == "@c.us"


# --- message rendering (parity with approved templates) --------------------

def test_render_overdue_wording():
    msg = _render_message("OVERDUE", "Review bloods", "2026-05-01")
    assert msg == (
        "CareLoop MDT: overdue task — Review bloods (was due 2026-05-01). "
        "Please update or reassign."
    )


def test_render_due_soon_wording():
    msg = _render_message("DUE_SOON", "Review bloods", "2026-05-01")
    assert msg == "CareLoop MDT: task due soon — Review bloods by 2026-05-01."


def test_render_caps_description_length():
    long = "x" * (TEMPLATE_VAR_MAX_CHARS + 50)
    msg = _render_message("DUE_SOON", long, "2026-05-01")
    assert "x" * TEMPLATE_VAR_MAX_CHARS in msg
    assert "x" * (TEMPLATE_VAR_MAX_CHARS + 1) not in msg


# --- dispatcher ------------------------------------------------------------

def test_send_whatsapp_routes_to_openwa(monkeypatch):
    captured = {}

    def fake_openwa(chat_id, message):
        captured["chat_id"] = chat_id
        captured["message"] = message
        return "openwa-msg-1"

    monkeypatch.setattr(follow_up, "_openwa_send", fake_openwa)
    with mock.patch.dict(os.environ, {"WHATSAPP_PROVIDER": "openwa"}):
        ref = _send_whatsapp("OVERDUE", "+44 7700 900000", "Review bloods", "2026-05-01")

    assert ref == "openwa-msg-1"
    assert captured["chat_id"] == "447700900000@c.us"
    assert captured["message"].startswith("CareLoop MDT: overdue task — Review bloods")


def test_send_whatsapp_twilio_skips_without_template_sid(monkeypatch):
    monkeypatch.setattr(
        follow_up, "_twilio_send", lambda *a, **k: pytest.fail("twilio called")
    )
    with mock.patch.dict(os.environ, {"WHATSAPP_PROVIDER": "twilio"}, clear=True):
        assert _send_whatsapp("OVERDUE", "+447700900000", "x", "2026-05-01") is None


def test_send_whatsapp_twilio_sends_with_template_sid(monkeypatch):
    monkeypatch.setattr(follow_up, "_twilio_send", lambda *a, **k: "SMxxx")
    with mock.patch.dict(
        os.environ,
        {"WHATSAPP_PROVIDER": "twilio", "TWILIO_TEMPLATE_SID_OVERDUE": "HXo"},
        clear=True,
    ):
        assert _send_whatsapp("OVERDUE", "+447700900000", "x", "2026-05-01") == "SMxxx"


# --- open-wa REST client ---------------------------------------------------

class _FakeResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_openwa_send_no_url_returns_none():
    with mock.patch.dict(os.environ, {}, clear=True):
        assert _openwa_send("447700900000@c.us", "hi") is None


def test_openwa_send_posts_and_returns_message_id(monkeypatch):
    seen = {}

    def fake_post(url, headers=None, json=None, timeout=None):
        seen["url"] = url
        seen["headers"] = headers
        seen["json"] = json
        return _FakeResp({"success": True, "response": "MSG-42"})

    monkeypatch.setattr("httpx.post", fake_post)
    with mock.patch.dict(
        os.environ,
        {"OPENWA_API_URL": "http://localhost:8002/", "OPENWA_API_KEY": "dev-secret"},
    ):
        ref = _openwa_send("447700900000@c.us", "hello")

    assert ref == "MSG-42"
    assert seen["url"] == "http://localhost:8002/sendText"
    assert seen["headers"]["api_key"] == "dev-secret"
    assert seen["json"] == {
        "args": {"to": "447700900000@c.us", "content": "hello"}
    }


def test_openwa_send_success_without_response_uses_marker(monkeypatch):
    monkeypatch.setattr(
        "httpx.post", lambda *a, **k: _FakeResp({"success": True})
    )
    with mock.patch.dict(os.environ, {"OPENWA_API_URL": "http://x:8002"}):
        assert _openwa_send("x@c.us", "hi") == "openwa:sent"


def test_openwa_send_swallows_errors(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("connection refused")

    monkeypatch.setattr("httpx.post", boom)
    with mock.patch.dict(os.environ, {"OPENWA_API_URL": "http://x:8002"}):
        assert _openwa_send("x@c.us", "hi") is None
