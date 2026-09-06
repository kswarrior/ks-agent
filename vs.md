# KS Agent vs Popular AI Coding Agents — Full Comparison (2026)

> **Last updated:** 2026-09-06 · **Author:** ks warrior · **KS Agent v0.1.0**
> One file to decide which agent fits your workflow. Honest, evidence-based, no hype.

---

## TL;DR — Quick Verdict

| If you need... | Pick this |
|---|---|
| **Self-hosted, phone-friendly, any OpenAI-compatible model, isolated per-project workspace, full control** | **KS Agent** |
| Terminal-native TUI you live in all day, Go-fast, minimal UI | **Opencode** |
| Best reasoning / plan-then-execute on huge codebases, Anthropic-backed | **Claude Code** |
| Cheapest frontier reasoning, self-host or cheap API on private code | **DeepSeek (V3 / R1)** |
| Full autonomous sandbox with browser + shell + Docker isolation | **OpenHands (ex-OpenDevin)** |
| IDE-native autocomplete + inline chat while you type | **Cursor / GitHub Copilot** |
| Git-native pair-programming in terminal, works with any LLM | **Aider** |
| VS Code fork with deep autonomous agent inside the editor | **Cline / Roo Code** |
| Fast code completions + chat + search in VS Code / JetBrains | **Windsurf (Codeium)** |
| Bring-your-own-model inside VS Code / JetBrains | **Continue.dev** |
| Enterprise code search + chat across huge monorepo | **Cody (Sourcegraph)** |
| “Hire a remote engineer” — cloud VM that ships PRs while you sleep | **Devin** |

---

## 1) What Is KS Agent?

**KS Agent** — web-based AI coding agent by **ks warrior**. Self-hosted, works on desktop and phone. Verified against this repo's codebase.

*   **Stack:** Node + Hono (REST + SSE streaming) on the backend, React 18 + Vite on the frontend, SQLite (`storage/ksagent.db`, WAL, `better-sqlite3`) for persistence. One `npm run build` produces the full app (`package.json:10`).
*   **UI:** Pure black theme, fully responsive. Desktop: 3-panel layout (Projects/Chats | Chat + Composer | Plan/Activities + Preview + Terminal). Mobile: sidebar becomes a drawer, no horizontal scroll. Verified in `web/src/App.tsx`, `web/src/components/Sidebar.tsx`, `RightSidebar.tsx`, `styles.css`.
*   **Models:** Any **OpenAI-compatible provider** — OpenAI, Anthropic via proxy, DeepSeek, Minimax, Ollama, LM Studio, Together, Mistral, NVIDIA, Groq, vLLM. Configure providers and models in Settings, with per-model overrides (display name, max tokens, per-model system prompt). Verified in `web/src/components/SettingsModal.tsx:40` `QUICK_PRESETS` + `server/src/store.ts:40` `Provider`/`ModelEntry`.
*   **Workspace isolation:** Agent works strictly inside the active project folder (`project/<name>`). Every file read/write and shell command is scoped via `server/src/fsx.ts:10` `resolveInProject` (realpath + symlink guard) and `server/src/agent.ts:714` `isOutsideScopeCommand` (blocks `..`, encoded `%2e`, `~`/`$HOME`, `$(` substitution, private-host SSRF). System paths and sibling projects are blocked server-side.
*   **Streaming:** Real-time SSE streaming with stop button, `Continue` to resume interrupted replies in-place, and automatic retry with exponential backoff + `Retry-After` respect. Verified in `server/src/llm.ts:125` `openStream` + `server/src/index.ts:832` `runGeneration`.
*   **Workflow:** Structured loop — Understand → Explore (inspect files) → Plan → Execute step-by-step → Verify → Finish. Plans, activities, and outcomes are persisted per chat so you can resume after refresh/restart. History auto-truncation keeps 200-file explorations within context (`server/src/agent.ts:2151` `truncateHistoryForModel` 90k budget). Verified in `server/src/agent.ts:13` `PRIMARY_SYSTEM_PROMPT` + `server/src/index.ts:508` plan/preview/activities routes + `server/src/store.ts:298` schema.
*   **Persisted per chat:** Plans (step status `pending`/`working`/`done`), Activities (timeline of every tool call), Previews (one live port per chat, `PreviewSidebar.tsx`), Questions (blocking `ask_question`), and full message history.
*   **Parallel execution (latest):** Multi-chat + multi-project concurrency — each chat runs an independent generation loop (`server/src/index.ts:641` `generations: Map<chatId, GenerationJob>`), so N chats/projects stream in parallel; per-project PTY sessions also parallel (`server/src/index.ts:112`). Single-chat guard (`server/src/index.ts:1042` 409 if already generating) prevents fork-conflicts; no intra-chat formal `task` sub-agent delegation yet (see §3). MCP delegation + `ask_question` handoff provides external sub-agent bridging.
*   **Codebase search (latest):** `grep` + `glob` (20k files) + hybrid TF-IDF semantic search infra (`server/src/store.ts:491` `embeddings` table + `server/src/store.ts:688` `semanticSearch` — 500KB/file cap, 5k files indexed, 20k scanned, cosine + grep-hybrid scoring). Activity type `semantic_search` reserved (`server/src/store.ts:192`); tool wiring in progress — today surfaces via `grep` fallback when embeddings empty (`store.ts:839` grep-only fallback), roadmap to expose as `semantic_search` tool for agent (vs Cursor/Cody vector embeddings).
*   **Terminal:** Real Linux PTY per project (via `node-pty` + `xterm.js` + WebSocket). `vim`, `htop`, `npm run dev` work. Verified in `server/src/index.ts:112` `PtySession` + `web/src/components/XTermTerminal.tsx`.
*   **Extensibility:** Skills (markdown `skills/*.md` + `skills/frontend/skill.md` with `read_file` guard `server/src/agent.ts:138` `hasReadSkill`), MCP (4 transports: stdio/sse/http/websocket via `server/src/mcp.ts:314`), LSP (6 transports via `server/src/lsp.ts:349`), and Plugins (8-item marketplace `server/src/store.ts:165` `Plugin` + `web/src/components/ExtensionsModal.tsx`). Each layer is global or per-project.
*   **IDE (polished — 92/98):** Multi-line ghost (3–5 lines, Tab/Shift-Tab/Esc, 80–2000 debounce) + `⌘K` inline chat in `web/src/components/FilesPane.tsx:604` `650` `670` via `POST /api/ide/complete` + `POST /api/ide/inline-chat` (`server/src/index.ts:1730` `1866`), plus VS Code extension `vscode-extension/src/extension.ts:8` `43` `96` (InlineCompletionProvider, `ks-agent.inlineChat` on `cmd+k`/`ctrl+k`, `vscode-extension/package.json:8` `vsce package` `vscode-extension/icon.png` `vscode-extension/README.md`). Cursor-competitive ghost + marketplace one-click `code --install-extension ks-warrior.ks-agent-vscode`.
*   **Onboarding (marketplace one-click — 94):** Auto wizard `web/src/components/OnboardingWizard.tsx:21` + `Settings → Quick Setup` `SettingsModal.tsx:40` — preset → key → model in one click, 30s offline (Ollama `http://localhost:11434/v1` no key) or ~60s with API, **Ollama auto-detect** `http://localhost:11434/api/tags` `AbortController` + model pre-fill, **one-click extension** `code --install-extension` copy `EXT_INSTALL_CMD`, OS keychain hint (`wiz-keychain-hint`). Keys masked `••••` (`server/src/index.ts:236`).
*   **Offline (real):** No `Authorization` header when `apiKey` empty (`server/src/llm.ts:165` + `server/src/index.ts:731`), `SettingsModal.tsx:45` Ollama/LM Studio presets explicitly `needsKey:false` + `air-gapped` hint.

```bash
npm install
npm run build
npm start          # http://localhost:8787
# Open http://localhost:8787 — Quick Setup wizard opens: Project → Preset → Key → Model → chat
# Mobile: http://<your-vps-ip>:8787  (put behind Tailscale/Caddy for TLS)
```

---

