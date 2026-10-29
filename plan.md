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

- [ ] `plan.md` written and kept up to date (this file)
- [ ] `package.json` with dev/build/typecheck/start/smoke scripts
- [ ] Root + server `tsconfig.json`, `vite.config.ts`, `web/index.html`
- [ ] `.gitignore` covers `node_modules`, builds, storage, logs, local data
- [ ] Server skeleton: Hono app, health route, JSON errors, static serving
- [ ] Config module: root/data/projects/extensions/dist paths, env overrides
- [ ] SQLite schema with WAL + prepared-statement helpers
- [ ] `npm run typecheck` and `npm run build` green

## Phase 1 — Core data and API

- [ ] Projects CRUD (create folder inside `project/`, list, delete)
- [ ] Chats CRUD per project
- [ ] Messages persistence with tool calls/results
- [ ] Providers CRUD (API keys stored server-side, masked in responses)
- [ ] Models CRUD (provider + model id)
- [ ] SSE streaming endpoint with abort/stop
- [ ] Input validation and consistent error shape

## Phase 2 — Agent runtime

- [ ] OpenAI-compatible chat-completions streaming client
- [ ] Incremental content / reasoning / tool-call delta parsing
- [ ] Agent loop: stream → execute tools → feed results → repeat
- [ ] Max-step guard, abort handling, partial-message persistence
- [ ] System prompt with project scope + tool rules
- [ ] Context trimming (message count + character budget)
- [ ] Built-in tools:
  - [ ] `read_file`, `write_file`, `edit_file`
  - [ ] `list_dir`, `glob`, `grep`, `get_file_info`
  - [ ] `delete_file`, `move_file`
  - [ ] `run_shell` with path jail, command guard, timeout, output cap
  - [ ] `update_plan` (writes/checks off `plan.md` in the project)
- [ ] Path jail: `..`, absolute paths, symlink escapes rejected
- [ ] Shell guard: traversal, `~`, `$HOME`, private hosts, dangerous commands

## Phase 3 — Web UI

- [ ] API client + shared types
- [ ] Dark responsive shell with sidebar drawer on mobile
- [ ] Project create/select/delete
- [ ] Chat create/select/rename/delete
- [ ] Message list with Markdown rendering
- [ ] Live streaming assistant text + reasoning indicator
- [ ] Tool activity cards (name, args, result, duration)
- [ ] Composer with model picker, send, stop
- [ ] Settings: providers/models add/delete, masked keys
- [ ] Extensions panel: status, tools, reload

## Phase 4 — Extension system (the power feature)

- [ ] Extension folder format: `extensions/<name>/extension.json`
- [ ] Manifest validation (name, command, tools, permissions, timeout)
- [ ] Lazy child-process host with newline-delimited JSON-RPC
- [ ] Methods: `initialize`, `tools/list`, `tools/call`, `hook`
- [ ] Tool namespacing (`ext_<name>_<tool>`) + JSON schema passthrough
- [ ] Per-request timeout, crash handling, stderr logging, restart
- [ ] Project-scoped calls: extension gets project path, never API keys
- [ ] Hooks: `project.open`, `agent.start`, `agent.finish`
- [ ] Reload API + extension status in UI
- [ ] `extensions/sdk.mjs` helper for writing extensions in Node
- [ ] Example extension: **web** (scaffold Vite/React, install, build, test)
- [ ] Example extension: **minecraft** (Paper plugin scaffold, server lifecycle,
      mineflayer bot harness)
- [ ] Example extension: **android** (Compose scaffold, Gradle build, adb install)
- [ ] Mock-extension smoke test through the real agent loop

## Phase 5 — Developer surfaces

- [ ] PTY terminal over WebSocket
- [ ] Git status/diff/log/commit tools
- [ ] MCP client (stdio + SSE) so existing MCP servers can be reused
- [ ] LSP diagnostics surfaced as tool results

## Phase 6 — Hardening and release

- [ ] Path-jail and shell-guard test suite
- [ ] Optional Docker jail (`KS_DOCKER_JAIL=1`)
- [ ] Rate limits / request size limits
- [ ] Retry with backoff for transient provider failures
- [ ] End-to-end smoke script (`npm run smoke`)
- [ ] README / extension authoring guide
- [ ] CI workflow: typecheck, build, smoke

---

## Progress log

- 2026-10-29: Fresh implementation started at repo root. `old/` is kept only as
  reference; nothing in it is imported by the new code.
