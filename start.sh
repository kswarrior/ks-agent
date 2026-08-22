#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

ensure_bin() {
  mkdir -p node_modules/.bin
  # Link workspace binaries (hoisted but no .bin by default)
  for pair in "typescript:node_modules/typescript/bin/tsc" \
              "ts-node-dev:node_modules/ts-node-dev/lib/bin.js" \
              "vite:node_modules/vite/bin/vite.js" \
              "concurrently:node_modules/concurrently/index.js"; do
    name="${pair%%:*}"
    target="${pair##*:}"
    ln -sf "$SCRIPT_DIR/$target" "$SCRIPT_DIR/node_modules/.bin/$name" 2>/dev/null || true
  done
}
ensure_bin

NODE_TS="node node_modules/.bin/tsc"

echo "=== Building packages ==="
for p in packages/types packages/shared packages/database packages/ai packages/tools packages/agent; do
  (cd "$p" && $NODE_TS -b tsconfig.json) && echo "  ok $p"
done

echo "=== Building server ==="
(cd apps/server && $NODE_TS -p tsconfig.json)

echo "=== Building web UI ==="
(cd apps/web && node node_modules/vite/bin/vite.js build)

echo "=== Starting server ==="
export PORT="${PORT:-8080}"
(cd apps/server/dist && node index.js) &
SERVER_PID=$!

echo "Server PID: $SERVER_PID  (cold start takes ~25-30s)"

# Wait up to 60s for the health endpoint
for i in $(seq 1 20); do
  if curl -sf --max-time 3 http://127.0.0.1:8080/api/health >/dev/null 2>&1; then
    echo ""
    echo "=== KS AGENT is running ==="
    echo "  UI:    http://localhost:8080"
    echo "  API:   http://localhost:8080/api"
    echo "  Health:http://localhost:8080/api/health"
    echo ""
    wait $SERVER_PID
    exit 0
  fi
  sleep 3
done

echo "FAIL: server did not respond within 60s"
kill $SERVER_PID 2>/dev/null || true
exit 1