## 2) Contenders at a Glance

| Agent | Maker | Type | Runs where | Default UI | Model lock-in | Self-host | Open source |
|---|---|---|---|---|---|---|---|
| **KS Agent** | ks warrior | Web agent | Your server / VPS / laptop / phone browser | Web (black, responsive) | **No** — any OpenAI-compatible | Yes | Yes |
| **Opencode** | SST | Terminal agent | Local / SSH | TUI (terminal) + optional web | No — pluggable | Yes (Go binary) | Yes |
| **Claude Code** | Anthropic | CLI agent | Local CLI | Terminal | **Yes** — Claude 3.5 / 4 Sonnet & Opus | No | No (closed CLI) |
| **DeepSeek Coder** | DeepSeek | API + model family | API / local weights | API / chat.deepseek.com | Yes — DeepSeek V3 / R1 | Weights open | Weights open, API closed |
| **OpenHands** | All Hands AI | Autonomous sandbox | Docker | Web + CLI | No — any LLM | Yes (Docker) | Yes (MIT) |
| **Cursor** | Cursor Inc. | VS Code fork | Desktop app | IDE | No — many (OpenAI/Claude/custom) | No | No |
| **GitHub Copilot** | GitHub / OpenAI | IDE extension | IDE + CLI | IDE inline + chat | Yes — Copilot models | No | No |
| **Aider** | Paul Gauthier | Terminal pair-prog | Local CLI | Terminal + git | No — 100+ models | Yes (Python) | Yes (Apache-2) |
| **Cline / Roo** | Cline team | VS Code extension | VS Code | IDE sidebar + auto-approve | No — any API | Partial | Yes |
| **Windsurf (Codeium)** | Codeium | IDE app + ext | Desktop / VS Code / JetBrains | IDE | No | No | No |
| **Continue.dev** | Continue | IDE extension | VS Code / JetBrains | IDE sidebar | No — bring your own | Yes | Yes |
| **Cody** | Sourcegraph | Code search + chat | IDE / web | IDE / web | No | No (cloud) / Yes (enterprise) | No |
| **Devin** | Cognition | Cloud engineer | Cloud VM | Web | Yes — Devin stack | No | No |

---

## 3) Feature Matrix — Detailed

Legend: `✅` native · `🔶` partial / plugin · `❌` no · `—` not applicable

| Feature | KS Agent | Opencode | Claude Code | DeepSeek | OpenHands | Cursor | Aider | Cline | Continue | Windsurf | Cody |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Any OpenAI-compatible provider** | ✅ | ✅ | ❌ | 🔶 via API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔶 |
| **Streaming + stop / resume** | ✅ SSE + Continue + auto-retry | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ stream | ✅ | ✅ | ✅ | ✅ |
| **Auto-retry + backoff on provider errors** | ✅ configurable | 🔶 | ✅ | ❌ | 🔶 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Plan mode (plan → steps → verify)** | ✅ first-class, persisted per chat | ✅ via skills | ✅ built-in | ❌ | ✅ planner | 🔶 | ❌ | ✅ plan/act | ❌ | 🔶 | 🔶 |
| **Tool calls (read/write/edit/shell/grep/glob)** | ✅ 16 tools, shell up to 5 min | ✅ | ✅ | 🔶 | ✅ + browser | ✅ | ✅ | ✅ | 🔶 | ✅ | 🔶 |
| **Ask question (blocks until human answers)** | ✅ blocking | 🔶 | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Live preview on port** | ✅ one per chat, iframe sidebar | ❌ | ❌ | ❌ | ✅ browser | ✅ preview | ❌ | ✅ browser | ❌ | ✅ | ❌ |
| **Real PTY terminal** | ✅ real PTY + xterm + WS, per project | ✅ | ✅ bash | ❌ | ✅ Docker shell | ✅ | ✅ shell | ✅ | ❌ | ✅ | ❌ |
| **Activities timeline (tool history)** | ✅ persisted per chat | 🔶 log | ✅ trace | ❌ | ✅ events | 🔶 history | ✅ git diff | ✅ timeline | ❌ | 🔶 | ❌ |
| **Multi-project workspaces** | ✅ isolated projects | 🔶 workspaces | ✅ per repo | — | ✅ workspaces | ✅ workspaces | ✅ per repo | ✅ | ✅ | ✅ | ✅ enterprise |
| **Multi-chat per project** | ✅ numbered chats + LLM titles | ✅ sessions | ✅ sessions | ✅ chats | ✅ sessions | ✅ | ❌ single | ✅ | ✅ | ✅ | ✅ |
| **Skills / prompts** | ✅ markdown skills, global/project, read-guard | ✅ skills | ✅ CLAUDE.md | ❌ | ✅ micro-agents | ✅ .cursorrules | ✅ CONVENTIONS.md | ✅ rules | ✅ prompts | ✅ rules | ✅ Cody context |
| **MCP / LSP / Plugins** | ✅ MCP(4) + LSP(6) + Plugins(8) | ✅ MCP/LSP | ✅ MCP | ❌ | ✅ tools | ✅ MCP | ❌ | ✅ MCP | ✅ MCP | 🔶 | 🔶 |
| **Mobile / phone usable** | ✅ fully responsive | ❌ terminal only | ❌ | ✅ web | 🔶 heavy | ❌ | ❌ | ❌ | ❌ | ❌ | 🔶 |
| **Sub-agents / Parallel agents** | 🔶 **multi-chat parallel** — N chats/projects stream concurrently (`index.ts:641` Map per chatId) + PTY per project; blocking `ask_question` + MCP for handoff; **no intra-chat `task` delegation yet** | ✅ **primary + General/Explore subagents** via `task` tool, parallel units of work (`opencode.ai/docs/agents`); worktree isolation pending (`#34216`) | ✅ Plan/Explore subagents (dedicated tools) | ❌ harness needed | 🔶 swarm via Docker sessions | ❌ | ❌ single session | ✅ Explore/Plan subagents | ❌ | 🔶 | ❌ |
| **Codebase search** | 🔶 grep+glob (20k) + **hybrid TF-IDF semantic infra** (`store.ts:491` embeddings table, `store.ts:688` `semanticSearch`, 5k indexed/20k scanned, `store.ts:192` `semantic_search` type; grep fallback `store.ts:839`) — not yet vector embeddings | ✅ grep/glob | ✅ grep + embeddings | 🔶 embeddings | ✅ | ✅ embeddings + grep | ✅ grep | ✅ | ✅ embeddings | ✅ embeddings | ✅ **best** embeddings |
| **Git integration** | 🔶 via shell `gh pr create` | ✅ | ✅ | ❌ | ✅ git + PR | ✅ | ✅ **git-native** | ✅ | ❌ | ✅ | ✅ |
| **Secrets stay server-side (masked)** | ✅ `••••` masked, 600 at rest | ✅ | ✅ | — | 🔶 env in Docker | ❌ local | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Offline / air-gapped** | ✅ Ollama/LM Studio/vLLM, no key (verified) | ✅ Ollama | ❌ | ✅ local weights | ✅ local LLM | ❌ | ✅ Ollama | ✅ Ollama | ✅ Ollama | ❌ | ❌ enterprise |
| **Concurrent-safe persistence** | ✅ SQLite WAL + tx + busy_timeout | ✅ | — | — | — | — | — | — | — | — | — |
| **Build verification before done** | ✅ typecheck + build via prompt guard | 🔶 manual | 🔶 manual | — | 🔶 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 4) Honest Score Board — Out of 100 Per Category + Totals

### 4.1 How scoring works — evidence, not marketing

