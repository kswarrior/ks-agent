#!/usr/bin/env bash
# retest.sh - build (if needed) and run KS Agent on port 8080.
#
# Usage:
#   bash retest.sh        start (stops any old instance first)
#   bash retest.sh stop   stop the running instance

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
PID_FILE="/tmp/ks-agent-${PORT}.pid"
URL="http://127.0.0.1:${PORT}"

if [[ "${1:-}" == "stop" ]]; then
  if [[ -f "$PID_FILE" ]] && kill "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Stopped KS Agent (pid $(cat "$PID_FILE"))"
  else
    pkill -f "node dist-server/index.js" 2>/dev/null && echo "Stopped KS Agent" || echo "Nothing to stop"
  fi
  rm -f "$PID_FILE"
  exit 0
fi

if [[ -f "$PID_FILE" ]] && kill "$(cat "$PID_FILE")" 2>/dev/null; then
  sleep 0.5
fi
rm -f "$PID_FILE"
pkill -f "node dist-server/index.js" 2>/dev/null || true
sleep 0.3

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install --no-audit --no-fund
fi

if [[ ! -f dist/index.html || ! -f dist-server/index.js ]]; then
  echo "Building..."
  npm run build
fi

echo "Starting KS Agent on port ${PORT}..."
# Default to storage/ksagent.db at agent root (where skills/web/server live)
# KS_SQLITE_PATH takes precedence, else KS_DATA_DIR (legacy), else storage
DEFAULT_SQLITE="$PWD/storage/ksagent.db"
if [[ -n "${KS_SQLITE_PATH:-}" ]]; then
  SQLITE_PATH="$KS_SQLITE_PATH"
elif [[ -n "${KS_DATA_DIR:-}" ]]; then
  SQLITE_PATH="$KS_DATA_DIR/ksagent.db"
else
  SQLITE_PATH="$DEFAULT_SQLITE"
fi
(
  if command -v setsid >/dev/null 2>&1; then
    setsid env \
      KS_SQLITE_PATH="$SQLITE_PATH" \
      KS_DATA_DIR="${KS_DATA_DIR:-$PWD/storage}" \
      PORT="$PORT" \
      HOST="${HOST:-0.0.0.0}" \
      node dist-server/index.js &
  else
    nohup env \
      KS_SQLITE_PATH="$SQLITE_PATH" \
      KS_DATA_DIR="${KS_DATA_DIR:-$PWD/storage}" \
      PORT="$PORT" \
      HOST="${HOST:-0.0.0.0}" \
      node dist-server/index.js &
  fi
  echo $! > "$PID_FILE"
)

for _ in $(seq 1 30); do
  if curl -fsS "$URL/api/projects" >/dev/null 2>&1; then
    echo "OK: KS Agent is running on http://localhost:${PORT}"
    exit 0
  fi
  if ! kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
    echo "FAILED: KS Agent exited during startup (port conflict? run 'npm run build' and check logs)." >&2
    exit 1
  fi
  sleep 1
done

echo "FAILED: KS Agent did not become ready within 30 seconds." >&2
exit 1
