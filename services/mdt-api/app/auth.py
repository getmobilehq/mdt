from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Annotated, Any

import httpx
from fastapi import Depends, Header, HTTPException, status
from jose import JWTError, jwt

from .settings import Settings, get_settings


@dataclass(frozen=True)
class AuthContext:
    user_id: str
    email: str | None
    raw_token: str


def _extract_bearer(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
        )
    return authorization.split(" ", 1)[1].strip()


# --- Supabase JWKS (asymmetric signing keys) ---------------------------------
# Supabase signs access tokens with a project signing key (ES256/RS256),
# served at /auth/v1/.well-known/jwks.json. Legacy projects use an HS256
# shared secret. Support both; cache the JWKS and refetch on an unknown kid
# (key rotation).

_JWKS_TTL_SECONDS = 600
_jwks_lock = threading.Lock()
# jwks_url -> (fetched_at, {kid: jwk})
_jwks_cache: dict[str, tuple[float, dict[str, dict[str, Any]]]] = {}


def _jwks_url(supabase_url: str) -> str:
    return f"{supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"


def _fetch_jwks(url: str) -> dict[str, dict[str, Any]]:
    resp = httpx.get(url, timeout=5.0)
    resp.raise_for_status()
    keys = resp.json().get("keys", [])
    return {k["kid"]: k for k in keys if k.get("kid")}


def _get_jwk(url: str, kid: str, *, force: bool = False) -> dict[str, Any] | None:
    now = time.time()
    if not force:
        with _jwks_lock:
            entry = _jwks_cache.get(url)
        if entry and (now - entry[0]) < _JWKS_TTL_SECONDS and kid in entry[1]:
            return entry[1][kid]
    try:
        keys = _fetch_jwks(url)
    except Exception:
        keys = None
    if keys is not None:
        with _jwks_lock:
            _jwks_cache[url] = (now, keys)
        if kid in keys:
            return keys[kid]
    with _jwks_lock:  # stale fallback if refetch failed
        entry = _jwks_cache.get(url)
    return entry[1].get(kid) if entry else None


def require_user(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    token = _extract_bearer(authorization)
    try:
        header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token"
        ) from exc

    alg = header.get("alg")
    try:
        if alg == "HS256":
            # Legacy shared-secret projects.
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience="authenticated",
            )
        elif alg in ("ES256", "RS256"):
            kid = header.get("kid")
            if not kid:
                raise JWTError("token missing kid")
            url = _jwks_url(settings.supabase_url)
            jwk = _get_jwk(url, kid) or _get_jwk(url, kid, force=True)
            if jwk is None:
                raise JWTError("signing key not found")
            payload = jwt.decode(
                token,
                jwk,
                algorithms=[alg],
                audience="authenticated",
            )
        else:
            raise JWTError(f"unsupported alg: {alg}")
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid token",
        ) from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="token missing subject",
        )
    return AuthContext(
        user_id=user_id,
        email=payload.get("email"),
        raw_token=token,
    )
