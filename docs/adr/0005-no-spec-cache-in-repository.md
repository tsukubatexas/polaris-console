# ADR 0005: Do Not Commit Downloaded Spec Cache

## Status

Accepted.

## Context

The agentic workflows download Apache Polaris OpenAPI specs before generating the operation registry. During the first real workflow test, the update PR included the downloaded `specs/` cache plus small generated timestamp changes.

Committing raw spec caches makes PRs noisy and makes it harder to review the actual product change.

## Decision

`specs/` is ignored by Git. The repository commits only the generated backend and frontend operation registries that the product actually uses.

The generator preserves `generated_at` when the Polaris release, source URL, and operation list are unchanged. This prevents timestamp-only PRs.

## Consequences

- Scheduled PRs become meaningful: they should appear only when upstream API metadata or repo code changes.
- Reviewers do not need to inspect thousands of cached upstream YAML lines.
- The source URL in generated metadata remains the audit trail back to Apache Polaris.
- If exact upstream specs are needed for investigation, the workflow can re-fetch them from the referenced upstream tag.
