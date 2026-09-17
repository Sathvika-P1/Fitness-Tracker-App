from fastapi.testclient import TestClient

from app.main import app
from app.store import accounts

client = TestClient(app)


def test_signup_creates_account(db):
    res = client.post(
        "/api/signup",
        json={
            "email": "new.user@example.com",
            "password": "test-password",
            "display_name": "New U.",
        },
    )
    assert res.status_code == 201
    assert accounts.find_by_email(db, "new.user@example.com") is not None
