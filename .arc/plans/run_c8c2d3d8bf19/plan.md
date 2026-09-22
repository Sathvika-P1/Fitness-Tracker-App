summary: |
  Implement manual workout-entry creation end to end: a new `workout_entries` table/model, a
  session-authenticated `POST /api/workouts` endpoint with server-side validation (exercise name
  required, at least one of duration/sets-reps required, no negative sets/reps, no
  zero-or-negative duration, no future dates, zero valid for sets/reps), a
  `GET /api/workouts/exercise-names` endpoint returning the caller's own distinct past exercise
  names for autocomplete, and a new `workout-entry.html`/`workout-entry.js` page that builds the
  already-approved FTP-STORY-007 design (the "Entry Form — Default" screen and its
  validation/error/autocomplete states) on top of the existing `form-utils.js`/`session-utils.js`
  conventions used by profile.html/profile.js. Scope is limited to creating and persisting an
  entry — history display (FTP-STORY-008) is out of scope, so the "Save Confirmed" screen's
  "View in history →" button is rendered inert per the design's own `title` attribute noting
  that screen belongs to FTP-STORY-008. Introducing a `workout_entries` table with a foreign key
  to `accounts` also touches two existing pieces of infrastructure that would otherwise break:
  the test suite's `_clean_tables` cleanup fixture and the FTP-STORY-004 account-deletion flow,
  both updated here to delete a user's workout entries before their account row.
