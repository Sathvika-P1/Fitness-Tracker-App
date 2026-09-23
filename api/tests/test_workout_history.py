from fastapi.testclient import TestClient

from app.main import app


def _create(client, exercise_name, entry_date, **kwargs):
    payload = {"exercise_name": exercise_name, "entry_date": entry_date}
    payload.update(kwargs)
    payload.setdefault("duration_minutes", "30")
    res = client.post("/api/workouts", json=payload)
    assert res.status_code == 201, res.text
    return res


def test_entries_are_returned_newest_first_with_same_date_tiebreak(
    client_with_signed_up_account,
):
    client = client_with_signed_up_account
    _create(client, "Squat", "2026-09-05")
    _create(client, "Bench", "2026-09-20")
    _create(client, "Row", "2026-09-20")

    res = client.get("/api/workouts")
    assert res.status_code == 200
    dates = [e["entry_date"] for e in res.json()["entries"]]
    assert dates == ["2026-09-20", "2026-09-20", "2026-09-05"]


def test_history_only_returns_the_signed_in_account_entries():
    client_a = TestClient(app)
    client_b = TestClient(app)
    client_a.post(
        "/api/signup",
        json={
            "email": "alice2@example.com",
            "password": "test-password",
            "display_name": "Alice",
        },
    )
    client_b.post(
        "/api/signup",
        json={
            "email": "bob2@example.com",
            "password": "test-password",
            "display_name": "Bob",
        },
    )

    _create(client_a, "Squat", "2026-09-01")
    _create(client_b, "Row", "2026-09-02")

    names_a = [e["exercise_name"] for e in client_a.get("/api/workouts").json()["entries"]]
    assert names_a == ["Squat"]


def test_no_entries_returns_an_empty_list(client_with_signed_up_account):
    res = client_with_signed_up_account.get("/api/workouts")
    assert res.status_code == 200
    assert res.json()["entries"] == []


def test_date_range_filter_is_inclusive_of_both_boundaries(client_with_signed_up_account):
    client = client_with_signed_up_account
    _create(client, "A", "2026-09-05")
    _create(client, "B", "2026-09-12")
    _create(client, "C", "2026-09-20")
    _create(client, "D", "2026-09-22")

    res = client.get(
        "/api/workouts", params={"start_date": "2026-09-12", "end_date": "2026-09-20"}
    )
    dates = {e["entry_date"] for e in res.json()["entries"]}
    assert dates == {"2026-09-12", "2026-09-20"}


def test_exercise_name_filter_matches_case_insensitively(client_with_signed_up_account):
    client = client_with_signed_up_account
    _create(client, "Back Squat", "2026-09-05")

    res = client.get("/api/workouts", params={"exercise_name": "SQUAT"})
    assert len(res.json()["entries"]) == 1


def test_exercise_name_filter_escapes_literal_percent(client_with_signed_up_account):
    client = client_with_signed_up_account
    _create(client, "100% Effort", "2026-09-05")
    _create(client, "Other Exercise", "2026-09-06")

    res = client.get("/api/workouts", params={"exercise_name": "100%"})
    entries = res.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["exercise_name"] == "100% Effort"


def test_date_range_and_name_filters_are_anded_together(client_with_signed_up_account):
    client = client_with_signed_up_account
    _create(client, "Back squat", "2026-09-05")
    _create(client, "Back squat", "2026-09-15")
    _create(client, "Row", "2026-09-15")

    res = client.get(
        "/api/workouts",
        params={"start_date": "2026-09-10", "end_date": "2026-09-20", "exercise_name": "squat"},
    )
    entries = res.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["entry_date"] == "2026-09-15"


def test_invalid_start_date_returns_400(client_with_signed_up_account):
    res = client_with_signed_up_account.get(
        "/api/workouts", params={"start_date": "not-a-date"}
    )
    assert res.status_code == 400
    assert "start_date" in res.json()["errors"]
