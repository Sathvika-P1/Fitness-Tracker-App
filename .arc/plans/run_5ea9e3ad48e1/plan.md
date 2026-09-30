summary: |
  Adds delete-workout-entry support end to end: a `DELETE /api/workouts/{entry_id}` endpoint
  that reuses the existing ownership check (`get_entry_for_account`) to return 404/403 exactly
  like the edit endpoints, and a history-list UI (per the approved FTP-STORY-010 prototype) that
  adds an icon-only "Delete" action next to the existing "Edit" action on each row, a lightweight
  confirmation modal (no password re-entry), and inline per-row error handling with retry when
  the DELETE request fails. A successful delete (or a 404, treated as already-gone) redirects to
  `history.html?deleted=1`, reusing the `deleted-banner` mechanism that `edit-workout.js` already
  wires up for the same "entry vanished" case.

scope:
  - description: |
      Add a `delete_entry` store function that removes an owned `WorkoutEntry` row.

      ```python
      def delete_entry(db: Session, entry: WorkoutEntry) -> None:
          db.delete(entry)
          db.commit()
      ```
    files:
      - api/app/store/workouts.py
    rationale: |
      Mirrors the existing `create_entry`/`update_entry` shape in this module; the route resolves
      ownership via the existing `get_entry_for_account(db, account, entry_id)` before calling this,
      so this function does no ownership checking itself (same division of responsibility as
      `update_entry`).

  - description: |
      Add `DELETE /api/workouts/{entry_id}` to the workouts router, mirroring `update_workout`'s
      auth/ownership flow: 401 if not signed in, then `get_entry_for_account` for 404/403, then
      delete and return 204.

      ```python
      @router.delete("/api/workouts/{entry_id}")
      def delete_workout(
          entry_id: int,
          db: Session = Depends(get_db),
          sid: str | None = Cookie(default=None),
      ):
          account = sessions.require_account(db, sid)
          if account is None:
              return JSONResponse(status_code=401, content={"message": "Not signed in."})
          entry, status = workouts.get_entry_for_account(db, account, entry_id)
          if status == "not_found":
              return JSONResponse(status_code=404, content={"message": "This workout no longer exists."})
          if status == "forbidden":
              return JSONResponse(
                  status_code=403,
                  content={"message": "You can only delete workouts you've logged yourself."},
              )
          workouts.delete_entry(db, entry)
          return Response(status_code=204)
      ```

      The 403 message says "delete" (not "edit", which `get_workout`/`update_workout` use) since
      this is a distinct action. Log lines follow the existing `workout_update_*` naming
      convention (`workout_delete_unauthorized`, `workout_delete_not_found`,
      `workout_delete_forbidden`, `workout_delete`), each with `duration_ms` like the sibling
      handlers.
    files:
      - api/app/routes/workouts.py
    rationale: |
      Satisfies AC6-8 by construction: reusing `get_entry_for_account` guarantees the same
      404-before-403 precedence and per-account scoping already covered by
      `test_editing_another_accounts_entry_is_refused` for PUT/GET.

  - description: |
      New backend test file covering the DELETE endpoint's ownership and not-found behaviour,
      following the existing `_create_entry` helper and the `other = TestClient(app)` +
      second-signup pattern used in `test_workout_edit.py::test_editing_another_accounts_entry_is_refused`.
    files:
      - api/tests/test_workout_delete.py
    rationale: |
      No existing test file covers DELETE; this is the test-first artifact for AC2, AC6, AC7, AC8.

  - description: |
      Update `history.html`: wrap each row's Edit link and a new Delete button in a
      `.history-row-actions` container (icon-only buttons, per the prototype), add a static
      hidden confirmation modal (`.modal-backdrop[hidden]` > `.modal[role=dialog][aria-modal][aria-labelledby]`
      with title "Delete this entry?", a `<p>` naming the entry and stating "This can't be undone.",
      and "Keep entry" (`btn-secondary`) / "Delete" (`btn-danger`) buttons), and add the CSS the
      prototype defines that `history.html`'s linked sheets (`design-system/tokens.css`,
      `design-system/prototype-utils.css`) do not already provide: `.history-row-actions`,
      `.icon-only-btn`, `.row-error`, `.row-inline-error`, `.modal-backdrop`, `.modal`,
      `.modal-actions` (confirmed `prototype-utils.css` only has `.btn-danger`, not the modal
      rules). Add `flex-wrap: wrap` to `.history-row` per the prototype.
    files:
      - web/public/history.html
    rationale: |
      Structural changes the JS needs to hook into (modal, per-row action buttons, inline error
      slot) plus the styling the prototype specifies that isn't already in the shared stylesheet.

  - description: |
      Update `history.js` rendering and add the delete flow:
        - In `renderHistory`, wrap the existing Edit `<a>` and a new Delete `<button>` in a
          `.history-row-actions` div; Edit becomes icon-only (✏️, `aria-label="Edit"`, keeps its
          existing href/class so `links each row to its edit page` test still passes on `href`);
          Delete is `button.btn.btn-secondary.history-delete-btn.icon-only-btn` with
          `aria-label="Delete"`, wired to open the confirmation modal for that entry.
        - Opening the modal sets the confirmation copy via `textContent` (not `innerHTML`, unlike
          the prototype's fixture-only script, to avoid injecting an exercise name as markup) and
          records which entry id is pending.
        - "Keep entry" / Escape closes the modal with no network call (AC3).
        - Confirming: close the modal, mark that row's Delete button `disabled` with
          `aria-label="Deleting…"`, then
          `fetch(`/api/workouts/${id}`, { method: 'DELETE', credentials: 'include' })`.
          - 204 or 404 -> `window.location.href = 'history.html?deleted=1'` (mirrors
            `edit-workout.js`'s `goToHistoryDeleted`; AC2/AC5, and a 404 is treated as
            already-gone the same way `edit-workout.js` treats a vanished entry on load).
          - 401 -> `window.location.href = 'login.html'` (matches `loadAndRender`'s existing
            session-expiry handling).
          - 403, any other non-2xx status, or a thrown/network error -> re-enable the row's
            Delete button, add `.row-error` to the row, and insert a sibling `<li class="row-inline-error" role="alert">`
            with "Couldn't delete this entry. Check your connection and try again." plus a Retry
            button that re-runs the same confirmed-delete call (AC9, AC10, AC11 — no redirect).
    files:
      - web/public/history.js
    rationale: |
      Implements AC1-3, AC5, AC9-11 in the page that already owns list rendering and the
      `deleted-banner`/`consumeOneShotBanners` mechanism this reuses.

  - description: |
      Extend `web/tests/history.test.js` with delete-flow coverage, following the file's existing
      `loadHistoryPage()`/`flush()`/`global.fetch` mocking conventions and the `window.location`
      stub already set up at the top of `edit-workout.test.js` (`delete window.location; window.location = { href: '', search }`)
      for asserting redirects.
    files:
      - web/tests/history.test.js
    rationale: |
      Test-first coverage for the new UI behaviour (AC1, AC3, AC4, AC5, AC9, AC10, AC11).

tests:
  - |
    AC4 (row shows Delete next to Edit): in history.test.js, `expect(document.querySelectorAll('.history-delete-btn').length).toBe(2)` and `expect(rows[0].querySelector('.history-delete-btn').getAttribute('aria-label')).toBe('Delete')` after rendering `fullFixture`.
  - |
    AC1 (confirmation appears before removal): click a row's `.history-delete-btn`, then `expect(document.querySelector('.modal-backdrop').hidden).toBe(false); expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/workouts/1'), expect.objectContaining({ method: 'DELETE' }))`.
  - |
    AC3 (cancel leaves entry unchanged): open the modal, click "Keep entry" (or dispatch Escape), then `expect(document.querySelectorAll('.history-row').length).toBe(2); expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining('DELETE'))`.
  - |
    AC2/AC5 (confirmed delete removes entry and redirects with deleted-banner): mock `fetch` to resolve `{ status: 204 }` for the DELETE call, confirm, `await flush()`, then `expect(window.location.href).toBe('history.html?deleted=1')`.
  - |
    AC6 (403 for another account's entry) — api/tests/test_workout_delete.py: create an entry as `client_with_signed_up_account`, sign up a second `TestClient(app)` account, `res = other.delete(f"/api/workouts/{entry_id}")`, `assert res.status_code == 403`.
  - |
    AC7 (entry not removed on 403) — same test: after the 403 response, `get_res = client.get(f"/api/workouts/{entry_id}"); assert get_res.status_code == 200`.
  - |
    AC8 (404 for nonexistent entry) — api/tests/test_workout_delete.py: `res = client.delete("/api/workouts/999999"); assert res.status_code == 404`.
  - |
    AC2 continued (owner delete actually removes it) — api/tests/test_workout_delete.py: `del_res = client.delete(f"/api/workouts/{entry_id}"); assert del_res.status_code == 204; get_res = client.get(f"/api/workouts/{entry_id}"); assert get_res.status_code == 404`.
  - |
    AC9/AC10/AC11 (server/network failure leaves entry, shows inline error, no redirect): mock fetch to reject (network) and separately to resolve `{ status: 500 }`, confirm delete for each, `await flush()`, then for both: `expect(document.querySelectorAll('.history-row').length).toBe(2); expect(document.querySelector('.row-inline-error')).not.toBeNull(); expect(window.location.href).toBe('')`.

assumptions_or_open_questions:
  - |
    The prototype turns the existing "Edit" link into an icon-only ✏️ button ("Icon-only per PO
    request") as part of this change, even though no acceptance criterion calls for changing Edit's
    appearance — only for Delete to appear "next to the existing Edit link." Treating this as
    in-scope since it's shown in the approved prototype's screen 1, and the existing
    `links each row to its edit page` test only asserts `href`, not visible text, so it is
    unaffected.
  - |
    AC6/AC7 only specify 403 for another account's entry; the prototype additionally routes a 403
    on delete through the same inline row error + Retry UI used for AC9-11 server/network
    failures (screen 5's note: "A 403 surfaces via the same inline row error as screen 5"). This
    plan follows the prototype and folds 403 into that same error-handling branch in `history.js`,
    since no AC specifies distinct frontend behaviour for a 403 on delete.
  - |
    A 404 from the DELETE call is treated as a successful outcome from the user's perspective
    (redirect to `?deleted=1`), matching the prototype's explicit note and `edit-workout.js`'s
    existing precedent for a vanished entry. No AC directly addresses this case for delete.
  - |
    The prototype's "Simulate success / Simulate server-network error" radio buttons in the modal
    are reviewer-only scaffolding for browsing prototype states and are not built into the real
    implementation.
  - |
    Retry (screen 5) re-issues the same DELETE call for the same entry id rather than requiring
    the user to reopen the confirmation modal, per the prototype's `retryDelete` behaviour.

package_dependencies: []

notes: |
  This mirrors the edit-workout ownership pattern almost exactly (`get_entry_for_account` already
  returns "not_found"/"forbidden"/"ok" and is reused as-is), so the backend addition is small and
  low-risk. The frontend work is the larger piece: a new modal, per-row action buttons, and
  inline retry state layered onto `history.js`'s existing render/fetch flow.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef context fill:#e2e8f0,color:#1a1a1a

    HTMLJS["history.js<br/>renderHistory + delete flow"]:::touched
    HTMLPAGE["history.html<br/>modal + row actions markup/CSS"]:::touched
    ROUTE["routes/workouts.py<br/>DELETE /api/workouts/id"]:::touched
    STORE["store/workouts.py<br/>get_entry_for_account (reused)<br/>delete_entry (new)"]:::touched
    EDITJS["edit-workout.js<br/>goToHistoryDeleted -> ?deleted=1"]:::context

    HTMLPAGE -->|"renders into"| HTMLJS
    HTMLJS -->|"DELETE /api/workouts/id"| ROUTE
    ROUTE -->|"ownership check + delete"| STORE
    EDITJS -.->|"existing precedent for ?deleted=1 redirect, reused not modified"| HTMLJS
  ```

review_focus: |
  In scope: the new `DELETE /api/workouts/{entry_id}` endpoint (reusing `get_entry_for_account`
  verbatim), the history-list Delete action, confirmation modal, and inline row-level error/retry
  UI. Out of scope: any change to the edit flow itself beyond Edit becoming icon-only (a prototype
  decision, not an AC), and the reviewer-only "simulate" toggle in the prototype (not built).
  Riskiest area: the frontend error-handling branch in `history.js` that has to distinguish
  204/404 (success path) from 401 (redirect to login) from 403/5xx/network-error (inline retry,
  per the approved design) — a reviewer should check that a 403 deliberately does NOT redirect
  to `?deleted=1`, since that's a specific, non-obvious design call rather than an oversight.
  Also confirm the modal's entry-name interpolation uses `textContent`, not `innerHTML` (the
  prototype's own script uses `innerHTML`, which this plan deliberately deviates from to avoid
  an XSS risk from an exercise name).
