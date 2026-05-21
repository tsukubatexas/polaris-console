# Polaris Console Helm Chart

Deploys Polaris Console, a React and FastAPI console for Apache Polaris.

## Install

```bash
helm repo add polaris-console https://raw.githubusercontent.com/tsukubatexas/polaris-console/gh-pages/charts
helm repo update
helm upgrade --install polaris-console polaris-console/polaris-console \
  --namespace polaris-console \
  --create-namespace \
  --set config.allowedTargetHosts="{polaris.example.com,login.microsoftonline.com}" \
  --set config.allowedOrigins="{https://polaris-console.example.com}"
```

The chart deliberately fails to render unless `config.allowedTargetHosts` is set, or `config.allowAnyTargetHost=true` is explicitly enabled for local development.

## Security Defaults

- Runs as non-root UID/GID `10001`.
- Drops all Linux capabilities.
- Disables privilege escalation.
- Uses a read-only root filesystem.
- Uses `RuntimeDefault` seccomp.
- Supports immutable image digest pinning through `image.digest`.
- Reuses externally managed session secrets through `session.existingSecret`.
- Enables `POLARIS_CONSOLE_COOKIE_SECURE=true` by default.
- Enables NetworkPolicy by default.
- Can create a namespace labelled for Kubernetes Pod Security Admission `restricted`.
- Validates the secure profile so production renders fail if image digest, TLS, external secret, restricted pod settings, or network policy are missing.

## Cloud AuthN/AuthZ

Polaris Console does not ship static cloud credentials. In production, bind the pod's Kubernetes ServiceAccount to a cloud identity and grant that cloud identity only the IAM/RBAC permissions it needs.

Supported modes:

- AWS EKS IRSA: renders `eks.amazonaws.com/role-arn` and optional STS annotations.
- AWS EKS Pod Identity: keeps the Kubernetes ServiceAccount stable; create the Pod Identity association outside Helm.
- Azure AKS Workload Identity: renders `azure.workload.identity/client-id`, optional tenant/token annotations, and the required pod label `azure.workload.identity/use: "true"`.
- Google GKE Workload Identity Federation: supports direct Kubernetes ServiceAccount principals and IAM service account impersonation through `iam.gke.io/gcp-service-account`.
- Kubernetes RBAC: disabled by default because the console does not need Kubernetes API permissions. Enable `rbac.create` only with explicit least-privilege rules.

Examples:

```bash
helm template polaris-console charts/polaris-console -f charts/polaris-console/examples/values-aws-irsa.yaml
helm template polaris-console charts/polaris-console -f charts/polaris-console/examples/values-aws-pod-identity.yaml
helm template polaris-console charts/polaris-console -f charts/polaris-console/examples/values-azure-workload-identity.yaml
helm template polaris-console charts/polaris-console -f charts/polaris-console/examples/values-gcp-workload-identity.yaml
```

References:

- AWS IRSA: https://docs.aws.amazon.com/eks/latest/userguide/associate-service-account-role.html
- AWS EKS Pod Identity: https://docs.aws.amazon.com/eks/latest/userguide/pod-id-association.html
- Azure Workload Identity: https://learn.microsoft.com/en-us/azure/aks/workload-identity-overview
- GKE Workload Identity Federation: https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity

## Production Values

Set at least:

```yaml
image:
  digest: sha256:...
namespace:
  create: true
session:
  existingSecret: polaris-console-session
security:
  requireImageDigest: true
  requireExternalSessionSecret: true
  requireIngressTls: true
config:
  allowedOrigins:
    - https://polaris-console.example.com
  allowedTargetHosts:
    - polaris.example.com
    - login.microsoftonline.com
networkPolicy:
  egress:
    extraRules:
      - to:
          - ipBlock:
              cidr: 10.0.0.0/8
        ports:
          - protocol: TCP
            port: 8181
          - protocol: TCP
            port: 443
```

Create `polaris-console-session` with Azure Key Vault CSI, External Secrets, Sealed Secrets, or your platform secret flow before installing the secure profile. The chart references that Secret but does not own its lifecycle.

On AKS with the standard `azure` network policy engine, Kubernetes NetworkPolicy cannot allow egress by FQDN. For OAuth2 client credentials mode, send outbound HTTPS through an enterprise firewall or HTTP proxy and allow only that proxy destination. If no controlled egress path exists, use bearer mode with a token obtained outside the pod so the console pod only needs internal Polaris and DNS egress.

Run the same security render used in CI:

```bash
helm template polaris-console charts/polaris-console \
  --namespace polaris-console \
  -f charts/polaris-console/ci/values-secure.yaml \
  > .helm-rendered/secure.yaml
scripts/security_manifest_checks.sh .helm-rendered/secure.yaml
```

## Local Development

```bash
helm template polaris-console charts/polaris-console -f charts/polaris-console/values-dev.yaml
```
