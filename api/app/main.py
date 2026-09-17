from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import inspect, text

from app.db import Base, engine
from app.routes.auth import router as auth_router


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    _backfill_session_ttl_columns()
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)
