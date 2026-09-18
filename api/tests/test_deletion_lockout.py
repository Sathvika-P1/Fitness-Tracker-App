from app.store import accounts, deletion_lockout


def _make_account(db, email):
    return accounts.create_account(db, email, "test-password", "Test User")


def test_locks_after_max_attempts_and_resets(db):
    account_id = _make_account(db, "lockout-a@example.com").id

    for _ in range(deletion_lockout.MAX_ATTEMPTS - 1):
        deletion_lockout.record_failure(db, account_id)
        assert not deletion_lockout.is_locked(db, account_id)

    deletion_lockout.record_failure(db, account_id)
    assert deletion_lockout.is_locked(db, account_id)
    assert deletion_lockout.remaining_attempts(db, account_id) == 0

    deletion_lockout.reset(db, account_id)
    assert not deletion_lockout.is_locked(db, account_id)
    assert deletion_lockout.remaining_attempts(db, account_id) == deletion_lockout.MAX_ATTEMPTS


def test_failures_are_scoped_per_account(db):
    account_id_1 = _make_account(db, "lockout-b@example.com").id
    account_id_2 = _make_account(db, "lockout-c@example.com").id

    deletion_lockout.record_failure(db, account_id_1)
    deletion_lockout.record_failure(db, account_id_1)

    assert deletion_lockout.remaining_attempts(db, account_id_1) == deletion_lockout.MAX_ATTEMPTS - 2
    assert deletion_lockout.remaining_attempts(db, account_id_2) == deletion_lockout.MAX_ATTEMPTS


def test_failures_expire_outside_the_lockout_window(db, monkeypatch):
    account_id = _make_account(db, "lockout-d@example.com").id

    for _ in range(deletion_lockout.MAX_ATTEMPTS):
        deletion_lockout.record_failure(db, account_id)
    assert deletion_lockout.is_locked(db, account_id)

    real_utcnow = deletion_lockout._utcnow
    monkeypatch.setattr(
        deletion_lockout,
        "_utcnow",
        lambda: real_utcnow() + deletion_lockout.LOCKOUT_WINDOW * 2,
    )

    assert not deletion_lockout.is_locked(db, account_id)
