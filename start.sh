#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

bash scripts/fix-workspace.sh

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

chmod +x "$SCRIPT_DIR/node_modules/@esbuild/linux-x64/bin/esbuild" 2>/dev/null || true

NODE_TS="node $SCRIPT_DIR/node_modules/.bin/tsc"
VITE_BIN="$SCRIPT_DIR/node_modules/vite/bin/vite.js"

echo "=== Building packages ==="
for p in packages/types packages/shared packages/database packages/ai packages/tools packages/agent; do
  rm -rf "$SCRIPT_DIR/$p/dist" "$SCRIPT_DIR/$p/tsconfig.tsbuildinfo"
  ($NODE_TS -p "$SCRIPT_DIR/$p/tsconfig.json") && echo "  ok $p"
done

echo "=== Building server ==="
rm -rf "$SCRIPT_DIR/apps/server/dist" "$SCRIPT_DIR/apps/server/tsconfig.tsbuildinfo"
($NODE_TS -p "$SCRIPT_DIR/apps/server/tsconfig.json")

echo "=== Building web UI ==="
(cd apps/web && node "$VITE_BIN" build)

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
