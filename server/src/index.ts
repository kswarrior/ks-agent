import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import fs from 'node:fs'
import path from 'node:path'
import { runAgent } from './agent.js'
import { config, isInside } from './config.js'
import {
  getChat,
  getModel,
  getProject,
  getProvider,
  insertChat,
  insertMessage,
  insertModel,
  insertProject,
  insertProvider,
  listChatDisabled,
  listChats,
  listMessages,
  listModels,
  listProjects,
  listProviders,
  removeChat,
  removeModel,
  removeProject,
  removeProvider,
  setChatExtensionEnabled,
  touchChat,
  updateChat,
  updateProvider
} from './db.js'
import { describeFailure, errorStatus } from './errors.js'
import { extensions } from './extensions.js'
import { cleanRelative, resolveInProject } from './fsx.js'
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
  if (kind !== 'skill' && kind !== 'mcp' && kind !== 'lsp') {
    return c.json(errorJson('kind must be skill, mcp or lsp'), 400)
  }
  const name = typeof body?.name === 'string' ? body.name.trim().toLowerCase() : ''
  if (!name) return c.json(errorJson('name is required'), 400)
  if (typeof body?.enabled !== 'boolean') return c.json(errorJson('enabled must be a boolean'), 400)
  const available =
    kind === 'skill'
      ? skills.listForProject(project.id).some((skill) => skill.name === name)
      : kind === 'mcp'
        ? mcp.listForProject(project.id).some((server) => server.name === name)
        : lsp.listForProject(project.id).some((server) => server.name === name)
  if (!available) {
    return c.json(errorJson(`${kind} "${name}" is not enabled for this project`, 404), 404)
  }
  setChatExtensionEnabled(chat.id, kind as ExtensionKind, name, body.enabled)
  return c.json({ ok: true, kind, name, enabled: body.enabled })
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
app.get('/api/models', (c) => c.json(listModels()))

app.post('/api/models', async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
  const providerId = typeof body?.providerId === 'string' ? body.providerId : ''
  const name = safeName(body?.name)
  const modelId = typeof body?.modelId === 'string' ? body.modelId.trim() : ''
  if (!providerId || !getProvider(providerId)) return c.json(errorJson('valid providerId is required'), 400)
  if (!name) return c.json(errorJson('name is required'), 400)
  if (!modelId) return c.json(errorJson('modelId is required'), 400)
  return c.json(insertModel(providerId, name, modelId), 201)
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
