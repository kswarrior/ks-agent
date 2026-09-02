# TypeScript Skill — Frontend/TS

Use with `frontend/skill.md` (common). This file covers **TypeScript** for **user websites**.

## Config — For User Sites

- `tsconfig.json`: `target ES2022`, `jsx react-jsx`, `strict true`, `moduleResolution Bundler`, `esModuleInterop true`
- `vite.config.ts`: `plugin-react`, `server.port` 5173 (or 3000)
- Typecheck: `npm run build` (which runs `tsc && vite build`) must be green

## Rules — For User Sites

1. **Strict** — Keep `strict true`. No `any` without justification; prefer `unknown` + narrowing or explicit interfaces. Fix all `tsc` errors, never `// @ts-ignore`.
2. **Contracts** — If the site has a backend, keep frontend types in `src/types.ts` in sync with API responses. For any API change:
   - Update `src/types.ts` interface
   - Update fetch call in `src/api.ts` or `src/lib/api.ts`
   - Verify with `npm run build` + manual test
3. **Nullability** — Handle `null`/`undefined` explicitly with `??`/`?.`; provide defaults for optional fields so UI doesn't crash on missing data.
4. **Imports** — Use `import type { ... }` for types, keep `esModuleInterop` happy. No imports from internal platform code (`web/src`, `server/` forbidden).

## Common Types — Example for User Sites

```ts
// src/types.ts
export interface User { id: string; name: string; email: string }
export interface Product { id: string; title: string; price: number; image: string }
```

## Checklist

- [ ] `npm run build` passes with `strict true`
- [ ] No `any`, no `// @ts-ignore`
- [ ] Types in `src/types.ts` match actual API JSON (names/casing/nullability)
- [ ] No internal platform code imports or paths
- [ ] Site remains standalone — no `web/src` or `ks-agent` references
