from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import Base, engine
from app.routes.auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(engine)
    yield


app = FastAPI(lifespan=lifespan)
app.include_router(auth_router)
