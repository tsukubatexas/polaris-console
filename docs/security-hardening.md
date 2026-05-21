# Security Hardening

Polaris Console is hardened to support ISO/IEC 27001 and NIST-aligned control programs, but the chart is not a certification by itself. Compliance still needs organizational controls, risk acceptance, vulnerability management, logging, incident response, access reviews, and audit evidence.

## Production Controls

- Immutable image releases: set `image.digest` and `security.requireImageDigest=true`.
- Managed secrets: set `session.existingSecret` and `security.requireExternalSessionSecret=true`; source the Secret from Key Vault CSI, External Secrets, Sealed Secrets, or an approved platform flow.
- Restricted pods: keep `runAsNonRoot`, UID/GID `10001`, `RuntimeDefault` seccomp, `readOnlyRootFilesystem`, dropped capabilities, and `allowPrivilegeEscalation=false`.
- Kubernetes API least privilege: keep `serviceAccount.automount=false` and `rbac.create=false` unless a specific least-privilege rule is required.
- Network containment: keep `networkPolicy.enabled=true`; do not allow `0.0.0.0/0` or `::/0` egress in secure profiles.
- TLS and SSRF guardrails: keep `config.cookieSecure=true`, `config.allowInsecureTls=false`, and set exact `config.allowedTargetHosts`.
- Pod Security Admission: set `namespace.create=true` or label the namespace yourself with `pod-security.kubernetes.io/enforce=restricted`.
- Supply-chain evidence: the container workflow publishes BuildKit SBOM and provenance attestations, and CI renders the secure Helm profile.

## OAuth Without Open Pod Egress

Kubernetes NetworkPolicy cannot express FQDN allowlists on standard AKS `azure` network policy. If the cluster does not provide Cilium FQDN policy, an egress firewall, or an HTTP proxy, keep the pod closed and use bearer mode with a token obtained outside the pod by a trusted token broker or workstation.

For fully server-side OAuth2 client credentials mode, route outbound HTTPS through an approved enterprise egress path and allow only that proxy or firewall destination from the namespace. Do not reintroduce `0.0.0.0/0` pod egress in the secure profile.

## Evidence Commands

```bash
scripts/helm_checks.sh
helm template polaris-console charts/polaris-console \
  --namespace polaris-console \
  -f charts/polaris-console/ci/values-secure.yaml \
  > .helm-rendered/secure.yaml
scripts/security_manifest_checks.sh .helm-rendered/secure.yaml
```

The checks prove that the secure profile uses an immutable digest, an externally managed session Secret, restricted pod settings, Pod Security labels, NetworkPolicy, TLS-required ingress, secure cookies, and no open internet egress.

## Remaining Platform Requirements

Run the chart in a hardened cluster profile: private API server where possible, Azure Policy or Kyverno/Gatekeeper admission, Defender for Containers or equivalent, centralized logs, vulnerability scanning, managed ingress TLS, workload identity, firewall/proxy egress, backup/restore, and regular access reviews.
