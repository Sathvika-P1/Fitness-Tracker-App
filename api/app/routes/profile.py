import logging
import math

from fastapi import APIRouter, Cookie, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.store import profiles, sessions
from app.store.models import Account

logger = logging.getLogger(__name__)

router = APIRouter()


class ProfileUpdateRequest(BaseModel):
    display_name: str | None = None
    units_preference: str | None = None
    fitness_goal: str | None = None
    height_cm: str | None = None
    weight_kg: str | None = None
    age: str | None = None
    gender: str | None = None


def _require_account(db: Session, sid: str | None) -> Account | None:
    account_id = sessions.get_account_id_for_session(db, sid) if sid else None
    if account_id is None:
        return None
    return db.get(Account, account_id)


def _validate_range(field_label: str, raw: str, minimum: float, maximum: float, unit: str, integer: bool):
    try:
        value = int(raw.strip()) if integer else float(raw.strip())
    except ValueError:
        return None, f"{field_label} must be a number."
    if not math.isfinite(value):
        return None, f"{field_label} must be a number."
    if value < minimum or value > maximum:
        suffix = f" {unit}" if unit else ""
        return None, f"{field_label} must be between {int(minimum)} and {int(maximum)}{suffix}."
    return value, None


@router.get("/api/profile")
def get_profile(db: Session = Depends(get_db), sid: str | None = Cookie(default=None)):
    account = _require_account(db, sid)
    if account is None:
        return JSONResponse(status_code=401, content={"message": "Not signed in."})
    return profiles.serialize_profile(account)


@router.post("/api/profile")
def update_profile(
    payload: ProfileUpdateRequest,
    db: Session = Depends(get_db),
    sid: str | None = Cookie(default=None),
):
    account = _require_account(db, sid)
    if account is None:
        return JSONResponse(status_code=401, content={"message": "Not signed in."})

    errors: dict[str, str] = {}
    updates: dict = {}

    if payload.display_name is not None:
        name = payload.display_name.strip()
        if not name or len(name) > profiles.DISPLAY_NAME_MAX_LENGTH:
            errors["display_name"] = "Display name must be 50 characters or fewer."
        elif not profiles.is_valid_display_name(name):
            errors["display_name"] = (
                "Display name can only contain letters, numbers, spaces, and basic "
                "punctuation (. , ' -)."
            )
        else:
            updates["display_name"] = name

    if payload.units_preference is not None:
        if payload.units_preference not in profiles.ALLOWED_UNITS:
            errors["units_preference"] = "Select a valid units preference from the list."
        else:
            updates["units_preference"] = payload.units_preference

    if payload.fitness_goal is not None:
        if payload.fitness_goal not in profiles.ALLOWED_GOALS:
            errors["fitness_goal"] = "Select a valid fitness goal from the list."
        else:
            updates["fitness_goal"] = payload.fitness_goal

    if payload.height_cm is not None:
        value, error = _validate_range("Height", payload.height_cm, 1, 300, "cm", integer=False)
        if error:
            errors["height_cm"] = error
        else:
            updates["height_cm"] = value

    if payload.weight_kg is not None:
        value, error = _validate_range("Weight", payload.weight_kg, 1, 500, "kg", integer=False)
        if error:
            errors["weight_kg"] = error
        else:
            updates["weight_kg"] = value

    if payload.age is not None:
        value, error = _validate_range("Age", payload.age, 1, 120, "", integer=True)
        if error:
            errors["age"] = error
        else:
            updates["age"] = value

    if payload.gender is not None:
        if payload.gender not in profiles.ALLOWED_GENDERS:
            errors["gender"] = "Select a valid gender option from the list."
        else:
            updates["gender"] = payload.gender

    if errors:
        logger.warning("profile_validation_error fields=%s", list(errors))
        return JSONResponse(status_code=400, content={"errors": errors})

    updated = profiles.update_profile(db, account, updates)
    logger.info("profile_updated account_id=%s", account.id)
    return profiles.serialize_profile(updated)
