from fastapi.testclient import TestClient

from app.main import app


def test_each_session_returns_only_its_own_account():
    client_a = TestClient(app)
    client_b = TestClient(app)

    client_a.post(
        "/api/signup",
        json={
            "email": "alice@example.com",
            "password": "test-password",
            "display_name": "Alice",
        },
    )
    client_b.post(
        "/api/signup",
        json={
            "email": "bob@example.com",
            "password": "test-password",
            "display_name": "Bob",
        },
    )

    me_a = client_a.get("/api/me").json()
    me_b = client_b.get("/api/me").json()

    assert me_a["email"] == "alice@example.com"
    assert me_b["email"] == "bob@example.com"
    assert me_a["email"] != me_b["email"]
