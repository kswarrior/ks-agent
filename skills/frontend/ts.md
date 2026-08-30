# TypeScript Skill — Frontend/TS

Use with `frontend/skill.md` (common). This file covers **TypeScript** strictness and contract sync for KS Agent.

## Config
- `tsconfig.json` (web): `target ES2022`, `jsx react-jsx`, `strict true`, `noEmit true`, `moduleResolution Bundler`
- `server/tsconfig.json`: `target ES2022`, `strict true`, `outDir ../dist-server`, `rootDir src`
- Typecheck: `npm run typecheck` runs `tsc --noEmit` (web) + `tsc -p server/tsconfig.json --noEmit`

## Rules
1. **Strict** — No `any` without justification; prefer `unknown` + narrow. Keep `strict` on. Fix all `tsc` errors, never `// @ts-ignore` outside persisted `db.json` compat (`server/src/store.ts`).
2. **Contracts** — Types duplicated between `web/src/types.ts` and server responses must stay in sync. For any API change:
   - Update `server/src/index.ts` response shape
   - Update `web/src/types.ts` interface
   - Update `web/src/api.ts` `req<T>` call
   - Verify via `curl` + `V3` in loop.md (names/casing/nullability/types/status codes)
3. **Nullability** — Persisted `db.json`/`storage/ksagent.db` fields are backward-compat: `missing field ≠ crash`. Use `??`/`?.` and handle `undefined`/`null` explicitly.
4. **Imports** — Use `type` imports for types (`import type { ... }`), keep `esModuleInterop` and `isolatedModules` happy.

## Common Types
- `Project {id,name,path,createdAt}`, `Chat {id,projectId,title,seq,createdAt,updatedAt}`, `Message`, `Skill {id,name,note,mainFile,files,projectId}`, `MCPServer`, `LSPServer`, `Plugin`

## Checklist
- [ ] Ran `npm run typecheck` — must be green (both tsconfigs)
- [ ] Checked `web/src/types.ts` vs actual server JSON (curl) for any changed field
- [ ] Handled `null`/`undefined` for legacy `db.json` rows
