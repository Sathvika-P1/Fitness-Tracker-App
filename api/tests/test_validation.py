from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_missing_email_blocks_signup():
    res = client.post(
        "/api/signup",
        json={
            "email": "",
            "password": "test-password",
            "display_name": "No Email",
        },
    )
    assert res.status_code == 400
    assert res.json() == {"field": "email", "message": "Enter an email to continue."}


def test_missing_password_blocks_signup():
    res = client.post(
        "/api/signup",
        json={
            "email": "someone@example.com",
            "password": "",
            "display_name": "No Password",
        },
    )
    assert res.status_code == 400
    assert res.json() == {
        "field": "password",
        "message": "Enter a password to continue.",
    }


def test_missing_display_name_blocks_signup():
    res = client.post(
        "/api/signup",
        json={
            "email": "someone2@example.com",
            "password": "test-password",
            "display_name": "",
        },
    )
    assert res.status_code == 400
    assert res.json() == {
        "field": "display_name",
        "message": "Enter a display name to continue.",
    }
