# KS Agent — Agent Rules (THE LOOP)

Non-negotiable core: NO task is done until every required check passes with REAL,
READ output. If a check fails → root cause → fix → restart PASS 1. There is no
"done with warnings". There is no "probably works". Exit code + output or it didn't pass.
This loop repeats as many times as needed. Giving up is not an option; being blocked
requires written proof of exactly what is blocked and why.


## 0. Paths & Scope Discipline
- Backend:  /home/runner/work/ks-agent/ks-agent/server          (Node + Hono, TS → dist-server/)
- Frontend: /home/runner/work/ks-agent/ks-agent/web             (React 18 + Vite → dist/)
- Data:     /home/runner/work/ks-agent/ks-agent/data            (JSON store: db.json — NEVER delete or hand-edit casually)
- Scripts:  /home/runner/work/ks-agent/ks-agent/{retest.sh,vite.config.ts,tsconfig.json,package.json}
- Search only inside the affected part. User-given path FIRST, then widen within
  the same part. Never search / or the whole system.
- Before touching anything: `git status` + `git log --oneline -5` — know the base state
  so any damage can be reverted precisely.
- Remember the twin outputs: `dist-server/` and `dist/` are BUILD ARTIFACTS.
  Never edit them by hand — edit `server/src/` and `web/src/` and rebuild.


## 1. Plan (before ANY edit)
1. Classify task: Add | Remove | Fix | Modify | Refactor | Multi.
   Multi = run the matching protocol (§2) for each sub-task independently.
2. Name affected part(s) and expected blast radius
   (API route? store schema? SSE/streaming contract? → frontend consumer or
   `data/db.json` shape are also in scope). Blast radius defines which consumers
   must appear in CHECKLIST V tracing.
3. Locate real code by grep, not by guess. Read EVERY file you will touch,
   fully — imports, callers, config. The backend is small (server/src/index.ts,
   llm.ts, store.ts) — read all three when changing API/store behavior.
4. Check for duplicate/mirrored logic (e.g. types duplicated between
   `web/src/types.ts` and server responses); confirm which one is actually used.
   Editing the wrong twin = wasted pass.
5. Before creating a file: prove no existing file does the job.
6. Before deleting: grep ALL references (code, styles, configs, docs).
   Never delete `data/db.json` contents. Never delete files referenced by
   package.json scripts, vite.config.ts, or either tsconfig.
7. Fix tasks: state the ROOT CAUSE in one line before editing.
   No symptom hiding, no empty catch, no silent fallback, no "try/catch around it".
8. Ambiguity or two valid designs → ask, don't guess. A wrong guess costs a full loop.
9. Write a mini plan (files to touch, expected behavior after change, how you will verify).
10. Risk triage: does the change touch security/API keys/auth-ish surfaces/store
    format/SSE streaming contracts/multiple parts? → PASS 2 mandatory (§5).


## 2. Task Protocols
- ADD: locate insertion points by reading real call sites → implement following existing
  patterns → wire ALL layers the feature crosses (route → store → api.ts → component) →
  verify end-to-end via CHECKLIST V.
- REMOVE: grep all references → confirm nothing depends on it (incl. frontend consumers,
  persisted fields in db.json, CSS classes) → remove in dependency order
  (consumers first, definition last) → prove zero dangling references by grep returning empty.
- FIX: REPRODUCE first (command/log/curl/test that shows the bug). No reproduction possible
  → construct the strongest reasoning chain from evidence. Root cause → minimal fix →
  re-run the reproducer → must now pass → regression-check neighbors (V4/V5).
- MODIFY: understand current behavior fully BEFORE changing it → change → prove new
  behavior correct AND old behavior intentionally replaced (no half-old/half-new states).
- REFACTOR: behavior must be IDENTICAL. Prove it: capture behavior (curl output,
  UI flow, build artifacts diff) before, compare after. No logic drift allowed inside refactors.
- DATA FORMAT: any change to what the server persists in db.json MUST stay backward
  compatible with an existing db.json (missing field ≠ crash; old files must load).


## 3. Edit Rules
- Minimal diff. Only files required by the task. No drive-by refactors, no reformatting,
  no renaming unrelated things.
- Follow existing patterns in surrounding code (naming, error style, Hono idioms,
  React hooks style, plain-CSS conventions in styles.css — no new frameworks/deps
  without explicit approval).
- Security-sensitive areas (provider API keys, tokens, secrets): fail closed,
  validate server-side, never log/print/return/store secrets in plaintext responses
  or error messages. Assume every input hostile. Keys live ONLY in data/db.json
  server-side; the client must never receive them back unless explicitly masked by design.
- Concurrency: shared state (db.json writes!) → ask "what if two requests do this
  simultaneously?" Store writes must not corrupt or lose data (atomic write or lock).
