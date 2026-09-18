summary: |
  Adds profile view/edit for the signed-in account: display name, units preference, fitness
  goal, height, weight, age, and gender. Extends `Account` with the new nullable columns
  (mirroring the existing raw-SQL backfill pattern used for `sessions`), adds a session-scoped
  `GET/POST /api/profile` pair to the FastAPI app that never takes an account id (identity comes
  from the `sid` cookie exactly like `/api/me`), and builds `web/public/profile.html` /
  `profile.js` from the two "Profile" screens in the approved prototype
  (`.arc/designs/FTP-STORY-003-design.html`): the read/partially-unset layout (screen
  "Profile — partially unset (AC1, AC4)") and the fully-editable form (screen
  "Profile — fully populated, editing (AC1, AC2, AC3)"), plus its saving/saved/error states.
  Validation (length, character set, numeric ranges, enum membership) is enforced server-side,
  matching the prototype's inline `field-error-text` pattern already used for signup/login, and
  is deliberately allowed to reject multiple fields in one response since the prototype's AC9/AC10
  screens show height, weight, and age erroring simultaneously — this departs from the existing
  single-field `{"field", "message"}` shape used by `/api/signup`, which is left untouched. Per
  reviewer decision, height and weight accept decimal values (e.g. 74.5 kg); age remains
  whole-number only; there is no metric/imperial unit conversion — height is always shown/stored
  in cm and weight always in kg, and the units preference itself is stored/shown as selected but
  never converts other fields' values or labels.

