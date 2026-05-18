"""
Practice user management (CRUD), admin-only.

Privileged: uses the service-role client (bypasses RLS) but every
endpoint first verifies the caller holds ADMIN or PCN_ADMIN in the
target practice, and operations are scoped to that practice. "Delete"
removes practice membership only (keeps the auth user / profile so
audit trail and created_by references stay intact).

NOTE (planned): user creation currently returns a one-time temporary
password for the admin to relay manually. A proper email-invite flow
via a real mailing client is a follow-up — see issue/roadmap.
"""

import logging
import secrets
import string
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from ..audit import record_audit
from ..auth import AuthContext, require_user
from ..settings import get_settings
from ..supabase_client import service_client, user_client

log = logging.getLogger(__name__)

router = APIRouter(prefix="/practices/{practice_id}/users", tags=["users"])

ManageableRole = Literal["GP", "DN", "ADMIN", "SOCIAL_WORKER", "PCN_ADMIN"]
ADMIN_ROLES = {"ADMIN", "PCN_ADMIN"}


def _require_practice_admin(practice_id: str, auth: AuthContext) -> None:
    """Caller must hold ADMIN or PCN_ADMIN in this practice (RLS self-read)."""
    sb = user_client(auth.raw_token)
    rows = (
        sb.table("practice_users")
        .select("role")
        .eq("practice_id", practice_id)
        .eq("user_id", auth.user_id)
        .execute()
        .data
        or []
    )
    if not any(r.get("role") in ADMIN_ROLES for r in rows):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="admin role required for this practice",
        )


class UserOut(BaseModel):
    user_id: str
    email: str
    full_name: str
    role: str


class CreatedUser(UserOut):
    # Present only when a brand-new auth user was created.
    temporary_password: str | None = None


class CreateUser(BaseModel):
    email: str
    full_name: str = Field(min_length=1, max_length=200)
    role: ManageableRole

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("invalid email")
        return v


class UpdateUser(BaseModel):
    role: ManageableRole | None = None
    full_name: str | None = Field(default=None, max_length=200)


def _gen_password(n: int = 20) -> str:
    alpha = string.ascii_letters + string.digits
    return "Mdt!" + "".join(secrets.choice(alpha) for _ in range(n))


def _create_auth_user(email: str, password: str, full_name: str) -> str:
    s = get_settings()
    r = httpx.post(
        f"{s.supabase_url.rstrip('/')}/auth/v1/admin/users",
        headers={
            "apikey": s.supabase_service_role_key,
            "Authorization": f"Bearer {s.supabase_service_role_key}",
            "Content-Type": "application/json",
        },
        json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"full_name": full_name},
        },
        timeout=15.0,
    )
    if r.status_code not in (200, 201):
        log.error("auth admin create_user failed: %s %s", r.status_code, r.text[:300])
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="could not create auth user",
        )
    return r.json()["id"]


@router.get("", response_model=list[UserOut])
def list_users(
    practice_id: str, auth: AuthContext = Depends(require_user)
) -> list[UserOut]:
    _require_practice_admin(practice_id, auth)
    sc = service_client()
    members = (
        sc.table("practice_users")
        .select("user_id, role")
        .eq("practice_id", practice_id)
        .execute()
        .data
        or []
    )
    if not members:
        return []
    ids = [m["user_id"] for m in members]
    profiles = (
        sc.table("profiles")
        .select("id, email, full_name")
        .in_("id", ids)
        .execute()
        .data
        or []
    )
    pmap = {p["id"]: p for p in profiles}
    return [
        UserOut(
            user_id=m["user_id"],
            email=pmap.get(m["user_id"], {}).get("email", ""),
            full_name=pmap.get(m["user_id"], {}).get("full_name", ""),
            role=m["role"],
        )
        for m in members
    ]


@router.post("", response_model=CreatedUser, status_code=status.HTTP_201_CREATED)
def create_user(
    practice_id: str,
    payload: CreateUser,
    auth: AuthContext = Depends(require_user),
) -> CreatedUser:
    _require_practice_admin(practice_id, auth)
    sc = service_client()

    existing = (
        sc.table("profiles")
        .select("id")
        .eq("email", payload.email)
        .limit(1)
        .execute()
        .data
        or []
    )
    temp_pw: str | None = None
    if existing:
        uid = existing[0]["id"]
    else:
        temp_pw = _gen_password()
        uid = _create_auth_user(payload.email, temp_pw, payload.full_name)

    # The signup trigger creates the profile row; set name + default role.
    sc.table("profiles").update(
        {"full_name": payload.full_name, "default_role": payload.role}
    ).eq("id", uid).execute()

    already = (
        sc.table("practice_users")
        .select("user_id")
        .eq("practice_id", practice_id)
        .eq("user_id", uid)
        .execute()
        .data
        or []
    )
    if already:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="user is already a member of this practice",
        )
    sc.table("practice_users").insert(
        {"user_id": uid, "practice_id": practice_id, "role": payload.role}
    ).execute()

    record_audit(
        user_id=auth.user_id,
        action="user.create",
        resource_type="user",
        resource_id=uid,
        practice_id=practice_id,
        role=payload.role,
        metadata={"email": payload.email, "new_auth_user": temp_pw is not None},
    )
    return CreatedUser(
        user_id=uid,
        email=payload.email,
        full_name=payload.full_name,
        role=payload.role,
        temporary_password=temp_pw,
    )


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    practice_id: str,
    user_id: str,
    payload: UpdateUser,
    auth: AuthContext = Depends(require_user),
) -> UserOut:
    _require_practice_admin(practice_id, auth)
    sc = service_client()
    member = (
        sc.table("practice_users")
        .select("role")
        .eq("practice_id", practice_id)
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user is not a member of this practice",
        )
    if payload.role:
        sc.table("practice_users").update({"role": payload.role}).eq(
            "practice_id", practice_id
        ).eq("user_id", user_id).execute()
    prof_update: dict[str, str] = {}
    if payload.full_name is not None:
        prof_update["full_name"] = payload.full_name
    if payload.role:
        prof_update["default_role"] = payload.role
    if prof_update:
        sc.table("profiles").update(prof_update).eq("id", user_id).execute()

    record_audit(
        user_id=auth.user_id,
        action="user.update",
        resource_type="user",
        resource_id=user_id,
        practice_id=practice_id,
        role=payload.role,
        metadata=payload.model_dump(exclude_none=True),
    )
    prof = (
        sc.table("profiles")
        .select("email, full_name")
        .eq("id", user_id)
        .limit(1)
        .execute()
        .data
        or [{}]
    )
    return UserOut(
        user_id=user_id,
        email=prof[0].get("email", ""),
        full_name=prof[0].get("full_name", ""),
        role=payload.role or member[0]["role"],
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user(
    practice_id: str,
    user_id: str,
    auth: AuthContext = Depends(require_user),
) -> None:
    _require_practice_admin(practice_id, auth)
    if user_id == auth.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="you cannot remove yourself from the practice",
        )
    sc = service_client()
    member = (
        sc.table("practice_users")
        .select("user_id")
        .eq("practice_id", practice_id)
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="user is not a member of this practice",
        )
    sc.table("practice_users").delete().eq("practice_id", practice_id).eq(
        "user_id", user_id
    ).execute()
    record_audit(
        user_id=auth.user_id,
        action="user.remove",
        resource_type="user",
        resource_id=user_id,
        practice_id=practice_id,
        metadata={},
    )
    return None
