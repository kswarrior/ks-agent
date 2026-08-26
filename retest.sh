#!/bin/bash
# Restart the KS Agent on port 8080: stop any existing instance, then start again.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

PORT="${PORT:-8080}"
LOG_FILE="$ROOT/retest.log"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"

echo "=== Retest KS Agent on port ${PORT} ==="

# --- 1. Stop anything already running on the port ---
PIDS=""
if command -v lsof >/dev/null 2>&1; then
  PIDS="$(lsof -t -i :${PORT} 2>/dev/null || true)"
elif command -v fuser >/dev/null 2>&1; then
  PIDS="$(fuser ${PORT}/tcp 2>/dev/null || true)"
else
  # Fallback: parse ss output (works without root)
  PIDS="$(ss -lptn "sport = :${PORT}" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)"
fi

if [ -n "$PIDS" ]; then
  echo "Agent already running (PID(s): $PIDS). Stopping..."
  kill $PIDS 2>/dev/null || true
  # Give it a moment to exit gracefully, then force-kill if needed
  for i in $(seq 1 10); do
    kill -0 $PIDS 2>/dev/null || break
    sleep 1
  done
  kill -9 $PIDS 2>/dev/null || true
  echo "Stopped."
else
  echo "No existing agent found on port ${PORT}."
fi

# Wait until the port is actually free
for i in $(seq 1 10); do
  if ! curl -sf --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# --- 2. Build (skip if dist already fresh via env SKIP_BUILD=1) ---
bash scripts/fix-workspace.sh

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  NODE_TS="node $ROOT/node_modules/.bin/tsc"
  echo "=== Building packages ==="
  for p in packages/types packages/shared packages/database packages/ai packages/tools packages/agent; do
    rm -rf "$ROOT/$p/dist" "$ROOT/$p/tsconfig.tsbuildinfo"
    ($NODE_TS -p "$ROOT/$p/tsconfig.json") && echo "  ok $p"
  done
  echo "=== Building server ==="
  rm -rf "$ROOT/apps/server/dist" "$ROOT/apps/server/tsconfig.tsbuildinfo"
  ($NODE_TS -p "$ROOT/apps/server/tsconfig.json")
fi

chmod +x "$ROOT/node_modules/@esbuild/linux-x64/bin/esbuild" 2>/dev/null || true

# --- 3. Start the agent again ---
echo "=== Starting server ==="
export PORT
nohup node apps/server/dist/index.js >"$LOG_FILE" 2>&1 &
SERVER_PID=$!
echo "Server PID: $SERVER_PID  (cold start takes ~25-30s)"

for i in $(seq 1 20); do
  if curl -sf --max-time 3 "$HEALTH_URL" >/dev/null 2>&1; then
    echo ""
    echo "=== KS AGENT restarted and running ==="
    echo "  PID:   $SERVER_PID"
    echo "  UI:    http://localhost:${PORT}"
    echo "  API:   http://localhost:${PORT}/api"
    echo "  Health:$HEALTH_URL"
    echo "  Logs:  $LOG_FILE"
    exit 0
  fi
  sleep 3
done

echo "FAIL: server did not respond within 60s (see $LOG_FILE)"
kill $SERVER_PID 2>/dev/null || true
exit 1
