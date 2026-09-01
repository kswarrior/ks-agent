# React Skill — Frontend/React

Use with `frontend/skill.md` (common). This file covers **React 18** specifics for KS Agent's `web/src/`.

## Stack & Files
- `web/src/App.tsx` — top state, `useState`/`useEffect`, `subsRef` for SSE, `activeChatIdRef`
- `web/src/api.ts` — `req<T>` fetch wrapper, `streamChatEvents` SSE reader
- `web/src/components/*` — `ChatView`, `Sidebar`, `Header`, `SettingsModal`, `ExtensionsModal`, `XTermTerminal`
- `web/src/styles.css` — **black + blue design system (default, white via Theme)** (plain CSS, no framework) — tokens in `:root`, runtime override via `web/src/theme.ts`

## Patterns
- **Hooks style** — Follow existing `useState`, `useEffect`, `useCallback`, `useRef` as in `App.tsx`. Keep deps arrays correct; use `useRef` for latest values inside SSE callbacks.
- **State wiring** — For any new feature: add state in `App.tsx` → pass via props → component → API call → `setX` → verify. Update `web/src/types.ts` if you add a new model.
- **Components** — Functional components only, named exports, no class components. Props interfaces at top. Keep files <300 LOC; split if larger.
- **Keys & lists** — Use stable `id` for `key`, never index. For chat/message lists, sort as `types.ts` does.
- **Performance** — `React.memo` only when measured; prefer `useCallback` for handlers passed to children.

## Black/Blue UI in React (white via Theme)
- Use token classes: `btn` (secondary), `btn-primary` (blue), `btn-danger`, `input`, `search-input`, `dialog`, `dropdown`, `menu-pop`, `overlay`, `modal-lg`. Do not inline hard-coded `#000`/`#fff`; use `var(--btn)`, `var(--surface)`, `var(--border)`, `var(--text)` so Theme switch works.
- Primary button: exactly one `btn-primary` per modal/view. Example: `<button className="btn btn-primary">Save</button>`. Secondary: `<button className="btn">Cancel</button>`.
- All inputs use `input`/`search-input`/`composer-input` — `background:var(--input)`, `border:1px solid var(--border)`, focus `0 0 0 3px var(--primary-ring)`.
- Header/sidebar/surfaces use `var(--surface)` + `var(--border)` dividers — not hard-coded.

## No Native Browser Dialogs — React Rules
- **Never** call `window.confirm/alert/prompt`. Always use:
  ```tsx
  import { useDialogs } from '../dialogs'
  const { confirm, prompt } = useDialogs()
  const ok = await confirm({ title: 'Delete "…"?', message: '…', danger:true, confirmText:'Delete' })
  const {confirmed, checked} = await confirm({ title:'Delete project?', checkboxLabel:'Also delete folder from disk', checkboxWarning:'…', danger:true })
  const name = await prompt({ title:'Rename chat', label:'Title', value: chat.title })
  ```
- For non-blocking choices: dropdown (`dropdown` + `dd-item`), filter chip (`filter-chip` → `prov-pop`), row menu (`menu-pop menu-pop-fixed` via `createPortal` to `document.body`), drawer (`sidebar`/`rsb`/`psb`). Copy patterns from `Sidebar.tsx:34` (`useClickOutside`) and `Sidebar.tsx:85` (`toggleMenu` with portal positioning).
- Popovers/dropdowns must: close on `Escape` + outside `pointerdown` + `scroll`/`resize`, as in `Sidebar.tsx:63` and `ChatView.tsx:352`. Reuse that boilerplate.
- If you scaffold a new project (Vite/Next/EJS preview), scaffold the same in-app dialog system there — do not leave `confirm()` in generated templates.

## Checklist
- [ ] Inspected `web/src/components` and `web/src/App.tsx` before changing
- [ ] Updated `web/src/types.ts` if contract changed (both directions `server ↔ web`)
- [ ] No new deps, no new CSS framework; used tokens (`var(--primary)`, `var(--bg)` etc) — works in black default and white via Theme
- [ ] **Zero** `window.confirm|alert|prompt` — grep `web/src` empty; all confirms via `useDialogs()`, all selects via dropdown/popover/drawer, color picks via `input[type=color]` + presets
- [ ] One primary (blue) per view; secondary uses `var(--btn)`; focus ring `var(--primary-ring)` visible
- [ ] `npm run typecheck && npm run build` passes
- [ ] Manual UI check on desktop + phone (sidebar drawer, right panel drawer, preview overlay) — default **black** theme, blue primary, theme switch to white works

## Preview
When the task builds a previewable site (Vite/Next), call `open_preview` with the port after verification — `PreviewSidebar` shows it per chat.
