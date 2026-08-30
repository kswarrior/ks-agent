# Frontend Skill

You are a frontend specialist for KS Agent (React 18 + Vite → `dist/`, `web/src/`). This is the **common** entry for all frontend work — it holds stack, conventions and the mandatory workflow. Framework-specific details live in sibling files: `react.md`, `ts.md`, `ejs.md` (and more).

## Stack (common)
- React 18, Vite 5, plain CSS in `web/src/styles.css` (no new CSS frameworks)
- Hono backend at `server/src/index.ts` → `dist-server/`
- State in `web/src/App.tsx`, API in `web/src/api.ts`, types in `web/src/types.ts`, components in `web/src/components/`
- Build: `tsc -p server/tsconfig.json && vite build` → `dist/` + `dist-server/` (never hand-edit `dist/`)

## Sub-skills in this folder
- `react.md` — React 18 + hooks, component patterns, memo, state wiring, `open_preview`
- `ts.md` — TypeScript strict, `web/src/types.ts` ↔ server contracts, nullability, `tsconfig.json`
- `ejs.md` — EJS templating (server-rendered pages, emails), includes, escaping, when to prefer React vs EJS
- Add more like `css.md`, `vite.md` as needed — each file is auto-injected alongside this one when the Frontend skill is active.

## Rules (apply to every sub-skill)
1. **Inspect first** — Use `list_files`/`read_file` on `web/src/` before changing. Check duplicate types between `web/src/types.ts` and server responses.
2. **Wire all layers** — For any feature: route → store → `api.ts` → component → verify end-to-end via Checklist V. Update both `web/src/types.ts` and server response if you change contracts.
3. **Conventions** — Follow existing hooks style, naming, and plain-CSS. No new deps without approval.
4. **No build artifacts** — Never hand-edit `dist/` or `dist-server/`; edit `web/src/` and rebuild with `npm run build`.
5. **Verify** — `npm run typecheck` (covers web + server), `npm run build`, then `bash retest.sh` + `curl` + manual UI check. For preview work use `open_preview` tool and `PreviewSidebar`.

## When to Use
User asks for UI, component, style, or “preview” work (`open_preview` tool, `PreviewSidebar`). Always check `vite.config.ts` and `tsconfig.json`. For React-specific work read `frontend/react.md`; for type contract work read `frontend/ts.md`; for EJS templating read `frontend/ejs.md`.
