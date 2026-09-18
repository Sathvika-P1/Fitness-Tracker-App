import datetime

MAX_ATTEMPTS = 5
LOCKOUT_WINDOW = datetime.timedelta(minutes=15)
MAX_TRACKED_ACCOUNTS = 10_000

_failures: dict[int, list[datetime.datetime]] = {}


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _recent_failures(account_id: int) -> list[datetime.datetime]:
    cutoff = _utcnow() - LOCKOUT_WINDOW
    recent = [ts for ts in _failures.get(account_id, []) if ts > cutoff]
    if recent:
        _failures[account_id] = recent
    else:
        _failures.pop(account_id, None)
    return recent


def record_failure(account_id: int) -> None:
    _failures.setdefault(account_id, []).append(_utcnow())
    if len(_failures) > MAX_TRACKED_ACCOUNTS:
        oldest_account_id = min(
            _failures, key=lambda tracked_id: _failures[tracked_id][-1]
        )
        _failures.pop(oldest_account_id, None)


def is_locked(account_id: int) -> bool:
    return len(_recent_failures(account_id)) >= MAX_ATTEMPTS


def reset(account_id: int) -> None:
    _failures.pop(account_id, None)
