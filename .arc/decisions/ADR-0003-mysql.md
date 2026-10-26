---
id: ADR-0003
category: component
title: MySQL
status: accepted
superseded_by: null
component_id: comp_mysql
responsibility: Relational store for accounts, credentials, sessions, profiles, workout,
  meal and weight entries, targets, and the anonymized deletion audit log; runs on
  MySQL 8 from the project's docker-compose.yml.
kind: infrastructure
serves:
- FTP-EPIC-001
- FTP-EPIC-002
- FTP-EPIC-003
- FTP-EPIC-004
split_reason: exists in the code; a backing service the project runs itself and does
  not build
evidence: 'Codebase scan: docker-compose.yml runs MySQL (mysql:8).'
---

## Context

Codebase scan: docker-compose.yml runs MySQL (mysql:8).

Serves: FTP-EPIC-001, FTP-EPIC-002, FTP-EPIC-003, FTP-EPIC-004.

## Decision

Relational store for accounts, credentials, sessions, profiles, workout, meal and weight entries, targets, and the anonymized deletion audit log; runs on MySQL 8 from the project's docker-compose.yml.

Kept separate because exists in the code; a backing service the project runs itself and does not build.
