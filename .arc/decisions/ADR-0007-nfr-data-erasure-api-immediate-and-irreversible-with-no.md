---
id: ADR-0007
category: nfr
title: "NFR: data_erasure (API) \u2014 immediate and irreversible, with no grace period"
status: accepted
superseded_by: null
dimension: data_erasure
metric: account_data_erasure_delay
threshold: immediate and irreversible, with no grace period
component_id: comp_api
needs_dedicated_tracking: true
evidence: 'FTP-STORY-004: account credentials, profile, sessions and user-generated
  content are erased immediately, and all sessions across devices are invalidated,
  with only a minimal non-identifying audit entry retained. Threshold proposed from
  that wording.'
---

## Context

FTP-STORY-004: account credentials, profile, sessions and user-generated content are erased immediately, and all sessions across devices are invalidated, with only a minimal non-identifying audit entry retained. Threshold proposed from that wording.

## Decision

account_data_erasure_delay: immediate and irreversible, with no grace period

Applies to API.
