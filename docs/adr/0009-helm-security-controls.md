# ADR 0009: Helm Security Controls

## Status

Accepted

## Context

The chart had strong pod-level defaults, but the security review found gaps that matter for enterprise operation: mutable image tags, generated Kubernetes session secrets, optional namespace-level Pod Security labels, permissive egress examples, and limited CI evidence for the hardened profile.

## Decision

We keep the chart usable for local development, but add a stricter production profile that fails closed when important controls are missing.

The chart now supports immutable image rendering through `image.digest`, production gates under `security.*`, namespace creation with `restricted` Pod Security Admission labels, externally managed session secrets through `session.existingSecret`, and explicit rejection of open `0.0.0.0/0` or `::/0` egress when `security.disallowOpenEgress=true`.

CI renders `charts/polaris-console/ci/values-secure.yaml`, runs `scripts/security_manifest_checks.sh`, checks negative cases for missing digest, generated secrets, and open egress, and packages the chart only after those checks pass. The container workflow publishes images with BuildKit SBOM and provenance attestations.

## Consequences

Production users must provide an image digest, a pre-created session Secret, TLS ingress, exact Polaris/OAuth target hosts, and explicit network egress rules.

Local development remains possible through `values-dev.yaml`, but every local relaxation is visible in values instead of being hidden in templates.

These controls support ISO/IEC 27001 and NIST-aligned evidence, but they are not a standalone certification claim. The platform still needs admission control, vulnerability management, logging, access reviews, incident response, and audit processes.
