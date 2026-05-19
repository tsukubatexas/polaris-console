# ADR 0001: FastAPI + React + Generated OpenAPI Registry

## Status

Accepted.

## Context

Apache Polaris exposes a broad REST surface across management, catalog, policy, OAuth, generic table, notification, and Iceberg REST APIs. A manually maintained UI would fall behind quickly.

## Decision

Use React for the console, FastAPI for the backend, and generated JSON/TypeScript registries from the Apache Polaris OpenAPI specs.

## Consequences

- The Operation Explorer can cover new Polaris operations without bespoke UI work.
- Curated screens can still be built on top of the generated registry.
- CI must verify that generated frontend and backend registries stay in sync.
