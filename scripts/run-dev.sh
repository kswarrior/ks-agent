#!/bin/bash
# Run server (express) or web (vite dev server) in dev mode.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash scripts/fix-workspace.sh

case "$1" in
  server)
    export PORT="${PORT:-8080}"
    cd "$ROOT/apps/server"
    exec node "$ROOT/node_modules/ts-node-dev/lib/bin.js" --respawn --transpile-only src/index.ts
    ;;
  web)
    cd "$ROOT/apps/web"
    exec node "$ROOT/node_modules/vite/bin/vite.js"
    ;;
  *)
    echo "Usage: $0 {server|web}"
    exit 1
    ;;
esac