scope:
  - description: |
      Add six nullable columns to `Account` for the new profile fields, and a matching raw-SQL
      backfill so existing databases (including the persistent `ftp_signup_test` DB used by
      `api/tests/conftest.py`, which never drops tables) gain the columns without a migration
      tool, mirroring `_backfill_session_ttl_columns` in `api/app/main.py`. Height and weight use
      `Float` per reviewer decision (decimals allowed, e.g. 74.5 kg); age stays `Integer`.

      New columns on `Account` (`api/app/store/models.py`):
      ```python
      units_preference = Column(String(16), nullable=True)   # "metric" | "imperial"
      fitness_goal = Column(String(32), nullable=True)        # lose_weight | build_muscle | improve_endurance | general_fitness
      height_cm = Column(Float, nullable=True)                 # canonical storage always in cm; decimals allowed
      weight_kg = Column(Float, nullable=True)                 # canonical storage always in kg; decimals allowed
      age = Column(Integer, nullable=True)                     # whole years only
      gender = Column(String(32), nullable=True)               # woman | man | non_binary | prefer_not_to_say
      ```

      New function in `api/app/main.py`, called from `lifespan` right after
      `_backfill_session_ttl_columns()`:
      ```python
      def _backfill_profile_columns() -> None:
          inspector = inspect(engine)
          if "accounts" not in inspector.get_table_names():
              return
          columns = {col["name"] for col in inspector.get_columns("accounts")}
          additions = {
              "units_preference": "VARCHAR(16)",
              "fitness_goal": "VARCHAR(32)",
              "height_cm": "FLOAT",
              "weight_kg": "FLOAT",
              "age": "INTEGER",
              "gender": "VARCHAR(32)",
          }
          with engine.begin() as connection:
              for name, sql_type in additions.items():
                  if name not in columns:
                      connection.execute(text(f"ALTER TABLE accounts ADD COLUMN {name} {sql_type} NULL"))
      ```
    files:
      - api/app/store/models.py
      - api/app/main.py
    rationale: |
      `Base.metadata.create_all` never alters an existing table (already true of `sessions`,
      per the comment in `main.py`), and the test suite reuses a persistent database across
      runs, so without an explicit backfill every profile test would fail with "unknown column"
      against a DB created before this change. `Float` for height/weight matches the reviewer's
      decision to allow decimals; `age` stays `Integer` since ages are whole years.

  - description: |
      Add store functions for reading and updating profile fields, kept separate from
      `accounts.py`'s signup/login concerns.

      ```python
      # api/app/store/profiles.py
      ALLOWED_UNITS = {"metric", "imperial"}
      ALLOWED_GOALS = {"lose_weight", "build_muscle", "improve_endurance", "general_fitness"}
      ALLOWED_GENDERS = {"woman", "man", "non_binary", "prefer_not_to_say"}
      DISPLAY_NAME_MAX_LENGTH = 50
      DISPLAY_NAME_PATTERN = re.compile(r"^[A-Za-z0-9 .,'\-]+$")

      def serialize_profile(account: Account) -> dict: ...
      def update_profile(db: Session, account: Account, updates: dict) -> Account: ...
      ```
      `update_profile` sets only the provided keys via `setattr`, commits, and returns the
      refreshed account; it performs no validation itself (validation lives in the route so
      error messages/field keys stay next to the request schema).
    files:
      - api/app/store/profiles.py
    rationale: |
      Keeps `accounts.py` (identity/auth) and the new profile-field concern separate, following
      the existing `store/accounts.py` + `store/sessions.py` split by responsibility.

  - description: |
      Add `GET /api/profile` and `POST /api/profile` to a new router, registered in
      `api/app/main.py` alongside `auth_router`. Both derive the account solely from the `sid`
      cookie via `sessions.get_account_id_for_session`, exactly like `GET /api/me`
      (`api/app/routes/auth.py:131-147`) — neither route accepts or reads an account id from the
      path, query, or body, so there is no parameter to tamper with (AC4).

      ```python
      # api/app/routes/profile.py
      class ProfileUpdateRequest(BaseModel):
          display_name: str | None = None
          units_preference: str | None = None
          fitness_goal: str | None = None
          height_cm: str | None = None   # raw string; numeric parsing happens here, not pydantic,
          weight_kg: str | None = None   # so non-numeric input produces our own inline error (AC10)
          age: str | None = None
          gender: str | None = None

      @router.get("/api/profile")
      def get_profile(db: Session = Depends(get_db), sid: str | None = Cookie(default=None)):
          account_id = sessions.get_account_id_for_session(db, sid) if sid else None
          if account_id is None:
              return JSONResponse(status_code=401, content={"message": "Not signed in."})
          account = db.get(Account, account_id)
          return profiles.serialize_profile(account)

      @router.post("/api/profile")
      def update_profile(payload: ProfileUpdateRequest, db=Depends(get_db), sid: str | None = Cookie(default=None)):
          account_id = sessions.get_account_id_for_session(db, sid) if sid else None
          if account_id is None:
              return JSONResponse(status_code=401, content={"message": "Not signed in."})
          account = db.get(Account, account_id)
          errors = {}
          # ... per-field validation appends to `errors` by field name ...
          if errors:
              return JSONResponse(status_code=400, content={"errors": errors})
          updated = profiles.update_profile(db, account, validated_updates)
          return profiles.serialize_profile(updated)
      ```
      Validation rules (values pinned from the prototype, not invented; decimal/age rule per
      reviewer decision):
      - `display_name`: 1-50 chars (design line 578/770 — "Max 50 characters"), pattern
        `^[A-Za-z0-9 .,'\-]+$` (design line 794 — "letters, numbers, spaces, and basic
        punctuation (. , ' -)"). No uniqueness check (AC8 — display name is per-account only).
      - `units_preference`: must be `"metric"` or `"imperial"` (design lines 509-512). Selecting
        this only changes which value is stored/shown as the preference itself — it never
        converts or relabels the stored height/weight values, per reviewer decision.
      - `fitness_goal`: must be one of `lose_weight`, `build_muscle`, `improve_endurance`,
        `general_fitness` (design lines 592-595).
      - `height_cm` (1-300, decimals allowed, e.g. "178.5") and `weight_kg` (1-500, decimals
        allowed, e.g. "74.5") each must parse as a float; `age` (1-120) must parse as an integer
        — a value like "31.5" is rejected for `age` with "Age must be a number." since ages are
        whole years, but the same string form is valid for height/weight. Non-numeric input for
        a field yields `"{Field} must be a number."`; out-of-range yields `"{Field} must be
        between {min} and {max}{unit}."` — literal strings pinned from design lines
        820/825/830/853/858/863. Always validated in metric (cm/kg) regardless of
        `units_preference` (design lines 750, 816).
      - `gender`: must be one of `woman`, `man`, `non_binary`, `prefer_not_to_say` (design lines
        618-621) — rejected with `"Select a valid gender option from the list."` (design line
        937) if a tampered/stale request sends anything else (AC12; the `<select>` never emits
        an out-of-list value client-side per the design's own note, lines 908-912).
      - Response shape on validation failure is `{"errors": {"<field>": "<message>", ...}}`,
        one entry per invalid field, per reviewer decision that all invalid fields submitted
        together (e.g. height, weight, and age all invalid at once) must be shown at once, as
        the AC9/AC10 prototype screens depict. This is a deliberate departure from the
        single-field `{"field", "message"}` shape used by `/api/signup`/`/api/login`.
    files:
      - api/app/routes/profile.py
      - api/app/main.py
    rationale: |
      A dedicated router keeps profile concerns out of `auth.py`, matches the existing
      file-per-concern layout (`routes/auth.py`), and reuses `sessions.get_account_id_for_session`
      so there is exactly one source of "who is the signed-in user" across the app (AC4).

  - description: |
      Use `POST /api/profile` for the update (not `PATCH`), because `web/server.py`'s proxy only
      implements `do_GET` and `do_POST` (`web/server.py:28-36`); adding a third HTTP verb to the
      proxy is unnecessary extra surface when `POST` is already the mutation verb this codebase
      uses for `/api/logout`. No changes needed to `web/server.py` since both `/api/profile`
      routes go through the existing GET/POST proxy paths unchanged.
    files: []
    rationale: |
      Keeps the proxy's verb surface as-is; confirmed by reading `web/server.py:28-36` that only
      GET/POST are forwarded, so a PATCH/PUT route would silently 501 through the proxy even
      though a direct-to-API test would pass.

  - description: |
      Build the profile page markup from the two canonical prototype screens: "Profile —
      partially unset (AC1, AC4)" (design lines 482-549, read-only view with `.not-set` spans
      for blank fields, `field-group-title`s "Account"/"Preferences"/"Body details", top app bar
      with `.avatar` + name + "Your profile" subtitle, `.bottom-tabs` with Profile active) and
      "Profile — fully populated, editing (AC1, AC2, AC3)" (design lines 560-642, same layout
      with `<input>`/`<select>` controls, a live `.char-counter` on display name, and a single
      `btn-primary btn-block` "Save changes" action per the design's own note that there is one
      primary action). Load `/design-system/tokens.css` and `/design-system/prototype-utils.css`
      exactly as `dashboard.html` does (`web/public/dashboard.html:7-8`).
    files:
      - web/public/profile.html
    rationale: |
      The design is the sole source of truth for layout; both named screens are reused verbatim
      since AC1 (view) and AC2/AC3 (edit) are one screen with the same field set, just
      disabled-vs-editable, matching how the prototype toggles between them via "Edit profile".

  - description: |
      Add the classes the profile screens use that are not yet in the shared stylesheet — they
      exist only inline in the prototype's own `<style>` blocks (design lines 358-457), not in
      `design-system/prototype-utils.css`: `.top-app-bar`, `.avatar`, `.bottom-tabs`,
      `.bottom-tab`(`.active`), `.field`, `.field-error-text`, `.input.has-error`,
      `.helper-text`, `.btn-block`, `.btn:disabled`, `.not-set`, `.field-group-title`,
      `.char-counter`(`.over`), `.content-pad`, `.post-card`, `.post-meta`, `.post-avatar`,
      `.banner`(`.banner-icon`, `.banner-title`, `.banner-body`) — copied in verbatim from the
      design's inline `<style>` (lines 358-457), since `dashboard.html` currently duplicates
      `.top-app-bar`/`.avatar`/`.bottom-tabs`/`.bottom-tab` locally rather than sharing them.
      Reuse the existing `banner banner-neutral` combination (already defined in
      `prototype-utils.css:290-297` and used by `login.html:27-33`) for the "Profile saved"
      success state, per the design's own note (lines 670-671) that no dedicated success token
      exists yet.
    files:
      - design-system/prototype-utils.css
    rationale: |
      Keeps one shared source for classes reused across dashboard and profile screens instead of
      re-duplicating the app-shell CSS a third time; confirmed by reading
      `design-system/prototype-utils.css` in full that none of these selectors exist there today.

  - description: |
      Add `web/public/profile.js`: on load, calls `GET /api/profile`, renders each field
      (showing `.not-set` "Not set" for `null` values per AC1), wires "Edit profile" to reveal
      the editable form, validates client-side for immediate feedback (length/char-set on
      display name via the `.char-counter`, matching design lines 576-578) but always defers to
      the server response as the source of truth for save/reject, disables the "Save changes"
      button and relabels it "Saving…" while the POST is in flight (design lines 644-667), shows
      the `banner banner-neutral` "Profile saved" confirmation then re-fetches `GET /api/profile`
      so the displayed values are always the freshly-persisted ones (AC2/AC3 — "next load" per
      design lines 701-753), and on a 400 response renders each `errors[field]` message inline
      under its input using the `.field-error-text`/`.input.has-error` pattern (design lines
      757-869, 913-942) without saving anything. Height/weight inputs accept decimal text (no
      `pattern` restriction to digits-only); age input is still free text validated server-side.

      ```javascript
      export function renderProfile(data) { /* fills #dn / #units / #goal / ... or .not-set */ }
      export async function loadProfile() { /* GET /api/profile, 401 -> redirect like dashboard.js */ }
      export async function saveProfile(formValues) { /* POST /api/profile; returns { ok, errors } */ }
      ```
    files:
      - web/public/profile.js
    rationale: |
      Mirrors `dashboard.js`'s `loadDashboard`/redirect-on-401 pattern exactly
      (`web/public/dashboard.js:10-25`) so profile fetches behave identically to the existing
      `/api/me` call, and keeps the module's exported functions unit-testable the same way
      `dashboard.test.js` tests `loadDashboard`/`logout` directly.

  - description: |
      Add a "Profile" tab link from the dashboard bottom tab bar to `profile.html`, since
      `dashboard.html`'s `.bottom-tab` items are currently plain `<div>`s with no navigation
      (`web/public/dashboard.html:83-88`). Change the Profile tab to an `<a>` so a user can
      actually reach the profile screen from the dashboard.
    files:
      - web/public/dashboard.html
    rationale: |
      Without this the profile screen this plan builds would be unreachable from the app's only
      existing authenticated screen.

  - description: |
      Add a `client_with_signed_up_account` pytest fixture to `api/tests/conftest.py`: a
      `TestClient` that has already called `POST /api/signup` with `display_name="Jordan"`,
      returned ready to use by the new profile tests.

      ```python
      @pytest.fixture
      def client_with_signed_up_account():
          client = TestClient(app)
          client.post(
              "/api/signup",
              json={"email": "jordan@example.com", "password": "test-password", "display_name": "Jordan"},
          )
          return client
      ```
    files:
      - api/tests/conftest.py
    rationale: |
      Avoids repeating the signup boilerplate at the top of each of the ~9 new profile tests that
      only care about profile behavior, not the signup flow itself; added per reviewer decision.
      Tests that specifically need two distinct accounts (AC4, AC8) still create their own
      `TestClient`s inline, matching the existing style in `test_account_isolation.py`.

tests:
  - |
    AC1 (view, including unset fields) — `api/tests/test_profile.py`:
    ```python
    def test_get_profile_shows_unset_fields_as_null(client_with_signed_up_account):
        res = client_with_signed_up_account.get("/api/profile")
        assert res.status_code == 200
        body = res.json()
        assert body["display_name"] == "Jordan"
        assert body["units_preference"] is None
        assert body["fitness_goal"] is None
        assert body["height_cm"] is None
        assert body["weight_kg"] is None
        assert body["age"] is None
        assert body["gender"] is None
    ```
  - |
    AC2 (non-name fields persist across load) — `api/tests/test_profile.py`:
    ```python
    def test_updating_preferences_persists_across_reload(client_with_signed_up_account):
        client_with_signed_up_account.post("/api/profile", json={
            "units_preference": "imperial", "fitness_goal": "build_muscle",
            "height_cm": "180.5", "weight_kg": "74.5", "age": "31", "gender": "woman",
        })
        res = client_with_signed_up_account.get("/api/profile")
        body = res.json()
        assert body["units_preference"] == "imperial"
        assert body["height_cm"] == 180.5
        assert body["weight_kg"] == 74.5
        assert body["gender"] == "woman"
    ```
  - |
    AC3 (display name persists across load) — `api/tests/test_profile.py`:
    ```python
    def test_updating_display_name_persists_across_reload(client_with_signed_up_account):
        client_with_signed_up_account.post("/api/profile", json={"display_name": "Jordan A."})
        res = client_with_signed_up_account.get("/api/profile")
        assert res.json()["display_name"] == "Jordan A."
    ```
  - |
    AC4 (only own profile ever shown/editable) — `api/tests/test_profile.py`, mirroring
    `api/tests/test_account_isolation.py`:
    ```python
    def test_each_session_sees_and_edits_only_its_own_profile():
        client_a, client_b = TestClient(app), TestClient(app)
        client_a.post("/api/signup", json={"email": "alice@example.com", "password": "p", "display_name": "Alice"})
        client_b.post("/api/signup", json={"email": "bob@example.com", "password": "p", "display_name": "Bob"})
        client_a.post("/api/profile", json={"display_name": "Alice A."})
        assert client_a.get("/api/profile").json()["display_name"] == "Alice A."
        assert client_b.get("/api/profile").json()["display_name"] == "Bob"
    ```
  - |
    AC5 (display name too long) — `api/tests/test_profile.py`:
    ```python
    def test_display_name_over_max_length_is_rejected(client_with_signed_up_account):
        res = client_with_signed_up_account.post("/api/profile", json={"display_name": "x" * 51})
        assert res.status_code == 400
        assert "display_name" in res.json()["errors"]
        assert client_with_signed_up_account.get("/api/profile").json()["display_name"] == "Jordan"
    ```
  - |
    AC6 (display name invalid characters) — `api/tests/test_profile.py`:
    ```python
    def test_display_name_with_disallowed_characters_is_rejected(client_with_signed_up_account):
        res = client_with_signed_up_account.post("/api/profile", json={"display_name": "Jordan 🔥"})
        assert res.status_code == 400
        assert "display_name" in res.json()["errors"]
    ```
  - |
    AC7 (name propagation to other surfaces) — `web/tests/dashboard.test.js` (extend existing
    file, no new mechanism — `loadDashboard` already reads `display_name` from `/api/me`):
    ```javascript
    it('shows an updated display name on the next dashboard load after a profile save', async () => {
      global.fetch.mockResolvedValue({ status: 200, json: async () => ({ email: 'jane.doe@example.com', display_name: 'Jordan A.' }) });
      const { loadDashboard } = await loadDashboardPage();
      await loadDashboard();
      expect(document.getElementById('welcome-name').textContent).toBe('Welcome, Jordan A.');
    });
    ```
  - |
    AC8 (duplicate display names across accounts, no conflict) — `api/tests/test_profile.py`;
    no code change expected since `Account.display_name` has no unique constraint:
    ```python
    def test_two_accounts_can_share_the_same_display_name():
        client_a, client_b = TestClient(app), TestClient(app)
        client_a.post("/api/signup", json={"email": "a1@example.com", "password": "p", "display_name": "Original A"})
        client_b.post("/api/signup", json={"email": "a2@example.com", "password": "p", "display_name": "Original B"})
        res_a = client_a.post("/api/profile", json={"display_name": "Alex Rivera"})
        res_b = client_b.post("/api/profile", json={"display_name": "Alex Rivera"})
        assert res_a.status_code == 200 and res_b.status_code == 200
    ```
  - |
    AC9 (out-of-range height/weight/age, all three shown at once per reviewer decision) —
    `api/tests/test_profile.py`:
    ```python
    def test_out_of_range_body_details_are_rejected_together(client_with_signed_up_account):
        res = client_with_signed_up_account.post("/api/profile", json={
            "height_cm": "450", "weight_kg": "612", "age": "142",
        })
        assert res.status_code == 400
        errors = res.json()["errors"]
        assert set(errors) == {"height_cm", "weight_kg", "age"}
        assert errors["height_cm"] == "Height must be between 1 and 300 cm."
        assert errors["weight_kg"] == "Weight must be between 1 and 500 kg."
        assert errors["age"] == "Age must be between 1 and 120."
    ```
  - |
    AC10 (non-numeric height/weight/age) — `api/tests/test_profile.py`:
    ```python
    def test_non_numeric_body_details_are_rejected(client_with_signed_up_account):
        res = client_with_signed_up_account.post("/api/profile", json={
            "height_cm": "tall", "weight_kg": "n/a", "age": "thirty-one",
        })
        assert res.status_code == 400
        assert res.json()["errors"]["height_cm"] == "Height must be a number."
    ```
  - |
    AC10b (decimal age is rejected while decimal height/weight are accepted, per reviewer
    decision) — `api/tests/test_profile.py`:
    ```python
    def test_decimal_age_is_rejected_but_decimal_height_and_weight_are_accepted(client_with_signed_up_account):
        res = client_with_signed_up_account.post("/api/profile", json={
            "height_cm": "178.5", "weight_kg": "74.5", "age": "31.5",
        })
        assert res.status_code == 400
        assert res.json()["errors"] == {"age": "Age must be a number."}
    ```
  - |
    AC11 (boundary values accepted) — `api/tests/test_profile.py`:
    ```python
    def test_boundary_values_are_accepted(client_with_signed_up_account):
        res = client_with_signed_up_account.post("/api/profile", json={
            "height_cm": "300", "weight_kg": "500", "age": "120",
        })
        assert res.status_code == 200
        res2 = client_with_signed_up_account.post("/api/profile", json={
            "height_cm": "1", "weight_kg": "1", "age": "1",
        })
        assert res2.status_code == 200
    ```
  - |
    AC12 (gender outside predefined list, e.g. tampered/stale request) —
    `api/tests/test_profile.py`:
    ```python
    def test_gender_outside_predefined_list_is_rejected(client_with_signed_up_account):
        res = client_with_signed_up_account.post("/api/profile", json={"gender": "alien"})
        assert res.status_code == 400
        assert res.json()["errors"]["gender"] == "Select a valid gender option from the list."
    ```
  - |
    Supporting frontend test — `web/tests/profile.test.js` (new file, mirrors
    `web/tests/dashboard.test.js` structure) covering rendering of unset fields:
    ```javascript
    it('shows "Not set" for fields left blank at signup', async () => {
      global.fetch.mockResolvedValue({ status: 200, json: async () => ({
        display_name: 'Jordan', units_preference: 'metric', fitness_goal: null,
        height_cm: null, weight_kg: null, age: null, gender: null,
      }) });
      const { loadProfile } = await loadProfilePage();
      await loadProfile();
      expect(document.querySelectorAll('.not-set').length).toBeGreaterThan(0);
    });
    ```

assumptions_or_open_questions:
  - |
    Resolved with reviewer: no metric/imperial unit conversion is implemented. The prototype's
    "next load" screen (design lines 701-753) displays converted values (180 cm/74 kg canonical
    shown as 70.9 in/163 lb) when `units_preference` is imperial, but per reviewer decision height
    stays in cm and weight stays in kg always — the units preference field is stored and shown as
    selected, but never converts or relabels height/weight.
  - |
    Resolved with reviewer: the profile update endpoint returns a multi-field
    `{"errors": {field: message}}` shape so that height, weight, and age can all show their
    errors at once when submitted together invalid, matching the prototype's AC9/AC10 screens.
    This differs from the single-field `{"field", "message"}` shape used by
    `/api/signup`/`/api/login`, which is left unchanged.
  - |
    Resolved with reviewer: height and weight accept decimal values (stored as `Float`, e.g.
    74.5 kg); age remains whole-number only (stored as `Integer`) since fractional ages aren't
    meaningful and no design screen shows one.
  - |
    Resolved with reviewer: the display name punctuation allow-list is kept exactly as shown in
    the design (". , ' -" — period, comma, apostrophe, hyphen), not broadened or narrowed.
  - |
    Resolved with reviewer: added a `client_with_signed_up_account` fixture to
    `api/tests/conftest.py` to reduce repetition across the new profile tests; tests needing two
    distinct accounts (AC4, AC8) still construct their own `TestClient`s inline.

package_dependencies: []

notes: |
  All required third-party packages (fastapi, pydantic, sqlalchemy, passlib, vitest, jsdom) are
  already in use elsewhere in the codebase; no new dependencies are needed for validation,
  routing, or testing.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    ProfileHtml[web/public/profile.html]:::touched
    ProfileJs[web/public/profile.js]:::touched
    DashboardHtml[web/public/dashboard.html]:::touched
    DashboardJs[web/public/dashboard.js]
    Server[web/server.py - GET/POST proxy only]

    ProfileHtml -->|script tag| ProfileJs
    DashboardHtml -->|Profile tab link, new| ProfileHtml
    ProfileJs -->|GET/POST /api/profile via proxy| Server
    DashboardJs -->|GET /api/me via proxy, unchanged| Server

    ProfileRoute[api/app/routes/profile.py - new]:::touched
    AuthRoute[api/app/routes/auth.py - unchanged]
    Main[api/app/main.py]:::touched
    Sessions[api/app/store/sessions.py - get_account_id_for_session, reused]
    Profiles[api/app/store/profiles.py - new]:::touched
    Accounts[api/app/store/accounts.py - unchanged]
    Models[api/app/store/models.py - Account + 6 new columns]:::touched

    Server -->|forwards /api/*| ProfileRoute
    Server -->|forwards /api/*| AuthRoute
    Main -->|includes router, runs backfill| ProfileRoute
    Main -->|existing include| AuthRoute
    ProfileRoute -->|identity from sid cookie, same as /api/me| Sessions
    ProfileRoute -->|read/write fields| Profiles
    Profiles -->|reads/writes| Models
    AuthRoute -->|reads/writes| Accounts
    Accounts -->|reads/writes| Models
  ```
