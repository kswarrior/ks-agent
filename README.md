# KS Agent

A local-first coding agent with a **process-isolated extension system**. New capabilities (web apps, Minecraft plugins/servers/bots, Android apps, anything) are added as extensions instead of changes to the core.

Pure black UI, works on desktop and phone.

## Stack

- **Backend**: Node 22 + TypeScript + [Hono](https://hono.dev) — REST API + SSE streaming to OpenAI-compatible providers
- **Frontend**: React 18 + Vite, hand-rolled dark theme (no CSS framework)
- **Storage**: SQLite at `storage/ksagent.db` (WAL mode, auto-migrates from legacy `data/db.json` / `data/ksagent.db` on first run; override with `KS_SQLITE_PATH` or `KS_DATA_DIR`)
- **Extensions**: JSON-RPC over stdio, one child process per extension

## Quick Start

```bash
npm install
npm run build
npm start            # http://localhost:8080 (or $PORT)
```

Then in the UI:

1. Create a project: sidebar → `+` → "my-project" (auto-mkdirs `project/my-project`)
2. Add a provider: Settings → Providers → Add (base URL + API key, keys masked server-side). Edit existing providers, replace the key or clear it.
3. Add a model: Settings → Models → Add (pick provider + model id, e.g. `deepseek-chat`, `gpt-4o-mini`, `llama3.2`; set the context window, default 128,000). Edit models from the same card list.
4. Pick a model in the composer and send — streaming + plan + preview live

Ollama (local): base URL `http://localhost:11434/v1` — no key, no cost, offline.

Dev: `npm run dev:server` (API on :8080, watch) + `npm run dev:web` (Vite :5173, proxies `/api` → 8080).  
`bash retest.sh` — build-if-needed + run on :8080 with health probe; `bash retest.sh stop` to stop.

## Environment overrides

```bash
PORT=8080 npm start
KS_ROOT_DIR=/app                 # project root (default cwd)
KS_DATA_DIR=/data                # storage directory
KS_SQLITE_PATH=/data/ksagent.db  # custom SQLite path
KS_PROJECTS_DIR=/data/projects   # projects directory
KS_EXTENSIONS_DIR=/data/exts     # extensions directory
KS_SKILLS_DIR=/data/skills       # skills directory (single override)
KS_MCP_CONFIG=/data/mcp.json     # MCP config path
KS_LSP_CONFIG=/data/lsp.json     # LSP config path
KS_MAX_STEPS=30
KS_SHELL_TIMEOUT_MS=120000
KS_PREVIEW_BIND=0.0.0.0        # preview proxy bind address
KS_PREVIEW_TIMEOUT_MS=120000   # wait for the dev server port before failing
```

## Optional Docker Jail (`KS_DOCKER_JAIL`)

For untrusted code or stronger isolation than the native jail, wrap both `run_shell` and PTY-equivalent execution through Docker:

```bash
KS_DOCKER_JAIL=1 KS_DOCKER_IMAGE=node:20-alpine npm start   # default image node:20-alpine
KS_DOCKER_JAIL=1 KS_DOCKER_IMAGE=alpine npm start            # lighter alternative
```

When enabled, each shell command runs as:

```
docker run --rm --network none --memory=512m --cpus=1 -v <projectPath>:/workspace:rw -w /workspace <image> sh -c '<command>'
```

- Default `KS_DOCKER_JAIL=0` (or unset) — native jail only (`server/src/fsx.ts` realpath + symlink guard, `server/src/agent.ts` `isOutsideScopeCommand`).
- Defense in depth: the same command checks still run before Docker dispatch.
- Image value is validated (`^[a-zA-Z0-9/._:-]+$`); invalid values fall back to `node:20-alpine`.
- If Docker is missing, the server logs a warning and falls back to native isolation; it never crashes.
- Never uses `--privileged`, never mounts host secrets, mounts only the active project.

## Features

- Projects (auto-mkdir) and per-project chats
- Streaming responses (SSE) with stop button, auto-retry, and "continue" to resume interrupted replies
- Settings → Retry: on/off, limited or unlimited attempts, backoff, jitter, Retry-After, network/5xx and custom status codes
- Provider errors show the HTTP status, provider code/message and response details; live retries show the attempt count and countdown
- Plans, activities, and previews persisted per chat
- Skills, knowledge, MCP servers, and LSP servers (global or per-project), all editable from the Extensions modal
- Edit a chat's title and model from the ⋮ menu or the pencil in the chat header; all confirmations use in-app dialogs
- Responsive: sidebar becomes a drawer on phones (☰ toggles it)
- Built-in tools: file read/write/edit/patch, directory tree, glob, grep, find, git (init/status/diff/log/branch/commit/push/pull), shell with path jail
- Provider presets (OpenAI, Gemini, DeepSeek, OpenRouter, Groq, Mistral, xAI, Together, Fireworks, Cerebras, Moonshot, NVIDIA NIM, Ollama, LM Studio) + custom
- Auto-titled chats, per-message model/duration footer, run reports attached to their own output
- Chat header context meter (estimated used/window tokens) colored green, yellow or red by usage
- Live web-app preview: a movable, resizable window with minimize/maximize/close, live logs and an in-window prompt bar. The Preview button auto-detects the dev command/port and starts the app; the AI can also start/stop it with the `preview_app` tool, and HTTP + HMR WebSocket traffic is proxied through an ephemeral same-host port so it works on phones too
- Automatic context compaction: near the model window, older messages become an editable handoff summary and are no longer sent to the provider

## Agent config (`.ks-agent/`)

```
.ks-agent/
├── skills/            # one folder per skill, each with SKILL.md
├── mcp.json           # MCP servers (mcpServers)
└── lsp.json           # language servers (languageServers)
```

### Skills

Discovered from `.ks-agent/skills/` (primary), `skills/` (legacy), `.opencode/skills/` (fallback). Each skill is a folder with `SKILL.md`:

```markdown
---
name: debugging
description: Use when debugging or reproducing an error
projects: all
---

# Debugging
Step-by-step workflow the agent must follow.
```

`projects: all` (or omitting) enables everywhere; use `projects: id1, id2` to restrict.

Skills can be renamed (including flat `<name>.md` skills), edited, scoped and
deleted from **Extensions → Skills**; renaming updates the frontmatter name and
moves the folder or file in one step.

### MCP servers

`.ks-agent/mcp.json`:

```json
{
  "mcpServers": {
    "example": {
      "command": "node",
      "args": ["server.mjs"],
      "cwd": ".",
      "installCommand": "npm i -g example-mcp",
      "projects": ["project-id"]
    }
  }
}
```

Transports: `stdio`, `http` (Streamable HTTP), `sse` (legacy). Inferred from `command`/`url` when omitted. Empty `projects` = all projects.

The Extensions → MCP form and cards support editing the command/URL, scope,
environment, headers, working directory and install command. **Install** runs
`POST /api/mcp/:name/install` in the foreground; **Background install** sends
`{ "background": true }` and returns immediately, logging failures and reloading
the server when the command finishes.

### LSP servers

`.ks-agent/lsp.json`:

```json
{
  "languageServers": {
    "typescript": {
      "command": "typescript-language-server",
      "args": ["--stdio"],
      "extensions": [".ts", ".tsx", ".js"],
      "languageId": "typescript",
      "installCommand": "npm i -g typescript-language-server typescript",
      "projects": ["project-id"]
    }
  }
}
```

Diagnostics are returned as `file:line:column severity: message (code) [source]`.

### Knowledge

Knowledge is stored in SQLite and managed from **Extensions → Knowledge**. It
has two independent scopes:

- **User knowledge** applies to every project (preferences, conventions and
  personal context).
- **Project knowledge** applies only to the selected project. Use **Generate
  summary** to scan the project tree and key config files, optionally with a
  model, or write/edit notes manually. Generation runs in the background, so it
  continues if the panel is closed; reopening the panel reconnects to a running
  job and shows when the summary is ready.

Both scopes can be enabled or disabled globally and toggled per chat from the
Tools menu. Only enabled, chat-enabled entries are injected into the agent
system prompt. Generated summaries are updated in place on regeneration. APIs:
`GET/POST /api/knowledge` (`?scope=global` for user knowledge), `GET/POST /api/projects/:id/knowledge`,
`PATCH/PUT/DELETE /api/knowledge/:id`, and
`POST /api/projects/:id/knowledge/summary` (also `/generate`; pass
`{"background":true}` for a `202` job, then poll
`GET /api/projects/:id/knowledge/summary/status`).

### Extension authoring

Extensions live in `extensions/<name>/extension.json`. Copy an example to get started:

```bash
cp -r examples/extensions/web extensions/my-ext
```

Manifest:

```json
{
  "name": "my-ext",
  "version": "1.0.0",
  "description": "What it does",
  "command": ["node", "index.mjs"],
  "permissions": { "shell": true, "network": true, "projectWrite": true },
  "timeoutMs": 300000,
  "tools": [
    {
      "name": "do_thing",
      "description": "Does a thing",
      "parameters": { "type": "object", "properties": {} }
    }
  ]
}
```

The extension process receives JSON-RPC over stdio (`initialize`, `tools/list`, `tools/call`, `hook`). Tools are exposed to the agent as `ext_<name>_<tool>`. Extensions run as one child process per extension, scoped to the project path, and never receive API keys.

Examples: `examples/extensions/web`, `examples/extensions/minecraft`, `examples/extensions/android`. SDK helper: `examples/extensions/sdk.mjs`.

## Security

- Path jail: `..`, absolute paths, and symlink escapes are rejected (`server/src/fsx.ts` `resolveInProject`).
- Shell guard: traversal, `~`, `$HOME`, private hosts, dangerous commands blocked (`server/src/agent.ts` `isOutsideScopeCommand`).
- API keys stored server-side in SQLite, masked in responses.
- MCP/LSP receive only tool arguments and no provider credentials.
- Extension isolation: one child process per extension, project path only.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev:server` | API server with watch |
| `npm run dev:web` | Vite dev server |
| `npm run build` | Typecheck + build server and web |
| `npm run typecheck` | TypeScript check |
| `npm start` | Run built server |
| `npm run smoke` | End-to-end smoke test |

## Project layout

```
server/        # Hono backend
web/           # React frontend
extensions/    # installed extensions (gitignored)
examples/      # extension scaffolds + SDK
skills/        # legacy skills (fallback)
.ks-agent/     # skills, mcp.json, lsp.json
storage/       # SQLite db (gitignored)
project/       # user projects (gitignored)
```

## Status

Working MVP. See `plan.md` for the full build plan and progress log. Smoke test (`npm run smoke`) verifies health, projects, guards, all built-in tools, git, providers/models (including edits), chat edits, streaming agent, extensions, skill rename, knowledge plus background summary jobs, MCP (stdio/HTTP/SSE, foreground/background install), LSP edits, scoping, and persistence.
