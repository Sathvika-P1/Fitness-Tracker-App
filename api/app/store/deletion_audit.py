import datetime
import hashlib

from sqlalchemy.orm import Session

from app.store.models import DeletionAudit


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def record_deletion(db: Session, account_id: int) -> None:
    reference = hashlib.sha256(f"account:{account_id}".encode()).hexdigest()
    db.add(DeletionAudit(account_reference=reference, deleted_at=_utcnow()))
    db.commit()
