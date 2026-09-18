from app.store import deletion_lockout


def teardown_function():
    deletion_lockout._failures.clear()


def test_tracked_accounts_are_capped_to_bound_memory_growth():
    for account_id in range(deletion_lockout.MAX_TRACKED_ACCOUNTS + 10):
        deletion_lockout.record_failure(account_id)

    assert len(deletion_lockout._failures) <= deletion_lockout.MAX_TRACKED_ACCOUNTS
