---
id: ADR-0002
category: component
title: Web
status: accepted
superseded_by: null
component_id: comp_web
responsibility: Browser front end built from static HTML/JS pages (signup, login,
  dashboard, history, edit-workout, meal pages, etc.) under web/public, with no UI
  framework. Served by web/server.py, a small Python HTTP server that also reverse-proxies
  /api/* to the API so browser and API share one origin. Handles forms, inline validation,
  retry-preserving error handling and navigation.
kind: web_ui
serves:
- FTP-EPIC-001
- FTP-EPIC-002
- FTP-EPIC-003
- FTP-EPIC-004
- FTP-STORY-001
- FTP-STORY-002
- FTP-STORY-003
- FTP-STORY-004
- FTP-STORY-007
- FTP-STORY-008
- FTP-STORY-009
- FTP-STORY-010
- FTP-STORY-014
- FTP-STORY-016
- FTP-STORY-017
- FTP-STORY-019
- FTP-STORY-020
- FTP-STORY-021
split_reason: exists in the code; it is the only browser client, a different runtime
  from the API
talks_to:
- component_id: comp_api
  interaction: sync
  evidence: 'web/server.py proxies /api/* requests (GET/POST/PUT) to API_ORIGIN, so
    the browser talks to the API same-origin and the session cookie (sid) needs no
    CORS. Note: the proxy handles no DELETE method yet, though FTP-STORY-010 relies
    on DELETE.'
evidence: 'web/server.py: serves web/public and proxies /api/ to API_ORIGIN (default
  http://localhost:8001); existing evidence retained.'
---

## Context

web/server.py: serves web/public and proxies /api/ to API_ORIGIN (default http://localhost:8001); existing evidence retained.

Serves: FTP-EPIC-001, FTP-EPIC-002, FTP-EPIC-003, FTP-EPIC-004, FTP-STORY-001, FTP-STORY-002, FTP-STORY-003, FTP-STORY-004, FTP-STORY-007, FTP-STORY-008, FTP-STORY-009, FTP-STORY-010, FTP-STORY-014, FTP-STORY-016, FTP-STORY-017, FTP-STORY-019, FTP-STORY-020, FTP-STORY-021.

## Decision

Browser front end built from static HTML/JS pages (signup, login, dashboard, history, edit-workout, meal pages, etc.) under web/public, with no UI framework. Served by web/server.py, a small Python HTTP server that also reverse-proxies /api/* to the API so browser and API share one origin. Handles forms, inline validation, retry-preserving error handling and navigation.

Kept separate because exists in the code; it is the only browser client, a different runtime from the API.

## Talks to

- **API** (sync) — web/server.py proxies /api/* requests (GET/POST/PUT) to API_ORIGIN, so the browser talks to the API same-origin and the session cookie (sid) needs no CORS. Note: the proxy handles no DELETE method yet, though FTP-STORY-010 relies on DELETE.
