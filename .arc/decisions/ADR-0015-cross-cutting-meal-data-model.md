---
id: ADR-0015
category: cross_cutting
title: 'Cross-cutting: meal data model'
status: accepted
superseded_by: null
component_id: null
decision: Meal entries carry an optional food name (nullable, up to 200 chars) alongside
  calories, macros and date/time.
evidence: 'api/app/store/models.py: meal_entries.food_name nullable String(200); FTP-STORY-016
  edits it.'
---

## Context

api/app/store/models.py: meal_entries.food_name nullable String(200); FTP-STORY-016 edits it.

## Decision

Meal entries carry an optional food name (nullable, up to 200 chars) alongside calories, macros and date/time.
