from fastapi.testclient import TestClient

from app.main import app


def test_get_profile_shows_unset_fields_as_null(client_with_signed_up_account):
    res = client_with_signed_up_account.get("/api/profile")
    assert res.status_code == 200
    body = res.json()
    assert body["display_name"] == "Jordan"
    assert body["units_preference"] is None
    assert body["fitness_goal"] is None
    assert body["height_cm"] is None
    assert body["weight_kg"] is None
    assert body["age"] is None
    assert body["gender"] is None


def test_updating_preferences_persists_across_reload(client_with_signed_up_account):
    client_with_signed_up_account.post(
        "/api/profile",
        json={
            "units_preference": "imperial",
            "fitness_goal": "build_muscle",
            "height_cm": "180.5",
            "weight_kg": "74.5",
            "age": "31",
            "gender": "woman",
        },
    )
    res = client_with_signed_up_account.get("/api/profile")
    body = res.json()
    assert body["units_preference"] == "imperial"
    assert body["fitness_goal"] == "build_muscle"
    assert body["height_cm"] == 180.5
    assert body["weight_kg"] == 74.5
    assert body["age"] == 31
    assert body["gender"] == "woman"


def test_updating_display_name_persists_across_reload(client_with_signed_up_account):
    client_with_signed_up_account.post("/api/profile", json={"display_name": "Jordan A."})
    res = client_with_signed_up_account.get("/api/profile")
    assert res.json()["display_name"] == "Jordan A."


def test_each_session_sees_and_edits_only_its_own_profile():
    client_a, client_b = TestClient(app), TestClient(app)
    client_a.post(
        "/api/signup",
        json={"email": "alice@example.com", "password": "test-password", "display_name": "Alice"},
    )
    client_b.post(
        "/api/signup",
        json={"email": "bob@example.com", "password": "test-password", "display_name": "Bob"},
    )
    client_a.post("/api/profile", json={"display_name": "Alice A."})
    assert client_a.get("/api/profile").json()["display_name"] == "Alice A."
    assert client_b.get("/api/profile").json()["display_name"] == "Bob"


def test_display_name_over_max_length_is_rejected(client_with_signed_up_account):
    res = client_with_signed_up_account.post("/api/profile", json={"display_name": "x" * 51})
    assert res.status_code == 400
    assert "display_name" in res.json()["errors"]
    assert client_with_signed_up_account.get("/api/profile").json()["display_name"] == "Jordan"


def test_display_name_with_disallowed_characters_is_rejected(client_with_signed_up_account):
    res = client_with_signed_up_account.post("/api/profile", json={"display_name": "Jordan \U0001f525"})
    assert res.status_code == 400
    assert "display_name" in res.json()["errors"]


def test_display_name_change_propagates_to_me_endpoint(client_with_signed_up_account):
    client_with_signed_up_account.post("/api/profile", json={"display_name": "Jordan A."})
    res = client_with_signed_up_account.get("/api/me")
    assert res.json()["display_name"] == "Jordan A."


def test_two_accounts_can_share_the_same_display_name():
    client_a, client_b = TestClient(app), TestClient(app)
    client_a.post(
        "/api/signup",
        json={"email": "a1@example.com", "password": "test-password", "display_name": "Original A"},
    )
    client_b.post(
        "/api/signup",
        json={"email": "a2@example.com", "password": "test-password", "display_name": "Original B"},
    )
    res_a = client_a.post("/api/profile", json={"display_name": "Alex Rivera"})
    res_b = client_b.post("/api/profile", json={"display_name": "Alex Rivera"})
    assert res_a.status_code == 200 and res_b.status_code == 200


def test_out_of_range_body_details_are_rejected_together(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/profile", json={"height_cm": "450", "weight_kg": "612", "age": "142"}
    )
    assert res.status_code == 400
    errors = res.json()["errors"]
    assert set(errors) == {"height_cm", "weight_kg", "age"}
    assert errors["height_cm"] == "Height must be between 1 and 300 cm."
    assert errors["weight_kg"] == "Weight must be between 1 and 500 kg."
    assert errors["age"] == "Age must be between 1 and 120."


def test_non_numeric_body_details_are_rejected(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/profile", json={"height_cm": "tall", "weight_kg": "n/a", "age": "thirty-one"}
    )
    assert res.status_code == 400
    assert res.json()["errors"]["height_cm"] == "Height must be a number."


def test_decimal_age_is_rejected_but_decimal_height_and_weight_are_accepted(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/profile", json={"height_cm": "178.5", "weight_kg": "74.5", "age": "31.5"}
    )
    assert res.status_code == 400
    assert res.json()["errors"] == {"age": "Age must be a number."}


def test_boundary_values_are_accepted(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/profile", json={"height_cm": "300", "weight_kg": "500", "age": "120"}
    )
    assert res.status_code == 200
    res2 = client_with_signed_up_account.post(
        "/api/profile", json={"height_cm": "1", "weight_kg": "1", "age": "1"}
    )
    assert res2.status_code == 200


def test_gender_outside_predefined_list_is_rejected(client_with_signed_up_account):
    res = client_with_signed_up_account.post("/api/profile", json={"gender": "alien"})
    assert res.status_code == 400
    assert res.json()["errors"]["gender"] == "Select a valid gender option from the list."
