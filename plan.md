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
- [x] Automatic context compaction into a persisted, editable handoff summary
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
- [x] Per-output footer: copy, provider/model, and time taken
- [x] Run reports stay attached to their own output in chat history
- [x] Composer with model picker, send, stop
- [x] Chat header context meter and editable/removable conversation summary card
- [x] Chat tools menu left of the model picker: per-chat skill/knowledge/MCP/LSP toggles
- [x] Settings: providers/models add/delete, masked keys, provider presets + custom, configurable retry tab
- [x] Provider error cards with HTTP status/code/message and live retry countdown
- [x] Extensions panel: status, tools, reload, project scope in add forms

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
- [x] Skills: `SKILL.md` discovery, agent prompt index, `use_skill` tool, reload API/UI
- [x] MCP client (stdio + Streamable HTTP + legacy SSE) so existing MCP servers can be reused
- [x] LSP diagnostics surfaced as `lsp_diagnostics` tool results
- [x] Skills / MCP / LSP panels in the Extensions modal (status, tools, reload)
- [x] Project-scoped skills / MCP / LSP (all projects or a selected subset)
- [x] Per-chat enable/disable toggles for project-enabled skills / knowledge / MCP / LSP
- [x] Knowledge: editable user/project entries, scan-generated project summaries with optional model, prompt injection

## Phase 6 — Hardening and release

- [x] Path-jail and shell-guard tests (inside `npm run smoke`)
- [ ] Optional Docker jail (`KS_DOCKER_JAIL=1`)
- [~] Rate limits / request size limits (basic size caps exist)
- [x] Configurable retry: on/off, limited/unlimited, backoff, status codes, network/5xx, Retry-After
- [x] End-to-end smoke script (`npm run smoke`)
- [ ] README / extension authoring guide
- [ ] CI workflow for typecheck, build and smoke

---

## How Skills, Knowledge, MCP and LSP work

All four surfaces feed the same agent loop next to built-in tools and
extensions. They are independent and visible in the Extensions modal; skills,
MCP and LSP are project-scoped at call time. MCP and LSP never receive provider
API keys.

| Surface | Discovery | Runtime | Agent-facing tool | API / UI |
| --- | --- | --- | --- | --- |
| **Skills** | `.ks-agent/skills/<name>/SKILL.md` (primary), `skills/` (legacy), `.opencode/skills/` (fallback), or `KS_SKILLS_DIR`; frontmatter `projects` sets scope | Markdown + YAML frontmatter (`name`, `description`, `projects`) parsed at startup/reload; body is returned on demand | `use_skill({ name })` | `GET/POST /api/skills`, `DELETE /api/skills/:name`, `POST /api/skills/reload`; Skills tab with project scope |
| **MCP** | `.ks-agent/mcp.json` (`mcpServers`, optional per-server `projects`) or `KS_MCP_CONFIG` | stdio child (newline JSON-RPC) or HTTP (Streamable HTTP / legacy SSE) with `initialize` → `notifications/initialized` → paginated `tools/list`; lazy start, restarted on reload | `mcp_<server>_<tool>` | `GET/POST /api/mcp`, `DELETE /api/mcp/:name`, `POST /api/mcp/reload`; MCP tab with project scope |
| **LSP** | `.ks-agent/lsp.json` (`languageServers`, optional per-server `projects`) or `KS_LSP_CONFIG` | Spawned on first diagnostic request for a matching extension; LSP `Content-Length` framing, `initialize`, `didOpen` / `didChange`, then wait for `textDocument/publishDiagnostics` | `lsp_diagnostics({ path })` | `GET/POST /api/lsp`, `DELETE /api/lsp/:name`, `POST /api/lsp/:name/install`, `POST /api/lsp/reload`; LSP tab with project scope, install commands and auto-install |
| **Knowledge** | SQLite `knowledge` table; global rows apply to every project, project rows use `project_id` | Editable Markdown notes; project summaries scan the tree and key config files, optionally with a model, then fall back to a deterministic scan summary | Injected into the system prompt (no tool) | `GET/POST /api/knowledge`, `GET/POST /api/projects/:id/knowledge`, `PATCH/PUT/DELETE /api/knowledge/:id`, `POST /api/projects/:id/knowledge/summary` (or `/generate`); Knowledge tab with global/project sections, edit, toggle, delete and generate |

