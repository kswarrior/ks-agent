# KS Agent — Build Plan (from zero)

A local-first coding agent with a **process-isolated extension system**, so new
capabilities (Minecraft plugin/server/bot, web apps, Android apps, anything) are
added as extensions instead of changes to the core.

**Stack:** Node 22 + TypeScript + Hono (server) · React 18 + Vite (web) ·
SQLite (storage) · JSON-RPC over stdio (extensions).

**Rule:** a box only becomes `[x]` after the item exists and `npm run typecheck`
plus `npm run build` (and the smoke test where applicable) pass. `[~]` means
implemented but not yet verified. `[ ]` means not done.

---

## Phase 0 — Foundation

- [x] `plan.md` written and kept up to date (this file)
- [x] `package.json` with dev/build/typecheck/start/smoke scripts
- [x] Root + server `tsconfig.json`, `vite.config.ts`, `web/index.html`
- [x] `.gitignore` covers `node_modules`, builds, storage, project data, logs
- [x] Server skeleton: Hono app, health route, JSON errors, static serving
- [x] Config module: root/data/projects/extensions/dist paths, env overrides
- [x] SQLite schema with WAL + prepared-statement helpers
- [x] `npm run typecheck` and `npm run build` green

## Phase 1 — Core data and API

- [x] Projects CRUD (create folder inside `project/`, list, delete)
- [x] Chats CRUD per project
- [x] Messages persistence with tool calls/results
- [x] Providers CRUD (API keys stored server-side, masked in responses)
- [x] Models CRUD (provider + model id)
- [x] Background agent runs with SSE event replay + abort/stop
- [x] Input validation and consistent error shape

## Phase 2 — Agent runtime

- [x] OpenAI-compatible chat-completions streaming client
- [x] Incremental content / reasoning / tool-call delta parsing
- [x] Agent loop: stream → execute tools → feed results → repeat
- [x] Max-step guard, abort handling, partial-message persistence
- [x] Automatic retry with backoff for transient provider failures
- [x] System prompt with project scope + tool rules
- [x] Context trimming (message count + character budget)
- [x] Built-in tools:
  - [x] `read_file`, `read_multiple_files`, `write_file`, `edit_file`, `apply_patch`, `append_file`
  - [x] `list_dir`, `tree`, `find_files` (filename search), `glob`, `grep`, `get_file_info`
  - [x] `create_dir`, `copy_file`, `delete_file`, `move_file`
  - [x] `run_shell` with path jail, command guard, timeout, output cap
  - [x] `update_plan` (writes/checks off `plan.md` in the project)
  - [x] `git_init`, `git_status`, `git_diff`, `git_log`, `git_branch`, `git_commit`, `git_push`, `git_pull`
- [x] Path jail: `..`, absolute paths, symlink escapes rejected
- [x] Shell guard: traversal, `~`, `$HOME`, private hosts, dangerous commands

## Phase 3 — Web UI

- [x] API client + shared types
- [x] Dark responsive shell with sidebar drawer on mobile
- [x] Project create/select/delete
- [x] Chat create/select/rename/delete
- [x] Message list with Markdown rendering
- [x] Live streaming assistant text + reasoning indicator
- [x] Tool activity cards (name, args, result, duration)
- [x] Composer with model picker, send, stop
- [x] Settings: providers/models add/delete, masked keys, provider presets + custom
- [x] Extensions panel: status, tools, reload

## Phase 4 — Extension system (the power feature)

- [x] Extension folder format: `extensions/<name>/extension.json`
- [x] Manifest validation (name, command, tools, permissions, timeout)
- [x] Lazy child-process host with newline-delimited JSON-RPC
- [x] Methods: `initialize`, `tools/list`, `tools/call`, `hook`
- [x] Tool namespacing (`ext_<name>_<tool>`) + JSON schema passthrough
- [~] Per-request timeout, crash handling, stderr logging, restart
      (timeout/crash/logging implemented; crash-restart path untested)
