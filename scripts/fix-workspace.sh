#!/bin/bash
# Fix workspace symlinks so that:
# 1. Each workspace's node_modules/.bin has a tsc link.
# 2. node_modules/@ks-agent/* points to packages/* so require() works.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

mkdir -p node_modules/@ks-agent
for pkg in types shared database ai tools agent; do
  ln -sf "$ROOT/packages/$pkg" "$ROOT/node_modules/@ks-agent/$pkg"
done

for ws in packages/types packages/shared packages/database packages/ai packages/tools packages/agent apps/server apps/web; do
  mkdir -p "$ws/node_modules/.bin"
  cat > "$ws/node_modules/.bin/tsc" <<EOF
#!/usr/bin/env node
require("$ROOT/node_modules/typescript/lib/tsc.js");
EOF
  chmod +x "$ws/node_modules/.bin/tsc"
  if [ -f "$ROOT/node_modules/vite/bin/vite.js" ]; then
    cat > "$ws/node_modules/.bin/vite" <<EOF
#!/usr/bin/env node
require("$ROOT/node_modules/vite/bin/vite.js");
EOF
    chmod +x "$ws/node_modules/.bin/vite"
  fi
done

# Root .bin wrappers
mkdir -p "$ROOT/node_modules/.bin"
if [ ! -x "$ROOT/node_modules/.bin/tsc" ]; then
  cat > "$ROOT/node_modules/.bin/tsc" <<EOF
#!/usr/bin/env node
require("$ROOT/node_modules/typescript/lib/tsc.js");
EOF
  chmod +x "$ROOT/node_modules/.bin/tsc"
fi
if [ ! -x "$ROOT/node_modules/.bin/vite" ] && [ -f "$ROOT/node_modules/vite/bin/vite.js" ]; then
  cat > "$ROOT/node_modules/.bin/vite" <<EOF
#!/usr/bin/env node
require("$ROOT/node_modules/vite/bin/vite.js");
EOF
  chmod +x "$ROOT/node_modules/.bin/vite"
fi
if [ ! -x "$ROOT/node_modules/.bin/concurrently" ] && [ -f "$ROOT/node_modules/concurrently/dist/bin/concurrently.js" ]; then
  cat > "$ROOT/node_modules/.bin/concurrently" <<EOF
#!/usr/bin/env node
require("$ROOT/node_modules/concurrently/dist/bin/concurrently.js");
EOF
  chmod +x "$ROOT/node_modules/.bin/concurrently"
fi
if [ ! -x "$ROOT/node_modules/.bin/ts-node-dev" ] && [ -f "$ROOT/node_modules/ts-node-dev/lib/bin.js" ]; then
  cat > "$ROOT/node_modules/.bin/ts-node-dev" <<EOF
#!/usr/bin/env node
require("$ROOT/node_modules/ts-node-dev/lib/bin.js");
EOF
  chmod +x "$ROOT/node_modules/.bin/ts-node-dev"
fi
echo "Workspace symlinks configured."
