summary: |
  Add a workout history view: a new authenticated `GET /api/workouts` endpoint that returns the
  signed-in account's workout entries newest-first with optional server-side filtering by
  inclusive date range and case-insensitive exercise-name substring, backed by a new
  `list_entries` store function; and a new `history.html`/`history.js` page that renders the
  list, a filter panel (start date, end date, exercise name, Apply/Clear), and a standard
  empty state, per the approved FTP-STORY-008 design prototype. Filtering is implemented
  server-side (in SQL) rather than client-side, matching the shape already established by
  `list_exercise_names(db, account)` and keeping AC2's account-scoping and AC4/5/6/7's filter
  semantics in one place instead of split across the API and the browser. Per reviewer request,
  this revision also enables and wires the previously-disabled "View in history →" button on
  `workout-entry.html`'s post-save confirmation panel so it navigates to the new page, since the
  navigation target it was waiting on now exists.

scope:
  - description: |
      Add `workouts.list_entries(db, account, start_date=None, end_date=None,
      name_contains=None) -> list[WorkoutEntry]` to `api/app/store/workouts.py`.
      Query scoped to `WorkoutEntry.account_id == account.id` (AC2), ordered
      `entry_date DESC, id DESC` (AC1 — `id` as a deterministic tie-break since `entry_date`
      has no time component and two entries can share a date), with optional
      `WorkoutEntry.entry_date >= start_date` / `<= end_date` (AC4, inclusive both ends) and
      optional `WorkoutEntry.exercise_name.ilike(f"%{escaped}%")` where `%` and `_` in the
      user-supplied name are escaped before wrapping (LIKE wildcards, not literal characters
      the user typed) — e.g.:
      ```python
      from sqlalchemy import select

      def list_entries(db, account, start_date=None, end_date=None, name_contains=None):
          stmt = select(WorkoutEntry).where(WorkoutEntry.account_id == account.id)
          if start_date is not None:
              stmt = stmt.where(WorkoutEntry.entry_date >= start_date)
          if end_date is not None:
              stmt = stmt.where(WorkoutEntry.entry_date <= end_date)
          if name_contains:
              escaped = name_contains.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
              stmt = stmt.where(WorkoutEntry.exercise_name.ilike(f"%{escaped}%", escape="\\"))
          return list(db.execute(stmt.order_by(WorkoutEntry.entry_date.desc(), WorkoutEntry.id.desc())).scalars())
      ```
      `.ilike(...)` is used (not `.like`) so case-insensitivity is explicit in code rather than
      an accident of MySQL's default collation (see `assumptions_or_open_questions`).
    files:
      - api/app/store/workouts.py
    rationale: |
      Mirrors the existing `list_exercise_names(db, account)` function's shape (same file,
      same `select(...).where(WorkoutEntry.account_id == ...)` pattern) so history listing and
      filtering live in the store layer next to `create_entry`/`validate_entry`, not split
      between the route and the browser.

  - description: |
      Add `GET /api/workouts` to `api/app/routes/workouts.py`, reusing the
      `sessions.require_account(db, sid)` / 401 pattern already used by `create_workout` and
      `get_exercise_names`. Query params `start_date`, `end_date`, `exercise_name` (all
      optional strings); invalid `start_date`/`end_date` (not ISO `YYYY-MM-DD`) returns 400
      with `{"errors": {"start_date": "..."}}`/`{"end_date": "..."}`. Response shape:
      ```python
      @router.get("/api/workouts")
      def list_workouts(
          start_date: str | None = None,
          end_date: str | None = None,
          exercise_name: str | None = None,
          db: Session = Depends(get_db),
          sid: str | None = Cookie(default=None),
      ):
          account = sessions.require_account(db, sid)
          if account is None:
              return JSONResponse(status_code=401, content={"message": "Not signed in."})
          ...
          entries = workouts.list_entries(db, account, start_date=parsed_start, end_date=parsed_end, name_contains=exercise_name)
          return {"entries": [
              {"id": e.id, "exercise_name": e.exercise_name, "entry_date": e.entry_date.isoformat(),
               "duration_minutes": e.duration_minutes, "sets": e.sets, "reps": e.reps}
              for e in entries
          ]}
      ```
    files:
      - api/app/routes/workouts.py
    rationale: |
      Gives the frontend a single scoped, filterable endpoint; AC2's cross-user isolation is
      enforced identically to the existing `/api/workouts` POST and `/api/workouts/exercise-names`
      routes via the same `require_account` call, not re-derived.

  - description: |
      Create `web/public/history.html`, following the shipped app shell used by
      `workout-entry.html` (`.page-shell` / `.top-app-bar` / `.avatar-menu` dropdown with
      "View profile"/"Logout" / `.bottom-tabs` with Today · Log · Progress · Profile), NOT the
      prototype's own top nav bar (`.app-topbar`, brand "FitTrack", Dashboard/Workouts/History/
      Profile inline links) — the prototype's shell differs from every other shipped page in
      this app including FTP-STORY-007's own shipped `workout-entry.html`, despite the
      prototype comment claiming they match (see `assumptions_or_open_questions`). Verified
      directly: `workout-entry.html` lines 43-57/84/128-131 use `.page-shell`, `.top-app-bar`,
      `.avatar-menu`/`.avatar-menu-dropdown` (View profile / Logout), and `.bottom-tabs` with a
      disabled `Progress` tab and (previously) a disabled "View in history →" button captioned
      "Viewing history is covered by FTP-STORY-008". The page-local `<style>` block (same
      pattern as `workout-entry.html`'s `.row-2`/`.autocomplete-list` rules) adds the design's
      new, not-yet-in-the-design-system classes: `.filter-panel`/`.filter-field` (start date /
      end date / exercise name inputs + Apply/Clear buttons), `.active-filters`/`.filter-chip`
      (removable chips), `.history-list`/`.history-row`/`.history-row-main`/`.history-metrics`
      (exercise name, date, and sets×reps-or-minutes per row), and `.empty-state`/
      `.empty-state-icon` (AC3's "No workouts logged yet" message, and the design's separate
      no-results-for-filter variant of the same empty-state markup). Loading skeletons and the
      load-error banner shown in the prototype are out of scope for this plan (see
      `assumptions_or_open_questions`).
    files:
      - web/public/history.html
    rationale: |
      New page needed to render the history view; the design prototype is the only record of
      its layout, so its concrete classes and structure are followed directly rather than
      invented, except for the shell, which is corrected to match the app's actual shipped
      pages.

  - description: |
      Create `web/public/history.js` (ES module, following `workout-entry.js`'s pattern of
      exporting pure functions for unit testing plus wiring DOM listeners at the bottom).
      Exports:
      - `formatMetrics(entry)` — the sets/reps-vs-minutes chooser, pure function, e.g.
        `{ sets: 0, reps: 0 } => "0 × 0"`, `{ duration_minutes: 45 } => "45 min"`. Written as
        an explicit `if (entry.duration_minutes != null) ... else if (entry.sets != null ...)`
        check (not `if (entry.sets && entry.reps)`) so the `Pull-up` fixture row's
        `{ sets: 0, reps: 0 }` still renders "0 × 0" instead of being swallowed by falsy-zero.
      - `buildQueryString({ startDate, endDate, exerciseName })` — builds the `?start_date=&
        end_date=&exercise_name=` query string sent to `GET /api/workouts`, omitting empty
        params.
      - `fetchHistory(filters)` — `fetch('/api/workouts' + buildQueryString(filters), {
        credentials: 'include' })`; returns `{ ok: true, entries }` on 200, `{ ok: false,
        sessionExpired: true }` on 401, `{ ok: false, networkError: true }` otherwise/on throw
        (mirrors `submitEntry`'s result shape in `workout-entry.js`).
      - `renderHistory(entries)` — renders `.history-row` list items into `#history-list`, or
        shows `#empty-state` (AC3 copy) when `entries.length === 0` and no filter is active, or
        shows the no-results variant when `entries.length === 0` and a filter is active.
      DOM wiring: on load, call `fetchHistory({})` and `renderHistory`; on Apply-button click,
      read the three filter inputs and call `fetchHistory`/`renderHistory` again (AC4/5/6); on
      Clear-button click, reset the three inputs and call `fetchHistory({})` (AC7); reuse
      `logout` from `session-utils.js` for the avatar-menu logout action, matching
      `workout-entry.js:171-175`.
    files:
      - web/public/history.js
    rationale: |
      Keeps DOM wiring separate from pure, directly-unit-testable functions, matching
      `workout-entry.js`'s existing test seams (`filterSuggestions`, `submitEntry` are exported
      and unit-tested the same way in `web/tests/workout-entry.test.js`).

  - description: |
      Wire the History nav item: add a "History" bottom-tab / nav link pointing at
      `history.html` to `web/public/dashboard.html` and `web/public/workout-entry.html`, in the
      same place their existing `.bottom-tabs` list links to `dashboard.html`/`profile.html`.
      `workout-entry.html`'s `Progress` bottom-tab is left disabled (see
      `assumptions_or_open_questions` — it is a separate, unrelated screen with no AC or design
      backing here).
    files:
      - web/public/dashboard.html
      - web/public/workout-entry.html
    rationale: |
      Without this, the new page is unreachable through the app's own navigation.

  - description: |
      Enable and wire the "View in history →" button on `workout-entry.html`'s post-save
      confirmation panel (`#confirm-box`, currently `disabled` with
      `title="Viewing history is covered by FTP-STORY-008"` at line 84). Remove the `disabled`
      attribute and the now-stale title, give it `id="view-history-btn"`, and in
      `workout-entry.js` add a click listener alongside the existing `logAnotherBtn` listener
      (`workout-entry.js:165-169`) that navigates to the new page:
      ```js
      const viewHistoryBtn = document.getElementById('view-history-btn');
      viewHistoryBtn?.addEventListener('click', () => {
        window.location.href = 'history.html';
      });
      ```
      This button was explicitly deferred to this story (its own caption said so), and the
      target page it points at is now built in this same plan, so wiring it is no longer
      out of scope.
    files:
      - web/public/workout-entry.html
      - web/public/workout-entry.js
    rationale: |
      The button already existed in the shipped FTP-STORY-007 page anticipating this story;
      per reviewer request, this plan now completes that loop instead of leaving it disabled,
      since the one thing blocking it (the history page existing) is delivered by this same plan.

