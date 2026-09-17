import datetime

from fastapi.testclient import TestClient

from app.main import app
from app.store import sessions
from app.store.models import SessionRow


def test_logout_clears_session_and_revokes_access(db):
    client = TestClient(app)
    signup_res = client.post(
        "/api/signup",
        json={
            "email": "logout-user@example.com",
            "password": "test-password",
            "display_name": "Logout User",
        },
    )
    assert signup_res.status_code == 201

    logout_res = client.post("/api/logout")
    assert logout_res.status_code == 200
    set_cookie = logout_res.headers["set-cookie"].lower()
    assert "sid=" in set_cookie
    assert "max-age=0" in set_cookie

    me_res = client.get("/api/me")
    assert me_res.status_code == 401


def test_expired_session_is_rejected_and_cleaned_up(db):
    client = TestClient(app)
    signup_res = client.post(
        "/api/signup",
        json={
            "email": "expired-user@example.com",
            "password": "test-password",
            "display_name": "Expired User",
        },
    )
    session_id = signup_res.cookies["sid"]

    row = db.get(SessionRow, session_id)
    row.expires_at = datetime.datetime.now(datetime.timezone.utc).replace(
        tzinfo=None
    ) - datetime.timedelta(seconds=1)
    db.commit()

    me_res = client.get("/api/me")
    assert me_res.status_code == 401

    assert sessions.get_account_id_for_session(db, session_id) is None
    assert db.get(SessionRow, session_id) is None
