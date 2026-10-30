import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getBackup,
  getChatSummary,
  getModel,
  importChats,
  insertBackup,
  listBackups,
  listChats,
  listMessages,
  removeBackup,
  type ImportedChat,
  type ImportedChatMessage
} from './db.js'
import { ConfigError } from './errors.js'
import { resolveInProject } from './fsx.js'
import type { Backup, BackupSource, Project, Role, ToolCall } from './types.js'
import { createZip, readZip, type ZipEntry, type ZipSource } from './zip.js'

const MANIFEST_NAME = '.ks-agent-backup.json'
const MAX_BACKUP_BYTES = 512 * 1024 * 1024
const MAX_RESTORE_BYTES = 1024 * 1024 * 1024
const MAX_NAME_LENGTH = 180

interface BackupManifest {
  format: 'ks-agent-backup'
  version: number
  createdAt: number
  includesChats: boolean
  project: { id: string; name: string; path: string }
  chats: Array<{
    id: string
    title: string
    modelId: string | null
    createdAt: number
    updatedAt: number
    messages: Array<{
      id: string
      role: Role
      content: string
      toolCalls: ToolCall[] | null
      toolCallId: string | null
      modelId: string | null
      durationMs: number | null
      createdAt: number
    }>
    summary: { summary: string; coveredMessageId: string; updatedAt: number } | null
  }>
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function projectSlug(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 50) || 'project'
  )
}

function timestamp(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, '').replace('T', '-').replace(/:/g, '-')
}

export function defaultBackupName(projectName: string): string {
  return `${projectSlug(projectName)}-backup-${timestamp()}.zip`
}

function normalizeBackupName(input: unknown, fallback: string): string {
  const raw = typeof input === 'string' ? input.trim() : ''
  const candidate = (raw || fallback).replace(/\\/g, '/').split('/').pop() ?? ''
  let name = candidate
    .replace(/[\x00-\x1f<>:"|?*]/g, '-')
    .replace(/^\.+$/, '')
    .trim()
  if (!name) name = fallback
  if (!name.toLowerCase().endsWith('.zip')) name = `${name}.zip`
  if (name.length > MAX_NAME_LENGTH) {
    name = `${name.slice(0, MAX_NAME_LENGTH - 4).replace(/[. ]+$/g, '')}.zip`
  }
  return name
}

function resolveBackupDirectory(project: Project, requested: unknown): string {
  const raw =
    typeof requested === 'string' && requested.trim() ? requested.trim() : project.path
  const expanded =
    raw === '~'
      ? os.homedir()
      : raw.startsWith('~/') || raw.startsWith('~\\')
        ? path.join(os.homedir(), raw.slice(2))
        : raw
  const absolute = path.isAbsolute(expanded)
    ? path.resolve(expanded)
    : path.resolve(project.path, expanded)
  try {
    fs.mkdirSync(absolute, { recursive: true })
    if (!fs.statSync(absolute).isDirectory()) {
      throw new ConfigError(`Backup location is not a folder: ${absolute}`, 400)
    }
    fs.accessSync(absolute, fs.constants.W_OK)
  } catch (error) {
    if (error instanceof ConfigError) throw error
    throw new ConfigError(
      `Cannot write to backup location ${absolute}: ${error instanceof Error ? error.message : String(error)}`,
      400
    )
  }
  return absolute
}

function withFileState(backup: Backup): Backup {
  try {
    const stat = fs.statSync(backup.path)
    if (stat.isFile()) return { ...backup, exists: true, size: stat.size }
  } catch {
    // missing backups remain listed so they can be removed
  }
  return { ...backup, exists: false }
}

export function listProjectBackups(project: Project): Backup[] {
  return listBackups(project.id).map(withFileState)
}

export function getProjectBackup(project: Project, id: string): { backup: Backup; stat: fs.Stats } {
  const backup = getBackup(id)
  if (!backup || backup.projectId !== project.id) {
    throw new ConfigError('Backup not found', 404)
  }
  let stat: fs.Stats
  try {
    stat = fs.statSync(backup.path)
  } catch {
    throw new ConfigError('Backup file not found on disk', 404)
  }
  if (!stat.isFile()) throw new ConfigError('Backup path is not a file', 400)
  return { backup, stat }
}

function buildManifest(project: Project, includeChats: boolean): BackupManifest {
  const chats = includeChats
    ? listChats(project.id).map((chat) => ({
        id: chat.id,
        title: chat.title,
        modelId: chat.modelId,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messages: listMessages(chat.id).map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          toolCalls: message.toolCalls,
          toolCallId: message.toolCallId,
          modelId: message.modelId,
          durationMs: message.durationMs,
          createdAt: message.createdAt
        })),
        summary: getChatSummary(chat.id)
      }))
    : []
  return {
    format: 'ks-agent-backup',
    version: 1,
    createdAt: Date.now(),
    includesChats: includeChats,
    project: { id: project.id, name: project.name, path: project.path },
    chats
  }
}

