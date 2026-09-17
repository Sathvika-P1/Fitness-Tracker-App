from fastapi import APIRouter, Cookie, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.store import accounts, sessions
from app.store.models import Account

router = APIRouter()

SESSION_COOKIE = "sid"


class SignupRequest(BaseModel):
    email: str = ""
    password: str = ""
    display_name: str = ""


@router.post("/api/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    email = payload.email.strip()
    display_name = payload.display_name.strip()

    if not email:
        return JSONResponse(
            status_code=400,
            content={"field": "email", "message": "Enter an email to continue."},
        )
    if not payload.password:
        return JSONResponse(
            status_code=400,
            content={"field": "password", "message": "Enter a password to continue."},
        )
    if not display_name:
        return JSONResponse(
            status_code=400,
            content={
                "field": "display_name",
                "message": "Enter a display name to continue.",
            },
        )

    if accounts.find_by_email(db, email) is not None:
        return JSONResponse(
            status_code=409,
            content={"field": "email", "message": "This email is taken."},
        )

    try:
        account = accounts.create_account(db, email, payload.password, display_name)
    except accounts.DuplicateEmailError:
        return JSONResponse(
            status_code=409,
            content={"field": "email", "message": "This email is taken."},
        )

    session_id = sessions.create_session(db, account.id)
    signup_response = JSONResponse(
        status_code=201,
        content={"email": account.email, "display_name": account.display_name},
    )
    signup_response.set_cookie(SESSION_COOKIE, session_id, httponly=True)
    return signup_response


@router.get("/api/me")
def me(db: Session = Depends(get_db), sid: str | None = Cookie(default=None)):
    account_id = sessions.get_account_id_for_session(db, sid) if sid else None
    if account_id is None:
        return JSONResponse(status_code=401, content={"message": "Not signed in."})

    account = db.get(Account, account_id)
    return {"email": account.email, "display_name": account.display_name}
