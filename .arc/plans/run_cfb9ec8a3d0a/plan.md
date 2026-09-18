summary: |
  Implements account deletion end-to-end: a new `/api/account/delete` endpoint that verifies the
  caller's current password, erases the account row (and thereby the profile fields, which are
  columns on `Account`) and every session row for that account, records a minimal non-identifying
  audit entry, clears the session cookie, and returns an idempotent "already deleted" response on
  repeat requests. Introduces a small in-memory-backed lockout policy (5 attempts / 15 minutes,
  per the approved prototype) applied to the deletion-confirm path only, since no login lockout
  policy exists anywhere in the codebase today despite AC5's wording. Builds the two new screens
  the approved prototype shows for this flow (danger-zone entry point reached from Profile, and
  the password-confirmation screen with consequence list, checkbox, and lockout/error states),
  following the design's exact copy, layout, and CSS classes, with the prototype-only review
  chrome (`review-bar`, `FIXTURE`, `show()`, the "type demo-ok" helper text) stripped out.

scope:
  - description: |
      Add an `AccountDeletionAudit` model: a minimal, non-identifying compliance record with no
      foreign key to `accounts.id` (so it survives the account row's deletion and never itself
      identifies the deleted account beyond an opaque reference).

      ```python
      class AccountDeletionAudit(Base):
          __tablename__ = "account_deletion_audits"

          id = Column(Integer, primary_key=True, autoincrement=True)
          account_reference = Column(String(64), nullable=False)  # sha256(email) hex digest, not the email itself
          deleted_at = Column(DateTime, nullable=False, default=_utcnow)
      ```
    files:
      - api/app/store/models.py
    rationale: |
      AC7 requires a minimal, non-identifying record retained after the account row is gone. A
      real FK to accounts.id would either block the delete or cascade the audit row away with it,
      so the reference must be a one-way, non-reversible-in-practice hash, not the raw email or
      the numeric account id.

  - description: |
      Add a deletion-lockout module tracking failed password-confirmation attempts per account,
      in-memory, mirroring the constants shown on the prototype's lockout screen (design lines
      834-859: "locked after 5 incorrect password attempts... try again in 15 minutes").

      ```python
      MAX_ATTEMPTS = 5
      LOCKOUT_WINDOW = datetime.timedelta(minutes=15)

      def record_failure(account_id: int) -> None: ...
      def is_locked(account_id: int) -> bool: ...
      def reset(account_id: int) -> None: ...
      ```
    files:
      - api/app/store/deletion_lockout.py
    rationale: |
      No lockout policy exists anywhere in the codebase today (`login()` in auth.py has no
      counter or lock) even though AC5 refers to "the platform's existing login lockout policy."
      This plan introduces that policy scoped to the deletion-confirm path only, since no AC asks
      for login-side lockout and adding it there is out of scope; the constants are taken
      verbatim from the approved design so the UI copy and backend behavior agree.

  - description: |
      Add `api/app/store/accounts_deletion.py` (or extend `accounts.py`) with a single
      transactional function that deletes all of an account's sessions, then the account row,
      then commits, and returns nothing on success:

      ```python
      def delete_account(db: Session, account: Account) -> None:
          db.query(SessionRow).filter(SessionRow.account_id == account.id).delete()
          db.delete(account)
          db.commit()
      ```
    files:
      - api/app/store/accounts.py
    rationale: |
      `SessionRow.account_id` is a FK to `accounts.id` with no cascade configured (models.py:31),
      so sessions must be deleted before the account row or the delete raises `IntegrityError`.
      Profile fields are plain columns on `Account`, so deleting the account row erases them; no
      separate profile-table delete is needed. There are no workout-log/achievement/post tables
      in this codebase today, so "user-generated content" erasure is vacuous for now — see
      assumptions.

  - description: |
      Add `POST /api/account/delete` to `api/app/routes/auth.py` (kept alongside login/logout so
      it can reuse `SESSION_COOKIE` and `accounts.verify_credentials` without a route-to-route
      import):

      ```python
      class DeleteAccountRequest(BaseModel):
          password: str = ""

      @router.post("/api/account/delete")
      def delete_account(payload: DeleteAccountRequest, db: Session = Depends(get_db), sid: str | None = Cookie(default=None)):
          ...
      ```

      Behavior:
      - 401 `{"message": "Not signed in."}` if `sid` does not resolve to an account (covers the
        AC6 case where a prior request already deleted the account and its session — see
        assumptions for why this is the chosen idempotent signal).
      - 423 `{"message": "Too many incorrect attempts. Try again later."}` if
        `deletion_lockout.is_locked(account.id)` (AC5).
      - 401 `{"message": "Incorrect password. Your account has not been changed."}` and
        `deletion_lockout.record_failure(account.id)` if the password does not verify (AC2),
        account and sessions untouched.
      - On success: `deletion_lockout.reset`, `accounts.delete_account`, insert an
        `AccountDeletionAudit(account_reference=sha256(account.email.encode()).hexdigest())`,
        commit, return 200 with the cookie cleared via `response.delete_cookie(SESSION_COOKIE)`
        (AC1, AC3, AC4, AC7).
    files:
      - api/app/routes/auth.py
    rationale: |
      Reusing `accounts.verify_credentials(db, account.email, payload.password)` preserves the
      existing timing-safe `dummy_verify` path (accounts.py:46-53) instead of adding a second
      verification code path. Placing the route in auth.py avoids importing `_require_account`
      from profile.py (route-to-route import) and keeps `SESSION_COOKIE` as a single constant.

  - description: |
      Register the two migration/backfill hooks the new table needs, mirroring the existing
      pattern for profile columns.

      ```python
      def _backfill_account_deletion_columns() -> None:
          Base.metadata.tables["account_deletion_audits"].create(bind=engine, checkfirst=True)
      ```

      Call it from `lifespan()` alongside `_backfill_session_ttl_columns()` and
      `_backfill_profile_columns()`.
    files:
      - api/app/main.py
    rationale: |
      `Base.metadata.create_all(engine)` in `lifespan()` already creates any new table registered
      on `Base`, so a literal backfill function is only needed if we want it explicit and testable
      the same way `_backfill_profile_columns` is; keeping this symmetric with the existing
      convention rather than relying solely on `create_all` makes intent explicit for reviewers.

  - description: |
      Update the test database bootstrap so the new audit table is created before tests run and
      cleaned between tests, same as `SessionRow`/`Account` today.
    files:
      - api/tests/conftest.py
    rationale: |
      `_clean_tables` (conftest.py:31-38) only deletes `SessionRow` and `Account` rows today; an
      uncleaned `AccountDeletionAudit` table would let an AC7 test pass in isolation but leak rows
      across tests in a full run, corrupting count-based assertions in later tests.

  - description: |
      Build the two net-new screens from the approved prototype, following its layout and CSS
      classes verbatim, with the review-bar/`FIXTURE`/`show()` prototype scaffolding removed:
      - `web/public/account-settings.html`: the danger-zone entry screen (design lines 580-622) —
        `top-app-bar` titled "Account settings", a `card` showing email and "Active sessions —
        N devices", and a `.danger-zone-card` with the warning icon, "Danger zone" title, the
        exact consequence copy, and a `btn btn-primary btn-block` "Delete my account" button
        linking to the confirm screen. Bottom tabs match dashboard/profile's shell with Profile
        marked active-equivalent (reached from Profile).
      - `web/public/delete-account.html`: the confirm screen (design lines 635-685) — the danger
        card with the four-item `consequence-list` (credentials / profile / all-device sessions /
        workout logs, achievements, posts — copied verbatim from design lines 650-653), the
        password `input`, `field-error-text` for AC2, `attempt-counter` for AC5, the
        `checkbox-row` "I understand..." gate, and the primary/secondary buttons. Also renders
        the lockout state (design lines 834-859, `.lockout-banner`) and, after a successful
        delete, the completion state (design lines 760-795: sessions-revoked card, no undo
        affordance, AC7 compliance line) in place, without a separate route.
    files:
      - web/public/account-settings.html
      - web/public/delete-account.html
    rationale: |
      The prototype is the sole design record for this item; its exact copy for the consequence
      list, the checkbox label, the lockout banner text, and the "no grace period" language are
      load-bearing for AC1/AC2/AC4/AC5/AC7 and must be reproduced, not paraphrased. The design's
      destructive buttons use `btn btn-primary`, not the `.btn-danger` token class that exists in
      the design system — built as shown, not "corrected."

  - description: |
      Add `web/public/account-settings.js` and `web/public/delete-account.js` exporting testable
      functions, following the `profile.js`/`profile.test.js` pattern (fetch with
      `credentials: 'include'`, exported pure-ish functions for rendering and submission):

      ```js
      export async function loadAccountSummary() { ... }        // GET /api/profile + a session count if exposed, else omit device count
      export function updateDeleteButton() { ... }               // enables submit only when password non-empty AND checkbox checked
      export async function submitDeletion(password) { ... }     // POST /api/account/delete; returns {ok, locked, incorrect, remainingAttempts?}
      ```

      On `submitDeletion` success: clear any client session state and redirect to
      `login.html?deleted=1` (no new banner variant is added to login.html; a query param is read
      but the reviewer should confirm whether a dedicated banner is desired — see assumptions).
    files:
      - web/public/account-settings.js
      - web/public/delete-account.js
    rationale: |
      Matches the existing signup.js/login.js/profile.js convention of one script per page
      exporting functions unit-tested by mounting the real HTML and mocking `global.fetch`.

  - description: |
      Add a link from the existing Profile page to the new account-settings entry screen (the
      design's "reached from Profile" note, design line 445).
    files:
      - web/public/profile.html
    rationale: |
      The design explicitly states account deletion is reached from Profile > Account settings;
      without this link the new screens would have no in-app entry point.

  - description: |
      Add API tests covering AC1-AC7 for the deletion endpoint.
    files:
      - api/tests/test_account_deletion.py
    rationale: |
      Test-first coverage for every acceptance criterion at the route/store level, using the
      existing `client_with_signed_up_account` and `db` fixtures from conftest.py.

  - description: |
      Add web tests for the two new pages/scripts following the `profile.test.js` harness
      (`readFileSync` into `document.documentElement.innerHTML`, `vi.resetModules()`, dynamic
      import, mocked `global.fetch`).
    files:
      - web/tests/delete-account.test.js
      - web/tests/account-settings.test.js
    rationale: |
      Mirrors the existing web test convention; verifies button-enablement gating, error
      rendering, lockout rendering, and the success redirect without a real backend.

tests:
  - |
    AC1 (api/tests/test_account_deletion.py): correct password deletes the account row, all its
    sessions, and clears the cookie.
    ```python
    def test_correct_password_deletes_account_credentials_profile_and_sessions(client_with_signed_up_account, db):
        client = client_with_signed_up_account
        resp = client.post("/api/account/delete", json={"password": "test-password"})
        assert resp.status_code == 200
        assert accounts.find_by_email(db, "jordan@example.com") is None
        assert resp.cookies.get("sid") is None
    ```
  - |
    AC2 (api/tests/test_account_deletion.py): incorrect password blocks deletion, account intact.
    ```python
    def test_incorrect_password_blocks_deletion_and_leaves_account_intact(client_with_signed_up_account, db):
        client = client_with_signed_up_account
        resp = client.post("/api/account/delete", json={"password": "wrong-password"})
        assert resp.status_code == 401
        assert accounts.find_by_email(db, "jordan@example.com") is not None
    ```
  - |
    AC3 (api/tests/test_account_deletion.py): login with former credentials fails after deletion.
    ```python
    def test_login_with_former_credentials_fails_after_deletion(client_with_signed_up_account):
        client = client_with_signed_up_account
        client.post("/api/account/delete", json={"password": "test-password"})
        resp = client.post("/api/login", json={"email": "jordan@example.com", "password": "test-password"})
        assert resp.status_code == 401
    ```
  - |
    AC4 (api/tests/test_account_deletion.py): deleting invalidates sessions from other devices too.
    ```python
    def test_deletion_invalidates_sessions_on_other_devices(client_with_signed_up_account):
        client = client_with_signed_up_account
        other = TestClient(app)
        other.post("/api/login", json={"email": "jordan@example.com", "password": "test-password"})
        client.post("/api/account/delete", json={"password": "test-password"})
        resp = other.get("/api/me")
        assert resp.status_code == 401
    ```
  - |
    AC5 (api/tests/test_account_deletion.py): exceeding max incorrect attempts locks further
    deletion confirmation attempts, even with the correct password.
    ```python
    def test_exceeding_max_attempts_locks_deletion_confirmation(client_with_signed_up_account):
        client = client_with_signed_up_account
        for _ in range(deletion_lockout.MAX_ATTEMPTS):
            client.post("/api/account/delete", json={"password": "wrong-password"})
        resp = client.post("/api/account/delete", json={"password": "test-password"})
        assert resp.status_code == 423
    ```
  - |
    AC6 (api/tests/test_account_deletion.py): a second deletion request against an already-deleted
    account returns the idempotent "already deleted" response, never a second erasure attempt.
    ```python
    def test_duplicate_deletion_request_is_idempotent(client_with_signed_up_account):
        client = client_with_signed_up_account
        first = client.post("/api/account/delete", json={"password": "test-password"})
        second = client.post("/api/account/delete", json={"password": "test-password"})
        assert first.status_code == 200
        assert second.status_code == 401
        assert second.json()["message"] == "Not signed in."
    ```
  - |
    AC7 (api/tests/test_account_deletion.py): a minimal, non-identifying audit row is retained.
    ```python
    def test_deletion_retains_minimal_non_identifying_audit_entry(client_with_signed_up_account, db):
        client_with_signed_up_account.post("/api/account/delete", json={"password": "test-password"})
        rows = db.query(AccountDeletionAudit).all()
        assert len(rows) == 1
        assert "jordan@example.com" not in rows[0].account_reference
        assert rows[0].deleted_at is not None
    ```
  - |
    Web: delete button stays disabled until both password is non-empty and the checkbox is
    checked (mirrors design lines 902-906).
    ```js
    it('enables the delete button only once password and checkbox are both set', () => {
      document.getElementById('confirm-password').value = 'secret';
      document.getElementById('confirm-checkbox').checked = false;
      updateDeleteButton();
      expect(document.getElementById('delete-submit-btn').disabled).toBe(true);
      document.getElementById('confirm-checkbox').checked = true;
      updateDeleteButton();
      expect(document.getElementById('delete-submit-btn').disabled).toBe(false);
    });
    ```
  - |
    Web: a 401 incorrect-password response renders the AC2 inline error without redirecting.
    ```js
    it('shows the incorrect-password error and does not redirect on a 401', async () => {
      global.fetch.mockResolvedValue({ status: 401, json: async () => ({ message: 'Incorrect password. Your account has not been changed.' }) });
      const result = await submitDeletion('wrong-password');
      expect(result).toEqual({ ok: false, incorrect: true });
    });
    ```

assumptions_or_open_questions:
  - |
    AC5 says deletion attempts are blocked "under that same lockout policy" as login, implying
    login already has one. Grepping the codebase (auth.py, all api/tests) found no lockout logic
    anywhere — only unrelated log strings like `login_attempt`. This plan therefore introduces a
    new lockout policy (5 attempts / 15 minutes, taken from the prototype's lockout screen text)
    scoped to the deletion-confirm endpoint only. Adding lockout to `/api/login` itself is treated
    as out of scope since no AC requires it; flagging this in case the reviewer intended AC5 to
    also retrofit login lockout.
  - |
    "User-generated content (e.g., workout logs, achievements, posts)" in AC1 has no backing
    tables in this codebase — only `Account` (with profile columns) and `SessionRow` exist.
    Deleting the account row erases credentials/profile/sessions; UGC erasure is currently
    vacuous. Any future workout-log/achievement/post table must add itself to the `delete_account`
    transaction, or this AC will silently regress.
  - |
    AC6's idempotency signal is ambiguous once deletion also destroys the session that would
    identify "which account" a repeat request refers to. Chose to treat "session cookie no longer
    resolves to an account" as the idempotent signal, returning the same 401 "Not signed in."
    body used for any unauthenticated request, per the request flow. This means a second request
    is indistinguishable from a client that was never logged in — acceptable per AC6's simple
    "already deleted" intent, but the response body is identical to the generic auth-required
    case rather than a distinct "already deleted" message, since nothing safe-to-re-identify is
    retained (the audit row is intentionally non-identifying, matching AC7). Flagging in case the
    reviewer wants a distinguishable message instead, which would require retaining some
    re-identifiable-by-the-original-user token (e.g. echoing the email back) that AC7's
    non-identifying constraint makes awkward.
  - |
    The prototype's completion screen lists specific device labels ("Laptop — Chrome", "Tablet —
    Safari"); `SessionRow` has no user-agent/device-name column and AC4 only requires that all
    sessions be invalidated, not that they be individually labeled. Plan renders a session count
    (already needed for the entry screen's "Active sessions — N devices" line) rather than adding
    a new column purely for display; flagging as a deliberate, minimal deviation from the
    prototype's literal device list.
  - |
    Assumed the post-deletion redirect target is `login.html` (matching the design's "Go to
    sign-in" buttons on both the completion and idempotent-duplicate screens) with no new banner
    variant added to login.html, since login.html's existing banner set (design/codebase as read)
    doesn't include a "deleted" message and adding one wasn't requested by any AC.
  - |
    Assumed `account_reference` should be a one-way hash of the email (not the raw numeric
    account id) so the audit table can never be joined back to a live account by id reuse; no AC
    specifies the exact anonymization method.

package_dependencies: []

notes: |
  No new third-party dependencies: hashing uses the standard library `hashlib`, and password
  verification reuses the existing `passlib`-backed `accounts.verify_credentials`.

  ```mermaid
  flowchart TD
    authRoute[api/app/routes/auth.py<br/>new POST /api/account/delete]
    accountsStore[api/app/store/accounts.py<br/>new delete_account]
    lockoutStore[api/app/store/deletion_lockout.py<br/>new module]
    models[api/app/store/models.py<br/>new AccountDeletionAudit]
    sessionsStore[api/app/store/sessions.py<br/>SessionRow deletes]
    mainApp[api/app/main.py<br/>lifespan backfill]
    conftest[api/tests/conftest.py<br/>_clean_tables]
    settingsPage[web/public/account-settings.html + .js]
    deletePage[web/public/delete-account.html + .js]
    profilePage[web/public/profile.html<br/>new entry link]

    profilePage -->|links to| settingsPage
    settingsPage -->|links to| deletePage
    deletePage -->|POST /api/account/delete| authRoute
    authRoute -->|verify_credentials, delete_account| accountsStore
    authRoute -->|record_failure, is_locked, reset| lockoutStore
    authRoute -->|insert audit row| models
    accountsStore -->|deletes rows before account| sessionsStore
    mainApp -->|create_all + backfill| models
    conftest -->|clean between tests| models

    classDef touched fill:#f96,color:#000
    class authRoute,accountsStore,lockoutStore,models,sessionsStore,mainApp,conftest,settingsPage,deletePage,profilePage touched
  ```
