import datetime

MAX_ATTEMPTS = 5
LOCKOUT_WINDOW = datetime.timedelta(minutes=15)

_failures: dict[int, list[datetime.datetime]] = {}


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _recent_failures(account_id: int) -> list[datetime.datetime]:
    cutoff = _utcnow() - LOCKOUT_WINDOW
    recent = [ts for ts in _failures.get(account_id, []) if ts > cutoff]
    _failures[account_id] = recent
    return recent


def record_failure(account_id: int) -> None:
    _failures.setdefault(account_id, []).append(_utcnow())


def is_locked(account_id: int) -> bool:
    return len(_recent_failures(account_id)) >= MAX_ATTEMPTS


def reset(account_id: int) -> None:
    _failures.pop(account_id, None)
