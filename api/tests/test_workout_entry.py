import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store.models import WorkoutEntry


def test_valid_entry_with_duration_only_is_saved(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/workouts",
        json={
            "exercise_name": "Back squat",
            "entry_date": "2026-09-20",
            "duration_minutes": "30",
        },
    )
    assert res.status_code == 201
    assert res.json()["exercise_name"] == "Back squat"


def test_valid_entry_appears_when_listed_directly_via_store(
    client_with_signed_up_account, db
):
    res = client_with_signed_up_account.post(
        "/api/workouts",
        json={
            "exercise_name": "Deadlift",
            "entry_date": "2026-09-20",
            "duration_minutes": "30",
        },
    )
    assert res.status_code == 201
    db.rollback()
    assert db.query(WorkoutEntry).filter_by(exercise_name="Deadlift").count() == 1


def test_blank_duration_and_sets_reps_is_rejected(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/workouts",
        json={"exercise_name": "Deadlift", "entry_date": "2026-09-20"},
    )
    assert res.status_code == 400
    assert "at least one is required" in res.json()["errors"]["entry"].lower()


@pytest.mark.parametrize(
    "overrides,field",
    [
        ({"duration_minutes": "-5"}, "duration_minutes"),
        ({"sets": "-2"}, "sets"),
        ({"reps": "-1"}, "reps"),
        ({"duration_minutes": "0"}, "duration_minutes"),
        ({"duration_minutes": "nan"}, "duration_minutes"),
        ({"duration_minutes": "inf"}, "duration_minutes"),
        ({"duration_minutes": "-inf"}, "duration_minutes"),
    ],
)
def test_negative_sets_reps_and_nonpositive_duration_are_each_rejected(
    client_with_signed_up_account, overrides, field
):
    payload = {
        "exercise_name": "Bench press",
        "entry_date": "2026-09-20",
        "duration_minutes": "10",
    }
    payload.update(overrides)
    res = client_with_signed_up_account.post("/api/workouts", json=payload)
    assert res.status_code == 400
    assert field in res.json()["errors"]


def test_zero_sets_and_reps_is_valid(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/workouts",
        json={
            "exercise_name": "Pull-up",
            "entry_date": "2026-09-20",
            "sets": "0",
            "reps": "0",
        },
    )
    assert res.status_code == 201


def test_future_date_is_rejected(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/workouts",
        json={
            "exercise_name": "Row",
            "entry_date": "2999-01-01",
            "duration_minutes": "20",
        },
    )
    assert res.status_code == 400
    assert "future" in res.json()["errors"]["entry_date"].lower()


def test_exercise_names_are_scoped_to_the_caller_account(client_with_signed_up_account):
    client_a = client_with_signed_up_account
    client_b = TestClient(app)
    client_b.post(
        "/api/signup",
        json={
            "email": "alex@example.com",
            "password": "test-password",
            "display_name": "Alex",
        },
    )

    client_a.post(
        "/api/workouts",
        json={
            "exercise_name": "Back squat",
            "entry_date": "2026-09-20",
            "duration_minutes": "10",
        },
    )
    client_b.post(
        "/api/workouts",
        json={
            "exercise_name": "Bench press",
            "entry_date": "2026-09-20",
            "duration_minutes": "10",
        },
    )

    res = client_a.get("/api/workouts/exercise-names")
    assert res.json()["names"] == ["Back squat"]


def test_blank_exercise_name_is_rejected(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/workouts",
        json={
            "exercise_name": "",
            "entry_date": "2026-09-20",
            "duration_minutes": "45",
        },
    )
    assert res.status_code == 400
    assert res.json()["errors"]["exercise_name"] == "Exercise name is required."


def test_unauthenticated_submit_is_rejected_and_nothing_saved(db):
    client = TestClient(app)
    res = client.post(
        "/api/workouts",
        json={
            "exercise_name": "Squat",
            "entry_date": "2026-09-20",
            "duration_minutes": "10",
        },
    )
    assert res.status_code == 401
    db.rollback()
    assert db.query(WorkoutEntry).count() == 0
