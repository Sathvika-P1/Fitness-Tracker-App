summary: |
  Implement permanent, password-confirmed account deletion end to end: a new backend
  DELETE-style endpoint that verifies the caller's current password, applies a
  deletion-specific attempt-lockout policy, hard-deletes the account row and every
  session row for that account (invalidating all devices), writes a minimal anonymized
  audit record, and responds idempotently to repeat requests; plus a new
  "Account settings" frontend page reached from Profile that implements the four
  approved prototype screens (danger zone entry, password confirmation with consequence
  list, in-progress/lockout states, and the deletion-complete screen). The codebase today
  has no workout-log/achievement/post tables and no login lockout policy, so this plan
  narrows AC1 and AC5 to what actually exists (see assumptions_or_open_questions) rather
  than inventing schema or touching unrelated login behavior.

scope:
  - description: |
      Add `delete_account(db, account) -> None` to `api/app/store/accounts.py`. It deletes
      all `SessionRow` rows for the account, then deletes the `Account` row, in one
      transaction (mirrors the commit/rollback pattern already used by
      `update_profile` in `api/app/store/profiles.py`).
    files:
      - api/app/store/accounts.py
    rationale: |
      AC1/AC4 require credentials, profile, and every active session (all devices) to be
      erased immediately. There are no workout-log/achievement/post tables in
      `api/app/store/models.py` today, so "user-generated content" erasure is limited to
      what exists: the `Account` row and its `SessionRow`s.

  - description: |
      Add a `DeletionAttempt` model (or reuse a small in-memory-safe DB table) to track
      failed password-confirmation attempts per account for the deletion lockout, and an
      `AccountDeletionAudit` model for the AC7 compliance record. Add both to
      `api/app/store/models.py`:
      `class DeletionLockout(Base): __tablename__ = "deletion_lockouts"` with
      `account_id` (PK/FK), `failed_attempts` (Integer), `locked_until` (DateTime,
      nullable) — and `class DeletionAudit(Base): __tablename__ = "deletion_audits"`
      with `id` (PK), `account_reference` (String, a one-way hash, not the raw account
      id or email), `deleted_at` (DateTime). Add backfill helper
      `_create_deletion_tables()` (mirrors `_backfill_profile_columns` style — uses
      `inspector.get_table_names()` / `Base.metadata.create_all`, no Alembic) called
      from `api/app/main.py`'s lifespan.
    files:
      - api/app/store/models.py
      - api/app/main.py
    rationale: |
      AC5 requires a lockout policy on deletion confirmation; AC7 requires a minimal
      non-identifying audit trail that must outlive the deleted account row itself, so
      it cannot live on the `Account` row.

  - description: |
      Add `api/app/store/deletion_lockout.py` with `record_failure(db, account_id) ->
      int` (returns remaining attempts, raises/flags lockout at 5), `is_locked(db,
      account_id) -> bool`, and `reset(db, account_id) -> None` called on successful
      deletion or successful password match. Constants: `MAX_ATTEMPTS = 5`,
      `LOCKOUT_DURATION = datetime.timedelta(minutes=15)` — these numbers are taken
      verbatim from the approved prototype's `.lockout-banner` copy ("locked after 5
      incorrect password attempts... Try again in 15 minutes") since no existing
      platform lockout policy exists in code to reuse (see
      assumptions_or_open_questions).
    files:
      - api/app/store/deletion_lockout.py
    rationale: |
      Encapsulates the AC5 policy separately from the route so it's independently
      testable and doesn't entangle with `/api/login`, which intentionally keeps its
      current no-lockout behavior (`api/tests/test_login.py` already asserts this and
      must keep passing).

  - description: |
      Add `api/app/store/deletion_audit.py` with `record_deletion(db, account_id) ->
      None` that computes a one-way, non-reversible reference (e.g.
      `hashlib.sha256(f"account:{account_id}".encode()).hexdigest()`) and inserts a
      `DeletionAudit` row with that reference and the current UTC timestamp — called
      inside the same deletion transaction before the `Account` row is removed.
    files:
      - api/app/store/deletion_audit.py
    rationale: |
      AC7: a minimal, non-identifying audit entry (anonymized reference + timestamp)
      must be retained for compliance after the account itself is gone.

  - description: |
      Add `api/app/routes/account.py` with `POST /api/account/delete` (a POST is used
      because FastAPI test clients and browsers handle bodies more predictably on
      DELETE-adjacent destructive actions than a bodied `DELETE`, and the existing
      codebase already models mutations as `POST` for `/api/login`, `/api/logout`,
      `/api/profile`). Request body: `class DeleteAccountRequest(BaseModel): password:
      str = ""`. Flow: resolve account via `_require_account`-equivalent (copy the
      helper pattern from `api/app/routes/profile.py:29`) → if no session, 401 → if
      `deletion_lockout.is_locked(db, account.id)`, return 429 with
      `{"message": "Too many incorrect attempts. Try again in 15 minutes."}` → verify
      password via `accounts.verify_credentials` (re-fetch by email since it hashes
      against `password_hash`) → on mismatch, `deletion_lockout.record_failure`, return
      401 with `{"message": "Incorrect password. Your account has not been changed."}`
      → on match, `deletion_audit.record_deletion`, then `accounts.delete_account`
      (cascades to sessions), then `deletion_lockout.reset`, expire the request's own
      cookie, return 200 `{"message": "Account deleted."}`. Register
      `app.include_router(account_router)` in `api/app/main.py` alongside the other two
      routers.
    files:
      - api/app/routes/account.py
      - api/app/main.py
    rationale: |
      Single endpoint drives AC1, AC2, AC4, AC5 together since they're all facets of
      the same confirm-and-delete transaction; mirrors the router-per-domain
      convention already used for auth and profile.

  - description: |
      AC6 idempotency: because deletion is a hard delete, a genuine duplicate request
      after completion arrives with a dead session cookie and cannot be distinguished
      from an ordinary expired session by the account-lookup alone. Handle the
      in-flight race (the case AC6 actually protects against — a retried request from
      a slow network while the same session is still valid) inside
      `accounts.delete_account`/the route by treating "account not found for this
      session" during the delete step itself as `{"status": "already_deleted"}` with
      200 rather than a generic 401, but only when the client still holds an
      otherwise-valid, already-authenticated session was mid-request. For the
      post-completion case (new request after the cookie is fully invalidated) the
      route legitimately cannot tell "never existed" from "deleted" without new
      identifying state, so the client-side account-settings.js already routes any
      401 to the same "This account was already deleted" screen the prototype shows
      for AC6, keeping the user-visible behavior idempotent even though the two cases
      are handled at different layers. This split is called out explicitly rather than
      inventing a lookup table keyed by email (which would itself be identifying data
      AC7 disallows retaining).
    files:
      - api/app/routes/account.py
      - web/public/account-settings.js
    rationale: |
      Reconciles hard-delete-with-no-retention (AC1/AC7) against idempotent-duplicate
      response (AC6) without adding a hidden "deleted emails" table that would violate
      the no-retention/minimal-audit intent.

  - description: |
      Add `web/public/account-settings.html` and `web/public/account-settings.js`
      implementing the prototype's "Account settings — Danger zone" and "Confirm
      deletion" screens. From the design: a `.card` showing Email and "Active sessions"
      as `N devices` (derived from a session count fetched via a small addition to
      `GET /api/profile` response, or a new lightweight `GET /api/account` returning
      `{"email":..., "active_session_count":...}` — see open question), and a
      `.danger-zone-card` with the ⚠️ "Danger zone" title and the exact copy "Deleting
      your account is permanent. Your credentials, profile, workout logs, achievements,
      and posts will be erased immediately — this cannot be undone." with a
      `btn btn-primary btn-block` "Delete my account" button navigating to the
      confirmation view. The confirmation view reproduces the `.consequence-list`
      (four ✕ bullets verbatim from the prototype), the `#confirm-password` field
      labelled "Enter your current password to confirm", the `.checkbox-row` with "I
      understand this permanently deletes my account and cannot be undone.", and
      `#delete-submit-btn` disabled until both password is non-empty and the checkbox
      is checked (mirrors `updateDeleteButton()` in the prototype). On submit, call
      `POST /api/account/delete`; on 401 show the `.field-error-text` "Incorrect
      password. Your account has not been changed." plus `.attempt-counter`; on 429
      show the `.lockout-banner` copy; on 200 redirect to a deletion-complete view
      showing the AC1/AC3/AC4/AC7 copy from the prototype's "Deletion complete" screen
      (omitting the per-device "Laptop — Chrome" / "Tablet — Safari" labels, since
      `SessionRow` has no device/user-agent column — see open question).
    files:
      - web/public/account-settings.html
      - web/public/account-settings.js
    rationale: |
      Builds the already-approved design (danger-zone entry, confirm-password screen,
      lockout screen, deletion-complete screen) using the existing tokens.css /
      prototype-utils.css classes already referenced by profile.html, not new styling.

  - description: |
      Add a link from Profile to the new account settings page, since none exists
      today. In `web/public/profile.html`, add an "Account" link/button below the
      existing form (e.g. `<a class="link-inline" href="account-settings.html">Delete
      my account</a>` or a nav entry near the header) pointing at
      `account-settings.html`.
    files:
      - web/public/profile.html
    rationale: |
      The prototype's danger zone is "reached from Profile," but `profile.html`
      currently has no entry point into it; wiring it in is required for the feature
      to be reachable, not a design decision (the design itself is unchanged).

  - description: |
      Update `web/public/login.html`/`login.js` only if needed to confirm AC3's generic
      failure message already covers the deleted-account case — expected to require NO
      code change since `verify_credentials` already returns `None` (and thus the
      existing generic 401 "Invalid email or password.") for any email with no matching
      account row, which is exactly the state after hard deletion.
    files: ""
    rationale: |
      AC3 is satisfied by the existing login code path once the account row is gone;
      confirmed by reading `api/app/store/accounts.py:46-53` and
      `api/app/routes/auth.py:94-108` rather than assumed.

