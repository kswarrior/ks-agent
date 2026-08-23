# KS AGENT

KS AGENT is a production-grade autonomous multi-model coding agent. It plans, explores, codes, tests, reviews, fixes, and re-tests — all driven by real LLM calls and real filesystem operations — while you watch the activity in a professional three-pane developer UI.

## Highlights

- **Real persistent state machine**: `IDLE → PLANNING → EXPLORING → IMPLEMENTING → TESTING → REVIEWING → FIXING → RETESTING → COMPLETED / FAILED`
- **Per-role model routing**: every agent role (Planner, Explorer, Coder, Tester, Reviewer, Fixer, Final Tester) can independently use any configured provider/model
- **Real tools**: `write_file`, `edit_file`, `shell`, `read_file`, `list_files`, `search_code`
- **Safety first**: project-root sandboxing, symlink safety, path-traversal protection, dangerous-command detection, tool approval, secret redaction
- **Streaming UI**: Server-Sent Events stream model responses and tool activity live
- **SQLite persistence**: projects, chats, messages, runs, steps, tool calls, providers, models, settings
- **Custom providers**: add unlimited OpenAI-compatible providers (NVIDIA, OpenAI, OpenRouter, Ollama, etc.)
- **Appearance**: configurable background (image URL or solid color), border radius, theme colors, overlay opacity
- **Professional black & white developer theme**, default 5px border radius

## Stack

- React 18 + TypeScript (Vite)
- Node.js + Express + TypeScript
- better-sqlite3 with migrations
- SSE for streaming
- npm workspaces monorepo

```
ks-agent/
├── apps/web/                # React UI (port 5173 in dev)
├── apps/server/             # Express API + SSE (port 8080)
├── packages/
│   ├── agent/               # State machine + workflow
│   ├── ai/                  # Provider system (NVIDIA, OpenAI, Anthropic, Google, custom)
│   ├── tools/               # Real tools (file + shell)
│   ├── database/            # SQLite + repositories + migrations
│   ├── types/               # Shared TypeScript types
│   └── shared/              # Logger, id, paths, diff utilities
└── data/                    # SQLite database lives here
```

## Installation

```bash
npm install
npm run build:packages   # compile shared packages once
npm run build            # build server + web
```

## Configuration

The `.env` file (optional):

```bash
PORT=8080
DATABASE_PATH=./data/ks-agent.db
NVIDIA_API_KEY=your_nvidia_key_here
```

> API keys are also configurable in **Settings → Providers** in the UI and are never sent to the frontend in plain text.

## Run

```bash
npm run dev          # starts server (8080) and web dev server (5173) with proxy
# or
npm run start        # production server
```

Open `http://localhost:8080` (the server serves the built web UI).

## Workflow

1. **Create a project** in the sidebar — give it a name and an absolute path to your local codebase.
2. **Create a chat** under the project.
3. Type a coding request and hit **Send**.
4. Watch the agent:
   - Plan
   - Explore the codebase
   - Implement (with `write_file` / `edit_file` / `shell`)
   - Run tests
   - Review
   - Fix iteratively (up to `Maximum fix iterations`)
   - Re-test until passing
5. The right-hand **Activity** panel shows the live timeline, tool calls, shell output, tests, review, and plan.

## Default Models

By default, every role uses the NVIDIA provider via `https://integrate.api.nvidia.com/v1`, with per-role defaults matching the product spec:

| Role | Default model |
| --- | --- |
| Planner | Nemotron 3 Ultra |
| Explorer | Nemotron 3.5 Lightning 30B-A3B |
| Coder | Step 3.7 Flash |
| Test Agent | Nemotron 3.5 Lightning 30B-A3B |
| Reviewer | Nemotron 3 Ultra |
| Fixer | Step 3.7 Flash |
| Final Tester | Nemotron 3.5 Lightning 30B-A3B |

Every role's provider, model ID, temperature, and max tokens are fully configurable from **Settings → Models**.

## Custom Providers

Add any OpenAI-compatible provider:

1. Open **Settings → Providers → + Add Provider**
2. Fill in:
   - **Name**: display name
   - **Type**: `openai-compatible`, `nvidia`, `openai`, `anthropic`, `google`, or `custom`
   - **Base URL**: e.g. `https://api.openai.com/v1`
   - **API Key**
   - **Model ID**: e.g. `gpt-4o`
   - **Model Name**: friendly label
3. Optional: Chat endpoint override, Auth header, Custom headers, Streaming, Temperature, Max tokens, Context limit, Timeout.
4. Click **Test** to verify connectivity.
5. Use **Settings → Models** to assign this provider to any role.

### API key handling

- API keys are stored only in the backend SQLite database and are **never** returned to the UI — list/save responses always show `********`.
- When editing a provider, leaving the field as `********` means "keep the existing key"; type a new value to replace it, or clear it to remove the key.

