# ADR 0004: Unique Generated Operation IDs

## Status

Accepted.

## Context

Apache Polaris can publish the same `operationId` in more than one OpenAPI document. In Apache Polaris 1.5.0, Catalog and Iceberg REST specs share several operation IDs such as namespace and table operations.

The backend executes operations by generated `operationId`. Duplicate IDs would make one operation overwrite another in the backend lookup map, causing the UI to show broad coverage while the proxy can only execute one of the duplicated operations.

## Decision

The generator keeps upstream operation IDs when they are globally unique. If an ID appears more than once across loaded Polaris specs, the generated ID is prefixed with the service name, for example `iceberg_createNamespace` and `catalog_createNamespace`.

`scripts/check_generated_current.py` fails if duplicate operation IDs are generated.

## Consequences

- Backend operation execution is unambiguous.
- The UI can expose both Catalog and Iceberg variants.
- Some generated operation IDs differ from raw upstream OpenAPI IDs, but only when needed to preserve correctness.
- ADR and test coverage make this generator behavior auditable.
