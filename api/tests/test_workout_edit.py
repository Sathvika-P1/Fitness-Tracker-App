import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store.models import WorkoutEntry


def _create_entry(client, **overrides):
    payload = {
        "exercise_name": "Back squat",
        "entry_date": "2026-09-20",
        "duration_minutes": "30",
    }
    payload.update(overrides)
    res = client.post("/api/workouts", json=payload)
    return res.json()["id"]


def test_get_prefills_owned_entry_with_current_values(client_with_signed_up_account):
    entry_id = _create_entry(client_with_signed_up_account)

    res = client_with_signed_up_account.get(f"/api/workouts/{entry_id}")

    assert res.status_code == 200
    assert res.json() == {
        "id": entry_id,
        "exercise_name": "Back squat",
        "entry_date": "2026-09-20",
        "duration_minutes": 30,
        "sets": None,
        "reps": None,
    }


def test_valid_put_updates_stored_values(client_with_signed_up_account, db):
    entry_id = _create_entry(client_with_signed_up_account)

    res = client_with_signed_up_account.put(
        f"/api/workouts/{entry_id}",
        json={
            "exercise_name": "Front squat",
            "entry_date": "2026-09-21",
            "duration_minutes": "45",
        },
    )

    assert res.status_code == 200
    db.rollback()
    row = db.get(WorkoutEntry, entry_id)
    assert row.exercise_name == "Front squat"
    assert row.duration_minutes == 45


@pytest.mark.parametrize(
    "overrides,field",
    [
        ({"sets": "-1"}, "sets"),
        ({"reps": "-1"}, "reps"),
        ({"duration_minutes": "0"}, "duration_minutes"),
    ],
)
def test_invalid_put_is_rejected(client_with_signed_up_account, overrides, field):
    entry_id = _create_entry(client_with_signed_up_account)
    payload = {
        "exercise_name": "Squat",
        "entry_date": "2026-09-20",
        "duration_minutes": "10",
    }
    payload.update(overrides)

    res = client_with_signed_up_account.put(f"/api/workouts/{entry_id}", json=payload)

    assert res.status_code == 400
    assert field in res.json()["errors"]


def test_rejected_put_leaves_stored_values_unchanged(client_with_signed_up_account, db):
    entry_id = _create_entry(client_with_signed_up_account)

    res = client_with_signed_up_account.put(
        f"/api/workouts/{entry_id}",
        json={"exercise_name": "Squat", "entry_date": "2026-09-20", "sets": "-1"},
    )

    assert res.status_code == 400
    db.rollback()
    row = db.get(WorkoutEntry, entry_id)
    assert row.sets is None
    assert row.exercise_name == "Back squat"


def test_editing_another_accounts_entry_is_refused(client_with_signed_up_account, db):
    entry_id = _create_entry(client_with_signed_up_account)

    client_b = TestClient(app)
    client_b.post(
        "/api/signup",
        json={
            "email": "alex@example.com",
            "password": "test-password",
            "display_name": "Alex",
        },
    )

    res = client_b.put(
        f"/api/workouts/{entry_id}",
        json={
            "exercise_name": "Hijacked",
            "entry_date": "2026-09-20",
            "duration_minutes": "5",
        },
    )

    assert res.status_code == 403
    db.rollback()
    assert db.get(WorkoutEntry, entry_id).exercise_name == "Back squat"


def test_concurrent_edits_last_write_wins_with_no_conflict_response(
    client_with_signed_up_account, db
):
    entry_id = _create_entry(client_with_signed_up_account)

    client_a = client_with_signed_up_account
    client_b = TestClient(app)
    client_b.cookies = client_a.cookies

    res_a = client_a.put(
        f"/api/workouts/{entry_id}",
        json={"exercise_name": "Squat", "entry_date": "2026-09-20", "sets": "3", "reps": "10"},
    )
    res_b = client_b.put(
        f"/api/workouts/{entry_id}",
        json={"exercise_name": "Squat", "entry_date": "2026-09-20", "sets": "5", "reps": "6"},
    )

    assert res_a.status_code == 200
    assert res_b.status_code == 200
    assert "conflict" not in res_a.text.lower()
    assert "conflict" not in res_b.text.lower()
    db.rollback()
    row = db.get(WorkoutEntry, entry_id)
    assert row.sets == 5
    assert row.reps == 6


def test_entry_older_than_a_year_opens_for_edit_same_as_recent(
    client_with_signed_up_account,
):
    entry_id = _create_entry(client_with_signed_up_account, entry_date="2024-01-01")

    res = client_with_signed_up_account.get(f"/api/workouts/{entry_id}")

    assert res.status_code == 200
    assert res.json()["entry_date"] == "2024-01-01"


def test_get_and_response_never_expose_prior_values_after_edit(
    client_with_signed_up_account,
):
    entry_id = _create_entry(client_with_signed_up_account)
    client_with_signed_up_account.put(
        f"/api/workouts/{entry_id}",
        json={
            "exercise_name": "Front squat",
            "entry_date": "2026-09-21",
            "duration_minutes": "45",
        },
    )

    res = client_with_signed_up_account.get(f"/api/workouts/{entry_id}")

    assert res.json()["exercise_name"] == "Front squat"
    assert "history" not in res.json()
    assert "previous" not in res.json()


def test_put_on_deleted_entry_returns_generic_not_found(client_with_signed_up_account, db):
    entry_id = _create_entry(client_with_signed_up_account)
    db.query(WorkoutEntry).filter_by(id=entry_id).delete()
    db.commit()

    res = client_with_signed_up_account.put(
        f"/api/workouts/{entry_id}",
        json={"exercise_name": "X", "entry_date": "2026-09-20", "duration_minutes": "10"},
    )

    assert res.status_code == 404
    assert res.json()["message"] == "This workout no longer exists."


def test_get_for_missing_entry_returns_404(client_with_signed_up_account):
    res = client_with_signed_up_account.get("/api/workouts/999999")
    assert res.status_code == 404


def test_exercise_names_route_still_resolves_after_adding_entry_id_route(
    client_with_signed_up_account,
):
    res = client_with_signed_up_account.get("/api/workouts/exercise-names")
    assert res.status_code == 200
