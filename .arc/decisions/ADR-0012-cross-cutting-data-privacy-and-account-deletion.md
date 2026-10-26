---
id: ADR-0012
category: cross_cutting
title: 'Cross-cutting: data privacy and account deletion'
status: accepted
superseded_by: null
component_id: null
decision: All records carry an account reference and are queried only by the authenticated
  account. Account deletion, after password re-entry, hard-deletes credentials, profile,
  sessions and all user-generated logs, is idempotent, and keeps only an anonymized
  audit entry (anonymized account reference and timestamp).
evidence: FTP-EPIC-001 acceptance criteria; FTP-STORY-004; FTP-STORY-019/020/021 (privacy).
---

## Context

FTP-EPIC-001 acceptance criteria; FTP-STORY-004; FTP-STORY-019/020/021 (privacy).

## Decision

All records carry an account reference and are queried only by the authenticated account. Account deletion, after password re-entry, hard-deletes credentials, profile, sessions and all user-generated logs, is idempotent, and keeps only an anonymized audit entry (anonymized account reference and timestamp).
