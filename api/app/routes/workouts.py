import datetime

from fastapi import APIRouter, Cookie, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.store import sessions, workouts
from app.store.models import Account

router = APIRouter()


class WorkoutEntryRequest(BaseModel):
    exercise_name: str | None = None
    entry_date: str | None = None
    duration_minutes: str | None = None
    sets: str | None = None
    reps: str | None = None


def _require_account(db: Session, sid: str | None) -> Account | None:
    account_id = sessions.get_account_id_for_session(db, sid) if sid else None
    if account_id is None:
        return None
    return db.get(Account, account_id)


@router.post("/api/workouts")
def create_workout(
    payload: WorkoutEntryRequest,
    db: Session = Depends(get_db),
    sid: str | None = Cookie(default=None),
):
    account = _require_account(db, sid)
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


@router.get("/api/workouts/exercise-names")
def get_exercise_names(
    db: Session = Depends(get_db), sid: str | None = Cookie(default=None)
):
    account = _require_account(db, sid)
    if account is None:
        return JSONResponse(status_code=401, content={"message": "Not signed in."})
    return {"names": workouts.list_exercise_names(db, account)}