function collectSources(project: Project, destination: string): ZipSource[] {
  const skipped = new Set<string>([
    path.resolve(destination),
    path.resolve(project.path, MANIFEST_NAME),
    ...listBackups(project.id).map((backup) => path.resolve(backup.path))
  ])
  const sources: ZipSource[] = []
  const stack: string[] = ['']
  let totalBytes = 0

  while (stack.length > 0) {
    const relativeDir = stack.pop() ?? ''
    const absoluteDir = path.join(project.path, relativeDir)
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(absoluteDir, { withFileTypes: true })
    } catch (error) {
      throw new ConfigError(
        `Cannot read ${relativeDir || project.name}: ${error instanceof Error ? error.message : String(error)}`,
        403
      )
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const relative = relativeDir ? `${relativeDir}/${entry.name}` : entry.name
      const absolute = path.join(absoluteDir, entry.name)
      if (skipped.has(path.resolve(absolute))) continue
      if (relative === MANIFEST_NAME) continue
      if (entry.isDirectory()) {
        sources.push({ name: `${relative}/`, directory: true })
        stack.push(relative)
        continue
      }
      if (!entry.isFile()) continue
      let stat: fs.Stats
      try {
        stat = fs.statSync(absolute)
      } catch {
        continue
      }
      totalBytes += stat.size
      if (totalBytes > MAX_BACKUP_BYTES) {
        throw new ConfigError('Project is too large to back up (over 512 MB)', 413)
      }
      sources.push({
        name: relative,
        filePath: absolute,
        mtime: stat.mtimeMs
      })
    }
  }
  return sources.sort((left, right) => left.name.localeCompare(right.name))
}

export function createProjectBackup(
  project: Project,
  input: { location?: unknown; name?: unknown; includeChats?: unknown }
): Backup {
  const includeChats = input.includeChats === true
  const directory = resolveBackupDirectory(project, input.location)
  const name = normalizeBackupName(input.name, defaultBackupName(project.name))
  const destination = path.join(directory, name)
  if (fs.existsSync(destination)) {
    throw new ConfigError(`A backup named "${name}" already exists in ${directory}`, 409)
  }

  const sources = collectSources(project, destination)
  const manifest = buildManifest(project, includeChats)
  sources.push({
    name: MANIFEST_NAME,
    data: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  })

  let archive: Buffer
  try {
    archive = createZip(sources)
  } catch (error) {
    throw new ConfigError(
      `Could not create backup: ${error instanceof Error ? error.message : String(error)}`,
      500
    )
  }

  const temporary = path.join(directory, `.${name}.${process.pid}.${Date.now()}.tmp`)
  try {
    fs.writeFileSync(temporary, archive)
    fs.renameSync(temporary, destination)
  } catch (error) {
    fs.rmSync(temporary, { force: true })
    throw new ConfigError(
      `Could not save backup: ${error instanceof Error ? error.message : String(error)}`,
      500
    )
  }

  const backup = insertBackup({
    projectId: project.id,
    name,
    path: destination,
    size: archive.length,
    includesChats: includeChats,
    source: 'created'
  })
  return withFileState(backup)
}

function uniqueDestination(directory: string, name: string): string {
  const parsed = path.parse(name)
  let candidate = path.join(directory, name)
  let counter = 2
  while (fs.existsSync(candidate)) {
    candidate = path.join(directory, `${parsed.name} (${counter})${parsed.ext}`)
    counter += 1
  }
  return candidate
}

function manifestFromEntries(entries: ZipEntry[]): Record<string, unknown> | null {
  const entry = entries.find((item) => item.name === MANIFEST_NAME)
  if (!entry) return null
  try {
    const parsed = recordOf(JSON.parse(entry.data.toString('utf8')))
    return parsed?.format === 'ks-agent-backup' ? parsed : null
  } catch {
    return null
  }
}

function isChatIncluded(manifest: Record<string, unknown> | null, fallback: boolean): boolean {
  if (typeof manifest?.includesChats === 'boolean') return manifest.includesChats
  return fallback
}

