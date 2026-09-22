import datetime

from sqlalchemy import distinct, select
from sqlalchemy.orm import Session

from app.store.models import Account, WorkoutEntry


def _present(raw: str | None) -> bool:
    return raw is not None and raw.strip() != ""


def validate_entry(
    exercise_name: str | None,
    entry_date_str: str | None,
    duration_str: str | None,
    sets_str: str | None,
    reps_str: str | None,
    today: datetime.date,
) -> tuple[dict, dict]:
    errors: dict[str, str] = {}
    cleaned: dict = {}

    if not _present(exercise_name):
        errors["exercise_name"] = "Exercise name is required."
    else:
        cleaned["exercise_name"] = exercise_name.strip()

    if not _present(entry_date_str):
        errors["entry_date"] = "Date is required."
    else:
        try:
            entry_date = datetime.date.fromisoformat(entry_date_str.strip())
        except ValueError:
            errors["entry_date"] = "Enter a valid date."
        else:
            if entry_date > today:
                errors["entry_date"] = (
                    "Future dates aren't allowed — choose today or an earlier date."
                )
            else:
                cleaned["entry_date"] = entry_date

    duration_present = _present(duration_str)
    sets_present = _present(sets_str)
    reps_present = _present(reps_str)

    if duration_present:
        try:
            duration = float(duration_str.strip())
        except ValueError:
            errors["duration_minutes"] = "Duration must be a number."
        else:
            if duration <= 0:
                errors["duration_minutes"] = "Duration must be greater than zero."
            else:
                cleaned["duration_minutes"] = duration
    else:
        cleaned["duration_minutes"] = None

    if sets_present:
        try:
            sets = int(sets_str.strip())
        except ValueError:
            errors["sets"] = "Sets must be a whole number."
        else:
            if sets < 0:
                errors["sets"] = "Sets can't be negative."
            else:
                cleaned["sets"] = sets
    else:
        cleaned["sets"] = None

    if reps_present:
        try:
            reps = int(reps_str.strip())
        except ValueError:
            errors["reps"] = "Reps must be a whole number."
        else:
            if reps < 0:
                errors["reps"] = "Reps can't be negative."
            else:
                cleaned["reps"] = reps
    else:
        cleaned["reps"] = None

    if not duration_present and not sets_present and not reps_present:
        errors["entry"] = (
            "Enter a duration, or sets and reps — at least one is required."
        )

    return cleaned, errors


def create_entry(db: Session, account: Account, cleaned: dict) -> WorkoutEntry:
    entry = WorkoutEntry(
        account_id=account.id,
        exercise_name=cleaned["exercise_name"],
        entry_date=cleaned["entry_date"],
        duration_minutes=cleaned.get("duration_minutes"),
        sets=cleaned.get("sets"),
        reps=cleaned.get("reps"),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def list_exercise_names(db: Session, account: Account) -> list[str]:
    rows = db.execute(
        select(distinct(WorkoutEntry.exercise_name))
        .where(WorkoutEntry.account_id == account.id)
        .order_by(WorkoutEntry.exercise_name)
    ).scalars()
    return list(rows)
