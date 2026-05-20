#!/usr/bin/env bash
set -euo pipefail

chart_dir="charts/polaris-console"
secure_values="$chart_dir/ci/values-secure.yaml"
render_dir=".helm-rendered"
package_dir=".helm-packages"

if ! command -v helm >/dev/null 2>&1; then
  printf 'helm is required for chart checks.\n' >&2
  exit 1
fi

rm -rf "$render_dir" "$package_dir"
mkdir -p "$render_dir" "$package_dir"

if helm template polaris-console "$chart_dir" >"$render_dir/default.yaml" 2>"$render_dir/default.err"; then
  printf 'Default Helm render unexpectedly succeeded without allowed target hosts.\n' >&2
  exit 1
fi
grep -q "allowedTargetHosts" "$render_dir/default.err"

if helm template polaris-console-invalid-aws "$chart_dir" \
  --set cloud.provider=aws \
  --set 'config.allowedTargetHosts={polaris.example.com}' \
  >"$render_dir/invalid-aws.yaml" 2>"$render_dir/invalid-aws.err"; then
  printf 'AWS cloud identity render unexpectedly succeeded without IRSA or Pod Identity.\n' >&2
  exit 1
fi
grep -q "cloud.provider=aws" "$render_dir/invalid-aws.err"

if helm template polaris-console-invalid-azure "$chart_dir" \
  --set cloud.provider=azure \
  --set cloud.azure.workloadIdentity.enabled=true \
  --set 'config.allowedTargetHosts={polaris.example.com}' \
  >"$render_dir/invalid-azure.yaml" 2>"$render_dir/invalid-azure.err"; then
  printf 'Azure Workload Identity render unexpectedly succeeded without clientId.\n' >&2
  exit 1
fi
grep -q "clientId" "$render_dir/invalid-azure.err"

helm lint "$chart_dir" -f "$secure_values"
helm template polaris-console "$chart_dir" \
  --namespace polaris-console \
  -f "$secure_values" \
  >"$render_dir/secure.yaml"

helm template polaris-console-dev "$chart_dir" \
  --namespace polaris-console \
  -f "$chart_dir/values-dev.yaml" \
  >"$render_dir/dev.yaml"

helm template polaris-console-aws "$chart_dir" \
  --namespace polaris-console \
  -f "$chart_dir/examples/values-aws-irsa.yaml" \
  >"$render_dir/aws-irsa.yaml"

helm template polaris-console-aws-pod-identity "$chart_dir" \
  --namespace polaris-console \
  -f "$chart_dir/examples/values-aws-pod-identity.yaml" \
  >"$render_dir/aws-pod-identity.yaml"

helm template polaris-console-azure "$chart_dir" \
  --namespace polaris-console \
  -f "$chart_dir/examples/values-azure-workload-identity.yaml" \
  >"$render_dir/azure-workload-identity.yaml"

helm template polaris-console-gcp "$chart_dir" \
  --namespace polaris-console \
  -f "$chart_dir/examples/values-gcp-workload-identity.yaml" \
  >"$render_dir/gcp-workload-identity.yaml"

grep -q "runAsNonRoot: true" "$render_dir/secure.yaml"
grep -q "allowPrivilegeEscalation: false" "$render_dir/secure.yaml"
grep -q "readOnlyRootFilesystem: true" "$render_dir/secure.yaml"
grep -q "POLARIS_CONSOLE_COOKIE_SECURE" "$render_dir/secure.yaml"
grep -q 'value: "true"' "$render_dir/secure.yaml"
grep -q "POLARIS_CONSOLE_ALLOWED_TARGET_HOSTS" "$render_dir/secure.yaml"
grep -q "polaris.example.com,login.microsoftonline.com" "$render_dir/secure.yaml"
grep -q "kind: NetworkPolicy" "$render_dir/secure.yaml"
grep -q "eks.amazonaws.com/role-arn" "$render_dir/aws-irsa.yaml"
grep -q "arn:aws:iam::123456789012:role/polaris-console-prod" "$render_dir/aws-irsa.yaml"
grep -q "azure.workload.identity/client-id" "$render_dir/azure-workload-identity.yaml"
grep -q "azure.workload.identity/use" "$render_dir/azure-workload-identity.yaml"
grep -q "iam.gke.io/gcp-service-account" "$render_dir/gcp-workload-identity.yaml"
grep -q "polaris-console-prod@my-project.iam.gserviceaccount.com" "$render_dir/gcp-workload-identity.yaml"
test -f charts/artifacthub-repo.yml
test -f "$chart_dir/values.schema.json"
test -f "$chart_dir/README.md"

helm package "$chart_dir" --destination "$package_dir"
helm repo index "$package_dir" --url "https://raw.githubusercontent.com/tsukubatexas/polaris-console/gh-pages/charts"

printf 'Helm chart checks passed.\n'
