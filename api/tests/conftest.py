import os

os.environ.setdefault(
    "DATABASE_URL", "mysql+pymysql://ftp:ftp@localhost:3306/ftp_signup_test"
)
os.environ.setdefault("SECURE_COOKIES", "false")

import pytest
from sqlalchemy import create_engine, text

from app.db import Base, DATABASE_URL, SessionLocal, engine
from app.main import _backfill_profile_columns, _backfill_session_ttl_columns, app
from app.store.models import (
    Account,
    AccountDeletionAudit,
    DeletionLockoutFailure,
    SessionRow,
    WorkoutEntry,
)


@pytest.fixture(autouse=True, scope="session")
def _create_test_database():
    admin_url, db_name = DATABASE_URL.rsplit("/", 1)
    admin_engine = create_engine(admin_url)
    with admin_engine.connect() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {db_name}"))
        conn.commit()
    admin_engine.dispose()

    Base.metadata.create_all(engine)
    _backfill_session_ttl_columns()
    _backfill_profile_columns()
    yield


@pytest.fixture(autouse=True)
def _clean_tables():
    db = SessionLocal()
    db.query(SessionRow).delete()
    db.query(DeletionLockoutFailure).delete()
    db.query(WorkoutEntry).delete()
    db.query(Account).delete()
    db.query(AccountDeletionAudit).delete()
    db.commit()
    db.close()
    yield


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def client_with_signed_up_account():
    from fastapi.testclient import TestClient

    client = TestClient(app)
    client.post(
        "/api/signup",
        json={
            "email": "jordan@example.com",
            "password": "test-password",
            "display_name": "Jordan",
        },
    )
    return client
