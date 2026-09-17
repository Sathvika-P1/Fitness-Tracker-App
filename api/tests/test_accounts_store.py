import pytest
from sqlalchemy.exc import IntegrityError

from app.store import accounts
from app.store.models import Account


def test_verify_credentials_returns_account_on_match(db):
    accounts.create_account(db, "verify@example.com", "correct-pw", "V")
    assert accounts.verify_credentials(db, "verify@example.com", "correct-pw") is not None


def test_verify_credentials_returns_none_on_wrong_password(db):
    accounts.create_account(db, "verify2@example.com", "correct-pw", "V2")
    assert accounts.verify_credentials(db, "verify2@example.com", "wrong-pw") is None


def test_verify_credentials_returns_none_for_unknown_email(db):
    assert accounts.verify_credentials(db, "ghost@example.com", "anything") is None


def test_email_uniqueness_enforced_at_db_level(db):
    accounts.create_account(db, "race@example.com", "test-password", "Racer")

    with pytest.raises(IntegrityError):
        db.execute(
            Account.__table__.insert(),
            {"email": "race@example.com", "password_hash": "x", "display_name": "Racer 2"},
        )
    db.rollback()
