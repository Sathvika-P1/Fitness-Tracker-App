import datetime

from fastapi import APIRouter, Cookie, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.store import sessions, workouts

router = APIRouter()


class WorkoutEntryRequest(BaseModel):
    exercise_name: str | None = None
    entry_date: str | None = None
    duration_minutes: str | None = None
    sets: str | None = None
    reps: str | None = None


@router.post("/api/workouts")
def create_workout(
    payload: WorkoutEntryRequest,
    db: Session = Depends(get_db),
    sid: str | None = Cookie(default=None),
):
    account = sessions.require_account(db, sid)
    if account is None:
        return JSONResponse(status_code=401, content={"message": "Not signed in."})

    cleaned, errors = workouts.validate_entry(
        payload.exercise_name,
        payload.entry_date,
        payload.duration_minutes,
        payload.sets,
        payload.reps,
        datetime.date.today(),
    )
    if errors:
        return JSONResponse(status_code=400, content={"errors": errors})

    entry = workouts.create_entry(db, account, cleaned)
    return JSONResponse(
        status_code=201,
        content={"id": entry.id, "exercise_name": entry.exercise_name},
    )


@router.get("/api/workouts")
def list_workouts(
    start_date: str | None = None,
    end_date: str | None = None,
    exercise_name: str | None = None,
    db: Session = Depends(get_db),
    sid: str | None = Cookie(default=None),
):
    account = sessions.require_account(db, sid)
    if account is None:
        return JSONResponse(status_code=401, content={"message": "Not signed in."})

    errors: dict[str, str] = {}
    parsed_start, start_error = workouts.parse_date_or_none(start_date)
    if start_error:
        errors["start_date"] = start_error
    parsed_end, end_error = workouts.parse_date_or_none(end_date)
    if end_error:
        errors["end_date"] = end_error
    if errors:
        return JSONResponse(status_code=400, content={"errors": errors})

    entries = workouts.list_entries(
        db,
        account,
        start_date=parsed_start,
        end_date=parsed_end,
        name_contains=exercise_name,
    )
    return {
        "entries": [
            {
                "id": e.id,
                "exercise_name": e.exercise_name,
                "entry_date": e.entry_date.isoformat(),
                "duration_minutes": e.duration_minutes,
                "sets": e.sets,
                "reps": e.reps,
            }
            for e in entries
        ]
    }


@router.get("/api/workouts/exercise-names")
def get_exercise_names(
    db: Session = Depends(get_db), sid: str | None = Cookie(default=None)
):
    account = sessions.require_account(db, sid)
    if account is None:
        return JSONResponse(status_code=401, content={"message": "Not signed in."})
    return {"names": workouts.list_exercise_names(db, account)}
