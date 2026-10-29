import fs from 'node:fs'
import path from 'node:path'

const PLACEHOLDER = /\$\{projectfolder\}|\$projectfolder\b|%24%7Bprojectfolder%7D/gi

export function cleanRelative(input: string): string {
  let rel = (input ?? '').trim()
  if (PLACEHOLDER.test(rel)) {
    PLACEHOLDER.lastIndex = 0
    rel = rel
      .replace(/^["']?\$\{projectfolder\}["']?[/\\]?/i, '')
      .replace(/^["']?\$projectfolder["']?[/\\]?/i, '')
      .replace(PLACEHOLDER, '')
  }
  rel = rel.replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
  return rel === '' ? '.' : rel
}

/**
 * Resolve a user-supplied relative path inside the project. Rejects `..`,
 * absolute paths, NUL bytes and symlink escapes (existing target or parent).
 */
export function resolveInProject(root: string, rel: string): string | null {
  const raw = (rel ?? '').trim()
  if (raw.includes('\0')) return null
  if (path.isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) return null
  const cleaned = cleanRelative(rel)
  if (cleaned.includes('\0')) return null
  const absRoot = path.resolve(root)
  const abs = path.resolve(absRoot, cleaned)
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) return null

  try {
    const realRoot = fs.realpathSync(absRoot)
    if (fs.existsSync(abs)) {
      const realAbs = fs.realpathSync(abs)
      if (realAbs !== realRoot && !realAbs.startsWith(realRoot + path.sep)) return null
    } else {
      const parent = path.dirname(abs)
      if (fs.existsSync(parent)) {
        const realParent = fs.realpathSync(parent)
        if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) return null
      }
    }
  } catch {
    return null
  }
  return abs
}

export function relWithin(root: string, abs: string): string {
  return path.relative(path.resolve(root), abs).split(path.sep).join('/')
}

export function validSegment(name: string): boolean {
  return (
    !!name &&
    name !== '.' &&
    name !== '..' &&
    !name.includes('/') &&
    !name.includes('\\') &&
    !name.includes('\0') &&
    name.trim() === name
  )
}

const BLOCKED_PATTERNS: Array<[RegExp, string]> = [
  [/\0/, 'NUL byte'],
  [/(?:^|[\s;&|()`'"=])\.\.(?:[/\\\s;&|)`'"]|$)/, 'parent-directory traversal'],
  [/(?:^|[\s;&|()`'"])(?:~|\$HOME|\$\{HOME\})(?:[/\\\s;&|)`'"]|$)/, 'home-directory access'],
  [/\b(?:sudo|doas|su)\b/, 'privilege escalation'],
  [/\b(?:mkfs(?:\.\w+)?|mount|umount|shutdown|reboot|halt|poweroff|init)\b/, 'system-level command'],
  [/\b(?:nc|ncat|netcat)\s+.*\s-l\b/, 'listening socket'],
  [/\bchmod\s+(?:-R\s+)?777\s+\/(?:\s|$)/, 'host-wide chmod'],
  [/\brm\s+(?:-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(?:\/|~|\$HOME)(?:\s|$)/, 'destructive delete of root/home'],
  [/:\(\)\s*\{\s*:\|:&\s*\};:/, 'fork bomb'],
  [/\b(?:curl|wget)\b[^\n]*(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)/, 'private-host request'],
  [/\b(?:cat|less|head|tail|grep|sed|awk)\b[^\n]*(?:\/etc\/(?:passwd|shadow|sudoers)|\/root\/|\/proc\/self\/environ)/, 'host secret access']
]

function decodeForCheck(command: string): string {
  let out = command
  try {
    out = decodeURIComponent(command)
  } catch {
    // keep raw
  }
  return out.replace(/\s+/g, ' ')
}

/**
 * Reject shell commands that can escape the project or attack the host.
 * This is a guard, not a sandbox — Docker jail is the stronger layer.
 */
export function unsafeCommand(command: string, projectRoot: string): string | null {
  const cmd = decodeForCheck(command)
  for (const [re, reason] of BLOCKED_PATTERNS) {
    if (re.test(cmd)) return reason
  }

  const absRoot = path.resolve(projectRoot)
  const absolutePath = /(?:^|[\s"'=])(\/[^\s"';&|)`]+)/g
  for (const match of cmd.matchAll(absolutePath)) {
    const candidate = match[1]
    if (candidate === '/dev/null' || candidate === '/dev/stdout' || candidate === '/dev/stderr') continue
    const abs = path.resolve(candidate)
    if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) {
      return `absolute path outside project: ${candidate}`
    }
  }
  return null
}

export interface WalkOptions {
  maxFiles?: number
  skipDirs?: Set<string>
}

export const DEFAULT_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'dist-server',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  'target',
  '.gradle'
])

const DEFAULT_SKIP = DEFAULT_SKIP_DIRS

export function walkFiles(root: string, baseRel: string, options: WalkOptions = {}): string[] {
  const base = resolveInProject(root, baseRel)
  if (!base) return []
  const skip = options.skipDirs ?? DEFAULT_SKIP
  const maxFiles = options.maxFiles ?? 5000
  const out: string[] = []
  const stack: string[] = [base]
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop() as string
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (out.length >= maxFiles) break
      const abs = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) stack.push(abs)
      } else if (entry.isFile()) {
        out.push(relWithin(root, abs))
      }
    }
  }
  return out
}

export interface WalkEntry {
  path: string
  dir: boolean
}

/** Walk files and directories inside the project, skipping build/VCS folders. */
export function walkEntries(root: string, baseRel: string, options: WalkOptions = {}): WalkEntry[] {
  const base = resolveInProject(root, baseRel)
  if (!base) return []
  const skip = options.skipDirs ?? DEFAULT_SKIP
  const maxEntries = options.maxFiles ?? 5000
  const out: WalkEntry[] = []
  const stack: string[] = [base]
  while (stack.length && out.length < maxEntries) {
    const dir = stack.pop() as string
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (out.length >= maxEntries) break
      const abs = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (skip.has(entry.name)) continue
        out.push({ path: relWithin(root, abs), dir: true })
        stack.push(abs)
      } else if (entry.isFile()) {
        out.push({ path: relWithin(root, abs), dir: false })
      }
    }
  }
  return out
}

function escapeRegex(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function globToRegExp(glob: string): RegExp {
  const pattern = glob.replace(/\\/g, '/').replace(/^\.\//, '')
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        i++
        if (pattern[i + 1] === '/') {
          i++
          re += '(?:.*/)?'
        } else {
          re += '.*'
        }
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if (c === '{') {
      const end = pattern.indexOf('}', i)
      if (end === -1) {
        re += '\\{'
      } else {
        const parts = pattern.slice(i + 1, end).split(',')
        re += `(?:${parts.map((p) => p.split('*').map(escapeRegex).join('[^/]*')).join('|')})`
        i = end
      }
    } else {
      re += escapeRegex(c)
    }
  }
  return new RegExp(`^${re}$`)
}

export function matchesGlob(rel: string, glob: string): boolean {
  const normalized = rel.replace(/\\/g, '/')
  const re = globToRegExp(glob)
  if (re.test(normalized)) return true
  if (!glob.includes('/')) {
    const base = normalized.split('/').pop() ?? ''
    return re.test(base)
  }
  return false
}

export function isProbablyBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 4096))
  for (const byte of sample) {
    if (byte === 0) return true
  }
  return false
}
