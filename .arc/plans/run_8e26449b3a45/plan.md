summary: |
  FTP-STORY-014 already shipped a working `GET /api/meals` endpoint (limit/offset,
  `has_more`, newest-first ordering by `eaten_at_utc desc, id desc`) and a live
  "Diet history" screen (`web/public/diet-history.html` / `.js`) that renders it —
  but that screen fetches every page in a loop and merges them into one
  infinite-scrolling list, which conflicts with this story's discrete
  page-based-pagination requirement. This plan reworks that existing screen (not a
  new page) into the paginated, view-only "Meal history" experience shown in the
  approved prototype at `.arc/designs/FTP-STORY-015-design.html`: 25 rows per page,
  explicit Prev/Next controls, an entry-count / "Page X of Y" status line, four
  separate calorie/carbs/protein/fat metric cells per row, a dedicated empty state
  with a "Log your first meal" CTA, and two distinct retryable error states (initial
  load vs. page-turn). The backend gets one small addition — a total count so the
  UI can render "Showing 1–25 of 26 meals" — via a new `count_entries` store
  function and a `total_count` field on the list response; `list_entries`'s
  existing signature and `has_more` semantics are untouched.
scope:
  - description: |
      Add `count_entries(db, account) -> int` to `api/app/store/meals.py`, scoped
      to the caller's account_id, alongside the existing `list_entries`/`paginate`
      helpers already reused from `store/workouts.py`. Does not touch
      `list_entries`'s signature or return shape.
    files:
      - api/app/store/meals.py
    rationale: |
      The design's "Showing 1–25 of 26 meals" / "Page X of Y" copy needs a total
      row count distinct from the current page's `has_more` boolean, which only
      tells you whether a next page exists, not the grand total.
  - description: |
      In `api/app/routes/meals.py`, call `meals.count_entries` in `list_meals` and
      add it to the JSON response as `total_count` (deliberately not `total`,
      since AC12's DOM assertion checks that no daily/per-meal "total" wording
      appears on the page, and a same-named JSON field invites confusion).
      Response becomes `{"entries": [...], "has_more": bool, "total_count": int}`.
    files:
      - api/app/routes/meals.py
    rationale: |
      Exposes the count the frontend needs without changing existing consumers
      of `entries`/`has_more`, which FTP-014's tests already assert on.
  - description: |
      Rework `web/public/diet-history.js`: replace `fetchHistory()`'s
      fetch-all-pages-and-merge loop with a single-page fetcher
      `fetchPage(page)` that requests `/api/meals?limit=25&offset=${(page-1)*25}`
      and returns `{ ok, entries, hasMore, totalCount }` (or
      `sessionExpired`/`networkError`). Track `currentPage` in module state (not
      the URL, per prototype — no deep-linkable page param exists in the design).
      Render four separate `.history-metric` cells (kcal, Carbs g, Protein g,
      Fat g) per row instead of the current combined "C/P/F (g)" cell, drop the
      "Meal" chip (design has no chip), and render the `.pagination` nav with
      Prev/Next buttons (`disabled` + `aria-disabled` at the bounds) and a
      `.page-status` `Page X of Y` element with `aria-current="page"`. Two error
      banners: initial-load ("Couldn't load your meal history") vs. page-turn
      ("Couldn't load the next page", with a "← Back to page 1" secondary
      action) — Retry re-issues the request for whatever page was being loaded
      when it failed. Keep the existing `tz-note`, header "Log a meal →" link,
      and avatar-menu/logout wiring — the prototype's `.app-topbar` chrome is a
      style-guide artifact, not a replacement for the live app's
      `page-shell`/`top-app-bar`/`bottom-tabs`, which stays as-is.
    files:
      - web/public/diet-history.js
    rationale: |
      This is the actual pagination + row-layout + error-state behavior the
      story requires; reworking in place avoids duplicating the whole
      screen/chrome/nav-wiring that FTP-014 already built correctly.
  - description: |
      Update `web/public/diet-history.html`: add the `<nav class="pagination">`
      markup (Prev button, `.page-status`, Next button) below `#history-list`,
      copy the `.pagination` CSS block from the design
      (`.arc/designs/FTP-STORY-015-design.html` lines ~656-663), add a second
      error-banner element for the page-turn case (or a single banner whose
      title/body/actions are swapped by JS — implementer's choice, tests only
      assert the two distinct copy strings appear at the right time), update the
      empty-state body copy to "Once you log a meal, it'll show up here —
      newest first." (already present) and confirm the CTA reads "Log your
      first meal →" pointing at `meal-entry.html` (already present — no HTML
      change needed there). Update `#entry-count` to render
      "Showing X–Y of N meals" instead of "N entries".
    files:
      - web/public/diet-history.html
    rationale: |
      Static structure changes needed to host the new pagination controls and
      the count/status copy the design specifies.
  - description: |
      Update `web/tests/diet-history.test.js` to match the new single-page
      fetch contract and pagination/error/staleness behavior (see `tests`
      below); the existing three tests (AC5/no-actions-note, AC2 rendering,
      empty state) are adjusted to mock a single-page response
      (`{ entries, has_more, total_count }`) instead of the old all-pages
      fixture shape.
    files:
      - web/tests/diet-history.test.js
    rationale: |
      FTP-014's tests asserted against the old "fetch everything" contract;
      they must be updated to the new paginated contract or they'll fail once
      `fetchHistory`/`fetchPage` change shape.
  - description: |
      Add backend pytest cases to `api/tests/test_meal_entry.py` covering
      exactly-25/26-row pagination and the new `total_count` field (see `tests`
      below).
    files:
      - api/tests/test_meal_entry.py
    rationale: |
      Directly exercises AC10/AC11 and the count addition at the API layer,
      independent of the frontend.