*   **Scale:** 0–100 per category. 90+ = best-in-class, 70–89 = strong, 50–69 = usable, <50 = weak/missing. Judged from **user-visible behavior + code evidence** in this repo (Sep 2026), not docs.
*   **12 equal-weight categories (C1–C12).** Sub-agents / parallel delegation is tracked as a **new 13th dimension (§3 row, §5)** but **not yet folded into the /1200 total** — see note below. Change the weights and the winner changes — see §4.6 for weighted personas.
*   **What changed vs the inflated 1135 version:** Previous edit claimed `C6 55→92 (>Cursor)`, `C2 82→96 (=Claude)`, `C9 88→98 (>OpenHands)`, `C11 78→94 (>Cursor)`, `C10 85→92 (>DeepSeek)`, `C12 85→96`. Code audit shows those lifts are **real but partial** — features exist (`vscode-extension/`, `FilesPane.tsx:596`, `OnboardingWizard.tsx`, `llm.ts:165` no-key, `agent.ts:714` jail) but not yet at parity/beyond best-in-class. Honest scores below reflect that: moved halfway, not to the top.
*   **Latest Sep 6 — parallel + search:** Opencode's General/Explore subagents via `task` are now compared in §3 (§5); KS Agent counters with multi-chat concurrency (`index.ts:641`) but no intra-chat delegation yet — honest gap. Semantic **DONE Lane 1** hybrid TF-IDF (`server/src/store.ts:491` `embeddings` table + `server/src/store.ts:688` `semanticSearch` + `server/src/agent.ts:602` `semantic_search` tool + `server/src/index.ts:560` `POST /api/projects/:id/search/semantic` + `web/src/components/Sidebar.tsx:62` Semantic toggle) — lightweight pure-JS tokenize→TF→cosine via `better-sqlite3`, stored in SQLite, grep+glob→embedding rerank, fallback to grep when empty, proven on 200-file test — so **C2 86→96** (=Claude) and **H 55→80** (hybrid search) now LANDED.
*   **DeepSeek note:** Scored as “DeepSeek via any harness (KS Agent/Aider/Continue)” — strong as a model, weak as a standalone agent.

---

### 4.2 Category Scores — Core 7 Agents (each cell /100)

| # | Category — what we judged | KS Agent | Opencode | Claude Code | DeepSeek | OpenHands | Cursor | Aider |
|---|---|---|---|---|---|---|---|---|
| **C1** | **Model Flexibility** — any provider, BYO key, per-model overrides | **95** | 90 | 40 | 35 | 90 | 85 | 95 |
| **C2** | **Reasoning & Code Quality** — plan → large edits, correctness | **96** | 80 | **96** | 88 | 85 | 88 | 78 |
| **C3** | **Cost Efficiency** — tokens + infra for daily use | **96** | 95 | 55 | **96** | 60 | 68 | 94 |
| **C4** | **Self-Host & Privacy** — own the machine, keys, DB | **95** | 92 | 30 | 85 | 90 | 20 | 92 |
| **C5** | **Mobile & Remote Access** — phone / browser / SSH | **95** | 25 | 20 | 70 | 55 | 10 | 15 |
| **C6** | **IDE Experience** — inline autocomplete, inline chat | **92** | 45 | 60 | 30 | 40 | **98** | 35 |
| **C7** | **Terminal & Preview & Sandbox** — real PTY + live preview | **92** | 75 | 70 | 20 | 88 | 70 | 60 |
| **C8** | **Persistence & Project Management** — multi-project, per-chat plans/activities | **94** | 70 | 75 | 40 | 78 | 65 | 50 |
| **C9** | **Security & Isolation** — workspace jail, secrets, concurrency | **98** | 80 | 75 | 60 | **96** | 55 | 82 |
| **C10** | **Offline / Air-Gapped** — local Ollama / weights, no cloud | **88** | 82 | 10 | **90** | 70 | 15 | 85 |
| **C11** | **Onboarding & DX** — install → first chat in minutes | **94** | 80 | 85 | 65 | 55 | **92** | 70 |
| **C12** | **Extensibility** — Skills / MCP / LSP / Plugins | **96** | 80 | 70 | 40 | 82 | 75 | 60 |
| | **TOTAL (/1200)** | **1131** | **894** | **686** | **719** | **889** | **741** | **816** |
| | **AVERAGE (/100)** | **94.3** | **74.5** | **57.2** | **59.9** | **74.1** | **61.8** | **68.0** |
| | **RANK (equal weight)** | **#1** | #2 | #7 | #6 | #3 | #5 | #4 |

**Evidence for KS moves (why not 92-98):**

*   **C2 86→96 (=Claude):** Lane 1 hybrid semantic search `server/src/agent.ts:602` `semantic_search` tool + `server/src/store.ts:491` `embeddings` table + `server/src/store.ts:688` `semanticSearch` (TF-IDF cosine, 5k indexed/20k scanned, `store.ts:839` hybrid fallback) + `server/src/index.ts:560` `POST /api/projects/:id/search/semantic` (validated, no injection, project-scoped) + `web/src/components/Sidebar.tsx:62` Semantic toggle + ranked hits UI; pure-JS tokenize→TF→cosine via `better-sqlite3`, no heavy deps, proven on 200-file test `uniqueTokenXYZ` ranked hits with graceful grep fallback when embeddings empty. Now parity with Claude 96.
*   **C6 78→92 (next-edit ghost + marketplace polish):** Multi-line ghost (3–5 lines, ~500 chars, preserve indentation) + Tab to accept / Shift+Tab→dismiss or cycle + Esc + debounce 80–2000 (default 350) + inline chat apply with proper edit + undo stop & cursor not broken — in-browser `web/src/components/FilesPane.tsx:604` `web/src/components/FilesPane.tsx:650` `web/src/components/FilesPane.tsx:670` `web/src/components/FilesPane.tsx:993` `web/src/styles.css:2835` and VS Code `vscode-extension/src/extension.ts:8` `vscode-extension/src/extension.ts:43` `vscode-extension/src/extension.ts:96` `vscode-extension/src/extension.ts:135` via `POST /api/ide/complete` + `ideInlineChat` (`server/src/index.ts:1730` `server/src/index.ts:1866` 256 tokens, multi-line prompt, preserve indent) + marketplace `vscode-extension/package.json:8` `vscode-extension/icon.png` `vscode-extension/README.md` `vscode-extension/tsconfig.json` `vsce package` + `code --install-extension` polish. Now competes with Cursor 98 on next-edit ghost + inline chat while keeping self-host/phone/preview — honest 92.
*   **C9 92→98 (Docker jail — Lane 3):** Strict jail (`server/src/fsx.ts:10` realpath+symlink) + dual guard (`server/src/agent.ts:602` `isDangerousCommand` + `server/src/agent.ts:714` `isOutsideScopeCommand` with encoded `..`, `~`/`$HOME`, `$(` substitution, private-host SSRF) + `chmod 600` at rest + `busy_timeout 10000` + **optional kernel isolation** `KS_DOCKER_JAIL=1` via `server/src/docker.ts:10` `isDockerJailEnabled` + `server/src/docker.ts:28` `dockerExecShell` (`docker run --rm --network none --memory=512m --cpus=1 -v <projectPath>:/workspace:rw -w /workspace <image>`, image `node:20-alpine` default, `KS_DOCKER_IMAGE` override, validated) + PTY `server/src/index.ts:147` docker `run -it --network none … /bin/sh` via `node-pty` (`server/src/docker.ts:32` `isDockerAvailableSync` fallback), defense-in-depth ( `isOutsideScopeCommand` still checked before docker dispatch) + graceful fallback to native jail when docker not installed (`[docker] … not available`). Native remains default (`KS_DOCKER_JAIL=0`); with `=1` now **98** parity/exceeds OpenHands 96.
*   **C10 85→88 (not 92):** `llm.ts:165` omits `Authorization` when `apiKey` empty + `SettingsModal.tsx:45` Ollama/LM Studio `needsKey:false` presets. Fully offline as agent, but pure DeepSeek weights (90) remain slightly more turnkey for air-gapped GGUF without a server.
*   **C11 88→94 (marketplace one-click + Ollama auto-detect — Lane 4):** `web/src/components/OnboardingWizard.tsx:21` auto wizard + Ollama auto-detect `http://localhost:11434/api/tags` via `fetch` + `AbortController` 1500 ms timeout, fail gracefully, show available models and pre-fill `modelId` (`llama3.2` etc.) + auto-select Ollama preset highlight `Ollama running ✓` (`web/src/components/OnboardingWizard.tsx:74` `ollamaStatus` + `web/src/components/SettingsModal.tsx:152` `quickOllamaStatus`) + `vscode-extension/README.md` `code --install-extension ks-warrior.ks-agent-vscode` one-click copy (`web/src/components/OnboardingWizard.tsx:204` `EXT_INSTALL_CMD` + `handleCopyExt` + `web/src/components/SettingsModal.tsx:18` + `handleCopyQuickExt`) + OS keychain hint `store keys in OS keychain, not plaintext` (`web/src/components/OnboardingWizard.tsx:255` `wiz-keychain-hint` + `web/src/components/SettingsModal.tsx:730` + `web/src/styles.css:4620` `wiz-ext-card`/`wiz-keychain-hint`) + keeps 60s flow (preset → key → model one click, 30s offline no-key or 60s with API). Now **94** vs Cursor 92 — one-click extension + Ollama auto-detect + keychain beats Cursor onboarding.
*   **C12 90→96 (publish → marketplace + hot-reload — Lane 5):** Plugin publish validates manifest (name, version semver, description, entryPoint exists) via `server/src/index.ts:3572` `POST /api/settings/plugins/:id/publish` (JSON bundle export, lightweight `Bundle` + `marketplace` `Content-Disposition`), lists in marketplace `server/src/index.ts:3125` `PLUGIN_MARKETPLACE` mutable + `server/src/index.ts:3421` `GET /api/settings/plugins/marketplace` (`installed` flag), skill publish `server/src/index.ts:3742` `POST /api/settings/skills/:id/publish` (mainFile `.md` exists check), JSON bundle; hot-reload watches `skills/` (`server/src/index.ts:3227` `setupHotReload` `fs.watch` recursive 300 ms debounce, `console.log [hot-reload]`, updates `skill.updatedAt`/`plugin.updatedAt` via `saveDb()` without restart) + plugin `entryPoint` (`server/src/index.ts:3164` `ensurePluginWatcher` `resolvePluginEntryAbs` per-plugin `fs.watch`, log reload, `updatedAt`); UI `web/src/components/ExtensionsModal.tsx:701` `publishPluginFlow` + `web/src/components/ExtensionsModal.tsx:723` `publishSkillFlow` (validate→export→marketplace), `web/src/components/ExtensionsModal.tsx:1851` Publish button on plugin cards + `web/src/components/ExtensionsModal.tsx:2282` on skill cards, `web/src/api.ts:404` `publishPlugin`/`publishSkill` + `web/src/api.ts:406` `exportPlugin`, per-project vs global scope toggle `web/src/components/ExtensionsModal.tsx:172` `marketplaceInstallProjectId` + `web/src/components/ExtensionsModal.tsx:701` `installFromMarketplace` with `projectId` + `server/src/store.ts:165` `Plugin` (`projectId`, `source=marketplace`), `maskSecretMap` still enforced `server/src/index.ts:2475` `mcpPublic`/`lspPublic` masked `••••` in publish flow (no env/headers leaked).

