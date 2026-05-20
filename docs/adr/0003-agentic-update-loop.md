# ADR 0003: Scheduled Agentic OpenAPI Update Loop

## Status

Accepted.

## Context

Polaris releases can add, rename, or reshape REST operations. The console should notice that automatically and keep its generated registry current.

## Decision

Run a weekly workflow that fetches the latest Polaris specs, regenerates operation metadata, runs tests and builds, and opens a PR when files changed. If checks fail and `OPENAI_API_KEY` is set, the workflow asks OpenAI for a small repair patch and retries.

## Consequences

- API drift is visible as a PR.
- Generated UI coverage stays close to upstream Polaris.
- The repair loop is bounded by `AGENT_MAX_ROUNDS` and still has to pass CI.
- The loop must stay deterministic for unchanged upstream specs. Timestamp-only changes are not acceptable because they create noisy PRs.