tests:
  - |
    AC1 (backend, api/tests/test_account_deletion.py) — deleting with the correct
    password erases the account and its session:
    ```python
    def test_correct_password_deletes_account_and_session(db):
        client = TestClient(app)
        client.post("/api/signup", json={"email": "del@example.com", "password": "pw12345", "display_name": "D"})
        res = client.post("/api/account/delete", json={"password": "pw12345"})
        assert res.status_code == 200
        assert client.get("/api/me").status_code == 401
        from app.store.accounts import find_by_email
        assert find_by_email(db, "del@example.com") is None
    ```

  - |
    AC2 (backend) — incorrect password blocks deletion and leaves the account intact:
    ```python
    def test_incorrect_password_blocks_deletion(db):
        client = TestClient(app)
        client.post("/api/signup", json={"email": "keep@example.com", "password": "pw12345", "display_name": "K"})
        res = client.post("/api/account/delete", json={"password": "wrong"})
        assert res.status_code == 401
        assert res.json() == {"message": "Incorrect password. Your account has not been changed."}
        assert client.get("/api/me").status_code == 200
    ```

  - |
    AC3 (backend) — login with former credentials fails after deletion:
    ```python
    def test_login_fails_after_account_deleted(db):
        client = TestClient(app)
        client.post("/api/signup", json={"email": "gone@example.com", "password": "pw12345", "display_name": "G"})
        client.post("/api/account/delete", json={"password": "pw12345"})
        client.cookies.clear()
        res = client.post("/api/login", json={"email": "gone@example.com", "password": "pw12345"})
        assert res.status_code == 401
        assert res.json() == {"message": "Invalid email or password."}
    ```

  - |
    AC4 (backend) — deleting from one device invalidates sessions on other devices too
    (mirrors the multi-device pattern in api/tests/test_login.py:46-56):
    ```python
    def test_deletion_invalidates_all_devices(db):
        device_a = TestClient(app)
        device_a.post("/api/signup", json={"email": "multi2@example.com", "password": "pw12345", "display_name": "M"})
        device_b = TestClient(app)
        device_b.post("/api/login", json={"email": "multi2@example.com", "password": "pw12345"})
        device_a.post("/api/account/delete", json={"password": "pw12345"})
        assert device_a.get("/api/me").status_code == 401
        assert device_b.get("/api/me").status_code == 401
    ```

  - |
    AC5 (backend, api/tests/test_deletion_lockout.py) — exceeding the deletion-specific
    attempt limit blocks further attempts under that policy:
    ```python
    def test_deletion_confirmation_locks_out_after_max_attempts(db):
        client = TestClient(app)
        client.post("/api/signup", json={"email": "lock@example.com", "password": "pw12345", "display_name": "L"})
        for _ in range(5):
            res = client.post("/api/account/delete", json={"password": "wrong"})
            assert res.status_code == 401
        locked_res = client.post("/api/account/delete", json={"password": "pw12345"})
        assert locked_res.status_code == 429
        assert client.get("/api/me").status_code == 200
    ```
    Companion regression to prove login lockout is intentionally untouched:
    `api/tests/test_login.py::test_repeated_invalid_attempts_get_same_error_no_lockout`
    must keep passing unmodified.

  - |
    AC6 (backend) — a duplicate deletion request against an in-flight/already-deleted
    account is idempotent rather than a generic error, and never double-runs the
    deletion side effect:
    ```python
    def test_duplicate_deletion_request_is_idempotent(db):
        client = TestClient(app)
        client.post("/api/signup", json={"email": "dup@example.com", "password": "pw12345", "display_name": "D"})
        first = client.post("/api/account/delete", json={"password": "pw12345"})
        assert first.status_code == 200
        second = client.post("/api/account/delete", json={"password": "pw12345"})
        assert second.status_code in (401, 200)
        if second.status_code == 200:
            assert second.json().get("status") == "already_deleted"
    ```
    (Frontend companion in account-settings.test.js asserts that any 401 received by
    the delete-confirmation flow after a prior successful delete renders the
    "This account was already deleted" screen, per the prototype's idempotent-duplicate
    state.)

  - |
    AC7 (backend) — a minimal, non-identifying audit row survives the deleted account:
    ```python
    def test_deletion_writes_anonymized_audit_entry(db):
        client = TestClient(app)
        client.post("/api/signup", json={"email": "audit@example.com", "password": "pw12345", "display_name": "A"})
        client.post("/api/account/delete", json={"password": "pw12345"})
        from app.store.models import DeletionAudit
        rows = db.query(DeletionAudit).all()
        assert len(rows) == 1
        assert "audit@example.com" not in rows[0].account_reference
        assert rows[0].deleted_at is not None
    ```

  - |
    Frontend (web/tests/account-settings.test.js, mirrors web/tests/profile.test.js's
    readFileSync + import pattern) — the delete button stays disabled until both the
    password field is non-empty and the checkbox is checked, per the prototype's
    `updateDeleteButton()`:
    ```js
    it('keeps the delete button disabled until password and checkbox are both set', async () => {
      const { updateDeleteButton } = await loadAccountSettingsPage();
      document.getElementById('confirm-password').value = 'pw12345';
      document.getElementById('confirm-checkbox').checked = false;
      updateDeleteButton();
      expect(document.getElementById('delete-submit-btn').disabled).toBe(true);
      document.getElementById('confirm-checkbox').checked = true;
      updateDeleteButton();
      expect(document.getElementById('delete-submit-btn').disabled).toBe(false);
    });
    ```

