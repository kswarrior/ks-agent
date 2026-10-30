import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono, type Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { runAgent } from './agent.js'
import { config, isInside } from './config.js'
import {
  getChat,
  getChatSummary,
  getKnowledge,
  getModel,
  getProject,
  getProvider,
  insertChat,
  insertKnowledge,
  insertMessage,
  insertModel,
  insertProject,
  insertProvider,
  listChatDisabled,
  listChats,
  listGlobalKnowledge,
  listKnowledge,
  listMessages,
  listModels,
  listProjectKnowledge,
  listProjects,
  listProviders,
  removeChat,
  removeChatSummary,
  removeKnowledge,
  removeModel,
  removeProject,
  removeProvider,
  saveChatSummary,
  setChatExtensionEnabled,
  touchChat,
  updateChat,
  updateKnowledge,
  updateModel,
  updateProvider
} from './db.js'
import { describeFailure, errorStatus } from './errors.js'
import { extensions } from './extensions.js'
import { cleanRelative, isProbablyBinary, relWithin, resolveInProject, validSegment } from './fsx.js'
import { knowledge } from './knowledge.js'
import { lsp } from './lsp.js'
import { mcp } from './mcp.js'
import {
  DEFAULT_RETRY_SETTINGS,
  getRetrySettings,
  saveRetrySettings
} from './retry.js'
import { normalizeProjects } from './scope.js'
import { skills } from './skills.js'
import type { AgentEvent, Chat, ChatExtensionsState, ExtensionKind, Project, ProviderPublic } from './types.js'

const app = new Hono()

interface RunState {
  chatId: string
  controller: AbortController
  events: AgentEvent[]
  done: boolean
  startedAt: number
}

const runs = new Map<string, RunState>()

const MAX_FILE_LIST_ENTRIES = 2000
const MAX_FILE_EDIT_BYTES = 2 * 1024 * 1024
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

function errorJson(message: string, status = 400) {
  return { error: message, status }
}

function configErrorJson(error: unknown) {
  const status = errorStatus(error) as 400 | 403 | 404 | 409 | 413 | 500
  return { body: errorJson(error instanceof Error ? error.message : String(error), status), status }
}

function publicProvider(provider: {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  createdAt: number
}): ProviderPublic {
  return {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl,
    hasKey: provider.apiKey.length > 0,
    createdAt: provider.createdAt
  }
}

function safeName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim()
  if (!name || name.length > 100 || name.includes('\0')) return null
  return name
}

function validProjectRel(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const rel = cleanRelative(value)
  if (rel === '.') return null
  const parts = rel.split('/').filter(Boolean)
  if (parts.length === 0 || !parts.every(validSegment)) return null
  return parts.join('/')
}

function readProjectIds(value: unknown): string[] | null {
  if (value !== undefined && typeof value !== 'string' && !Array.isArray(value)) return null
  const ids = normalizeProjects(value)
  if (ids.some((id) => !getProject(id))) return null
  return ids
}

function chatExtensionsState(chat: Chat, project: Project): ChatExtensionsState {
  const disabled = listChatDisabled(chat.id)
  return {
    skills: skills
      .listForProject(project.id)
      .map((skill) => ({ ...skill, enabled: !disabled.skill.has(skill.name) })),
    knowledge: knowledge
      .listForProject(project.id)
      .filter((entry) => entry.enabled)
      .map(({ content: _content, enabled: _enabled, ...entry }) => ({
        ...entry,
        enabled: !disabled.knowledge.has(entry.id)
      })),
    mcpServers: mcp
      .listForProject(project.id)
      .map((server) => ({ ...server, enabled: !disabled.mcp.has(server.name) })),
    lspServers: lsp
      .listForProject(project.id)
      .map((server) => ({ ...server, enabled: !disabled.lsp.has(server.name) }))
  }
}

function chatTitleFromPrompt(content: string): string {
  const text = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return 'New chat'

  const stripped = text.replace(
    /^(?:(?:please|pls|kindly|can you|could you|would you|will you|i want you to|i need you to|help me|i want to|i need to)\s+)+/i,
    ''
  )
  const firstSentence = stripped.split(/(?<=[.!?])\s/)[0] ?? stripped
  const words = firstSentence.split(' ')
  let title = words.length > 8 ? words.slice(0, 8).join(' ') : firstSentence
  title = title.replace(/[\s,;:!.?\-–—]+$/, '')
  if (title.length > 60) {
    const cut = title.slice(0, 60)
    const at = cut.lastIndexOf(' ')
    title = cut.slice(0, at > 40 ? at : 60).trimEnd()
  }
  if (!title) return 'New chat'
  return title.charAt(0).toUpperCase() + title.slice(1)
}

const DEFAULT_PROJECT_NAME = 'My Project'
const DEFAULT_PROJECT_FOLDER = 'my-project'

function ensureProjectChat(projectId: string) {
  const existing = listChats(projectId)
  if (existing.length > 0) return existing[0]
  return insertChat(projectId, 'New chat', null)
}

function ensureDefaultProject(): void {
  if (listProjects().length > 0) return
  const abs = resolveInProject(config.projectsDir, DEFAULT_PROJECT_FOLDER)
  if (!abs) return
  fs.mkdirSync(abs, { recursive: true })
  const project = insertProject(DEFAULT_PROJECT_NAME, fs.realpathSync(abs))
  ensureProjectChat(project.id)
}