### Lifecycle

1. **Discover** — on server start (and on explicit reload) the registry reads
   its config, validates names, and reports invalid entries with an error
   instead of crashing the server.
2. **Advertise** — the system prompt includes an authoritative chat-selection
   block with every configured skill/knowledge/MCP/LSP, its project scope, chat
   toggle and runtime availability, plus the enabled-only sections. Tool definitions
   only include project-enabled, chat-enabled and usable items (missing LSP
   binaries are excluded) for every provider request.
3. **Start lazily** — MCP servers warm up in the background (and are awaited
   once per agent run); language servers start only when a file with a matching
   extension needs diagnostics. Failures are captured per server.
4. **Call** — tools run inside the active project: MCP receives the JSON
   arguments from the model, LSP reads the file through the project path jail.
   Project scope and chat toggles are enforced again at execution time, so a
   scoped-out or disabled item cannot be called.
5. **Shutdown/reload** — SIGINT/SIGTERM stops every MCP/LSP child; reload
   stops old children, re-reads config, then restarts MCP connections.

The Extensions modal can add and delete skills, MCP servers and language
servers, and manages knowledge entries in its own tab. Adds and deletes
write to the `.ks-agent/` files (or the active env override) and hot-reload the
registry, so changes apply without a server restart. Skills found only in a
fallback folder are shown as read-only; create a same-named skill in
`.ks-agent/skills` to override it. `/api/health` reports the discovered counts
as `skills`, `mcpServers` and `lspServers`.

### Project scope and per-chat toggles

Every skill, MCP server and language server carries a `projects` list. An empty
list means **all projects**; otherwise the item is enabled only for the listed
project ids. The add forms in the Extensions modal have an "All projects" box
plus one checkbox per project, and every card shows its scope.

- Skills persist scope in frontmatter: `projects: all` or
  `projects: id1, id2`.
- MCP and LSP persist it as a `projects` array on the JSON entry.
- The server filters the system prompt, tool definitions and execution by the
  active project, so a scoped-out item is neither advertised nor callable.
- Each chat can additionally disable any project-enabled item without touching
  the project config. Only disabled rows are stored, in
  `chat_disabled_extensions(chat_id, kind, name)` where `kind` is
  `skill`, `knowledge`, `mcp` or `lsp`. Missing rows mean enabled, so new chats
  and new items default to on.
- `GET /api/chats/:id/extensions` returns only items enabled for the chat's
  project, each with an `enabled` flag for the chat.
- `PATCH /api/chats/:id/extensions` with
  `{ "kind": "skill" | "knowledge" | "mcp" | "lsp", "name": "...", "enabled": false }`
  writes or removes the disabled row.
- The composer's **Tools** menu, immediately left of the model picker, lists
  only project-enabled items grouped into Skills / Knowledge / MCP servers /
  Language servers. Checking or unchecking an item toggles it for the current chat; the
  trigger shows the active/total count and turns red when an enabled item is
  unavailable. Rapid toggles and chat switches cannot apply another chat's
  state.
- The agent's system prompt contains an authoritative **Chat tool selection**
  block with every configured skill/knowledge/MCP/LSP, its project scope, chat toggle and
  runtime availability (including missing binaries), so a status question can
  be answered without probing. The `list_chat_extensions` tool returns the same
  report for a mid-run refresh.
- The Tools menu and agent report mark language servers whose binary is missing
  or failed to start as unavailable. Commands are checked on `PATH` before
  first use, unavailable servers are not exposed as `lsp_diagnostics` targets,
  and a diagnostics call returns a clear `unavailable: Command not found`
  result instead of spawning and failing with `ENOENT`.

### Agent config layout