function saveBackupBuffer(
  project: Project,
  input: {
    buffer: Buffer
    fileName: unknown
    location?: unknown
    source: BackupSource
  }
): Backup {
  if (input.buffer.length === 0) throw new ConfigError('The backup file is empty', 400)
  if (input.buffer.length > MAX_BACKUP_BYTES) {
    throw new ConfigError('The backup file exceeds the 512 MB limit', 413)
  }
  let entries: ZipEntry[]
  try {
    entries = readZip(input.buffer, { maxTotalBytes: MAX_RESTORE_BYTES })
  } catch (error) {
    throw new ConfigError(
      `The selected file is not a valid ZIP backup: ${error instanceof Error ? error.message : String(error)}`,
      400
    )
  }
  const manifest = manifestFromEntries(entries)
  const directory = resolveBackupDirectory(project, input.location)
  const requestedName = normalizeBackupName(
    input.fileName,
    defaultBackupName(project.name)
  )
  const destination = uniqueDestination(directory, requestedName)
  try {
    fs.writeFileSync(destination, input.buffer, { flag: 'wx' })
  } catch (error) {
    throw new ConfigError(
      `Could not save backup: ${error instanceof Error ? error.message : String(error)}`,
      500
    )
  }
  const backup = insertBackup({
    projectId: project.id,
    name: path.basename(destination),
    path: destination,
    size: input.buffer.length,
    includesChats: isChatIncluded(manifest, false),
    source: input.source
  })
  return withFileState(backup)
}

export function saveUploadedBackup(
  project: Project,
  input: { buffer: Buffer; fileName: unknown; location?: unknown }
): Backup {
  return saveBackupBuffer(project, { ...input, source: 'uploaded' })
}

function remoteFileName(url: URL, disposition: string | null, fallback: string): string {
  if (disposition) {
    const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
    if (encoded?.[1]) {
      try {
        const value = decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ''))
        if (value) return value
      } catch {
        // fall through to the plain filename
      }
    }
    const plain = /filename="?([^";]+)"?/i.exec(disposition)
    if (plain?.[1]) return plain[1].trim()
  }
  const fromUrl = url.pathname.split('/').filter(Boolean).pop()
  if (fromUrl) {
    try {
      return decodeURIComponent(fromUrl)
    } catch {
      return fromUrl
    }
  }
  return fallback
}

export async function addBackupFromUrl(
  project: Project,
  input: { url: unknown; location?: unknown; name?: unknown }
): Promise<Backup> {
  if (typeof input.url !== 'string' || !input.url.trim()) {
    throw new ConfigError('Backup URL is required', 400)
  }
  let url: URL
  try {
    url = new URL(input.url.trim())
  } catch {
    throw new ConfigError('Backup URL is invalid', 400)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new ConfigError('Backup URL must use http or https', 400)
  }

  let response: Response
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(120_000)
    })
  } catch (error) {
    throw new ConfigError(
      `Could not download backup: ${error instanceof Error ? error.message : String(error)}`,
      502
    )
  }
  if (!response.ok) {
    throw new ConfigError(`Backup download failed (HTTP ${response.status})`, 502)
  }
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BACKUP_BYTES) {
    throw new ConfigError('The backup file exceeds the 512 MB limit', 413)
  }
  let buffer: Buffer
  try {
    buffer = Buffer.from(await response.arrayBuffer())
  } catch (error) {
    throw new ConfigError(
      `Could not read backup download: ${error instanceof Error ? error.message : String(error)}`,
      502
    )
  }
  const fileName =
    typeof input.name === 'string' && input.name.trim()
      ? input.name
      : remoteFileName(url, response.headers.get('content-disposition'), defaultBackupName(project.name))
  return saveBackupBuffer(project, {
    buffer,
    fileName,
    location: input.location,
    source: 'url'
  })
}

function normalizeToolCalls(value: unknown): ToolCall[] | null {
  if (!Array.isArray(value)) return null
  const calls: ToolCall[] = []
  for (const raw of value) {
    const call = recordOf(raw)
    const fn = recordOf(call?.function)
    if (!call || !fn) continue
    if (typeof call.id !== 'string' || typeof fn.name !== 'string') continue
    calls.push({
      id: call.id,
      type: 'function',
      function: {
        name: fn.name,
        arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {})
      }
    })
  }
  return calls.length ? calls : null
}