tests:
  - |
    api/tests/test_meal_entry.py — AC10 (exactly 25, single page):
    seed 25 meals with distinct `eaten_at_utc` via repeated
    `client.post("/api/meals", json=valid_payload(date=..., time=...))` (vary
    `date`/`time` per entry so ordering is deterministic), then:
    res = client.get("/api/meals", params={"limit": 25, "offset": 0})
    body = res.json()
    assert len(body["entries"]) == 25
    assert body["has_more"] is False
    assert body["total_count"] == 25
  - |
    api/tests/test_meal_entry.py — AC11 (26 entries, second page has the
    remaining 1):
    # seed 26 meals with distinct eaten_at_utc, newest logged last in the loop
    first = client.get("/api/meals", params={"limit": 25, "offset": 0}).json()
    assert len(first["entries"]) == 25
    assert first["has_more"] is True
    assert first["total_count"] == 26
    second = client.get("/api/meals", params={"limit": 25, "offset": 25}).json()
    assert len(second["entries"]) == 1
    assert second["has_more"] is False
    assert second["total_count"] == 26
  - |
    api/tests/test_meal_entry.py — AC1/AC4 (newest-first ordering preserved
    across a page boundary): with 26 distinct-timestamp entries, assert
    `first["entries"][0]["calories"]` corresponds to the most-recently-eaten
    entry and `second["entries"][0]["calories"]` corresponds to the oldest,
    i.e. the two pages concatenated reproduce the full newest-first order with
    no gap or duplicate — reuses the existing
    `test_limit_paginates_and_reports_has_more` pattern of asserting on
    `calories` values.
  - |
    web/tests/diet-history.test.js — AC1/AC2/AC12 (page 1 render, fields
    shown, no totals):
    global.fetch.mockResolvedValueOnce({ status: 200, json: async () => ({
      entries: [mealFixture], has_more: false, total_count: 1 }) });
    await loadDietHistoryPage(); await flush();
    expect(document.querySelectorAll('.history-metric').length).toBe(4);
    expect(document.body.textContent).not.toMatch(/\btotal\b/i);
  - |
    web/tests/diet-history.test.js — AC3/AC4/AC11 (discrete pagination, Next
    fetches page 2 with newest-first continuation):
    global.fetch
      .mockResolvedValueOnce({ status: 200, json: async () => ({ entries: Array(25).fill(mealFixture), has_more: true, total_count: 26 }) })
      .mockResolvedValueOnce({ status: 200, json: async () => ({ entries: [mealFixture], has_more: false, total_count: 26 }) });
    await loadDietHistoryPage(); await flush();
    document.getElementById('next-page-btn').click(); await flush();
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining('offset=25'), expect.anything());
    expect(document.getElementById('page-status').textContent).toBe('Page 2 of 2');
  - |
    web/tests/diet-history.test.js — AC5 (no edit/delete anywhere, existing
    assertion kept):
    expect(document.querySelector('a[href*="edit"]')).toBeNull();
    expect(document.querySelector('.history-delete-btn')).toBeNull();
  - |
    web/tests/diet-history.test.js — AC6/AC7 (empty state + CTA):
    global.fetch.mockResolvedValueOnce({ status: 200, json: async () => ({ entries: [], has_more: false, total_count: 0 }) });
    await loadDietHistoryPage(); await flush();
    expect(document.getElementById('empty-state').hidden).toBe(false);
    expect(document.querySelector('#empty-state a.btn-primary[href="meal-entry.html"]')).not.toBeNull();
  - |
    web/tests/diet-history.test.js — AC8/AC9 (initial load error, then retry
    re-issues the same request):
    global.fetch
      .mockResolvedValueOnce({ status: 500 })
      .mockResolvedValueOnce({ status: 200, json: async () => ({ entries: [mealFixture], has_more: false, total_count: 1 }) });
    await loadDietHistoryPage(); await flush();
    expect(document.getElementById('load-error-banner').hidden).toBe(false);
    document.getElementById('retry-btn').click(); await flush();
    expect(document.getElementById('load-error-banner').hidden).toBe(true);
    expect(document.querySelectorAll('.history-row').length).toBe(1);
  - |
    web/tests/diet-history.test.js — AC9 variant (retry after a failed
    page-turn re-requests the same offset, not page 1):
    # first call succeeds (page 1, has_more true), second call (Next → page 2)
    # fails, Retry must re-request offset=25 again, not offset=0
    expect(fetch.mock.calls[2][0]).toContain('offset=25');
  - |
    web/tests/diet-history.test.js — AC13 (no silent refresh of an
    already-open list):
    await loadDietHistoryPage(); await flush();
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('storage'));
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  - |
    api/tests/test_meal_entry.py — account isolation for the new count field
    (mirrors existing `test_meal_history_is_scoped_to_the_caller_account`):
    assert client_a.get("/api/meals").json()["total_count"] == 1
