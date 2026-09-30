summary: |
  Add the ability for a logged-in user to log a meal entry (calories, carbs, protein, fat,
  date and time) and view it in a new diet history page, per FTP-STORY-014. This introduces a
  new `MealEntry` model/table, a `POST /api/meals` + `GET /api/meals` API scoped to the caller's
  account, and two new web pages (`meal-entry.html`/`.js` and `diet-history.html`/`.js`) built
  from the approved prototype at `.arc/designs/FTP-STORY-014-design.html`. The work mirrors the
  existing workout-entry/history vertical slice (same `.field`/`.banner`/`.history-list`
  components, same `str | None` payload + 400-field-errors convention) but with a stricter
  date+time-must-not-be-in-the-future rule (validated as a single UTC instant, not just a date)
  and no edit/delete affordance, since AC13 makes meal entries permanently view-only. Per
  reviewer decision, a "Diet" bottom-tab is added to the shared `.bottom-tabs` chrome across all
  existing pages that carry it, since no water-intake or other diet-entry type exists in the
  codebase to interoperate with (confirmed via grep — meal entries are the only diet history
  content for now).

scope:
  - description: |
      Add a `MealEntry` SQLAlchemy model to `api/app/store/models.py`, alongside the existing
      `WorkoutEntry`. Store calories/carbs/protein/fat as `BigInteger` (not `Integer`) so a very
      large but valid value (AC7) doesn't overflow MySQL's 32-bit `INT` and 500 on save. Store
      the meal's moment as a single naive-UTC `DateTime` column `eaten_at_utc`, matching the
      `_utcnow()` convention already used for `created_at`.

      ```python
      class MealEntry(Base):
          __tablename__ = "meal_entries"

          id = Column(Integer, primary_key=True, autoincrement=True)
          account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
          calories = Column(BigInteger, nullable=False)
          carbs_g = Column(BigInteger, nullable=False)
          protein_g = Column(BigInteger, nullable=False)
          fat_g = Column(BigInteger, nullable=False)
          eaten_at_utc = Column(DateTime, nullable=False)
          created_at = Column(DateTime, nullable=False, default=_utcnow)
      ```
    files:
      - api/app/store/models.py
    rationale: |
      A dedicated table (rather than reusing WorkoutEntry) keeps the two entry types independent,
      matching the existing one-table-per-entry-type pattern (WorkoutEntry). BigInteger avoids the
      AC7 overflow bug; tests run against real MySQL (see `api/tests/conftest.py`), so this is a
      real, catchable failure mode, not a hypothetical one.

  - description: |
      Add `api/app/store/meals.py` with the validation and persistence logic, following the
      shape of `api/app/store/workouts.py::validate_entry`/`create_entry`/`list_entries`.

      Signature:
      ```python
      def validate_entry(
          calories_str: str | None,
          carbs_str: str | None,
          protein_str: str | None,
          fat_str: str | None,
          date_str: str | None,
          time_str: str | None,
          utc_offset_minutes_str: str | None,
          now_utc: datetime.datetime,
      ) -> tuple[dict, dict]:
      ```
      Each of calories/carbs/protein/fat: required (AC10); parsed with `int(s.strip())` after
      rejecting a string containing `.` (AC12: "Calories must be a whole number — decimals
      aren't allowed." per field, substituting the field label); rejects `< 0` (AC4: "Calories
      can't be negative." per field); accepts `0` (AC5) and arbitrarily large non-negative
      values (AC7) with no upper bound. Macro/calorie fields are validated independently and
      never cross-checked against each other (AC8 — no reconciliation error is ever produced).

      Date/time: `date_str` and `time_str` are each independently required (AC10, matching the
      design's separate "Date is required." / "Time is required." errors). `utc_offset_minutes`
      (from `Date.prototype.getTimezoneOffset()`, minutes to ADD to local time to get UTC) is
      combined with date+time to build one aware UTC instant:
      `eaten_at_utc = datetime.combine(date, time) + timedelta(minutes=utc_offset_minutes)`.
      The client-supplied offset is trusted as-is (reviewer-confirmed: no server-side IANA
      lookup or range clamp) — a malicious client can only skew their own meal timestamps, not
      cross any account boundary. If the resulting instant is later than `now_utc` (AC6 —
      catches both a future date and a future time on today's date), both `date` and `time`
      errors are set to the same message: "This meal's date and time are in the future — choose
      the actual date and time it was eaten." (copied verbatim from the design's `err-future-dt`).

      `create_entry(db, account, cleaned) -> MealEntry` and
      `list_entries(db, account) -> list[MealEntry]` (ordered `eaten_at_utc.desc(), id.desc()`,
      no pagination needed yet — meal-only history, unlike workouts, has no filter UI in the
      approved design) mirror `workouts.py`.
    files:
      - api/app/store/meals.py
    rationale: |
      Keeping validation as its own testable module (not inline in the route) matches
      `workouts.py`'s split and lets AC4/5/6/7/8/10/11/12 be unit-tested directly against
      `validate_entry` without going through HTTP, the same way `test_workout_entry.py`
      exercises `validate_entry` through the route today.

  - description: |
      Add `api/app/routes/meals.py` with `POST /api/meals` and `GET /api/meals`, modeled on
      `api/app/routes/workouts.py::create_workout`/`list_workouts`. Request body uses the
      reviewer-confirmed field names `calories`, `carbs_g`, `protein_g`, `fat_g`, `date`, `time`,
      `utc_offset_minutes` (all `str | None`, mirroring `WorkoutEntryRequest`'s string-typed
      convention; the `_g` suffix is purely an internal API-naming disambiguator for grams and
      never surfaces in the UI, which always shows the design's own labels — "Carbs (g)",
      "Protein (g)", "Fat (g)"). `POST` returns 401 if not signed in, 400 with
      `{"errors": {...}}` on validation failure, and on success 201 with the full saved entry
      (calories, carbs_g, protein_g, fat_g, eaten_at_utc as an ISO-8601 string with an explicit
      UTC offset, e.g. `entry.eaten_at_utc.isoformat() + "Z"`) so the confirmation screen's
      `summary-list` "Logged" row (design line ~896) can render without a second fetch.
      `GET /api/meals` returns `{"entries": [...]}` scoped to `sessions.require_account`, each
      entry serialized the same way. Register the router in `api/app/main.py` next to
      `workouts_router`.
    files:
      - api/app/routes/meals.py
      - api/app/main.py
    rationale: |
      Matches the existing router-per-domain structure; registering in `main.py` is required for
      FastAPI to expose the routes at all.

  - description: |
      Account deletion (`api/app/store/accounts.py::delete_account`) currently deletes
      `SessionRow`, `DeletionLockoutFailure`, and `WorkoutEntry` rows for the account before
      deleting the `Account` row itself. Add the same cleanup for `MealEntry`:
      `db.query(MealEntry).filter(MealEntry.account_id == account.id).delete()`.
    files:
      - api/app/store/accounts.py
    rationale: |
      `meal_entries.account_id` is a `NOT NULL` FK to `accounts.id`. Without this cleanup,
      deleting an account with meal entries would violate the FK constraint on MySQL (or leave
      orphan rows) — a regression this plan must not introduce, not a new feature.

  - description: |
      Add `web/public/meal-entry.js` (form logic) and `web/public/meal-entry.html` (markup),
      built from the design's "Meal Entry Form — Default" / "— Filled" / "Submitting" /
      "Save Confirmed" screens, using the app's existing `.top-app-bar` + avatar-menu +
      `.bottom-tabs` chrome (as `workout-entry.html` does), not the prototype's standalone
      `.app-topbar`. Pulled from the design verbatim: the `.row-2` three-up macro row, the
      "Whole numbers only. Zero is accepted for any field — decimals aren't." hint, per-field
      `.field-error` messages (e.g. "Calories can't be negative.", "Calories must be a whole
      number — decimals aren't allowed.", "Date is required.", "Time is required."), the
      combined future-date/time error text, the `.banner` "Something went wrong / We couldn't
      save your meal..." with a "Retry save →" button label, and the `.confirm-box`
      `.summary-list` (Calories/Carbs/Protein/Fat/Logged rows) with "Log another meal" and
      "View diet history →" actions. Date input defaults to today (`todayIsoDate()` from
      `workout-form.js`, reused) with `max` set to today; time has no default (design line
      ~791). Its `.bottom-tabs` includes the new "Diet" tab (see the dedicated nav scope item
      below) with itself marked active.
    files:
      - web/public/meal-entry.html
      - web/public/meal-entry.js
    rationale: |
      Builds the already-approved prototype screens directly; reuses `workout-form.js`'s
      `todayIsoDate()` and `form-utils.js`'s `setFieldError`/`clearFieldError` rather than
      reinventing them, consistent with the codebase's existing form-utils sharing.

  - description: |
      Add a small shared helper module `web/public/meal-form.js` (analogous to
      `workout-form.js`) exporting `collectFormValues()`, `renderValidationErrors(errors)`,
      `clearValidationErrors()`, and `computeUtcOffsetMinutes(dateStr, timeStr)`:
      ```js
      export function computeUtcOffsetMinutes(dateStr, timeStr) {
        return new Date(`${dateStr}T${timeStr}`).getTimezoneOffset();
      }
      ```
      computed at the *chosen* date/time (not "now") so it's correct across a DST boundary.
    files:
      - web/public/meal-form.js
    rationale: |
      Splitting this out (rather than inlining in meal-entry.js) makes `computeUtcOffsetMinutes`
      and the validation-rendering functions independently unit-testable, mirroring how
      `workout-form.js` is tested indirectly via `edit-workout.test.js`/`workout-entry` usage.

  - description: |
      Add `web/public/diet-history.js` and `web/public/diet-history.html`, built from the
      design's "Diet History — Full List" / "— Empty State" screens. Renders only meal entries
      — confirmed with the reviewer that no water-intake or other diet-entry type exists
      anywhere in this codebase today (grepped `-i water` across the whole repo: no matches), so
      water tracking is explicitly out of scope and not built. Each row uses the design's
      `.history-row` / `.entry-type-chip.meal` "Meal" label, the two-metric layout (`650 kcal` /
      `80/35/20` with unit `C/P/F (g)`), and critically: no edit or delete control is rendered
      anywhere (AC13) — the design's `.no-actions-note` ("Saved entries are view-only — there's
      no edit or delete option in diet history.") is shown instead of a `.history-row-actions`
      block. Each row's date/time is rendered via `formatMealDateTime` (below) using the entry's
      UTC instant, converted to the browser's local timezone (AC14), plus the design's `.tz-note`
      ("Times shown in your device's local timezone...", with the zone name from
      `Intl.DateTimeFormat().resolvedOptions().timeZone`, not hardcoded to America/New_York as
      the static prototype shows). Uses the shared `.top-app-bar` + avatar-menu + `.bottom-tabs`
      chrome, with its own new "Diet" tab marked active.
    files:
      - web/public/diet-history.html
      - web/public/diet-history.js
    rationale: |
      This is a new page (no existing "diet" or "meal" history view in the codebase), needed to
      satisfy AC2/AC3/AC13/AC14. It's kept separate from `history.html` (workouts) rather than
      merged, since merging workout and diet history into one page/filter set is out of scope
      for this story and not shown in the approved design.

  - description: |
      Add `formatMealDateTime(isoUtcString, timeZone)` to `meal-form.js`, a pure function used
      by `diet-history.js`:
      ```js
      export function formatMealDateTime(isoUtc, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) {
        return new Date(isoUtc).toLocaleString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', timeZone,
        });
      }
      ```
    files:
      - web/public/meal-form.js
    rationale: |
      Isolating this as a pure function makes AC14 (local-timezone conversion) directly
      unit-testable with a fixed `timeZone` argument, without depending on the test runner's
      own system timezone.

  - description: |
      Reviewer-confirmed decision: add a "Diet" tab to the shared `.bottom-tabs` chrome so it's
      reachable from every page that carries the tab bar, rather than only linking from the
      dashboard empty-state. Each existing instance currently has a disabled "Progress"
      placeholder slot (e.g. `history.html` line 177:
      `<div class="bottom-tab" role="button" aria-disabled="true">Progress</div>`); replace that
      slot with `<a class="bottom-tab" href="diet-history.html">Diet</a>` on `dashboard.html`,
      `workout-entry.html`, and `history.html`. `profile.html`'s tab bar (lines 122-127) is a
      shorter 4-tab variant that's missing a History link entirely (pre-existing inconsistency,
      not introduced by this plan) — add the same "Diet" tab there too, after "Log", without
      otherwise fixing the pre-existing missing-History-link gap (out of scope for this story).
      The two new pages (`meal-entry.html`, `diet-history.html`) ship with the same updated
      5-tab bar from the start, each marking its own tab `active`.
    files:
      - web/public/dashboard.html
      - web/public/workout-entry.html
      - web/public/history.html
      - web/public/profile.html
    rationale: |
      Without a discoverable, always-available entry point, AC1/AC2 would only be reachable by
      typing the URL directly or after already saving one meal. The reviewer chose the
      app-wide-tab option over a single dashboard-only link, so this touches the shared nav
      chrome on every existing page that has it, not just one.

  - description: |
      Add `api/tests/test_meal_entry.py` covering AC1, AC4, AC5, AC6, AC7, AC8, AC10, AC11, AC12
      (AC9 is client-only, see below), following the parametrized style of
      `test_workout_entry.py`.
    files:
      - api/tests/test_meal_entry.py
    rationale: |
      Backend contract tests are the primary enforcement point for the numeric/date validation
      rules; mirrors `test_workout_entry.py`'s structure so reviewers recognize the pattern.

  - description: |
      Add `api/tests/test_meal_history.py` covering AC2 (meal entries listed) and AC3 (account
      isolation on `GET /api/meals`), following
      `test_exercise_names_are_scoped_to_the_caller_account`'s two-client pattern.
    files:
      - api/tests/test_meal_history.py
    rationale: |
      Account-isolation is a security-relevant behavior (AC3) that deserves its own explicit,
      easy-to-find test, matching how workouts already test isolation via a second `TestClient`.

  - description: |
      Add `web/tests/meal-entry.test.js` covering AC1 (submit), AC9 (network failure keeps
      values, shows generic banner), AC10/AC4/AC6/AC12 (validation errors rendered and preserved
      per-field), and confirms no macro-reconciliation check exists client-side (AC8: a
      mismatched-but-valid payload still submits without a client-side blocking error).
    files:
      - web/tests/meal-entry.test.js
    rationale: |
      AC9 (offline/failed save) is fundamentally a client-observable behavior (the fetch call
      itself failing), so it's tested here rather than only on the backend, following
      `edit-workout.test.js`'s "network failure" test pattern.

  - description: |
      Add `web/tests/diet-history.test.js` covering AC13 (no edit/delete controls rendered for
      any row) and AC14 (`formatMealDateTime` converts a fixed UTC instant to the expected local
      string for an explicit `timeZone`).
    files:
      - web/tests/diet-history.test.js
    rationale: |
      AC13 and AC14 are rendering-layer guarantees best verified against the DOM/pure functions
      directly, per the advisor's suggested assertion shape.

package_dependencies: []

tests:
  - |
    AC1 — valid submission is saved and associated with the account:
    ```python
    def test_valid_entry_is_saved_and_associated_with_account(client_with_signed_up_account, db):
        res = client_with_signed_up_account.post("/api/meals", json={
            "calories": "650", "carbs_g": "80", "protein_g": "35", "fat_g": "20",
            "date": "2026-09-20", "time": "12:30", "utc_offset_minutes": "240",
        })
        assert res.status_code == 201
        db.rollback()
        assert db.query(MealEntry).filter_by(calories=650).count() == 1
    ```
  - |
    AC2 — meal entries appear in diet history listing:
    ```python
    def test_meal_entry_appears_in_history_listing(client_with_signed_up_account):
        client_with_signed_up_account.post("/api/meals", json={...valid...})
        res = client_with_signed_up_account.get("/api/meals")
        assert res.status_code == 200
        assert len(res.json()["entries"]) == 1
    ```
  - |
    AC3 — history is scoped to the caller's account, mirroring
    `test_exercise_names_are_scoped_to_the_caller_account`:
    ```python
    def test_meal_history_is_scoped_to_the_caller_account(client_with_signed_up_account):
        client_b = TestClient(app)
        client_b.post("/api/signup", json={"email": "alex@example.com", "password": "test-password", "display_name": "Alex"})
        client_with_signed_up_account.post("/api/meals", json={...})
        client_b.post("/api/meals", json={...})
        res = client_with_signed_up_account.get("/api/meals")
        assert len(res.json()["entries"]) == 1
    ```
  - |
    AC4 — negative calories/macros rejected, nothing saved:
    ```python
    @pytest.mark.parametrize("field", ["calories", "carbs_g", "protein_g", "fat_g"])
    def test_negative_value_is_rejected(client_with_signed_up_account, field, db):
        payload = {"calories": "650", "carbs_g": "80", "protein_g": "35", "fat_g": "20",
                   "date": "2026-09-20", "time": "12:30", "utc_offset_minutes": "0"}
        payload[field] = "-5"
        res = client_with_signed_up_account.post("/api/meals", json=payload)
        assert res.status_code == 400
        assert field in res.json()["errors"]
        db.rollback()
        assert db.query(MealEntry).count() == 0
    ```
  - |
    AC5 — zero accepted for calories and every macro:
    ```python
    def test_all_zero_values_are_accepted(client_with_signed_up_account):
        res = client_with_signed_up_account.post("/api/meals", json={
            "calories": "0", "carbs_g": "0", "protein_g": "0", "fat_g": "0",
            "date": "2026-09-20", "time": "07:15", "utc_offset_minutes": "0",
        })
        assert res.status_code == 201
    ```
  - |
    AC6 — future date OR future time on today's date is rejected:
    ```python
    def test_future_date_is_rejected(client_with_signed_up_account):
        res = client_with_signed_up_account.post("/api/meals", json={
            "calories": "500", "carbs_g": "60", "protein_g": "25", "fat_g": "15",
            "date": "2999-01-01", "time": "09:00", "utc_offset_minutes": "0",
        })
        assert res.status_code == 400
        assert "future" in res.json()["errors"]["date"].lower()
    ```
  - |
    AC7 — very high non-negative value accepted with no upper bound, including a value that
    would overflow a 32-bit column, proving the `BigInteger` choice matters:
    ```python
    def test_very_high_calorie_value_is_accepted(client_with_signed_up_account):
        res = client_with_signed_up_account.post("/api/meals", json={
            "calories": "3000000000", "carbs_g": "500", "protein_g": "300", "fat_g": "150",
            "date": "2026-09-20", "time": "20:00", "utc_offset_minutes": "0",
        })
        assert res.status_code == 201
    ```
  - |
    AC8 — mismatched macros vs. calories still saved, no reconciliation error:
    ```python
    def test_mismatched_macros_are_still_saved(client_with_signed_up_account):
        res = client_with_signed_up_account.post("/api/meals", json={
            "calories": "650", "carbs_g": "200", "protein_g": "150", "fat_g": "100",
            "date": "2026-09-20", "time": "13:00", "utc_offset_minutes": "0",
        })
        assert res.status_code == 201
    ```
  - |
    AC9 — network/offline failure shows a generic retryable error and saves nothing (client-side):
    ```js
    it('shows a generic error banner and preserves entered values on a network failure (AC9)', async () => {
      global.fetch.mockRejectedValueOnce(new Error('network down'));
      await loadMealEntryPage();
      document.getElementById('cal').value = '720';
      document.getElementById('meal-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush();
      expect(document.getElementById('save-error-banner').hidden).toBe(false);
      expect(document.getElementById('cal').value).toBe('720');
    });
    ```
  - |
    AC10 — omitting any one required field blocks submission with a validation message, nothing
    saved:
    ```python
    @pytest.mark.parametrize("field", ["calories", "carbs_g", "protein_g", "fat_g", "date", "time"])
    def test_omitting_any_required_field_is_rejected(client_with_signed_up_account, field, db):
        payload = {"calories": "650", "carbs_g": "80", "protein_g": "35", "fat_g": "20",
                   "date": "2026-09-20", "time": "12:30", "utc_offset_minutes": "0"}
        payload[field] = ""
        res = client_with_signed_up_account.post("/api/meals", json=payload)
        assert res.status_code == 400
        assert field in res.json()["errors"]
        db.rollback()
        assert db.query(MealEntry).count() == 0
    ```
  - |
    AC11 — whole-number values saved as integer kcal/gram values:
    ```python
    def test_whole_number_values_are_saved_as_integers(client_with_signed_up_account, db):
        client_with_signed_up_account.post("/api/meals", json={
            "calories": "650", "carbs_g": "80", "protein_g": "35", "fat_g": "20",
            "date": "2026-09-20", "time": "12:30", "utc_offset_minutes": "0",
        })
        db.rollback()
        entry = db.query(MealEntry).one()
        assert entry.calories == 650 and entry.carbs_g == 80
    ```
  - |
    AC12 — decimal calories/macros rejected:
    ```python
    @pytest.mark.parametrize("field", ["calories", "carbs_g", "protein_g", "fat_g"])
    def test_decimal_value_is_rejected(client_with_signed_up_account, field):
        payload = {"calories": "650", "carbs_g": "80", "protein_g": "35", "fat_g": "20",
                   "date": "2026-09-20", "time": "12:30", "utc_offset_minutes": "0"}
        payload[field] = "35.25"
        res = client_with_signed_up_account.post("/api/meals", json=payload)
        assert res.status_code == 400
        assert "whole number" in res.json()["errors"][field].lower()
    ```
  - |
    AC13 — no edit/delete option is presented in diet history:
    ```js
    it('renders no edit or delete control for any entry (AC13)', async () => {
      global.fetch.mockResolvedValueOnce({ status: 200, json: async () => ({ entries: [mealFixture] }) });
      await loadDietHistoryPage();
      await flush();
      expect(document.querySelector('a[href*="edit"]')).toBeNull();
      expect(document.querySelector('.history-delete-btn')).toBeNull();
    });
    ```
  - |
    AC14 — date/time displayed converted to the device's local timezone:
    ```js
    it("formats a UTC instant into the given local timezone (AC14)", () => {
      expect(formatMealDateTime('2026-09-30T16:30:00.000Z', 'America/New_York'))
        .toBe('Sep 30, 2026, 12:30 PM');
    });
    ```

assumptions_or_open_questions:
  - |
    Resolved with reviewer: no water-intake or other non-meal diet-entry type exists anywhere in
    this codebase (confirmed by grepping `-i water` across the whole repo — no matches), so per
    the reviewer's explicit instruction ("if not, skip it"), diet history renders meal entries
    only. The `entry-type-chip` CSS pattern from the design is still used so a future entry type
    could be added later without restructuring the page, but no such type is built now.
  - |
    Resolved with reviewer: adopting Option B — a "Diet" tab is added to the shared
    `.bottom-tabs` chrome across dashboard.html, workout-entry.html, history.html, and
    profile.html (replacing each page's disabled "Progress" placeholder slot), plus both new
    meal pages ship with the same 5-tab bar. This is a larger, cross-cutting nav change than a
    single dashboard-only link, but was the reviewer's explicit choice over the minimal option.
    Note: profile.html's existing tab bar is a pre-existing 4-tab variant missing a History link
    entirely — this plan adds "Diet" there too but does not fix that pre-existing gap, which is
    unrelated to this story.
  - |
    Resolved with reviewer: the wire-format field names `calories`, `carbs_g`, `protein_g`,
    `fat_g`, `date`, `time`, `utc_offset_minutes` are confirmed as final. The `_g` suffix is an
    internal API-naming choice only (disambiguates the unit in the JSON key) and never appears
    in the UI, which always uses the design's own labels ("Carbs (g)", "Protein (g)", "Fat (g)").
  - |
    Resolved with reviewer: trusting the client-supplied `utc_offset_minutes` as-is (no
    server-side IANA timezone lookup or range validation) is acceptable. A malicious client can
    only skew their own meal timestamps; this is not a cross-account or security concern.
  - |
    AC9 (offline/failed save shows a generic retryable error) is only tested client-side in this
    plan (mocked fetch rejection), since there is no reliable way to simulate "device is
    offline" against a real backend in an integration test; the backend's role here is simply to
    return a non-2xx/network-level failure, which is already covered by AC4/AC6/AC10's 400 paths
    plus the generic client-side catch block.

notes: |
  This mirrors the existing FTP-STORY-007/008 workout-entry + history vertical slice closely:
  same `.field`/`.field-error`/`.banner`/`.history-list` CSS classes, same
  `str | None` request-field convention returning 400 `{"errors": {...}}`, same
  `sessions.require_account` auth guard, same `WorkoutEntry`-style one-table-per-type model. The
  two deliberate deviations, both required by this story's ACs and absent from the workout slice,
  are: (1) date+time is validated as a single combined UTC instant rather than a bare date, to
  correctly catch a future *time* on today's date (AC6); and (2) diet history renders with no
  edit/delete affordance at all (AC13), unlike workout history's edit/delete icons. Per reviewer
  decision, this plan also touches the shared `.bottom-tabs` markup on every existing page that
  has it, to add a "Diet" tab — a wider-than-usual nav footprint for a single story, called out
  explicitly here and in `review_focus` below so it isn't mistaken for scope creep.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef existing fill:#e2e8f0,color:#1a1a1a

    Models[app/store/models.py]:::touched
    MealsStore[app/store/meals.py]:::touched
    MealsRoute[app/routes/meals.py]:::touched
    Main[app/main.py]:::touched
    Accounts[app/store/accounts.py]:::touched
    Sessions[app/store/sessions.py]:::existing
    MealEntryJS[web/public/meal-entry.js]:::touched
    MealFormJS[web/public/meal-form.js]:::touched
    DietHistoryJS[web/public/diet-history.js]:::touched
    WorkoutFormJS[web/public/workout-form.js]:::existing
    FormUtilsJS[web/public/form-utils.js]:::existing
    Dashboard[web/public/dashboard.html]:::touched
    WorkoutEntry[web/public/workout-entry.html]:::touched
    History[web/public/history.html]:::touched
    Profile[web/public/profile.html]:::touched

    MealsRoute -->|"require_account (401 guard)"| Sessions
    MealsRoute -->|"validate_entry / create_entry / list_entries"| MealsStore
    MealsStore -->|"MealEntry model"| Models
    Main -->|"include_router"| MealsRoute
    Accounts -->|"delete MealEntry rows on account delete"| Models
    MealEntryJS -->|"collectFormValues / computeUtcOffsetMinutes"| MealFormJS
    MealEntryJS -->|"todayIsoDate (reused)"| WorkoutFormJS
    MealFormJS -->|"setFieldError / clearFieldError (reused)"| FormUtilsJS
    DietHistoryJS -->|"formatMealDateTime"| MealFormJS
    Dashboard -->|"add Diet tab"| DietHistoryJS
    WorkoutEntry -->|"add Diet tab"| DietHistoryJS
    History -->|"add Diet tab"| DietHistoryJS
    Profile -->|"add Diet tab"| DietHistoryJS
  ```

review_focus: |
  In scope: `MealEntry` model + store + routes, meal-entry and diet-history pages, account-
  deletion cleanup for the new table, and a "Diet" bottom-tab added across all existing pages
  that carry `.bottom-tabs` (reviewer's explicit choice, not scope creep). Out of scope
  (deliberately not built): editing/deleting meal entries (AC13 forbids it), any non-meal diet
  entry type such as water intake (confirmed absent from the codebase), and adopting the
  prototype's standalone top-nav chrome. The riskiest area is the future-date/time validation
  (AC6): it must reject a future *time* on today's date, not just a future date, which requires
  combining date+time+client-supplied UTC offset into one instant server-side rather than
  reusing the workout slice's bare `date.today()` comparison — check this combined-instant logic
  carefully rather than assuming the workout pattern was copied as-is. Also deliberate: calories/
  macros use `BigInteger` (not `Integer`) so AC7's "no upper bound" claim holds against MySQL's
  32-bit `INT` limit; and the client-supplied `utc_offset_minutes` is trusted without server-side
  validation (reviewer-confirmed acceptable, since a bad value can only affect the submitting
  account's own timestamps).