function normalizeManifestChats(manifest: Record<string, unknown>): ImportedChat[] {
  const rawChats = Array.isArray(manifest.chats) ? manifest.chats : []
  const records: ImportedChat[] = []
  for (const rawChat of rawChats) {
    const chat = recordOf(rawChat)
    if (!chat) continue
    const title =
      typeof chat.title === 'string' && chat.title.trim()
        ? chat.title.trim().slice(0, 120)
        : 'Restored chat'
    const modelId =
      typeof chat.modelId === 'string' && getModel(chat.modelId) ? chat.modelId : null
    const rawMessages = Array.isArray(chat.messages) ? chat.messages : []
    const messages: ImportedChatMessage[] = []
    for (const rawMessage of rawMessages) {
      const message = recordOf(rawMessage)
      if (!message) continue
      const role = message.role
      const safeRole: Role =
        role === 'system' || role === 'user' || role === 'assistant' || role === 'tool'
          ? role
          : 'user'
      messages.push({
        sourceId: typeof message.id === 'string' ? message.id : null,
        role: safeRole,
        content: typeof message.content === 'string' ? message.content : '',
        toolCalls: normalizeToolCalls(message.toolCalls),
        toolCallId: typeof message.toolCallId === 'string' ? message.toolCallId : null,
        modelId: typeof message.modelId === 'string' ? message.modelId : null,
        durationMs:
          typeof message.durationMs === 'number' && Number.isFinite(message.durationMs)
            ? message.durationMs
            : null,
        createdAt:
          typeof message.createdAt === 'number' && Number.isFinite(message.createdAt)
            ? message.createdAt
            : Date.now()
      })
    }
    const rawSummary = recordOf(chat.summary)
    const summary =
      rawSummary && typeof rawSummary.summary === 'string' && rawSummary.summary.trim()
        ? {
            summary: rawSummary.summary,
            coveredMessageId:
              typeof rawSummary.coveredMessageId === 'string'
                ? rawSummary.coveredMessageId
                : null,
            updatedAt:
              typeof rawSummary.updatedAt === 'number' && Number.isFinite(rawSummary.updatedAt)
                ? rawSummary.updatedAt
                : Date.now()
          }
        : null
    records.push({
      title,
      modelId,
      createdAt:
        typeof chat.createdAt === 'number' && Number.isFinite(chat.createdAt)
          ? chat.createdAt
          : Date.now(),
      updatedAt:
        typeof chat.updatedAt === 'number' && Number.isFinite(chat.updatedAt)
          ? chat.updatedAt
          : Date.now(),
      messages,
      summary
    })
  }
  return records
}

function safeArchivePath(name: string): string | null {
  const raw = name.replace(/\\/g, '/')
  if (!raw || raw.includes('\0')) return null
  if (raw.startsWith('/') || /^[A-Za-z]:\//.test(raw)) return null
  const parts = raw.split('/').filter(Boolean)
  if (parts.length === 0) return null
  if (parts.some((part) => part === '.' || part === '..')) return null
  return parts.join('/')
}

export function restoreProjectBackup(
  project: Project,
  id: string
): { ok: true; files: number; chats: number; messages: number } {
  const { backup, stat } = getProjectBackup(project, id)
  if (stat.size > MAX_RESTORE_BYTES) {
    throw new ConfigError('The backup file is too large to restore', 413)
  }
  const archive = fs.readFileSync(backup.path)
  let entries: ZipEntry[]
  try {
    entries = readZip(archive, { maxTotalBytes: MAX_RESTORE_BYTES })
  } catch (error) {
    throw new ConfigError(
      `Could not read backup: ${error instanceof Error ? error.message : String(error)}`,
      400
    )
  }

  let files = 0
  for (const entry of entries) {
    if (entry.name === MANIFEST_NAME) continue
    const relative = safeArchivePath(entry.name)
    if (!relative) throw new ConfigError(`Backup contains an unsafe path: ${entry.name}`, 400)
    const target = resolveInProject(project.path, relative)
    if (!target) throw new ConfigError(`Backup path escapes the project: ${entry.name}`, 400)
    try {
      if (entry.directory) {
        fs.mkdirSync(target, { recursive: true })
      } else {
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, entry.data)
        files += 1
      }
    } catch (error) {
      throw new ConfigError(
        `Could not restore ${relative}: ${error instanceof Error ? error.message : String(error)}`,
        500
      )
    }
  }

  let chats = 0
  let messages = 0
  const manifest = manifestFromEntries(entries)
  if (manifest && isChatIncluded(manifest, false)) {
    const imported = importChats(project.id, normalizeManifestChats(manifest))
    chats = imported.chats.length
    messages = imported.messages
  }
  return { ok: true, files, chats, messages }
}

export function deleteProjectBackup(project: Project, id: string): void {
  const backup = getBackup(id)
  if (!backup || backup.projectId !== project.id) {
    throw new ConfigError('Backup not found', 404)
  }
  try {
    const stat = fs.lstatSync(backup.path)
    if (stat.isFile() || stat.isSymbolicLink()) fs.unlinkSync(backup.path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw new ConfigError(
        `Could not delete backup file: ${error instanceof Error ? error.message : String(error)}`,
        500
      )
    }
  }
  removeBackup(backup.id)
}
