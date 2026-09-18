summary: |
  Add a pre-auth welcome/landing page (index.html + index.js) that redirects an authenticated
  visitor straight to dashboard.html and otherwise shows the app name, a one-paragraph intro, and
  side-by-side "Log in"/"Sign up" links, per the approved prototype
  (.arc/designs/FTP-STORY-006-design.html, "Welcome — No session" and "Welcome — Checking session"
  screens). Add a working, reusable logout control to Profile and Account Settings, matching
  the avatar-menu ("View profile" / "Logout") pattern the prototype puts on all three
  authenticated screens, with an inline error message on logout failure that does NOT redirect.
  Leave the Log/Progress tabs disabled everywhere, and leave the existing login<->signup and
  dashboard<->profile navigation and profile edit/save behavior untouched, since AC10/AC11
  require them to keep working exactly as before this story. Two points where the prototype's
  own markup goes further than, or is internally inconsistent with, the acceptance criteria are
  called out below and resolved in favor of the ACs, not the prototype, with the prototype
  alternative recorded as an open question for the reviewer to confirm or override.

scope:
  - description: |
      Create `web/public/index.html` as the new app-root welcome page, using only the design
      system's existing tokens/utilities plus new welcome-only rules. Structure (from the
      prototype's "Welcome — No session" screen, design html lines 668-686):
      a `.welcome-shell` wrapper centering a `.welcome-card` containing a `.welcome-logo` avatar
      circle (decorative emoji, `aria-hidden="true"`), an `<h1>` app name "Fitness Tracker", a
      one-paragraph muted intro copied verbatim from the prototype ("Fitness Tracker helps you
      log workouts, track your progress toward a goal, and keep your body stats in one place —
      so you always know how today's effort fits your bigger picture."), and a `.welcome-options`
      row with two links, per the prototype's own build note at design html line 664: ship as
      `<a class="btn btn-primary" href="login.html">Log in</a>` and
      `<a class="btn btn-secondary" href="signup.html">Sign up</a>` (anchors, not buttons — the
      prototype's `<button>` elements exist only to drive its in-deck simulation). Include a
      `#welcome-checking` / spinner state shown before the session check resolves, matching the
      prototype's "Welcome — Checking session" screen, to avoid a flash of the welcome content
      for a session that turns out to be active.
    files:
      - web/public/index.html
    rationale: |
      AC1, AC3, AC4 require this exact markup and copy; the design is the only record of layout,
      copy, and component choice, so the plan pins the source lines it draws from.
  - description: |
      Create `web/public/index.js`, mirroring the structure of `login.js`'s
      `checkExistingSession` (login.js:80-92): on load, `fetch('/api/me', { credentials:
      'include' })`; if `res.status === 200`, redirect to `dashboard.html`; otherwise (including
      a thrown network error/timeout) reveal the welcome markup. Export a named function so tests
      can call it directly without triggering the auto-run, mirroring dashboard.js:31's guard
      pattern:
      ```js
      export async function checkWelcomeSession() {
        try {
          const res = await fetch('/api/me', { credentials: 'include' });
          if (res.status === 200) {
            window.location.href = 'dashboard.html';
            return;
          }
          revealWelcome();
        } catch (error) {
          console.error('welcome_session_check_failed', { error });
          revealWelcome();
        }
      }

      if (document.getElementById('welcome-checking')) {
        checkWelcomeSession();
      }
      ```
    files:
      - web/public/index.js
    rationale: |
      Satisfies AC2 (redirect on active session), AC3 (show welcome on no session), AC12
      (treat any fetch failure as "no session"). Reuses the exact pattern already proven in
      login.js rather than inventing a new one.
  - description: |
      Add welcome-only CSS rules (`.welcome-shell`, `.welcome-card`, `.welcome-logo`,
      `.welcome-options`, and a `#welcome-checking` spinner state using the prototype's
      `.spinner`/`@keyframes spin` rules, design html lines 503-556) as a page-level `<style>`
      block inside `index.html`, following the existing convention of page-scoped rules living
      in the page itself (see dashboard.html:9-26's `.empty-state`/`.empty-illustration` block)
      rather than in the shared `design-system/prototype-utils.css`, since these rules are used
      on no other page.
    files:
      - web/public/index.html
    rationale: |
      Keeps shared design-system CSS free of single-page rules, consistent with how
      dashboard.html already scopes its own one-off styles.
  - description: |
      Add a shared `.avatar-menu` / `.avatar-menu-trigger` / `.avatar-menu-dropdown` /
      `.avatar-menu-item` / `.avatar-menu-error` rule set to `design-system/prototype-utils.css`,
      copied from the prototype (design html lines 577-639), since this component is reused
      across dashboard, profile, and account-settings (see next two scope items) and belongs in
      the shared stylesheet rather than duplicated per page. Also apply the prototype's `.btn`
      fix — adding `box-sizing: border-box;` to the shared `.btn` rule (design html line 106,
      with its comment explaining the pre-existing btn-block overflow bug on
      `Profile`'s "Account settings" link and `Account settings`'s "Delete my account" link) —
      as its own explicit, called-out change to the shared stylesheet.
    files:
      - design-system/prototype-utils.css
    rationale: |
      AC16 requires the Profile/Account-settings logout control to mirror the dashboard's
      control exactly; putting the shared component and the box-sizing fix in one place avoids
      three divergent copies and fixes a design-confirmed layout bug once.
  - description: |
      DESIGN-DRIVEN CHANGE BEYOND THE STORY'S STATED GOALS (flagged for reviewer confirmation):
      convert dashboard.html's/dashboard.js's standalone `Log out` button (dashboard.html:35-37,
      `<button class="btn btn-secondary" id="logout-button">Log out</button>`) into the
      prototype's avatar-menu dropdown ("Dashboard — avatar menu" screen, design html lines
      733-761): a `.avatar-menu` wrapping the existing avatar circle as
      `.avatar-menu-trigger`, opening a `.avatar-menu-dropdown` with a "View profile" link
      (`href="profile.html"`) and a "Logout" button, replacing the separate avatar + button
      pair. dashboard.js keeps its existing `logout()` function/behavior (unconditional redirect
      to `login.html?logged_out=1`) unchanged — only the trigger element and toggle behavior are
      new. The story's stated goals only ask for a logout affordance on Profile/Account
      Settings, not a redesign of dashboard's existing one; this scope item exists solely
      because the only design record redesigns all three consistently, and AC16 requires the
      new pages to "mirror the exact placement and styling of the dashboard's logout control."
      If the reviewer prefers dashboard's control stay a plain button, drop this item and give
      Profile/Account Settings a matching plain `btn-secondary` "Log out" button instead (see
      `assumptions_or_open_questions`).
    files:
      - web/public/dashboard.html
      - web/public/dashboard.js
    rationale: |
      Needed only to make AC16 well-defined against a single, consistent reference control;
      without it "mirrors the dashboard's logout control" has no fixed target since two logout
      shapes (plain button vs. avatar menu) both currently have a design citation.
  - description: |
      Add the avatar-menu logout control to `web/public/profile.html`'s existing top-app-bar
      avatar (profile.html:14-20), matching the "Profile — avatar menu" screen (design html
      lines 774-825): wrap the avatar in `.avatar-menu`, add the dropdown with "View profile"
      (self-link) and a "Logout" button (`id="profile-logout-btn"`), plus a hidden inline error
      element `<p class="inline-error avatar-menu-error" id="profile-logout-error" hidden>` per
      design html line 793. Do NOT remove or alter the existing bottom-tab "Profile" link
      (profile.html:117) — AC10 requires dashboard<->profile navigation to keep working exactly
      as before this story, which overrides the prototype's own removal of that tab (see
      `assumptions_or_open_questions`).
    files:
      - web/public/profile.html
    rationale: AC7, AC16 require a visible, dashboard-matching logout control on Profile.
  - description: |
      Add `web/public/profile.js` logout wiring. Reuse the `/api/logout` endpoint and success
      redirect, but NOT dashboard.js's `logout()` function verbatim, since that function
      redirects unconditionally on any outcome including a failed fetch — incompatible with
      AC13/AC14 which require staying on the page with an inline error on failure:
      ```js
      export async function logout() {
        const errorEl = document.getElementById('profile-logout-error');
        errorEl.hidden = true;
        try {
          const res = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
          if (res.status !== 200) {
            errorEl.hidden = false;
            return;
          }
        } catch (error) {
          console.error('logout_fetch_failed', { error });
          errorEl.hidden = false;
          return;
        }
        window.location.href = 'login.html?logged_out=1';
      }

      document.getElementById('profile-logout-btn')?.addEventListener('click', logout);
      ```
      Also wire the avatar-menu trigger's open/close toggle (mirrors design html lines 999-1014).
    files:
      - web/public/profile.js
    rationale: |
      AC8 (success -> redirect), AC13 (inline error near the control on failure), AC14 (no
      redirect on failure).
  - description: |
      Mirror the same avatar-menu + logout wiring on `web/public/account-settings.html`
      (top-app-bar at account-settings.html:13-15, currently no avatar/logout at all) and
      `web/public/account-settings.js`, per the "Account settings — avatar menu" screen (design
      html lines 916-966): add an avatar (account-settings.html currently has none — introduce
      one per the design so the menu has a trigger), dropdown with "View profile"
      (`href="profile.html"`) and "Logout" (`id="settings-logout-btn"`), and a matching
      `#settings-logout-error` inline error element. Leave the existing bottom-tab "Profile"
      link (account-settings.html:50) unchanged for the same AC10-driven reason as Profile.
    files:
      - web/public/account-settings.html
      - web/public/account-settings.js
    rationale: AC7, AC8, AC13, AC14, AC16 apply identically to Account Settings.
  - description: |
      No changes to `web/server.py`. Verified `SimpleHTTPRequestHandler.list_directory` is only
      reached when no `index.html` is found in the served directory; adding
      `web/public/index.html` is sufficient for the root `/` request to serve it instead of a
      directory listing, satisfying AC1 with a static-file addition only.
    files: ""
    rationale: |
      Confirms AC1 doesn't require a server code change, keeping this plan's scope to static
      assets and their tests.
  - description: |
      Leave `dashboard.html`, `profile.html`, `account-settings.html`'s disabled `Log`/`Progress`
      bottom tabs (`<div class="bottom-tab" role="button" aria-disabled="true">`) untouched.
    files: ""
    rationale: AC9 requires no change here; called out so it isn't accidentally touched while editing the same top-app-bar/bottom-tabs regions.

tests:
  - |
    web/tests/index.test.js — "GET / behavior (AC1)": since there is no python/pytest harness in
    this repo (only `web/tests/*.test.js` under vitest), assert AC1 at the file level instead of
    spinning up the HTTP server: `expect(fs.existsSync(path.resolve(__dirname,
    '../public/index.html'))).toBe(true)` and that its content contains the welcome markup
    (`expect(html).toContain('welcome-shell')`). Currently failing because index.html does not exist.
  - |
    web/tests/index.test.js — "redirects to dashboard.html when a session exists (AC2)":
    ```js
    global.fetch.mockResolvedValue({ status: 200, json: async () => ({ email: 'a@b.com', display_name: 'A' }) });
    delete window.location; window.location = { href: '' };
    const { checkWelcomeSession } = await loadWelcomePage();
    await checkWelcomeSession();
    expect(window.location.href).toBe('dashboard.html');
    ```
    Fails until index.js exists and exports checkWelcomeSession with this behavior.
  - |
    web/tests/index.test.js — "shows the welcome screen's app name and intro when no session (AC3)":
    ```js
    global.fetch.mockResolvedValue({ status: 401, json: async () => ({}) });
    const { checkWelcomeSession } = await loadWelcomePage();
    await checkWelcomeSession();
    expect(document.querySelector('.welcome-card h1').textContent).toBe('Fitness Tracker');
    expect(document.querySelector('.welcome-card p.text-muted').textContent).toMatch(/log workouts/);
    ```
  - |
    web/tests/index.test.js — "Log in and Sign up render side by side (AC4)":
    `expect(document.querySelectorAll('.welcome-options > a.btn').length).toBe(2);`
  - |
    web/tests/index.test.js — "Log in navigates to login.html (AC5)":
    `expect(document.querySelector('#welcome-login-btn').getAttribute('href')).toBe('login.html');`
  - |
    web/tests/index.test.js — "Sign up navigates to signup.html (AC6)":
    `expect(document.querySelector('#welcome-signup-btn').getAttribute('href')).toBe('signup.html');`
  - |
    web/tests/profile.test.js — "shows a logout control (AC7)":
    `expect(document.getElementById('profile-logout-btn')).not.toBeNull();`
    web/tests/account-settings.test.js — same assertion for `settings-logout-btn`.
  - |
    web/tests/profile.test.js — "logout posts to /api/logout and redirects on success (AC8)":
    ```js
    global.fetch.mockResolvedValue({ status: 200, json: async () => ({}) });
    delete window.location; window.location = { href: '' };
    const { logout } = await loadProfilePage();
    await logout();
    expect(global.fetch).toHaveBeenCalledWith('/api/logout', { method: 'POST', credentials: 'include' });
    expect(window.location.href).toBe('login.html?logged_out=1');
    ```
    Mirrored in account-settings.test.js.
  - |
    web/tests/dashboard.test.js, profile.test.js, account-settings.test.js — "Log/Progress tabs
    remain disabled with no href (AC9)":
    ```js
    document.querySelectorAll('.bottom-tab[aria-disabled="true"]').forEach((tab) => {
      expect(tab.hasAttribute('href')).toBe(false);
    });
    ```
    This should already pass unchanged; included as a regression guard for this story's edits to
    the same top-app-bar/bottom-tabs regions.
  - |
    web/tests/profile.test.js — "Today tab still links to dashboard.html and Profile tab is
    still present (AC10)":
    ```js
    expect(document.querySelector('.bottom-tab[href="dashboard.html"]')).not.toBeNull();
    expect(document.querySelector('a.bottom-tab.active[href="profile.html"]')).not.toBeNull();
    ```
    Existing login<->signup navigation tests (login.test.js's "signup page sign-in link"
    describe block) are left as-is and re-run unchanged as a regression guard.
  - |
    web/tests/profile.test.js — "existing profile save flow is unchanged (AC11)": re-run the
    existing "shows 'Not set' for fields left blank" and "renders inline field errors from a
    rejected save" tests unmodified; they must continue to pass after the avatar-menu markup is
    added, proving the form/save code path was not touched.
  - |
    web/tests/index.test.js — "treats a network error from /api/me as no session (AC12)":
    ```js
    global.fetch.mockRejectedValue(new Error('network down'));
    const { checkWelcomeSession } = await loadWelcomePage();
    await checkWelcomeSession();
    expect(document.querySelector('.welcome-card')).not.toBeNull();
    expect(window.location.href).toBe('');
    ```
  - |
    web/tests/profile.test.js — "shows an inline error and does not redirect when logout fails
    (AC13, AC14)":
    ```js
    global.fetch.mockResolvedValue({ status: 500, json: async () => ({}) });
    delete window.location; window.location = { href: '' };
    const { logout } = await loadProfilePage();
    await logout();
    expect(document.getElementById('profile-logout-error').hidden).toBe(false);
    expect(window.location.href).toBe('');
    ```
    Mirrored in account-settings.test.js against `settings-logout-error`.
  - |
    web/tests/index.test.js — "matches the approved welcome mockup's copy and layout (AC15)":
    covered by the AC3/AC4 assertions above (exact h1 text, exact intro paragraph substring,
    two-button `.welcome-options` layout) since the design prototype is the approved spec and
    those assertions are taken directly from it.
  - |
    web/tests/profile.test.js and account-settings.test.js — "logout control mirrors dashboard's
    placement and styling (AC16)":
    ```js
    expect(document.querySelector('.avatar-menu .avatar-menu-trigger .avatar')).not.toBeNull();
    expect(document.querySelector('.avatar-menu-dropdown .avatar-menu-item.danger')).not.toBeNull();
    ```
    plus a `web/tests/dashboard.test.js` update asserting the same selectors exist on the
    converted dashboard avatar menu, so all three pages are checked against one shared markup
    shape rather than three independent guesses.

assumptions_or_open_questions:
  - |
    CONFLICT 1 (resolved in the plan, flagged for reviewer override): the prototype redesigns
    dashboard's existing standalone "Log out" button into an avatar-menu dropdown and applies
    the same pattern to Profile/Account Settings (design html lines 733-761, 774-825, 916-966).
    The story's stated goals only ask for a logout control on Profile/Account Settings, not a
    change to dashboard's existing one. This plan follows the prototype and converts all three
    for a consistent AC16 reference point. Alternative if the reviewer disagrees: drop the
    dashboard.html/dashboard.js scope item and instead give Profile/Account Settings a plain
    `<button class="btn btn-secondary">Log out</button>` next to their avatar, matching
    dashboard's *current* (pre-story) control exactly, and drop the avatar-menu CSS entirely.
  - |
    CONFLICT 2 (resolved in the plan against the prototype): the prototype's own comments say
    the "Profile" bottom-tab was "removed per reviewer feedback" on all three screens, reached
    instead only via the avatar menu's "View profile" link. This plan keeps the existing
    bottom-tab "Profile" link on all three pages unchanged, because AC10 explicitly requires
    dashboard<->profile navigation to "continue to function exactly as before this story," which
    the tab removal would violate. If the reviewer intends AC10 to only cover the *login<->signup*
    links and wants the tab removed as the design shows, say so and this plan will drop that tab
    and rely solely on "View profile" instead.
  - |
    CONFLICT 3 (resolved in the plan): the prototype's own logout-error markup is inconsistent
    between screens — the avatar-menu screens show a small `.avatar-menu-error` caption
    positioned under the avatar (design html lines 793, 929), while the dedicated "Profile —
    logout failed" screen instead uses a full-width `.banner` component at the top of the
    content area (design html lines 836-870), with a comment saying it replaced the caption "per
    reviewer feedback" in an earlier revision. This plan uses the `.avatar-menu-error` caption
    since AC13 says the error must appear "near the logout control," which the caption satisfies
    more directly than a page-top banner. If the reviewer intended the banner treatment to win
    (as its own comment suggests), say so and this plan will switch to the `.banner` markup
    instead, reusing profile.html's existing `#save-error-banner` structure as the template.
  - |
    Assumed account-settings.html's current lack of any avatar/user-identity element in its
    top-app-bar (account-settings.html:13-15) means one must be added purely as the logout
    menu's trigger, per the "Account settings — avatar menu" screen — no other AC asks for an
    avatar there independent of logout.
  - |
    Assumed "Fitness Tracker" as the literal `<h1>` text and the prototype's exact intro
    paragraph text (design html lines 673-677) are the "approved mockup/spec" copy referenced by
    AC15, since the prototype is the only design record and its own comments describe this as
    "proposed copy" already carried through the review rounds shown in the deck.
  - |
    Assumed no dedicated pytest/http-level test is expected for AC1 given the repo's test
    layout only contains `web/tests/*.test.js` under vitest; AC1 is verified at the file-existence
    and markup level rather than by driving `web/server.py`'s HTTP handling directly.

package_dependencies: []

notes: |
  This mirrors `login.js`'s `checkExistingSession` pattern (login.js:80-92) for index.js, and
  reuses `/api/logout` + the `login.html?logged_out=1` redirect from `dashboard.js:22-29` for
  the success path only — the failure path deliberately diverges from dashboard.js's `logout()`
  because that function redirects unconditionally, which would violate AC13/AC14.

  ```mermaid
  flowchart TD
    classDef touched fill:#f96,color:#000
    classDef untouched fill:#eee,color:#333

    idxHtml[index.html]:::touched
    idxJs[index.js]:::touched
    apiMe[/GET /api/me/]:::untouched
    dashHtml[dashboard.html]:::touched
    dashJs[dashboard.js]:::touched
    profHtml[profile.html]:::touched
    profJs[profile.js]:::touched
    acctHtml[account-settings.html]:::touched
    acctJs[account-settings.js]:::touched
    apiLogout[/POST /api/logout/]:::untouched
    protoCss[design-system/prototype-utils.css]:::touched
    loginHtml[login.html]:::untouched
    loginJs[login.js]:::untouched

    idxHtml -->|loads| idxJs
    idxJs -->|checks session, mirrors login.js:80-92| apiMe
    idxJs -->|no session: reveal welcome, links to| loginHtml
    idxJs -->|session found: redirect| dashHtml
    dashHtml -->|avatar-menu logout, converted this story| dashJs
    profHtml -->|new avatar-menu logout| profJs
    acctHtml -->|new avatar-menu logout| acctJs
    dashJs -->|POST, unconditional redirect - unchanged| apiLogout
    profJs -->|POST, inline error on failure - new| apiLogout
    acctJs -->|POST, inline error on failure - new| apiLogout
    profJs -->|success redirect| loginHtml
    acctJs -->|success redirect| loginHtml
    dashHtml -.shares avatar-menu CSS.-> protoCss
    profHtml -.shares avatar-menu CSS.-> protoCss
    acctHtml -.shares avatar-menu CSS.-> protoCss
  ```
