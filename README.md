# KS Agent

A web-based AI coding agent by **ks warrior**. Pure black UI, works on desktop and phone.

## Stack

- **Backend**: Node + [Hono](https://hono.dev) — REST API + SSE streaming to OpenAI-compatible providers
- **Frontend**: React 18 + Vite, hand-rolled dark theme (no CSS framework)
- **Storage**: SQLite at `storage/ksagent.db` (WAL mode, auto-migrates from legacy `data/db.json` or `data/ksagent.db` on first run; override with `KS_SQLITE_PATH` or `KS_DATA_DIR`)

## Run

```bash
npm install

# production
npm run build     # builds web/ -> dist/ and server -> dist-server/
npm start         # serves API + UI on http://localhost:8787 (or $PORT)
bash retest.sh    # build-if-needed + run on :8080 with health probe; bash retest.sh stop to stop

# development (two terminals)
npm run dev:server   # API on :8787 with watch
npm run dev:web      # Vite on :5173 (proxies /api → 8787)
```

## Setup

1. Open **Settings** in the sidebar footer.
2. **Providers → Add**: name, base URL (OpenAI-compatible, e.g. `https://api.openai.com/v1`), API key.
3. **Models → Add**: pick provider, enter model id like `minimax-ai/minimax-m3`.
4. Pick the model in the chat composer and send.

## Features

- Projects (with optional auto-`mkdir`) and per-project chats
- Streaming responses (SSE) with stop button
- Rename/delete chats via ⋮ menu — all confirmations use in-app dialogs
- Responsive: sidebar becomes a drawer on phones (☰ toggles it)
