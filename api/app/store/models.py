import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String

from app.db import Base


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    display_name = Column(String(255), nullable=False)
    units_preference = Column(String(16), nullable=True)
    fitness_goal = Column(String(32), nullable=True)
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)
    age = Column(Integer, nullable=True)
    gender = Column(String(32), nullable=True)


class SessionRow(Base):
    __tablename__ = "sessions"

    id = Column(String(64), primary_key=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
    expires_at = Column(DateTime, nullable=False)


class AccountDeletionAudit(Base):
    __tablename__ = "account_deletion_audits"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_reference = Column(String(64), nullable=False)
    deleted_at = Column(DateTime, nullable=False, default=_utcnow)


class DeletionLockoutFailure(Base):
    __tablename__ = "deletion_lockout_failures"

    id = Column(Integer, primary_key=True, autoincrement=True)
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=_utcnow)
