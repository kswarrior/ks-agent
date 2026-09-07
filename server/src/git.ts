// server/src/git.ts — native git layer (project-scoped, no shell, no injection)
// All commands run via execFile('git', args, {cwd}) — never through a shell,
// so branch names / messages cannot inject flags or commands. Args are built
// internally from validated params only (allowlist, no raw passthrough).
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { resolveInProject } from './fsx.js'

const GIT_TIMEOUT_MS = 60_000
const GIT_OUTPUT_CAP = 32 * 1024

function cap(s: string): string {
  if (s.length > GIT_OUTPUT_CAP) return s.slice(0, GIT_OUTPUT_CAP) + '\n…[truncated]'
  return s
}

function runGit(projectPath: string, args: string[]): Promise<{ code: number; output: string }> {
  const cwd = path.resolve(projectPath)
  return new Promise((resolve) => {
    execFile('git', args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      const code = error && typeof (error as any).code === 'number' ? (error as any).code : error ? 1 : 0
      resolve({ code, output: cap(`${stdout || ''}${stderr || ''}`) })
    })
  })
}

export function isGitRepo(projectPath: string): boolean {
  try {
    const abs = path.resolve(projectPath)
    const dotGit = path.join(abs, '.git')
    if (!fs.existsSync(dotGit)) return false
    const st = fs.statSync(dotGit)
    return st.isDirectory() || st.isFile()
  } catch { return false }
}

export function requireRepo(projectPath: string): void {
  if (!isGitRepo(projectPath)) throw new Error('Not a git repo (no .git — run `git init` via shell or set a remote first)')
}

/** git check-ref-format (simplified, fail-closed): branch 1-100 chars, no .. @{ // trailing / .lock etc. */
export function isValidBranchName(b: string): boolean {
  const t = String(b ?? '').trim()
  if (!t || t.length > 100) return false
  if (t.includes('\0') || /[\s~^:?*\[\\]/.test(t)) return false
  if (t.startsWith('-') || t.startsWith('/') || t.startsWith('.')) return false
  if (t.endsWith('/') || t.endsWith('.') || t.endsWith('.lock')) return false
  if (t.includes('..') || t.includes('@{') || t.includes('//')) return false
  if (!/^[A-Za-z0-9._\/-]+$/.test(t)) return false
  return true
}

export function isValidCommitMessage(m: string): boolean {
  const t = String(m ?? '').trim()
  if (!t || t.includes('\0')) return false
  if (t.length > 2000) return false
  return true
}

export function isValidRepoSlug(r: string): boolean {
  return /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(String(r ?? '').trim())
}

function validateFilesInside(projectPath: string, files: unknown): string[] | null {
  if (files == null) return null
  if (!Array.isArray(files)) throw new Error('files must be an array of relative paths')
  if (files.length > 100) throw new Error('too many files (max 100)')
  const out: string[] = []
  for (const f of files) {
    const rel = String(f ?? '').trim()
    if (!rel || rel.includes('\0')) throw new Error(`invalid file path: ${String(f).slice(0, 80)}`)
    const abs = resolveInProject(projectPath, rel)
    if (!abs) throw new Error(`file escapes project root: ${rel.slice(0, 120)}`)
    out.push(rel)
  }
  return out
}

export async function gitStatus(projectPath: string): Promise<string> {
  requireRepo(projectPath)
  const branch = await runGit(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const porcelain = await runGit(projectPath, ['status', '--porcelain=v1', '--branch'])
  const shortstat = await runGit(projectPath, ['diff', '--shortstat'])
  const head = (branch.output.trim().split('\n')[0] || '').slice(0, 200)
  const files = porcelain.output.trim()
  const lines = files ? files.split('\n').slice(0, 100) : []
  const more = files && files.split('\n').length > 100 ? `\n… +${files.split('\n').length - 100} more` : ''
  return `branch: ${head || '(unknown)'}\n${lines.length ? lines.join('\n') + more : '(clean)'}${shortstat.output.trim() ? `\n${shortstat.output.trim().slice(0, 300)}` : ''}`
}

export async function gitDiff(projectPath: string, opts?: { staged?: boolean; ref?: string; file?: string; statOnly?: boolean }): Promise<string> {
  requireRepo(projectPath)
  const args: string[] = ['diff', '--no-color', '--no-ext-diff']
  if (opts?.staged) args.push('--staged')
  if (opts?.ref) {
    const ref = String(opts.ref).trim().slice(0, 100)
    if (!ref || ref.includes('\0') || /[\s~^:?*\[\\]/.test(ref) || ref.startsWith('-')) throw new Error('invalid ref')
    args.push(ref)
  }
  if (opts?.statOnly) {
    const r = await runGit(projectPath, [...args, '--stat'])
    if (r.code !== 0) throw new Error(r.output.slice(0, 500) || 'git diff --stat failed')
    return r.output.trim() || '(no diff)'
  }
  if (opts?.file) {
    const rel = String(opts.file).trim()
    const abs = resolveInProject(projectPath, rel)
    if (!abs) throw new Error('file escapes project root')
    args.push('--', rel)
  } else {
    args.push('--stat')
  }
  const r = await runGit(projectPath, args)
  if (r.code !== 0) throw new Error(r.output.slice(0, 500) || 'git diff failed')
  const stat = r.output.trim() || '(no diff)'
  if (opts?.file) return stat
  // full diff capped separately (second call without --stat, capped by runGit)
  const full = await runGit(projectPath, args.filter((a) => a !== '--stat'))
  const body = full.output.trim()
  if (!body) return stat
  return `${stat}\n\n${body}`.slice(0, GIT_OUTPUT_CAP)
}

export async function gitLog(projectPath: string, limit = 20): Promise<string> {
  requireRepo(projectPath)
  const n = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)))
  const r = await runGit(projectPath, ['log', `--max-count=${n}`, '--pretty=format:%h %ad %an %s', '--date=short', '--no-decorate'])
  if (r.code !== 0) throw new Error(r.output.slice(0, 500) || 'git log failed')
  return r.output.trim() || '(no commits)'
}