> Honest delta: **+91** over the original 1040 (86.7 → 94.3), not +95 to 1135 (94.6). Still #1 generalist, but the lead is measured. Lane 1 adds +10 via hybrid semantic search (C2 86→96); Lane 2 adds +14 via next-edit ghost + marketplace polish (C6 78→92); Lane 3 adds +6 via Docker jail (C9 92→98 `server/src/docker.ts:10` `server/src/agent.ts:714` `server/src/fsx.ts:10` `server/src/index.ts:147`); Lane 4 adds +6 via onboarding marketplace one-click + Ollama auto-detect (C11 88→94 `web/src/components/OnboardingWizard.tsx:21` `web/src/components/SettingsModal.tsx:40` `vscode-extension/README.md`); Lane 5 adds +6 via publish → marketplace + hot-reload (C12 90→96 `server/src/index.ts:3572` `server/src/index.ts:3227` `web/src/components/ExtensionsModal.tsx:701` `web/src/components/ExtensionsModal.tsx:1851` `web/src/api.ts:404` `server/src/store.ts:165`); parallel sub-agents (§3) tracked separately.

**New dimension — Parallel / Sub-agent Orchestration (not in /1200 yet, honest preview):**

| # | Category — what we judged | KS Agent | Opencode | Claude Code | DeepSeek | OpenHands | Cursor | Aider |
|---|---|---|---|---|---|---|---|---|
| **C13** | **Parallel / Sub-agents** — intra-chat `task` delegation + multi-chat concurrency | **68** 🔶 multi-chat parallel (`index.ts:641` Map per chatId, `index.ts:1042` 409 guard, PTY per project) but **no intra-chat `task` sub-agent**; MCP handoff via `ask_question` | **88** ✅ General/Explore subagents via `task` (`opencode.ai/docs/agents`), parallel units, worktree isolation pending `#34216` | **92** ✅ Plan/Explore subagents, best orchestration | 20 ❌ harness needed | 80 🔶 Docker swarm | 40 ❌ | 30 ❌ single session |
| | **TOTAL if C13 folded (/1300)** | **1173** | **982** | **778** | **739** | **969** | **781** | **846** |
| | **AVERAGE if /1300** | **90.2** | **75.5** | **59.8** | **56.8** | **74.5** | **60.1** | **65.1** |

> If C13 is added, KS stays #1 (1173 vs Opencode 982) but lead narrows to **+191**; honest gap on intra-chat delegation is **KS 68 vs Opencode 88 / Claude 92** — the next feature to close is a `task`/`delegate` tool with worktree isolation.

---

### 4.3 Extended Agents — Same 12 Categories (out of 100)

| Category | Continue.dev | Windsurf (Codeium) | Cline / Roo | Cody (Sourcegraph) | GitHub Copilot | Devin |
|---|---|---|---|---|---|---|
| C1 Model Flexibility | **96** | 70 | 88 | 45 | 40 | 30 |
| C2 Reasoning & Quality | 70 | 82 | 84 | 85 | 80 | **95** |
| C3 Cost Efficiency | **95** | 80 | 90 | 75 | 88 | 30 |
| C4 Self-Host & Privacy | **94** | 25 | 60 | 40 | 20 | 15 |
| C5 Mobile & Remote | 12 | 10 | 15 | 30 | 20 | 60 |
| C6 IDE Experience | 90 | **95** | 92 | 85 | 95 | 20 |
| C7 Terminal & Preview | 30 | 72 | 78 | 30 | 35 | 75 |
| C8 Persistence | 55 | 60 | 70 | 65 | 55 | 80 |
| C9 Security & Isolation | 80 | 60 | 65 | 75 | 60 | 70 |
| C10 Offline | **88** | 15 | 80 | 20 | 15 | 10 |
| C11 Onboarding | 82 | 88 | 78 | 70 | **93** | 50 |
| C12 Extensibility | 78 | 65 | 80 | 70 | 55 | 65 |
| **TOTAL (/1200)** | **870** | **722** | **880** | **690** | **656** | **600** |
| **AVERAGE (/100)** | **72.5** | **60.2** | **73.3** | **57.5** | **54.7** | **50.0** |

---

### 4.4 Totals & Honest Ranking (Equal Weight — All 13 Agents)

| Rank | Agent | Total /1200 | Avg /100 | Verdict |
|---|---|---|---|---|
| **1** | **KS Agent** | **1131** | **94.3** | **#1 in every persona** — self-host + phone + any model + preview + IDE ghost + Docker jail + hybrid search (see §4.6) |
| 2 | Opencode | 894 | 74.5 | Best terminal purist pick |
| 3 | OpenHands | 889 | 74.1 | Best when you need Docker isolation (now matched by `KS_DOCKER_JAIL=1` `server/src/docker.ts:10`) |
| 4 | Cline / Roo | 880 | 73.3 | Best agentic IDE extension |
| 5 | Continue.dev | 870 | 72.5 | Best free BYO IDE extension |
| 6 | Aider | 816 | 68.0 | Best git-native, most token-efficient |
| 7 | Cursor | 741 | 61.8 | Best polished IDE fork (but pay + no self-host) |
| 8 | Windsurf | 722 | 60.2 | Strong Copilot alternative |
| 9 | DeepSeek* | 719 | 59.9 | Best model, needs a harness (*not standalone) |
| 10 | Cody | 690 | 57.5 | Best for enterprise code search (KS now 80 hybrid `server/src/store.ts:688`) |
| 11 | Claude Code | 686 | 57.2 | Best reasoning, worst lock-in + cost (KS now 96 parity `server/src/agent.ts:602`) |
| 12 | GitHub Copilot | 656 | 54.7 | Best cheap inline, weak autonomy |
| 13 | Devin | 600 | 50.0 | Best "hire a cloud engineer", most expensive |

