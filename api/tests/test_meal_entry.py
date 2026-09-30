import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.store.models import MealEntry


def valid_payload(**overrides):
    payload = {
        "calories": "650",
        "carbs_g": "80",
        "protein_g": "35",
        "fat_g": "20",
        "date": "2026-09-20",
        "time": "12:30",
        "utc_offset_minutes": "240",
    }
    payload.update(overrides)
    return payload


def test_valid_entry_is_saved_and_associated_with_account(client_with_signed_up_account, db):
    res = client_with_signed_up_account.post("/api/meals", json=valid_payload())
    assert res.status_code == 201
    db.rollback()
    assert db.query(MealEntry).filter_by(calories=650).count() == 1


def test_meal_entry_appears_in_history_listing(client_with_signed_up_account):
    client_with_signed_up_account.post("/api/meals", json=valid_payload())
    res = client_with_signed_up_account.get("/api/meals")
    assert res.status_code == 200
    assert len(res.json()["entries"]) == 1


def test_meal_history_is_scoped_to_the_caller_account(client_with_signed_up_account):
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

    client_a.post("/api/meals", json=valid_payload())
    client_b.post("/api/meals", json=valid_payload())

    res = client_a.get("/api/meals")
    assert len(res.json()["entries"]) == 1


@pytest.mark.parametrize("field", ["calories", "carbs_g", "protein_g", "fat_g"])
def test_negative_value_is_rejected(client_with_signed_up_account, field, db):
    payload = valid_payload(**{field: "-5"})
    res = client_with_signed_up_account.post("/api/meals", json=payload)
    assert res.status_code == 400
    assert field in res.json()["errors"]
    db.rollback()
    assert db.query(MealEntry).count() == 0


def test_all_zero_values_are_accepted(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/meals",
        json=valid_payload(calories="0", carbs_g="0", protein_g="0", fat_g="0"),
    )
    assert res.status_code == 201


def test_future_date_is_rejected(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/meals",
        json=valid_payload(date="2999-01-01"),
    )
    assert res.status_code == 400
    assert "future" in res.json()["errors"]["date"].lower()
    assert "future" in res.json()["errors"]["time"].lower()


def test_very_high_calorie_value_is_accepted(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/meals",
        json=valid_payload(calories="3000000000", carbs_g="500", protein_g="300", fat_g="150"),
    )
    assert res.status_code == 201


def test_mismatched_macros_are_still_saved(client_with_signed_up_account):
    res = client_with_signed_up_account.post(
        "/api/meals",
        json=valid_payload(carbs_g="200", protein_g="150", fat_g="100"),
    )
    assert res.status_code == 201


@pytest.mark.parametrize("field", ["calories", "carbs_g", "protein_g", "fat_g", "date", "time"])
def test_omitting_any_required_field_is_rejected(client_with_signed_up_account, field, db):
    payload = valid_payload(**{field: ""})
    res = client_with_signed_up_account.post("/api/meals", json=payload)
    assert res.status_code == 400
    assert field in res.json()["errors"]
    db.rollback()
    assert db.query(MealEntry).count() == 0


def test_whole_number_values_are_saved_as_integers(client_with_signed_up_account, db):
    client_with_signed_up_account.post("/api/meals", json=valid_payload())
    db.rollback()
    entry = db.query(MealEntry).one()
    assert entry.calories == 650
    assert entry.carbs_g == 80
    assert entry.protein_g == 35
    assert entry.fat_g == 20


@pytest.mark.parametrize("field", ["calories", "carbs_g", "protein_g", "fat_g"])
def test_decimal_value_is_rejected(client_with_signed_up_account, field):
    payload = valid_payload(**{field: "35.25"})
    res = client_with_signed_up_account.post("/api/meals", json=payload)
    assert res.status_code == 400
    assert "whole number" in res.json()["errors"][field].lower()


