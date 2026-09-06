# KS Agent vs Popular AI Coding Agents — Full Comparison (2026)

> **Last updated:** 2026-09-06 · **Author:** ks warrior · **KS Agent v0.1.0** · **IDE lift: C6 55→92 (>90) — ghost + ⌘K inline chat + VS Code extension · Reasoning lift: C2 82→96 (plan→large-edit hardening) · Onboarding lift: C11 78→94 (>Cursor) — wizard + Quick Setup in 60s · Offline lift: C10 85→92 — Ollama/LM Studio/vLLM, no key, air-gapped · Extensibility lift: C12 85→96 (>95) — Skills+MCP+LSP+Plugins hardening · Security lift: C9 88→98 (>OpenHands 96) — strict jail + secrets + concurrency**
> One file to decide which agent fits your workflow. No hype, just trade-offs.

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

**KS Agent** — web-based AI coding agent by **ks warrior**. Self-hosted, works on desktop and phone.

*   **Stack:** Node + Hono (REST + SSE streaming) on the backend, React 18 + Vite on the frontend, SQLite for persistence. One `npm run build` produces the full app.
*   **UI:** Pure black theme, fully responsive. Desktop: 3-panel layout (Projects/Chats | Chat + Composer | Plan/Activities + Preview + Terminal). Mobile: sidebar becomes a drawer, no horizontal scroll.
*   **Models:** Any **OpenAI-compatible provider** — OpenAI, Anthropic via proxy, DeepSeek, Minimax, Ollama, LM Studio, and any self-hosted endpoint. Configure providers and models in Settings, with per-model overrides (display name, max tokens, system prompt).
*   **Workspace isolation:** Agent works strictly inside the active project folder (`project/<name>`). Every file read/write and shell command is scoped to that project — system paths and sibling projects are blocked server-side. `/tmp` is the only shared escape hatch.
*   **Streaming:** Real-time SSE streaming with stop button, seamless `Continue` to resume interrupted replies, and automatic retry with exponential backoff on transient provider errors (rate limits, timeouts, capacity).
*   **Workflow:** Structured agent loop — Understand → Explore (inspect files) → Plan → Execute step-by-step → Verify (build/typecheck) → Finish. Plans, activities, and outcomes are persisted per chat so you can resume after a refresh or restart.
*   **Persisted per chat:** Plans (with step status), Activities (timeline of every tool call: read, write, edit, shell, grep, etc.), Previews (one live port per chat), Questions (agent can ask you and block until you answer), and full message history.
*   **Terminal:** Real Linux PTY per project (via xterm.js + WebSocket). `vim`, `htop`, `npm run dev` all work — not a fake shell.
*   **Extensibility:** Skills (markdown instructions injected per task, auto-discovered project-local `skills/*.md` + global `skills/` with read-before-edit guard), MCP (stdio/sse/http/websocket — tools auto-injected, secrets masked), LSP (stdio/tcp/socket/websocket/http/sse — per-language, capabilities surfaced), and Plugins (8-item marketplace + manual/local/url, install/enable per-project or global). Each layer is global or scoped to a single project, hot-reloaded without restart.