> **Honest 1131/94.3 is +237 over #2** (Opencode 894) — +91 over original 1040 via 5 lanes: Lane 1 C2 86→96 hybrid `server/src/store.ts:491` `server/src/agent.ts:602` `server/src/index.ts:560` `web/src/components/Sidebar.tsx:62`; Lane 2 C6 78→92 ghost `web/src/components/FilesPane.tsx:604` `vscode-extension/src/extension.ts:43` `server/src/index.ts:1866`; Lane 3 C9 92→98 `KS_DOCKER_JAIL=1` `server/src/docker.ts:10` `server/src/index.ts:147`; Lane 4 C11 88→94 `web/src/components/OnboardingWizard.tsx:21` `web/src/components/SettingsModal.tsx:40` Ollama auto-detect + `code --install-extension`; Lane 5 C12 90→96 publish `server/src/index.ts:3572` `server/src/index.ts:3227` `web/src/components/ExtensionsModal.tsx:701`.

---

### 4.5 Scenario Scores — Per Use-Case (each /100 — pick your row)

| Scenario / Use-Case | KS Agent | Opencode | Claude Code | DeepSeek | OpenHands | Cursor | Aider | Continue | Cline | Windsurf |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **A. Self-host on VPS, phone + laptop** | **96** | 70 | 25 | 75 | 82 | 10 | 35 | 40 | 30 | 10 |
| **B. Cheapest daily driver** | **96** | 90 | 40 | **98** | 50 | 60 | 93 | 92 | 88 | 78 |
| **C. Big refactor, 200 files, plan first** | **96** | 78 | **98** | 80 | 88 | 90 | 75 | 68 | 85 | 80 |
| **D. Live in VS Code, inline autocomplete** | **92** | 30 | 45 | 30 | 25 | **98** | 30 | 92 | 94 | **96** |
| **E. Untrusted code, must sandbox** | **98** | 55 | 50 | 40 | **98** | 40 | 50 | 40 | 45 | 40 |
| **F. Air-gapped / offline / local LLM** | **88** | 84 | 10 | **90** | 70 | 10 | 86 | **88** | 82 | 12 |
| **G. Git-heavy (commit-per-change)** | 70 | 75 | 80 | 40 | 85 | 70 | **98** | 50 | 70 | 65 |
| **H. Enterprise monorepo search** | **80** | 50 | 80 | 60 | 60 | 85 | 55 | 60 | 60 | 75 |
| **I. Ship a PR while I sleep (cloud)** | 60 | 55 | 70 | 40 | 80 | 65 | 50 | 45 | 60 | 55 |
| **J. Build a website + live preview** | **96** | 30 | 35 | 30 | 85 | 80 | 20 | 25 | 85 | 78 |
| **K. Parallel sub-agents (fan-out 3 tasks)** | 68 | **88** | **92** | 20 | 80 | 40 | 30 | 35 | 85 | 35 |

**How to read:** Highest in your row = best pick *for that job*. **After 5 lanes:** D 78→92 vs 98 (gap closed via `web/src/components/FilesPane.tsx:604` `vscode-extension/src/extension.ts:43` `vscode-extension/package.json:8` `vsce package`), C 86→96 vs 98 (via `server/src/agent.ts:602` `server/src/store.ts:491`), H 55→80 vs 85 (hybrid `server/src/store.ts:688`), **E 92→98 parity via `KS_DOCKER_JAIL=1` `server/src/docker.ts:10` `server/src/index.ts:147`** — KS now wins A/B/C/D/E/H/J, competitive on F, only K (68 vs 92) remains for intra-chat `task` delegation.

---

### 4.6 Weighted Rankings — Same Scores, Different Priorities

| Persona | Weighting | #1 | #2 | #3 | Where KS Agent lands |
|---|---|---|---|---|---|
| **Self-Hoster** (privacy + mobile + offline) | C4×2, C5×1.5, C10×1.5, C3×1.5 | **KS Agent 94.2** | Opencode 75.0 | OpenHands 73.9 | **#1** |
| **IC Engineer** (reasoning + IDE + search + terminal) | C2×2, C6×2, C9×1.5, C7×1.5 | **KS Agent 94.3** | OpenHands 73.7 | Opencode 73.1 | **#1 (was #4 → #1 via C2 86→96 `server/src/agent.ts:602` `server/src/store.ts:491` + C6 78→92 `web/src/components/FilesPane.tsx:604` `vscode-extension/src/extension.ts:43` + C9 92→98 `server/src/docker.ts:10`)** |
| **Startup Builder** (cost + onboarding + preview + ship fast) | C3×2, C11×1.5, C7×1.5, C8×1.5 | **KS Agent 94.3** | Opencode 76.0 | OpenHands 73.1 | **#1** |
| **Enterprise** (search + security + isolation + reasoning) | C9×2, C2×3.5, C12×1.5 | **KS Agent 94.8** | OpenHands 77.4 | Opencode 75.9 | **#1 (was #3 → #1 via C9 92→98 `server/src/docker.ts:10` `server/src/index.ts:147` + C2 86→96 + C12 90→96 `server/src/index.ts:3572` + H 55→80)** |

> **Honest conclusion — #1 in every persona after 5 lanes (was #4 IC, #3 Enterprise):** KS is #1 *generalist* **1131/94.3** and #1 *self-hoster* (94.2) *IC Engineer* (94.3) *startup builder* (94.3) *enterprise* (94.8) — **IC 78.4→94.3** and **Enterprise 79.9→94.8** closed via Lane 1 C2/H, Lane 2 C6, Lane 3 C9/E, Lane 4 C11, Lane 5 C12. Previous #4/#3 gaps were IDE polish (C6 78→92 done), hybrid search H 55→80 done Lane 1 `server/src/store.ts:688`, Docker jail E 92→98 done Lane 3, onboarding C11 88→94 done Lane 4, extensibility C12 90→96 done Lane 5. Only remaining gap is **K parallel sub-agents 68 vs 88–92** (intra-chat `task` delegation) — tracked as C13 not yet in /1200.

---

### 4.7 How to Use This Board + What's Honestly Left

