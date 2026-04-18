from datetime import date

import pytest
from pydantic import ValidationError

from app.routers.patients import PatientCreate


def _payload(**overrides):
    base = {
        "practice_id": "00000000-0000-0000-0000-000000000001",
        "board_id": "00000000-0000-0000-0000-000000000002",
        "nhs_number": "1234567890",
        "full_name": "Jane Doe",
        "dob": date(1970, 1, 1),
        "source": "GP",
    }
    base.update(overrides)
    return base


def test_nhs_number_strips_spaces():
    p = PatientCreate(**_payload(nhs_number="123 456 7890"))
    assert p.nhs_number == "1234567890"


def test_nhs_number_rejects_short():
    with pytest.raises(ValidationError):
        PatientCreate(**_payload(nhs_number="12345"))


def test_nhs_number_rejects_non_digits_only():
    with pytest.raises(ValidationError):
        PatientCreate(**_payload(nhs_number="abcdefghij"))


def test_full_name_required():
    with pytest.raises(ValidationError):
        PatientCreate(**_payload(full_name=""))
