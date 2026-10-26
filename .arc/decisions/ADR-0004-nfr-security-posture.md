---
id: ADR-0004
category: nfr
title: 'NFR: security_posture'
status: accepted
superseded_by: null
dimension: security_posture
metric: ''
threshold: ''
component_id: null
needs_dedicated_tracking: false
evidence: 'Stories FTP-STORY-001/002/003/004/007-010/014/016/017 are tagged nfr: security.
  Examples: passwords never reveal whether an email exists (FTP-STORY-002), unauthenticated
  requests are rejected (FTP-STORY-007), ownership checks return 403 for other users''
  entries (FTP-STORY-009/010).'
---

## Context

Stories FTP-STORY-001/002/003/004/007-010/014/016/017 are tagged nfr: security. Examples: passwords never reveal whether an email exists (FTP-STORY-002), unauthenticated requests are rejected (FTP-STORY-007), ownership checks return 403 for other users' entries (FTP-STORY-009/010).

## Decision

Qualitative — no checkable threshold yet.