- Error handling: every new error path returns a meaningful, non-leaking error.
  No swallowed errors anywhere. SSE streams must surface errors, not hang silently.
- Re-read each file AFTER editing it. Verify the diff matches intent exactly (`git diff`).


## 4. Verify — CHECKLIST V (full, every pass, not just changed lines)
- V1 Trace the full flow input → route → handler → store (db.json) → response →
     frontend consumer (api.ts → component). BOTH directions. For streaming:
     provider → llm.ts SSE → client reader → message render.
- V2 Every reference to changed symbols/APIs/types/fields updated
     (grep to PROVE it: show the search returned nothing stale).
- V3 Contracts match across frontend ↔ backend ↔ persisted JSON:
     names, casing, nullability, types, status codes, error shapes
     (web/src/types.ts vs actual server responses vs db.json contents).
- V4 Imports, error handling, edge cases (empty input, null, missing project/chat id,
      concurrent requests, huge/long streamed messages, network drop mid-SSE).
- V5 No duplicate, dead, conflicting or unreachable code left.
- V6 Implementation matches EXACTLY what the user asked — nothing extra, nothing missing.
- V7 Commands (run them, don't assume):
     Typecheck:    npm run typecheck        (covers web AND server tsconfigs)
     Build:        npm run build            (tsc -p server/tsconfig.json && vite build)
     Lint/tests:   none exist in this repo — say so explicitly; do NOT invent one silently.
                   If you add one, wiring it into package.json becomes part of the task.
     Runtime:      ANY check needing the agent RUNNING (endpoints, chat flow, settings,
                   persistence across restart) → bash /home/runner/work/ks-agent/ks-agent/retest.sh
                   (auto-installs deps + rebuilds if dist/dist-server missing; stops old
                   instance; starts on :8080, override with PORT=xxx; health probe GET
                   /api/projects; PID file /tmp/ks-agent-<port>.pid;
                   stop: bash retest.sh stop). Then curl real endpoints and READ responses.
                   Server logs go to the foreground of that process — capture with
                   PORT=... node dist-server/index.js > /tmp/ksagent.log 2>&1 & when needed.
- V8 READ the REAL command output. Exit code + output or it didn't pass.
     A green assumption is a red failure.
- V9 Security pass on touched surfaces: injection into prompts/shell, authz gaps,
     secret exposure (API keys!), open redirects, mass assignment, IDOR on ids
     coming from the client.
- V10 Consistency pass: new code follows the file's/part's established conventions;
     no TODO/FIXME/debug prints/console.log left behind.


## 5. Passes
- PASS 1: full CHECKLIST V (V1–V10).
- PASS 2: REQUIRED when the change touches security, API keys, db.json format,
  SSE/streaming contracts, or more than one part. Redo V1–V3 INDEPENDENTLY
  (re-read the files, fresh eyes, don't trust pass-1 memory) and rerun V7.
  For single-file, single-part, non-security changes: PASS 2 = rerun V7 + V2.
- Any failure → real cause → fix → restart PASS 1. Partial credit does not exist.


## 6. THE LOOP — Failure Engine (this is what makes it work every time)
When any check fails or the build breaks, enter the loop. Do NOT patch blindly.
Iteration ladder:
- Attempt 1–2: targeted fix of the identified root cause. Rerun the failed command first
  to see the CURRENT error (it may have moved).
- Attempt 3–4: STOP trusting your model of the code. Re-read the actual files end-to-end.
  Question assumptions: wrong file (duplicates §1.4)? stale dist/ artifacts being served?
  missed consumer? wrong layer of the fix?
- Attempt 5+: isolate minimally — `git diff` review of everything changed this session;
  bisect by reverting the most recent change to confirm which edit broke it; then
  re-apply differently. Reduce the problem to the smallest failing case.
- Every iteration: name the previous attempt, why it failed, what differs now.
  Repeating the same failing action counts as failure of process, not bad luck.
- Hard rule: NEVER widen scope silently. If the true fix requires touching outside the
  blast radius, say so explicitly and update the plan (back to §1), then proceed.
- Truly blocked (missing credentials/env/provider key/service): stop, report exact
  blocker + evidence + what would unblock it. That is the ONLY exit other than success.


## 7. Rebuild
Only after all required passes:
npm run build
Read the ACTUAL output. Failure → root cause → THE LOOP → PASS 1 again.
If any verification needs a live agent → bash retest.sh (see V7 Runtime),
verify with curl against http://127.0.0.1:<PORT>/api/projects, then stop it.


## 8. Report (short, honest)
Task type | Part(s) | Files changed | Root cause (for Fix) |
Checks run + REAL results (exit codes) | Security notes | Assumptions |
Iterations through THE LOOP | Rebuild result.
State clearly anything you could NOT verify. An honest gap beats a fake green.
