from fastapi.testclient import TestClient

from app.main import app


def test_deletion_confirmation_locks_out_after_max_attempts(db):
    client = TestClient(app)
    client.post(
        "/api/signup",
        json={"email": "lock@example.com", "password": "test-password", "display_name": "L"},
    )
    for _ in range(5):
        res = client.post("/api/account/delete", json={"password": "wrong"})
        assert res.status_code == 401
    locked_res = client.post("/api/account/delete", json={"password": "test-password"})
    assert locked_res.status_code == 429
    assert client.get("/api/me").status_code == 200


def test_login_lockout_is_not_affected_by_deletion_lockout_policy(db):
    client = TestClient(app)
    for _ in range(5):
        res = client.post("/api/login", json={"email": "nope@example.com", "password": "bad"})
        assert res.status_code == 401
        assert res.json() == {"message": "Invalid email or password."}
