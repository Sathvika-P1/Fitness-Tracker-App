import secrets

from sqlalchemy.orm import Session

from app.store.models import SessionRow


def create_session(db: Session, account_id: int) -> str:
    session_id = secrets.token_urlsafe(32)
    db.add(SessionRow(id=session_id, account_id=account_id))
    db.commit()
    return session_id


def get_account_id_for_session(db: Session, session_id: str) -> int | None:
    row = db.get(SessionRow, session_id)
    return row.account_id if row is not None else None
