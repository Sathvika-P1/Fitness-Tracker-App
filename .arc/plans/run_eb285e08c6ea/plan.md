summary: |
  This is a greenfield story: the repository currently contains only the design system
  (`design-system/tokens.css`, `prototype-utils.css`, `style-guide.html`) and the approved
  prototype at `.arc/designs/FTP-STORY-001-design.html` — there is no application code, package
  manifest, or server yet. This plan stands up the minimum vertical slice needed to satisfy
  FTP-STORY-001: a Python **FastAPI** API (port from `ARC_DEV_PORT=8001`, run via `uvicorn`)
  backed by a **MySQL** database (via SQLAlchemy + PyMySQL) holding `accounts` and `sessions`
  tables, plus a plain HTML/CSS/JS signup page (port from `ARC_WEB_PORT=3001`) built directly
  from the approved prototype's "Sign Up — Empty" / "Validation Errors" / "Duplicate Email"
  screens. The two-port `.env` split drove the API/web separation. AC6 (account data isolation)
  is satisfied with a minimal account-scoped `GET /api/me` endpoint — not a workout-logging
  model, since AC7 explicitly says the account-identity reference mechanism for future logging
  features is out of scope here. A lightweight ADR stub captures that open architectural question
  per AC7.
  (Revised twice: first per reviewer request to use FastAPI instead of Node/Express for the
  backend, then per reviewer request to persist accounts/sessions in a MySQL database instead
  of in-memory structures. The frontend remains plain HTML/JS throughout, decoupled from any
  Node or database toolchain.)

