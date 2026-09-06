# KS Agent vs Popular AI Coding Agents — Full Comparison (2026)

> **Last updated:** 2026-09-06 · **Author:** ks warrior · **KS Agent v0.1.0**
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

**KS Agent** (`ks-agent/ks-agent`) — web-based AI coding agent by **ks warrior**.

*   **Stack:** Node + Hono (REST + SSE streaming) → `dist-server/`, React 18 + Vite → `dist/`, SQLite (`storage/ksagent.db`, WAL, auto-migrates from `data/db.json`), PTY + xterm.js + WebSockets.
*   **UI:** Pure black theme, desktop + phone. Sidebar drawer on `<900px`, 3-panel layout: Projects/Chats | Chat + Composer | Plan/Activities + Preview + Terminal.
*   **Models:** Any **OpenAI-compatible provider** — OpenAI, Anthropic via proxy, DeepSeek, Minimax, Ollama, LM Studio, etc. Config per-provider + per-model (baseURL, key, displayName, maxTokens, per-model systemPrompt override).
*   **Isolation:** `PRIMARY_WORKSPACE = ${projectfolder}` only. Agent has **zero permission outside** `project/` (plus `/tmp`). Every `read/edit/write/run_shell` is validated with `relWithin` + `resolveInProject`. Blocked paths (`/etc`, `/usr`, `/root`, `~`) are rejected server-side.
*   **Streaming:** SSE via `hono/streaming` + `streamChatWithTools`, idle timeout 600s, auto-retry with exponential backoff, `continue` / resume (update-in-place), `autoContinue` on truncated plans.
*   **Loop:** Enforced methodology (`loop.md`): `CHECKLIST V (V1-V10)` + `THE LOOP` failure engine. No task is done until typecheck + build + `retest.sh` health probe pass.
*   **Artifacts per chat (persisted):** `Plan` (create_plan / complete_plan_step) → `Activities` (read/write/edit/list/grep/glob/run_shell/ask_question/open_preview) → `Preview` (one live port per chat) → `Terminal` (real PTY per project) → `Questions` (ask_question blocks until answered).
*   **Extensibility:** Skills (`skills/*.md` injected + must be `read_file` before edit), MCP servers (stdio/sse/http/websocket), LSP servers, Plugins (manual/marketplace/local/url). Global or per-project scope.

```bash
npm install && npm run build && npm start   # :8787  (or PORT=8080 bash retest.sh)
# Settings → Providers → Add baseURL + key → Models → Add → pick in composer
```

---

## 2) Contenders at a Glance

| Agent | Maker | Type | Runs where | Default UI | Model lock-in | Self-host | Open source |
|---|---|---|---|---|---|---|---|
| **KS Agent** | ks warrior | Web agent | Your server / VPS / laptop / phone browser | Web (black, responsive) | **No** — any OpenAI-compatible | Yes, single `node` | Yes (MIT-style) |
| **Opencode** | SST | Terminal agent | Local / SSH | TUI (terminal) + optional web | No — pluggable | Yes (Go binary) | Yes |
| **Claude Code** | Anthropic | CLI agent | Local CLI | Terminal | **Yes** — Claude 3.5/4 Sonnet & Opus | No | No (closed CLI) |
| **DeepSeek Coder** | DeepSeek | API + agent | API / local weights | API / chat.deepseek.com | Yes — DeepSeek V3/R1 | Weights open | Weights open, API closed |
| **OpenHands** | All Hands AI | Autonomous sandbox | Docker | Web + CLI | No — any LLM | Yes (Docker) | Yes (MIT) |
| **Cursor** | Cursor Inc. | VS Code fork | Desktop app | IDE | No — many (OpenAI/Claude/custom) | No | No |
| **GitHub Copilot** | GitHub / OpenAI | IDE extension | IDE + CLI | IDE inline + chat | Yes — Copilot models | No | No |
| **Aider** | Paul Gauthier | Terminal pair-prog | Local CLI | Terminal + git | No — 100+ models | Yes (Python) | Yes (Apache-2) |
| **Cline / Roo** | Cline team | VS Code extension | VS Code | IDE sidebar + auto-approve | No — any API | Partial | Yes |
| **Windsurf (Codeium)** | Codeium | IDE app + ext | Desktop / VS Code / JB | IDE | No | No | No |
| **Continue.dev** | Continue | IDE extension | VS Code / JetBrains | IDE sidebar | No — bring your own | Yes | Yes |
| **Cody** | Sourcegraph | Code search + chat | IDE / web | IDE / web | No | No (cloud) / Yes (enterprise) | No |
| **Devin** | Cognition | Cloud engineer | Cloud VM | Web | Yes — Devin stack | No | No |

