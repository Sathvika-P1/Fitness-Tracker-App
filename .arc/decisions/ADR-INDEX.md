# ADR Index

One line per decision — the rule, not the reasoning. Read the full ADR (`.arc/decisions/ADR-NNNN-*.md`) for context and rationale.

| ADR | Category | Status | Title |
|---|---|---|---|
| ADR-0001 | component | accepted | API |
| ADR-0002 | component | accepted | Web |
| ADR-0003 | component | accepted | MySQL |
| ADR-0004 | nfr | accepted | NFR: security_posture |
| ADR-0005 | nfr | accepted | NFR: data_isolation (API) — none: every read and write is scoped to the authenticated account |
| ADR-0006 | nfr | accepted | NFR: privacy |
| ADR-0007 | nfr | accepted | NFR: data_erasure (API) — immediate and irreversible, with no grace period |
| ADR-0008 | nfr | accepted | NFR: scale — single user (the owner); no load target |
| ADR-0009 | nfr | accepted | NFR: availability — none; no uptime, backup or recovery requirement |
| ADR-0010 | deployment_target | accepted | Deployment target: Local docker compose only: MySQL 8 runs from the repo's docker-compose.yml, API… |
| ADR-0011 | cross_cutting | accepted | Cross-cutting: auth |
| ADR-0012 | cross_cutting | accepted | Cross-cutting: data privacy and account deletion |
| ADR-0013 | cross_cutting | accepted | Cross-cutting: validation and error handling |
| ADR-0014 | cross_cutting | accepted | Cross-cutting: brute-force protection |
| ADR-0015 | cross_cutting | accepted | Cross-cutting: meal data model |
| ADR-0016 | cross_cutting | accepted | Cross-cutting: compliance and data residency |