scope:
  - description: |
      Add a `WorkoutEntry` SQLAlchemy model to `api/app/store/models.py`, alongside the existing
      `Account`/`SessionRow` models, following the same `_utcnow()`/`Column` conventions:

      ```python
      class WorkoutEntry(Base):
          __tablename__ = "workout_entries"

          id = Column(Integer, primary_key=True, autoincrement=True)
          account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
          exercise_name = Column(String(255), nullable=False)
          entry_date = Column(Date, nullable=False)
          duration_minutes = Column(Float, nullable=True)
          sets = Column(Integer, nullable=True)
          reps = Column(Integer, nullable=True)
          created_at = Column(DateTime, nullable=False, default=_utcnow)
      ```

      `Base.metadata.create_all(engine)` in `api/app/main.py`'s `lifespan()` already creates any
      new table automatically (no backfill function needed since this is a brand-new table, not
      a column added to an existing one).
    files:
      - api/app/store/models.py
    rationale: |
      Persistence needs a durable row per entry, scoped to the owning account, mirroring the
      existing `Account`/`SessionRow`/`AccountDeletionAudit` model style (Column-based, explicit
      `_utcnow` default) already used in this file.

  - description: |
      Add `api/app/store/workouts.py` with pure validation and persistence helpers, mirroring
      the shape of `app/store/profiles.py` (validation functions returning a cleaned dict plus
      an errors dict, and separate persistence functions):

      ```python
      def validate_entry(exercise_name, entry_date_str, duration_str, sets_str, reps_str, today):
          errors: dict[str, str] = {}
          ...
          return cleaned, errors

      def create_entry(db: Session, account: Account, cleaned: dict) -> WorkoutEntry: ...

      def list_exercise_names(db: Session, account: Account) -> list[str]: ...
      ```

      Validation rules implemented here (all AC-driven):
        - exercise_name: required after `.strip()`, else `"Exercise name is required."` (AC9,
          matches the design's `#err-name` copy).
        - entry_date: required, parsed as `date`; if `> today` -> `"Future dates aren't
          allowed — choose today or an earlier date."` (AC6, matches the design's `#err-future`
          copy exactly).
        - duration and sets/reps: if duration blank AND (sets blank AND reps blank) -> `"Enter a
          duration, or sets and reps — at least one is required."` on a top-level `entry` error
          key (AC3, matches the design's `#err-blank` copy exactly).
        - duration, if provided: must parse as a number `> 0`, else `"Duration must be greater
          than zero."` (AC4, matches `#err-duration-neg` copy exactly).
        - sets/reps, if provided: must parse as an integer `>= 0`, else `"Sets can't be
          negative."` / `"Reps can't be negative."` (AC4/AC5 — zero is explicitly valid, matches
          `#err-sets-neg`/`#err-reps-neg` copy exactly).

      `list_exercise_names` returns `SELECT DISTINCT exercise_name FROM workout_entries WHERE
      account_id = :id ORDER BY exercise_name` scoped to the caller's own account only (AC7) —
      this is the server-side half of the design's autocomplete fixture list.
    files:
      - api/app/store/workouts.py
    rationale: |
      Keeps validation and DB access out of the route layer, matching the existing
      profile.py/profiles.py split (route does auth + error-shape translation, store module does
      validation + persistence) so this file fits the established layering instead of
      duplicating the pattern inline in the router.

  - description: |
      Add `api/app/routes/workouts.py` with a router exposing:

      ```python
      @router.post("/api/workouts")
      def create_workout(payload: WorkoutEntryRequest, db=Depends(get_db), sid=Cookie(default=None)):
          account = _require_account(db, sid)
          if account is None:
              return JSONResponse(status_code=401, content={"message": "Not signed in."})
          cleaned, errors = workouts.validate_entry(...)
          if errors:
              return JSONResponse(status_code=400, content={"errors": errors})
          entry = workouts.create_entry(db, account, cleaned)
          return JSONResponse(status_code=201, content={"id": entry.id, "exercise_name": entry.exercise_name})

      @router.get("/api/workouts/exercise-names")
      def get_exercise_names(db=Depends(get_db), sid=Cookie(default=None)):
          account = _require_account(db, sid)
          if account is None:
              return JSONResponse(status_code=401, content={"message": "Not signed in."})
          return {"names": workouts.list_exercise_names(db, account)}
      ```

      `_require_account(db, sid)` at `api/app/routes/profile.py:29` is duplicated locally the
      same way `profile.py` already duplicates it rather than importing a shared helper (no such
      shared module currently exists), so this file defines its own copy rather than introducing
      a new shared module. Register the router in `api/app/main.py`:
      `app.include_router(workouts_router)` next to the existing `profile_router` include.
    files:
      - api/app/routes/workouts.py
      - api/app/main.py
    rationale: |
      A 401 with no DB write satisfies AC10 (unauthenticated submit rejected, nothing saved); a
      400 with a per-field/`entry` error map satisfies AC3/AC4/AC6/AC9 in the same response shape
      the frontend already knows how to render (`renderErrors`-style) from the profile flow.

  - description: |
      Update `api/tests/conftest.py`'s `_clean_tables` autouse fixture (currently at line 37,
      body confirmed as `SessionRow.delete()` / `DeletionLockoutFailure.delete()` /
      `Account.delete()` / `AccountDeletionAudit.delete()` in that order) to also delete
      `WorkoutEntry` rows, inserted BEFORE `Account.delete()`:

      ```python
      db.query(SessionRow).delete()
      db.query(DeletionLockoutFailure).delete()
      db.query(WorkoutEntry).delete()   # new — must run before Account.delete()
      db.query(Account).delete()
      db.query(AccountDeletionAudit).delete()
      ```
    files:
      - api/tests/conftest.py
    rationale: |
      This fixture runs `autouse=True` for the entire suite; adding a child table with a hard FK
      to `accounts` without updating the matching cleanup order is a guaranteed regression across
      every existing test file, not a hypothetical edge case.

  - description: |
      Update `api/app/store/accounts.py`'s `delete_account` (currently at line 60: deletes
      `SessionRow` then `DeletionLockoutFailure` rows scoped by `account_id`, then
      `db.delete(account)` / `db.commit()`) to also remove the account's workout entries before
      deleting the account row:

      ```python
      def delete_account(db: Session, account: Account) -> None:
          db.query(SessionRow).filter(SessionRow.account_id == account.id).delete()
          db.query(DeletionLockoutFailure).filter(
              DeletionLockoutFailure.account_id == account.id
          ).delete()
          db.query(WorkoutEntry).filter(WorkoutEntry.account_id == account.id).delete()
          db.delete(account)
          db.commit()
      ```
    files:
      - api/app/store/accounts.py
    rationale: |
      FTP-STORY-004's account deletion (`api/tests/test_account_deletion.py`) currently deletes
      an `Account` row directly; once `workout_entries.account_id` is a FK to `accounts.id`,
      deleting an account that has any logged workout would raise an `IntegrityError` and break
      that existing, already-shipped feature unless this cleanup is added alongside the new
      model.

  - description: |
      Create `web/public/workout-entry.html`, built from the design's "Entry Form — Default"
      markup (read directly from `.arc/designs/FTP-STORY-007-design.html`): the SHIPPED app's
      `top-app-bar` + avatar-menu (matching `dashboard.html`'s existing top bar/avatar-menu
      markup and its `avatar-menu.js` script include) plus the shipped `bottom-tabs`, then a
      `page-wrap` containing the `<h1>Log a workout</h1>` / subtitle, a `field` with a
      `role="combobox"` exercise-name input plus an `autocomplete-list` `<ul role="listbox">`
      exactly as in the design's `#exercise-default`/`#ac-list-default` markup, a date `field`
      with `type="date"` and the design's hint text ("Today or earlier — future dates aren't
      allowed."), a `row-2` of duration/sets/reps number fields with the design's hint ("Provide
      duration or sets/reps (or both). Zero is a valid value for sets/reps."), a `banner` (hidden
      by default) for the generic save-error state (AC8, matching the design's "Save Failed —
      Network/Server Error" screen banner copy verbatim: "Something went wrong" / "We couldn't
      save your workout. Check your connection and try again — your entry hasn't been lost."),
      and a `btn btn-primary` submit button. Each field gets a `field-error` paragraph
      placeholder (as in the design's "Validation — Negative Values"/"Validation — Exercise Name
      Blank" screens, ids `err-duration-neg`/`err-sets-neg`/`err-reps-neg`/`err-future`/
      `err-name`/`err-blank`), wired via `form-utils.js`'s `setFieldError`/`clearFieldError`
      (confirmed at `web/public/form-utils.js:10,20`, using the `id + '-error'` convention), so
      field ids must be `exercise-name`, `entry-date`, `duration`, `sets`, `reps`. Link
      `tokens.css` and `prototype-utils.css` as `dashboard.html` does.

      Design/codebase conflict, called out per instructions rather than silently resolved: the
      prototype's chrome (confirmed by reading the design file) is a plain `.app-topbar` reading
      "FitTrack" with nav links "Dashboard · Workouts · History · Profile" (design lines
      679-687), but the shipped app (`dashboard.html`) instead uses a `top-app-bar` with a
      welcome name/avatar-menu plus `bottom-tabs` (Today / Log / Progress / Profile) — confirmed
      the prototype's nav bar markup does not exist anywhere in `web/public/`. This plan adopts
      the SHIPPED chrome (matching `dashboard.html`/`profile.html`) rather than introducing the
      prototype's separate top-nav style, since consistency with every other already-built
      screen outweighs matching a nav bar the design's own comment (line 571) notes is
      demo-only ("fitness-tracker app; no arc chrome").
    files:
      - web/public/workout-entry.html
    rationale: |
      This is the literal form screen approved in FTP-STORY-007-design.html ("Entry Form —
      Default", with the "Autocomplete Suggestions", "Validation — *", and "Save Failed"/
      "Session Expired" states layered onto the same markup via JS-driven show/hide of banners
      and field-error elements) — no new visual design is being invented for the form itself,
      only the chrome wrapper is taken from the shipped app instead of the prototype's demo-only
      top nav.

  - description: |
      Create `web/public/workout-entry.js` implementing: (1) a debounced input listener on
      `#exercise-name` that calls `GET /api/workouts/exercise-names`, filters client-side by
      case-insensitive substring match against the typed value, and renders matching names as
      `<li class="autocomplete-option" role="option">` entries in `#ac-list` (never disabling
      free typing — clicking an option or pressing Enter on it just sets the input value, per AC7
      and the design's "Autocomplete Suggestions" screen note "Keep typing or pick a suggestion —
      free text is always accepted"); (2) a submit handler that disables the button, sets its
      text to "Saving…" (matching the design's "Submitting" screen), POSTs to `/api/workouts`,
      and on success shows a confirmation state and clears the form for a subsequent entry, on
      401 shows the design's "Session Expired — Unauthenticated Submit" banner copy verbatim
      ("Your session has expired" / "Please sign in again to save this workout. Nothing has been
      saved yet — your entry below is preserved.") WITHOUT clearing or navigating away from any
      field value, on 400 renders per-field errors via `setFieldError` without clearing values
      (AC3/AC4/AC6/AC9), and on network/fetch-throw or any other non-2xx status shows the generic
      "Save Failed" banner without clearing values (AC8). Export the pure functions
      (`collectFormValues`, `filterSuggestions`, `submitEntry`, `renderValidationErrors`) for unit
      testing, following `profile.js`'s export-then-wire-DOM-listeners pattern.

      ```javascript
      export function filterSuggestions(names, query) {
        const q = query.trim().toLowerCase();
        if (!q) return [];
        return names.filter((n) => n.toLowerCase().includes(q));
      }

      export async function submitEntry(values) {
        let res;
        try {
          res = await fetch('/api/workouts', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(values),
          });
        } catch (error) {
          return { ok: false, networkError: true };
        }
        if (res.status === 201) return { ok: true, entry: await res.json() };
        if (res.status === 401) return { ok: false, sessionExpired: true };
        if (res.status === 400) return { ok: false, errors: (await res.json()).errors || {} };
        return { ok: false, networkError: true };
      }
      ```

      Deliberate departure from `profile.js`'s `saveProfile`, called out explicitly: `profile.js`
      redirects to `login.html` immediately on a 401 (`window.location.href = 'login.html'`),
      which would discard the in-progress entry. AC10 and the design's "Session Expired" screen
      both require the entered values to be preserved for retry, so `workout-entry.js` must show
      an inline "sign in and retry" banner instead of navigating away on `sessionExpired` — the
      fetch-wrapper *shape* (`{ ok, sessionExpired, networkError, errors }`) is reused from
      `profile.js`, but the caller's reaction to `sessionExpired` is intentionally different.
    files:
      - web/public/workout-entry.js
    rationale: |
      Mirrors `profile.js`'s existing try/catch fetch-wrapper result shape so the
      network-failure and validation-error branches behave consistently across the app, while
      diverging on the 401 branch specifically because AC10/AC8 require data preservation that
      `profile.js`'s immediate-redirect behavior would violate.

  - description: |
      Wire a real entry point: change the dashboard empty-state's plain, unlinked
      `<button class="btn btn-primary">Log a workout</button>` (confirmed at
      `web/public/dashboard.html:49`, not a `bottom-tab`, so this does not touch or conflict with
      the `.bottom-tab[aria-disabled]` assertions in `web/tests/profile.test.js`/
      `dashboard.test.js`) into an anchor styled the same way that navigates to
      `workout-entry.html`. The `bottom-tabs`' "Log" tab keeps its current `aria-disabled="true"`
      placeholder state — re-enabling that tab is left out of scope since neither the story nor
      the design's own chrome (see prior scope item's design/codebase-conflict note) specifies
      bottom-tab wiring, only the "Log a workout" call to action.
    files:
      - web/public/dashboard.html
    rationale: |
      Without an entry point, the new page would be unreachable in the app; the plain button is
      the one dashboard element that already exists for exactly this purpose and has no existing
      test asserting it stays a `<button>`, unlike the `bottom-tabs`.
tests:
  - |
    api/tests/test_workout_entry.py::test_valid_entry_with_duration_only_is_saved -
    `res = client_with_signed_up_account.post("/api/workouts", json={"exercise_name": "Back squat", "entry_date": "2026-09-20", "duration_minutes": "30"})`
    `assert res.status_code == 201`
    `assert res.json()["exercise_name"] == "Back squat"` (AC1)
  - |
    api/tests/test_workout_entry.py::test_valid_entry_appears_when_listed_directly_via_store -
    since history display is FTP-STORY-008 and there is no GET-all-entries endpoint in this
    story's scope, AC2 is verified at the persistence layer: POST through
    `client_with_signed_up_account`, then open a NEW `db` session (not reused from before the
    call, to avoid a stale-snapshot false negative under MySQL's default REPEATABLE READ
    isolation) and query after the response returns:
    `res = client_with_signed_up_account.post("/api/workouts", json={"exercise_name": "Deadlift", "entry_date": "2026-09-20", "duration_minutes": "30"})`
    `assert res.status_code == 201`
    `assert db.query(WorkoutEntry).filter_by(account_id=account.id).count() == 1` (AC2)
  - |
    api/tests/test_workout_entry.py::test_blank_duration_and_sets_reps_is_rejected -
    `res = client_with_signed_up_account.post("/api/workouts", json={"exercise_name": "Deadlift", "entry_date": "2026-09-20"})`
    `assert res.status_code == 400`
    `assert "at least one is required" in res.json()["errors"]["entry"].lower()` (AC3)
  - |
    api/tests/test_workout_entry.py::test_negative_sets_reps_and_nonpositive_duration_are_each_rejected -
    parametrized over `{"duration_minutes": "-5"}`, `{"sets": "-2"}`, `{"reps": "-1"}`,
    `{"duration_minutes": "0"}` merged onto a valid base payload; for each,
    `assert res.status_code == 400` and the relevant field key is present in `res.json()["errors"]` (AC4)
  - |
    api/tests/test_workout_entry.py::test_zero_sets_and_reps_is_valid -
    `res = client_with_signed_up_account.post("/api/workouts", json={"exercise_name": "Pull-up", "entry_date": "2026-09-20", "sets": "0", "reps": "0"})`
    `assert res.status_code == 201` (AC5)
  - |
    api/tests/test_workout_entry.py::test_future_date_is_rejected -
    `res = client_with_signed_up_account.post("/api/workouts", json={"exercise_name": "Row", "entry_date": "2999-01-01", "duration_minutes": "20"})`
    `assert res.status_code == 400`
    `assert "future" in res.json()["errors"]["entry_date"].lower()` (AC6)
  - |
    api/tests/test_workout_entry.py::test_exercise_names_are_scoped_to_the_caller_account -
    two accounts, each logging one entry, verifying the autocomplete endpoint only returns the
    caller's own names (AC7's server-side scoping, not just the client-side substring filter):
    `client_a.post("/api/workouts", json={"exercise_name": "Back squat", "entry_date": "2026-09-20", "duration_minutes": "10"})`
    `client_b.post("/api/workouts", json={"exercise_name": "Bench press", "entry_date": "2026-09-20", "duration_minutes": "10"})`
    `res = client_a.get("/api/workouts/exercise-names")`
    `assert res.json()["names"] == ["Back squat"]` (AC7)
  - |
    web/tests/workout-entry.test.js - `it('filters suggestions to substring matches without restricting free text')`:
    `expect(filterSuggestions(['Back squat', 'Bench press'], 'b')).toEqual(['Back squat', 'Bench press'])`
    and a follow-up asserting `filterSuggestions` returns `[]` for an unmatched query while a DOM
    check confirms the input's own typed value is never overwritten or reset when no suggestion
    matches (AC7)
  - |
    web/tests/workout-entry.test.js - `it('shows the generic save-error banner and preserves entered values on a network failure')`:
    `global.fetch.mockRejectedValue(new Error('down'))`
    `const result = await submitEntry({ exercise_name: 'Squat', entry_date: '2026-09-20', duration_minutes: '30' })`
    `expect(result).toEqual({ ok: false, networkError: true })`
    plus a DOM-level assertion that `document.getElementById('exercise-name').value` is unchanged
    after the failed submit handler runs (AC8)
  - |
    api/tests/test_workout_entry.py::test_blank_exercise_name_is_rejected -
    `res = client_with_signed_up_account.post("/api/workouts", json={"exercise_name": "", "entry_date": "2026-09-20", "duration_minutes": "45"})`
    `assert res.status_code == 400`
    `assert res.json()["errors"]["exercise_name"] == "Exercise name is required."` (AC9)
  - |
    api/tests/test_workout_entry.py::test_unauthenticated_submit_is_rejected_and_nothing_saved -
    `client = TestClient(app)` (no signup/session cookie)
    `res = client.post("/api/workouts", json={"exercise_name": "Squat", "entry_date": "2026-09-20", "duration_minutes": "10"})`
    `assert res.status_code == 401`
    Query for the row count AFTER the request completes, using a freshly-opened `db` fixture
    session (not one opened before the request), to avoid a stale-snapshot pass under MySQL
    REPEATABLE READ:
    `assert db.query(WorkoutEntry).count() == 0` (AC10)
  - |
    api/tests/test_account_deletion.py - extend the existing deletion test(s) with a case that
    logs a workout entry before deleting the account, asserting the delete still succeeds and the
    entry row is gone:
    `client.post("/api/workouts", json={"exercise_name": "Squat", "entry_date": "2026-09-20", "duration_minutes": "10"})`
    `... existing deletion flow ...`
    `assert db.query(WorkoutEntry).filter_by(account_id=account.id).count() == 0`
    This guards the `accounts.delete_account` change in scope and is not itself a numbered AC,
    but is required to prevent this story from silently breaking FTP-STORY-004.
assumptions_or_open_questions:
  - |
    The design's "Save Confirmed" screen shows a "View in history →" button with
    `title="Viewing history is covered by FTP-STORY-008"`; this plan renders that button but
    leaves it inert (no href/handler) since wiring it to a real history view is explicitly out of
    scope for this story.
  - |
    No existing shared `_require_account` helper module exists — `profile.py` already duplicates
    this function rather than importing it from `auth.py`; this plan follows that established
    (if non-DRY) precedent by adding a third copy in `routes/workouts.py` rather than introducing
    a new shared auth-helpers module, since refactoring that duplication is not part of this
    story.
  - |
    The API response code for a successful create is assumed to be `201 Created` (the codebase's
    other mutating endpoints, e.g. `POST /api/profile`, return `200`); `201` was chosen since this
    creates a new resource, but the reviewer may prefer `200` for consistency with `/api/profile`
    — flagging this as an open question.
  - |
    Duration is assumed to be a plain number of minutes (`Float`) with no unit selector in the
    design (label is literally "Duration (minutes)"), and sets/reps are assumed to be plain
    integers with no per-set weight/reps-per-set breakdown, matching the design's flat
    three-field row (Duration / Sets / Reps).
  - |
    `GET /api/workouts/exercise-names` is a new endpoint invented to serve AC7's autocomplete
    requirement client-side (filtering happens in JS against a small fetched list) rather than a
    server-side `?q=` search parameter, since the design's fixture list is small (6 names) and
    the story doesn't specify pagination/limits for a user's exercise vocabulary.
  - |
    Design-vs-codebase conflict (flagged rather than silently resolved): the prototype's page
    chrome (a plain `.app-topbar` reading "FitTrack" with "Dashboard · Workouts · History ·
    Profile" nav links, confirmed at design lines 679-687, and explicitly called out in the
    design's own comment at line 571 as demo-only "no arc chrome") does not match the shipped
    app's chrome (`top-app-bar` + avatar-menu + `bottom-tabs`, as seen in
    `dashboard.html`/`profile.html`). This plan uses the shipped chrome for consistency with
    every other already-built screen and does not attempt to reproduce the prototype's
    standalone nav bar or re-point a "Workouts" link that doesn't exist in the real app.
  - |
    Deliberate departure from `profile.js`'s convention (flagged rather than silently mirrored):
    `saveProfile`'s caller redirects to `login.html` on a 401, discarding form state. AC8/AC10 and
    the design's "Session Expired" screen require entered data to survive a 401, so
    `workout-entry.js`'s submit handler shows an inline banner and keeps the form populated
    instead of redirecting, even though it reuses `profile.js`'s `{ ok, sessionExpired, ... }`
    result shape.
package_dependencies: []
notes: |
  Design source read directly from `.arc/designs/FTP-STORY-007-design.html` (1198 lines):
  the file defines its own scoped `<style>` block for `.field`, `.autocomplete-list`/
  `.autocomplete-option`, `.banner`/`.banner-info`, `.confirm-box`, and reuses tokens from the
  shared token set (`--color-primary`, `--color-danger`, etc.) — a comment at line 572-576
  confirms no `--color-success`/positive-status token exists, so the confirmation screen
  deliberately uses `--color-primary` plus a ✓ glyph, never color alone. All eleven "screens" in
  the prototype are states of one form: Entry Form — Default, Autocomplete Suggestions,
  Submitting, Save Confirmed, Validation — Both Blank, Validation — Negative Values, Zero
  Sets/Reps — Valid, Validation — Future Date, Validation — Exercise Name Blank, Save Failed —
  Network/Server Error, and Session Expired — Unauthenticated Submit. This plan's
  `workout-entry.html`/`.js` reproduce that single form and drive it through the same states via
  real fetch calls rather than the prototype's `go()`/`submitThen()` demo script, while
  substituting the shipped app's chrome for the prototype's demo-only top nav (see the
  design/codebase-conflict note above).

  Existing code read to match conventions, with exact locations confirmed this session:
  `api/app/routes/profile.py` (`_require_account` at line 29, JSONResponse error shapes),
  `api/app/store/profiles.py` (validation-helper style), `api/app/store/models.py`/`sessions.py`
  (`_utcnow`, Column conventions), `api/app/store/accounts.py`'s `delete_account` (line 60,
  existing child-row cleanup order confirmed — now must also remove `WorkoutEntry` rows),
  `api/tests/conftest.py`'s `_clean_tables` (line 37, confirmed delete order:
  SessionRow -> DeletionLockoutFailure -> Account -> AccountDeletionAudit, extended here to
  insert `WorkoutEntry` before `Account`), `web/public/profile.js`/`form-utils.js`
  (`setFieldError`/`clearFieldError` confirmed at lines 10/20, `id + '-error'` convention)/
  `session-utils.js` (fetch-wrapper result-object pattern: `{ ok, sessionExpired, networkError,
  errors }`), and `web/public/dashboard.html` (the plain "Log a workout" button confirmed at
  line 49, not a `bottom-tab`, so this plan's change to it does not conflict with the
  `.bottom-tab[aria-disabled]` assertions in `web/tests/profile.test.js`/`dashboard.test.js`).

  ```mermaid
  flowchart TD
    subgraph API
      main[api/app/main.py]
      workoutsRoute[api/app/routes/workouts.py]
      workoutsStore[api/app/store/workouts.py]
      models[api/app/store/models.py]
      sessionsStore[api/app/store/sessions.py]
      profileRoute[api/app/routes/profile.py]
      accountsStore[api/app/store/accounts.py]
      conftest[api/tests/conftest.py]
    end
    subgraph WEB
      dashboardHtml[web/public/dashboard.html]
      entryHtml[web/public/workout-entry.html]
      entryJs[web/public/workout-entry.js]
      sessionUtils[web/public/session-utils.js]
      formUtils[web/public/form-utils.js]
    end

    main --> workoutsRoute
    workoutsRoute --> workoutsStore
    workoutsStore --> models
    workoutsRoute --> sessionsStore
    profileRoute -. existing pattern reused .-> workoutsRoute
    accountsStore -- "must delete WorkoutEntry rows first" --> models
    conftest -- "cleanup order updated" --> models
    dashboardHtml -- "Log a workout button" --> entryHtml
    entryHtml --> entryJs
    entryJs -- fetch --> workoutsRoute
    entryJs -. reuses fetch/error-shape pattern, diverges on 401 .-> sessionUtils
    entryJs -. reuses setFieldError/clearFieldError .-> formUtils

    classDef touched fill:#f96,color:#000
    class workoutsRoute,workoutsStore,models,main,entryHtml,entryJs,dashboardHtml,accountsStore,conftest touched
  ```
