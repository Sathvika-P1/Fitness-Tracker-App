import datetime

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.store.models import DeletionLockoutFailure
from app.store.sessions import _utcnow

MAX_ATTEMPTS = 5
LOCKOUT_WINDOW = datetime.timedelta(minutes=15)


def _purge_expired(db: Session) -> None:
    # Sweeps every account's expired failures on each call (not just the one
    # being checked), so rows for accounts that never retry don't accumulate
    # forever - mirroring the bound the old in-process dict enforced.
    cutoff = _utcnow() - LOCKOUT_WINDOW
    db.execute(delete(DeletionLockoutFailure).where(DeletionLockoutFailure.created_at <= cutoff))
    db.commit()


def _count_recent(db: Session, account_id: int) -> int:
    _purge_expired(db)
    return db.execute(
        select(func.count())
        .select_from(DeletionLockoutFailure)
        .where(DeletionLockoutFailure.account_id == account_id)
    ).scalar_one()


def record_failure(db: Session, account_id: int) -> None:
    db.add(DeletionLockoutFailure(account_id=account_id, created_at=_utcnow()))
    db.commit()


def is_locked(db: Session, account_id: int) -> bool:
    return _count_recent(db, account_id) >= MAX_ATTEMPTS


def remaining_attempts(db: Session, account_id: int) -> int:
    return max(0, MAX_ATTEMPTS - _count_recent(db, account_id))


def reset(db: Session, account_id: int) -> None:
    db.execute(
        delete(DeletionLockoutFailure).where(
            DeletionLockoutFailure.account_id == account_id
        )
    )
    db.commit()
