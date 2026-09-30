import datetime

from app.store import meals


def _base_args(**overrides):
    args = {
        "calories_str": "500",
        "carbs_str": "60",
        "protein_str": "25",
        "fat_str": "15",
        "date_str": "2026-09-30",
        "time_str": "12:00",
        "utc_offset_minutes_str": "0",
    }
    args.update(overrides)
    return args


def test_future_time_on_todays_date_is_rejected():
    now_utc = datetime.datetime(2026, 9, 30, 12, 0)
    cleaned, errors = meals.validate_entry(
        **_base_args(time_str="12:01"), now_utc=now_utc
    )
    assert "date" in errors and "time" in errors


def test_time_just_before_now_on_todays_date_is_accepted():
    now_utc = datetime.datetime(2026, 9, 30, 12, 0)
    cleaned, errors = meals.validate_entry(
        **_base_args(time_str="11:59"), now_utc=now_utc
    )
    assert errors == {}
    assert cleaned["eaten_at_utc"] == datetime.datetime(2026, 9, 30, 11, 59)


def test_utc_offset_pushes_local_time_into_the_future_and_is_rejected():
    now_utc = datetime.datetime(2026, 9, 30, 12, 0)
    cleaned, errors = meals.validate_entry(
        **_base_args(time_str="09:00", utc_offset_minutes_str="240"), now_utc=now_utc
    )
    assert "date" in errors and "time" in errors
