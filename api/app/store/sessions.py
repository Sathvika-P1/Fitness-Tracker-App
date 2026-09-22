import datetime
import secrets

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.store.models import Account, SessionRow

SESSION_TTL = datetime.timedelta(hours=24)


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def create_session(db: Session, account_id: int) -> str:
    session_id = secrets.token_urlsafe(32)
    now = _utcnow()
    db.add(
        SessionRow(
            id=session_id,
            account_id=account_id,
            created_at=now,
            expires_at=now + SESSION_TTL,
        )
    )
    db.commit()
    return session_id


def get_account_id_for_session(db: Session, session_id: str) -> int | None:
    row = db.get(SessionRow, session_id)
    if row is None:
        return None
    if row.expires_at <= _utcnow():
        db.delete(row)
        db.commit()
        return None
    return row.account_id


def delete_session(db: Session, session_id: str) -> None:
    row = db.get(SessionRow, session_id)
    if row is not None:
        db.delete(row)
        db.commit()


def require_account(db: Session, session_id: str | None) -> Account | None:
    account_id = get_account_id_for_session(db, session_id) if session_id else None
    if account_id is None:
        return None
    return db.get(Account, account_id)


def count_active_for_account(db: Session, account_id: int) -> int:
    return db.execute(
        select(func.count())
        .select_from(SessionRow)
        .where(SessionRow.account_id == account_id, SessionRow.expires_at > _utcnow())
    ).scalar_one()
