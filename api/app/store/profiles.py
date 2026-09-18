import re

from sqlalchemy.orm import Session

from app.store.models import Account

ALLOWED_UNITS = {"metric", "imperial"}
ALLOWED_GOALS = {"lose_weight", "build_muscle", "improve_endurance", "general_fitness"}
ALLOWED_GENDERS = {"woman", "man", "non_binary", "prefer_not_to_say"}
DISPLAY_NAME_MAX_LENGTH = 50
DISPLAY_NAME_PATTERN = re.compile(r"^[A-Za-z0-9 .,'\-]+$")


def serialize_profile(account: Account) -> dict:
    return {
        "display_name": account.display_name,
        "units_preference": account.units_preference,
        "fitness_goal": account.fitness_goal,
        "height_cm": account.height_cm,
        "weight_kg": account.weight_kg,
        "age": account.age,
        "gender": account.gender,
    }


def update_profile(db: Session, account: Account, updates: dict) -> Account:
    for key, value in updates.items():
        setattr(account, key, value)
    db.commit()
    db.refresh(account)
    return account