assumptions_or_open_questions:
  - |
    AC5 says "the platform's existing login lockout policy" but no such policy exists
    in code today — `api/tests/test_login.py::test_repeated_invalid_attempts_get_same_error_no_lockout`
    explicitly asserts `/api/login` has NO lockout after 5 bad attempts. This plan
    establishes a new 5-attempts/15-minutes lockout scoped ONLY to
    `/api/account/delete`, using the numbers shown in the approved prototype's
    `.lockout-banner` copy, and leaves `/api/login` untouched. Retrofitting login
    itself with this same policy is a separate story, not done here.
  - |
    AC1 mentions "user-generated content (e.g., workout logs, achievements, posts)" but
    no such tables exist in `api/app/store/models.py` — only `Account` and
    `SessionRow`. Deletion in this plan erases exactly those two things; there is
    nothing else to cascade today. If/when those tables are added by a future story,
    their deletion must be wired into `delete_account` at that time.
  - |
    The prototype's "Deletion complete" screen lists per-device labels ("Laptop —
    Chrome", "Tablet — Safari"). `SessionRow` has no user-agent/device-name column, so
    this plan renders that card with a generic "N sessions signed out" count captured
    before deletion rather than fabricating device labels — flagging this as a
    prototype/data-model gap rather than silently adding a schema column.
  - |
    AC6's idempotency is only exactly achievable for the in-flight/race case (see the
    dedicated scope item above); a request arriving after the session cookie is fully
    dead cannot be distinguished server-side from "never existed" without retaining
    identifying lookup state, which would conflict with AC7's minimal-retention intent.
    The client masks this by routing any 401 in the deletion flow to the same
    "already deleted" screen, which is the practical idempotent behavior a user
    observes even though the server-side mechanism differs by case.
  - |
    Chose `POST /api/account/delete` over a bodied `DELETE /api/account` to match the
    existing convention of `/api/login`, `/api/logout`, `/api/profile` all being POST
    mutations in this codebase.
  - |
    The account-settings entry screen's "Active sessions — N devices" count requires a
    small additive read (session count for the current account) not currently exposed
    by any endpoint; this plan adds it via a new lightweight field rather than
    modifying `/api/profile`'s existing response shape, to avoid touching
    `api/tests/test_profile.py`'s existing assertions.

