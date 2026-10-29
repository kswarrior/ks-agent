#!/usr/bin/env bash
# retest.sh - build (if needed) and run KS Agent on port 8080.
#
# Usage:
#   bash retest.sh              start on :8080 (stops any old instance first)
#   bash retest.sh stop         stop the running instance
#   KS_REBUILD=1 bash retest.sh force a fresh build before starting

set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8080}"
PID_FILE="/tmp/ks-agent-${PORT}.pid"
LOG_FILE="/tmp/ks-agent-${PORT}.log"
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

stop_agent() {
  local stopped=0
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
    if [[ -n "$pid" ]] && kill "$pid" 2>/dev/null; then
      for _ in $(seq 1 20); do
        if ! kill -0 "$pid" 2>/dev/null; then break; fi
        sleep 0.2
      done
      if kill -0 "$pid" 2>/dev/null; then kill -9 "$pid" 2>/dev/null || true; fi
      printf 'Stopped KS Agent (pid %s)\n' "$pid"
      stopped=1
    fi
    rm -f "$PID_FILE"
  fi
  if kill_by_pattern TERM "node dist-server/index.js"; then
    sleep 0.8
    if pgrep -f "node dist-server/index.js" >/dev/null 2>&1; then
      kill_by_pattern KILL "node dist-server/index.js" || true
      sleep 0.5
    fi
    if [[ $stopped -eq 0 ]]; then
      echo "Stopped KS Agent"
    fi
    stopped=1
  fi
  if [[ $stopped -eq 0 ]]; then
    echo "Nothing to stop"
  fi
  return 0
}

if [[ "${1:-}" == "stop" ]]; then
  stop_agent
  exit 0
fi

stop_agent

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install --no-audit --no-fund
fi

if [[ "${KS_REBUILD:-0}" == "1" || ! -f dist/index.html || ! -f dist-server/index.js ]]; then
  echo "Building..."
  npm run build
fi

DATA_DIR="${KS_DATA_DIR:-$PWD/storage}"
PROJECTS_DIR="${KS_PROJECTS_DIR:-$PWD/project}"
mkdir -p "$DATA_DIR" "$PROJECTS_DIR"
export PORT KS_DATA_DIR="$DATA_DIR" KS_PROJECTS_DIR="$PROJECTS_DIR"

DB_FILE="$DATA_DIR/ksagent.db"
if [[ -f "$DB_FILE" ]]; then
  BACKUP_DIR="$DATA_DIR/backups"
  BACKUP_FILE="$BACKUP_DIR/ksagent-$(date +%Y%m%d-%H%M%S).db"
  mkdir -p "$BACKUP_DIR"
  if node -e 'const Database = require("better-sqlite3"); const db = new Database(process.argv[1], { readonly: true }); db.backup(process.argv[2]).then(() => db.close()).catch((error) => { console.error(error); process.exit(1); });' "$DB_FILE" "$BACKUP_FILE" 2>/dev/null; then
    echo "Data backup: ${BACKUP_FILE}"
  else
    echo "WARN: could not back up ${DB_FILE}" >&2
  fi
  ls -1t "$BACKUP_DIR"/ksagent-*.db 2>/dev/null | tail -n +11 | xargs -r rm -f
fi

echo "Starting KS Agent on port ${PORT} in the background..."
echo "Data: ${DATA_DIR} · Projects: ${PROJECTS_DIR}"
if command -v setsid >/dev/null 2>&1; then
  nohup setsid node dist-server/index.js >"$LOG_FILE" 2>&1 </dev/null &
else
  nohup node dist-server/index.js >"$LOG_FILE" 2>&1 </dev/null &
fi
echo $! > "$PID_FILE"

for _ in $(seq 1 30); do
  if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
    NODE_PID=$(pgrep -f "node dist-server/index.js" 2>/dev/null | head -n 1 || true)
    if [[ -n "$NODE_PID" ]]; then
      echo "$NODE_PID" > "$PID_FILE"
    fi
    echo "OK: KS Agent is running in the background on http://localhost:${PORT} (pid $(cat "$PID_FILE"), log ${LOG_FILE})"
    exit 0
  fi
  if ! kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
    echo "FAILED: KS Agent exited during startup. See ${LOG_FILE}" >&2
    exit 1
  fi
  sleep 1
done

echo "FAILED: KS Agent did not become ready within 30 seconds. See ${LOG_FILE}" >&2
exit 1
