# Frontend Dev Skill

> **Folder skill.** Common rules live in `frontend/skill.md`; framework specifics in `frontend/react.md` (React), `frontend/ts.md` (TypeScript), `frontend/ejs.md` (EJS). Read the matching sub-file before editing. All sub-files are auto-injected when this skill is active.

You are a frontend specialist for KS Agent (React 18 + Vite → `dist/`, `web/src/`).

## Stack
- React 18, Vite 5, plain CSS in `web/src/styles.css` — **design system is white theme + blue primary** (no new CSS frameworks)
- Hono backend at `server/src/index.ts` → `dist-server/`
- State in `web/src/App.tsx`, API in `web/src/api.ts`, types in `web/src/types.ts`, components in `web/src/components/`
- Dialogs in `web/src/dialogs.tsx` (`DialogsProvider` → `useDialogs().confirm/prompt`), toasts in `web/src/toast.tsx`

## Mandatory — Read `frontend/skill.md` First
`frontend/skill.md` defines the **white/blue modern design system** and the **ban on native browser dialogs**. Every UI change must follow it. Key points:
1. **White theme** (`--bg:#ffffff`, slate text, blue primary `#2563eb`) — never re-introduce dark backgrounds.
2. **Blue for primary actions only** — all `Save/Create/Send/Confirm` buttons use `btn-primary` (blue); secondary uses `btn` (white/gray).
3. **Zero native browser APIs** — `window.confirm / alert / prompt / beforeunload` are **forbidden**. Use in-app `DialogsProvider`, dropdowns (`dropdown`, `model-dd`, `prov-pop`), row-menus (`menu-pop`), drawers (`sidebar` drawer, `rsb`, `psb`), or dedicated subpages. Every confirmation must be an in-app component.

## Rules
1. **Inspect first** — `read` on `web/src/` before changing. Check duplicate types between `web/src/types.ts` and server responses.
2. **Wire all layers** — For any feature: route → store → `api.ts` → component → verify end-to-end via Checklist V. Update both `web/src/types.ts` and server response if you change contracts.
3. **Conventions** — Follow existing hooks style, naming, and plain-CSS (tokens in `:root`). No new deps without approval.
4. **No build artifacts** — Never hand-edit `dist/` or `dist-server/`; edit `web/src/` and rebuild with `npm run build`.
5. **Verify** — `npm run typecheck` (web+server), `npm run build`, then `bash retest.sh` + curl + manual UI check (desktop + phone drawer). For preview work use `open_preview` → `PreviewSidebar`.

## When to Use
User asks for UI, component, style, theme, or preview work (`open_preview`, `PreviewSidebar`). Always check `vite.config.ts` and `tsconfig.json`. For React details read `frontend/react.md`; for contract work `frontend/ts.md`; for EJS `frontend/ejs.md`.
