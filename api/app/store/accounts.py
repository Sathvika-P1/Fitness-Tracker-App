from passlib.context import CryptContext
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.store.models import Account

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
    db.commit()
    db.refresh(account)
    return account


def count(db: Session) -> int:
    return db.execute(select(func.count()).select_from(Account)).scalar_one()
