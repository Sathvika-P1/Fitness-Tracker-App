import logging
import os
import time

from fastapi import APIRouter, Cookie, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.store import accounts, sessions
from app.store.models import Account

logger = logging.getLogger(__name__)

router = APIRouter()

SESSION_COOKIE = "sid"


class SignupRequest(BaseModel):
    email: str = ""
    password: str = ""
    display_name: str = ""


@router.post("/api/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    start = time.monotonic()
    email = payload.email.strip()
    display_name = payload.display_name.strip()
    logger.info("signup_attempt")

    if not email:
        logger.warning("signup_validation_error field=email")
        return JSONResponse(
            status_code=400,
            content={"field": "email", "message": "Enter an email to continue."},
        )
    if not payload.password:
        logger.warning("signup_validation_error field=password")
        return JSONResponse(
            status_code=400,
            content={"field": "password", "message": "Enter a password to continue."},
        )
    if not display_name:
        logger.warning("signup_validation_error field=display_name")
        return JSONResponse(
            status_code=400,
            content={
                "field": "display_name",
                "message": "Enter a display name to continue.",
            },
        )

    try:
        account = accounts.create_account(db, email, payload.password, display_name)
    except accounts.DuplicateEmailError:
        logger.warning(
            "signup_duplicate_rejected duration_ms=%.1f",
            (time.monotonic() - start) * 1000,
        )
        return JSONResponse(
            status_code=409,
            content={"field": "email", "message": "This email is taken."},
        )

    session_id = sessions.create_session(db, account.id)
    signup_response = JSONResponse(
        status_code=201,
        content={"email": account.email, "display_name": account.display_name},
    )
    signup_response.set_cookie(
        SESSION_COOKIE,
        session_id,
        httponly=True,
        secure=os.environ.get("SECURE_COOKIES", "true").lower() != "false",
        samesite="lax",
    )
    logger.info(
        "signup_success account_id=%s duration_ms=%.1f",
        account.id,
        (time.monotonic() - start) * 1000,
    )
    return signup_response


@router.get("/api/me")
def me(db: Session = Depends(get_db), sid: str | None = Cookie(default=None)):
    start = time.monotonic()
    account_id = sessions.get_account_id_for_session(db, sid) if sid else None
    if account_id is None:
        logger.warning(
            "me_unauthorized duration_ms=%.1f", (time.monotonic() - start) * 1000
        )
        return JSONResponse(status_code=401, content={"message": "Not signed in."})

    account = db.get(Account, account_id)
    logger.info(
        "me_request account_id=%s duration_ms=%.1f",
        account_id,
        (time.monotonic() - start) * 1000,
    )
    return {"email": account.email, "display_name": account.display_name}
