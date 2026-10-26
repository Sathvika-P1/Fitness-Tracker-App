---
id: ADR-0011
category: cross_cutting
title: 'Cross-cutting: auth'
status: accepted
superseded_by: null
component_id: null
decision: Email and password signup (no email verification) and login. Server-side
  sessions created via sessions.create_session, with multiple concurrent independent
  sessions per user. Sessions persist across browser restarts until logout. Logout
  ends only the current session. Login failures return a generic 'invalid email or
  password' error. Every data endpoint requires an authenticated session and enforces
  ownership.
evidence: FTP-STORY-001, FTP-STORY-002 (api/app/store/sessions.py), FTP-STORY-007,
  FTP-STORY-009, FTP-STORY-010.
---

## Context

FTP-STORY-001, FTP-STORY-002 (api/app/store/sessions.py), FTP-STORY-007, FTP-STORY-009, FTP-STORY-010.

## Decision

Email and password signup (no email verification) and login. Server-side sessions created via sessions.create_session, with multiple concurrent independent sessions per user. Sessions persist across browser restarts until logout. Logout ends only the current session. Login failures return a generic 'invalid email or password' error. Every data endpoint requires an authenticated session and enforces ownership.