```
.ks-agent/
├── skills/            # one folder per skill, each with SKILL.md
│   ├── code-review/
│   ├── debugging/
│   ├── frontend/
│   └── ...
├── mcp.json           # MCP servers (mcpServers)
└── lsp.json           # language servers (languageServers)
```

The initial skills are copied from `.opencode/skills/`. `.ks-agent/skills`
takes priority; the legacy `skills/` and `.opencode/skills/` folders are still
scanned as fallbacks.

### Skill format

```markdown
---
name: debugging
description: Use when debugging or reproducing an error
projects: all
---

# Debugging
Step-by-step workflow the agent must follow.
```

`projects: all` (or omitting the line) enables the skill everywhere; use
`projects: id1, id2` to restrict it. The add form writes this line
automatically.

### MCP format

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path"]
    },
    "remote": {
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ..." },
      "projects": ["project-id"]
    }
  }
}
```

`transport` may be `stdio`, `http` (Streamable HTTP) or `sse`; it is inferred
from `command`/`url` when omitted. Omitting `projects` (or using an empty array)
enables the server for all projects.

### LSP format

```json
{
  "languageServers": {
    "typescript": {
      "command": "typescript-language-server",
      "args": ["--stdio"],
      "extensions": [".ts", ".tsx", ".js"],
      "languageId": "typescript",
      "projects": ["project-id"]
    }
  }
}
```

Omitting `projects` (or using an empty array) enables the server for all
projects.

Diagnostics are returned as `file:line:column severity: message (code) [source]`.
Only diagnostics for the requested file are waited on; a server that reports
nothing within the timeout returns an explicit "no diagnostics reported" result.

### Security boundaries

- Skills are read-only instructions; they cannot execute commands by themselves.
- MCP and LSP processes are started from explicit local config (trusted by the
  operator). MCP receives only tool arguments and no provider credentials.
- LSP reads files through the same path jail as built-in tools.
- Extension isolation is unchanged: one child process per extension, project
  path only, no API keys.

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
extension host calling a temporary mock extension, skills discovery +
`use_skill`, MCP tool calls over stdio, Streamable HTTP and legacy SSE, LSP
diagnostics over `didOpen` and `didChange` from a mock language server,
project-scoped skill/MCP/LSP creation and filtering, knowledge CRUD and
generated project summaries, per-chat extension disables (including blocked tool calls, unusable-tool filtering, unavailable
binary reporting, the authoritative prompt selection block, the
`list_chat_extensions` report and re-enabling), background runs with event
replay, stop/abort handling, persistence (including assistant
model/duration metadata), extension discovery with **no default extensions**,
opt-in Minecraft/Android example scaffolds, and static UI serving.

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
- 2026-10-29: New chats now get a concise title automatically from the first
  prompt. The title is cleaned and shortened server-side and returned with the
  run start response so the sidebar updates immediately. Smoke covers it.
- 2026-10-29: Task reports now label the run with the AI's plan title (or the
  first meaningful sentence of its final answer) instead of repeating the raw
  user prompt. The original prompt remains the fallback.
- 2026-10-29: The Extensions modal now uses the same fixed-height layout as
  Settings and has tabs for Extensions, Skills, MCP and LSP. Extension reload
  stays scoped to the Extensions tab; the other tabs show empty states.
- 2026-10-29: Skills, MCP and LSP are now fully wired. Skills are discovered
  from `skills/` and `.opencode/skills` (folder `SKILL.md` with frontmatter),
  indexed in the system prompt and loaded with `use_skill`. MCP supports stdio,
  Streamable HTTP and legacy SSE servers from `mcp.json`, exposing
  `mcp_<server>_<tool>` tools. LSP spawns configured language servers from
  `lsp.json` on demand and returns diagnostics through `lsp_diagnostics`.
  All three have reload APIs and status/tool panels in the Extensions modal.
  Smoke exercises skills, all three MCP transports (stdio, Streamable HTTP,
  legacy SSE) and LSP didOpen/didChange against temporary mock servers.
- 2026-10-29: Added the repo-root `.ks-agent/` config folder. All eight
  `.opencode/skills` were copied into `.ks-agent/skills`; `mcp.json` and
  `lsp.json` moved into `.ks-agent/`. The server now reads `.ks-agent/skills`,
  `.ks-agent/mcp.json` and `.ks-agent/lsp.json` by default (legacy skill folders
  remain fallbacks; env overrides unchanged).
- 2026-10-29: Finished extension management in the web UI. The Skills, MCP and
  LSP tabs now expose Add forms and Delete actions backed by the create/delete
  APIs, with confirmation before deletion. Skills report `writable` so fallback
  skills stay read-only until overridden. The smoke test now also creates and
  deletes a skill, an MCP server and a language server, asserting both the API
  responses and the persisted config files.
- 2026-10-29: Added project scoping for skills, MCP servers and language
  servers. Every entry carries `projects` (empty = all); the add forms have an
  All projects / per-project selector and cards show their scope. The system
  prompt, tool definitions and tool execution all filter by the active project.
  Each chat can also disable project-enabled items from a Tools menu left of
  the model picker; only disabled rows are stored in
  `chat_disabled_extensions`, and `GET/PATCH /api/chats/:id/extensions` backs
  the menu. Smoke now creates scoped skill/MCP/LSP entries, asserts filtering
  per project and chat, verifies disabled calls are blocked, and re-enables
  them.
- 2026-10-29: Run reports are now tied to their own run and stay directly under
  that output instead of being a single report at the bottom of the chat, so
  sending another prompt no longer moves or replaces the previous report.
  Assistant messages persist their model id and duration and show an
  opencode-style footer with Copy, provider · model, and time taken. Existing
  SQLite databases are migrated automatically with the new `model_id` and
  `duration_ms` message columns; smoke asserts both fields round-trip.
- 2026-10-29: Made per-chat skill/MCP/LSP selection fully visible to the agent.
  Added the `list_chat_extensions` tool, which reports all configured items
  with project scope, chat enabled/disabled state and LSP/MCP runtime
  availability (for example a missing `pyright-langserver`). The agent is
  instructed to call it when asked to check the selection instead of repeating
  stale counts. The Tools menu now flags unavailable language servers, missing
  binaries are detected from `PATH` before first use, and smoke asserts
  disabled items disappear from the system prompt and tool definitions while
  the status tool still reports them.
- 2026-10-29: Made the per-chat selection reliable end to end. The agent system
  prompt now embeds the authoritative selection block (configured, enabled and
  usable counts plus each item's project/chat/availability state), so "check
  what is enabled" no longer depends on the model choosing to call a tool or
  probing each extension. Missing-binary language servers are excluded from
  `lsp_diagnostics` exposure and return `unavailable: Command not found`
  instead of an `ENOENT` spawn failure; disabled items remain callable-blocked.
  The Tools menu warns when enabled items are unavailable, and a request
  sequence guard prevents a stale chat fetch from overwriting the active
  chat's toggles after fast switching. Smoke covers the prompt block,
  unavailable-binary tool filtering and error text.
- 2026-10-29: Added a Retry tab to Settings backed by `GET/PUT /api/settings/retry` and the SQLite `settings` table. Retry can be disabled, limited (0–100 retries) or unlimited, with initial/max delay, multiplier, jitter, network/timeout and 5xx toggles, additional retryable status codes, and Retry-After support. The agent reads the settings on every run and emits `retry` events with the status, provider code, message, attempt, delay and next timestamp. The chat now replaces the Thinking indicator with a live retry card (`HTTP 429`, attempt count, countdown, provider message) and, when retries are exhausted, an inline failure card showing the HTTP status, provider code, message, total attempts and expandable response details. Smoke covers defaults/validation, structured 400 errors, disabled retry, limited retry and unlimited retry.
- 2026-10-29: Added optional `installCommand` metadata to LSP servers. The Add
  language server form now has quick presets for TypeScript, Python, Go and Rust
  that fill the config and show the matching install command, plus an optional
  install command field. Language server cards display the install command with
  a Copy button, `.ks-agent/lsp.json` entries for the bundled servers include
  one, and smoke asserts the value round-trips through the API and config file.
- 2026-10-29: Language server cards now have an Install button next to Delete
  that runs the server's `installCommand` (POST `/api/lsp/:name/install`) and
  refreshes status, with failures shown in the modal. The Add language server
  form has an "Install automatically after adding" checkbox (enabled once an
  install command is present), and smoke covers successful and failed installs.
- 2026-10-29: Added a context-usage meter to the chat header. Models now store a
  `contextWindow` (default 128,000 tokens, editable in Settings and when adding
  a model; existing databases migrate automatically). The header shows estimated
  used/window tokens and a percentage, colored green below 60%, yellow from 60%
  and red from 85%. Smoke covers the default, custom and invalid context window.
- 2026-10-29: Added automatic context-window compaction. At 80% of the selected
  model's context window, the agent summarizes the oldest message groups into a
  persisted handoff summary (`## Objective`, `## Important Details`,
  `## Work State`, `## Next Move`, `## Relevant Files`), groups assistant tool
  calls with their tool results, stops sending covered messages, and continues
  with the summary plus recent history. Summaries merge incrementally, are
  exposed through `GET/PUT/DELETE /api/chats/:id/summary` and
  `summary_start`/`summary`/`summary_error` SSE events, and can be edited or
  removed from the chat. Failed summary calls fall back to `trimHistory`; the
  context meter accounts for the cutoff. Smoke covers compaction, cutoff
  filtering, persisted summaries and the summary API.
