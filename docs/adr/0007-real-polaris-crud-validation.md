# ADR 0007: Real Apache Polaris CRUD Validation

## Status

Accepted.

## Context

Unit tests prove the proxy forwards headers and payloads, but they do not prove that generated operation metadata works against a real Polaris server. A console for Polaris must be validated against real Polaris behavior, including authorization failures from Polaris itself.

## Decision

Use the official Apache Polaris Docker quickstart stack for manual integration validation. The validation connects through the Polaris Console backend using OAuth2 client credentials and executes generated operations against the real Polaris APIs.

The tested baseline includes:

- Catalog list/create/read/update/delete
- Catalog role create/read/update/list/delete
- Principal create/read/update/list/delete
- Iceberg namespace create/read/list/delete
- Iceberg table create/load/list/delete

## Observed Behavior

Catalog creation must use a non-overlapping storage location. Polaris correctly rejects creating a second catalog over the quickstart `s3://bucket123` location.

Iceberg table drop without purge succeeds. Table drop with `purgeRequested=true` was correctly rejected by Polaris with `403 Forbidden` because the quickstart root principal did not have `DROP_TABLE_WITH_PURGE`.

## Consequences

- The console proxy is proven to execute real Polaris CRUD paths, not only mocked HTTP calls.
- Authorization failures are surfaced faithfully from Polaris to the UI response panel.
- Future integration tests should keep “Polaris denied this” separate from “Console failed to proxy this.”