ensureDefaultProject()
for (const project of listProjects()) ensureProjectChat(project.id)

app.onError((error, c) => {
  console.error('[server]', error)
  return c.json(errorJson(error instanceof Error ? error.message : String(error), 500), 500)
})

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    name: 'ks-agent',
    version: '0.2.0',
    projects: listProjects().length,
    extensions: extensions.list().length,
    skills: skills.count(),
    mcpServers: mcp.count(),
    lspServers: lsp.count()
  })
)

app.get('/api/config', (c) =>
  c.json({
    maxSteps: config.maxSteps,
    maxToolOutput: config.maxToolOutput,
    dockerJail: config.dockerJail,
    projectsDir: config.projectsDir,
    skillsDirs: config.skillsDirs,
    mcpConfigPath: config.mcpConfigPath,
    lspConfigPath: config.lspConfigPath,
    extensions: extensions.list()
  })
)

// ---------------------------------------------------------------- projects
app.get('/api/projects', (c) => c.json(listProjects()))

app.post('/api/projects', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json(errorJson('JSON body required'), 400)
  const name = safeName(body.name)
  if (!name) return c.json(errorJson('name is required (max 100 chars)'), 400)

  const requested = typeof body.path === 'string' && body.path.trim() ? body.path.trim() : name
  const relative = cleanRelative(requested)
  const abs = resolveInProject(config.projectsDir, relative)
  if (!abs) return c.json(errorJson('project path must stay inside the projects directory'), 400)
  if (path.resolve(abs) === path.resolve(config.projectsDir)) {
    return c.json(errorJson('project path cannot be the projects directory itself'), 400)
  }
  if (listProjects().some((project) => path.resolve(project.path) === path.resolve(abs))) {
    return c.json(errorJson('a project already uses this path'), 409)
  }

  fs.mkdirSync(abs, { recursive: true })
  const real = fs.realpathSync(abs)
  const project = insertProject(name, real)
  ensureProjectChat(project.id)
  void extensions.runHook('project.open', real, { projectId: project.id, name }).catch((error) => {
    console.warn('[extensions] project.open hook failed:', error)
  })
  return c.json(project, 201)
})

app.delete('/api/projects/:id', (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const deleteFolder = c.req.query('deleteFolder') === 'true'
  removeProject(project.id)
  if (
    deleteFolder &&
    isInside(config.projectsDir, project.path) &&
    path.resolve(project.path) !== path.resolve(config.projectsDir)
  ) {
    fs.rmSync(project.path, { recursive: true, force: true })
  }
  return c.json({ ok: true })
})

// ------------------------------------------------------------------- files
app.get('/api/projects/:id/files', (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const abs = resolveInProject(project.path, String(c.req.query('path') ?? ''))
  if (!abs) return c.json(errorJson('invalid path'), 400)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    return c.json(errorJson('path not found', 404), 404)
  }
  if (!stat.isDirectory()) return c.json(errorJson('not a directory'), 400)
  const dirs: Array<{ name: string; type: 'dir' }> = []
  const files: Array<{ name: string; type: 'file'; size: number }> = []
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      dirs.push({ name: entry.name, type: 'dir' })
    } else if (entry.isFile()) {
      let size = 0
      try {
        size = fs.statSync(path.join(abs, entry.name)).size
      } catch {
        // ignore unreadable files
      }
      files.push({ name: entry.name, type: 'file', size })
    }
  }
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)
  dirs.sort(byName)
  files.sort(byName)
  return c.json({
    path: relWithin(project.path, abs),
    entries: [...dirs, ...files].slice(0, MAX_FILE_LIST_ENTRIES)
  })
})

app.post('/api/projects/:id/files', async (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const kind = body?.kind === 'folder' ? 'folder' : body?.kind === 'file' ? 'file' : null
  if (!kind) return c.json(errorJson('kind must be "file" or "folder"'), 400)
  const rel = validProjectRel(body?.path)
  if (!rel) return c.json(errorJson('invalid path'), 400)
  const abs = resolveInProject(project.path, rel)
  if (!abs) return c.json(errorJson('invalid path'), 400)
  if (fs.existsSync(abs)) return c.json(errorJson(`"${rel}" already exists`), 400)
  try {
    if (kind === 'folder') {
      fs.mkdirSync(abs, { recursive: true })
    } else {
      fs.mkdirSync(path.dirname(abs), { recursive: true })
      fs.writeFileSync(abs, '', { flag: 'wx' })
    }
  } catch (error) {
    return c.json(errorJson(error instanceof Error ? error.message : 'failed to create'), 400)
  }
  return c.json({ ok: true, path: rel }, 201)
})

app.patch('/api/projects/:id/files', async (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const from = validProjectRel(body?.from)
  const to = validProjectRel(body?.to)
  if (!from) return c.json(errorJson('invalid source path'), 400)
  if (!to) return c.json(errorJson('invalid destination path'), 400)
  const fromAbs = resolveInProject(project.path, from)
  const toAbs = resolveInProject(project.path, to)
  if (!fromAbs || !toAbs) return c.json(errorJson('invalid path'), 400)
  if (!fs.existsSync(fromAbs)) return c.json(errorJson(`"${from}" not found`), 404)
  if (fs.existsSync(toAbs)) return c.json(errorJson(`"${to}" already exists`), 400)
  try {
    fs.mkdirSync(path.dirname(toAbs), { recursive: true })
    fs.renameSync(fromAbs, toAbs)
  } catch (error) {
    return c.json(errorJson(error instanceof Error ? error.message : 'rename failed'), 400)
  }
  return c.json({ ok: true, path: to })
})