tests:
  - |
    api/tests/test_workout_history.py::test_entries_are_returned_newest_first_with_same_date_tiebreak
    — create entries "2026-09-05"/"2026-09-20"/"2026-09-20" (two same-date entries) via
    `client_with_signed_up_account`, then:
    ```python
    res = client_with_signed_up_account.get("/api/workouts")
    dates = [e["entry_date"] for e in res.json()["entries"]]
    assert dates == ["2026-09-20", "2026-09-20", "2026-09-05"]
    ```
    (AC1)
  - |
    api/tests/test_workout_history.py::test_history_only_returns_the_signed_in_account_entries
    — following the two-client pattern in `test_account_isolation.py`:
    ```python
    client_a.post("/api/workouts", json={"exercise_name": "Squat", "entry_date": "2026-09-01", "duration_minutes": "30"})
    client_b.post("/api/workouts", json={"exercise_name": "Row", "entry_date": "2026-09-02", "duration_minutes": "30"})
    names_a = [e["exercise_name"] for e in client_a.get("/api/workouts").json()["entries"]]
    assert names_a == ["Squat"]
    ```
    (AC2)
  - |
    api/tests/test_workout_history.py::test_no_entries_returns_an_empty_list
    ```python
    res = client_with_signed_up_account.get("/api/workouts")
    assert res.json()["entries"] == []
    ```
    paired with a `web/tests/history.test.js` assertion that `renderHistory([])` (no filter
    active) shows `#empty-state` and hides `#history-list`. (AC3)
  - |
    api/tests/test_workout_history.py::test_date_range_filter_is_inclusive_of_both_boundaries
    — create entries on "2026-09-05", "2026-09-12" (boundary), "2026-09-20" (boundary),
    "2026-09-22":
    ```python
    res = client_with_signed_up_account.get("/api/workouts?start_date=2026-09-12&end_date=2026-09-20")
    dates = {e["entry_date"] for e in res.json()["entries"]}
    assert dates == {"2026-09-12", "2026-09-20"}
    ```
    (AC4)
  - |
    api/tests/test_workout_history.py::test_exercise_name_filter_matches_case_insensitively
    — save an entry with `exercise_name="Back Squat"`, then query with the opposite case to
    rule out the filter passing only because MySQL's default collation is already
    case-insensitive:
    ```python
    res = client_with_signed_up_account.get("/api/workouts?exercise_name=SQUAT")
    assert len(res.json()["entries"]) == 1
    ```
    plus a literal-`%` guard: save `exercise_name="100% Effort"`, query
    `exercise_name=100%` and assert only that entry (not every entry) matches, proving `%` is
    escaped as a literal rather than treated as a SQL LIKE wildcard. (AC5)
  - |
    api/tests/test_workout_history.py::test_date_range_and_name_filters_are_anded_together
    — two entries named "Back squat" on "2026-09-05" and "2026-09-15", one entry named "Row"
    on "2026-09-15":
    ```python
    res = client_with_signed_up_account.get(
        "/api/workouts?start_date=2026-09-10&end_date=2026-09-20&exercise_name=squat"
    )
    entries = res.json()["entries"]
    assert len(entries) == 1
    assert entries[0]["entry_date"] == "2026-09-15"
    ```
    (AC6)
  - |
    web/tests/history.test.js::"clearing an active filter refetches and renders the
    unfiltered list (AC7)" —
    ```js
    global.fetch.mockResolvedValueOnce({ status: 200, json: async () => ({ entries: [{ id: 1, exercise_name: 'Squat', entry_date: '2026-09-20', sets: 3, reps: 8 }] }) });
    document.getElementById('filter-name').value = 'squat';
    document.getElementById('apply-filters-btn').click();
    await flush();
    global.fetch.mockResolvedValueOnce({ status: 200, json: async () => ({ entries: fullFixture }) });
    document.getElementById('clear-filters-btn').click();
    await flush();
    expect(document.getElementById('filter-name').value).toBe('');
    expect(fetch).toHaveBeenLastCalledWith('/api/workouts', expect.objectContaining({ credentials: 'include' }));
    ```
  - |
    web/tests/history.test.js::"formatMetrics renders zero sets/reps instead of falling back to
    minutes (falsy-zero guard)" —
    ```js
    expect(formatMetrics({ sets: 0, reps: 0, duration_minutes: null })).toBe('0 × 0');
    expect(formatMetrics({ sets: null, reps: null, duration_minutes: 45 })).toBe('45 min');
    ```
  - |
    web/tests/workout-entry.test.js::"View in history button is enabled and navigates to
    history.html" — since jsdom's `window.location.href` assignment can't be asserted directly
    without a navigation stub, assert the button is enabled and the listener fires by spying on
    `window.location`:
    ```js
    const btn = document.getElementById('view-history-btn');
    expect(btn.disabled).toBe(false);
    delete window.location;
    window.location = { href: '' };
    btn.click();
    expect(window.location.href).toBe('history.html');
    ```

