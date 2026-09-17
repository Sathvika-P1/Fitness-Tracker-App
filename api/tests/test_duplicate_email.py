from fastapi.testclient import TestClient

from app.main import app
from app.store import accounts

client = TestClient(app)


def test_duplicate_email_rejected():
    client.post(
        "/api/signup",
        json={
            "email": "dup@example.com",
            "password": "test-password",
            "display_name": "Dup A",
        },
    )
    res = client.post(
        "/api/signup",
        json={
            "email": "dup@example.com",
            "password": "other-password",
            "display_name": "Dup B",
        },
    )
    assert res.status_code == 409
    assert res.json() == {"field": "email", "message": "This email is taken."}


def test_duplicate_email_creates_no_second_account(db):
    client.post(
        "/api/signup",
        json={
            "email": "dup2@example.com",
            "password": "test-password",
            "display_name": "Dup A",
        },
    )
    db.rollback()
    before = accounts.count(db)
    client.post(
        "/api/signup",
        json={
            "email": "dup2@example.com",
            "password": "other-password",
            "display_name": "Dup B",
        },
    )
    db.rollback()
    assert accounts.count(db) == before
