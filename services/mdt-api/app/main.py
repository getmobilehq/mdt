from fastapi import Depends, FastAPI

from .auth import AuthContext, require_user
from .routers import actions, boards, dn_board, notes, patients, sessions, tasks

app = FastAPI(title="CareLoop MDT API", version="0.1.0")

app.include_router(boards.router)
app.include_router(patients.router)
app.include_router(tasks.router)
app.include_router(dn_board.router)
app.include_router(notes.router)
app.include_router(sessions.router)
app.include_router(actions.router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/me")
def me(auth: AuthContext = Depends(require_user)) -> dict[str, str | None]:
    return {"user_id": auth.user_id, "email": auth.email}
