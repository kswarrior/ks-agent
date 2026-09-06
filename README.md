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