export async function gitBranches(projectPath: string): Promise<string> {
  requireRepo(projectPath)
  const r = await runGit(projectPath, ['branch', '--list', '-vv'])
  if (r.code !== 0) throw new Error(r.output.slice(0, 500) || 'git branch failed')
  return r.output.trim() || '(no branches)'
}

export async function gitCreateBranch(projectPath: string, branch: string, checkout = true): Promise<string> {
  requireRepo(projectPath)
  if (!isValidBranchName(branch)) throw new Error('invalid branch name (1-100 chars, a-z 0-9 . _ / -; no .. @{ // leading -)')
  const exists = await runGit(projectPath, ['rev-parse', '--verify', `refs/heads/${branch}`])
  if (exists.code === 0) {
    if (!checkout) return `branch ${branch} already exists`
    const co = await runGit(projectPath, ['checkout', branch])
    if (co.code !== 0) throw new Error(co.output.slice(0, 500) || `cannot checkout ${branch}`)
    return `checked out existing branch ${branch}`
  }
  const args = checkout ? ['checkout', '-b', branch] : ['branch', branch]
  const r = await runGit(projectPath, args)
  if (r.code !== 0) throw new Error(r.output.slice(0, 500) || 'cannot create branch')
  return checkout ? `created and checked out ${branch}` : `created branch ${branch}`
}

export async function gitCheckout(projectPath: string, branch: string): Promise<string> {
  requireRepo(projectPath)
  if (!isValidBranchName(branch)) throw new Error('invalid branch name')
  const r = await runGit(projectPath, ['checkout', branch])
  if (r.code !== 0) throw new Error(r.output.slice(0, 500) || `cannot checkout ${branch}`)
  return `checked out ${branch}`
}

export async function gitCommit(projectPath: string, message: string, files?: unknown): Promise<string> {
  requireRepo(projectPath)
  if (!isValidCommitMessage(message)) throw new Error('message is required (1-2000 chars, no NUL)')
  const validated = validateFilesInside(projectPath, files)
  if (validated && validated.length) {
    const add = await runGit(projectPath, ['add', '--', ...validated])
    if (add.code !== 0) throw new Error(add.output.slice(0, 500) || 'git add failed')
  } else {
    const add = await runGit(projectPath, ['add', '-A'])
    if (add.code !== 0) throw new Error(add.output.slice(0, 500) || 'git add -A failed')
  }
  const check = await runGit(projectPath, ['diff', '--cached', '--quiet'])
  // diff --cached --quiet exits 1 when staged changes exist, 0 when none
  if (check.code === 0) return 'nothing to commit (working tree clean)'
  const msg = String(message).trim()
  const r = await runGit(projectPath, ['-c', 'user.name=KS Agent', '-c', 'user.email=ks-agent@localhost', 'commit', '-m', msg])
  if (r.code !== 0) throw new Error(r.output.slice(0, 600) || 'git commit failed')
  const show = await runGit(projectPath, ['log', '-1', '--pretty=format:%h %s'])
  return `committed: ${(show.output.trim() || r.output.trim()).slice(0, 400)}`
}

