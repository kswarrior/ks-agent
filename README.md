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
2. Add a provider: Settings → Providers → Add (base URL + API key, keys masked server-side)
3. Add a model: Settings → Models → Add (pick provider + model id, e.g. `deepseek-chat`, `gpt-4o-mini`, `llama3.2`; set the context window, default 128,000)
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
- Skills, MCP servers, and LSP servers (global or per-project)
- Rename/delete chats via ⋮ menu — all confirmations use in-app dialogs
- Responsive: sidebar becomes a drawer on phones (☰ toggles it)
- Built-in tools: file read/write/edit/patch, directory tree, glob, grep, find, git (init/status/diff/log/branch/commit/push/pull), shell with path jail
- Provider presets (OpenAI, Gemini, DeepSeek, OpenRouter, Groq, Mistral, xAI, Together, Fireworks, Cerebras, Moonshot, NVIDIA NIM, Ollama, LM Studio) + custom
- Auto-titled chats, per-message model/duration footer, run reports attached to their own output
- Chat header context meter (estimated used/window tokens) colored green, yellow or red by usage

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

### MCP servers

`.ks-agent/mcp.json`:

```json
{
  "mcpServers": {
    "example": {
      "command": ["node", "server.mjs"],
      "projects": ["project-id"]
    }
  }
}
```

Transports: `stdio`, `http` (Streamable HTTP), `sse` (legacy). Inferred from `command`/`url` when omitted. Empty `projects` = all projects.

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

Working MVP. See `plan.md` for the full build plan and progress log. Smoke test (`npm run smoke`) verifies health, projects, guards, all built-in tools, git, providers, streaming agent, extensions, skills, MCP (stdio/HTTP/SSE), LSP, scoping, and persistence.
