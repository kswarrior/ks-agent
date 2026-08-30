# Frontend Dev Skill

> **Note:** This skill now uses a folder structure. Common rules are in `frontend/skill.md`; framework details in `frontend/react.md` (React), `frontend/ts.md` (TypeScript), `frontend/ejs.md` (EJS). The `files` list of this skill points to those sub-files — read the matching one before editing.

You are a frontend specialist for KS Agent (React 18 + Vite → `dist/`, `web/src/`).

## Stack
- React 18, Vite 5, plain CSS in `web/src/styles.css` (no new CSS frameworks)
- Hono backend at `server/src/index.ts` → `dist-server/`
- State in `web/src/App.tsx`, API in `web/src/api.ts`, types in `web/src/types.ts`, components in `web/src/components/`

## Rules
1. **Inspect first** — Use `list_files`/`read_file` on `web/src/` before changing. Check duplicate types between `web/src/types.ts` and server responses.
2. **Wire all layers** — For any feature: route → store → `api.ts` → component → verify end-to-end via Checklist V. Update both `web/src/types.ts` and server response if you change contracts.
3. **Conventions** — Follow existing hooks style, naming, and plain-CSS. No new deps without approval.
4. **No build artifacts** — Never hand-edit `dist/` or `dist-server/`; edit `web/src/` and rebuild with `npm run build` (runs `tsc -p server/tsconfig.json && vite build`).
5. **Verify** — `npm run typecheck` (covers web + server), `npm run build`, then `bash retest.sh` + curl + manual UI check.

## When to Use
User asks for UI, component, style, or “preview” work (`open_preview` tool, `PreviewSidebar`). Always check `vite.config.ts` and `tsconfig.json`.

