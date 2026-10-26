---
id: ADR-0010
category: deployment_target
title: "Deployment target: Local docker compose only: MySQL 8 runs from the repo's\
  \ docker-compose.yml, API\u2026"
status: accepted
superseded_by: null
component_id: null
decision: 'Local docker compose only: MySQL 8 runs from the repo''s docker-compose.yml,
  API and Web run as plain local services. No cloud provider, production hosting model
  or region topology is mandated yet.'
evidence: 'Human: "No hosting constraint yet; local docker compose only"; docker-compose.yml.'
---

## Context

Human: "No hosting constraint yet; local docker compose only"; docker-compose.yml.

## Decision

Local docker compose only: MySQL 8 runs from the repo's docker-compose.yml, API and Web run as plain local services. No cloud provider, production hosting model or region topology is mandated yet.
