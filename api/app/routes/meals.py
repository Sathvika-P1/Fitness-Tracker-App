import datetime
import logging
import time

from fastapi import APIRouter, Cookie, Depends, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.store import meals, sessions

logger = logging.getLogger(__name__)

router = APIRouter()


class MealEntryRequest(BaseModel):
    calories: str | None = None
    carbs_g: str | None = None
    protein_g: str | None = None
    fat_g: str | None = None
    date: str | None = None
    time: str | None = None
    utc_offset_minutes: str | None = None


def _serialize(entry) -> dict:
    return {
        "id": entry.id,
        "calories": entry.calories,
        "carbs_g": entry.carbs_g,
        "protein_g": entry.protein_g,
        "fat_g": entry.fat_g,
        "eaten_at_utc": entry.eaten_at_utc.isoformat() + "Z",
    }


@router.post("/api/meals")
def create_meal(
    payload: MealEntryRequest,
    db: Session = Depends(get_db),
    sid: str | None = Cookie(default=None),
):
    start = time.monotonic()
    account = sessions.require_account(db, sid)
    if account is None:
        logger.warning(
            "meal_create_unauthorized duration_ms=%.1f", (time.monotonic() - start) * 1000
        )
        return JSONResponse(status_code=401, content={"message": "Not signed in."})

    cleaned, errors = meals.validate_entry(
        payload.calories,
        payload.carbs_g,
        payload.protein_g,
        payload.fat_g,
        payload.date,
        payload.time,
        payload.utc_offset_minutes,
        datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
    )
    if errors:
        logger.warning(
            "meal_create_validation_error account_id=%s fields=%s duration_ms=%.1f",
            account.id,
            list(errors),
            (time.monotonic() - start) * 1000,
        )
        return JSONResponse(status_code=400, content={"errors": errors})

    entry = meals.create_entry(db, account, cleaned)
    logger.info(
        "meal_create account_id=%s entry_id=%s duration_ms=%.1f",
        account.id,
        entry.id,
        (time.monotonic() - start) * 1000,
    )
    return JSONResponse(status_code=201, content=_serialize(entry))


@router.get("/api/meals")
def list_meals(
    limit: int = Query(default=meals.MAX_PAGE_SIZE, ge=1, le=meals.MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    sid: str | None = Cookie(default=None),
):
    start = time.monotonic()
    account = sessions.require_account(db, sid)
    if account is None:
        logger.warning(
            "meals_list_unauthorized duration_ms=%.1f", (time.monotonic() - start) * 1000
        )
        return JSONResponse(status_code=401, content={"message": "Not signed in."})

    entries, has_more = meals.list_entries(db, account, limit=limit, offset=offset)
    total_count = meals.count_entries(db, account)
    logger.info(
        "meals_list account_id=%s count=%s has_more=%s duration_ms=%.1f",
        account.id,
        len(entries),
        has_more,
        (time.monotonic() - start) * 1000,
    )
    return {
        "entries": [_serialize(entry) for entry in entries],
        "has_more": has_more,
        "total_count": total_count,
    }
