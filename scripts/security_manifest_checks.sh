#!/usr/bin/env bash
set -euo pipefail

manifest="${1:-.helm-rendered/secure.yaml}"

if [[ ! -f "$manifest" ]]; then
  printf 'Manifest not found: %s\n' "$manifest" >&2
  exit 1
fi

require() {
  local pattern="$1"
  local description="$2"
  if ! grep -Eq -- "$pattern" "$manifest"; then
    printf 'Missing required security control: %s\n' "$description" >&2
    exit 1
  fi
}

forbid() {
  local pattern="$1"
  local description="$2"
  if grep -Eq -- "$pattern" "$manifest"; then
    printf 'Forbidden security finding: %s\n' "$description" >&2
    exit 1
  fi
}

require '^kind: Namespace$' 'namespace manifest for Pod Security Admission labels'
require 'pod-security\.kubernetes\.io/enforce: restricted' 'restricted Pod Security enforce label'
require 'pod-security\.kubernetes\.io/audit: restricted' 'restricted Pod Security audit label'
require 'pod-security\.kubernetes\.io/warn: restricted' 'restricted Pod Security warn label'
require 'automountServiceAccountToken: false' 'disabled service account token automount'
require 'runAsNonRoot: true' 'non-root pod execution'
require 'runAsUser: 10001' 'stable non-root UID'
require 'seccompProfile:' 'seccomp profile'
require 'type: RuntimeDefault' 'RuntimeDefault seccomp'
require 'allowPrivilegeEscalation: false' 'disabled privilege escalation'
require 'readOnlyRootFilesystem: true' 'read-only root filesystem'
require 'drop:' 'capability drop list'
require '- ALL' 'all Linux capabilities dropped'
require 'image: "?ghcr\.io/tsukubatexas/polaris-console@sha256:[a-f0-9]{64}"?' 'immutable image digest'
require '^kind: NetworkPolicy$' 'network policy'
require '^kind: PodDisruptionBudget$' 'pod disruption budget'
require 'POLARIS_CONSOLE_COOKIE_SECURE' 'secure cookie configuration'
require 'name: polaris-console-session' 'externally managed session secret reference'
forbid '^kind: Secret$' 'generated Kubernetes Secret in secure profile'
forbid 'cidr: "?0\.0\.0\.0/0"?' 'open IPv4 egress'
forbid 'cidr: "?::/0"?' 'open IPv6 egress'
forbid 'allowInsecureTls.*true' 'insecure TLS'
forbid 'serviceAccountToken: true' 'enabled service account token'

printf 'Security manifest checks passed for %s.\n' "$manifest"
