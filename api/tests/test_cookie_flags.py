from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_session_cookie_is_httponly_and_samesite():
    res = client.post(
        "/api/signup",
        json={
            "email": "cookie-flags@example.com",
            "password": "test-password",
            "display_name": "Cookie Tester",
        },
    )
    assert res.status_code == 201
    set_cookie = res.headers["set-cookie"].lower()
    assert "httponly" in set_cookie
    assert "samesite=lax" in set_cookie


def test_session_cookie_is_secure_when_secure_cookies_enabled(monkeypatch):
    monkeypatch.setenv("SECURE_COOKIES", "true")
    res = client.post(
        "/api/signup",
        json={
            "email": "cookie-flags-secure@example.com",
            "password": "test-password",
            "display_name": "Cookie Tester",
        },
    )
    assert res.status_code == 201
    assert "secure" in res.headers["set-cookie"].lower()
