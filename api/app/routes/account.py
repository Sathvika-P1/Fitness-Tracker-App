import logging
import time

from fastapi import APIRouter, Cookie, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db import get_db
from app.store import accounts, deletion_audit, deletion_lockout, sessions
from app.store.models import Account, SessionRow

logger = logging.getLogger(__name__)

router = APIRouter()


class DeleteAccountRequest(BaseModel):
    password: str = ""


def _require_account(db: Session, sid: str | None) -> Account | None:
    account_id = sessions.get_account_id_for_session(db, sid) if sid else None
    if account_id is None:
        return None
    return db.get(Account, account_id)


@router.get("/api/account")
def get_account(db: Session = Depends(get_db), sid: str | None = Cookie(default=None)):
    account = _require_account(db, sid)
    if account is None:
        return JSONResponse(status_code=401, content={"message": "Not signed in."})
    active_session_count = db.execute(
        select(func.count()).select_from(SessionRow).where(SessionRow.account_id == account.id)
    ).scalar_one()
    return {"email": account.email, "active_session_count": active_session_count}


@router.post("/api/account/delete")
def delete_account(
    payload: DeleteAccountRequest,
    db: Session = Depends(get_db),
    sid: str | None = Cookie(default=None),
):
    start = time.monotonic()

    if sid is None:
        return JSONResponse(status_code=401, content={"message": "Not signed in."})

    account = _require_account(db, sid)
    if account is None:
        logger.info(
            "account_delete_already_deleted duration_ms=%.1f",
            (time.monotonic() - start) * 1000,
        )
        return JSONResponse(status_code=200, content={"status": "already_deleted"})

    if deletion_lockout.is_locked(db, account.id):
        logger.warning(
            "account_delete_locked_out account_id=%s duration_ms=%.1f",
            account.id,
            (time.monotonic() - start) * 1000,
        )
        return JSONResponse(
            status_code=429,
            content={"message": "Too many incorrect attempts. Try again in 15 minutes."},
        )

    verified = accounts.verify_credentials(db, account.email, payload.password)
    if verified is None:
        remaining = deletion_lockout.record_failure(db, account.id)
        logger.warning(
            "account_delete_incorrect_password account_id=%s remaining=%s duration_ms=%.1f",
            account.id,
            remaining,
            (time.monotonic() - start) * 1000,
        )
        return JSONResponse(
            status_code=401,
            content={"message": "Incorrect password. Your account has not been changed."},
        )

    session_count = db.execute(
        select(func.count()).select_from(SessionRow).where(SessionRow.account_id == account.id)
    ).scalar_one()

    deletion_audit.record_deletion(db, account.id)
    accounts.delete_account(db, account)

    logger.info(
        "account_deleted account_id=%s sessions_revoked=%s duration_ms=%.1f",
        account.id,
        session_count,
        (time.monotonic() - start) * 1000,
    )
    return JSONResponse(
        status_code=200,
        content={"message": "Account deleted.", "sessions_revoked": session_count},
    )
