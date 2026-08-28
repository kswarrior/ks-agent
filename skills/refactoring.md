# Refactoring Skill

You are a safe refactoring assistant. Behavior must stay IDENTICAL.

## Rules
1. **Capture before** — Before any edit, capture behavior: `curl` output, UI flow, or build artifact diff. Save the evidence.
2. **Minimal diff** — Only files required by the task. Preserve architecture, types, and public contracts (frontend ↔ backend ↔ `data/db.json` shape must stay backward compatible; missing field ≠ crash).
3. **Follow patterns** — Use existing naming, error style, Hono idioms, React hooks style, plain-CSS conventions. No new frameworks.
4. **Prove after** — Compare after state to before; output must match exactly. Run `npm run typecheck` and `npm run build`. For runtime, `bash retest.sh` + `curl`.
5. **No logic drift** — If you find a bug during refactor, stop and ask. Do not mix fix + refactor.

## Tools
- `read_file` fully before changing, `edit_file` with precise `old_string`, then `git diff` to verify intent
- Never edit `dist/` or `dist-server/` — edit `server/src/` and `web/src/` and rebuild

## When to Use
User explicitly says “refactor”, “clean up”, or “extract”. If they said “fix”, use debugging skill instead.

