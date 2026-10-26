---
id: ADR-0001
category: component
title: API
status: accepted
superseded_by: null
component_id: comp_api
responsibility: FastAPI service owning authentication and sessions (signup, login,
  logout, multiple concurrent sessions), profile, account deletion, and the account-scoped
  CRUD, validation and ownership checks for workouts, meals, weight entries and targets.
  It also serves the combined history read across the three logs and the progress
  summary.
kind: api_service
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
split_reason: exists in the code
talks_to:
- component_id: comp_mysql
  interaction: sync
  evidence: 'Codebase scan (api, mysql in docker-compose.yml) and FTP-STORY-002/010
    (session and workout stores): the API reads and writes account-scoped records
    in the database per request.'
evidence: 'Codebase scan: api, has its own manifest, uses FastAPI. FTP-STORY-002 cites
  api/app/routes/auth.py and api/app/store/sessions.py; FTP-STORY-010 cites api/app/store/workouts.py.'
---

## Context

Codebase scan: api, has its own manifest, uses FastAPI. FTP-STORY-002 cites api/app/routes/auth.py and api/app/store/sessions.py; FTP-STORY-010 cites api/app/store/workouts.py.

Serves: FTP-EPIC-001, FTP-EPIC-002, FTP-EPIC-003, FTP-EPIC-004, FTP-STORY-001, FTP-STORY-002, FTP-STORY-003, FTP-STORY-004, FTP-STORY-007, FTP-STORY-008, FTP-STORY-009, FTP-STORY-010, FTP-STORY-014, FTP-STORY-016, FTP-STORY-017, FTP-STORY-019, FTP-STORY-020, FTP-STORY-021.

## Decision

FastAPI service owning authentication and sessions (signup, login, logout, multiple concurrent sessions), profile, account deletion, and the account-scoped CRUD, validation and ownership checks for workouts, meals, weight entries and targets. It also serves the combined history read across the three logs and the progress summary.

Kept separate because exists in the code.

## Talks to

- **MySQL** (sync) — Codebase scan (api, mysql in docker-compose.yml) and FTP-STORY-002/010 (session and workout stores): the API reads and writes account-scoped records in the database per request.