assumptions_or_open_questions:
  - |
    The prototype's `.app-topbar` shell (brand "FitTrack", inline Dashboard/Workouts/History/
    Profile nav, `.avatar-sm`) does not match any shipped page — `workout-entry.html` (from the
    already-shipped FTP-STORY-007) uses `.page-shell`/`.top-app-bar`/`.avatar-menu`/
    `.bottom-tabs` instead, despite the prototype's own comment claiming it "matches the nav
    pattern used in FTP-STORY-007's prototype." This plan builds `history.html` with the
    shipped `.page-shell` shell for consistency with the rest of the running app, and treats
    the prototype's top-nav chrome as illustrative only, not literal. Flagging this explicitly
    per instructions rather than silently picking one.
  - |
    The design shows three screens with no corresponding acceptance criterion: "History —
    Loading" (skeleton rows), "History — Load Error" (retry banner), and "History — No Results
    for Filter" (distinct from AC3's true-empty-state). The no-results state is implicitly
    required by AC4/5/6 (something must render on a zero-match filter) and is included in
    scope. Loading skeletons and the load-error banner are design polish with no AC backing
    and are left out of this plan; a plain unstyled fetch (no skeleton) and console-logged
    failure (no retry banner) are used instead, consistent with how `workout-entry.js` handles
    its own non-AC-driven states minimally.
  - |
    The `<mark>` substring-highlight styling and the "N of M entries" counter shown in the
    filtered-state screens are design-only decorations with no AC requiring them; they are not
    included in this plan's scope (no AC asks for match-highlighting or a count), but nothing
    here blocks adding them later as pure UI polish.
  - |
    Per this turn's reviewer request, the "View in history →" button on `workout-entry.html`'s
    confirmation panel is now enabled and wired to navigate to `history.html` (a plain
    full-page navigation, not an SPA-style transition, matching how `.bottom-tabs`/
    `.avatar-menu-item` links elsewhere in this app are plain `<a href>`/location changes).
    The disabled "Progress" bottom-tab is a separate, unrelated screen with no AC or design
    backing in this story and remains disabled.
  - |
    `exercise_name` filter matching is implemented as SQL `ILIKE` substring containment with
    `%`/`_` escaped so a literal percent sign or underscore in a user's exercise name (e.g.
    "100% Effort") is not treated as a SQL wildcard — the AC only says "contains", so this
    escaping is treated as required correctness rather than added scope.
  - |
    Invalid `start_date`/`end_date` query values (e.g. non-ISO strings) are assumed to return
    400 with a field-scoped error, mirroring how `POST /api/workouts` already returns 400 field
    errors for `entry_date`, rather than silently ignoring the bad filter.

