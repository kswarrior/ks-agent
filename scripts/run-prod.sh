#!/bin/bash
# Run the production server (assumes the project has been built).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash scripts/fix-workspace.sh
export PORT="${PORT:-8080}"
cd "$ROOT/apps/server/dist"
exec node index.js
