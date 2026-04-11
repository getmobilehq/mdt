from fastapi import Depends, FastAPI

from .auth import AuthContext, require_user

app = FastAPI(title="CareLoop MDT API", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/me")
def me(auth: AuthContext = Depends(require_user)) -> dict[str, str | None]:
    return {"user_id": auth.user_id, "email": auth.email}