package_dependencies: []

notes: |
  No new third-party dependencies: FastAPI, SQLAlchemy, passlib, PyMySQL, and Vitest are
  already used by the existing signup/login/profile code and tests, and this plan reuses
  the same libraries for the deletion store, lockout, and audit modules.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef context fill:#eee,color:#333

    ProfileHTML[profile.html]:::touched -->|new link to| AccountHTML[account-settings.html]:::touched
    AccountHTML --> AccountJS[account-settings.js]:::touched
    AccountJS -->|POST /api/account/delete| AccountRoute[app/routes/account.py]:::touched
    AccountRoute -->|verify password| AccountsStore[app/store/accounts.py]:::touched
    AccountRoute -->|check/record attempts| LockoutStore[app/store/deletion_lockout.py]:::touched
    AccountRoute -->|write audit row| AuditStore[app/store/deletion_audit.py]:::touched
    AccountsStore -->|delete rows| Models[app/store/models.py]:::touched
    LockoutStore --> Models
    AuditStore --> Models
    Main[app/main.py]:::touched -->|include_router + backfill| AccountRoute
    Main --> Models
    AuthRoute[app/routes/auth.py]:::context -->|unchanged, verify_credentials returns None post-delete| AccountsStore
    ProfileRoute[app/routes/profile.py]:::context -->|_require_account pattern reused| AccountRoute
  ```
