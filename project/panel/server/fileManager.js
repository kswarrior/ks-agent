import fs from 'node:fs/promises'
import path from 'node:path'
import { config } from './config.js'

function isSafeRelative(relPath) {
  if (typeof relPath !== 'string') return false
  if (relPath.length === 0) return false
  for (const pat of config.fs.denyPatterns) {
    if (pat.test(relPath)) return false
  }
  return true
}

/** Resolve a user-supplied path inside the MC server dir, rejecting traversal. */
export function resolveSafe(relPath) {
  if (!isSafeRelative(relPath)) throw new Error('Invalid path')
  const root = path.resolve(config.mc.serverDir)
  const target = path.resolve(root, relPath)
  // Ensure target is inside root (extra defense against ../ tricks)
  if (target !== root && !target.startsWith(root + path.sep)) {
    throw new Error('Path escapes server directory')
  }
  return target
}

export async function listDir(relPath = '.') {
  const abs = resolveSafe(relPath)
  const stat = await fs.stat(abs).catch(() => null)
  if (!stat) return { error: 'not_found', path: relPath }
  if (!stat.isDirectory()) return { error: 'not_a_directory', path: relPath }

  const entries = await fs.readdir(abs, { withFileTypes: true })
  const items = await Promise.all(entries.map(async (entry) => {
    const childPath = path.join(abs, entry.name)
    let size = 0
    let mtime = null
    try {
      const s = await fs.stat(childPath)
      size = s.size
      mtime = s.mtimeMs
    } catch {}
    return {
      name: entry.name,
      isDirectory: entry.isDirectory(),
      size,
      mtime,
    }
  }))

  // Directories first, then by name
  items.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return { path: relPath, items }
}

export async function readFile(relPath) {
  const abs = resolveSafe(relPath)
  const stat = await fs.stat(abs)
  if (!stat.isFile()) throw new Error('Not a file')
  if (stat.size > config.fs.maxEditBytes) {
    return { path: relPath, size: stat.size, content: null, truncated: true, message: 'File too large to edit in browser' }
  }
  const content = await fs.readFile(abs, 'utf8')
  return { path: relPath, size: stat.size, content, truncated: false, mtime: stat.mtimeMs }
}

export async function writeFile(relPath, content) {
  const abs = resolveSafe(relPath)
  const stat = await fs.stat(abs).catch(() => null)
  if (stat && stat.isDirectory()) throw new Error('Target is a directory')
  if (Buffer.byteLength(content, 'utf8') > config.fs.maxEditBytes) {
    throw new Error('File content exceeds edit size limit')
  }
  await fs.writeFile(abs, content, 'utf8')
  return { path: relPath, size: Buffer.byteLength(content, 'utf8') }
}

export async function remove(relPath) {
  const abs = resolveSafe(relPath)
  const stat = await fs.stat(abs).catch(() => null)
  if (!stat) throw new Error('Not found')
  if (stat.isDirectory()) {
    await fs.rm(abs, { recursive: true, force: false })
  } else {
    await fs.unlink(abs)
  }
  return { path: relPath }
}

export async function mkdir(relPath) {
  const abs = resolveSafe(relPath)
  await fs.mkdir(abs, { recursive: true })
  return { path: relPath }
}

export async function rename(fromPath, toPath) {
  const from = resolveSafe(fromPath)
  const to = resolveSafe(toPath)
  await fs.rename(from, to)
  return { from: fromPath, to: toPath }
}

export async function upload(relDir, originalName, buffer) {
  if (buffer.length > config.fs.maxUploadBytes) {
    throw new Error(`File too large (max ${config.fs.maxUploadBytes} bytes)`)
  }
  // Strip directory parts from the filename so an uploaded name can't escape.
  const safeName = path.basename(originalName).replace(/[^A-Za-z0-9._-]/g, '_')
  const dirAbs = resolveSafe(relDir || '.')
  const stat = await fs.stat(dirAbs).catch(() => null)
  if (!stat || !stat.isDirectory()) throw new Error('Target is not a directory')
  const target = path.join(dirAbs, safeName)
  await fs.writeFile(target, buffer)
  return { path: path.relative(path.resolve(config.mc.serverDir), target), size: buffer.length }
}

export async function getDownloadStream(relPath) {
  const abs = resolveSafe(relPath)
  const stat = await fs.stat(abs)
  if (!stat.isFile()) throw new Error('Not a file')
  return { absPath: abs, size: stat.size }
}

export async function readServerProperties() {
  return readFile('server.properties')
}

export async function writeServerProperties(content) {
  // Basic validation: only allow `key=value` lines, comments, and blank lines.
  const lines = content.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    if (!/^[a-zA-Z0-9._-]+=.+$/.test(trimmed)) {
      throw new Error(`Invalid line: ${line.slice(0, 80)}`)
    }
  }
  return writeFile('server.properties', content)
}