- 2026-10-29: Added SQLite-backed knowledge with two distinct scopes. User
  knowledge applies to every project; project knowledge is scoped to one
  project and can be written manually or generated by scanning the project
  tree, key config files and README with an optional model (deterministic scan
  fallback when no model is available). Entries are editable, enable/disable
  globally, and toggle per chat through the existing disabled-extension store.
  Enabled knowledge is injected into the system prompt with size caps; the
  Extensions modal has a Knowledge tab for global/project lists, generation,
  editing and deletion. Smoke covers CRUD, scoping, generated-summary reuse,
  per-chat toggles and prompt injection/removal.
- 2026-10-29: Added edit flows across the UI and full MCP install support.
  Providers and models can be edited in place (including replacing or clearing
  a saved provider key), chats expose a title + model editor from both the
  sidebar ⋮ menu and the chat header, and Skills, MCP servers and language
  servers are editable from the Extensions modal. Renaming a skill updates its
  frontmatter and safely moves either the folder-style `SKILL.md` or a flat
  `<name>.md` file, rejecting conflicts with 409. MCP servers gained LSP-style
  `installCommand`/`cwd` metadata, an Install button, an auto-install-on-add
  option and a Background install action backed by
  `POST /api/mcp/:name/install` with `{"background":true}`. Project summary
  generation now supports `{"background":true}` (`202` job) and
  `GET /api/projects/:id/knowledge/summary/status`; the Knowledge panel polls
  the job and reconnects on reopen, so leaving the panel does not cancel it.
  Smoke covers provider/model/chat edits, skill folder + flat-file renames and
  conflicts, MCP foreground/background installs and install-command edits, LSP
  edits, and background knowledge jobs.
- 2026-10-31: Added a live web-app preview window. The new `preview_app` tool
  and `GET/POST /api/projects/:id/preview[...]` routes auto-detect
  npm/pnpm/yarn/bun dev scripts, frameworks (Vite, Next, Astro, Nuxt,
  SvelteKit, Angular, CRA, Vue CLI, Express, Django, static Python) and
  subfolders such as `frontend/`, start the dev server, wait for the port and
  serve it through an ephemeral same-host reverse proxy for HTTP and HMR
  WebSockets (frame-blocking headers are stripped). The UI adds a Preview
  button and a movable/resizable window with minimize, maximize, close, live
  logs, start/stop/detach and an in-window prompt bar that sends to the active
  chat while the preview updates live. Opening an already-running port attaches
  instead of spawning a duplicate server.
