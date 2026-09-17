import os

os.environ.setdefault(
    "DATABASE_URL", "mysql+pymysql://ftp:ftp@localhost:3306/ftp_signup_test"
)
os.environ.setdefault("SECURE_COOKIES", "false")

import pytest
from sqlalchemy import create_engine, text

from app.db import Base, DATABASE_URL, SessionLocal, engine
from app.main import app
from app.store.models import Account, SessionRow


@pytest.fixture(autouse=True, scope="session")
def _create_test_database():
    admin_url, db_name = DATABASE_URL.rsplit("/", 1)
    admin_engine = create_engine(admin_url)
    with admin_engine.connect() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS {db_name}"))
        conn.commit()
    admin_engine.dispose()

    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def _clean_tables():
    db = SessionLocal()
    db.query(SessionRow).delete()
    db.query(Account).delete()
    db.commit()
    db.close()
    yield


@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.close()
