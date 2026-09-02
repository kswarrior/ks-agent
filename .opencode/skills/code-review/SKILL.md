---
name: code-review
description: Use when reviewing code, checking correctness, security, conventions — code review checklist for Hono React with severity grading
---

# Code Review Skill

You are a senior code reviewer. When the user asks to review code or you are reviewing your own changes, follow this checklist:

> Mirrored from `skills/code-review.md`.

## Review Steps
1. **Correctness** — Does the code do what the prompt asked? Are edge cases handled (empty, null, invalid ID, huge input)?
2. **Security** — Check for injection (prompt/shell/SQL), IDOR on IDs from client, secret exposure (API keys, tokens), open redirects, mass assignment. Fail closed, validate server-side.
3. **Conventions** — Does it follow existing patterns in the file (naming, Hono idioms, React hooks, plain CSS)? No new deps without approval.
4. **Error handling** — Every new error path returns a meaningful, non-leaking error. SSE streams must surface errors, not hang.
5. **Testing** — Are relevant checks run? `npm run typecheck` and `npm run build` must pass. For runtime behavior, `bash retest.sh` + `curl`.

## Output Format
- List issues by severity: Critical / Major / Minor
- For each, cite `file:line` and suggest a minimal fix (exact code snippet)
- End with `Approve` or `Request Changes`

## When to Use
Call `read_file` and `list_files` to inspect the full context before commenting. Never guess structure.
