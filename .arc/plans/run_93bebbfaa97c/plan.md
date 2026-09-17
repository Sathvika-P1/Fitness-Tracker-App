summary: |
  Implements FTP-STORY-002 (Log In / Log Out): a new `POST /api/login` endpoint that verifies
  email+password against the existing bcrypt hash and reuses `sessions.create_session` (already
  supports unlimited concurrent sessions per account, no invalidation logic needed), a new
  `login.html` + `login.js` page built from the approved prototype
  (`.arc/designs/FTP-STORY-002-design.html`), wiring signup's dormant "Sign in" link to it, and a
  session-check redirect so an already-authenticated visitor never sees the login form. Logout
  already works server-side (`/api/logout` + `sessions.delete_session`) and is scoped to a single
  session row, so AC5/AC6/AC12 are mostly a UI wiring + confirmation-test exercise, not new backend
  work. Two pieces of behavior implied by the ACs but not present in the current code are called
  out explicitly rather than silently added: password verification (no `verify_credentials`
  function exists yet) and cookie persistence across browser restarts (today's `sid` cookie has no
  `max_age`, so it's a browser-session cookie, not a persistent one).
scope:
  - description: |
      Add password verification to the accounts store. New function
      `def verify_credentials(db: Session, email: str, password: str) -> Account | None` in
      `api/app/store/accounts.py`, sitting next to `find_by_email`/`create_account`. Looks up the
      account by (lowercased) email, returns `None` if not found, otherwise checks the password
      against `_pwd_context.verify(password, account.password_hash)` and returns the `Account` on
      match or `None` on mismatch. Never raises or reveals which half of the check failed.
    files:
      - api/app/store/accounts.py
    rationale: |
      No password-verification path exists today — `_pwd_context` is only ever used via `.hash()`
      in `create_account`. The route needs a single call that returns "valid or not" without
      itself branching on existence-vs-password, so the generic-error guarantee (AC3) is enforced
      at the store layer, not re-implemented ad hoc in the route.
  - description: |
      Add `POST /api/login` to `api/app/routes/auth.py`, following the existing `SignupRequest`/
      `signup()` pattern. Request model:
      ```python
      class LoginRequest(BaseModel):
          email: str = ""
          password: str = ""
      ```
      Handler: strip email, call `accounts.verify_credentials(db, email, payload.password)`. If
      `None`, return a single generic shape regardless of cause (missing email, wrong password,
      empty fields):
      ```python
      return JSONResponse(status_code=401, content={"message": "Invalid email or password."})
      ```
      On success, call `sessions.create_session(db, account.id)` (unmodified — it already just
      inserts a new `SessionRow`, no revocation of other sessions) and set the `sid` cookie the
      same way `signup()` does, but WITH `max_age` added (see the AC9 cookie-persistence note
      below) so the login stays valid across a browser restart:
      ```python
      response.set_cookie(
          SESSION_COOKIE, session_id, httponly=True,
          secure=os.environ.get("SECURE_COOKIES", "true").lower() != "false",
          samesite="lax", max_age=int(SESSION_TTL.total_seconds()),
      )
      ```
      Return body mirrors `/api/me`'s shape: `{"email": ..., "display_name": ...}`.
    files:
      - api/app/routes/auth.py
    rationale: |
      Reuses the exact session-creation and cookie-setting pattern signup already uses
      (auth.py:56-79), per the implementation notes — no new session/auth mechanism, just a second
      entry point into it. Setting `max_age` on login (but this plan does NOT change signup's
      existing cookie, to avoid touching FTP-STORY-001 behavior) is flagged as an open question
      below since it's an extrapolation beyond what any AC states outright.
  - description: |
      Create `web/public/login.html`, built from the approved prototype's "Log in — empty" and
      "Log in — invalid credentials" screens: `.auth-shell > .auth-card.card` containing
      `card-title` "Log in", muted `card-body` subtitle "Welcome back. Enter your credentials to
      continue.", a `.banner` (hidden by default, `role="alert"`) with icon + "Invalid email or
      password" title + "Double-check your credentials and try again." body, a `novalidate` form
      with `.field > label.label + input.input` for email (`type=email`, `autocomplete=email`) and
      password (`type=password`, `autocomplete=current-password`), a `.btn.btn-primary.btn-block`
      submit button, and a `.center-note` "New here? <button class=link-inline>Create an
      account</button>" linking to `signup.html`. Per the design's explicit deviation note
      (lines 486-491): do NOT add per-field `.field-error-text` elements under the inputs the way
      signup.html does — login must only ever show the shared banner, since a per-field message
      would leak whether the email exists. Loads shared tokens via the same
      `/design-system/tokens.css` + `/design-system/prototype-utils.css` links signup.html/
      dashboard.html use, plus `<script type="module" src="/login.js">`.
    files:
      - web/public/login.html
    rationale: |
      Matches the "reuses the same form-field labeling and structure patterns already present in
      signup.html" requirement (AC11) and the prototype's concrete markup/class names, while
      preserving the prototype's one deliberate divergence from signup's per-field error pattern.
  - description: |
      Create `web/public/login.js` with exported, directly-testable functions mirroring
      `signup.js`'s shape:
      ```javascript
      export async function submitLoginForm({ email, password } = {}) { ... }
      export async function checkExistingSession() { ... }
      ```
      `submitLoginForm`: clears/hides the error banner, disables the submit button
      ("Log in" → "Logging in…") while the request is in flight, POSTs
      `{ credentials: 'include', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({email, password}) }` to `/api/login`. On `200`, redirect to
      `dashboard.html`. On any non-200 (401, or a malformed/empty submission caught client-side
      before the fetch), show the shared banner via `banner.hidden = false` — never a per-field
      error. Re-enables the button in a `finally` block, matching `signup.js`'s pattern.
      `checkExistingSession`: on page load, `fetch('/api/me', {credentials:'include'})`; if `200`,
      redirect immediately to `dashboard.html` before the form is shown (AC8); if `401`, do
      nothing further (form stays visible) — this also covers AC9 since `/api/me` validates
      whatever `sid` cookie the browser already sent, no re-login required as long as the cookie/
      session are still valid.
    files:
      - web/public/login.js
    rationale: |
      Mirrors `signup.js`'s exported-function-per-test-hook convention (`submitSignupForm`) so
      `login.test.js` can drive it the same way `signup.test.js` drives signup, and satisfies
      AC8/AC9 by reusing the already-existing `/api/me` session check rather than inventing a new
      endpoint.
  - description: |
      Wire the signup page's dormant sign-in link to the new login page, and give logout a
      client-side landing point.
      In `web/public/signup.html`, change line 118 from
      `<button class="link-inline" type="button">Sign in</button>` to
      `<button class="link-inline" type="button" onclick="window.location.href='login.html'">Log in</button>`
      (see the AC7-wording note below on why the visible text becomes "Log in" rather than staying
      "Sign in").
      In `web/public/dashboard.html`, add a "Log out" button to the existing `.top-app-bar`, next
      to `#avatar-initials`, matching the design's Device A/B screens:
      `<button class="btn btn-secondary" id="logout-button">Log out</button>`.
      In `web/public/dashboard.js`, add:
      ```javascript
      export async function logout() {
        await fetch('/api/logout', { method: 'POST', credentials: 'include' });
        window.location.href = 'login.html';
      }
      ```
      wired via `document.getElementById('logout-button')?.addEventListener('click', logout)`.
    files:
      - web/public/signup.html
      - web/public/dashboard.js
      - web/public/dashboard.html
    rationale: |
      AC7 requires the signup page's sign-in link to navigate to the login page; AC5/AC6 require a
      logout control that ends only the current session and returns to the login screen — the
      dashboard prototype screens (lines 538-575, 619-657) show exactly this button placement.
  - description: |
      Backend tests for login: new `api/tests/test_login.py`, following the `TestClient(app)` /
      `db` fixture pattern already used in `test_signup.py` / `test_logout_and_session_expiry.py`.
    files:
      - api/tests/test_login.py
    rationale: |
      Covers AC1-AC4, AC9 (cookie shape), AC10 at the API layer, matching the existing test
      layout/conventions in `api/tests/`.
  - description: |
      Store-level test for the new verification function, alongside the existing accounts-store
      tests.
    files:
      - api/tests/test_accounts_store.py
    rationale: |
      `verify_credentials` is a new store function with its own success/failure/no-such-account
      branches worth testing directly, the same way `test_accounts_store.py` already tests
      `create_account`'s uniqueness behavior in isolation from the route layer.
  - description: |
      Frontend tests: new `web/tests/login.test.js`, following the `signup.test.js`/
      `dashboard.test.js` pattern (load the real HTML into `document.documentElement.innerHTML`,
      mock `global.fetch`, import the page's module fresh via `vi.resetModules()`).
    files:
      - web/tests/login.test.js
    rationale: |
      Covers AC3/AC10 (banner-only error, no field errors, repeatable), AC8 (redirect-if-already-
      authenticated), and AC7 (signup's link now points at login.html), using the same harness
      `web/vitest.config.js` already runs for signup/dashboard.
tests:
  - |
    api/tests/test_login.py::test_login_with_correct_credentials_succeeds — AC1/AC2:
    ```python
    def test_login_with_correct_credentials_succeeds(db):
        client = TestClient(app)
        client.post("/api/signup", json={"email": "login-user@example.com",
                                          "password": "test-password", "display_name": "Login User"})
        client.cookies.clear()
        res = client.post("/api/login", json={"email": "login-user@example.com",
                                               "password": "test-password"})
        assert res.status_code == 200
        assert res.json() == {"email": "login-user@example.com", "display_name": "Login User"}
        me = client.get("/api/me")
        assert me.status_code == 200
    ```
  - |
    api/tests/test_login.py::test_login_with_wrong_password_returns_generic_error — AC3:
    ```python
    def test_login_with_wrong_password_returns_generic_error(db):
        client = TestClient(app)
        client.post("/api/signup", json={"email": "wrongpw@example.com",
                                          "password": "test-password", "display_name": "U"})
        client.cookies.clear()
        res = client.post("/api/login", json={"email": "wrongpw@example.com", "password": "nope"})
        assert res.status_code == 401
        assert res.json() == {"message": "Invalid email or password."}
    ```
  - |
    api/tests/test_login.py::test_login_with_unknown_email_returns_identical_generic_error — AC3
    (never reveals whether the email exists — asserts byte-identical body to the wrong-password
    case above):
    ```python
    def test_login_with_unknown_email_returns_identical_generic_error(db):
        client = TestClient(app)
        res = client.post("/api/login", json={"email": "nobody@example.com", "password": "x"})
        assert res.status_code == 401
        assert res.json() == {"message": "Invalid email or password."}
    ```
  - |
    api/tests/test_login.py::test_second_device_login_does_not_invalidate_first_session — AC4:
    ```python
    def test_second_device_login_does_not_invalidate_first_session(db):
        device_a = TestClient(app)
        device_a.post("/api/signup", json={"email": "multi@example.com",
                                            "password": "test-password", "display_name": "Multi"})
        device_b = TestClient(app)
        device_b.post("/api/login", json={"email": "multi@example.com", "password": "test-password"})
        assert device_a.get("/api/me").status_code == 200
        assert device_b.get("/api/me").status_code == 200
    ```
  - |
    api/tests/test_login.py::test_logout_from_one_device_leaves_other_device_active — AC5/AC12
    (also exercises AC6's server-side half — the cookie is cleared):
    ```python
    def test_logout_from_one_device_leaves_other_device_active(db):
        device_a = TestClient(app)
        device_a.post("/api/signup", json={"email": "twodev@example.com",
                                            "password": "test-password", "display_name": "Two"})
        device_b = TestClient(app)
        device_b.post("/api/login", json={"email": "twodev@example.com", "password": "test-password"})
        device_a.post("/api/logout")
        assert device_a.get("/api/me").status_code == 401
        assert device_b.get("/api/me").status_code == 200
    ```
  - |
    api/tests/test_login.py::test_repeated_invalid_attempts_get_same_error_no_lockout — AC10:
    ```python
    def test_repeated_invalid_attempts_get_same_error_no_lockout(db):
        client = TestClient(app)
        for _ in range(5):
            res = client.post("/api/login", json={"email": "nope@example.com", "password": "bad"})
            assert res.status_code == 401
            assert res.json() == {"message": "Invalid email or password."}
    ```
  - |
    api/tests/test_login.py::test_login_cookie_has_persistent_max_age — AC9 (asserts the
    persistence mechanism itself, not just that a fresh session works, since the current signup
    cookie has no max_age and would fail this on the same assertion):
    ```python
    def test_login_cookie_has_persistent_max_age(db):
        client = TestClient(app)
        client.post("/api/signup", json={"email": "persist@example.com",
                                          "password": "test-password", "display_name": "P"})
        client.cookies.clear()
        res = client.post("/api/login", json={"email": "persist@example.com", "password": "test-password"})
        set_cookie = res.headers["set-cookie"].lower()
        assert "max-age=" in set_cookie
    ```
  - |
    api/tests/test_accounts_store.py::test_verify_credentials — new function's own branches:
    ```python
    def test_verify_credentials_returns_account_on_match(db):
        accounts.create_account(db, "verify@example.com", "correct-pw", "V")
        assert accounts.verify_credentials(db, "verify@example.com", "correct-pw") is not None

    def test_verify_credentials_returns_none_on_wrong_password(db):
        accounts.create_account(db, "verify2@example.com", "correct-pw", "V2")
        assert accounts.verify_credentials(db, "verify2@example.com", "wrong-pw") is None

    def test_verify_credentials_returns_none_for_unknown_email(db):
        assert accounts.verify_credentials(db, "ghost@example.com", "anything") is None
    ```
  - |
    web/tests/login.test.js::"shows the generic banner (not a per-field error) on invalid
    credentials" — AC3:
    ```javascript
    it('shows the generic banner, never a per-field error, on invalid credentials', async () => {
      const { submitLoginForm } = await loadLoginPage();
      global.fetch.mockResolvedValue({
        status: 401,
        json: async () => ({ message: 'Invalid email or password.' }),
      });
      await submitLoginForm({ email: 'x@example.com', password: 'bad' });
      expect(document.getElementById('error-banner').hidden).toBe(false);
      expect(document.querySelector('.field-error-text')).toBeNull();
    });
    ```
  - |
    web/tests/login.test.js::"redirects to dashboard without showing the form when a session
    already exists" — AC8:
    ```javascript
    it('redirects to dashboard immediately when an active session is found', async () => {
      const { checkExistingSession } = await loadLoginPage();
      global.fetch.mockResolvedValue({ status: 200, json: async () => ({ email: 'a@b.com', display_name: 'A' }) });
      delete window.location;
      window.location = { href: '' };
      await checkExistingSession();
      expect(window.location.href).toBe('dashboard.html');
    });
    ```
  - |
    web/tests/login.test.js::"successful login redirects to the dashboard" — AC1/AC2:
    ```javascript
    it('redirects to dashboard.html on a 200 response', async () => {
      const { submitLoginForm } = await loadLoginPage();
      global.fetch.mockResolvedValue({ status: 200, json: async () => ({ email: 'a@b.com', display_name: 'A' }) });
      delete window.location;
      window.location = { href: '' };
      await submitLoginForm({ email: 'a@b.com', password: 'correct-pw' });
      expect(window.location.href).toBe('dashboard.html');
    });
    ```
assumptions_or_open_questions:
  - |
    AC9 vs. the actual cookie mechanics: today's `/api/signup` cookie (`auth.py:73-79`) has no
    `max_age`/`expires`, making it a browser-session cookie that disappears on browser close —
    which would fail the "close and reopen their browser" half of AC9 outright, independent of the
    24h server-side TTL in `sessions.py:8`. This plan adds `max_age` to the LOGIN cookie only (not
    signup's, to avoid touching FTP-STORY-001 behavior outside this story's scope), pinned to the
    existing `SESSION_TTL` (24h). That still leaves "an extended period" in AC9 ambiguous against
    a hard 24h expiry — flagging this for the reviewer rather than silently picking a longer TTL,
    since extending `SESSION_TTL` affects signup-created sessions too and no AC or design note
    specifies a duration.
  - |
    The design's "Active sessions" panel and `.device-badge` UI (design lines 556-565, 637-649,
    showing a per-device list with device labels like "📱 iPhone · This device") is NOT built by
    this plan. No AC requires it, `SessionRow` (api/app/store/models.py) has no device/user-agent
    column, and `sessions.py` has no list-by-account query — building it would mean a schema
    migration and a new endpoint neither implied by the ACs nor mentioned in the implementation
    notes. Treating it as a design-only illustration of AC4/AC12's underlying behavior (which IS
    covered by the login/logout tests above at the API level), not a UI deliverable of this story.
  - |
    AC7 says the link text is "Sign in"; signup.html's current link (line 118) says "Sign in"; but
    the approved prototype (design lines 578-582) records a named product-owner decision changing
    the text to "Log in" to match the destination page's name. This plan follows the prototype
    (the authoritative, later record) and renames the link to "Log in", satisfying AC7's intent
    (navigate to the login page) even though the AC's own wording still says "Sign in".
  - |
    dashboard.js currently redirects to `signup.html` on a non-200 `/api/me` (dashboard.js:14,23).
    This plan does not change that redirect target to `login.html`, since no AC or design screen
    addresses unauthenticated dashboard access — only signup's link (AC7) and post-logout landing
    (AC6) are specified as going to the login page. Flagging this because a reviewer may expect an
    unauthenticated dashboard visit to land on login.html now that it exists.
  - |
    Login's error response uses a flat `{"message": ...}` shape with no `field` key, unlike
    signup's 400 responses which include `field`. This is deliberate per the design's explicit
    note (lines 486-491) that login must never indicate which input was wrong, and AC3 explicitly
    folds "incorrect email or password, or an empty/malformed field" into one generic response —
    so even a client-side-empty submission produces the same banner as a server-rejected one,
    rather than validating fields before the network call the way signup.js does.
  - |
    Chose HTTP 401 (not 400, which signup uses for validation errors) for all login failure modes,
    since a login attempt failing credential verification is more precisely an authentication
    failure regardless of which input was empty/wrong/missing — no AC or design note pins the
    status code, this is treated as an implementation detail rather than user-facing behavior.
package_dependencies: []
notes: |
  No `/api/login` route or `login.html`/`login.js` exist yet; this plan creates them rather than
  modifying anything. `/api/logout` and `sessions.delete_session` already implement per-session
  logout correctly (confirmed by the existing `test_logout_and_session_expiry.py`), so AC5/AC6/AC12
  need only a client-side "Log out" button (`dashboard.js`/`dashboard.html`) and a redirect to
  `login.html`, not new backend work. `web/` already has a vitest+jsdom harness
  (`web/vitest.config.js`, `web/package.json`) exercising `signup.html`/`signup.js` and
  `dashboard.html`/`dashboard.js` the same way this plan's `login.test.js` will exercise
  `login.html`/`login.js` — no new frontend dependency needed.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef context fill:#eee,color:#333

    LoginHTML["login.html (new)"]:::touched
    LoginJS["login.js (new)"]:::touched
    SignupHTML["signup.html"]:::touched
    DashboardHTML["dashboard.html"]:::touched
    DashboardJS["dashboard.js"]:::touched
    AuthRoute["api/app/routes/auth.py"]:::touched
    AccountsStore["api/app/store/accounts.py"]:::touched
    SessionsStore["api/app/store/sessions.py"]:::context

    LoginHTML -->|loads| LoginJS
    LoginJS -->|"POST /api/login"| AuthRoute
    LoginJS -->|"GET /api/me (session check, AC8/AC9)"| AuthRoute
    SignupHTML -->|"Log in link now navigates to (AC7)"| LoginHTML
    DashboardHTML -->|"Log out button"| DashboardJS
    DashboardJS -->|"POST /api/logout, then redirect"| AuthRoute
    DashboardJS -->|"redirects to (AC5/AC6)"| LoginHTML
    AuthRoute -->|verify_credentials, new| AccountsStore
    AuthRoute -->|create_session, unmodified, already supports concurrent sessions| SessionsStore
  ```
