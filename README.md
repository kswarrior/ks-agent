# KS AGENT

**A production-quality, multi-model autonomous coding agent.**

KS AGENT is a coding agent that works like OpenCode/Cline-style agents. You give it a natural-language request and it plans, explores your codebase, implements changes, runs tests, reviews its work, fixes problems, and reports the final result — all through a professional, dark-themed web UI.

## Core Features

- **Multi-model agent pipeline**: Planner → Explorer → Coder → Test Agent → Reviewer → Fixer → Final Tester
- **Independent model selection per role** via Settings → Models
- **Real tools**: `write_file`, `edit_file`, `shell` (real filesystem + shell execution)
- **Tool permission system** with approval prompts for dangerous operations
- **Multiple projects**, each bound to a local directory
- **Multiple chats per project** with full history persistence
- **Live agent activity timeline** streamed over WebSocket
- **SQLite persistence** (projects, chats, messages, runs, steps, tool calls, settings)
- **Resumable agent state machine** with fix-loop safeguards (MAX_FIX_ITERATIONS)

## Architecture

```
apps/
  web/          React + TypeScript single-page app (Vite)
  server/       Node.js + TypeScript HTTP + WebSocket API

packages/
  types/        Shared TypeScript types and enums
  shared/       Shared utilities
  database/     SQLite schema + repositories
  ai/           AI provider interface, NVIDIA provider, model registry/router
  tools/        Tool registry + write_file / edit_file / shell executors
  agent/        Agent state machine, context manager, agent engine, event bus
```

### Agent workflow

```
USER
  ↓
① PLANNER          Nemotron 3 Ultra              Understand + Plan
② EXPLORER         Nemotron 3.5 Lightning 30B    Explore Codebase
③ CODER            Step 3.7 Flash                EDIT / WRITE code
④ TEST AGENT       Nemotron 3.5 Lightning 30B    Run / Inspect
⑤ REVIEWER         Nemotron 3 Ultra              Deep independent review
⑥ FIXER            Step 3.7 Flash                Fix review issues
⑦ TEST AGENT       Nemotron 3.5 Lightning 30B    Run tests again
  ↓
TESTS PASS → DONE
```

Each stage is implemented as a state machine (`idle → planning → exploring → implementing → testing → reviewing → fixing → retesting → completed | failed | waiting_for_user`). The loop is bounded by `MAX_FIX_ITERATIONS` (default 5) and `MAX_AGENT_STEPS` (default 100).

## Installation

Requirements: Node.js >= 20.

```bash
npm install
```

## Environment Variables

Create a `.env` file in the project root (copy `.env.example`):

```text
NVIDIA_API_KEY=your_key_here
PORT=8080
HOST=0.0.0.0
DATABASE_PATH=./data/ks-agent.db
```

## NVIDIA API Setup

1. Get an API key from NVIDIA (build.nvidia.com → Get API Key).
2. Set it as `NVIDIA_API_KEY` in `.env` (recommended), or enter it in **Settings → API** in the UI.
3. Click **Test Connection** to verify.

The API key is stored on the backend only and is never exposed to the React frontend.

## Running the Application

Development (server + web, both live-reload):

```bash
npm run dev
```

Then open http://localhost:8080

Build everything:

```bash
npm run build
```

Run the production server (serves both API and built web UI on port 8080):

```bash
npm run build
npm run start
```

## Creating a Project

1. Click **+ New Project**.
2. Give it a name, and enter the **root directory** of an existing local project.
3. Create a chat and send a request, e.g. `Add authentication to this application`.

KS AGENT will bind all tools (file writes, edits, shell) to that project directory. Path traversal outside the project root is blocked.

## Model Configuration

Each agent role has an independent model. Open **Settings → Models** and pick a model for:

- Planner
- Codebase Explorer
- Coder / Editor
- Test / Shell Agent
- Reviewer
- Fixer
- Final Test Agent

## Tool Permissions

Under **Settings → Tools** choose:

- **Ask every time**: prompt for all tool calls (future / per-tool).
- **Ask for dangerous commands only**: prompt before things like `rm -rf`, `sudo`, destructive git operations.
- **Autonomous**: run without prompts.

When the agent requests approval, the UI shows the exact command/tool and asks **Allow / Deny**.

## Agent Settings

Under **Settings → Agent**:

- Autonomous mode
- Maximum fix iterations (default 5)
- Require approval for shell
- Automatically run tests
- Review before completion
- Maximum agent steps (default 100)

All persisted in SQLite.

## Database

SQLite database at `data/ks-agent.db` (configurable via `DATABASE_PATH`).

Tables: `projects`, `chats`, `messages`, `agent_runs`, `agent_steps`, `tool_calls`, `model_settings`, `app_settings`.

```text
Project  ── many Chats ── many Messages
              └── many Agent Runs ── many Agent Steps ── many Tool Calls
```

Run the migration manually:

```bash
npm run db:migrate
```

## Streaming

The frontend receives live agent events over WebSocket (`/ws`):

- `state_change` — state machine transitions
- `step_start` / `step_complete` — per role
- `tool_call` / `tool_result` — tool activity
- `approval_request` — permission prompts
- `message` — role output
- `run_complete` — final result

The Activity panel on the right renders these in real time.

## Development

```bash
npm run dev          # server + web with live reload
npm run dev:server   # backend only
npm run dev:web      # frontend only
npm run build        # compile all workspaces
npm run typecheck    # TypeScript checks across workspaces
```

## Production Build

```bash
npm run build
npm run start
```

The server serves the built React frontend from `apps/web/dist` on port 8080.

## Security

- Path traversal blocked on all file tools (`write_file`, `edit_file`).
- Shell commands restricted to the project working directory.
- Dangerous command detection with approval gate.
- Shell timeouts and output limits.
- API key never returned to the browser.
- No secrets logged.

## Troubleshooting

**"NVIDIA API key is not configured"**
Set `NVIDIA_API_KEY` in `.env` or add it in Settings → API.

**Port 8080 already in use**
Change `PORT` in `.env`.

**Model calls fail / rate limited**
Retries are built in for 429 and 5xx responses. Verify the API key and provider status.

**Database file permissions**
Ensure the `data/` directory is writable by the Node.js process.