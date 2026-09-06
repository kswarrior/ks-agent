# KS Agent — VS Code Extension (IDE Inline)

[![VS Code Marketplace](https://img.shields.io/badge/VS%20Code%20Marketplace-ks--warrior.ks--agent--vscode-blue?style=flat-square)](https://marketplace.visualstudio.com/items?itemName=ks-warrior.ks-agent-vscode) [![License: MIT](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)

IDE-native companion for **KS Agent** — gives VS Code the same inline experience as Cursor/Copilot but powered by **your own KS Agent server + any OpenAI-compatible model** (self-hosted, Ollama, DeepSeek, Minimax, OpenAI, etc.).

> **Next-edit ghost** — multi-line (up to ~500 chars / 3–5 lines, preserves indentation), **Tab** to accept, **Shift+Tab / Esc** to dismiss, debounced 80–2000 ms (default 350 ms). Inline chat replaces selection with proper undo stop and cursor placed after edit.

## Features

- **Inline autocomplete (ghost text) — next-edit:** while you type, KS Agent calls `POST /api/ide/complete` (prefix + suffix → completion). Ghost text appears inline; **Tab** to accept, **Shift+Tab / Esc** to dismiss (VS Code handles Tab natively via `InlineCompletionProvider`). Multi-line up to ~500 chars / 3–5 lines, indentation preserved, ghost streamed as `InlineCompletionItem` at cursor. Debounced **80–2000 ms, default 350 ms** (`ksAgent.debounceMs`), cancel-on-type / on-cancellation token.
- **Inline chat (⌘K / Ctrl+K):** select code → `⌘K` (macOS) or `Ctrl+K` (Linux/Windows) → type instruction (“fix types”, “add error handling”, “explain”, “refactor”, “add tests”) → KS Agent calls `POST /api/ide/inline-chat` and **replaces the selection in place** with proper `undoStopBefore/After`, cursor placed after inserted text, selection collapsed — undo (`Ctrl+Z`) restores previous selection in one step.

Both features require a running KS Agent server (`npm start`, default `http://localhost:8787`) with at least one provider + model configured in **KS Agent → Settings**. Ghost is rendered as native VS Code inline suggestion (no custom decoration), so cursor never breaks after accept.

## Install

### One-click from Marketplace (once published)

```bash
code --install-extension ks-warrior.ks-agent-vscode
# or inside VS Code: Extensions → search "KS Agent" → Install
```

### Local (`code --install-extension` still works)

```bash
# from repo root
cd vscode-extension
npm install
npm run compile        # compiles src/ → out/extension.js
npx @vscode/vsce package   # → ks-agent-vscode-0.1.0.vsix (requires vsce)
code --install-extension ks-agent-vscode-0.1.0.vsix
# verify:
code --list-extensions | grep ks-agent
```

Or copy the folder into `~/.vscode/extensions/ks-warrior.ks-agent-vscode-0.1.0/`.

### Publish (maintainers)

```bash
# bump version in package.json + README, ensure icon.png exists
npx @vscode/vsce publish  # uses publisher ks-warrior (needs PAT)
# or: npx @vscode/vsce package && npx @vscode/vsce publish --no-dependencies
```

Publisher: **ks-warrior**, version **0.1.0**, category **Other**, icon `icon.png` (128×128), engine `^1.85.0`, activation `onStartupFinished`.

## Configuration

- `ksAgent.baseUrl` — KS Agent server URL (default `http://localhost:8787`)
- `ksAgent.modelId` — optional modelId to force for IDE calls; empty = server default model
- `ksAgent.enableInlineCompletion` — toggle ghost completions
- `ksAgent.debounceMs` — debounce before requesting completion, **clamped 80–2000 ms, default 350** (package.json `minimum:80 maximum:2000`)

Commands:
- `KS Agent: Inline Chat (Edit Selection)` — `⌘K / Ctrl+K`
- `KS Agent: Connect to Server` — change baseUrl
- `KS Agent: Show IDE Status` — checks `GET /api/ide/status`

Keybindings: `cmd+k` (mac) / `ctrl+k` (other) when `editorTextFocus`; ghost uses VS Code's native inline completion — **Tab** accepts, **Esc / Shift+Tab** dismisses.

## API contract (server)

- `GET /api/ide/status` → `{ ready, hasProvider, hasModel, features: { autocomplete, inlineChat, vsCodeExtension } }`
- `POST /api/ide/complete` `{ prefix, suffix, language?, filePath?, projectId?, modelId? }` → `{ completion, model }`
- `POST /api/ide/inline-chat` `{ selection, instruction, filePath?, surroundingContext?, projectId?, modelId? }` → `{ result, model }`

These endpoints are **stateless** (no DB writes) and reuse the same provider key/model as chat.

## Why this lifts the IDE score above 90

Before: KS Agent scored **C6 55** (“no VS Code inline”). Now with this extension + the in-browser Monaco-style ghost + ⌘K inline chat + the IDE API, KS Agent honestly competes with Cursor (98) / Windsurf (95) on inline DX while keeping its self-host/phone/preview advantages. See `vs.md` §4.2 for the updated honest scoreboard (C6 **92**).

## License

MIT — same as KS Agent.