app.delete('/api/projects/:id/files', (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const rel = validProjectRel(c.req.query('path'))
  if (!rel) return c.json(errorJson('invalid path'), 400)
  const abs = resolveInProject(project.path, rel)
  if (!abs) return c.json(errorJson('invalid path'), 400)
  if (!fs.existsSync(abs)) return c.json(errorJson('path not found', 404), 404)
  try {
    fs.rmSync(abs, { recursive: true, force: true })
  } catch (error) {
    return c.json(errorJson(error instanceof Error ? error.message : 'delete failed'), 400)
  }
  return c.json({ ok: true })
})

app.get('/api/projects/:id/files/content', (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const rel = validProjectRel(c.req.query('path'))
  if (!rel) return c.json(errorJson('invalid path'), 400)
  const abs = resolveInProject(project.path, rel)
  if (!abs) return c.json(errorJson('invalid path'), 400)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    return c.json(errorJson('file not found', 404), 404)
  }
  if (!stat.isFile()) return c.json(errorJson('not a file'), 400)
  if (stat.size > MAX_FILE_EDIT_BYTES) return c.json(errorJson('file too large to open'), 413)
  const buffer = fs.readFileSync(abs)
  const binary = isProbablyBinary(buffer)
  return c.json({
    path: rel,
    size: stat.size,
    binary,
    content: binary ? '' : buffer.toString('utf8')
  })
})

app.put('/api/projects/:id/files/content', async (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const rel = validProjectRel(body?.path)
  const content = typeof body?.content === 'string' ? body.content : null
  if (!rel) return c.json(errorJson('invalid path'), 400)
  if (content === null) return c.json(errorJson('content is required'), 400)
  if (Buffer.byteLength(content, 'utf8') > MAX_FILE_EDIT_BYTES) {
    return c.json(errorJson('content too large'), 413)
  }
  const abs = resolveInProject(project.path, rel)
  if (!abs) return c.json(errorJson('invalid path'), 400)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    return c.json(errorJson('file not found', 404), 404)
  }
  if (!stat.isFile()) return c.json(errorJson('not a file'), 400)
  try {
    fs.writeFileSync(abs, content, 'utf8')
  } catch (error) {
    return c.json(errorJson(error instanceof Error ? error.message : 'failed to write file'), 400)
  }
  return c.json({ ok: true })
})

app.get('/api/projects/:id/files/download', (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const rel = validProjectRel(c.req.query('path'))
  if (!rel) return c.json(errorJson('invalid path'), 400)
  const abs = resolveInProject(project.path, rel)
  if (!abs) return c.json(errorJson('invalid path'), 400)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    return c.json(errorJson('file not found', 404), 404)
  }
  if (!stat.isFile()) return c.json(errorJson('not a file'), 400)
  const filename = path.basename(abs)
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'download'
  c.header('Content-Type', 'application/octet-stream')
  c.header('Content-Length', String(stat.size))
  c.header(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  )
  return c.body(Readable.toWeb(fs.createReadStream(abs)) as unknown as ReadableStream)
})

app.post('/api/projects/:id/files/upload', async (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return c.json(errorJson('expected multipart form data'), 400)
  }
  const form = await c.req.parseBody().catch(() => null)
  if (!form) return c.json(errorJson('failed to parse form data'), 400)
  const abs = resolveInProject(project.path, String(form.path ?? ''))
  if (!abs) return c.json(errorJson('invalid path'), 400)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    return c.json(errorJson('path not found', 404), 404)
  }
  if (!stat.isDirectory()) return c.json(errorJson('target is not a directory'), 400)
  const raw = form.file
  const items = (Array.isArray(raw) ? raw : [raw]).filter((item): item is File => item instanceof File)
  if (items.length === 0) return c.json(errorJson('no files in upload'), 400)
  for (const item of items) {
    if (!validSegment(item.name)) return c.json(errorJson(`invalid file name: "${item.name}"`), 400)
    if (item.size > MAX_UPLOAD_BYTES) return c.json(errorJson(`"${item.name}" exceeds size limit`), 400)
  }
  const saved: string[] = []
  for (const item of items) {
    const dest = path.join(abs, item.name)
    if (fs.existsSync(dest)) return c.json(errorJson(`"${item.name}" already exists`), 400)
    try {
      fs.writeFileSync(dest, Buffer.from(await item.arrayBuffer()), { flag: 'wx' })
    } catch (error) {
      return c.json(errorJson(error instanceof Error ? error.message : 'upload failed'), 400)
    }
    saved.push(item.name)
  }
  return c.json({ ok: true, saved }, 201)
})

// ------------------------------------------------------------------- chats
app.get('/api/projects/:id/chats', (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const chats = listChats(project.id)
  if (chats.length === 0) chats.push(ensureProjectChat(project.id))
  return c.json(chats)
})

app.post('/api/projects/:id/chats', async (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const title =
    typeof body?.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : 'New chat'
  const modelId = typeof body?.modelId === 'string' && body.modelId ? body.modelId : null
  if (modelId && !getModel(modelId)) return c.json(errorJson('model not found'), 404)
  return c.json(insertChat(project.id, title, modelId), 201)
})