package_dependencies: []

notes: |
  No new third-party dependency is needed: FastAPI query params, SQLAlchemy `ilike`, and the
  existing vanilla-JS/vitest frontend stack already cover everything this plan does.

  Verified against current code before writing this plan: `api/app/store/workouts.py` still
  has `list_exercise_names(db, account)` with the same `select(...).where(WorkoutEntry.account_id
  == ...)` shape this plan mirrors; `api/app/routes/workouts.py` still has the
  `sessions.require_account(db, sid)` / 401 pattern in `create_workout`/`get_exercise_names`;
  `web/public/workout-entry.html` still uses `.page-shell`/`.top-app-bar`/`.avatar-menu`/
  `.bottom-tabs`, and its confirmation panel (`#confirm-box`, line 78-86) still has the
  `disabled` "View in history →" button at line 84 and the `logAnotherBtn` click listener at
  `workout-entry.js:165-169` this plan's new listener sits alongside.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    HistoryHtml[history.html]:::touched
    HistoryJs[history.js]:::touched
    SessionUtils[session-utils.js]
    WorkoutEntryHtml[workout-entry.html]:::touched
    WorkoutEntryJs[workout-entry.js]:::touched

    Route[routes/workouts.py<br/>GET /api/workouts]:::touched
    Store[store/workouts.py<br/>list_entries]:::touched
    Models[store/models.py<br/>WorkoutEntry]
    Sessions[store/sessions.py<br/>require_account]

    HistoryHtml -->|loads| HistoryJs
    HistoryJs -->|reuses logout| SessionUtils
    HistoryJs -->|fetch GET, credentials include| Route
    Route -->|require_account: 401 if none, AC2 scoping| Sessions
    Route -->|calls with account, start_date, end_date, name_contains| Store
    Store -->|select ... where account_id == account.id| Models
    WorkoutEntryHtml -->|loads| WorkoutEntryJs
    WorkoutEntryJs -->|View in history button navigates to| HistoryHtml

    class HistoryHtml,HistoryJs,Route,Store,WorkoutEntryHtml,WorkoutEntryJs touched
  ```