assumptions_or_open_questions:
  - |
    AC2 vs. the data model: `MealEntry` (api/app/store/models.py) has no food-name
    or quantity columns — FTP-014 never captured them, and the prototype's own
    fixture/code comment (`.arc/designs/FTP-STORY-015-design.html` line ~992) says
    name/qty are "optional — present only when the user chose to record them",
    falling back to the generic label "Meal" when absent. In the real system they
    are never present, so every row in this build will show the "Meal" fallback
    plus calories/carbs/protein/fat/datetime, never a food name or quantity. This
    plan does NOT add name/quantity columns or capture fields (that's FTP-014/
    logging scope, not history-viewing scope) — flagging this as a direct gap
    between AC2's wording and what the approved design/backend actually supports.
  - |
    This story supersedes FTP-014's "fetch every page and merge" behavior in
    `diet-history.js` (that code's own comment cites its AC2 as requiring the
    complete history on load). This plan treats FTP-015's discrete-pagination ACs
    as authoritative for this screen going forward and rewrites that fetch
    strategy; existing FTP-014 tests that assumed the merged-list contract are
    updated rather than preserved unchanged.
  - |
    Chrome/layout: the prototype uses a bare `.app-topbar` + `.page-wrap`
    (640px) style-guide shell with no avatar menu or bottom tabs. The live app
    uses `.page-shell` / `.top-app-bar` (avatar menu) / `.bottom-tabs` (with the
    Diet tab added in FTP-014). This plan keeps the live chrome and takes only
    the content region (header, entry-count, history list/row layout, pagination
    nav, empty/error states) from the prototype, per the instruction to build
    layout/spacing/colors from the design where it applies to the actual screen
    content — assuming the reviewer wants the existing app shell retained rather
    than replaced.
  - |
    The existing `tz-note` ("Times shown in your device's local timezone…") and
    the page-header "Log a meal →" secondary link are FTP-014 additions not shown
    in the FTP-015 prototype. This plan keeps both rather than silently removing
    them, since removing either isn't implied by any AC here.
  - |
    AC1's "most recently logged" is read as ordering by `eaten_at_utc` (the
    meal's actual date/time), matching the existing `list_entries` ordering and
    the design's visible datetime labels — not by `created_at`/insertion order.
    Flagging in case "logged" was meant to mean insertion time.
  - |
    Offset-based pagination can shift page-2 contents by one row if a new meal
    is inserted between page loads (e.g. between AC13's "log elsewhere" and a
    manual page turn on the same open list). AC13 only requires the *currently
    displayed* list to stay static, which this plan satisfies without a
    snapshot/cursor mechanism — noting this as a known limitation of simple
    offset pagination, not something this plan builds around.
  - |
    Page number is kept in in-memory module state, not a URL query param, since
    the prototype has no deep-linkable page indicator and reopening the screen
    is expected to reset to page 1 (consistent with AC13's "reopen to see new
    entries" behavior).
package_dependencies: []
notes: |
  Research: `GET /api/meals` (api/app/routes/meals.py) and `store/meals.py`
  already implement limit/offset/has_more/newest-first via the same
  `paginate`/`MAX_PAGE_SIZE` helpers as `store/workouts.py` — confirmed by
  reading `api/tests/test_meal_entry.py::test_limit_paginates_and_reports_has_more`,
  which already exercises limit/offset/has_more end-to-end. The only backend gap
  is a total count for the "Showing X–Y of N" / "Page X of Y" copy.

  The frontend gap is larger: `web/public/diet-history.js`'s `fetchHistory()`
  loops over every page and concatenates results into one unbounded list
  (confirmed by reading the loop and its comment citing FTP-014's AC2), which is
  the opposite of this story's discrete-pagination requirement. This plan
  reworks that file/its paired HTML/tests in place rather than creating a new
  page, since the live screen, its route (`diet-history.html`), nav wiring
  (bottom-tabs "Diet" tab across 5 pages), and avatar-menu/logout integration
  already exist and match what the design intends to be viewing.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef context fill:#eee,color:#000

    routeMeals["api/app/routes/meals.py\nlist_meals()"]:::touched
    storeMeals["api/app/store/meals.py\ncount_entries() new"]:::touched
    storeWorkoutsHelpers["api/app/store/workouts.py\npaginate()/MAX_PAGE_SIZE\n(reused, unmodified)"]:::context
    dietHtml["web/public/diet-history.html"]:::touched
    dietJs["web/public/diet-history.js\nfetchPage()/render pagination"]:::touched
    dietTest["web/tests/diet-history.test.js"]:::touched
    apiTest["api/tests/test_meal_entry.py"]:::touched
    mealEntryPage["web/public/meal-entry.html\n(CTA target, unmodified)"]:::context

    routeMeals -->|"calls"| storeMeals
    storeMeals -->|"reuses"| storeWorkoutsHelpers
    dietJs -->|"fetch('/api/meals?limit&offset')"| routeMeals
    dietHtml -->|"loaded by"| dietJs
    dietJs -->|"empty-state CTA links to"| mealEntryPage
    dietTest -->|"exercises"| dietJs
    apiTest -->|"exercises"| routeMeals
  ```
review_focus: |
  In scope: reworking the existing `diet-history` screen from fetch-all-merge to
  true page-based pagination (25/page), adding a `total_count` field, and the
  four-metric row layout / two distinct error states / empty-state CTA per the
  approved prototype. Out of scope: any edit/delete affordance (explicitly
  forbidden by AC5, already absent), adding food-name/quantity capture (flagged
  as a data-model gap versus AC2, not something this plan resolves), and any
  daily/per-meal totals (AC12 — the new `total_count` field is a page-count
  label only, never rendered as a nutritional total; reviewers should check the
  DOM output doesn't accidentally surface it as one). Riskiest area: the
  pagination-state rewrite in `diet-history.js` — replacing a working
  fetch-all loop with single-page fetches plus Prev/Next/retry-with-correct-offset
  logic is the part most likely to regress AC1/AC4 ordering continuity or lose
  the in-flight page on a failed retry. Non-obvious deliberate choice: page
  number lives in memory only (no URL param), and reopening the screen always
  resets to page 1, per AC13's reopen-to-refresh model.
