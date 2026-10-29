import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { resolveInProject } from './fsx.js'

const GIT_TIMEOUT_MS = 60_000
const GIT_OUTPUT_CAP = 32 * 1024

function cap(text: string): string {
  if (text.length > GIT_OUTPUT_CAP) return `${text.slice(0, GIT_OUTPUT_CAP)}\n[... truncated]`
  return text
}

function runGit(projectPath: string, args: string[]): Promise<{ code: number; output: string }> {
  const cwd = path.resolve(projectPath)
  return new Promise((resolve) => {
    execFile(
      'git',
      args,
      { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        const code = error && typeof (error as { code?: unknown }).code === 'number' ? (error as { code: number }).code : error ? 1 : 0
        resolve({ code, output: cap(`${stdout || ''}${stderr || ''}`) })
      }
    )
  })
}

function outputOrThrow(result: { code: number; output: string }, fallback: string): string {
  if (result.code !== 0) throw new Error(result.output.trim().slice(0, 600) || fallback)
  return result.output.trim()
}

export function isGitRepo(projectPath: string): boolean {
  try {
    const dotGit = path.join(path.resolve(projectPath), '.git')
    if (!fs.existsSync(dotGit)) return false
    const stat = fs.statSync(dotGit)
    return stat.isDirectory() || stat.isFile()
  } catch {
    return false
  }
}

function requireRepo(projectPath: string): void {
  if (!isGitRepo(projectPath)) throw new Error('Not a git repo (run git_init first)')
}

