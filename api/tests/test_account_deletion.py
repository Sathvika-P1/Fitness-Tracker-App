from fastapi.testclient import TestClient

from app.main import app
from app.store.models import AccountDeletionAudit, WorkoutEntry


def test_deleting_an_account_with_a_logged_workout_removes_the_entry(
    client_with_signed_up_account, db
):
    client_with_signed_up_account.post(
        "/api/workouts",
        json={
            "exercise_name": "Squat",
            "entry_date": "2026-09-20",
            "duration_minutes": "10",
        },
    )
    resp = client_with_signed_up_account.post(
        "/api/account/delete", json={"password": "test-password"}
    )
    assert resp.status_code == 200
    db.rollback()
    assert db.query(WorkoutEntry).count() == 0


def test_correct_password_deletes_account_and_clears_session(client_with_signed_up_account, db):
    resp = client_with_signed_up_account.post(
        "/api/account/delete", json={"password": "test-password"}
    )
    assert resp.status_code == 200
    assert resp.cookies.get("sid") is None

    me = client_with_signed_up_account.get("/api/me")
    assert me.status_code == 401


def test_me_reports_active_session_count_for_account_settings(client_with_signed_up_account):
    device_b = TestClient(app)
    device_b.post(
        "/api/login", json={"email": "jordan@example.com", "password": "test-password"}
    )

    me = client_with_signed_up_account.get("/api/me")
    assert me.json()["active_sessions"] == 2


def test_delete_cookie_clears_with_matching_security_attributes(client_with_signed_up_account):
    resp = client_with_signed_up_account.post(
        "/api/account/delete", json={"password": "test-password"}
    )
    set_cookie = resp.headers["set-cookie"].lower()
    assert "sid=" in set_cookie
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie


def test_incorrect_password_blocks_deletion_and_account_stays_intact(
    client_with_signed_up_account,
):
    resp = client_with_signed_up_account.post(
        "/api/account/delete", json={"password": "wrong-password"}
    )
    assert resp.status_code == 401
    assert resp.json() == {
        "message": "Incorrect password. Your account has not been changed.",
        "reason": "incorrect_password",
        "remaining_attempts": 4,
    }

    me = client_with_signed_up_account.get("/api/me")
    assert me.status_code == 200


def test_former_credentials_fail_login_after_deletion(client_with_signed_up_account):
    client_with_signed_up_account.post(
        "/api/account/delete", json={"password": "test-password"}
    )
    login_client = TestClient(app)
    res = login_client.post(
        "/api/login", json={"email": "jordan@example.com", "password": "test-password"}
    )
    assert res.status_code == 401
    assert res.json() == {"message": "Invalid email or password."}


def test_repeated_incorrect_attempts_lock_out_deletion(client_with_signed_up_account):
    for _ in range(5):
        resp = client_with_signed_up_account.post(
            "/api/account/delete", json={"password": "wrong-password"}
        )
        assert resp.status_code == 401

    locked = client_with_signed_up_account.post(
        "/api/account/delete", json={"password": "test-password"}
    )
    assert locked.status_code == 423
    assert locked.json() == {
        "message": "Too many incorrect attempts. Try again later.",
        "reason": "locked_out",
        "remaining_attempts": 0,
    }


def test_duplicate_deletion_request_is_handled_gracefully(client_with_signed_up_account):
    first = client_with_signed_up_account.post(
        "/api/account/delete", json={"password": "test-password"}
    )
    assert first.status_code == 200

    second = client_with_signed_up_account.post(
        "/api/account/delete", json={"password": "test-password"}
    )
    assert second.status_code == 401
    assert second.json() == {"message": "Not signed in.", "reason": "not_signed_in"}


def test_deletion_writes_anonymized_audit_entry_without_pii(client_with_signed_up_account, db):
    client_with_signed_up_account.post(
        "/api/account/delete", json={"password": "test-password"}
    )
    db.commit()
    rows = db.query(AccountDeletionAudit).all()
    assert len(rows) == 1
    entry = rows[0]
    assert entry.account_reference != "jordan@example.com"
    assert "jordan" not in entry.account_reference
    assert entry.deleted_at is not None


def test_deletion_invalidates_sessions_on_all_other_devices():
    device_a = TestClient(app)
    device_a.post(
        "/api/signup",
        json={
            "email": "multidevice@example.com",
            "password": "test-password",
            "display_name": "Multi",
        },
    )
    device_b = TestClient(app)
    device_b.post(
        "/api/login",
        json={"email": "multidevice@example.com", "password": "test-password"},
    )
    assert device_b.get("/api/me").status_code == 200

    device_a.post("/api/account/delete", json={"password": "test-password"})

    assert device_b.get("/api/me").status_code == 401


def test_deletion_requires_signed_in_session():
    client = TestClient(app)
    resp = client.post("/api/account/delete", json={"password": "test-password"})
    assert resp.status_code == 401
    assert resp.json() == {"message": "Not signed in.", "reason": "not_signed_in"}
