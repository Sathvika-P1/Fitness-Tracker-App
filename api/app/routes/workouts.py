import datetime
import logging
import time

from fastapi import APIRouter, Cookie, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.store import sessions, workouts

logger = logging.getLogger(__name__)

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
    limit: int = Query(default=workouts.MAX_PAGE_SIZE, ge=1, le=workouts.MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    sid: str | None = Cookie(default=None),
):
    start = time.monotonic()
    account = sessions.require_account(db, sid)
    if account is None:
        logger.warning(
            "workouts_list_unauthorized duration_ms=%.1f", (time.monotonic() - start) * 1000
        )
        return JSONResponse(status_code=401, content={"message": "Not signed in."})

    errors: dict[str, str] = {}
    parsed_start, start_error = workouts.parse_date_or_none(start_date)
    if start_error:
        errors["start_date"] = start_error
    parsed_end, end_error = workouts.parse_date_or_none(end_date)
    if end_error:
        errors["end_date"] = end_error
    if errors:
        logger.warning(
            "workouts_list_validation_error fields=%s duration_ms=%.1f",
            list(errors),
            (time.monotonic() - start) * 1000,
        )
        return JSONResponse(status_code=400, content={"errors": errors})

    entries, has_more = workouts.list_entries(
        db,
        account,
        start_date=parsed_start,
        end_date=parsed_end,
        name_contains=exercise_name,
        limit=limit,
        offset=offset,
    )
    logger.info(
        "workouts_list account_id=%s has_date_filter=%s has_name_filter=%s "
        "count=%s has_more=%s duration_ms=%.1f",
        account.id,
        bool(parsed_start or parsed_end),
        bool(exercise_name),
        len(entries),
        has_more,
        (time.monotonic() - start) * 1000,
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
        ],
        "has_more": has_more,
    }


@router.get("/api/workouts/exercise-names")
def get_exercise_names(
    db: Session = Depends(get_db), sid: str | None = Cookie(default=None)
):
    account = sessions.require_account(db, sid)
    if account is None:
        return JSONResponse(status_code=401, content={"message": "Not signed in."})
    return {"names": workouts.list_exercise_names(db, account)}
