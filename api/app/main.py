from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import inspect, text

from app.db import Base, engine
from app.routes.account import router as account_router
from app.routes.auth import router as auth_router
from app.routes.profile import router as profile_router


def _backfill_session_ttl_columns() -> None:
    inspector = inspect(engine)
    if "sessions" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("sessions")}
    with engine.begin() as connection:
        if "created_at" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE sessions ADD COLUMN created_at DATETIME NOT NULL "
                    "DEFAULT CURRENT_TIMESTAMP"
                )
            )
        if "expires_at" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE sessions ADD COLUMN expires_at DATETIME NOT NULL "
                    "DEFAULT CURRENT_TIMESTAMP"
                )
            )


def _backfill_profile_columns() -> None:
    inspector = inspect(engine)
    if "accounts" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("accounts")}
    additions = {
        "units_preference": "VARCHAR(16)",
        "fitness_goal": "VARCHAR(32)",
        "height_cm": "FLOAT",
        "weight_kg": "FLOAT",
        "age": "INTEGER",
        "gender": "VARCHAR(32)",
    }
    with engine.begin() as connection:
        for name, sql_type in additions.items():
            if name not in columns:
                connection.execute(
                    text(f"ALTER TABLE accounts ADD COLUMN {name} {sql_type} NULL")
                )


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    _backfill_session_ttl_columns()
    _backfill_profile_columns()
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(account_router)
