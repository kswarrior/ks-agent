#!/bin/bash
# Run the production server (assumes the project has been built).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash scripts/fix-workspace.sh
export PORT="${PORT:-8080}"
# Stay at repo root so relative DATABASE_PATH and .env resolve correctly.
cd "$ROOT"
exec node apps/server/dist/index.js
