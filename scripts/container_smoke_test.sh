#!/usr/bin/env bash
set -euo pipefail

image="${1:-polaris-console:test}"
name="polaris-console-smoke-$$"
port="${POLARIS_CONSOLE_SMOKE_PORT:-18080}"

cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker run -d --name "$name" -p "127.0.0.1:${port}:8000" \
  -e POLARIS_CONSOLE_SESSION_SECRET=local-test-secret-at-least-32-bytes-long \
  -e POLARIS_CONSOLE_ALLOWED_TARGET_HOSTS=localhost,127.0.0.1 \
  -e POLARIS_CONSOLE_COOKIE_SECURE=false \
  "$image" >/dev/null

for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS "http://127.0.0.1:${port}/api/health" | grep -q '"status":"ok"'
docker exec "$name" id | grep -q "uid=10001"

printf 'Container smoke test passed for %s.\n' "$image"
