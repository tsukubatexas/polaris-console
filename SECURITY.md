# Security Policy

## Supported Versions

Security fixes target the current `main` branch until the first stable release line is created.

## Reporting

Please report vulnerabilities privately through GitHub security advisories.

Do not open public issues that include tokens, OAuth client secrets, Polaris URLs for private deployments, logs with authorization headers, or screenshots of credentials.

## Design Boundaries

- The browser never receives Polaris bearer tokens, OAuth client secrets, or OAuth access tokens.
- The backend stores session material in memory by default.
- The backend forwards only the minimum headers required for Polaris calls.
- Production deployments should use HTTPS and set `POLARIS_CONSOLE_COOKIE_SECURE=true`.
- Production deployments should set `POLARIS_CONSOLE_ALLOWED_TARGET_HOSTS`.
- Helm deployments fail closed unless `config.allowedTargetHosts` is set or local development mode is explicitly enabled.
- Helm values are schema-validated and the public chart package is rendered in CI with secure values.
- The Helm chart supports cloud workload identity for AWS, Azure, and Google Cloud; static cloud access keys should not be stored in values files.
- Kubernetes RBAC is disabled by default because the console does not need Kubernetes API access.
- The published container image runs as a non-root user and the Helm chart disables privilege escalation by default.
- Container CI performs a live health-check smoke test and verifies the runtime user is UID `10001`.
- Scheduled OpenAI repair jobs must use a scoped `OPENAI_API_KEY` secret and protected branch rules.

## Secret Handling

GitHub Actions do not print OpenAI keys, OAuth secrets, or Polaris tokens. Pull requests from forks do not receive repository secrets by default.
