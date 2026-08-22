#!/bin/bash
# Build all packages, server, and web.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash scripts/build-packages.sh
echo "Building server"
(cd "$ROOT/apps/server" && node "$ROOT/apps/server/node_modules/.bin/tsc" -p tsconfig.json)
echo "Building web"
(cd "$ROOT/apps/web" && node "$ROOT/apps/web/node_modules/.bin/vite" build)
echo "Build complete."
