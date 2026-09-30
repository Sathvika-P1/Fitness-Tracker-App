import pytest

from tests.conftest import create_entry as _create_entry


def test_get_prefills_owned_entry_with_current_values(client_with_signed_up_account):
    client = client_with_signed_up_account
    entry_id = _create_entry(client)
    res = client.get(f"/api/workouts/{entry_id}")
    assert res.status_code == 200
    body = res.json()
    assert body["exercise_name"] == "Back squat"
    assert body["entry_date"] == "2026-09-20"
    assert body["duration_minutes"] == 30
    assert body["sets"] is None
    assert body["reps"] is None


def test_valid_put_updates_stored_values(client_with_signed_up_account):
    client = client_with_signed_up_account
    entry_id = _create_entry(client)
    res = client.put(
        f"/api/workouts/{entry_id}",
        json={
            "exercise_name": "Front squat",
            "entry_date": "2026-09-21",
            "duration_minutes": "",
            "sets": "3",
            "reps": "10",
        },
    )
    assert res.status_code == 200

    get_res = client.get(f"/api/workouts/{entry_id}")
    body = get_res.json()
    assert body["exercise_name"] == "Front squat"
    assert body["entry_date"] == "2026-09-21"
    assert body["duration_minutes"] is None
    assert body["sets"] == 3
    assert body["reps"] == 10


@pytest.mark.parametrize(
    "overrides",
    [
        {"sets": "not-a-number", "duration_minutes": "", "reps": ""},
        {"reps": "-1", "duration_minutes": "", "sets": "3"},
        {"duration_minutes": "0", "sets": "", "reps": ""},
    ],
)
def test_invalid_put_is_rejected(client_with_signed_up_account, overrides):
    client = client_with_signed_up_account
    entry_id = _create_entry(client)
    payload = {
        "exercise_name": "Back squat",
        "entry_date": "2026-09-20",
        "duration_minutes": "30",
        "sets": "",
        "reps": "",
    }
    payload.update(overrides)
    res = client.put(f"/api/workouts/{entry_id}", json=payload)
    assert res.status_code == 400
    assert res.json()["errors"]


def test_rejected_put_leaves_stored_values_unchanged(client_with_signed_up_account):
    client = client_with_signed_up_account
    entry_id = _create_entry(client)
    client.put(
        f"/api/workouts/{entry_id}",
        json={
            "exercise_name": "Front squat",
            "entry_date": "2026-09-21",
            "duration_minutes": "",
            "sets": "not-a-number",
            "reps": "",
        },
    )
    get_res = client.get(f"/api/workouts/{entry_id}")
    body = get_res.json()
    assert body["exercise_name"] == "Back squat"
    assert body["entry_date"] == "2026-09-20"
    assert body["duration_minutes"] == 30


def test_editing_another_accounts_entry_is_refused(client_with_signed_up_account):
    client = client_with_signed_up_account
    entry_id = _create_entry(client)

    from fastapi.testclient import TestClient

    from app.main import app

    other = TestClient(app)
    other.post(
        "/api/signup",
        json={
            "email": "alex@example.com",
            "password": "test-password",
            "display_name": "Alex",
        },
    )

    get_res = other.get(f"/api/workouts/{entry_id}")
    assert get_res.status_code == 403

    put_res = other.put(
        f"/api/workouts/{entry_id}",
        json={
            "exercise_name": "Hacked",
            "entry_date": "2026-09-21",
            "duration_minutes": "10",
            "sets": "",
            "reps": "",
        },
    )
    assert put_res.status_code == 403


def test_concurrent_edits_last_write_wins_with_no_conflict_response(
    client_with_signed_up_account,
):
    client_a = client_with_signed_up_account
    entry_id = _create_entry(client_a)

    from fastapi.testclient import TestClient

    from app.main import app

    client_b = TestClient(app)
    client_b.cookies = client_a.cookies

    res_a = client_a.put(
        f"/api/workouts/{entry_id}",
        json={
            "exercise_name": "Edit A",
            "entry_date": "2026-09-20",
            "duration_minutes": "30",
            "sets": "",
            "reps": "",
        },
    )
    res_b = client_b.put(
        f"/api/workouts/{entry_id}",
        json={
            "exercise_name": "Edit B",
            "entry_date": "2026-09-20",
            "duration_minutes": "40",
            "sets": "",
            "reps": "",
        },
    )
    assert res_a.status_code == 200
    assert res_b.status_code == 200

    final = client_a.get(f"/api/workouts/{entry_id}").json()
    assert final["exercise_name"] == "Edit B"
    assert final["duration_minutes"] == 40


def test_entry_older_than_a_year_opens_for_edit_same_as_recent(
    client_with_signed_up_account,
):
    client = client_with_signed_up_account
    entry_id = _create_entry(client, entry_date="2024-01-01")
    get_res = client.get(f"/api/workouts/{entry_id}")
    assert get_res.status_code == 200

    put_res = client.put(
        f"/api/workouts/{entry_id}",
        json={
            "exercise_name": "Old workout updated",
            "entry_date": "2024-01-01",
            "duration_minutes": "15",
            "sets": "",
            "reps": "",
        },
    )
    assert put_res.status_code == 200


def test_get_and_response_never_expose_prior_values_after_edit(
    client_with_signed_up_account,
):
    client = client_with_signed_up_account
    entry_id = _create_entry(client)
    client.put(
        f"/api/workouts/{entry_id}",
        json={
            "exercise_name": "Updated name",
            "entry_date": "2026-09-21",
            "duration_minutes": "45",
            "sets": "",
            "reps": "",
        },
    )
    body = client.get(f"/api/workouts/{entry_id}").json()
    assert set(body.keys()) == {
        "id",
        "exercise_name",
        "entry_date",
        "duration_minutes",
        "sets",
        "reps",
    }
    assert body["exercise_name"] == "Updated name"


def test_put_on_deleted_entry_returns_generic_not_found(client_with_signed_up_account):
    client = client_with_signed_up_account
    res = client.put(
        "/api/workouts/999999",
        json={
            "exercise_name": "Ghost",
            "entry_date": "2026-09-20",
            "duration_minutes": "10",
            "sets": "",
            "reps": "",
        },
    )
    assert res.status_code == 404
    assert res.json()["message"]


def test_get_for_missing_entry_returns_404(client_with_signed_up_account):
    client = client_with_signed_up_account
    res = client.get("/api/workouts/999999")
    assert res.status_code == 404


def test_exercise_names_route_still_resolves_after_adding_entry_id_route(
    client_with_signed_up_account,
):
    client = client_with_signed_up_account
    res = client.get("/api/workouts/exercise-names")
    assert res.status_code == 200
    assert "names" in res.json()
