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

kill_by_pattern() {
  local sig="$1"
  local pat="$2"
  local pids
  pids=$(pgrep -f "$pat" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    # shellcheck disable=SC2086
    echo "$pids" | xargs -r kill "-$sig" 2>/dev/null || true
    return 0
  fi
  return 1
}

if [[ "${1:-}" == "stop" ]]; then
  STOPPED=0
  if [[ -f "$PID_FILE" ]]; then
    PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$PID" ]] && kill "$PID" 2>/dev/null; then
      for _ in $(seq 1 20); do
        if ! kill -0 "$PID" 2>/dev/null; then break; fi
        sleep 0.2
      done
      if kill -0 "$PID" 2>/dev/null; then kill -9 "$PID" 2>/dev/null || true; fi
      echo "Stopped KS Agent (pid $PID)"
      STOPPED=1
    fi
    rm -f "$PID_FILE"
  fi
  if kill_by_pattern TERM "node dist-server/index.js"; then
    sleep 0.8
    if pgrep -f "node dist-server/index.js" >/dev/null 2>&1; then
      kill_by_pattern KILL "node dist-server/index.js" || true
      sleep 0.5
    fi
    [[ $STOPPED -eq 0 ]] && echo "Stopped KS Agent"
    STOPPED=1
  fi
  [[ $STOPPED -eq 0 ]] && echo "Nothing to stop"
  exit 0
fi

# Stop any old instance before starting a new one
if [[ -f "$PID_FILE" ]]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [[ -n "$OLD_PID" ]] && kill "$OLD_PID" 2>/dev/null; then
    for _ in $(seq 1 20); do
      if ! kill -0 "$OLD_PID" 2>/dev/null; then break; fi
      sleep 0.2
    done
    if kill -0 "$OLD_PID" 2>/dev/null; then kill -9 "$OLD_PID" 2>/dev/null || true; fi
  fi
  rm -f "$PID_FILE"
fi
if kill_by_pattern TERM "node dist-server/index.js"; then
  sleep 0.8
  if pgrep -f "node dist-server/index.js" >/dev/null 2>&1; then
    kill_by_pattern KILL "node dist-server/index.js" || true
    sleep 0.5
  fi
fi
# Extra guard: if port still bound, wait a bit more
if command -v ss >/dev/null 2>&1; then
  if ss -tln 2>/dev/null | grep -q ":${PORT} "; then
    sleep 0.5
    if ss -tln 2>/dev/null | grep -q ":${PORT} "; then
      kill_by_pattern KILL "node dist-server/index.js" || true
      sleep 1
    fi
  fi
elif command -v lsof >/dev/null 2>&1; then
  if lsof -i :"$PORT" >/dev/null 2>&1; then
    sleep 0.5
  fi
fi

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
LOG_FILE="/tmp/ks-agent-${PORT}.log"
(
  if command -v setsid >/dev/null 2>&1; then
    setsid env \
      KS_SQLITE_PATH="$SQLITE_PATH" \
      KS_DATA_DIR="${KS_DATA_DIR:-$PWD/storage}" \
      PORT="$PORT" \
      HOST="${HOST:-0.0.0.0}" \
      node dist-server/index.js >"$LOG_FILE" 2>&1 &
  else
    nohup env \
      KS_SQLITE_PATH="$SQLITE_PATH" \
      KS_DATA_DIR="${KS_DATA_DIR:-$PWD/storage}" \
      PORT="$PORT" \
      HOST="${HOST:-0.0.0.0}" \
      node dist-server/index.js >"$LOG_FILE" 2>&1 &
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