---

## 3) Feature Matrix — Detailed

Legend: `✅` native · `🔶` partial / plugin · `❌` no · `—` not applicable

| Feature | KS Agent | Opencode | Claude Code | DeepSeek | OpenHands | Cursor | Aider | Cline | Continue | Windsurf | Cody |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Any OpenAI-compatible provider** | ✅ | ✅ | ❌ | 🔶 via API | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔶 |
| **Streaming (SSE) + stop/resume** | ✅ SSE + `continue` + auto-continue | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ stream | ✅ | ✅ | ✅ | ✅ |
| **Auto-retry + exponential backoff** | ✅ configurable `retrySettings` | 🔶 | ✅ | ❌ | 🔶 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Plan mode (create_plan → steps → verify)** | ✅ first-class, persisted per chat | ✅ skills | ✅ built-in plan / read-only | ❌ | ✅ micro-agent planner | 🔶 agent plan | ❌ ask/architect | ✅ plan/act | ❌ | 🔶 cascade | 🔶 |
| **Tool calls (read/write/edit/shell/grep/glob)** | ✅ 16 tools + shell 300s | ✅ | ✅ | 🔶 via function call | ✅ + browser | ✅ | ✅ | ✅ | 🔶 | ✅ | 🔶 |
| **Ask question (blocks until human answers)** | ✅ `ask_question` (blocking) | 🔶 | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Live preview on port (`open_preview`)** | ✅ one per chat, `PreviewSidebar` iframe | ❌ | ❌ | ❌ | ✅ browser | ✅ preview | ❌ | ✅ browser | ❌ | ✅ | ❌ |
| **Real PTY terminal** | ✅ `node-pty` + xterm + WS, per project | ✅ | ✅ bash tool | ❌ | ✅ Docker shell | ✅ | ✅ shell | ✅ | ❌ | ✅ | ❌ |
| **Activities timeline (tool call history)** | ✅ persisted per chat | 🔶 log | ✅ trace | ❌ | ✅ events | 🔶 history | ✅ git diff | ✅ timeline | ❌ | 🔶 | ❌ |
| **Multi-project workspaces** | ✅ Projects (`project/ks`, `project/*`) isolated | 🔶 workspaces | ✅ per repo | — | ✅ workspaces | ✅ workspaces | ✅ per repo | ✅ | ✅ | ✅ | ✅ enterprise |
| **Multi-chat per project (Chat seq, title LLM)** | ✅ `Chat #N` + LLM title | ✅ sessions | ✅ sessions | ✅ chats | ✅ sessions | ✅ | ❌ single session | ✅ | ✅ | ✅ | ✅ |
| **Skills / prompts injected** | ✅ `skills/*.md` + frontend sub-skills, must read before edit | ✅ `.opencode/skills` | ✅ `CLAUDE.md` | ❌ | ✅ micro-agents | ✅ `.cursorrules` | ✅ `CONVENTIONS.md` | ✅ rules | ✅ prompts | ✅ rules | ✅ Cody context |
| **MCP / LSP / Plugins** | ✅ MCP+ LSP+ Plugins (global/project) | ✅ MCP/LSP | ✅ MCP | ❌ | ✅ tools | ✅ MCP | ❌ | ✅ MCP | ✅ MCP | 🔶 | 🔶 |
| **Mobile / phone usable** | ✅ fully responsive, drawer | ❌ terminal only | ❌ | ✅ web | 🔶 web but heavy | ❌ | ❌ | ❌ | ❌ | ❌ | 🔶 |
| **Codebase search (grep/glob vs embeddings)** | ✅ grep + glob (20k files) | ✅ grep/glob | ✅ grep + embeddings | 🔶 embeddings | ✅ | ✅ embeddings + grep | ✅ grep | ✅ | ✅ embeddings | ✅ embeddings | ✅ **best** embeddings |
| **Git integration** | 🔶 via shell (no force-push guard) | ✅ | ✅ | ❌ | ✅ git + PR | ✅ | ✅ **git-native** diff/commit | ✅ | ❌ | ✅ | ✅ |
| **Secrets stay server-side (masked `keyPreview`)** | ✅ never sent to client | ✅ | ✅ | — | 🔶 env in Docker | ❌ local keys | ✅ | ❌ | ✅ | ❌ | ✅ |
| **Offline / air-gapped** | ✅ Ollama / LM Studio | ✅ Ollama | ❌ | ✅ local weights | ✅ local LLM | ❌ | ✅ Ollama | ✅ Ollama | ✅ Ollama | ❌ | ❌ enterprise |
| **Concurrency-safe storage** | ✅ SQLite WAL + FK + txn + busy_timeout | ✅ | — | — | — | — | — | — | — | — | — |
| **Typecheck / build loop enforced** | ✅ `loop.md` → V7 `npm run typecheck && build && retest.sh` | 🔶 manual | 🔶 manual | — | 🔶 | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 4) Architecture Comparison

