import logging

from passlib.context import CryptContext
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.store.models import Account, DeletionLockoutFailure, SessionRow, WorkoutEntry

logger = logging.getLogger(__name__)

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class DuplicateEmailError(Exception):
    pass


def find_by_email(db: Session, email: str) -> Account | None:
    return db.execute(
        select(Account).where(Account.email == email.lower())
    ).scalar_one_or_none()


def create_account(db: Session, email: str, password: str, display_name: str) -> Account:
    normalized_email = email.lower()
    if find_by_email(db, normalized_email) is not None:
        raise DuplicateEmailError(normalized_email)

    account = Account(
        email=normalized_email,
        password_hash=_pwd_context.hash(password),
        display_name=display_name,
    )
    db.add(account)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        logger.warning("duplicate_email_race_detected error=%s", exc)
        raise DuplicateEmailError(normalized_email) from exc
    db.refresh(account)
    return account


def verify_credentials(db: Session, email: str, password: str) -> Account | None:
    account = find_by_email(db, email)
    if account is None:
        _pwd_context.dummy_verify()
        return None
    if not _pwd_context.verify(password, account.password_hash):
        return None
    return account


def count(db: Session) -> int:
    return db.execute(select(func.count()).select_from(Account)).scalar_one()


def delete_account(db: Session, account: Account) -> None:
    db.query(SessionRow).filter(SessionRow.account_id == account.id).delete()
    db.query(DeletionLockoutFailure).filter(
        DeletionLockoutFailure.account_id == account.id
    ).delete()
    db.query(WorkoutEntry).filter(WorkoutEntry.account_id == account.id).delete()
    db.delete(account)
    db.commit()
