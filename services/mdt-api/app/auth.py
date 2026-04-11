from dataclasses import dataclass
from typing import Annotated

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


def require_user(
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(get_settings),
) -> AuthContext:
    token = _extract_bearer(authorization)
    try:
        payload = jwt.decode(
            token,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
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