### KS Agent
```
Browser (React + Vite, xterm.js, react-markdown)
  ↕ REST + SSE + WS
Hono (Node) ── streamChatWithTools ── OpenAI-compatible API
  ↕ better-sqlite3 (WAL) ── storage/ksagent.db
  ↕ node-pty (per project) ── WebSocket bridge
  ↕ FS guard (resolveInProject / relWithin) ── project/<name>/
```
*Single process, single binary after `npm run build`. Scales vertically. SQLite FK `ON DELETE CASCADE/SET NULL`, transaction bulk-replace in `store.ts:641`. Perfect for VPS/home lab.*

### Opencode
Go binary + TUI renderer, SSH-friendly, config `opencode.json` points to `skills/`. Very fast cold start, tiny memory. No browser needed.

### Claude Code
Rust/TS CLI that talks to Anthropic API. Deep codebase map via embeddings + agentic loop. Best at “understand 200 files then plan”. Closed source.

### DeepSeek
Not an agent runtime — a **model family** (V3 general, R1 reasoning, Coder). You bring the harness (KS Agent, Aider, Continue, own). Strength: cheap frontier quality + open weights.

### OpenHands
Python orchestrator → Docker sandbox per task → LLM → tools (bash, browser, editor) → git patch. Heaviest but most isolated. Great for “run untrusted code”.

### Cursor / Windsurf / Copilot / Cline / Continue
All IDE-centric. They win when you want inline completions while typing. They lose when you want phone access, server persistence, or project isolation beyond the open folder.

---

## 5) Pricing (Sep 2026, public tiers)

| Agent | Free tier | Paid (individual) | Notes |
|---|---|---|---|
| **KS Agent** | **Free forever** (MIT, you pay only model API) | Bring your own key. e.g. DeepSeek $0.14/$0.28 per 1M tokens, Ollama $0 | Cheapest long-run if you self-host |
| **Opencode** | Free OSS | Free (pay model only) | Same as KS Agent — BYO key |
| **Claude Code** | Included in Claude Pro $20/mo (rate-limited) | Claude Max $100/mo (20×) or API pay-go | Opus is $$ (~$15/75 per 1M in/out). Best quality, highest bill |
| **DeepSeek API** | Free chat tier | V3 $0.27/$1.10 per 1M (in/out, cached cheap) — cheapest frontier | R1 reasoning ~$0.55/$2.19. Best price/perf |
| **OpenHands** | OSS (self-host Docker) | Cloud $ pay-per-eval | Heavy Docker cost if self-hosted |
| **Cursor** | Hobby free (2k completions, 50 slow) | Pro $20/mo, Business $40/mo | Fast bill if using Max/Opus via Cursor |
| **GitHub Copilot** | Free for students/OSS, 50 chats free | Pro $10/mo, Pro+ $39/mo, Business $19/user | Cheapest IDE play, great completions |
| **Aider** | Free OSS | Pay model only (often cheapest — git diffs are token-efficient) | Very cost-efficient |
| **Cline** | Free ext | Pay model only | Same as Aider |
| **Continue** | Free OSS | Pay model only | Best free BYO |
| **Windsurf** | Free 200 credits | Pro $10/mo (500 credits), Teams $25 | Good value, generous free |
| **Cody** | Free personal | Pro $9/mo, Enterprise quoted | Pays off on huge monorepos |
| **Devin** | — | $500/mo (teams) | Expensive, but replaces junior eng |

