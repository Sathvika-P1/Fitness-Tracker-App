import datetime

from sqlalchemy.orm import Session

from app.store.models import DeletionLockout

MAX_ATTEMPTS = 5
LOCKOUT_DURATION = datetime.timedelta(minutes=15)


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _get_or_create(db: Session, account_id: int) -> DeletionLockout:
    row = db.get(DeletionLockout, account_id)
    if row is None:
        row = DeletionLockout(account_id=account_id, failed_attempts=0, locked_until=None)
        db.add(row)
        db.commit()
    return row


def is_locked(db: Session, account_id: int) -> bool:
    row = db.get(DeletionLockout, account_id)
    if row is None or row.locked_until is None:
        return False
    return row.locked_until > _utcnow()


def record_failure(db: Session, account_id: int) -> int:
    row = _get_or_create(db, account_id)
    row.failed_attempts += 1
    if row.failed_attempts >= MAX_ATTEMPTS:
        row.locked_until = _utcnow() + LOCKOUT_DURATION
    db.commit()
    return max(0, MAX_ATTEMPTS - row.failed_attempts)
