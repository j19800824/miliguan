#!/usr/bin/env bash
# Boot admin in dev, wait for it to be ready, then run Maestro real-backend flows.
# Re-runnable: tears down its child processes on exit.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../../.." && pwd)"
ADMIN_PORT="${ADMIN_PORT:-3000}"
API_BASE="http://localhost:${ADMIN_PORT}"

cleanup() {
  if [[ -n "${ADMIN_PID:-}" ]] && kill -0 "$ADMIN_PID" 2>/dev/null; then
    echo "[e2e] stopping admin (pid $ADMIN_PID)"
    kill "$ADMIN_PID" 2>/dev/null || true
    wait "$ADMIN_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "[e2e] booting admin on :$ADMIN_PORT"
(cd "$ROOT_DIR/apps/admin" && pnpm dev --port "$ADMIN_PORT") &
ADMIN_PID=$!

echo "[e2e] waiting for admin to come up"
for i in $(seq 1 60); do
  if curl -fsS "$API_BASE" >/dev/null 2>&1; then
    echo "[e2e] admin ready after ${i}s"
    break
  fi
  if ! kill -0 "$ADMIN_PID" 2>/dev/null; then
    echo "[e2e] admin process died" >&2
    exit 1
  fi
  sleep 1
done

if ! curl -fsS "$API_BASE" >/dev/null 2>&1; then
  echo "[e2e] admin failed to come up within 60s" >&2
  exit 1
fi

# Smoke-test the mobile auth endpoint with seeded credentials.
echo "[e2e] smoke-test /api/mobile/auth/sign-in"
LOGIN_OUT=$(curl -fsS -X POST "$API_BASE/api/mobile/auth/sign-in" \
  -H "Content-Type: application/json" \
  -d '{"account":"boss","password":"boss123"}' || true)
if [[ -z "$LOGIN_OUT" ]]; then
  echo "[e2e] login smoke-test failed" >&2
  exit 1
fi
echo "[e2e] login OK"

# Caller must set EXPO_PUBLIC_API_BASE_URL + run Expo Go before maestro test.
if [[ "${RUN_MAESTRO:-0}" == "1" ]]; then
  cd "$ROOT_DIR/apps/mobile"
  export PATH="$PATH:$HOME/.maestro/bin"
  echo "[e2e] running real-backend flow"
  maestro test .maestro/flows/real-login.yaml
fi

echo "[e2e] done"