export async function gitPush(projectPath: string, remote = 'origin', branch?: string): Promise<string> {
  requireRepo(projectPath)
  const rem = String(remote || 'origin').trim().slice(0, 100)
  if (!/^[A-Za-z0-9._-]+$/.test(rem)) throw new Error('invalid remote (a-z 0-9 . _ -)')
  if (rem.startsWith('-')) throw new Error('invalid remote')
  const args = ['push', rem]
  if (branch) {
    if (!isValidBranchName(branch)) throw new Error('invalid branch name')
    args.push(branch)
  }
  // never --force: fail closed (force-push stays behind run_shell approval)
  const r = await runGit(projectPath, args)
  if (r.code !== 0) throw new Error(r.output.slice(0, 600) || 'git push failed (no upstream? set remote first)')
  return r.output.trim().slice(0, 800) || 'pushed'
}

export async function gitPull(projectPath: string, remote = 'origin', branch?: string): Promise<string> {
  requireRepo(projectPath)
  const rem = String(remote || 'origin').trim().slice(0, 100)
  if (!/^[A-Za-z0-9._-]+$/.test(rem)) throw new Error('invalid remote (a-z 0-9 . _ -)')
  if (rem.startsWith('-')) throw new Error('invalid remote')
  const args = ['pull', '--ff-only', rem]
  if (branch) {
    if (!isValidBranchName(branch)) throw new Error('invalid branch name')
    args.push(branch)
  }
  const r = await runGit(projectPath, args)
  if (r.code !== 0) throw new Error(r.output.slice(0, 600) || 'git pull failed')
  return r.output.trim().slice(0, 800) || 'pulled'
}

/** owner/repo from local .git/config remote url (same regex as index.ts github routes). */
export function parseRepoFromRemote(projectPath: string): string | null {
  try {
    const cfg = fs.readFileSync(path.join(path.resolve(projectPath), '.git', 'config'), 'utf8')
    let m = cfg.match(/url\s*=\s*.*github\.com[:/]([^\s]+?)(?:\.git)?\s*$/m)
    if (m) {
      const slug = m[1].replace(/\.git$/, '').trim()
      if (isValidRepoSlug(slug)) return slug
    }
    const m2 = cfg.match(/github\.com[:/]([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)/)
    if (m2) {
      const slug = m2[1].replace(/\.git$/, '').trim()
      if (isValidRepoSlug(slug)) return slug
    }
  } catch {}
  return null
}

/** Native PR create via GitHub REST (no gh CLI). Token is header-only, never logged/returned. */
export async function githubCreatePr(opts: { repo: string; head: string; base: string; title: string; body?: string; token: string }): Promise<{ number: number; url: string }> {
  const repo = String(opts.repo ?? '').trim()
  const head = String(opts.head ?? '').trim()
  const base = String(opts.base ?? '').trim()
  const title = String(opts.title ?? '').trim()
  const body = String(opts.body ?? '').slice(0, 5000)
  const token = String(opts.token ?? '').trim()
  if (!isValidRepoSlug(repo)) throw new Error('invalid repo (owner/name)')
  if (!isValidBranchName(head)) throw new Error('invalid head branch')
  if (!isValidBranchName(base)) throw new Error('invalid base branch')
  if (title.length < 2 || title.length > 120 || title.includes('\0')) throw new Error('title must be 2-120 chars')
  if (body.includes('\0')) throw new Error('invalid body')
  if (!token) throw new Error('No GitHub token configured')
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 30000)
  let res: Response
  try {
    res = await fetch(`https://api.github.com/repos/${repo}/pulls`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ks-agent', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: JSON.stringify({ head, base, title, body }),
      signal: controller.signal
    } as any)
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new Error('GitHub PR create timeout (30s)')
    throw e
  } finally { clearTimeout(t) }
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.text()).slice(0, 400) } catch {}
    throw new Error(`GitHub PR create failed ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  let data: any = null
  try { data = await res.json() } catch { data = null }
  const number = Number(data?.number)
  const url = String(data?.html_url || '')
  if (!Number.isFinite(number)) throw new Error('GitHub PR create returned no number')
  return { number, url }
}