export function isValidBranchName(branch: string): boolean {
  const name = String(branch ?? '').trim()
  if (!name || name.length > 100) return false
  if (name.includes('\0') || /[\s~^:?*[\\]/.test(name)) return false
  if (name.startsWith('-') || name.startsWith('/') || name.startsWith('.')) return false
  if (name.endsWith('/') || name.endsWith('.') || name.endsWith('.lock')) return false
  if (name.includes('..') || name.includes('@{') || name.includes('//')) return false
  return /^[A-Za-z0-9._/-]+$/.test(name)
}

function isValidRef(ref: string): boolean {
  const value = String(ref ?? '').trim()
  return (
    !!value &&
    value.length <= 100 &&
    !value.includes('\0') &&
    !/[\s~^:?*[\\]/.test(value) &&
    !value.startsWith('-')
  )
}

export function isValidCommitMessage(message: string): boolean {
  const value = String(message ?? '').trim()
  return !!value && value.length <= 2000 && !value.includes('\0')
}

function validateFilesInside(projectPath: string, files: unknown): string[] | null {
  if (files == null) return null
  if (!Array.isArray(files)) throw new Error('files must be an array of relative paths')
  if (files.length > 100) throw new Error('too many files (max 100)')
  const out: string[] = []
  for (const file of files) {
    const rel = String(file ?? '').trim()
    if (!rel || rel.includes('\0')) throw new Error(`invalid file path: ${String(file).slice(0, 80)}`)
    if (!resolveInProject(projectPath, rel)) throw new Error(`file escapes project root: ${rel.slice(0, 120)}`)
    out.push(rel)
  }
  return out
}

export async function gitInit(projectPath: string, branch = 'main'): Promise<string> {
  if (!isValidBranchName(branch)) throw new Error('invalid branch name')
  if (isGitRepo(projectPath)) return 'already a git repository'
  const init = await runGit(projectPath, ['init'])
  outputOrThrow(init, 'git init failed')
  const head = await runGit(projectPath, ['symbolic-ref', 'HEAD', `refs/heads/${branch}`])
  outputOrThrow(head, 'could not set initial branch')
  return `initialized git repository on branch ${branch}`
}

export async function gitStatus(projectPath: string): Promise<string> {
  requireRepo(projectPath)
  const branch = await runGit(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD'])
  const porcelain = await runGit(projectPath, ['status', '--porcelain=v1', '--branch'])
  const shortstat = await runGit(projectPath, ['diff', '--shortstat'])
  const branchLine = porcelain.output.trim().split('\n')[0] ?? ''
  const porcelainBranch = branchLine
    .replace(/^## /, '')
    .replace(/^No commits yet on /, '')
    .split('...')[0]
    .trim()
  const head = branch.code === 0 ? branch.output.trim().split('\n')[0].slice(0, 200) : porcelainBranch || '(no commits)'
  const files = porcelain.output.trim()
  const lines = files ? files.split('\n').slice(0, 100) : []
  const more = files && files.split('\n').length > 100 ? `\n[... +${files.split('\n').length - 100} more]` : ''
  return `branch: ${head || '(unknown)'}\n${lines.length ? lines.join('\n') + more : '(clean)'}${
    shortstat.output.trim() ? `\n${shortstat.output.trim().slice(0, 300)}` : ''
  }`
}

export async function gitDiff(
  projectPath: string,
  options: { staged?: boolean; ref?: string; file?: string; statOnly?: boolean } = {}
): Promise<string> {
  requireRepo(projectPath)
  const args: string[] = ['diff', '--no-color', '--no-ext-diff']
  if (options.staged) args.push('--staged')
  if (options.ref) {
    if (!isValidRef(options.ref)) throw new Error('invalid ref')
    args.push(options.ref.trim())
  }
  if (options.file) {
    const rel = String(options.file).trim()
    if (!resolveInProject(projectPath, rel)) throw new Error('file escapes project root')
    args.push('--', rel)
  }
  const stat = await runGit(projectPath, [...args, '--stat'])
  outputOrThrow(stat, 'git diff --stat failed')
  const statText = stat.output.trim() || '(no diff)'
  if (options.statOnly) return statText
  const full = await runGit(projectPath, args)
  outputOrThrow(full, 'git diff failed')
  const body = full.output.trim()
  if (!body) return statText
  return `${statText}\n\n${body}`.slice(0, GIT_OUTPUT_CAP)
}

export async function gitLog(projectPath: string, limit = 20): Promise<string> {
  requireRepo(projectPath)
  const count = Math.max(1, Math.min(100, Math.floor(Number(limit) || 20)))
  const result = await runGit(projectPath, [
    'log',
    `--max-count=${count}`,
    '--pretty=format:%h %ad %an %s',
    '--date=short',
    '--no-decorate'
  ])
  return outputOrThrow(result, 'git log failed') || '(no commits)'
}

export async function gitBranches(projectPath: string): Promise<string> {
  requireRepo(projectPath)
  const result = await runGit(projectPath, ['branch', '--list', '-vv'])
  return outputOrThrow(result, 'git branch failed') || '(no branches)'
}

export async function gitCreateBranch(projectPath: string, branch: string, checkout = true): Promise<string> {
  requireRepo(projectPath)
  if (!isValidBranchName(branch)) throw new Error('invalid branch name (1-100 chars, letters/digits/._/-)')
  const exists = await runGit(projectPath, ['rev-parse', '--verify', `refs/heads/${branch}`])
  if (exists.code === 0) {
    if (!checkout) return `branch ${branch} already exists`
    const result = await runGit(projectPath, ['checkout', branch])
    outputOrThrow(result, `cannot checkout ${branch}`)
    return `checked out existing branch ${branch}`
  }
  const result = await runGit(projectPath, checkout ? ['checkout', '-b', branch] : ['branch', branch])
  outputOrThrow(result, 'cannot create branch')
  return checkout ? `created and checked out ${branch}` : `created branch ${branch}`
}

export async function gitCheckout(projectPath: string, branch: string): Promise<string> {
  requireRepo(projectPath)
  if (!isValidBranchName(branch)) throw new Error('invalid branch name')
  const result = await runGit(projectPath, ['checkout', branch])
  outputOrThrow(result, `cannot checkout ${branch}`)
  return `checked out ${branch}`
}

export async function gitCommit(projectPath: string, message: string, files?: unknown): Promise<string> {
  requireRepo(projectPath)
  if (!isValidCommitMessage(message)) throw new Error('message is required (1-2000 chars, no NUL)')
  const validated = validateFilesInside(projectPath, files)
  const add = validated && validated.length
    ? await runGit(projectPath, ['add', '--', ...validated])
    : await runGit(projectPath, ['add', '-A'])
  outputOrThrow(add, 'git add failed')
  const check = await runGit(projectPath, ['diff', '--cached', '--quiet'])
  if (check.code === 0) return 'nothing to commit (working tree clean)'
  const result = await runGit(projectPath, [
    '-c',
    'user.name=KS Agent',
    '-c',
    'user.email=ks-agent@localhost',
    'commit',
    '-m',
    String(message).trim()
  ])
  outputOrThrow(result, 'git commit failed')
  const show = await runGit(projectPath, ['log', '-1', '--pretty=format:%h %s'])
  return `committed: ${(show.output.trim() || result.output.trim()).slice(0, 400)}`
}

function validRemote(remote: string): string {
  const value = String(remote || 'origin').trim().slice(0, 100)
  if (!/^[A-Za-z0-9._-]+$/.test(value) || value.startsWith('-')) throw new Error('invalid remote (a-z 0-9 . _ -)')
  return value
}

export async function gitPush(projectPath: string, remote = 'origin', branch?: string): Promise<string> {
  requireRepo(projectPath)
  const args = ['push', validRemote(remote)]
  if (branch) {
    if (!isValidBranchName(branch)) throw new Error('invalid branch name')
    args.push(branch)
  }
  const result = await runGit(projectPath, args)
  outputOrThrow(result, 'git push failed (no remote?)')
  return result.output.trim().slice(0, 4000) || 'pushed'
}

export async function gitPull(projectPath: string, remote = 'origin', branch?: string): Promise<string> {
  requireRepo(projectPath)
  const args = ['pull', '--ff-only', validRemote(remote)]
  if (branch) {
    if (!isValidBranchName(branch)) throw new Error('invalid branch name')
    args.push(branch)
  }
  const result = await runGit(projectPath, args)
  outputOrThrow(result, 'git pull failed')
  return result.output.trim().slice(0, 4000) || 'pulled'
}
