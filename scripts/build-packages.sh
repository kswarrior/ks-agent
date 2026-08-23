#!/bin/bash
# Build shared packages in dependency order.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
bash scripts/fix-workspace.sh
for p in packages/types packages/shared packages/database packages/ai packages/tools packages/agent; do
  echo "Building $p"
  rm -rf "$ROOT/$p/dist" "$ROOT/$p/tsconfig.tsbuildinfo"
  node "$ROOT/node_modules/.bin/tsc" -p "$ROOT/$p/tsconfig.json"
done
echo "All packages built."
