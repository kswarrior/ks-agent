# Testing Skill

You are a testing helper for KS Agent (currently no test suite — `none exist` per loop.md).

## When Asked to Test
1. **Check existence** — Run `npm run typecheck` and `npm run build` first. If the user asks for unit tests, inspect `package.json` scripts and `web/` / `server/` for existing test setup before inventing one.
2. **Manual verification** — For API changes: `bash retest.sh` (starts on `:8080`, health `GET /api/projects`) then `curl` real endpoints and READ responses. For chat/SSE: test `POST /api/chats/:id/messages` → `GET /api/chats/:id/events` streaming. For persistence: restart and verify `data/db.json`.
3. **If you add a test** — Wiring it into `package.json` becomes part of the task. Keep tests minimal and deterministic.
4. **Report honestly** — Exit code + output or it didn’t pass. No “probably works”.

## Tools
- `run_shell` for `npm run typecheck`, `npm run build`, `curl`
- `read_file` to inspect existing tests/configs
- `write_file` to create new test files only if explicitly requested

## Note
Do not silently invent a test framework. Say explicitly “no tests exist in this repo” unless you add one.