scope:
  - description: |
      Scaffold the API project: `api/pyproject.toml` declaring FastAPI, uvicorn, SQLAlchemy,
      PyMySQL, passlib/bcrypt, and pytest, plus a FastAPI app entrypoint (`api/app/main.py`)
      that creates the `FastAPI()` instance, includes the auth router, and on startup calls
      `Base.metadata.create_all(engine)` to ensure the `accounts`/`sessions` tables exist (no
      full migration framework like Alembic — the schema is small enough for
      create-if-missing, flagged in assumptions). Adds `api/app/db.py`:
      ```python
      DATABASE_URL = os.environ.get(
          "DATABASE_URL", "mysql+pymysql://ftp:ftp@localhost:3306/ftp_signup"
      )
      engine = create_engine(DATABASE_URL, pool_pre_ping=True)
      SessionLocal = sessionmaker(bind=engine)
      ```
      Also adds `docker-compose.yml` at the repo root with a single `mysql:8` service
      (`ftp_signup` database, `ftp`/`ftp` credentials) so the API has a local MySQL instance to
      run and test against, since none exists in the repo today.
    files:
      - api/pyproject.toml
      - api/app/main.py
      - api/app/__init__.py
      - api/app/db.py
      - docker-compose.yml
    rationale: |
      There is no existing backend or database to extend — every subsequent scope item needs
      both a FastAPI app object for tests to import and a real MySQL connection to read/write
      through. `docker-compose.yml` is the smallest way to give the story a runnable local
      database without depending on a pre-existing managed instance.
  - description: |
      Account store module backed by a SQLAlchemy `accounts` table:
      ```python
      class Account(Base):
          __tablename__ = "accounts"
          id = Column(Integer, primary_key=True, autoincrement=True)
          email = Column(String(255), unique=True, nullable=False)
          password_hash = Column(String(255), nullable=False)
          display_name = Column(String(255), nullable=False)
      ```
      `email` is stored already-lowercased (mirrors the prototype's
      `a.email.toLowerCase() === email.toLowerCase()` duplicate check at
      `.arc/designs/FTP-STORY-001-design.html:742`) and has a `UNIQUE` constraint, so the
      database itself is the second line of defense against duplicates. Exposes:
      ```python
      def create_account(db: Session, email: str, password: str, display_name: str) -> Account: ...
      def find_by_email(db: Session, email: str) -> Account | None: ...
      def count(db: Session) -> int: ...
      def verify_password(db: Session, email: str, password: str) -> bool: ...
      ```
      `create_account` first checks `find_by_email`; if found, raises `DuplicateEmailError`
      without issuing an `INSERT` (belt-and-braces with the column's `UNIQUE` constraint, which
      would also raise `IntegrityError` on a race). Passwords are hashed with `passlib`'s
      `bcrypt` scheme before storage — never stored in plaintext.
    files:
      - api/app/store/accounts.py
      - api/app/store/models.py
    rationale: |
      Moves uniqueness and hashing logic onto durable storage per reviewer request, so
      accounts survive process restarts; the `UNIQUE` column constraint gives AC4 ("no
      duplicate account is created") a database-level guarantee, not just an application-level
      check.
  - description: |
      Session store backed by a SQLAlchemy `sessions` table:
      ```python
      class SessionRow(Base):
          __tablename__ = "sessions"
          id = Column(String(64), primary_key=True)
          account_id = Column(Integer, ForeignKey("accounts.id"), nullable=False)
      ```
      with:
      ```python
      def create_session(db: Session, account_id: int) -> str: ...
      def get_account_id_for_session(db: Session, session_id: str) -> int | None: ...
      ```
      `create_session` generates the id via `secrets.token_urlsafe(32)`. The signup route sets
      the returned id as an httpOnly `sid` cookie on success, so AC2's "signed in immediately"
      requirement is met without any email-verification step.
    files:
      - api/app/store/sessions.py
      - api/app/store/models.py
    rationale: |
      A minimal, DB-backed session mechanism is the smallest thing that lets AC2 (immediate
      sign-in) and AC6 (per-session, account-scoped data) both be true and survive a process
      restart, per the reviewer's persistence request.
  - description: |
      `POST /api/signup` route: request body validated by a Pydantic model
      ```python
      class SignupRequest(BaseModel):
          email: str = ""
          password: str = ""
          display_name: str = ""
      ```
      (defaults of `""` rather than required fields, so a missing field is caught by this
      route's own presence check — not FastAPI's generic 422 — keeping the per-field error
      copy exactly as in the prototype). Checks `email`, `password`, then `display_name` in
      that order, returning `400` with `{"field": "email" | "password" | "display_name",
      "message": ...}` for the first missing one, matching the prototype's inline error copy
      ("Enter an email/password/display name to continue.",
      `.arc/designs/FTP-STORY-001-design.html:731-733`). On a normalized-email collision
      (whether caught by `find_by_email` or a raised `IntegrityError` from the `UNIQUE`
      constraint) returns `409` with `{"field": "email", "message": "This email is taken."}`
      (prototype line 580) and does not commit a new row. On success, calls `create_account`,
      creates a session row, sets the `sid` cookie via
      `response.set_cookie(..., httponly=True)`, and returns `201` with `{"email": ...,
      "display_name": ...}` (never the password hash). Also adds `GET /api/me`, which reads the
      `sid` cookie, looks up the session row's `account_id`, loads that account, and returns
      `{"email": ..., "display_name": ...}` for that session's own account only, or `401` if
      there is no valid session — this is the AC6 isolation seam. The DB session is injected via
      FastAPI's `Depends(get_db)`, yielding a `SessionLocal()` per request and closing it after.
    files:
      - api/app/routes/auth.py
      - api/app/db.py
    rationale: |
      One route file groups the two closely-related, small endpoints this story needs; keeps
      the account-scoped read (`GET /api/me`) intentionally minimal per the AC7 note that a
      logging-specific identity mechanism is future, out-of-scope work.
  - description: |
      Signup page markup and styling, adapted directly from the approved prototype's
      "Sign Up — Empty" screen (`.arc/designs/FTP-STORY-001-design.html:452-482`): the
      `.auth-shell`/`.auth-card.card` wrapper, `card-title` "Create your account", muted
      `card-body` subtitle, three `.field` blocks (email/password/display name) each with a
      `.label`, `.input`, and a `.field-error-text[role=alert]` sibling that starts hidden, and
      a full-width `.btn.btn-primary.btn-block` submit button. Imports
      `design-system/tokens.css` (declared in `.arc/config/design.yaml`) rather than re-inlining
      the token block, since the prototype file itself is marked `<!-- arc:css-inlined -->` for
      review purposes only. The password field keeps the prototype's "At least 8 characters"
      placeholder and "Minimum 8 characters." helper text verbatim as a passive hint only — see
      `assumptions_or_open_questions`, this story does not enforce a minimum length server-side.
      The "Already have an account? Sign in" link (prototype line 479) and the empty-dashboard
      screen's bottom tab bar are rendered as present-but-inert static markup, per the design's
      own header comment that the tab bar "is a placeholder for the app shell that later stories
      will build out; it is not this story's scope" (prototype lines 237-239) — no login route
      or tab navigation is wired up in this story.
    files:
      - web/public/signup.html
      - web/public/dashboard.html
      - web/public/signup.js
    rationale: |
      Builds the already-approved screens as real, working markup instead of the prototype's
      simulated fixture/`setTimeout` flow, wiring `signup.js` to the real `/api/signup` and
      `/api/me` endpoints. Plain JS (no TypeScript/Node build step) keeps the frontend decoupled
      from the Python/MySQL backend's toolchain, servable as static files.
  - description: |
      `signup.js` behavior: on submit, clears prior field errors, validates client-side only
      for immediate feedback (server is the source of truth), disables and relabels the submit
      button to "Creating account…" while the request is in flight (prototype lines 547,
      737-738, `fetch('/api/signup', { method: 'POST', credentials: 'include', ... })`), then
      either renders inline field errors / the duplicate-email `.banner` (prototype lines
      570-576, exact copy "That email is already registered" / "already has an account. No new
      account was created.") or navigates to `dashboard.html`, which calls
      `fetch('/api/me', { credentials: 'include' })` and renders the welcome header with the
      returned `display_name` and email (prototype lines 606-611).
    files:
      - web/public/signup.js
      - web/public/dashboard.js
    rationale: |
      This is the functional wiring behind the markup above; kept as a second scope item
      because it is logic-heavy and independently testable via jsdom, separate from the
      static markup review.
  - description: |
      ADR stub satisfying AC7, transcribed from the prototype's "Architecture Note (ADR Stub)"
      screen content (`.arc/designs/FTP-STORY-001-design.html:686-701`), deliberately without
      referencing any specific future work item.
    files:
      - docs/adr/0001-account-identity-reference-stub.md
    rationale: |
      AC7 requires this note to exist as a durable artifact, not just as a reviewable prototype
      screen; the prototype screen is explicitly annotated as documenting intended content for
      sign-off, with the real file being this story's deliverable.

tests:
  - |
    AC1 — POST /api/signup with a valid, unused email/password/display_name creates an account
    row in MySQL. (api/tests/test_signup.py, pytest + fastapi.testclient.TestClient, with a
    fixture that points DATABASE_URL at a disposable test schema and truncates
    accounts/sessions before each test.)
    ```python
    res = client.post("/api/signup", json={
        "email": "new.user@example.com", "password": "<PLACEHOLDER>", "display_name": "New U."
    })
    assert res.status_code == 201
    assert accounts.find_by_email(db, "new.user@example.com") is not None
    ```
  - |
    AC2 — the same signup response signs the visitor in immediately, no verification step.
    ```python
    res = client.post("/api/signup", json={
        "email": "new2.user@example.com", "password": "<PLACEHOLDER>", "display_name": "New U."
    })
    me = client.get("/api/me")
    assert me.status_code == 200
    assert me.json() == {"email": "new2.user@example.com", "display_name": "New U."}
    ```
  - |
    AC3 — signup with an already-registered email is rejected with a clear, field-anchored error.
    ```python
    client.post("/api/signup", json={
        "email": "dup@example.com", "password": "<PLACEHOLDER>", "display_name": "Dup A"
    })
    res = client.post("/api/signup", json={
        "email": "dup@example.com", "password": "<PLACEHOLDER_2>", "display_name": "Dup B"
    })
    assert res.status_code == 409
    assert res.json() == {"field": "email", "message": "This email is taken."}
    ```
  - |
    AC4 — the rejected duplicate does not create a second row in the accounts table.
    ```python
    client.post("/api/signup", json={
        "email": "dup2@example.com", "password": "<PLACEHOLDER>", "display_name": "Dup A"
    })
    before = accounts.count(db)
    client.post("/api/signup", json={
        "email": "dup2@example.com", "password": "<PLACEHOLDER_2>", "display_name": "Dup B"
    })
    assert accounts.count(db) == before
    ```
  - |
    AC5 — omitting any of email, password, or display name blocks signup and names the field.
    ```python
    res = client.post("/api/signup", json={
        "email": "", "password": "<PLACEHOLDER>", "display_name": "No Email"
    })
    assert res.status_code == 400
    assert res.json() == {"field": "email", "message": "Enter an email to continue."}
    ```
  - |
    AC6 — two accounts' authenticated sessions each return only their own data via GET /api/me,
    read from their own row via each session's account_id.
    ```python
    client_a, client_b = TestClient(app), TestClient(app)
    client_a.post("/api/signup", json={
        "email": "alice@example.com", "password": "<PLACEHOLDER>", "display_name": "Alice"
    })
    client_b.post("/api/signup", json={
        "email": "bob@example.com", "password": "<PLACEHOLDER>", "display_name": "Bob"
    })
    me_a = client_a.get("/api/me").json()
    me_b = client_b.get("/api/me").json()
    assert me_a["email"] == "alice@example.com"
    assert me_b["email"] == "bob@example.com"
    assert me_a["email"] != me_b["email"]
    ```
  - |
    AC7 — an ADR stub documents the future account-identity reference decision, unlinked
    to any specific work item.
    ```python
    text = Path("docs/adr/0001-account-identity-reference-stub.md").read_text()
    assert "account-identity reference" in text.lower()
    assert not re.search(r"FTP-[A-Z]+-\d+", text)
    ```
  - |
    Frontend — signup.js renders each omitted-field error inline next to its own field, and
    the duplicate-email banner, matching the prototype's per-field pattern (vitest + jsdom).
    ```js
    await submitSignupForm({ email: '', password: 'pw-1', displayName: 'X' });
    expect(document.getElementById('email-error').textContent)
      .toContain('Enter an email to continue.');
    expect(document.getElementById('email').classList.contains('has-error')).toBe(true);
    ```
  - |
    Database constraint — the accounts.email column enforces uniqueness at the schema level,
    independent of the application check (defends AC4 against a race between concurrent
    requests). (api/tests/test_accounts_store.py)
    ```python
    accounts.create_account(db, "race@example.com", "pw12345678", "Racer")
    db.commit()
    with pytest.raises(IntegrityError):
        db.execute(
            accounts.Account.__table__.insert(),
            {"email": "race@example.com", "password_hash": "x", "display_name": "Racer 2"},
        )
        db.commit()
    ```

assumptions_or_open_questions:
  - |
    The prototype's password field shows "Minimum 8 characters" as helper/placeholder text
    (`.arc/designs/FTP-STORY-001-design.html:468-469`), and its own inline comment
    (lines 447-449) flags this rule as "not specified in the ACs — flagged for reviewer
    confirmation, a safe default." This plan keeps that copy in the UI as a passive hint but
    does NOT enforce a minimum password length server-side, since no AC requires it. Please
    confirm whether server-side enforcement should be added as part of this story or deferred.
  - |
    No package manifest, framework, or test runner exists in the repo yet. Per reviewer
    direction, this plan uses Python + FastAPI + uvicorn for the API and, per the latest
    reviewer request, persists accounts/sessions in MySQL via SQLAlchemy + PyMySQL rather than
    in memory. Since no MySQL instance exists in this repo/environment today, this plan adds a
    root-level `docker-compose.yml` with a `mysql:8` service as the simplest way to provide one
    for local dev and CI test runs. If there is already a managed MySQL instance or a different
    provisioning convention you'd prefer (e.g. a shared dev database, a different MySQL version,
    or SQLite for tests only), flag it and I'll adjust `DATABASE_URL`/`docker-compose.yml`
    accordingly.
  - |
    Schema creation uses SQLAlchemy's `Base.metadata.create_all()` at app startup rather than a
    migration tool (e.g. Alembic), since the schema is two small tables for this story. If
    future stories are expected to evolve this schema, introducing Alembic then (or now, if
    preferred) is a reasonable follow-up — flagging so it's a deliberate choice, not an oversight.
  - |
    Test isolation for the DB-backed store assumes a dedicated, disposable test schema
    (`DATABASE_URL` pointed at it during `pytest`), with a fixture that truncates
    `sessions`/`accounts` before each test. This avoids cross-test pollution for the AC4
    count-based assertion and the AC6 two-account isolation test.
  - |
    The "Account Isolation (Review Device)" screen (prototype lines 635-674) is explicitly
    reviewer tooling only ("in the shipped product each visitor only ever sees their own single
    dashboard") and is NOT built as a shipped screen; AC6 is instead verified via the API test
    above plus the single-account dashboard screen already in scope.
  - |
    AC6 is satisfied via the minimal `GET /api/me` endpoint returning only the caller's own
    email/display_name. No workout-logging data model is introduced, since AC7 states the
    account-identity reference mechanism for future logging features is explicitly out of scope
    for this story.
  - |
    The "Sign in" links on the signup/duplicate-email screens (prototype lines 479, 574) are
    rendered as static, non-functional markup since login is a separate story in the parent
    epic; wiring them up is out of scope here.

package_dependencies:
  - name: fastapi
    version: ^0.111.0
    ecosystem: pip
    rationale: Web framework for the signup/me API endpoints, per reviewer direction to use FastAPI.
  - name: uvicorn
    version: ^0.30.1
    ecosystem: pip
    rationale: ASGI server to run the FastAPI app on ARC_DEV_PORT.
  - name: sqlalchemy
    version: ^2.0.30
    ecosystem: pip
    rationale: ORM/engine layer over MySQL for the accounts and sessions tables, per reviewer request for a DB-backed store.
  - name: pymysql
    version: ^1.1.1
    ecosystem: pip
    rationale: Pure-Python MySQL driver used by the SQLAlchemy engine (mysql+pymysql://), avoiding a native-build dependency like mysqlclient.
  - name: passlib
    version: ^1.7.4
    ecosystem: pip
    rationale: Password hashing (bcrypt scheme) for account creation, avoiding storing plaintext passwords.
  - name: bcrypt
    version: ^4.1.3
    ecosystem: pip
    rationale: Backing hash implementation used by passlib's bcrypt scheme.
  - name: pytest
    version: ^8.2.2
    ecosystem: pip
    rationale: Test runner for the API test-first suite (AC1-AC6, AC7 file check, DB constraint test).
  - name: httpx
    version: ^0.27.0
    ecosystem: pip
    rationale: Required by fastapi.testclient.TestClient for making in-process requests in tests.
  - name: vitest
    version: ^2.0.5
    ecosystem: npm
    rationale: Test runner for the frontend signup.js/dashboard.js logic, using its jsdom environment.

notes: |
  The repository has no application code today — only the design system assets and the
  approved prototype. The diagram below shows only nodes this plan actually touches or that
  already exist and were read (`design-system/tokens.css`, `.arc/config/design.yaml`); no other
  subsystem is invented. Revised twice: first from an earlier Node/Express draft to FastAPI, and
  now from an in-memory store to a MySQL-backed store (SQLAlchemy + PyMySQL, with a
  `docker-compose.yml` MySQL service since no database exists in this environment). The frontend
  stays plain HTML/JS throughout, so it is unaffected beyond the `fetch` calls already targeting
  `/api/signup` and `/api/me` as plain JSON endpoints.

  ```mermaid
  flowchart TD
    tokens[design-system/tokens.css]
    designcfg[.arc/config/design.yaml]
    signupHtml[web/public/signup.html]
    signupJs[web/public/signup.js]
    dashboardHtml[web/public/dashboard.html]
    dashboardJs[web/public/dashboard.js]
    authRoute[api/app/routes/auth.py]
    accountsStore[api/app/store/accounts.py]
    sessionsStore[api/app/store/sessions.py]
    models[api/app/store/models.py]
    dbModule[api/app/db.py]
    appEntry[api/app/main.py]
    mysql[(MySQL: docker-compose.yml)]

    tokens --> signupHtml
    designcfg -. declares .-> tokens
    signupHtml --> signupJs
    signupJs -->|"POST /api/signup"| authRoute
    dashboardJs -->|"GET /api/me"| authRoute
    authRoute --> accountsStore
    authRoute --> sessionsStore
    accountsStore --> models
    sessionsStore --> models
    models --> dbModule
    dbModule -->|"SQLAlchemy engine, mysql+pymysql"| mysql
    appEntry --> authRoute
    appEntry -->|"create_all() on startup"| dbModule
    signupJs -->|on success, navigate| dashboardHtml
    dashboardHtml --> dashboardJs

    classDef touched fill:#f96,color:#000
    class signupHtml,signupJs,dashboardHtml,dashboardJs,authRoute,accountsStore,sessionsStore,models,dbModule,appEntry,mysql touched
  ```

  This plan builds the already-approved design; no new UI design work is included. The ADR
  stub content is transcribed verbatim in spirit from the prototype's "Architecture Note (ADR
  Stub)" screen, per AC7, without linking to any specific future work item.