### Examples

```
# NVIDIA
Base URL: https://integrate.api.nvidia.com/v1
Model ID: nvidia/llama-3.1-nemotron-70b-instruct

# OpenAI
Base URL: https://api.openai.com/v1
Model ID: gpt-4o

# Ollama
Base URL: http://localhost:11434/v1
Model ID: llama3

# OpenRouter
Base URL: https://openrouter.ai/api/v1
Model ID: anthropic/claude-3.5-sonnet
```

## Tools

The agent can use:

| Tool | Description |
| --- | --- |
| `read_file(path, start_line?, end_line?)` | Read a file inside the project root |
| `write_file(path, content)` | Create or overwrite a file |
| `edit_file(path, old_text, new_text, replace_all?)` | Surgical edit with old/new text |
| `list_files(path, recursive?, max_depth?, ignore?)` | List project files |
| `search_code(pattern, path?, include?, max_results?)` | Regex search |
| `shell(command, timeout_ms?, max_output_bytes?)` | Real shell command (sandboxed to project root) |

### Tool Permissions

Configured in **Settings → Agent**:

- **Shell approval**: `Ask every time` / `Ask dangerous commands only` / `Autonomous`
- **Autonomous Mode**: when off, file edits require approval
- Dangerous commands (rm -rf /, fork bombs, dd of=/dev/sd*, curl|sh, sudo, shutdown, etc.) are always blocked or require explicit approval.

## Settings Sections

- **General** — workspace root, default shell, shell timeout, log level
- **Models** — assign provider/model/temperature/max_tokens to every agent role
- **Providers** — add/edit/delete/test OpenAI-compatible providers
- **API** — host, port, CORS origins
- **Tools** — enable/disable each tool
- **Agent** — autonomous mode, max fix iterations, shell approval, automatic tests, review-before-completion, max agent steps
- **Appearance** — background type (image/color), background URL, background color, overlay opacity, border radius (default 5px), theme colors
- **Database** — view table counts and reset

## Database

SQLite at `./data/ks-agent.db` (override via `DATABASE_PATH`). Schema is created on first run with migrations:

```
projects, chats, messages, agent_runs, agent_steps, tool_calls,
model_settings, provider_settings, app_settings
```

API keys never leave the backend.

## Development

```bash
npm install
npm run build:packages
npm run dev
```

- Server hot-reloads with `ts-node-dev`
- Web hot-reloads with Vite, proxies `/api` and `/api/events` to the server

## Production

```bash
npm install
npm run build:packages
npm run build
PORT=8080 DATABASE_PATH=/var/lib/ks-agent/ks-agent.db npm run start
```

## Troubleshooting

- **`EADDRINUSE 8080`** — change `PORT` or `Settings → API → Port`.
- **No providers available** — open Settings → Providers and add at least one enabled provider with a valid API key.
- **Shell commands hang** — adjust `General → Shell timeout` and inspect the Activity → Shell tab.
- **Web UI not loading** — make sure `npm run build` was executed so `apps/web/dist` exists; the server falls back to a placeholder page if the UI was not built.
- **Reset database** — Settings → Database → **Reset projects/chats/runs**.

## Architecture Notes

- **State machine**: implemented in `packages/agent/src/workflow.ts`. Each role uses a tailored prompt and role-specific context (planner sees request+chat; explorer sees plan; coder sees plan+explorer; tester sees the change digest — real diffs + command results; reviewer sees requirements+diff+tests; fixer sees review findings+failures+diff).
- **Provider system**: every provider implements `AIProvider` with `chat`, `stream`, and `testConnection`. The OpenAI-compatible base class handles NVIDIA, OpenAI, OpenRouter, Ollama, and any other OpenAI-shaped API.
- **Path safety**: every file tool uses `safeResolve(root, target)` which rejects `..` escapes and resolves symlinks.
- **Streaming**: model responses stream to the UI as `message.delta` events over SSE (`/api/events`), alongside agent state changes, step updates, and live tool output. Cancelling a run aborts in-flight HTTP requests via `AbortSignal`.
- **Approvals**: when a tool needs approval, the run enters `WAITING_FOR_USER`, the tool call is marked `awaiting_approval`, and the UI shows an Approve/Deny dialog. Cancelling the run resolves pending approvals immediately.
- **Future-friendly**: the package layout and repository design leave room for git tools, MCP, RAG, code indexing, and parallel agents.

## Security

- API keys are stored only on the server; the API returns masked versions to the UI.
- Filesystem operations are sandboxed to each project's root directory.
- Symlinks that escape the root are rejected.
- Shell commands have configurable timeouts and output limits.
- Dangerous commands are blocked by default.
- All user input is validated server-side.

---

**KS AGENT** — a real, modular, extensible autonomous coding-agent platform.
