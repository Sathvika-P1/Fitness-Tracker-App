import hashlib
import logging
import os
import time

from fastapi import APIRouter, Cookie, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.store import accounts, deletion_lockout, sessions
from app.store.models import Account, AccountDeletionAudit
from app.store.sessions import SESSION_TTL

logger = logging.getLogger(__name__)

router = APIRouter()

SESSION_COOKIE = "sid"


class SignupRequest(BaseModel):
    email: str = ""
    password: str = ""
    display_name: str = ""


class LoginRequest(BaseModel):
    email: str = ""
    password: str = ""


class DeleteAccountRequest(BaseModel):
    password: str = ""


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


@router.post("/api/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    start = time.monotonic()
    email = payload.email.strip()
    logger.info("login_attempt")

    account = accounts.verify_credentials(db, email, payload.password)
    if account is None:
        logger.warning(
            "login_invalid_credentials duration_ms=%.1f",
            (time.monotonic() - start) * 1000,
        )
        return JSONResponse(
            status_code=401, content={"message": "Invalid email or password."}
        )

    session_id = sessions.create_session(db, account.id)
    login_response = JSONResponse(
        status_code=200,
        content={"email": account.email, "display_name": account.display_name},
    )
    login_response.set_cookie(
        SESSION_COOKIE,
        session_id,
        httponly=True,
        secure=os.environ.get("SECURE_COOKIES", "true").lower() != "false",
        samesite="lax",
        max_age=int(SESSION_TTL.total_seconds()),
    )
    logger.info(
        "login_success account_id=%s duration_ms=%.1f",
        account.id,
        (time.monotonic() - start) * 1000,
    )
    return login_response


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
    return {
        "email": account.email,
        "display_name": account.display_name,
        "active_sessions": sessions.count_active_for_account(db, account_id),
    }


@router.post("/api/account/delete")
def delete_account(
    payload: DeleteAccountRequest,
    db: Session = Depends(get_db),
    sid: str | None = Cookie(default=None),
):
    account_id = sessions.get_account_id_for_session(db, sid) if sid else None
    if account_id is None:
        logger.warning("account_delete_unauthorized")
        return JSONResponse(status_code=401, content={"message": "Not signed in."})

    if deletion_lockout.is_locked(account_id):
        logger.warning("account_delete_locked_out account_id=%s", account_id)
        return JSONResponse(
            status_code=423,
            content={"message": "Too many incorrect attempts. Try again later."},
        )

    account = db.get(Account, account_id)
    if account is None or not accounts.verify_credentials(
        db, account.email, payload.password
    ):
        deletion_lockout.record_failure(account_id)
        logger.warning("account_delete_incorrect_password account_id=%s", account_id)
        return JSONResponse(
            status_code=401,
            content={
                "message": "Incorrect password. Your account has not been changed."
            },
        )

    deletion_lockout.reset(account_id)
    account_reference = hashlib.sha256(account.email.encode("utf-8")).hexdigest()
    db.add(AccountDeletionAudit(account_reference=account_reference))
    accounts.delete_account(db, account)
    logger.info("account_deleted account_id=%s", account_id)

    response = JSONResponse(status_code=200, content={"message": "Account deleted."})
    response.delete_cookie(
        SESSION_COOKIE,
        secure=os.environ.get("SECURE_COOKIES", "true").lower() != "false",
        samesite="lax",
        httponly=True,
    )
    return response


@router.post("/api/logout")
def logout(db: Session = Depends(get_db), sid: str | None = Cookie(default=None)):
    if sid:
        sessions.delete_session(db, sid)
    logger.info("logout")
    response = JSONResponse(status_code=200, content={"message": "Signed out."})
    response.delete_cookie(
        SESSION_COOKIE,
        secure=os.environ.get("SECURE_COOKIES", "true").lower() != "false",
        samesite="lax",
        httponly=True,
    )
    return response
