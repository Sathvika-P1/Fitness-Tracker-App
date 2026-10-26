---
id: ADR-0014
category: cross_cutting
title: 'Cross-cutting: brute-force protection'
status: accepted
superseded_by: null
component_id: null
decision: 'Login has no lockout or rate limit (FTP-STORY-002 says so explicitly).
  The only lockout in code is for account-deletion password attempts: 5 failures in
  a 15-minute window, stored in MySQL (deletion_lockout_failures).'
evidence: api/app/store/deletion_lockout.py (MAX_ATTEMPTS=5, LOCKOUT_WINDOW=15 min);
  FTP-STORY-002 criterion on consecutive failures; FTP-STORY-004 refers to its own
  lockout.
---

## Context

api/app/store/deletion_lockout.py (MAX_ATTEMPTS=5, LOCKOUT_WINDOW=15 min); FTP-STORY-002 criterion on consecutive failures; FTP-STORY-004 refers to its own lockout.

## Decision

Login has no lockout or rate limit (FTP-STORY-002 says so explicitly). The only lockout in code is for account-deletion password attempts: 5 failures in a 15-minute window, stored in MySQL (deletion_lockout_failures).
