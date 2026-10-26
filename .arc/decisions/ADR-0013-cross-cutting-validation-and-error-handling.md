---
id: ADR-0013
category: cross_cutting
title: 'Cross-cutting: validation and error handling'
status: accepted
superseded_by: null
component_id: null
decision: Server-side validation is authoritative (non-negative values, no future
  dates, required fields, ranges). On network or server failure the UI shows a generic
  retryable error and preserves the user's entered data. Loading and empty states
  are standardized across list views.
evidence: FTP-STORY-003, FTP-STORY-007, FTP-STORY-009, FTP-STORY-014, FTP-STORY-016,
  FTP-STORY-017, FTP-STORY-019.
---

## Context

FTP-STORY-003, FTP-STORY-007, FTP-STORY-009, FTP-STORY-014, FTP-STORY-016, FTP-STORY-017, FTP-STORY-019.

## Decision

Server-side validation is authoritative (non-negative values, no future dates, required fields, ranges). On network or server failure the UI shows a generic retryable error and preserves the user's entered data. Loading and empty states are standardized across list views.
