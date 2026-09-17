from fastapi.testclient import TestClient

from app.main import app


def test_signup_signs_in_immediately(db):
    client = TestClient(app)
    res = client.post(
        "/api/signup",
        json={
            "email": "new2.user@example.com",
            "password": "test-password",
            "display_name": "New U.",
        },
    )
    assert res.status_code == 201

    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json() == {"email": "new2.user@example.com", "display_name": "New U."}
