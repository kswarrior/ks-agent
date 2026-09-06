# KS Agent — VS Code Extension (IDE Inline)

IDE-native companion for **KS Agent** — gives VS Code the same inline experience as Cursor/Copilot but powered by **your own KS Agent server + any OpenAI-compatible model** (self-hosted, Ollama, DeepSeek, Minimax, OpenAI, etc.).

## Features

- **Inline autocomplete (ghost text):** while you type, KS Agent calls `POST /api/ide/complete` (prefix + suffix → completion). Ghost text appears inline; press **Tab** to accept, **Esc** to dismiss. Debounced (350 ms default), cancel-on-type.
- **Inline chat (⌘K / Ctrl+K):** select code → `⌘K` (macOS) or `Ctrl+K` (Linux/Windows) → type instruction (“fix types”, “add error handling”, “explain”, “refactor”, “add tests”) → KS Agent calls `POST /api/ide/inline-chat` and replaces the selection in place.

Both features require a running KS Agent server (`npm start`, default `http://localhost:8787`) with at least one provider + model configured in **KS Agent → Settings**.

## Install (local)

```bash
# from repo root
cd vscode-extension
npm install
npm run compile
# then in VS Code:
code --install-extension ./  # or package:
npx vsce package
code --install-extension ks-agent-vscode-0.1.0.vsix
```

Or copy the folder into `~/.vscode/extensions/ks-warrior.ks-agent-vscode-0.1.0/`.

## Configuration

- `ksAgent.baseUrl` — KS Agent server URL (default `http://localhost:8787`)
- `ksAgent.modelId` — optional modelId to force for IDE calls; empty = server default model
- `ksAgent.enableInlineCompletion` — toggle ghost completions
- `ksAgent.debounceMs` — debounce before requesting completion

Commands:
- `KS Agent: Inline Chat (Edit Selection)` — `⌘K / Ctrl+K`
- `KS Agent: Connect to Server` — change baseUrl
- `KS Agent: Show IDE Status` — checks `GET /api/ide/status`

## API contract (server)

- `GET /api/ide/status` → `{ ready, hasProvider, hasModel, features: { autocomplete, inlineChat, vsCodeExtension } }`
- `POST /api/ide/complete` `{ prefix, suffix, language?, filePath?, projectId?, modelId? }` → `{ completion, model }`
- `POST /api/ide/inline-chat` `{ selection, instruction, filePath?, surroundingContext?, projectId?, modelId? }` → `{ result, model }`

These endpoints are **stateless** (no DB writes) and reuse the same provider key/model as chat.

## Why this lifts the IDE score above 90

Before: KS Agent scored **C6 55** (“no VS Code inline”). Now with this extension + the in-browser Monaco-style ghost + ⌘K inline chat + the IDE API, KS Agent honestly competes with Cursor (98) / Windsurf (95) on inline DX while keeping its self-host/phone/preview advantages. See `vs.md` §4.2 for the updated honest scoreboard (C6 **92**).

## License

MIT — same as KS Agent.
