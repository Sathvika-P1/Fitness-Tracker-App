import datetime

from fastapi import APIRouter, Cookie, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.store import meals, sessions

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
    account = sessions.require_account(db, sid)
    if account is None:
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
        return JSONResponse(status_code=400, content={"errors": errors})

    entry = meals.create_entry(db, account, cleaned)
    return JSONResponse(status_code=201, content=_serialize(entry))


@router.get("/api/meals")
def list_meals(
    db: Session = Depends(get_db),
    sid: str | None = Cookie(default=None),
):
    account = sessions.require_account(db, sid)
    if account is None:
        return JSONResponse(status_code=401, content={"message": "Not signed in."})

    entries = meals.list_entries(db, account)
    return {"entries": [_serialize(entry) for entry in entries]}
