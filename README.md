# KS Agent

A web-based AI coding agent by **ks warrior**. Pure black UI, works on desktop and phone.

## Stack

- **Backend**: Node + [Hono](https://hono.dev) — REST API + SSE streaming to OpenAI-compatible providers
- **Frontend**: React 18 + Vite, hand-rolled dark theme (no CSS framework)
- **Storage**: SQLite at `storage/ksagent.db` (WAL mode, auto-migrates from legacy `data/db.json` or `data/ksagent.db` on first run; override with `KS_SQLITE_PATH` or `KS_DATA_DIR`)

## Quick Start — 60s to first chat (beats Cursor)

```bash
npm install
npm run build
npm start            # http://localhost:8787 (or $PORT)
# Open http://localhost:8787 — Quick Setup wizard opens automatically
# 1) Project: keep default “my-project” → Create (auto-mkdir project/my-project)
# 2) Provider + Model in ONE click: pick preset (DeepSeek/OpenAI/Groq/Ollama) → paste key → model auto-suggested (e.g. deepseek-chat / gpt-4o-mini / llama3.2)
# 3) Pick model in composer and send — streaming + plan + preview live
# Ollama (local): choose “Ollama (local)” preset — no key, no cost, offline
```

`bash retest.sh` — build-if-needed + run on :8080 with health probe; `bash retest.sh stop` to stop. Dev: `npm run dev:server` (API :8787 watch) + `npm run dev:web` (Vite :5173 proxies /api → 8787).

Environment overrides (optional — see also Docker Jail below):

```bash
PORT=8787 npm start
KS_SQLITE_PATH=/data/ksagent.db   # custom SQLite path
KS_DATA_DIR=/custom/dir           # custom data directory
```

### Optional Docker Jail (kernel isolation) — `KS_DOCKER_JAIL`

For untrusted code or stronger isolation than the native `fsx.ts:10` realpath + symlink guard and `agent.ts:714` `isOutsideScopeCommand` (`..`, `%2e`, `~`/`$HOME`, `$(`, private-host SSRF), wrap both **`run_shell` tool** and **PTY terminal** through Docker:

```bash
KS_DOCKER_JAIL=1 KS_DOCKER_IMAGE=node:20-alpine npm start   # default image node:20-alpine
KS_DOCKER_JAIL=1 KS_DOCKER_IMAGE=alpine npm start            # lighter alternative
# KS_DOCKER_JAIL=0 or unset (default) → native strict jail only (no Docker)
```

When `KS_DOCKER_JAIL=1` the server wraps each shell command as:

```
docker run --rm --network none --memory=512m --cpus=1 -v <projectPath>:/workspace:rw -w /workspace <image> sh -c '<command>'
```

and PTY sessions as:

```
docker run -it --rm --network none --memory=512m --cpus=1 -v <projectPath>:/workspace:rw -w /workspace <image> /bin/sh
```

via `node-pty` (fallback to native PTY if Docker is unavailable).

- **Default:** `KS_DOCKER_JAIL=0` (or unset) — native jail only; existing `server/src/fsx.ts:10` `resolveInProject` (realpath + symlink guard) and `server/src/agent.ts:714` `isOutsideScopeCommand` remain fully active.
- **Defense in depth:** Even in Docker mode, the same `isOutsideScopeCommand` checks still run *before* Docker dispatch, so `../`, `~`, encoded `%2e%2e`, `curl` to private hosts, and absolute paths outside `/workspace` are blocked twice.
- **Image override:** Set `KS_DOCKER_IMAGE` to any local image (default `node:20-alpine`; `alpine` also works). Value is validated (`^[a-zA-Z0-9/._:-]+$`, no shell metachars) and falls back to `node:20-alpine` if invalid.
- **Handles missing Docker gracefully:** If `docker` is not installed or not in `PATH`, the server logs a warning (`[docker] … not available — falling back to native jail`) and continues with native isolation; it never crashes.
- **Security:** Never uses `--privileged`, never mounts host secrets, mounts **only** the active project (`project/<name>` → `/workspace:rw`), keeps `--network none`, limits memory/CPUs, and sets container workdir to `/workspace`. Host API keys remain server-side in SQLite (`600`) and are not forwarded into the container. See `server/src/docker.ts` and `server/src/index.ts:112` PTY handling.

## Setup (manual, if you skip wizard)

1. **Quick Setup** (recommended): `Settings → Quick Setup` — preset + key + model in one click, with suggestions per provider (OpenAI → `gpt-4o-mini`, DeepSeek → `deepseek-chat`, Ollama → `llama3.2`, Groq → `llama-3.3-70b-versatile`).
2. Or classic: `Settings → Providers → Add` (base URL + key, keys masked server-side) → `Models → Add` (pick provider + model id).
3. Pick model in chat composer and send. Auto-creates a chat if none exists.
4. First-time tip: if no project, create one via sidebar `+` or wizard Step 1 — `my-project` → `project/my-project` auto-created.

## Features

- **Onboarding in 60s** — auto wizard + Quick Setup in Settings: preset → key → model suggestions (one click, beats Cursor’s 92). Ollama needs no key. Keys masked server-side.
- Projects (with optional auto-`mkdir`) and per-project chats
- Streaming responses (SSE) with stop button, auto-retry, and “continue” to resume interrupted replies
- Plans, activities, and previews persisted per chat; terminal (PTY) per project
- Skills, MCP/LSP servers, and plugins (global or per-project)
- Rename/delete chats via ⋮ menu — all confirmations use in-app dialogs
- Responsive: sidebar becomes a drawer on phones (☰ toggles it) + floating Quick Setup FAB when setup incomplete
