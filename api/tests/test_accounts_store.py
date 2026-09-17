import pytest
from sqlalchemy.exc import IntegrityError

from app.store import accounts
from app.store.models import Account


def test_email_uniqueness_enforced_at_db_level(db):
    accounts.create_account(db, "race@example.com", "test-password", "Racer")

    with pytest.raises(IntegrityError):
        db.execute(
            Account.__table__.insert(),
            {"email": "race@example.com", "password_hash": "x", "display_name": "Racer 2"},
        )
    db.rollback()


def test_commit_integrity_error_becomes_duplicate_email_error(db, monkeypatch):
    accounts.create_account(db, "race-unit@example.com", "pw-1", "First")
    monkeypatch.setattr(accounts, "find_by_email", lambda *_: None)
    with pytest.raises(accounts.DuplicateEmailError):
        accounts.create_account(db, "race-unit@example.com", "pw-1", "Second")
