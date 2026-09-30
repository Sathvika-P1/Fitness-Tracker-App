from fastapi.testclient import TestClient

from app.main import app


def _create_entry(client, **overrides):
    payload = {
        "exercise_name": "Back squat",
        "entry_date": "2026-09-20",
        "duration_minutes": "30",
        "sets": "",
        "reps": "",
    }
    payload.update(overrides)
    res = client.post("/api/workouts", json=payload)
    return res.json()["id"]


def test_owner_can_delete_their_entry(client_with_signed_up_account):
    client = client_with_signed_up_account
    entry_id = _create_entry(client)

    del_res = client.delete(f"/api/workouts/{entry_id}")
    assert del_res.status_code == 204

    get_res = client.get(f"/api/workouts/{entry_id}")
    assert get_res.status_code == 404


def test_deleting_nonexistent_entry_is_404(client_with_signed_up_account):
    client = client_with_signed_up_account
    res = client.delete("/api/workouts/999999")
    assert res.status_code == 404


def test_deleting_another_accounts_entry_is_refused(client_with_signed_up_account):
    client = client_with_signed_up_account
    entry_id = _create_entry(client)

    other = TestClient(app)
    other.post(
        "/api/signup",
        json={
            "email": "alex@example.com",
            "password": "test-password",
            "display_name": "Alex",
        },
    )

    del_res = other.delete(f"/api/workouts/{entry_id}")
    assert del_res.status_code == 403

    get_res = client.get(f"/api/workouts/{entry_id}")
    assert get_res.status_code == 200
