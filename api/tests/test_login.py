from fastapi.testclient import TestClient

from app.main import app


def test_login_with_correct_credentials_succeeds(db):
    client = TestClient(app)
    client.post(
        "/api/signup",
        json={
            "email": "login-user@example.com",
            "password": "test-password",
            "display_name": "Login User",
        },
    )
    client.cookies.clear()
    res = client.post(
        "/api/login",
        json={"email": "login-user@example.com", "password": "test-password"},
    )
    assert res.status_code == 200
    assert res.json() == {"email": "login-user@example.com", "display_name": "Login User"}
    me = client.get("/api/me")
    assert me.status_code == 200


def test_login_with_wrong_password_returns_generic_error(db):
    client = TestClient(app)
    client.post(
        "/api/signup",
        json={"email": "wrongpw@example.com", "password": "test-password", "display_name": "U"},
    )
    client.cookies.clear()
    res = client.post("/api/login", json={"email": "wrongpw@example.com", "password": "nope"})
    assert res.status_code == 401
    assert res.json() == {"message": "Invalid email or password."}


def test_login_with_unknown_email_returns_identical_generic_error(db):
    client = TestClient(app)
    res = client.post("/api/login", json={"email": "nobody@example.com", "password": "x"})
    assert res.status_code == 401
    assert res.json() == {"message": "Invalid email or password."}


def test_second_device_login_does_not_invalidate_first_session(db):
    device_a = TestClient(app)
    device_a.post(
        "/api/signup",
        json={"email": "multi@example.com", "password": "test-password", "display_name": "Multi"},
    )
    device_b = TestClient(app)
    device_b.post("/api/login", json={"email": "multi@example.com", "password": "test-password"})
    assert device_a.get("/api/me").status_code == 200
    assert device_b.get("/api/me").status_code == 200


def test_logout_from_one_device_leaves_other_device_active(db):
    device_a = TestClient(app)
    device_a.post(
        "/api/signup",
        json={"email": "twodev@example.com", "password": "test-password", "display_name": "Two"},
    )
    device_b = TestClient(app)
    device_b.post("/api/login", json={"email": "twodev@example.com", "password": "test-password"})
    device_a.post("/api/logout")
    assert device_a.get("/api/me").status_code == 401
    assert device_b.get("/api/me").status_code == 200


def test_repeated_invalid_attempts_get_same_error_no_lockout(db):
    client = TestClient(app)
    for _ in range(5):
        res = client.post("/api/login", json={"email": "nope@example.com", "password": "bad"})
        assert res.status_code == 401
        assert res.json() == {"message": "Invalid email or password."}


def test_login_cookie_has_persistent_max_age(db):
    client = TestClient(app)
    client.post(
        "/api/signup",
        json={"email": "persist@example.com", "password": "test-password", "display_name": "P"},
    )
    client.cookies.clear()
    res = client.post(
        "/api/login", json={"email": "persist@example.com", "password": "test-password"}
    )
    set_cookie = res.headers["set-cookie"].lower()
    assert "max-age=" in set_cookie
