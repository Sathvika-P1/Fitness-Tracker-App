import hashlib

from fastapi.testclient import TestClient

from app.main import app
from app.store.accounts import find_by_email
from app.store.models import DeletionAudit


def test_get_account_returns_email_and_active_session_count(db):
    device_a = TestClient(app)
    device_a.post(
        "/api/signup",
        json={"email": "sessions@example.com", "password": "test-password", "display_name": "S"},
    )
    device_b = TestClient(app)
    device_b.post("/api/login", json={"email": "sessions@example.com", "password": "test-password"})

    res = device_a.get("/api/account")
    assert res.status_code == 200
    assert res.json() == {"email": "sessions@example.com", "active_session_count": 2}


def test_get_account_requires_signed_in_session(db):
    client = TestClient(app)
    res = client.get("/api/account")
    assert res.status_code == 401


def test_correct_password_deletes_account_and_session(db):
    client = TestClient(app)
    client.post(
        "/api/signup",
        json={"email": "del@example.com", "password": "test-password", "display_name": "D"},
    )
    res = client.post("/api/account/delete", json={"password": "test-password"})
    assert res.status_code == 200
    assert client.get("/api/me").status_code == 401
    assert find_by_email(db, "del@example.com") is None


def test_incorrect_password_blocks_deletion(db):
    client = TestClient(app)
    client.post(
        "/api/signup",
        json={"email": "keep@example.com", "password": "test-password", "display_name": "K"},
    )
    res = client.post("/api/account/delete", json={"password": "wrong"})
    assert res.status_code == 401
    assert res.json() == {"message": "Incorrect password. Your account has not been changed."}
    assert client.get("/api/me").status_code == 200


def test_login_fails_after_account_deleted(db):
    client = TestClient(app)
    client.post(
        "/api/signup",
        json={"email": "gone@example.com", "password": "test-password", "display_name": "G"},
    )
    client.post("/api/account/delete", json={"password": "test-password"})
    client.cookies.clear()
    res = client.post("/api/login", json={"email": "gone@example.com", "password": "test-password"})
    assert res.status_code == 401
    assert res.json() == {"message": "Invalid email or password."}


def test_deletion_invalidates_all_devices(db):
    device_a = TestClient(app)
    device_a.post(
        "/api/signup",
        json={"email": "multi2@example.com", "password": "test-password", "display_name": "M"},
    )
    device_b = TestClient(app)
    device_b.post("/api/login", json={"email": "multi2@example.com", "password": "test-password"})
    device_a.post("/api/account/delete", json={"password": "test-password"})
    assert device_a.get("/api/me").status_code == 401
    assert device_b.get("/api/me").status_code == 401


def test_duplicate_deletion_request_is_idempotent(db):
    client = TestClient(app)
    client.post(
        "/api/signup",
        json={"email": "dup@example.com", "password": "test-password", "display_name": "D"},
    )
    first = client.post("/api/account/delete", json={"password": "test-password"})
    assert first.status_code == 200
    second = client.post("/api/account/delete", json={"password": "test-password"})
    assert second.status_code == 200
    assert second.json()["status"] == "already_deleted"


def test_deletion_writes_anonymized_audit_entry(db):
    client = TestClient(app)
    client.post(
        "/api/signup",
        json={"email": "audit@example.com", "password": "test-password", "display_name": "A"},
    )
    account = find_by_email(db, "audit@example.com")
    account_id = account.id
    client.post("/api/account/delete", json={"password": "test-password"})

    db.commit()
    expected_reference = hashlib.sha256(f"account:{account_id}".encode()).hexdigest()
    rows = db.query(DeletionAudit).filter(
        DeletionAudit.account_reference == expected_reference
    ).all()
    assert len(rows) == 1
    assert "audit@example.com" not in rows[0].account_reference
    assert rows[0].deleted_at is not None