> Prices move. Check provider pages at time of purchase. KS Agent itself has **no per-seat fee**.

---

## 6) Deep Dive — Strengths & Weaknesses

### KS Agent — strengths
*   Any model, zero lock-in, keys never leave server (`store.ts:236` masked `keyPreview`).
*   Phone-usable. Real use case: fix prod from bus, continue plan later — `continue` resumes truncated streaming seamlessly.
*   `THE LOOP` + `CHECKLIST V` — only agent that **refuses** to mark done until `typecheck + build + retest.sh` pass with real output.
*   One preview per chat (`PreviewSidebar` iframe) — build a Vite/Next site and see it live without leaving the chat.
*   True PTY (not fake shell) — `vim`, `htop`, `npm run dev` all work.
*   SQLite WAL persistence: projects/chats/messages/plans/activities/questions/terminals/skills/previews/mcp/lsp/plugins survive restart, re-hydrate with `loadFromSqlite`.

### KS Agent — weaknesses
*   No embeddings / semantic code search yet (grep/glob only; codes with >20k files may be slower).
*   No native VS Code integration — you live in browser, not editor.
*   No cloud auth (single-tenant; add reverse proxy if multi-user).
*   No built-in git PR automation (do it via shell `gh pr create`).

### Opencode — strengths
Terminal-purist delight, instant start, tiny footprint, great keyboard flow.

### Opencode — weaknesses
No phone UI, no SSE preview, no persisted plan timeline per chat like KS Agent.

### Claude Code — strengths
Best-in-class reasoning on large codebases, excellent `CLAUDE.md` + plan mode, handles ambiguous asks well.

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
Unbeatable inline experience while you type; huge ecosystem.

### Cursor / Copilot / Windsurf — weaknesses
Locked to editor, weak multi-step autonomy, no server persistence, not phone-usable.

### Aider — strengths
Most token-efficient (git-diff context), works with any model including cheap local, fantastic for refactors.

### Aider — weaknesses
Terminal-only, single-session, no preview/terminal/skills ecosystem.

---

## 7) When to Choose What

| Scenario | Best pick | Runner-up |
|---|---|---|
| **Self-host on VPS, use from laptop + phone, any model** | **KS Agent** | Opencode + SSH |
| **Live terminal all day, want lowest latency** | Opencode | Aider |
| **Big refactor on 200-file repo, need deep plan first** | Claude Code | KS Agent (create_plan) / OpenHands |
| **Cheapest strong model for daily coding** | DeepSeek (via KS Agent / Aider / Continue) | KS Agent + Ollama (free) |
| **Untrusted / student code, must sandbox** | OpenHands (Docker) | KS Agent (`project/` jail + blocked paths) |
| **Stay in VS Code, want autocomplete + chat** | Cursor | Copilot / Windsurf / Cline |
| **Enterprise monorepo with powerful code search** | Cody | Cursor + embeddings |
| **Git-heavy workflow (commit-per-change, review diff)** | Aider | KS Agent shell + `gh` |
| **Air-gapped / offline** | Continue / Aider / KS Agent + Ollama | Opencode + Ollama |
| **“Ship a PR while I sleep” cloud worker** | Devin | OpenHands cloud |

**Mix-and-match is normal:** many teams run `KS Agent (server + phone + plans)` + `Cursor (day-to-day IDE)` + `DeepSeek (cheap API via KS Agent)` together.

---

## 8) Security Quick Pass

