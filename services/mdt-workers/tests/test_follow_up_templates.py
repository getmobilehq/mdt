import os
from unittest import mock

from mdt_workers.tasks.follow_up import (
    TEMPLATE_VAR_MAX_CHARS,
    _template_sid_for,
    _template_variables,
)


def test_template_variables_have_positional_keys():
    vars_ = _template_variables("Review bloods", "2026-05-01")
    assert vars_ == {"1": "Review bloods", "2": "2026-05-01"}


def test_template_variable_truncates_long_description():
    long = "x" * (TEMPLATE_VAR_MAX_CHARS + 50)
    vars_ = _template_variables(long, "2026-05-01")
    assert len(vars_["1"]) == TEMPLATE_VAR_MAX_CHARS
    assert vars_["2"] == "2026-05-01"


def test_template_variable_handles_empty_description():
    vars_ = _template_variables("", "2026-05-01")
    assert vars_["1"] == ""


def test_template_sid_picks_overdue_env():
    with mock.patch.dict(
        os.environ,
        {"TWILIO_TEMPLATE_SID_OVERDUE": "HXoverdue", "TWILIO_TEMPLATE_SID_DUE_SOON": "HXdue"},
    ):
        assert _template_sid_for("OVERDUE") == "HXoverdue"
        assert _template_sid_for("DUE_SOON") == "HXdue"


def test_template_sid_returns_none_when_unset():
    with mock.patch.dict(os.environ, {}, clear=True):
        assert _template_sid_for("OVERDUE") is None
        assert _template_sid_for("DUE_SOON") is None
