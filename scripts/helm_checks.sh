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

helm lint "$chart_dir" -f "$secure_values"
helm template polaris-console "$chart_dir" \
  --namespace polaris-console \
  -f "$secure_values" \
  >"$render_dir/secure.yaml"

helm template polaris-console-dev "$chart_dir" \
  --namespace polaris-console \
  -f "$chart_dir/values-dev.yaml" \
  >"$render_dir/dev.yaml"

grep -q "runAsNonRoot: true" "$render_dir/secure.yaml"
grep -q "allowPrivilegeEscalation: false" "$render_dir/secure.yaml"
grep -q "readOnlyRootFilesystem: true" "$render_dir/secure.yaml"
grep -q "POLARIS_CONSOLE_COOKIE_SECURE" "$render_dir/secure.yaml"
grep -q 'value: "true"' "$render_dir/secure.yaml"
grep -q "POLARIS_CONSOLE_ALLOWED_TARGET_HOSTS" "$render_dir/secure.yaml"
grep -q "polaris.example.com,login.microsoftonline.com" "$render_dir/secure.yaml"
grep -q "kind: NetworkPolicy" "$render_dir/secure.yaml"
test -f charts/artifacthub-repo.yml
test -f "$chart_dir/values.schema.json"
test -f "$chart_dir/README.md"

helm package "$chart_dir" --destination "$package_dir"
helm repo index "$package_dir" --url "https://raw.githubusercontent.com/tsukubatexas/polaris-console/gh-pages/charts"

printf 'Helm chart checks passed.\n'