| Surface | KS Agent | Others |
|---|---|---|
| API keys exposure | Masked `••••last4`, never sent to client, `validate server-side` | Varies — IDE extensions often store in plaintext config |
| Workspace escape (`../` , `/etc`) | Blocked via `isBlockedProjectPath` + `resolveInProject` (`index.ts:215`) | Opencode/Claude/Aider have similar guards; IDE extensions usually trust OS |
| Concurrent writes | SQLite WAL + `busy_timeout 5000` + transactional `persistToSqlite` (`store.ts:758`) | Filesystem JSON in many agents risks corruption under concurrency |
| Secret leakage in errors/logs | `error.message` sanitized, keys not printed | Varies |
| IDOR on project/chat ids | `findProject` / `findChat` checked per route (`index.ts:329`) | Similar in most agents |

> KS Agent fails **closed** by design (`loop.md:3` Edit Rules). If you add auth, put it in front via Caddy/Nginx.

---

## 9) Getting Started — KS Agent in 60s

```bash
git clone <ks-agent> && cd ks-agent
npm install
npm run build        # tsc (server) + vite (web)
npm start            # http://localhost:8787
# open Settings → Providers → Add → Model → Add → pick in composer → chat
# phone: http://<your-vps-ip>:8787  (put behind Tailscale/Caddy for TLS)
```

Environment:

```bash
KS_SQLITE_PATH=/data/ksagent.db   # override default storage/ksagent.db
KS_DATA_DIR=/custom/dir           # legacy alias
PORT=8080 bash retest.sh          # build-if-needed + run + health GET /api/projects
```

---

## 10) Comparison At-a-Glance — 30-Second Table

| Dimension | KS Agent | Opencode | Claude Code | DeepSeek | OpenHands | Cursor |
|---|---|---|---|---|---|---|
| **Philosophy** | Web + phone + loop-verified agent | Terminal-fast agent | Reasoning-first CLI | Cheap frontier model | Docker autonomous | IDE-native assistant |
| **Best for** | Self-host, any model, mobile | Terminal lovers | Huge refactors | Budget + offline | Untrusted autonomy | Day-to-day IDE |
| **Worst for** | Heavy embeddings search | Phone / preview | Cheap/budget | Needs harness | Light edits, cost | Phone / server |
| **Lock-in** | None | None | Anthropic | DeepSeek | None | Mild |
| **Cost at scale** | $ (BYO) | $ | $$$ | $ | $$ (compute) | $$ |
| **Autonomy** | High (plan→act→verify→retry) | High | Very high | — | Very high | Medium |
| **Isolation** | `project/` jail | OS | OS | — | Docker | OS |

---

## 11) FAQ

**Is KS Agent a fork of Opencode?**
No. It shares the `opencode.json` skills shape and `loop.md` discipline for compatibility, but is a standalone Hono + React + SQLite product with its own storage, SSE, PTY, and preview system.

**Can I use Claude / DeepSeek / local Ollama in KS Agent?**
Yes. Any OpenAI-compatible endpoint works. Set `baseUrl` to `https://api.anthropic.com/v1`-via-proxy, `https://api.deepseek.com`, or `http://localhost:11434/v1` (Ollama) and pick the model id.

**Does KS Agent do semantic code search?**
Currently grep/glob (fast on <20k files). Embedding search is on the roadmap; for now pair with Cody/Cursor for search and KS Agent for execution.

**Can I run KS Agent and Cursor together?**
Yes. Point both at `project/<name>` and they share files; git is the sync layer. KS Agent enforces loop-verified builds, Cursor gives inline completions.

**What about Devin?**
Devin is cloud-only and $$$. KS Agent is the self-hosted opposite: you own the machine, the keys, and the DB.

---

## 12) Methodology & Honesty Note

*   KS Agent details are read from this repo (`server/src/index.ts`, `store.ts`, `agent.ts`, `web/src/App.tsx`, `package.json`, `loop.md`, `README.md`) — not guessed.
*   Competitor details are summarized from public docs/pricing as of mid-2026. Features move fast — verify on the vendor site before buying.
*   No paid placement. If a row is wrong, PR it with evidence (`grep` + docs link) — the loop demands real output.

---

*Made for builders who want `npm install && npm start` on a VPS, then build from a phone on the subway and have the plan survive a restart.* — **KS Agent**
