#!/bin/bash
# Fix workspace symlinks so that:
# 1. Each workspace's node_modules/.bin has a tsc link.
# 2. node_modules/@ks-agent/* points to packages/* so require() works.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p node_modules/@ks-agent
for pkg in types shared database ai tools agent; do
  ln -sf "$ROOT/packages/$pkg" "$ROOT/node_modules/@ks-agent/$pkg"
done

# Ensure native binaries keep their exec bits (npm can strip them).
chmod +x "$ROOT"/node_modules/@esbuild/*/bin/esbuild 2>/dev/null || true
chmod +x "$ROOT"/node_modules/esbuild/bin/esbuild 2>/dev/null || true
find "$ROOT/node_modules" -name "*.node" -path "*better-sqlite3*" -exec chmod +x {} \; 2>/dev/null || true

# Write a launcher that works for both CJS and ESM entry points.
# require() crashes on ESM-only entries (ERR_REQUIRE_ASYNC_MODULE), so we
# spawn node itself with process.argv forwarded.
write_launcher() {
  local path="$1" target="$2"
  # npm pre-creates .bin entries as symlinks (e.g. .bin/vite -> ../vite/bin/vite.js).
  # Writing through such a symlink corrupts the REAL binary inside node_modules,
  # so always replace the entry instead of following it.
  rm -f "$path"
  local tmp
  tmp="$(mktemp "$path.XXXXXX")"
  cat > "$tmp" <<EOF
#!/usr/bin/env node
const { spawn } = require('child_process');
const proc = spawn(process.execPath, ['$target', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});
proc.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 0;
});
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => proc.kill(sig));
}
EOF
  chmod +x "$tmp"
  mv -f "$tmp" "$path"
}

for ws in packages/types packages/shared packages/database packages/ai packages/tools packages/agent apps/server apps/web; do
  mkdir -p "$ws/node_modules/.bin"
  write_launcher "$ws/node_modules/.bin/tsc" "$ROOT/node_modules/typescript/lib/tsc.js"
  if [ -f "$ROOT/node_modules/vite/bin/vite.js" ]; then
    write_launcher "$ws/node_modules/.bin/vite" "$ROOT/node_modules/vite/bin/vite.js"
  fi
done

# Root .bin wrappers
mkdir -p "$ROOT/node_modules/.bin"
write_launcher "$ROOT/node_modules/.bin/tsc" "$ROOT/node_modules/typescript/lib/tsc.js"
if [ -f "$ROOT/node_modules/vite/bin/vite.js" ]; then
  write_launcher "$ROOT/node_modules/.bin/vite" "$ROOT/node_modules/vite/bin/vite.js"
fi
if [ -f "$ROOT/node_modules/concurrently/dist/bin/concurrently.js" ]; then
  write_launcher "$ROOT/node_modules/.bin/concurrently" "$ROOT/node_modules/concurrently/dist/bin/concurrently.js"
fi
if [ -f "$ROOT/node_modules/ts-node-dev/lib/bin.js" ]; then
  write_launcher "$ROOT/node_modules/.bin/ts-node-dev" "$ROOT/node_modules/ts-node-dev/lib/bin.js"
fi
echo "Workspace symlinks configured."