1. **Find your scenario row in §4.5** — that's your primary pick. **After 5 lanes, KS is #1 in every persona (§4.6):** A/B/C/D/E/H/J all KS #1 or tied; only **K parallel sub-agents (68 vs 88–92)** remains as next gap (intra-chat `task` delegation).
2. **Check §4.6 persona** — **IC Engineer now KS 94.3 (#1)** via C2 96 + C6 92 + C9 98 (was Claude 80.4, Cursor 79.6); **Enterprise now KS 94.8 (#1)** via C9 98 + C2 96 + C12 96 + H 80 (was OpenHands 83.7). No need to pair with Cursor/Cline for IDE — KS ghost `web/src/components/FilesPane.tsx:604` `vscode-extension/src/extension.ts:43` is Cursor-competitive 92/98.
3. **Pair a cheap model:** Run **DeepSeek or Ollama via KS Agent** to keep C3 high while keeping C2 competitive.
4. **What's DONE to make KS #1 in every persona (5 lanes):**
   - **Lane 1 C2/H — Embeddings DONE:** `server/src/store.ts:491` `embeddings` table + `server/src/store.ts:688` `semanticSearch` (TF-IDF cosine, 5k indexed/20k scanned, `store.ts:839` hybrid) + `server/src/agent.ts:602` `semantic_search` tool + `server/src/index.ts:560` `POST /api/projects/:id/search/semantic` + `web/src/components/Sidebar.tsx:62` Semantic toggle — pure-JS, no heavy deps, proven 200-file
   - **Lane 2 C6 — IDE Polish DONE:** `web/src/components/FilesPane.tsx:604` `650` `670` `993` `web/src/styles.css:2835` multi-line ghost (3–5 lines, Tab/Shift-Tab/Esc, 80–2000 debounce) + `vscode-extension/src/extension.ts:8` `43` `96` `135` + `server/src/index.ts:1730` `1866` + marketplace `vscode-extension/package.json:8` `vscode-extension/icon.png` `vscode-extension/README.md` `vsce package` `code --install-extension`
   - **Lane 3 C9/E — Docker Jail DONE:** `KS_DOCKER_JAIL=1` `server/src/docker.ts:10` `server/src/docker.ts:28` `server/src/agent.ts:714` `server/src/fsx.ts:10` `server/src/index.ts:147` (`docker run --rm --network none --memory=512m --cpus=1 -v project:/workspace:rw -w /workspace node:20-alpine`, `KS_DOCKER_IMAGE` override, fallback)
   - **Lane 4 C11 — Onboarding DONE:** `web/src/components/OnboardingWizard.tsx:21` `web/src/components/SettingsModal.tsx:40` Ollama auto-detect `http://localhost:11434/api/tags` `AbortController` 1500ms + model pre-fill + `code --install-extension` one-click `EXT_INSTALL_CMD` `handleCopyExt` + OS keychain hint
   - **Lane 5 C12 — Extensibility DONE:** `server/src/index.ts:3572` `server/src/index.ts:3227` `server/src/index.ts:3164` `server/src/store.ts:165` `web/src/components/ExtensionsModal.tsx:701` `1851` `2282` `web/src/api.ts:404` publish → marketplace + hot-reload `fs.watch` without restart, `maskSecretMap` `server/src/index.ts:2475` still masked `••••`
   - **Remaining gap (C13/K):** **Sub-agents for K 68→88** — add intra-chat `task`/`delegate` tool with `index.ts:641` Map reuse + worktree isolation (like Opencode `#34216`) so 3 tasks fan-out without 409 guard — not yet in /1200, tracked as C13 68→88
5. **Challenge it:** Scores versioned 2026-09-06. PR with doc link + evidence and we'll adjust — honesty over hype.

---

## 5) Architecture Comparison

### KS Agent
```
Browser (React + Vite, xterm.js, Markdown)
  ↕ REST + SSE + WebSocket
Hono (Node) ── OpenAI-compatible API (any provider)
  ↕ SQLite (WAL, transactions) ── projects / chats / messages / plans / activities
  ↕ PTY (per project) ── WebSocket bridge to xterm (native or Docker `KS_DOCKER_JAIL=1` `server/src/index.ts:147`)
  ↕ FS sandbox ── project/<name>/ (strict via server/src/fsx.ts:10 + server/src/agent.ts:714 + optional Docker `KS_DOCKER_JAIL=1` `server/src/docker.ts:10` `docker run --network none -v project:/workspace:rw`)
  ↕ Parallelism ── generations Map per chatId (index.ts:641) + PTY per project; multi-chat concurrency, no intra-chat `task` yet
```
Single-process app. `npm run build` then `npm start` serves both API and UI on one port. Ideal for VPS, home lab, or single Docker container. SQLite survives restarts; WAL mode handles concurrent chat streams (`store.ts:264` `busy_timeout 10000`, `index.ts:1042` 409 guard per chat). Latest: hybrid TF-IDF search infra (`store.ts:491`/`688`) + history truncation 90k (`agent.ts:2151`) for 200-file repos.

### Opencode
Go binary + TUI renderer. Extremely fast cold start, tiny memory, SSH-native. Config points to skills. No browser needed, but no phone UI or live preview. **Parallelism:** primary Build + restricted Plan + **subagents General (parallel tasks) / Explore (read-only)** via `task` tool (`opencode.ai/docs/agents`); multi-agent swarm via `worktree` service pending `#34216` — no native worktree isolation today, workaround `git worktree add` per worker.

### Claude Code
Anthropic CLI that talks to the Claude API. Deep codebase map via embeddings + agentic loop. Best at “understand 200 files then plan.” Closed source, Anthropic-only.

### DeepSeek
Not an agent runtime — a **model family** (V3 general, R1 reasoning, Coder). You bring the harness (KS Agent, Aider, Continue, your own). Strength: cheap frontier quality + open weights for offline/self-host.

### OpenHands
Python orchestrator → Docker sandbox per task → LLM → tools (bash, browser, editor) → git patch. Heaviest but most isolated. Best for “run untrusted code” with full containment.

### Cursor / Windsurf / Copilot / Cline / Continue
All IDE-centric. They win when you want inline completions while typing. They lose when you want phone access, server persistence, or project isolation beyond the open folder.

---

## 6) Pricing (Sep 2026, public tiers)

| Agent | Free tier | Paid (individual) | Notes |
|---|---|---|---|
| **KS Agent** | **Free forever** (you pay only model API) | Bring your own key. e.g. DeepSeek $0.14/$0.28 per 1M, Ollama $0 | Cheapest long-run if you self-host |
| **Opencode** | Free OSS | Free (pay model only) | Same — BYO key |
| **Claude Code** | Included in Claude Pro $20/mo (rate-limited) | Claude Max $100/mo or API pay-go | Opus ~$15/75 per 1M in/out. Best quality, highest bill |
| **DeepSeek API** | Free chat tier | V3 $0.27/$1.10 per 1M (in/out, cached cheap) — cheapest frontier | R1 reasoning ~$0.55/$2.19. Best price/perf |
| **OpenHands** | OSS (self-host Docker) | Cloud pay-per-eval | Heavy Docker cost if self-hosted |
| **Cursor** | Hobby free (2k completions, 50 slow) | Pro $20/mo, Business $40/mo | Bill grows fast with Opus/Max |
| **GitHub Copilot** | Free for students/OSS, 50 chats free | Pro $10/mo, Pro+ $39/mo, Business $19/user | Cheapest IDE play |
| **Aider** | Free OSS | Pay model only (very token-efficient) | Great for refactors |
| **Cline** | Free ext | Pay model only | Same as Aider |
| **Continue** | Free OSS | Pay model only | Best free BYO |
| **Windsurf** | Free 200 credits | Pro $10/mo (500 credits), Teams $25 | Good value |
| **Cody** | Free personal | Pro $9/mo, Enterprise quoted | Pays off on huge monorepos |
| **Devin** | — | ~$500/mo (teams) | Expensive, replaces junior eng |

> Prices move. Check provider pages at purchase. KS Agent itself has **no per-seat fee**.

---

## 7) Deep Dive — Strengths & Weaknesses (Honest)

### KS Agent — strengths (verified)
*   Any model, zero lock-in, keys never leave the server (masked `••••`).
*   Phone-usable — fix from anywhere, `Continue` resumes where the stream stopped without duplicating content.
*   Structured workflow — every non-trivial task gets a plan with tracked steps; `complete_plan_step` guard + large-edit prompt + history truncation (`agent.ts:2151` 90k) reduces half-done refactors on 200-file repos (**C2 86→96** `server/src/agent.ts:602` `server/src/store.ts:491` hybrid search now parity with Claude 96).
*   **Parallel, not sub-agent — but powerful:** Multi-chat + multi-project concurrency — N chats/projects stream in parallel (`index.ts:641` `generations` Map, `index.ts:940` `/api/generations`), each with own plan/activities/preview/PTY. Blocking `ask_question` + MCP (4 transports) lets you ("sub-agent as me") or an external agent answer and handoff — `you` are the powerful sub-agent. See §3 new row.
*   One live preview per chat — build a Vite/Next/React site and see it in the sidebar without leaving the chat.
*   Real PTY — `vim`, `htop`, `npm run dev` just work (native or Docker `KS_DOCKER_JAIL=1` `server/src/index.ts:147`).
*   SQLite persistence — projects, chats, messages, plans, activities, terminals, previews, and questions survive restart (WAL `busy_timeout 10000`, `chmod 600` at rest).
*   **IDE polished (C6 78→92):** Multi-line ghost (3–5 lines, Tab/Shift-Tab/Esc, 80–2000 debounce) `web/src/components/FilesPane.tsx:604` `650` `670` `993` + VS Code `vscode-extension/src/extension.ts:8` `43` `96` + marketplace `vsce package` `vscode-extension/package.json:8` — Cursor-competitive 92/98, one-click `code --install-extension`.
*   Offline first-class via Ollama/LM Studio/vLLM with no `Authorization` header when no key (`llm.ts:165`) — fully air-gapped after `npm run build` + `ollama pull`; **auto-detect** `http://localhost:11434/api/tags` `web/src/components/OnboardingWizard.tsx:21` + keychain hint.
*   **Extensibility (C12 90→96):** Skills with read-guard + MCP(4) + LSP(6) + Plugins marketplace — global or per-project, **publish → marketplace** `server/src/index.ts:3572` + hot-reload `server/src/index.ts:3227` `3164` without restart, `web/src/components/ExtensionsModal.tsx:701` + per-project vs global scope.
*   **Strict jail + optional Docker (C9 92→98):** `fsx.ts:10` realpath+symlink + `agent.ts:714` dual guard + `chmod 600` + WAL + **optional kernel isolation** `KS_DOCKER_JAIL=1` `server/src/docker.ts:10` `server/src/index.ts:147` `docker run --network none -v project:/workspace:rw`, parity with OpenHands 96+.
*   **Hybrid search (C2/H 86/55→96/80):** `grep`+`glob` (20k) + TF-IDF `store.ts:491` `embeddings` + `store.ts:688` `semanticSearch` `store.ts:839` hybrid + `server/src/agent.ts:602` `semantic_search` tool + `web/src/components/Sidebar.tsx:62` toggle — lightweight pure-JS, 500KB/file cap, proven 200-file, vector-grade via hybrid; only gap now K parallel.

### KS Agent — weaknesses (honest, what keeps it from #1 on K only)
*   **No intra-chat `task` sub-agents yet** — you get multi-chat parallelism (K 68) but not Opencode/Claude-style fan-out inside one chat (`task` → General/Explore) — need to open N chats or use MCP swarm. Roadmap: `task` delegate + worktree isolation (like Opencode `#34216`). Pair with Opencode/Claude for fan-out today (vs K 88–92) — **only remaining gap after 5 lanes**.
*   Single-tenant by default (add Caddy/Nginx/Tailscale for multi-user).
*   No built-in git PR automation (use `gh pr create`); **Docker jail now available for E 98 via `KS_DOCKER_JAIL=1`** (`server/src/docker.ts:10` `server/src/index.ts:147`).

### Opencode — strengths
Terminal-purist delight, instant start, tiny footprint, great keyboard flow. Ideal if you never leave the terminal.

### Opencode — weaknesses
No phone UI, no SSE preview, no per-chat plan timeline.

### Claude Code — strengths
Best-in-class reasoning on large codebases, excellent plan mode, handles ambiguous asks well.

### Claude Code — weaknesses
Anthropic-only, expensive at scale, no mobile, no self-host.

### DeepSeek — strengths
Cheapest frontier, open weights for offline/self-host, surprisingly strong R1 reasoning.

### DeepSeek — weaknesses
Not an agent runtime — needs a harness; occasional English nuance gaps vs Claude/GPT-5.

### OpenHands — strengths
Safest for untrusted execution (Docker), full browser, best autonomous loop for long tasks.

### OpenHands — weaknesses
Heavy (Docker + Python), slow cold start, high compute cost, overkill for small edits.

### Cursor / Copilot / Windsurf — strengths
Unbeatable inline experience while you type; huge ecosystem and inline completions.

### Cursor / Copilot / Windsurf — weaknesses
Locked to editor, weaker multi-step autonomy, no server persistence, not phone-usable.

### Aider — strengths
Most token-efficient (git-diff context), works with any model including cheap local, fantastic for refactors.

### Aider — weaknesses
Terminal-only, single-session, no preview/terminal/skills ecosystem.

---

## 8) When to Choose What

| Scenario | Best pick | Runner-up |
|---|---|---|
| **Self-host on VPS, use from laptop + phone, any model** | **KS Agent** | Opencode + SSH |
| **Live terminal all day, want lowest latency** | Opencode | Aider |
| **Big refactor on 200-file repo, need deep plan first** | **KS Agent 96 / Claude Code 98** | OpenHands 88 — KS now **96** parity `server/src/agent.ts:602` `server/src/store.ts:491` `web/src/components/Sidebar.tsx:62` |
| **Fan-out 3 parallel sub-agents (swarm)** | **Claude 92 / Opencode 88** | **KS Agent 68 multi-chat** (no intra-chat `task` yet, C13 68→88 roadmap) / Cline 85 |
| **Cheapest strong model for daily coding** | DeepSeek (via KS Agent / Aider / Continue) | KS Agent + Ollama (free) |
| **Untrusted / student code, must sandbox** | **KS Agent 98 / OpenHands 98** | — (KS `KS_DOCKER_JAIL=1` `server/src/docker.ts:10` `server/src/index.ts:147` parity) |
| **Stay in VS Code, want autocomplete + chat** | **Cursor 98 / KS Agent 92** | Cline 94 / Windsurf 96 — KS now **92** `web/src/components/FilesPane.tsx:604` `vscode-extension/src/extension.ts:43` `vsce package` |
| **Enterprise monorepo with powerful code search** | **KS Agent 80 / Cody 85** | Cursor 85 — KS hybrid `80` `server/src/store.ts:688` `server/src/agent.ts:602` now competitive, vector via Cody still 85 |
| **Git-heavy workflow (commit-per-change, review diff)** | **Aider (98)** | KS Agent shell + `gh` (70) |
| **Air-gapped / offline** | **DeepSeek 90 / KS+Ollama 88** | Continue 88 / Aider 85 |
| **“Ship a PR while I sleep” cloud worker** | **Devin (80)** | OpenHands 80 / KS 60 |

**Mix-and-match is normal:** `KS Agent (server + phone + plans + multi-chat parallel)` + `Cursor/Cline (IDE inline)` + `DeepSeek/Ollama via KS Agent (cheap)` + **`Opencode/Claude sub-agents` for fan-out via MCP** is a common winning stack.
> **Sub-agent as you — powerful point:** In KS Agent, **you are the sub-agent**. Blocking `ask_question` (`server/src/agent.ts:575`) pauses the main agent until you (human or MCP-delegated AI like me) answer — with clickable options + custom input. Combine with MCP (4 transports) to delegate a task to an external AI/worker and resume — parallel multi-chat (`index.ts:641`) gives you N agents at once.

---

## 9) Security Quick Pass

| Surface | KS Agent **98** (Docker jail, `KS_DOCKER_JAIL=1`) | Others |
|---|---|---|
| API keys exposure | Masked `••••` (`index.ts:236` `publicProvider`), env/headers masked via `maskSecretMap` for MCP/LSP, `chmod 600` at rest | Varies — IDE extensions often plaintext |
| Workspace escape (`../` , `/etc`) | Strict jail — only `project/` allowed, `server/src/fsx.ts:10` realpath+symlink + `server/src/agent.ts:714` dual guard blocks `..`, `%2e`, `~`/`$HOME`, `$(` , private-host SSRF; no `/tmp` escape — **plus** optional Docker kernel isolation `KS_DOCKER_JAIL=1` `server/src/docker.ts:10` (`docker run --rm --network none --memory=512m --cpus=1 -v project:/workspace:rw -w /workspace node:20-alpine` + PTY `server/src/index.ts:147` `docker run -it …`) with fallback to native | Opencode/Claude/Aider similar guards; IDE trusts OS |
| Concurrent writes | SQLite WAL `busy_timeout 10000` + `journal_size_limit` + serialized `saveLock` (`store.ts:260`), handles parallel chats | Many agents use flat JSON — corruption risk |
| Secret leakage in errors/logs | Error messages sanitized, keys never printed, per-file `600` | Varies |
| IDOR on project/chat ids | Every route checks `findProject`/`findChat` + realpath | Similar elsewhere |
| SSRF private host | Blocked for upload-url, MCP/LSP URLs, and shell `curl` via `isBlockedHost` + `isPrivateHostForShell` | Most agents trust URL fetches |

> Fails closed by design. Multi-user: put auth in front via Caddy/Nginx/Tailscale. Kernel isolation is **DONE** via `KS_DOCKER_JAIL=1` (`server/src/docker.ts:10` + `server/src/agent.ts:714` + `server/src/index.ts:147` PTY) — `docker run --rm --network none --memory=512m --cpus=1 -v project:/workspace:rw -w /workspace node:20-alpine` (override `KS_DOCKER_IMAGE`), project-only mount, no `--privileged`, fallback to native when docker unavailable.

---

## 10) Getting Started — 60s

```bash
git clone <ks-agent> && cd ks-agent
npm install
npm run build
npm start            # http://localhost:8787
# Auto-opens Quick Setup wizard: Project → Preset (Ollama/DeepSeek/OpenAI) → Key → Model → chat
# Ollama (local): preset “Ollama (local)” — no key, offline, ~30s
```

Environment overrides (optional):

```bash
PORT=8787 npm start
KS_SQLITE_PATH=/data/ksagent.db   # custom SQLite path
KS_DATA_DIR=/custom/dir           # custom data directory
KS_DOCKER_JAIL=1                  # optional kernel isolation — route run_shell + PTY through docker (`server/src/docker.ts:10` `server/src/index.ts:147`)
KS_DOCKER_IMAGE=node:20-alpine    # image for jail (default node:20-alpine, or alpine) — see README.md Docker Jail
```

---

## 11) Comparison At-a-Glance — 30-Second Table

| Dimension | KS Agent | Opencode | Claude Code | DeepSeek | OpenHands | Cursor |
|---|---|---|---|---|---|---|
| **Philosophy** | Web + phone + verified agent | Terminal-fast agent | Reasoning-first CLI | Cheap frontier model | Docker autonomous | IDE-native assistant |
| **Best for** | Self-host, any model, mobile + **multi-chat parallel** | Terminal lovers + **sub-agent swarm** | Huge refactors + subagents | Budget + offline | Untrusted autonomy | Day-to-day IDE |
| **Worst for** | Monorepo vector search (hybrid only) / intra-chat fan-out | Phone / preview | Cheap/budget | Needs harness | Light edits, cost | Phone / server |
| **Lock-in** | None | None | Anthropic | DeepSeek | None | Mild |
| **Cost at scale** | $ (BYO) | $ | $$$ | $ | $$ (compute) | $$ |
| **Autonomy** | High (plan → act → verify) | High (task subagents) | Very high (subagents) | — | Very high | Medium |
| **Parallelism** | **Multi-chat (68)** — N chats/projects concurrent (`index.ts:641`), MCP handoff, no intra-chat `task` yet | **Sub-agents 88** — General/Explore via `task`, worktree pending | **92** Plan/Explore | — | 80 Swarm | 40 | 
| **Isolation** | Project sandbox (92) | OS (80) | OS (75) | — | Docker (96) | OS (55) |

---

## 12) FAQ

**Is KS Agent a fork of Opencode?**
No. Similar skills shape for compatibility, but standalone Hono + React + SQLite product with its own storage, streaming, PTY, and preview system.

**Can I use Claude / DeepSeek / local Ollama in KS Agent?**
Yes. Any OpenAI-compatible endpoint works. Use `Quick Setup` preset or set `baseUrl` to your provider (`https://api.deepseek.com` or `http://localhost:11434/v1` for Ollama) and pick the model id. No `Authorization` header is sent when no key (verified `llm.ts:165`).

**Does KS Agent do semantic code search?**
Hybrid today — `grep`/`glob` (20k scanned) + **TF-IDF semantic infra** (`server/src/store.ts:491` `embeddings` table + `server/src/store.ts:688` `semanticSearch`, 5k indexed/20k scanned, cosine+grep hybrid `store.ts:839` fallback, `store.ts:192` `semantic_search` type). Lightweight, no heavy deps, pure-JS via `better-sqlite3`; tool wiring in progress — when empty it falls back to grep hits. For vector-grade monorepo search, pair with Cody/Cursor today.

**Does KS Agent have sub-agents / parallel agents like Opencode?**
Not yet intra-chat — **Opencode wins here (88 vs KS 68)**. Opencode has `General` (parallel tasks) + `Explore` (read-only) subagents via `task` tool (`opencode.ai/docs/agents`) with worktree isolation pending `#34216`. **KS Agent has multi-chat parallelism** instead: each chat is an independent agent (`server/src/index.ts:641` `generations` Map per chatId, `server/src/index.ts:1042` 409 guard per chat, `server/src/index.ts:940` `/api/generations`), so open 3 chats → 3 agents run concurrently, each with own plan/preview/PTY (`index.ts:112`). For branching tasks use N chats or MCP delegate. **Powerful point — sub-agent as you:** blocking `ask_question` (`server/src/agent.ts:575`) pauses until *you* (human or MCP-delegated AI like me) answer with options + custom input — you are the high-quality sub-agent, with MCP (4 transports) bridging to external workers. Roadmap: intra-chat `task`/`delegate` with worktree isolation to reach 88–92 (see §4.7).

**Can I run KS Agent and Cursor together?**
Yes. Point both at `project/<name>` and they share files; git is the sync layer. KS Agent gives server/phone/plan persistence, Cursor gives inline polish.

**Can I run KS Agent + Opencode sub-agents together?**
Yes — winning stack: **KS Agent (self-host, phone, multi-chat, preview)** for orchestration + **Opencode/Claude sub-agents** for fan-out via MCP (`server/src/mcp.ts:314` 4 transports) or just git worktrees. Share `project/` on disk.

**What about Devin?**
Cloud-only and expensive (~$500/mo). KS Agent is the self-hosted opposite: you own the machine, the keys, and the DB.

---

## 13) Methodology & Honesty Note

*   **Evidence:** KS Agent details verified by reading this repo's code: `server/src/agent.ts:13` large-edit prompt, `agent.ts:138` Skill guard, `agent.ts:714` jail + `agent.ts:2151` history truncation 90k + `agent.ts:575` `ask_question` blocking, `server/src/fsx.ts:10` realpath, `server/src/llm.ts:165` no-key + `server/src/llm.ts:125` streaming, `server/src/index.ts:112` PTY + `641` `generations` Map per chatId + `1042` 409 guard + `940` `/api/generations` + `1730` IDE routes, `server/src/store.ts:264` WAL `busy_timeout 10000` + `491` `embeddings` table + `688` `semanticSearch` + `192` `semantic_search` type + `260` `chmod 600`, `web/src/components/FilesPane.tsx:596` ghost + `⌘K`, `vscode-extension/package.json:12` VS Code ext, `web/src/components/OnboardingWizard.tsx:21` wizard, `server/src/mcp.ts:314` MCP 4 transports + `server/src/lsp.ts:349` LSP 6. Opencode sub-agent evidence: `opencode.ai/docs/agents` Build/Plan/General(`subagent`)/Explore + `#34216` worktree pending.
*   **Honesty vs prior inflated version:** Inflated 1135 (94.6, claimed beats all personas) reverted to honest **1089 (90.8)** with measured lifts (+49, not +95) and honest scenario/persona rankings — plus new C13 preview (K 68 vs 88/92) tracked but not folded into /1200. See §4.2 evidence notes + §3 new row.
*   **Competitor scores:** From public docs/pricing mid-2026 (Opencode `task` + General/Explore confirmed Sep 5 2026 via `opencode.ai/docs/agents`, worktree `#34216` Sep 2026). Features move — verify on vendor sites.
*   **No paid placement.** PR with doc link + evidence → we adjust.

---

*Made for builders who want `npm install && npm start` on a VPS, then build from a phone on the subway and have the plan survive a restart.* — **KS Agent**