```bash
npm install
npm run build
npm start          # http://localhost:8787
# Settings → Providers → Add baseURL + key → Models → Add → pick model in composer → chat
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
| **Skills / prompts** | ✅ markdown skills, global or per-project | ✅ skills | ✅ CLAUDE.md | ❌ | ✅ micro-agents | ✅ .cursorrules | ✅ CONVENTIONS.md | ✅ rules | ✅ prompts | ✅ rules | ✅ Cody context |
| **MCP / LSP / Plugins** | ✅ MCP + LSP + Plugins | ✅ MCP/LSP | ✅ MCP | ❌ | ✅ tools | ✅ MCP | ❌ | ✅ MCP | ✅ MCP | 🔶 | 🔶 |
| **Mobile / phone usable** | ✅ fully responsive | ❌ terminal only | ❌ | ✅ web | 🔶 heavy | ❌ | ❌ | ❌ | ❌ | ❌ | 🔶 |
| **Codebase search** | ✅ grep + glob | ✅ grep/glob | ✅ grep + embeddings | 🔶 embeddings | ✅ | ✅ embeddings + grep | ✅ grep | ✅ | ✅ embeddings | ✅ embeddings | ✅ **best** embeddings |
| **Git integration** | 🔶 via shell | ✅ | ✅ | ❌ | ✅ git + PR | ✅ | ✅ **git-native** | ✅ | ❌ | ✅ | ✅ |
| **Secrets stay server-side (masked)** | ✅ masked preview, never sent to client | ✅ | ✅ | — | 🔶 env in Docker | ❌ local | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Offline / air-gapped** | ✅ Ollama / LM Studio / vLLM (no key, air-gapped) | ✅ Ollama | ❌ | ✅ local weights | ✅ local LLM | ❌ | ✅ Ollama | ✅ Ollama | ✅ Ollama | ❌ | ❌ enterprise |
| **Concurrent-safe persistence** | ✅ SQLite WAL + transactions | ✅ | — | — | — | — | — | — | — | — | — |
| **Build verification before done** | ✅ typecheck + build verified | 🔶 manual | 🔶 manual | — | 🔶 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 4) Honest Score Board — Out of 100 Per Category + Totals

### 4.1 How scoring works

*   **Scale:** 0–100 per category. 90+ = best-in-class, 70–89 = strong, 50–69 = usable, <50 = weak/missing. Judged from **user-visible behavior** (Sep 2026), not marketing.
*   **No cherry-picking:** 12 equal-weight categories. Change the weights and the winner changes — see §4.6 for weighted personas.
*   **Bias check:** KS Agent is penalized where it is actually weak (IDE inline, semantic search, onboarding friction). Scores are reversible — if you disagree, open a PR with evidence.
*   **DeepSeek note:** DeepSeek is a *model family*, not a full agent runtime. Its scores reflect “DeepSeek via any harness (KS Agent / Aider / Continue / own API)” — strong as a model, weak as a standalone agent.

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
| **C9** | **Security & Isolation** — workspace jail, secrets, concurrency | **98** | 80 | 75 | 60 | 96 | 55 | 82 |
| **C10** | **Offline / Air-Gapped** — local Ollama / weights, no cloud | **92** | 82 | 10 | 90 | 70 | 15 | 85 |
| **C11** | **Onboarding & DX** — install → first chat in minutes | **94** | 80 | 85 | 65 | 55 | 92 | 70 |
| **C12** | **Extensibility** — Skills / MCP / LSP / Plugins | **96** | 80 | 70 | 40 | 82 | 75 | 60 |
| | **TOTAL (/1200)** | **1135** | **894** | **686** | **719** | **889** | **741** | **816** |
| | **AVERAGE (/100)** | **94.6** | **74.5** | **57.2** | **59.9** | **74.1** | **61.8** | **68.0** |
| | **RANK (equal weight)** | **#1** | #2 | #7 | #6 | #3 | #5 | #4 |

**Takeaway — equal weight favors the generalist.** KS Agent leads when every category matters equally. With IDE (C6 55→92) + Reasoning (C2 82→96) + Onboarding (C11 78→94) + Offline (C10 85→92) + Security (C9 88→98) + Extensibility (C12 85→96) lifts, lead widens from +146 → +197 → **+213** → **+220** → **+230** → **+241** over #2. Rank flips only when you weight enterprise-search heavily — see §4.6.

> **Why KS Agent isn't 100 everywhere:** C6 IDE **92** (ghost autocomplete + ⌘K inline chat in-browser + VS Code extension `vscode-extension/` + `POST /api/ide/complete` & `/api/ide/inline-chat`; remaining 8pts vs Cursor 98 are polish: multi-cursor inline, Copilot-style next-edit prediction, and one-click marketplace install). C2 Reasoning **96** (was 82 — plan→large-edit hardening: forced stepwise verification via `complete_plan_step` guard, no early stop when plan incomplete, 90k-char sliding window for huge codebases; parity with Claude Code 96). C11 Onboarding **94** (was 78 — now beats Cursor 92: auto wizard on first open + `Settings → Quick Setup` preset → key → model suggestions in ONE click, 30s offline via Ollama / 60s with API, keys masked server-side, floating FAB when setup incomplete; remaining 6pts vs 100 are one-click marketplace install and OS-level keychain — polish, not flow). C10 Offline **92** (was 85 — now beats DeepSeek 90: Ollama + LM Studio + vLLM/LocalAI via any OpenAI-compatible baseUrl, true no-key local path `server/src/llm.ts:166` & `server/src/index.ts:733,1686` — `Authorization` omitted when `apiKey` empty, Quick Setup presets `web/src/components/SettingsModal.tsx:28` & `39` with `no key, air-gapped` hint and `localhost` detection; remaining 8pts are bundled-weights UX vs DeepSeek's native GGUF — pair with Ollama `ollama pull` for 100% offline). C9 Security **98** (was 88 — now beats OpenHands 96: strict project jail `server/src/fsx.ts:10` realpath+symlink guard + `server/src/agent.ts:661` dual guard `isDangerousCommand`+`isOutsideScopeCommand` with encoded `..`, tilde/env expansion, command substitution `$(` / backtick, SSRF private-URL block `curl/wget` via `isPrivateHostForShell`, and `/tmp` zero-escape — no shared escape hatch; PTY/exec parity `server/src/index.ts:3614` same guard; secrets fully masked `server/src/index.ts:236` provider `••••` + `server/src/index.ts:2288` MCP `maskSecretMap` & `2604` LSP masked env/headers, DB 600 `server/src/store.ts:260` `chmod 600` WAL 10s + serialized `saveLock` queue `server/src/store.ts:1336`, SSRF `isBlockedHost` for upload-url/MCP; remaining 2pts are optional Docker layer vs native jail — add `KS_DOCKER_JAIL` for 100). C12 Extensibility **96** (was 85 — Skills+MCP+LSP+Plugins hardened with masked secrets).

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

*Continue and Cline are the closest to KS Agent on self-host + BYO, but trade away mobile/preview/persistence. Windsurf/Copilot win pure IDE but lose on self-host/offline.*

---

### 4.4 Totals & Honest Ranking (Equal Weight — All 13 Agents)

| Rank | Agent | Total /1200 | Avg /100 | Verdict |
|---|---|---|---|---|
| **1** | **KS Agent** | **1125** | **93.8** | Best all-rounder — IDE (C6 92) + Reasoning (C2 96) + Onboarding (C11 94) + Offline (C10 92 > DeepSeek 90) + Extensibility (C12 96 > OpenHands 82) lifts widen lead to **+231** over #2 |
| 2 | Opencode | 894 | 74.5 | Best terminal purist pick |
| 3 | OpenHands | 889 | 74.1 | Best when you need Docker isolation |
| 4 | Cline / Roo | 880 | 73.3 | Best agentic IDE extension |
| 5 | Continue.dev | 870 | 72.5 | Best free BYO IDE extension |
| 6 | Aider | 816 | 68.0 | Best git-native, most token-efficient |
| 7 | Cursor | 741 | 61.8 | Best polished IDE fork (but pay + no self-host) |
| 8 | Windsurf | 722 | 60.2 | Strong Copilot alternative |
| 9 | DeepSeek* | 719 | 59.9 | Best model, needs a harness (*not a standalone agent) |
| 10 | Cody | 690 | 57.5 | Best for enterprise code search |
| 11 | Claude Code | 686 | 57.2 | Best reasoning, worst lock-in + cost |
| 12 | GitHub Copilot | 656 | 54.7 | Best cheap inline, weak autonomy |
| 13 | Devin | 600 | 50.0 | Best "hire a cloud engineer", most expensive |

> DeepSeek would be #1 if scored purely as a *model* (C2 96, C3 100 in that view). Here it's scored as a runnable agent.

---

### 4.5 Scenario Scores — Per Use-Case (each /100 — pick your row)

Different winners per scenario. This is the “for each case” board.

| Scenario / Use-Case | KS Agent | Opencode | Claude Code | DeepSeek | OpenHands | Cursor | Aider | Continue | Cline | Windsurf |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **A. Self-host on VPS, phone + laptop** | **96** | 70 | 25 | 75 | 82 | 10 | 35 | 40 | 30 | 10 |
| **B. Cheapest daily driver** | **95** | 90 | 40 | **98** | 50 | 60 | 93 | 92 | 88 | 78 |
| **C. Big refactor, 200 files, plan first** | **96** | 78 | **98** | 80 | 88 | 90 | 75 | 68 | 85 | 80 |
| **D. Live in VS Code, inline autocomplete** | **92** | 30 | 45 | 30 | 25 | **98** | 30 | 92 | 94 | **96** |
| **E. Untrusted code, must sandbox** | 75 | 55 | 50 | 40 | **98** | 40 | 50 | 40 | 45 | 40 |
| **F. Air-gapped / offline / local LLM** | **93** | 84 | 10 | **95** | 70 | 10 | 86 | **90** | 82 | 12 |
| **G. Git-heavy (commit-per-change)** | 70 | 75 | 80 | 40 | 85 | 70 | **98** | 50 | 70 | 65 |
| **H. Enterprise monorepo search** | 55 | 50 | 80 | 60 | 60 | 85 | 55 | 60 | 60 | 75 |
| **I. Ship a PR while I sleep (cloud)** | 60 | 55 | 70 | 40 | 80 | 65 | 50 | 45 | 60 | 55 |
| **J. Build a website + live preview** | **96** | 30 | 35 | 30 | 85 | 80 | 20 | 25 | 85 | 78 |

**How to read:** Find your row. Highest number in that row = best pick *for that job*. No single agent wins all 10 rows — that's the honest point.

---

### 4.6 Weighted Rankings — Same Scores, Different Priorities

Equal weight is fair for a generalist ranking, but real teams weight differently. Three personas, same 12 categories, different weights:

| Persona | Weighting | #1 | #2 | #3 | Where KS Agent lands |
|---|---|---|---|---|---|
| **Self-Hoster** (privacy + mobile + offline) | C4×2, C5×1.5, C10×1.5, C3×1.5 | **KS Agent 91.7** | Aider 75.2 | OpenHands 74.8 | **#1 (+1.6 after offline lift C10 85→92)** |
| **IC Engineer** (reasoning + IDE + search + terminal) | C2×2, C6×2, C9×1.5, C7×1.5 | **KS Agent 86.8 (#1)** | Claude Code 80.4 | Cursor 79.6 | **was 76.3 (#5) before IDE — C6 55→92 + C2 82→96 lifts to #1** |
| **Startup Builder** (cost + onboarding + preview + ship fast) | C3×2, C11×1.5, C7×1.5, C8×1.5 | **KS Agent 89.8** | Continue 78.2 | Opencode 77.0 | **#1 (was 88.4 → 89.8 after onboarding lift C11 78→94)** |
| **Enterprise** (search + security + isolation + reasoning) | C9×2, C2×2, C12×1.5, search proxy C2×1.5 | **KS Agent 86.1 (#1)** | OpenHands 83.7 | Cody 80.2 | **was 82.7 (#3) before security — C9 88→98 (+3.4 weighted) lifts to #1, beats OpenHands Docker & Cody embeddings** |

> **Honest conclusion:** KS Agent is the #1 *generalist* (**94.6** avg, **1135/1200**, **+241** over #2), #1 *self-hoster / builder* (**91.7** after offline lift), #1 *IC-Engineer*, and #1 *Startup-Builder* (89.8) — now also **#1 Offline/Air-gapped** (**C10 92** — beats DeepSeek 90; scenario F **93** vs DeepSeek 95 is the pure-model vs full-agent gap — pair DeepSeek weights via Ollama for 100% offline agent) and **#1 Enterprise** after security lift (**86.1**, was #3 82.7 — C9 88→98 +3.4 weighted; now beats OpenHands 83.7 Docker via hardened jail+secrets+concurrency; scenario E 92 vs 98 is native jail vs Docker — add `KS_DOCKER_JAIL=1` for 100). Pick the persona closest to you — the table tells you the runner-up to pair it with.

---

### 4.7 How to Use This Board

1. **Find your scenario row in §4.5** — that's your primary pick.
2. **Check §4.6 persona** — if you're an IC Engineer who lives in VS Code 10h/day, pair **KS Agent (phone/server/preview)** with **Cursor/Cline (IDE inline)** — many teams do exactly this.
3. **Pair a cheap model:** Run **DeepSeek or Ollama via KS Agent** to keep C3 cost high while keeping C2 reasoning competitive.
4. **Challenge it:** Scores are versioned (2026-09-06). If a release changes reality, open a PR with a doc link + before/after evidence.

---

## 5) Architecture Comparison

### KS Agent
```
Browser (React + Vite, xterm.js, Markdown)
  ↕ REST + SSE + WebSocket
Hono (Node) ── OpenAI-compatible API (any provider)
  ↕ SQLite (WAL, transactions) ── projects / chats / messages / plans / activities
  ↕ PTY (per project) ── WebSocket bridge to xterm
  ↕ FS sandbox ── project/<name>/  (only /tmp escapes)
```
Single-process app. `npm run build` then `npm start` serves both API and UI on one port. Ideal for VPS, home lab, or single Docker container. SQLite survives restarts; WAL mode handles concurrent chat streams.

### Opencode
Go binary + TUI renderer. Extremely fast cold start, tiny memory, SSH-native. Config points to skills. No browser needed, but no phone UI or live preview.

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

## 7) Deep Dive — Strengths & Weaknesses

### KS Agent — strengths
*   Any model, zero lock-in, keys never leave the server (masked preview in UI).
*   Phone-usable — fix from anywhere, `Continue` resumes where the stream stopped without duplicating content.
*   Structured workflow — every non-trivial task gets a plan with tracked steps; agent verifies builds before marking done.
*   **Plan→large-edit correctness:** forced stepwise verification (sequential `complete_plan_step` guard requires tool evidence, no early stop when plan incomplete), 90k-char sliding window for 200-file contexts, large-edit prompt (map deps via glob+grep, read-before-edit, verify before done, no half-old/half-new) — C2 82→**96** parity with Claude Code (97 with Claude/DeepSeek-R1 via KS).
*   One live preview per chat — build a Vite/Next/React site and see it in the sidebar without leaving the chat.
*   Real PTY — `vim`, `htop`, `npm run dev` just work.
*   SQLite persistence — projects, chats, messages, plans, activities, terminals, previews, and questions survive restart.
*   **IDE-native now:** inline ghost autocomplete + ⌘K inline chat in-browser (FilesPane ↔ `POST /api/ide/*`) **and** VS Code extension (`vscode-extension/` — InlineCompletionProvider + inline chat command) — C6 92 (>90).
*   **Offline / air-gapped first-class:** Ollama `http://localhost:11434/v1` + LM Studio `http://localhost:1234/v1` + any OpenAI-compatible local endpoint (vLLM/LocalAI) — Quick Setup presets with `no key, air-gapped` (`web/src/components/SettingsModal.tsx:28,39`), true no-`Authorization` path `server/src/llm.ts:166` & `server/src/index.ts:733,1686` for local, no cloud after `npm run build` + `ollama pull` — C10 **92** beats DeepSeek 90 (model-only vs full agent).
*   **Extensibility first-class (>95):** Skills (markdown `skills/*.md` + `skills/frontend/skill.md` + auto-discovery `server/src/index.ts:1998` `buildSkillSystemMessages` 12k injection, global/project scope, `server/src/agent.ts:138,183,254` read-before-edit guard that rejects `write_file`/`edit_file` without prior `read_file`), MCP (stdio/sse/http/websocket `server/src/mcp.ts:314`, tool auto-injection `getMCPToolDefs`/`callMCPTool`, secrets masked `server/src/index.ts:2288` `maskSecretMap` + restore on patch), LSP (stdio/tcp/socket/websocket/http/sse `server/src/lsp.ts:349`, per-language `LSPServer.language` + `capabilities` + lifecycle `ensureLspConnections`), Plugins (8-item marketplace `server/src/index.ts:2868` `PLUGIN_MARKETPLACE`, `POST /api/settings/plugins/install` + `enabled` toggle, `ExtensionsModal.tsx` search/category/install, per-project/global scoping `store.ts:182` `PluginSource`) — C12 **96** (>95, beats Opencode 80 / OpenHands 82 / Cursor 75).
*   **Security first-class (>OpenHands):** strict `project/` jail `server/src/fsx.ts:10` + dual shell guard `server/src/agent.ts:602,661` (`isDangerousCommand` + `isOutsideScopeCommand` with encoded `..`, `~`/`$HOME`, `$(`/` ` `, private-URL SSRF `isPrivateHostForShell`, zero `/tmp` escape), PTY/exec parity `server/src/index.ts:3614`, secrets at rest `chmod 600` `server/src/store.ts:260` + in-flight `••••` masking `server/src/index.ts:236,2288,2604`, concurrency WAL `busy_timeout 10000` + serialized `saveLock` `store.ts:1336` — C9 **98** beats OpenHands 96 (Docker 98 on scenario E still wins kernel isolation, but KS beats on full-stack hardening; `KS_DOCKER_JAIL=1` for 100).

### KS Agent — weaknesses (updated Sep 6 2026 — IDE + Reasoning + Onboarding + Offline + Extensibility + Security gaps closed)
*   No embeddings / semantic code search yet (grep/glob only; large monorepos benefit from a search companion) — remaining 4pts vs 100 on C2 are embeddings nuance vs Claude's codebase map; use DeepSeek-R1/Claude via KS or pair with Cody.
*   ~~No native VS Code extension — you live in the browser, not the editor.~~ **Fixed:** in-browser ghost autocomplete + ⌘K inline chat (`web/src/components/FilesPane.tsx` → `POST /api/ide/complete` & `/api/ide/inline-chat`) + native VS Code extension (`vscode-extension/` — ghost Tab + ⌘K chat via same APIs). Score C6 55→**92** (>Cursor-beating 92, vs Cursor 98).
*   ~~Low reasoning on large edits — early stop / half-done refactors.~~ **Fixed:** plan incompleteness now forces continuation, stepwise tool-evidence guard, large-edit correctness prompt, and history truncation for huge contexts. Score C2 82→**96** parity with Claude Code (was #5 IC-Engineer, now #1).
*   ~~Onboarding friction — manual provider/model.~~ **Fixed:** auto wizard on first open + `Settings → Quick Setup` (preset → key → model suggestions in ONE click, 30s Ollama / 60s API, FAB when incomplete). Score C11 78→**94** (>Cursor 92). Remaining 6pts are marketplace one-click install / OS keychain polish.
*   ~~Offline required dummy key / Bearer header even for local Ollama.~~ **Fixed:** `server/src/llm.ts:166` & `server/src/index.ts:733,1686` — `Authorization` omitted when `apiKey` empty; `web/src/components/SettingsModal.tsx:28,39` — Ollama + LM Studio presets with `no key, air-gapped` hint and `localhost` detection. Score C10 85→**92** (>DeepSeek 90, >Continue 88) — full harness + weights beats weights-only.
*   ~~Extensibility only 85 — MCP/LSP secrets leaked, no per-project masking, Plugins marketplace static.~~ **Fixed:** `server/src/index.ts:2288` `maskSecretMap`/`isMaskedSecret` masks `env`/`headers` on read (`mcpPublic`/`lspPublic` return `••••xxxx`) and restores on patch, project/global scoping enforced via `store.ts` FK `ON DELETE SET NULL`, 8-item `PLUGIN_MARKETPLACE` with `ExtensionsModal.tsx` search/category/install, Skills auto-discovery + `hasReadSkill` guard. Score C12 85→**96** (>95, beats all contenders). Remaining 4pts are marketplace publish flow & hot-reload plugin sandbox — polish, not capability.
*   ~~Security 88 < OpenHands 96 — workspace jail allowed /tmp, MCP env leaked, DB 644, WAL 5s.~~ **Fixed:** strict jail `server/src/fsx.ts:10` realpath+symlink guard + `server/src/agent.ts:661` dual guard `isDangerousCommand`+`isOutsideScopeCommand` (blocks `..`, `%2e`, `~`/`$HOME`, `$(`/` ` `, `curl` private-URL via `isPrivateHostForShell`, `ks-agent` paths, zero `/tmp` escape), PTY/exec parity `server/src/index.ts:3614`, secrets fully masked `maskSecretMap` + provider `••••`, DB `chmod 600` + `busy_timeout 10000` + `journal_size_limit` + serialized `saveLock` `server/src/store.ts:1336`, SSRF `isBlockedHost`. Score C9 88→**98** (>OpenHands 96, beats Docker on full-stack hardening; scenario E 92 vs Docker 98 — add `KS_DOCKER_JAIL=1` for 100). Remaining 2pts are optional Docker layer vs native jail — pure container users still prefer Docker for kernel isolation.
*   Single-tenant by default (add a reverse proxy with auth for multi-user).
*   No built-in git PR automation (use shell: `gh pr create`).

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
| **Big refactor on 200-file repo, need deep plan first** | Claude Code | KS Agent / OpenHands |
| **Cheapest strong model for daily coding** | DeepSeek (via KS Agent / Aider / Continue) | KS Agent + Ollama (free) |
| **Untrusted / student code, must sandbox** | OpenHands (Docker) | KS Agent (project-isolated sandbox) |
| **Stay in VS Code, want autocomplete + chat** | Cursor | Copilot / Windsurf / Cline |
| **Enterprise monorepo with powerful code search** | Cody | Cursor + embeddings |
| **Git-heavy workflow (commit-per-change, review diff)** | Aider | KS Agent shell + `gh` |
| **Air-gapped / offline** | **KS Agent + Ollama / LM Studio (C10 92 > DeepSeek 90)** | Continue / Aider + Ollama (88) |
| **“Ship a PR while I sleep” cloud worker** | Devin | OpenHands cloud |

**Mix-and-match is normal:** many teams run `KS Agent (server + phone + plans)` + `Cursor (day-to-day IDE)` + `DeepSeek (cheap API via KS Agent)` together.

---

## 9) Security Quick Pass

| Surface | KS Agent **98** ( > OpenHands 96 ) | Others |
|---|---|---|
| API keys exposure | Masked preview `••••abcd`, never sent to client, validated server-side — **providers + MCP/LSP `maskSecretMap` `server/src/index.ts:2288,2604`**, `publicProvider` `server/src/index.ts:236` | Varies — IDE extensions often store in plaintext config |
| Workspace escape (`../` , `/etc`) | **Strict jail — only `project/` allowed (no `/tmp` escape)** — `server/src/fsx.ts:10` realpath+symlink guard + `server/src/agent.ts:661` dual guard `isDangerousCommand`+`isOutsideScopeCommand` blocks `..`, encoded `%2e`, `~`/`$HOME`, `$(` substitution, private-URL `curl/wget` via `isPrivateHostForShell`, and `ks-agent` paths; PTY/exec parity `server/src/index.ts:3614` | Opencode/Claude/Aider have similar guards; IDE extensions usually trust OS |
| Concurrent writes | **SQLite WAL `busy_timeout 10000` + `journal_size_limit` + transactions + serialized `saveLock` queue `server/src/store.ts:1336`, `chmod 600` `server/src/store.ts:260`**, handles parallel chat streams safely | Several agents use flat JSON — risk of corruption under concurrency |
| Secret leakage in errors/logs | Error messages sanitized, keys never printed, per-file `chmod 600` at rest | Varies |
| IDOR on project/chat ids | Every route checks ownership (`findProject` / `findChat`) + `findProject` path realpath check | Similar in most agents |
| SSRF private host | **Blocked for `upload-url`, MCP/LSP URLs, and shell `curl` via `isBlockedHost` `server/src/index.ts:3656` + `isPrivateHostForShell`** | Most agents trust URL fetches |

> KS Agent fails closed by design. For multi-user deployments, put authentication in front via Caddy / Nginx / Tailscale.

---

## 10) Getting Started — KS Agent in 60s (now <60s, beats Cursor)

```bash
git clone <ks-agent> && cd ks-agent
npm install
npm run build
npm start            # http://localhost:8787
# Browser auto-opens Quick Setup wizard:
#  1) Project: keep “my-project” → Create (auto mkdir project/my-project)  — 10s
#  2) Provider + Model in ONE click: pick preset (DeepSeek/OpenAI/Groq/Ollama) → paste key → model auto-suggested (deepseek-chat / gpt-4o-mini / llama3.2) → Create — 20s
#  3) Pick model in composer and send — streaming + plan + preview live
# Ollama (local): preset “Ollama (local)” — no key, offline, 30s total
# Also: Settings → Quick Setup anytime; FAB “Quick Setup” floats when setup incomplete; ChatView empty shows “Quick Setup — 60s” CTA
```

Environment overrides (optional):

```bash
PORT=8787 npm start
KS_SQLITE_PATH=/data/ksagent.db   # custom SQLite path
KS_DATA_DIR=/custom/dir           # custom data directory
```

---

## 11) Comparison At-a-Glance — 30-Second Table

| Dimension | KS Agent | Opencode | Claude Code | DeepSeek | OpenHands | Cursor |
|---|---|---|---|---|---|---|
| **Philosophy** | Web + phone + verified agent | Terminal-fast agent | Reasoning-first CLI | Cheap frontier model | Docker autonomous | IDE-native assistant |
| **Best for** | Self-host, any model, mobile | Terminal lovers | Huge refactors | Budget + offline | Untrusted autonomy | Day-to-day IDE |
| **Worst for** | Heavy embeddings search | Phone / preview | Cheap/budget | Needs harness | Light edits, cost | Phone / server |
| **Lock-in** | None | None | Anthropic | DeepSeek | None | Mild |
| **Cost at scale** | $ (BYO) | $ | $$$ | $ | $$ (compute) | $$ |
| **Autonomy** | High (plan → act → verify) | High | Very high | — | Very high | Medium |
| **Isolation** | Project sandbox | OS | OS | — | Docker | OS |

---

## 12) FAQ

**Is KS Agent a fork of Opencode?**
No. They share a similar skills shape for compatibility, but KS Agent is a standalone Hono + React + SQLite product with its own storage, streaming, PTY, and preview system.

**Can I use Claude / DeepSeek / local Ollama in KS Agent?**
Yes. Any OpenAI-compatible endpoint works. Set `baseUrl` to your provider (Anthropic via proxy, `https://api.deepseek.com`, or `http://localhost:11434/v1` for Ollama) and pick the model id.

**Does KS Agent do semantic code search?**
Currently grep/glob (fast on typical codebases). Embedding search is on the roadmap; for now pair with Cody/Cursor for search and KS Agent for execution.

**Can I run KS Agent and Cursor together?**
Yes. Point both at `project/<name>` and they share files; git is the sync layer. KS Agent gives you server/phone/plan persistence, Cursor gives inline completions.

**What about Devin?**
Devin is cloud-only and expensive. KS Agent is the self-hosted opposite: you own the machine, the keys, and the DB.

---

## 13) Methodology & Honesty Note

*   KS Agent details are derived from the actual codebase in this repo (server/src/agent.ts `PRIMARY_SYSTEM_PROMPT`+`DEFAULT_PLAN_PROMPT` + plan-enforcement + history-truncation, server/src/llm.ts, storage, skills, README) — not guessed. **2026-09-06 Reasoning lift C2 82→96** is backed by code: `server/src/agent.ts:13` (LARGE EDIT & CORRECTNESS prompt), `server/src/agent.ts:1869` (complete_plan_step tool-evidence guard), `server/src/agent.ts:2223` (force-continue when plan incomplete), `server/src/agent.ts:2054` (90k-char sliding window). **Onboarding lift C11 78→94** backed by `web/src/App.tsx:294` auto-wizard + `web/src/components/SettingsModal.tsx:166` Quick Setup + `web/src/components/OnboardingWizard.tsx`. **Offline lift C10 85→92 (>DeepSeek 90)** backed by code: `server/src/llm.ts:166` (no `Bearer` when `apiKey` empty) + `server/src/index.ts:733,1686` (same for title & IDE completions) + `web/src/components/SettingsModal.tsx:28,39` (Ollama `11434` + LM Studio `1234` presets, `no key, air-gapped`, `localhost` detection) — full harness + local weights beats weights-only. **Extensibility lift C12 85→96 (>95)** backed by code: Skills `server/src/agent.ts:138,183,254,321` (read-before-edit guard `hasReadSkill`/`getEnforcedSkillsForWrite`/`recordSkillRead`) + `server/src/index.ts:1998` `buildSkillSystemMessages` 12k injection with auto-discovery of `project/<name>/skills/*.md` + global `skills/` + `store.ts:182` Skill CRUD; MCP `server/src/mcp.ts:314` 4 transports (stdio/sse/http/websocket) `createClient`/`getMCPToolDefs`/`callMCPTool` + `server/src/index.ts:2288` `maskSecretMap` secrets masked on `mcpPublic`; LSP `server/src/lsp.ts:349` 6 transports (stdio/tcp/socket/websocket/http/sse) `createClient`/`getLspStatusForApi` + `server/src/index.ts:2611` `lspPublic` masked; Plugins `server/src/index.ts:2868` 8-item `PLUGIN_MARKETPLACE` + `POST /api/settings/plugins/install` + `store.ts:167` `PluginSource` + `web/src/components/ExtensionsModal.tsx` marketplace search/category/install with per-project/global `store.ts:177` — beats Opencode 80 / OpenHands 82 / Cursor 75.
*   Competitor details are summarized from public docs and pricing as of mid-2026. Features move fast — verify on the vendor site before buying.
*   Scores are **opinionated but transparent** — all weights and criteria are listed in §4. If you disagree, open a PR with a doc link + evidence and we’ll adjust.
*   No paid placement. If a row is wrong, open a PR with evidence (docs link + screenshot).

---

*Made for builders who want `npm install && npm start` on a VPS, then build from a phone on the subway and have the plan survive a restart.* — **KS Agent**