- [x] Project-scoped calls: extension gets project path, never API keys
- [x] Hooks: `project.open`, `agent.start`, `agent.finish`
- [x] Reload API + extension status in UI
- [x] `extensions/sdk.mjs` helper for writing extensions in Node
- [x] **No default extensions**: `extensions/` ships empty (only the SDK file);
      extensions are added later from outside
- [x] Opt-in examples in `examples/extensions/` (not loaded by the server):
  - [x] **web** (scaffold Vite/React, install, build, test,
        start/stop/status dev server)
  - [x] **minecraft** (Paper plugin scaffold, server lifecycle,
        mineflayer bot harness)
  - [x] **android** (Compose scaffold, Gradle build, adb install)
- [x] Mock-extension smoke test through the real agent loop (temp extension,
      never shipped)

## Phase 5 — Developer surfaces

- [ ] PTY terminal over WebSocket
- [x] Git tools: init/status/diff/log/branch/commit/push/pull (native `execFile`, no shell)
- [ ] MCP client (stdio + SSE) so existing MCP servers can be reused
- [ ] LSP diagnostics surfaced as tool results

## Phase 6 — Hardening and release

- [x] Path-jail and shell-guard tests (inside `npm run smoke`)
- [ ] Optional Docker jail (`KS_DOCKER_JAIL=1`)
- [~] Rate limits / request size limits (basic size caps exist)
- [x] Retry with backoff for transient provider failures
- [x] End-to-end smoke script (`npm run smoke`)
- [ ] README / extension authoring guide
- [ ] CI workflow for typecheck, build and smoke

---

## Current status

Working MVP is runnable:

```bash
npm run typecheck
npm run build
npm start            # http://localhost:8080
npm run smoke        # isolated end-to-end test (build first)
```

The smoke test verifies: health, project creation, path/shell guards, every
built-in file tool (name search, tree, glob, grep, list, info, plan, append,
copy, move, delete, unified-diff patch, shell), all native git tools (including
a real push/pull to a temp bare remote), provider key masking, the streaming
agent loop, a real built-in tool (`write_file`), provider retry recovery, the
extension host calling a temporary mock extension, background runs with event
replay, stop/abort handling, persistence, extension discovery with **no default
extensions**, opt-in Minecraft/Android example scaffolds, and static UI serving.

## Progress log

- 2026-10-29: Fresh implementation started at repo root. `old/` is kept only as
  reference; nothing in it is imported by the new code.
- 2026-10-29: Phases 0–4 MVP implemented. `npm run typecheck`, `npm run build`
  and `npm run smoke` all pass, including the stop/abort path.
- 2026-10-29: Removed bundled extensions from the default load path. The server
  now starts with zero extensions; web/Minecraft/Android examples live in
  `examples/extensions/` and are copied into `extensions/` only when wanted.
- 2026-10-29: Agent runs now continue in the background when the UI switches
  chats; events replay on reconnect. Transient provider failures retry with
  exponential backoff.
- 2026-10-29: Expanded the built-in toolset with filename search (`find_files`),
  `tree`, `read_multiple_files`, `create_dir`, `copy_file`, `append_file`,
  `apply_patch`, and native git tools (`git_init/status/diff/log/branch/commit/
  push/pull`). The smoke test now exercises every one of them, including a real
  push/pull against a temp bare remote. Next: Docker jail, PTY, MCP/LSP.
- 2026-10-29: Provider add flow now starts with a preset picker (OpenAI, Google
  Gemini, NVIDIA NIM, DeepSeek, OpenRouter, Groq, Mistral, xAI, Together,
  Fireworks, Cerebras, Moonshot, Ollama, LM Studio) plus a Custom option that
  starts with empty fields. Selecting a preset prefills name and base URL.
- 2026-10-29: The Steps popover now mirrors the AI's `update_plan` checklist
  instead of the agent loop or individual tool calls. It shows all planned
  phases with gray pending, yellow running and green complete dots. Agents can
  explore first and plan later, or plan immediately; plans are high-level phases
  such as explore, reproduce, fix, test and verify.
- 2026-10-29: Stopped and error runs now expose a Continue action in the task
  report (and error banner). It focuses the composer so the user can add
  instructions and resume from the current chat context.
