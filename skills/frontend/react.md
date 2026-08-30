# React Skill — Frontend/React

Use with `frontend/skill.md` (common). This file covers **React 18** specifics for KS Agent's `web/src/`.

## Stack & Files
- `web/src/App.tsx` — top state, `useState`/`useEffect`, `subsRef` for SSE, `activeChatIdRef`
- `web/src/api.ts` — `req<T>` fetch wrapper, `streamChatEvents` SSE reader
- `web/src/components/*` — `ChatView`, `Sidebar`, `Header`, `SettingsModal`, `ExtensionsModal`, `XTermTerminal`
- `web/src/styles.css` — hand-rolled dark theme, no framework

## Patterns
- **Hooks style** — Follow existing `useState`, `useEffect`, `useCallback`, `useRef` as in `App.tsx`. Keep deps arrays correct; use `useRef` for latest values inside SSE callbacks.
- **State wiring** — For any new feature: add state in `App.tsx` → pass via props → component → API call → `setX` → verify. Update `web/src/types.ts` if you add a new model.
- **Components** — Functional components only, named exports, no class components. Props interfaces at top. Keep files <300 LOC; split if larger.
- **Keys & lists** — Use stable `id` for `key`, never index. For chat/message lists, sort as `types.ts` does.
- **Performance** — `React.memo` only when measured; prefer `useCallback` for handlers passed to children.

## Checklist
- [ ] Inspected `web/src/components` and `web/src/App.tsx` before changing
- [ ] Updated `web/src/types.ts` if contract changed (both directions `server ↔ web`)
- [ ] No new deps, no new CSS framework
- [ ] `npm run typecheck && npm run build` passes
- [ ] Manual UI check on desktop + phone (sidebar drawer)

## Preview
When the task builds a previewable site (Vite/Next), call `open_preview` with the port after verification — `PreviewSidebar` shows it per chat.