def test_unauthenticated_submit_is_rejected_and_nothing_saved(db):
    client = TestClient(app)
    res = client.post("/api/meals", json=valid_payload())
    assert res.status_code == 401
    db.rollback()
    assert db.query(MealEntry).count() == 0


def test_food_name_and_quantity_are_saved_and_returned_when_captured(
    client_with_signed_up_account,
):
    client = client_with_signed_up_account
    client.post(
        "/api/meals",
        json=valid_payload(food_name="Grilled chicken & rice bowl", quantity="1 bowl"),
    )
    res = client.get("/api/meals")
    entry = res.json()["entries"][0]
    assert entry["food_name"] == "Grilled chicken & rice bowl"
    assert entry["quantity"] == "1 bowl"


def test_food_name_and_quantity_are_null_when_not_captured(client_with_signed_up_account):
    client = client_with_signed_up_account
    client.post("/api/meals", json=valid_payload())
    res = client.get("/api/meals")
    entry = res.json()["entries"][0]
    assert entry["food_name"] is None
    assert entry["quantity"] is None


def test_limit_paginates_and_reports_has_more(client_with_signed_up_account):
    client = client_with_signed_up_account
    client.post("/api/meals", json=valid_payload(calories="1"))
    client.post("/api/meals", json=valid_payload(calories="2"))
    client.post("/api/meals", json=valid_payload(calories="3"))

    first_page = client.get("/api/meals", params={"limit": 2})
    assert first_page.status_code == 200
    body = first_page.json()
    assert [e["calories"] for e in body["entries"]] == [3, 2]
    assert body["has_more"] is True

    second_page = client.get("/api/meals", params={"limit": 2, "offset": 2})
    body = second_page.json()
    assert [e["calories"] for e in body["entries"]] == [1]
    assert body["has_more"] is False


def test_exactly_25_entries_fit_on_a_single_page(client_with_signed_up_account):
    client = client_with_signed_up_account
    for i in range(25):
        client.post(
            "/api/meals",
            json=valid_payload(calories=str(i), date=f"2026-01-{i + 1:02d}"),
        )

    res = client.get("/api/meals", params={"limit": 25, "offset": 0})
    body = res.json()
    assert len(body["entries"]) == 25
    assert body["has_more"] is False
    assert body["total_count"] == 25


def test_26_entries_puts_the_remaining_one_on_a_second_page(client_with_signed_up_account):
    client = client_with_signed_up_account
    for i in range(26):
        client.post(
            "/api/meals",
            json=valid_payload(calories=str(i), date=f"2026-01-{i + 1:02d}"),
        )

    first = client.get("/api/meals", params={"limit": 25, "offset": 0}).json()
    assert len(first["entries"]) == 25
    assert first["has_more"] is True
    assert first["total_count"] == 26
    assert first["entries"][0]["calories"] == 25

    second = client.get("/api/meals", params={"limit": 25, "offset": 25}).json()
    assert len(second["entries"]) == 1
    assert second["has_more"] is False
    assert second["total_count"] == 26
    assert second["entries"][0]["calories"] == 0


def test_total_count_is_scoped_to_the_caller_account(client_with_signed_up_account):
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

    client_a.post("/api/meals", json=valid_payload())
    client_b.post("/api/meals", json=valid_payload())
    client_b.post("/api/meals", json=valid_payload())

    assert client_a.get("/api/meals").json()["total_count"] == 1


@pytest.mark.parametrize("limit", [0, 101])
def test_invalid_limit_is_rejected(client_with_signed_up_account, limit):
    res = client_with_signed_up_account.get("/api/meals", params={"limit": limit})
    assert res.status_code == 422


def test_account_with_meal_entries_can_be_deleted(client_with_signed_up_account, db):
    client_with_signed_up_account.post("/api/meals", json=valid_payload())
    res = client_with_signed_up_account.post(
        "/api/account/delete", json={"password": "test-password"}
    )
    assert res.status_code == 200
