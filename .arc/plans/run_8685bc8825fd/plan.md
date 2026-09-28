summary: |
  Add "Edit Workout Entry" so a user can update the exercise name, date, duration and
  sets/reps of one of their own existing workout entries, reusing the exact validation
  rules from creation (`app.store.workouts.validate_entry`). Backend gets a
  `GET /api/workouts/{entry_id}` (prefill) and `PUT /api/workouts/{entry_id}` (save)
  route, an ownership check that returns 403 for another account's entry and 404 for a
  missing/deleted one, and a plain full-replacement UPDATE with no version/conflict
  column so concurrent saves are last-write-wins with no warning surfaced to either
  session (AC9, AC10) and no edit history is ever retrievable (AC12). Frontend gets a
  new `edit-workout.html` / `edit-workout.js` page reached from an "Edit" button added
  to each row in `history.html`, built from the approved FTP-STORY-009 prototype at
  `.arc/designs/FTP-STORY-009-design.html` (screens 1-7; screen 8's split-panel concurrency
  demo and the reviewer-only toggle panels/checkbox are prototype scaffolding, not product
  UI, and are excluded). Shared per-field validation/rendering logic already living in
  `workout-entry.js` is extracted into a side-effect-free module so both the create and
  edit pages can use it without triggering workout-entry.js's page-load side effects
  (auto-filling today's date, fetching exercise-name suggestions).

scope:
  - description: |
      Add a store-layer lookup that also enforces ownership, returning a tri-state result
      so the route can map it to 200/403/404 without querying twice.

      New in `api/app/store/workouts.py`:
      ```python
      from typing import Literal

      def get_entry_for_account(
          db: Session, account: Account, entry_id: int
      ) -> tuple[WorkoutEntry | None, Literal["ok", "not_found", "forbidden"]]:
          entry = db.get(WorkoutEntry, entry_id)
          if entry is None:
              return None, "not_found"
          if entry.account_id != account.id:
              return None, "forbidden"
          return entry, "ok"

      def update_entry(db: Session, entry: WorkoutEntry, cleaned: dict) -> WorkoutEntry:
          entry.exercise_name = cleaned["exercise_name"]
          entry.entry_date = cleaned["entry_date"]
          entry.duration_minutes = cleaned.get("duration_minutes")
          entry.sets = cleaned.get("sets")
          entry.reps = cleaned.get("reps")
          db.commit()
          db.refresh(entry)
          return entry
      ```
      `update_entry` does a plain full-replacement UPDATE (no optimistic-lock/version
      column, no history/audit row) — this is what makes AC9 (last-write-wins) and
      AC12 (no version ever retrievable) fall out with no extra code.
    files:
      - api/app/store/workouts.py
    rationale: |
      Reuses the existing `validate_entry` cleaned-dict shape from creation so edit
      goes through the identical validation rules (AC2, AC4, AC5), and keeps the
      ownership/not-found decision in one place the route can trust.

  - description: |
      Add `GET /api/workouts/{entry_id}` (prefill) and `PUT /api/workouts/{entry_id}`
      (save) to `api/app/routes/workouts.py`, reusing `WorkoutEntryRequest`.

      Route-ordering trap: `GET /api/workouts/exercise-names` is already registered on
      the same router. `GET /api/workouts/{entry_id}` with `entry_id: int` MUST be
      declared after `exercise-names`, or FastAPI/Starlette will try to match
      "exercise-names" against `int` and return a 422 for that existing endpoint instead
      of resolving it — this task must not silently break the FTP-STORY-008 endpoint.

      ```python
      @router.get("/api/workouts/{entry_id}")
      def get_workout(entry_id: int, db=Depends(get_db), sid: str | None = Cookie(default=None)):
          account = sessions.require_account(db, sid)
          if account is None:
              return JSONResponse(status_code=401, content={"message": "Not signed in."})
          entry, status = workouts.get_entry_for_account(db, account, entry_id)
          if status == "not_found":
              return JSONResponse(status_code=404, content={"message": "This workout no longer exists."})
          if status == "forbidden":
              return JSONResponse(status_code=403, content={"message": "You can only edit workouts you've logged yourself."})
          return {
              "id": entry.id, "exercise_name": entry.exercise_name,
              "entry_date": entry.entry_date.isoformat(),
              "duration_minutes": entry.duration_minutes, "sets": entry.sets, "reps": entry.reps,
          }

      @router.put("/api/workouts/{entry_id}")
      def update_workout(entry_id: int, payload: WorkoutEntryRequest, db=Depends(get_db), sid: str | None = Cookie(default=None)):
          account = sessions.require_account(db, sid)
          if account is None:
              return JSONResponse(status_code=401, content={"message": "Not signed in."})
          entry, status = workouts.get_entry_for_account(db, account, entry_id)
          if status == "not_found":
              return JSONResponse(status_code=404, content={"message": "This workout no longer exists."})
          if status == "forbidden":
              return JSONResponse(status_code=403, content={"message": "You can only edit workouts you've logged yourself."})
          cleaned, errors = workouts.validate_entry(
              payload.exercise_name, payload.entry_date, payload.duration_minutes,
              payload.sets, payload.reps, datetime.date.today(),
          )
          if errors:
              return JSONResponse(status_code=400, content={"errors": errors})
          updated = workouts.update_entry(db, entry, cleaned)
          return {"id": updated.id, "exercise_name": updated.exercise_name}
      ```

      Design-vs-AC conflict, flagged rather than silently resolved: the prototype's
      screen 6 note says the not-owner refusal "doesn't reveal whether the entry
      exists or who owns it" (a single generic response), but AC8 (refuse non-owner)
      and AC13 (generic not-found for a deleted entry) are two separate ACs with two
      different required UI outcomes (refusal vs. redirect-to-history). This plan
      returns distinct 403 and 404 so the frontend can render screen 6 vs. the
      AC13/AC14 not-found+redirect flow correctly; this does technically let a caller
      distinguish "not yours" from "doesn't exist" for a given id, which is a narrower
      information leak than the prototype's copy implies. See open questions.
    files:
      - api/app/routes/workouts.py
    rationale: |
      Implements AC1, AC2, AC3 (via the store update + existing GET /api/workouts list
      used by history.html), AC4, AC5, AC8, AC9, AC10, AC11, AC13 at the API layer.

  - description: |
      Extract the side-effect-free parts of `workout-entry.js` (field-id mapping,
      `collectFormValues`, `renderValidationErrors`, `clearValidationErrors`) into a new
      shared module `web/public/workout-form.js`, and re-export them from
      `workout-entry.js` so its existing behavior and tests are unchanged. Needed
      because `workout-entry.js` has unconditional top-level side effects
      (`initializeDate()` writes today's date into `#entry-date`; it also fetches
      `/api/workouts/exercise-names` when `#exercise-name` exists) that must not fire on
      the edit page.
    files:
      - web/public/workout-form.js
      - web/public/workout-entry.js
    rationale: |
      Avoids duplicating the field-id map and validation-rendering logic between create
      and edit while keeping `workout-entry.js`'s own page wiring intact and its existing
      `web/tests/workout-entry.test.js` suite green with no changes.

  - description: |
      New edit page, built from prototype screens 2-7 (loading→pre-filled form,
      inline validation errors with values preserved, saving/network-error/success,
      discard-confirm modal, not-owner refusal, deleted-entry not-found). Reuses the
      existing `.page-shell` / `.top-app-bar` / avatar-menu / `.bottom-tabs` app shell
      from `history.html`/`workout-entry.html` rather than the prototype's standalone
      `.topnav` — the prototype is a design-system reviewer artifact for the form itself,
      and every previously-built page in this app uses the real app shell instead (see
      open questions). Fields, ids and layout (label, `.input`, `.field-error-text`,
      `.two-col` row for duration/sets/reps, `.helper-text` "Must be today ... or
      earlier") are taken directly from screen 2's `#editload-loaded` markup, reusing
      the same element ids (`exercise-name`, `entry-date`, `duration`, `sets`, `reps`)
      as `workout-entry.html` so `workout-form.js` helpers work unmodified. The
      prototype's "Notes" field and its reviewer-only "simulate network/server error"
      checkbox and toggle panels are excluded (see open questions / notes).

      `edit-workout.js` responsibilities:
      - Read `?id=` from the URL. `GET /api/workouts/{id}`:
        - 200 → prefill form (AC1, AC11 — no age-based branch, same code path for any date).
        - 403 → hide form, render "Can't edit this workout" / "You can only edit
          workouts you've logged yourself." banner (prototype screen 6) (AC8).
        - 404 → render "This workout no longer exists." and redirect to
          `history.html?deleted=1` (AC13, AC14).
        - network/other → generic banner, "Retry" button.
      - On submit: `PUT /api/workouts/{id}` with the same body shape `workout-entry.js`
        posts (`exercise_name`, `entry_date`, `duration_minutes`, `sets`, `reps`).
        - 200 → redirect to `history.html?updated={id}` (AC2, AC3).
        - 400 → `renderValidationErrors(body.errors)`, keep all typed values in the
          form, no navigation (AC4, AC5).
        - 403 → same not-owner banner as load (AC8).
        - 404 → "This workout no longer exists." banner, then redirect to
          `history.html?deleted=1` (AC13, AC14).
        - network error / non-4xx → generic banner ("Something went wrong... check
          your connection and try again"), form values untouched, "Retry" re-submits
          the same in-memory values (AC6, AC7).
    files:
      - web/public/edit-workout.html
      - web/public/edit-workout.js
    rationale: |
      Delivers the edit UI end to end per the approved prototype's screens 2, 3, 4, 6, 7,
      satisfying AC1-AC8, AC11, AC13, AC14 on the client.

  - description: |
      Add an "Edit" button to each row rendered by `renderHistory` in `history.js`
      (prototype screen 1's `<button class="btn btn-secondary btn-sm" onclick="openEdit(...)">Edit</button>`
      pattern, adapted to a real link since this app has no client router), linking to
      `edit-workout.html?id={entry.id}`. Read `?updated=` and `?deleted=` query params on
      load: `updated` renders the `banner-success` "Changes saved." banner (screen 1's
      `history-updated` state) and adds a highlighted/`.updated`-style border to that
      row; `deleted` renders the `banner-info` "That workout no longer exists." banner
      (screen 1's `history-deleted` state). Both are one-shot: replace the URL via
      `history.replaceState` after reading so a refresh doesn't re-show the banner.
    files:
      - web/public/history.html
      - web/public/history.js
    rationale: |
      Implements the AC1 entry point and the AC3/AC14 "return to history, see the
      result immediately" requirements using the exact history-list sub-states already
      approved in the prototype.

  - description: |
      Register the new static page with the existing dev static server (verify no route
      list needs an explicit new entry; `web/server.py` serves everything already present
      under `web/public/` — confirm the same holds for the new file and note if not).
    files:
      - web/server.py
    rationale: |
      Ensures `edit-workout.html`/`edit-workout.js` are reachable in the same way as
      `workout-entry.html` without hand-adding a route if the server does directory-style
      static serving already.

tests:
  - |
    api/tests/test_workout_edit.py::test_get_prefills_owned_entry_with_current_values (AC1):
    create an entry via POST, then
    `res = client.get(f"/api/workouts/{entry_id}")`
    `assert res.status_code == 200`
    `assert res.json() == {"id": entry_id, "exercise_name": "Back squat", "entry_date": "2026-09-20", "duration_minutes": 30, "sets": None, "reps": None}`
  - |
    api/tests/test_workout_edit.py::test_valid_put_updates_stored_values (AC2):
    `res = client.put(f"/api/workouts/{entry_id}", json={"exercise_name": "Front squat", "entry_date": "2026-09-21", "duration_minutes": "45"})`
    `assert res.status_code == 200`
    `db.rollback(); row = db.get(WorkoutEntry, entry_id)`
    `assert row.exercise_name == "Front squat" and row.duration_minutes == 45`
  - |
    web/tests/history.test.js — "a just-saved edit appears immediately with the success banner (AC3)":
    load `history.html?updated=1` with fetch resolving `{ entries: [{ id: 1, exercise_name: 'Front squat', entry_date: '2026-09-21', duration_minutes: 45, sets: null, reps: null }] }`
    `expect(document.querySelector('.banner-success').hidden).toBe(false)`
    `expect(document.querySelector('.history-row.updated .history-exercise').textContent).toBe('Front squat')`
  - |
    api/tests/test_workout_edit.py::test_invalid_put_is_rejected (AC4), parametrized like
    `test_negative_sets_reps_and_nonpositive_duration_are_each_rejected`:
    `res = client.put(f"/api/workouts/{entry_id}", json={"exercise_name": "Squat", "entry_date": "2026-09-20", "sets": "-1"})`
    `assert res.status_code == 400`
    `assert "sets" in res.json()["errors"]`
  - |
    api/tests/test_workout_edit.py::test_rejected_put_leaves_stored_values_unchanged (AC5):
    same as AC4 test, then
    `db.rollback(); row = db.get(WorkoutEntry, entry_id)`
    `assert row.sets == original_sets and row.exercise_name == original_name`
  - |
    web/tests/edit-workout.test.js — "network error on save shows a generic banner and keeps typed values (AC6, AC7)":
    `global.fetch = vi.fn().mockResolvedValueOnce({status:200, json: async () => ({...})}).mockRejectedValueOnce(new Error('network'))`
    fill `#exercise-name` with `'Changed name'`, click save
    `await flush()`
    `expect(document.getElementById('save-error-banner').hidden).toBe(false)`
    `expect(document.getElementById('exercise-name').value).toBe('Changed name')`
  - |
    api/tests/test_workout_edit.py::test_editing_another_accounts_entry_is_refused (AC8):
    sign up account A and account B (like `test_exercise_names_are_scoped_to_the_caller_account`),
    A creates an entry, B calls `client_b.put(f"/api/workouts/{entry_id}", json={...})`
    `assert res.status_code == 403`
    `db.rollback(); assert db.get(WorkoutEntry, entry_id).exercise_name == original_name`
  - |
    api/tests/test_workout_edit.py::test_concurrent_edits_last_write_wins_with_no_conflict_response (AC9, AC10):
    two `TestClient(app)` instances sharing the signed-up account's cookie (log in twice),
    both `PUT` different sets/reps for the same entry_id in sequence (B after A)
    `assert res_a.status_code == 200 and res_b.status_code == 200`
    `assert "conflict" not in res_a.text.lower() and "conflict" not in res_b.text.lower()`
    `db.rollback(); assert db.get(WorkoutEntry, entry_id).sets == b_sets`
  - |
    api/tests/test_workout_edit.py::test_entry_older_than_a_year_opens_for_edit_same_as_recent (AC11):
    create an entry with `entry_date="2024-01-01"`,
    `res = client.get(f"/api/workouts/{entry_id}")`
    `assert res.status_code == 200 and res.json()["entry_date"] == "2024-01-01"`
  - |
    api/tests/test_workout_edit.py::test_get_and_response_never_expose_prior_values_after_edit (AC12):
    PUT a change, then
    `res = client.get(f"/api/workouts/{entry_id}")`
    `assert res.json()["exercise_name"] == "Front squat"`
    `assert "history" not in res.json() and "previous" not in res.json()` (no version/history key ever appears in the response shape)
  - |
    api/tests/test_workout_edit.py::test_put_on_deleted_entry_returns_generic_not_found (AC13):
    delete the row directly via `db.query(WorkoutEntry).filter_by(id=entry_id).delete(); db.commit()`,
    then `res = client.put(f"/api/workouts/{entry_id}", json={"exercise_name":"X","entry_date":"2026-09-20","duration_minutes":"10"})`
    `assert res.status_code == 404`
    `assert res.json()["message"] == "This workout no longer exists."`
  - |
    web/tests/edit-workout.test.js — "save on a deleted entry shows not-found and returns to history (AC14)":
    fetch resolves 200 for the initial GET, then the PUT resolves `{status: 404, json: async () => ({message: 'This workout no longer exists.'})}`
    submit the form, `await flush()`
    `expect(window.location.href).toContain('history.html')`
    `expect(window.location.href).toContain('deleted=1')`
  - |
    api/tests/test_workout_edit.py::test_get_for_missing_entry_returns_404 (routing regression guard, backs AC1/AC13):
    `res = client.get("/api/workouts/999999")`
    `assert res.status_code == 404`
    plus a route-ordering regression check:
    `res = client.get("/api/workouts/exercise-names")`
    `assert res.status_code == 200` (must not 422 after adding `/{entry_id}`)
  - |
    web/tests/edit-workout.test.js — "loading a deleted or forbidden entry never renders the form (AC1 negative path, backs AC8/AC13)":
    fetch resolves `{status: 403, json: async () => ({message: "You can only edit workouts you've logged yourself."})}`
    `await flush()`
    `expect(document.getElementById('edit-form').hidden).toBe(true)`
    `expect(document.querySelector('.banner-error').textContent).toContain("You can only edit workouts you've logged yourself.")`

assumptions_or_open_questions:
  - |
    403-vs-404 distinguishability: AC8 and AC13 require materially different UI (a
    refusal screen vs. a not-found-and-redirect flow), so this plan returns distinct
    403/404 status codes even though the prototype's screen 6 note frames the refusal
    as not revealing "whether the entry exists". If the reviewer wants a single
    non-distinguishable response for both cases, AC8 and AC13 would need to converge on
    identical client behavior, which the current prototype doesn't show — flagging
    rather than silently picking one.
  - |
    The prototype's edit form includes an optional "Notes" free-text field and its
    fixtures carry a `notes` property, but `WorkoutEntry` has no `notes` column and
    entry creation (FTP-STORY-007) has no notes field either. No AC here mentions
    notes. This plan omits it from the built form/API to avoid a schema migration and
    inventing scope beyond the ACs; flagging in case the design intends it to ship with
    this story.
  - |
    The prototype's discard-confirm modal (screen 5, "Discard your changes?") is not
    required by any AC. It's included as a small, low-risk addition since the prototype
    shows it as part of the edit flow's Cancel button, but it could be dropped entirely
    without failing any AC — say so if you'd rather exclude it to trim scope.
  - |
    The prototype uses a standalone `.topnav` app shell (brand + History/Log
    workout/Profile links) rather than the real app's `.page-shell` / `.top-app-bar` /
    avatar-menu / `.bottom-tabs` shell used by every other built page. This plan builds
    the edit page with the real app shell for consistency with `history.html` and
    `workout-entry.html`, taking only the form/banner/field markup from the prototype.
  - |
    Screen 8 (split-panel two-session concurrency demo) and all reviewer-only controls
    (toggle panels, the "simulate network/server error" checkbox) are prototype-only
    scaffolding for demonstrating AC9/AC10/AC6/AC7 to a human reviewer, not product UI —
    excluded from the build; AC9/AC10 are instead covered purely by the backend
    last-write-wins test.
  - |
    AC9/AC10 concurrency is validated at the API layer only (two sequential PUTs from
    two authenticated clients against the same row, asserting last-write-wins and no
    conflict-shaped response). No client-side polling/locking/ETag mechanism is
    introduced, since none is implied by any AC and the store's plain UPDATE already
    gives last-write-wins by construction.

package_dependencies: []

notes: |
  No new third-party dependencies. This plan only adds two routes, two store
  functions, one new store lookup's tri-state, two new frontend files, one shared
  frontend module extraction, and two small edits to `history.html`/`history.js`.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000

    subgraph API
      routeCreate["routes/workouts.py: POST /api/workouts"]
      routeList["routes/workouts.py: GET /api/workouts"]
      routeGet["routes/workouts.py: GET /api/workouts/{id}"]:::touched
      routePut["routes/workouts.py: PUT /api/workouts/{id}"]:::touched
      storeValidate["store/workouts.py: validate_entry"]
      storeCreate["store/workouts.py: create_entry"]
      storeLookup["store/workouts.py: get_entry_for_account"]:::touched
      storeUpdate["store/workouts.py: update_entry"]:::touched
      sessionsReq["sessions.require_account"]
    end

    subgraph WEB
      historyHtml["history.html"]:::touched
      historyJs["history.js: renderHistory"]:::touched
      editHtml["edit-workout.html"]:::touched
      editJs["edit-workout.js"]:::touched
      workoutFormJs["workout-form.js (new shared module)"]:::touched
      workoutEntryJs["workout-entry.js"]:::touched
    end

    routeGet -->|"prefill GET, AC1/AC11"| storeLookup
    routePut -->|"ownership + not-found check"| storeLookup
    routePut -->|"same rules as create, AC2/AC4/AC5"| storeValidate
    routePut -->|"full-replacement UPDATE, AC9/AC10/AC12"| storeUpdate
    routeGet --> sessionsReq
    routePut --> sessionsReq
    routeCreate --> storeValidate
    routeCreate --> storeCreate

    historyJs -->|"Edit button links to"| editHtml
    editJs -->|"GET/PUT"| routeGet
    editJs -->|"GET/PUT"| routePut
    editJs -->|"field ids + validation rendering"| workoutFormJs
    workoutEntryJs -->|"re-exports from"| workoutFormJs
    editJs -->|"redirect on save/delete, AC3/AC14"| historyHtml
  ```
