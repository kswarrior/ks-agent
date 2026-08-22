#!/bin/bash
# Run the production server (assumes the project has been built).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash scripts/fix-workspace.sh
cd "$ROOT/apps/server/dist"
exec node index.js
