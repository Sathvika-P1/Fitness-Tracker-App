---
id: ADR-0005
category: nfr
title: "NFR: data_isolation (API) \u2014 none: every read and write is scoped to the\
  \ authenticated account"
status: accepted
superseded_by: null
dimension: data_isolation
metric: cross_account_data_exposure
threshold: 'none: every read and write is scoped to the authenticated account'
component_id: comp_api
needs_dedicated_tracking: true
evidence: 'FTP-EPIC-001 acceptance criteria and FTP-STORY-001/008/014/021: only the
  account''s own data is ever returned. Threshold proposed from that wording; the
  human corrects it.'
---

## Context

FTP-EPIC-001 acceptance criteria and FTP-STORY-001/008/014/021: only the account's own data is ever returned. Threshold proposed from that wording; the human corrects it.

## Decision

cross_account_data_exposure: none: every read and write is scoped to the authenticated account

Applies to API.
