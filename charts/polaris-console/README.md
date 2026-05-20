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
- Stores the backend session secret in a Kubernetes Secret.
- Enables `POLARIS_CONSOLE_COOKIE_SECURE=true` by default.
- Enables NetworkPolicy by default.

## Production Values

Set at least:

```yaml
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

Use `session.existingSecret` for externally managed secrets.

## Local Development

```bash
helm template polaris-console charts/polaris-console -f charts/polaris-console/values-dev.yaml
```