app.patch('/api/chats/:id', async (c) => {
  const chat = getChat(c.req.param('id'))
  if (!chat) return c.json(errorJson('chat not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json(errorJson('JSON body required'), 400)
  const title = body.title === undefined ? undefined : safeName(body.title)
  if (body.title !== undefined && !title) return c.json(errorJson('title must be a non-empty string'), 400)
  const modelId =
    body.modelId === undefined
      ? undefined
      : body.modelId === null
        ? null
        : typeof body.modelId === 'string'
          ? body.modelId
          : undefined
  if (modelId && !getModel(modelId)) return c.json(errorJson('model not found'), 404)
  return c.json(updateChat(chat.id, { title: title ?? undefined, modelId }))
})

app.get('/api/chats/:id/extensions', (c) => {
  const chat = getChat(c.req.param('id'))
  if (!chat) return c.json(errorJson('chat not found', 404), 404)
  const project = getProject(chat.projectId)
  if (!project) return c.json(errorJson('project not found', 404), 404)
  return c.json(chatExtensionsState(chat, project))
})

app.patch('/api/chats/:id/extensions', async (c) => {
  const chat = getChat(c.req.param('id'))
  if (!chat) return c.json(errorJson('chat not found', 404), 404)
  const project = getProject(chat.projectId)
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const kind = body?.kind
  if (kind !== 'skill' && kind !== 'knowledge' && kind !== 'mcp' && kind !== 'lsp') {
    return c.json(errorJson('kind must be skill, knowledge, mcp or lsp'), 400)
  }
  const rawName = typeof body?.name === 'string' ? body.name.trim() : ''
  const name = kind === 'knowledge' ? rawName : rawName.toLowerCase()
  if (!name) return c.json(errorJson('name is required'), 400)
  if (typeof body?.enabled !== 'boolean') return c.json(errorJson('enabled must be a boolean'), 400)
  let resolvedName = name
  let available = false
  if (kind === 'skill') {
    available = skills.listForProject(project.id).some((skill) => skill.name === name)
  } else if (kind === 'knowledge') {
    const entries = knowledge.listForProject(project.id).filter((entry) => entry.enabled)
    const entry = entries.find((item) => item.id === name) ?? entries.find((item) => item.title === name)
    available = Boolean(entry)
    resolvedName = entry?.id ?? name
  } else if (kind === 'mcp') {
    available = mcp.listForProject(project.id).some((server) => server.name === name)
  } else {
    available = lsp.listForProject(project.id).some((server) => server.name === name)
  }
  if (!available) {
    return c.json(errorJson(`${kind} "${name}" is not enabled for this project`, 404), 404)
  }
  setChatExtensionEnabled(chat.id, kind as ExtensionKind, resolvedName, body.enabled)
  return c.json({ ok: true, kind, name: resolvedName, enabled: body.enabled })
})

app.delete('/api/chats/:id', (c) => {
  const chat = getChat(c.req.param('id'))
  if (!chat) return c.json(errorJson('chat not found', 404), 404)
  const run = runs.get(chat.id)
  if (run && !run.done) run.controller.abort()
  runs.delete(chat.id)
  removeChat(chat.id)
  ensureProjectChat(chat.projectId)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------- messages
app.get('/api/chats/:id/messages', (c) => {
  const chat = getChat(c.req.param('id'))
  if (!chat) return c.json(errorJson('chat not found', 404), 404)
  return c.json(listMessages(chat.id))
})

app.get('/api/chats/:id/summary', (c) => {
  const chat = getChat(c.req.param('id'))
  if (!chat) return c.json(errorJson('chat not found', 404), 404)
  return c.json(getChatSummary(chat.id))
})

app.put('/api/chats/:id/summary', async (c) => {
  const chat = getChat(c.req.param('id'))
  if (!chat) return c.json(errorJson('chat not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const summary = typeof body?.summary === 'string' ? body.summary.trim() : ''
  if (!summary) return c.json(errorJson('summary must be a non-empty string'), 400)
  if (summary.length > 50_000) return c.json(errorJson('summary must be 50000 characters or fewer'), 400)
  const current = getChatSummary(chat.id)
  const messages = listMessages(chat.id)
  const requestedCovered = typeof body?.coveredMessageId === 'string' ? body.coveredMessageId : ''
  const coveredMessageId = messages.some((message) => message.id === requestedCovered)
    ? requestedCovered
    : current?.coveredMessageId || messages[messages.length - 1]?.id || ''
  return c.json(saveChatSummary(chat.id, summary, coveredMessageId))
})

app.delete('/api/chats/:id/summary', (c) => {
  const chat = getChat(c.req.param('id'))
  if (!chat) return c.json(errorJson('chat not found', 404), 404)
  removeChatSummary(chat.id)
  return c.json({ ok: true })
})

app.post('/api/chats/:id/messages', async (c) => {
  const chat = getChat(c.req.param('id'))
  if (!chat) return c.json(errorJson('chat not found', 404), 404)
  const existingRun = runs.get(chat.id)
  if (existingRun && !existingRun.done) {
    return c.json(errorJson('a run is already active for this chat', 409), 409)
  }

  const project = getProject(chat.projectId)
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const content = typeof body?.content === 'string' ? body.content : ''
  if (!content.trim()) return c.json(errorJson('content is required'), 400)
  if (content.length > 200_000) return c.json(errorJson('content is too large'), 413)

  const requestedModel = typeof body?.modelId === 'string' && body.modelId ? body.modelId : chat.modelId
  if (!requestedModel) return c.json(errorJson('modelId is required (add a provider and model first)'), 400)
  const model = getModel(requestedModel)
  if (!model) return c.json(errorJson('model not found', 404), 404)
  const provider = getProvider(model.providerId)
  if (!provider) return c.json(errorJson('provider not found', 404), 404)

  insertMessage({ chatId: chat.id, role: 'user', content })
  let chatTitle = chat.title
  if (!chat.title || chat.title === 'New chat') {
    const updated = updateChat(chat.id, { title: chatTitleFromPrompt(content) })
    chatTitle = updated?.title ?? chat.title
  } else {
    touchChat(chat.id)
  }
  if (chat.modelId !== model.id) updateChat(chat.id, { modelId: model.id })

  const run: RunState = {
    chatId: chat.id,
    controller: new AbortController(),
    events: [],
    done: false,
    startedAt: Date.now()
  }
  runs.set(chat.id, run)

  const publish = (event: AgentEvent) => {
    run.events.push(event)
    if (event.type === 'done' || event.type === 'error') run.done = true
  }

  void runAgent({
    chat,
    project,
    provider,
    model,
    signal: run.controller.signal,
    onEvent: publish
  })
    .catch((error) => {
      if (!run.done) publish({ type: 'error', ...describeFailure(error) })
    })
    .finally(() => {
      run.done = true
      const timer = setTimeout(() => {
        if (runs.get(chat.id) === run) runs.delete(chat.id)
      }, 5 * 60_000)
      timer.unref()
    })

  return c.json({ ok: true, chatId: chat.id, title: chatTitle }, 202)
})

app.get('/api/chats/:id/events', (c) => {
  const chat = getChat(c.req.param('id'))
  if (!chat) return c.json(errorJson('chat not found', 404), 404)
  const run = runs.get(chat.id)
  if (!run) return c.json(errorJson('no active run', 404), 404)

  return streamSSE(c, async (stream) => {
    let closed = false
    let index = 0
    stream.onAbort(() => {
      closed = true
    })
    try {
      while (!closed) {
        while (index < run.events.length) {
          await stream.writeSSE({ data: JSON.stringify(run.events[index++]) })
        }
        if (run.done) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    } catch {
      closed = true
    }
  })
})

app.get('/api/chats/:id/run', (c) => {
  const chat = getChat(c.req.param('id'))
  if (!chat) return c.json(errorJson('chat not found', 404), 404)
  const run = runs.get(chat.id)
  return c.json({ active: Boolean(run && !run.done) })
})

app.post('/api/chats/:id/stop', (c) => {
  const run = runs.get(c.req.param('id'))
  if (!run) return c.json(errorJson('no active run', 404), 404)
  if (!run.done) run.controller.abort()
  return c.json({ ok: true })
})

// --------------------------------------------------------------- providers
app.get('/api/providers', (c) => c.json(listProviders().map(publicProvider)))

app.post('/api/providers', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const name = safeName(body?.name)
  const baseUrl = typeof body?.baseUrl === 'string' ? body.baseUrl.trim().replace(/\/+$/, '') : ''
  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : ''
  if (!name) return c.json(errorJson('name is required'), 400)
  if (!/^https?:\/\//i.test(baseUrl)) return c.json(errorJson('baseUrl must start with http:// or https://'), 400)
  if (baseUrl.length > 500 || apiKey.length > 10_000) return c.json(errorJson('provider fields are too large'), 413)
  return c.json(publicProvider(insertProvider(name, baseUrl, apiKey)), 201)
})

app.patch('/api/providers/:id', async (c) => {
  const provider = getProvider(c.req.param('id'))
  if (!provider) return c.json(errorJson('provider not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json(errorJson('JSON body required'), 400)
  const name = body.name === undefined ? provider.name : safeName(body.name)
  if (!name) return c.json(errorJson('name is required'), 400)
  const baseUrl =
    body.baseUrl === undefined
      ? provider.baseUrl
      : typeof body.baseUrl === 'string'
        ? body.baseUrl.trim().replace(/\/+$/, '')
        : ''
  if (!/^https?:\/\//i.test(baseUrl)) return c.json(errorJson('baseUrl must start with http:// or https://'), 400)
  const apiKey =
    body.apiKey === undefined ? provider.apiKey : typeof body.apiKey === 'string' ? body.apiKey.trim() : ''
  const updated = updateProvider(provider.id, name, baseUrl, apiKey) ?? provider
  return c.json(publicProvider(updated))
})

app.delete('/api/providers/:id', (c) => {
  const provider = getProvider(c.req.param('id'))
  if (!provider) return c.json(errorJson('provider not found', 404), 404)
  removeProvider(provider.id)
  return c.json({ ok: true })
})

// ------------------------------------------------------------------ models
const DEFAULT_CONTEXT_WINDOW = 128_000
const MAX_CONTEXT_WINDOW = 10_000_000

function parseContextWindow(value: unknown): number | null {
  if (value === undefined) return DEFAULT_CONTEXT_WINDOW
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  if (!Number.isInteger(parsed) || parsed < 1_000 || parsed > MAX_CONTEXT_WINDOW) return null
  return parsed
}

app.get('/api/models', (c) => c.json(listModels()))

app.post('/api/models', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const providerId = typeof body?.providerId === 'string' ? body.providerId : ''
  const name = safeName(body?.name)
  const modelId = typeof body?.modelId === 'string' ? body.modelId.trim() : ''
  const contextWindow = parseContextWindow(body?.contextWindow)
  if (!providerId || !getProvider(providerId)) return c.json(errorJson('valid providerId is required'), 400)
  if (!name) return c.json(errorJson('name is required'), 400)
  if (!modelId) return c.json(errorJson('modelId is required'), 400)
  if (contextWindow === null) {
    return c.json(errorJson('contextWindow must be an integer between 1000 and 10000000'), 400)
  }
  return c.json(insertModel(providerId, name, modelId, contextWindow), 201)
})

app.patch('/api/models/:id', async (c) => {
  const model = getModel(c.req.param('id'))
  if (!model) return c.json(errorJson('model not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json(errorJson('JSON body required'), 400)
  const providerId =
    body.providerId === undefined
      ? undefined
      : typeof body.providerId === 'string'
        ? body.providerId
        : ''
  if (providerId !== undefined && (!providerId || !getProvider(providerId))) {
    return c.json(errorJson('valid providerId is required'), 400)
  }
  const name = body.name === undefined ? undefined : safeName(body.name)
  if (name !== undefined && !name) return c.json(errorJson('name is required'), 400)
  const modelId =
    body.modelId === undefined ? undefined : typeof body.modelId === 'string' ? body.modelId.trim() : ''
  if (modelId !== undefined && !modelId) return c.json(errorJson('modelId is required'), 400)
  const contextWindow = body.contextWindow === undefined ? undefined : parseContextWindow(body.contextWindow)
  if (contextWindow === null) {
    return c.json(errorJson('contextWindow must be an integer between 1000 and 10000000'), 400)
  }
  if (providerId === undefined && name === undefined && modelId === undefined && contextWindow === undefined) {
    return c.json(errorJson('no model fields to update'), 400)
  }
  return c.json(updateModel(model.id, { providerId, name, modelId, contextWindow }))
})

app.delete('/api/models/:id', (c) => {
  const model = getModel(c.req.param('id'))
  if (!model) return c.json(errorJson('model not found', 404), 404)
  removeModel(model.id)
  return c.json({ ok: true })
})

// --------------------------------------------------------------- settings
app.get('/api/settings/retry', (c) => c.json(getRetrySettings()))

app.put('/api/settings/retry', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json(errorJson('JSON object body required'), 400)
  }
  return c.json(saveRetrySettings(body))
})

app.post('/api/settings/retry/reset', (c) => c.json(saveRetrySettings(DEFAULT_RETRY_SETTINGS)))

// -------------------------------------------------------------- extensions
app.get('/api/extensions', (c) => c.json(extensions.list()))

app.post('/api/extensions/reload', async (c) => c.json(await extensions.reload()))

app.get('/api/extensions/:name', (c) => {
  const found = extensions.list().find((extension) => extension.name === c.req.param('name'))
  if (!found) return c.json(errorJson('extension not found', 404), 404)
  return c.json(found)
})

// ---------------------------------------------------------------- knowledge
function parseKnowledgeFields(body: Record<string, unknown> | null): {
  title?: string
  content?: string
  enabled?: boolean
  error?: string
} {
  const out: { title?: string; content?: string; enabled?: boolean; error?: string } = {}
  if (body?.title !== undefined) {
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title || title.length > 120) {
      return { error: 'title must be a non-empty string of 120 characters or fewer' }
    }
    out.title = title
  }
  if (body?.content !== undefined) {
    const content = typeof body.content === 'string' ? body.content.trim() : ''
    if (!content) return { error: 'content must be a non-empty string' }
    if (content.length > 50_000) return { error: 'content must be 50000 characters or fewer' }
    out.content = content
  }
  if (body?.enabled !== undefined) {
    if (typeof body.enabled !== 'boolean') return { error: 'enabled must be a boolean' }
    out.enabled = body.enabled
  }
  return out
}

app.get('/api/knowledge', (c) => {
  const projectId = c.req.query('projectId')
  if (projectId) {
    if (!getProject(projectId)) return c.json(errorJson('project not found', 404), 404)
    return c.json(listProjectKnowledge(projectId))
  }
  if (c.req.query('scope') === 'global') return c.json(listGlobalKnowledge())
  return c.json(listKnowledge())
})

app.get('/api/knowledge/all', (c) => c.json(listKnowledge()))

app.post('/api/knowledge', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json(errorJson('JSON body required'), 400)
  const fields = parseKnowledgeFields(body)
  if (fields.error) return c.json(errorJson(fields.error), 400)
  if (!fields.title || !fields.content) {
    return c.json(errorJson('title and content are required'), 400)
  }

  let scope: 'global' | 'project'
  if (body.scope === 'global' || body.scope === 'user') scope = 'global'
  else if (body.scope === 'project' || body.projectId !== undefined) scope = 'project'
  else scope = 'global'
  if (
    body.scope !== undefined &&
    body.scope !== 'global' &&
    body.scope !== 'user' &&
    body.scope !== 'project'
  ) {
    return c.json(errorJson('scope must be global, user or project'), 400)
  }

  let projectId: string | null = null
  if (scope === 'project') {
    if (typeof body.projectId !== 'string' || !body.projectId.trim()) {
      return c.json(errorJson('projectId is required for project knowledge'), 400)
    }
    projectId = body.projectId.trim()
    if (!getProject(projectId)) return c.json(errorJson('project not found', 404), 404)
  } else if (body.projectId !== undefined) {
    return c.json(errorJson('global knowledge cannot have a projectId'), 400)
  }

  const entry = insertKnowledge({
    scope,
    projectId,
    title: fields.title,
    content: fields.content,
    enabled: fields.enabled
  })
  return c.json(entry, 201)
})

app.get('/api/projects/:id/knowledge', (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  return c.json(listProjectKnowledge(project.id))
})

app.post('/api/projects/:id/knowledge', async (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json(errorJson('JSON body required'), 400)
  const fields = parseKnowledgeFields(body)
  if (fields.error) return c.json(errorJson(fields.error), 400)
  if (!fields.title || !fields.content) {
    return c.json(errorJson('title and content are required'), 400)
  }
  return c.json(
    insertKnowledge({
      scope: 'project',
      projectId: project.id,
      title: fields.title,
      content: fields.content,
      enabled: fields.enabled
    }),
    201
  )
})

async function updateKnowledgeRoute(c: Context) {
  const entry = getKnowledge(c.req.param('id') ?? '')
  if (!entry) return c.json(errorJson('knowledge entry not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json(errorJson('JSON body required'), 400)
  const fields = parseKnowledgeFields(body)
  if (fields.error) return c.json(errorJson(fields.error), 400)
  if (fields.title === undefined && fields.content === undefined && fields.enabled === undefined) {
    return c.json(errorJson('title, content or enabled is required'), 400)
  }
  const updated = updateKnowledge(entry.id, fields)
  if (!updated) return c.json(errorJson('knowledge entry not found', 404), 404)
  return c.json(updated)
}

app.patch('/api/knowledge/:id', updateKnowledgeRoute)
app.put('/api/knowledge/:id', updateKnowledgeRoute)

app.delete('/api/knowledge/:id', (c) => {
  const entry = getKnowledge(c.req.param('id'))
  if (!entry) return c.json(errorJson('knowledge entry not found', 404), 404)
  removeKnowledge(entry.id)
  return c.json({ ok: true })
})

async function generateProjectKnowledge(c: Context) {
  const project = getProject(c.req.param('id') ?? '')
  if (!project) return c.json(errorJson('project not found', 404), 404)
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const modelId = typeof body?.modelId === 'string' && body.modelId.trim() ? body.modelId.trim() : undefined
  if (modelId && !getModel(modelId)) return c.json(errorJson('model not found'), 404)
  if (body?.background === true || c.req.query('background') === 'true') {
    return c.json(knowledge.startProjectSummary(project, { modelId }), 202)
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  try {
    const entry = await knowledge.generateProjectSummary(project, {
      modelId,
      signal: controller.signal
    })
    return c.json(entry)
  } catch (error) {
    if (controller.signal.aborted) {
      return c.json(errorJson('project summary generation timed out', 504), 504)
    }
    return c.json(errorJson(error instanceof Error ? error.message : String(error), 500), 500)
  } finally {
    clearTimeout(timer)
  }
}

app.get('/api/projects/:id/knowledge/summary/status', (c) => {
  const project = getProject(c.req.param('id'))
  if (!project) return c.json(errorJson('project not found', 404), 404)
  return c.json({ job: knowledge.getSummaryJob(project.id) })
})

app.post('/api/projects/:id/knowledge/summary', generateProjectKnowledge)
app.post('/api/projects/:id/knowledge/generate', generateProjectKnowledge)

// ------------------------------------------------------------------- skills
app.get('/api/skills', (c) => c.json(skills.list()))

app.post('/api/skills', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json(errorJson('JSON body required'), 400)
  const name = typeof body.name === 'string' ? body.name : ''
  const description = typeof body.description === 'string' ? body.description : ''
  const content = typeof body.content === 'string' ? body.content : ''
  const projects = readProjectIds(body.projects)
  if (!projects) return c.json(errorJson('projects must be a list of existing project ids'), 400)
  try {
    return c.json(skills.create(name, description, content, projects, body.overwrite === true), 201)
  } catch (error) {
    const failure = configErrorJson(error)
    return c.json(failure.body, failure.status)
  }
})

app.get('/api/skills/:name', (c) => {
  const skill = skills.getDetail(c.req.param('name'))
  if (!skill) return c.json(errorJson('skill not found', 404), 404)
  return c.json(skill)
})

app.patch('/api/skills/:name', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return c.json(errorJson('JSON body required'), 400)
  if (body.description !== undefined && typeof body.description !== 'string') {
    return c.json(errorJson('description must be a string'), 400)
  }
  if (body.content !== undefined && typeof body.content !== 'string') {
    return c.json(errorJson('content must be a string'), 400)
  }
  if (body.name !== undefined && typeof body.name !== 'string') {
    return c.json(errorJson('name must be a string'), 400)
  }
  const projects = body.projects === undefined ? undefined : readProjectIds(body.projects)
  if (projects === null) return c.json(errorJson('projects must be a list of existing project ids'), 400)
  try {
    return c.json(
      skills.update(c.req.param('name'), {
        name: body.name as string | undefined,
        description: body.description as string | undefined,
        content: body.content as string | undefined,
        projects
      })
    )
  } catch (error) {
    const failure = configErrorJson(error)
    return c.json(failure.body, failure.status)
  }
})

app.delete('/api/skills/:name', (c) => {
  try {
    skills.remove(c.req.param('name'))
    return c.json({ ok: true })
  } catch (error) {
    const failure = configErrorJson(error)
    return c.json(failure.body, failure.status)
  }
})

app.post('/api/skills/reload', (c) => c.json(skills.discover()))

// ---------------------------------------------------------------------- mcp
app.get('/api/mcp', (c) => c.json(mcp.list()))

app.post('/api/mcp', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json(errorJson('JSON body required'), 400)
  const projects = readProjectIds((body as Record<string, unknown>).projects)
  if (!projects) return c.json(errorJson('projects must be a list of existing project ids'), 400)
  try {
    return c.json(await mcp.add({ ...(body as Record<string, unknown>), projects }), 201)
  } catch (error) {
    const failure = configErrorJson(error)
    return c.json(failure.body, failure.status)
  }
})

app.get('/api/mcp/:name', (c) => {
  const server = mcp.get(c.req.param('name'))
  if (!server) return c.json(errorJson('MCP server not found', 404), 404)
  return c.json(server)
})

app.patch('/api/mcp/:name', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json(errorJson('JSON body required'), 400)
  const input = body as Record<string, unknown>
  const projects = input.projects === undefined ? undefined : readProjectIds(input.projects)
  if (projects === null) return c.json(errorJson('projects must be a list of existing project ids'), 400)
  try {
    return c.json(await mcp.update(c.req.param('name'), { ...input, ...(projects === undefined ? {} : { projects }) }))
  } catch (error) {
    const failure = configErrorJson(error)
    return c.json(failure.body, failure.status)
  }
})

app.post('/api/mcp/:name/install', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const background = body?.background === true || c.req.query('background') === 'true'
  try {
    return c.json(await mcp.install(c.req.param('name'), background))
  } catch (error) {
    const failure = configErrorJson(error)
    return c.json(failure.body, failure.status)
  }
})

app.delete('/api/mcp/:name', async (c) => {
  try {
    return c.json(await mcp.remove(c.req.param('name')))
  } catch (error) {
    const failure = configErrorJson(error)
    return c.json(failure.body, failure.status)
  }
})

app.post('/api/mcp/reload', async (c) => c.json(await mcp.reload()))

// ---------------------------------------------------------------------- lsp
app.get('/api/lsp', (c) => c.json(lsp.list()))

app.post('/api/lsp', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json(errorJson('JSON body required'), 400)
  const projects = readProjectIds((body as Record<string, unknown>).projects)
  if (!projects) return c.json(errorJson('projects must be a list of existing project ids'), 400)
  try {
    return c.json(lsp.add({ ...(body as Record<string, unknown>), projects }), 201)
  } catch (error) {
    const failure = configErrorJson(error)
    return c.json(failure.body, failure.status)
  }
})

app.get('/api/lsp/:name', (c) => {
  const server = lsp.get(c.req.param('name'))
  if (!server) return c.json(errorJson('language server not found', 404), 404)
  return c.json(server)
})

app.patch('/api/lsp/:name', async (c) => {
  const body = await c.req.json().catch(() => null)
  if (!body || typeof body !== 'object') return c.json(errorJson('JSON body required'), 400)
  const input = body as Record<string, unknown>
  const projects = input.projects === undefined ? undefined : readProjectIds(input.projects)
  if (projects === null) return c.json(errorJson('projects must be a list of existing project ids'), 400)
  try {
    return c.json(lsp.update(c.req.param('name'), { ...input, ...(projects === undefined ? {} : { projects }) }))
  } catch (error) {
    const failure = configErrorJson(error)
    return c.json(failure.body, failure.status)
  }
})

app.delete('/api/lsp/:name', (c) => {
  try {
    return c.json(lsp.remove(c.req.param('name')))
  } catch (error) {
    const failure = configErrorJson(error)
    return c.json(failure.body, failure.status)
  }
})

app.post('/api/lsp/:name/install', async (c) => {
  try {
    return c.json(await lsp.install(c.req.param('name')))
  } catch (error) {
    const failure = configErrorJson(error)
    return c.json(failure.body, failure.status)
  }
})

app.post('/api/lsp/reload', (c) => c.json(lsp.reload()))

app.all('/api/*', (c) => c.json(errorJson(`unknown API route: ${c.req.method} ${c.req.path}`, 404), 404))

// ------------------------------------------------------------------ static
if (fs.existsSync(config.distDir)) {
  app.use('*', serveStatic({ root: config.distDir }))
  app.get('*', serveStatic({ root: config.distDir, rewriteRequestPath: () => '/index.html' }))
} else {
  app.get('/', (c) =>
    c.text('KS Agent API is running. Build the web UI with `npm run build`, or use `npm run dev:web`.')
  )
}

void mcp.ready()

const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`[ks-agent] http://localhost:${info.port}`)
  console.log(`[ks-agent] projects: ${config.projectsDir}`)
  console.log(
    `[ks-agent] extensions: ${extensions.list().map((extension) => extension.name).join(', ') || '(none)'}`
  )
  console.log(`[ks-agent] skills: ${skills.count()}; mcp servers: ${mcp.count()}; lsp servers: ${lsp.count()}`)
})

async function shutdown(signal: string): Promise<void> {
  console.log(`[ks-agent] ${signal} received, shutting down`)
  for (const run of runs.values()) {
    if (!run.done) run.controller.abort()
  }
  mcp.stopAll()
  lsp.stopAll()
  await extensions.stopAll()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 2000).unref()
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

export { app }
