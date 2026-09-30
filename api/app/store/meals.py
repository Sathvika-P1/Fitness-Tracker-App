import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.store.models import Account, MealEntry
from app.store.workouts import MAX_PAGE_SIZE, _present, paginate, parse_date_or_none

FUTURE_DATETIME_MESSAGE = (
    "This meal's date and time are in the future — choose the actual date and "
    "time it was eaten."
)


def _validate_amount(raw: str | None, label: str) -> tuple[int | None, str | None]:
    if not _present(raw):
        return None, f"{label} is required."
    value = raw.strip()
    if "." in value:
        return None, f"{label} must be a whole number — decimals aren't allowed."
    try:
        parsed = int(value)
    except ValueError:
        return None, f"{label} must be a whole number — decimals aren't allowed."
    if parsed < 0:
        return None, f"{label} can't be negative."
    return parsed, None


def validate_entry(
    calories_str: str | None,
    carbs_str: str | None,
    protein_str: str | None,
    fat_str: str | None,
    date_str: str | None,
    time_str: str | None,
    utc_offset_minutes_str: str | None,
    now_utc: datetime.datetime,
) -> tuple[dict, dict]:
    errors: dict[str, str] = {}
    cleaned: dict = {}

    for field, raw, label in [
        ("calories", calories_str, "Calories"),
        ("carbs_g", carbs_str, "Carbs"),
        ("protein_g", protein_str, "Protein"),
        ("fat_g", fat_str, "Fat"),
    ]:
        value, error = _validate_amount(raw, label)
        if error:
            errors[field] = error
        else:
            cleaned[field] = value

    parsed_date: datetime.date | None = None
    if not _present(date_str):
        errors["date"] = "Date is required."
    else:
        parsed_date, date_error = parse_date_or_none(date_str)
        if date_error:
            errors["date"] = date_error

    parsed_time: datetime.time | None = None
    if not _present(time_str):
        errors["time"] = "Time is required."
    else:
        try:
            parsed_time = datetime.time.fromisoformat(time_str.strip())
        except ValueError:
            errors["time"] = "Enter a valid time."

    offset_minutes = 0
    if _present(utc_offset_minutes_str):
        try:
            offset_minutes = int(utc_offset_minutes_str.strip())
        except ValueError:
            errors["time"] = "Enter a valid time."

    if parsed_date is not None and parsed_time is not None and "time" not in errors:
        try:
            eaten_at_utc = datetime.datetime.combine(parsed_date, parsed_time) + (
                datetime.timedelta(minutes=offset_minutes)
            )
        except OverflowError:
            errors["time"] = "Enter a valid time."
        else:
            if eaten_at_utc > now_utc:
                errors["date"] = FUTURE_DATETIME_MESSAGE
                errors["time"] = FUTURE_DATETIME_MESSAGE
            else:
                cleaned["eaten_at_utc"] = eaten_at_utc

    return cleaned, errors


def create_entry(db: Session, account: Account, cleaned: dict) -> MealEntry:
    entry = MealEntry(
        account_id=account.id,
        calories=cleaned["calories"],
        carbs_g=cleaned["carbs_g"],
        protein_g=cleaned["protein_g"],
        fat_g=cleaned["fat_g"],
        eaten_at_utc=cleaned["eaten_at_utc"],
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_entries(
    db: Session,
    account: Account,
    limit: int = MAX_PAGE_SIZE,
    offset: int = 0,
) -> tuple[list[MealEntry], bool]:
    stmt = (
        select(MealEntry)
        .where(MealEntry.account_id == account.id)
        .order_by(MealEntry.eaten_at_utc.desc(), MealEntry.id.desc())
    )
    return paginate(db, stmt, limit, offset)


def count_entries(db: Session, account: Account) -> int:
    stmt = select(func.count()).select_from(MealEntry).where(MealEntry.account_id == account.id)
    return db.scalar(stmt) or 0
