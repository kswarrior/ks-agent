import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { exec } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import {
  chatsOf,
  findChat,
  findPlanForChat,
  findProject,
  findQuestion,
  findTerminal,
  getDb,
  getRetrySettings,
  loadDb,
  messagesOf,
  newId,
  questionsOf,
  saveDb,
  terminalsOf,
  touchChat,
  updateRetrySettings,
  type Chat,
  type Project,
  type Question,
  type Terminal,
  type RetrySettings
} from './store.js'
import { streamChat, type LLMMessage } from './llm.js'
import { DEFAULT_PLAN_PROMPT, PRIMARY_SYSTEM_PROMPT, resolvePendingQuestion, runAgentLoop } from './agent.js'
import { relWithin, resolveInProject, validSegment } from './fsx.js'

loadDb()

const app = new Hono()

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: err.message || 'Internal server error' }, 500)
})

function expandPath(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

function publicProvider(p: { id: string; name: string; baseUrl: string; apiKey: string }) {
  return {
    id: p.id,
    name: p.name,
    baseUrl: p.baseUrl,
    apiKey: '',
    keyPreview: p.apiKey ? `••••${p.apiKey.slice(-4)}` : ''
  }
}

// ---------------- Projects ----------------

app.get('/api/projects', (c) => {
  const projects = [...getDb().projects].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return c.json(projects)
})

app.post('/api/projects', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  let dir = String(body.path ?? '').trim()
  const mkdir = Boolean(body.mkdir)

  if (!name) return c.json({ error: 'Project name is required' }, 400)
  if (!dir) return c.json({ error: 'Project path is required' }, 400)
  dir = expandPath(dir)

  try {
    if (!fs.existsSync(dir)) {
      if (!mkdir) return c.json({ error: `Path does not exist: ${dir}` }, 400)
      fs.mkdirSync(dir, { recursive: true })
    }
    const stat = fs.statSync(dir)
    if (!stat.isDirectory()) return c.json({ error: `Not a directory: ${dir}` }, 400)
  } catch (e: any) {
    return c.json({ error: e?.message || 'Failed to access path' }, 400)
  }

  const db = getDb()
  const project = { id: newId(), name, path: dir, createdAt: new Date().toISOString() }
  db.projects.push(project)
  saveDb()
  return c.json(project, 201)
})

app.patch('/api/projects/:id', async (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return c.json({ error: 'Name cannot be empty' }, 400)
    project.name = name
  }
  if (body.path !== undefined && String(body.path).trim()) {
    project.path = expandPath(String(body.path).trim())
  }
  saveDb()
  return c.json(project)
})

app.delete('/api/projects/:id', (c) => {
  const db = getDb()
  const idx = db.projects.findIndex((p) => p.id === c.req.param('id'))
  if (idx === -1) return c.json({ error: 'Project not found' }, 404)
  const [removed] = db.projects.splice(idx, 1)
  const chatIds = new Set(db.chats.filter((ch) => ch.projectId === removed.id).map((ch) => ch.id))
  db.chats = db.chats.filter((ch) => ch.projectId !== removed.id)
  db.messages = db.messages.filter((m) => !chatIds.has(m.chatId))
  db.plans = db.plans.filter((p) => !chatIds.has(p.chatId))
  db.questions = db.questions.filter((q) => !chatIds.has(q.chatId))
  for (const cid of chatIds) {
    generations.get(cid)?.controller.abort()
    generations.delete(cid)
  }
  saveDb()
  return c.json({ ok: true })
})

// ---------------- Chats ----------------

app.get('/api/projects/:id/chats', (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  return c.json(chatsOf(project.id))
})

app.post('/api/projects/:id/chats', async (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const now = new Date().toISOString()
  const chat = {
    id: newId(),
    projectId: project.id,
    title: String(body.title ?? '').trim() || 'New chat',
    createdAt: now,
    updatedAt: now
  }
  getDb().chats.push(chat)
  saveDb()
  return c.json(chat, 201)
})

app.patch('/api/chats/:id', async (c) => {
  const chat = findChat(c.req.param('id'))
  if (!chat) return c.json({ error: 'Chat not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  if (!title) return c.json({ error: 'Title cannot be empty' }, 400)
  chat.title = title
  saveDb()
  return c.json(chat)
})

app.delete('/api/chats/:id', (c) => {
  const db = getDb()
  const id = c.req.param('id')
  const idx = db.chats.findIndex((ch) => ch.id === id)
  if (idx === -1) return c.json({ error: 'Chat not found' }, 404)
  db.chats.splice(idx, 1)
  db.messages = db.messages.filter((m) => m.chatId !== id)
  db.plans = db.plans.filter((p) => p.chatId !== id)
  db.questions = db.questions.filter((q) => q.chatId !== id)
  generations.get(id)?.controller.abort()
  generations.delete(id)
  saveDb()
  return c.json({ ok: true })
})

// ---------------- Plans ----------------

app.get('/api/chats/:id/plan', (c) => {
  const chat = findChat(c.req.param('id'))
  if (!chat) return c.json({ error: 'Chat not found' }, 404)
  return c.json(findPlanForChat(chat.id) ?? null)
})

// ---------------- Questions ----------------

app.get('/api/chats/:id/questions', (c) => {
  const chat = findChat(c.req.param('id'))
  if (!chat) return c.json({ error: 'Chat not found' }, 404)
  return c.json(questionsOf(chat.id))
})

app.post('/api/chats/:id/questions/:qid/answer', async (c) => {
  const chat = findChat(c.req.param('id'))
  if (!chat) return c.json({ error: 'Chat not found' }, 404)
  const question = findQuestion(c.req.param('qid'))
  if (!question || question.chatId !== chat.id) return c.json({ error: 'Question not found' }, 404)
  if (question.status !== 'pending') return c.json({ error: 'Question already answered' }, 409)
  const body = await c.req.json().catch(() => ({}))
  const answer = String(body.answer ?? '').trim()
  if (!answer) return c.json({ error: 'Answer is required' }, 400)
  if (answer.length > 2000) return c.json({ error: 'Answer too long' }, 400)
  if (!question.allowCustom && !question.options.includes(answer)) {
    return c.json({ error: 'Custom answer not allowed for this question' }, 400)
  }
  question.answer = answer
  question.selectedOption = question.options.includes(answer) ? answer : null
  question.status = 'answered'
  question.answeredAt = new Date().toISOString()
  saveDb()
  resolvePendingQuestion(question.id, answer)
  const job = generations.get(chat.id)
  if (job) {
    for (const notify of [...job.listeners]) {
      try {
        notify('question', JSON.stringify(question))
      } catch {}
    }
  }
  return c.json(question)
})

// ---------------- Background generation ----------------

interface GenerationJob {
  chatId: string
  assistantId: string
  model: string
  content: string
  status: 'running' | 'done' | 'stopped' | 'error'
  errorMessage?: string
  finishedAt?: string
  controller: AbortController
  listeners: Set<(event: string, data: string) => void>
}

const generations = new Map<string, GenerationJob>()

// Terminal jobs are kept so late /api/chats/:id/events subscribers still receive
// meta + snapshot + the terminal event; pruned periodically.
const JOB_TTL_MS = 10 * 60_000
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [id, j] of generations) {
    if (j.status !== 'running' && j.finishedAt && Date.parse(j.finishedAt) < cutoff) {
      generations.delete(id)
    }
  }
}, 60_000).unref()

function emitTo(job: GenerationJob, event: string, data: string): void {
  for (const notify of [...job.listeners]) {
    try {
      notify(event, data)
    } catch {
      job.listeners.delete(notify)
    }
  }
}

// Persistence failures must never leave subscribers hanging without a terminal event.
async function persistAssistantSafe(job: GenerationJob, content: string, isError: boolean): Promise<void> {
  try {
    const chat = findChat(job.chatId)
    if (!chat) return
    getDb().messages.push({
      id: job.assistantId,
      chatId: job.chatId,
      role: 'assistant',
      content,
      createdAt: new Date().toISOString(),
      error: isError || undefined
    })
    touchChat(chat)
    saveDb()
  } catch (e) {
    console.error('Failed to persist assistant message:', e)
  }
}

interface AgentSpec {
  projectPath: string
}

async function runGeneration(
  job: GenerationJob,
  provider: { baseUrl: string; apiKey: string },
  model: string,
  history: LLMMessage[],
  agent: AgentSpec | null
): Promise<void> {
  const retrySettings = getRetrySettings()
  try {
    if (agent) {
      await runAgentLoop({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model,
        history,
        projectPath: agent.projectPath,
        chatId: job.chatId,
        signal: job.controller.signal,
        onDelta: (text) => {
          job.content += text
          emitTo(job, 'delta', JSON.stringify(text))
        },
        onEvent: (event, data) => emitTo(job, event, data),
        retrySettings
      })
    } else {
      for await (const delta of streamChat(provider.baseUrl, provider.apiKey, model, history, job.controller.signal, retrySettings)) {
        job.content += delta
        emitTo(job, 'delta', JSON.stringify(delta))
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      job.status = 'stopped'
      if (job.content.trim()) {
        await persistAssistantSafe(job, job.content + '\n\n_[stopped]_', false)
      } else {
        await persistAssistantSafe(job, '\n\n_[stopped]_', true)
      }
      emitTo(job, 'stopped', '{}')
      return
    }
    job.status = 'error'
    const message = job.content
      ? `${job.content}\n\n_[stream interrupted: ${String(e?.message || e)}]_`
      : `Error: ${String(e?.message || e)}`
    await persistAssistantSafe(job, message, true)
    job.errorMessage = message
    emitTo(job, 'error', JSON.stringify({ message }))
    return
  }
  job.status = 'done'
  if (job.content.trim()) await persistAssistantSafe(job, job.content, false)
  emitTo(job, 'done', JSON.stringify({ messageId: job.assistantId }))
}

app.get('/api/generations', (c) => {
  return c.json([...generations.values()].filter((j) => j.status === 'running').map((j) => j.chatId))
})

app.post('/api/chats/:id/stop', (c) => {
  const chat = findChat(c.req.param('id'))
  if (!chat) return c.json({ error: 'Chat not found' }, 404)
  const job = generations.get(chat.id)
  if (!job || job.status !== 'running') return c.json({ error: 'No active generation in this chat' }, 409)
  job.controller.abort()
  return c.json({ ok: true })
})

app.get('/api/chats/:id/events', (c) => {
  const chat = findChat(c.req.param('id'))
  if (!chat) return c.json({ error: 'Chat not found' }, 404)
  return streamSSE(c, async (stream) => {
    const job = generations.get(chat.id)
    if (!job) {
      await stream.writeSSE({ event: 'idle', data: '{}' })
      return
    }
    await stream.writeSSE({
      event: 'meta',
      data: JSON.stringify({ assistantId: job.assistantId, model: job.model })
    })
    await stream.writeSSE({ event: 'snapshot', data: JSON.stringify(job.content) })

    let settle = () => {}
    const finished = new Promise<void>((resolve) => {
      settle = resolve
    })
    const terminal = (event: string) => event === 'done' || event === 'stopped' || event === 'error'
    let closed = false
    const markClosed = () => {
      if (!closed) {
        closed = true
        settle()
      }
    }
    const listener = (event: string, data: string) => {
      if (closed) return
      stream
        .writeSSE({ event, data })
        .then(() => {
          if (terminal(event)) markClosed()
        })
        .catch(markClosed)
    }
    job.listeners.add(listener)
    const onAbort = () => markClosed()
    c.req.raw.signal.addEventListener('abort', onAbort)
    const ping = setInterval(() => {
      if (closed) return
      stream.writeSSE({ event: 'ping', data: '' }).catch(markClosed)
    }, 15000)

    if (job.status !== 'running') {
      if (job.status === 'done') listener('done', JSON.stringify({ messageId: job.assistantId }))
      else if (job.status === 'stopped') listener('stopped', '{}')
      else listener('error', JSON.stringify({ message: job.errorMessage ?? 'Generation failed' }))
    }

    try {
      await finished
    } finally {
      clearInterval(ping)
      job.listeners.delete(listener)
      c.req.raw.signal.removeEventListener('abort', onAbort)
    }
  })
})

// ---------------- Messages ----------------

app.get('/api/chats/:id/messages', (c) => {
  const chat = findChat(c.req.param('id'))
  if (!chat) return c.json({ error: 'Chat not found' }, 404)
  return c.json(messagesOf(chat.id))
})

app.post('/api/chats/:id/messages', async (c) => {
  const chat = findChat(c.req.param('id'))
  if (!chat) return c.json({ error: 'Chat not found' }, 404)

  const body = await c.req.json().catch(() => ({}))
  const content = String(body.content ?? '').trim()
  const modelId = body.modelId ? String(body.modelId) : ''

  if (!content) return c.json({ error: 'Message cannot be empty' }, 400)

  const db = getDb()
  const modelEntry = modelId ? db.models.find((m) => m.id === modelId) : undefined
  const resolvedModel = modelEntry ?? db.models[0]
  if (!resolvedModel) {
    return c.json({ error: 'No model configured. Add a provider and model in Settings.' }, 400)
  }
  const provider = db.providers.find((p) => p.id === resolvedModel.providerId)
  if (!provider) {
    return c.json({ error: 'Model has no valid provider' }, 400)
  }

  // From here to the response there are no awaits, so two concurrent posts to the
  // same chat cannot both slip past this guard and register a job.
  const runningJob = generations.get(chat.id)
  if (runningJob && runningJob.status === 'running') {
    return c.json({ error: 'This chat is already generating a reply' }, 409)
  }

  const project = findProject(chat.projectId)

  const userMsg = {
    id: newId(),
    chatId: chat.id,
    role: 'user' as const,
    content,
    createdAt: new Date().toISOString()
  }
  db.messages.push(userMsg)
  touchChat(chat)
  saveDb()

  // Primary prompt is built-in and fixed; the plan prompt is user-editable.
  const planPrompt = getDb().planPrompt.trim() || DEFAULT_PLAN_PROMPT
  const history: LLMMessage[] = [
    { role: 'system', content: PRIMARY_SYSTEM_PROMPT },
    ...(project ? [{ role: 'system' as const, content: `Active project: ${project.name} (${project.path})` }] : []),
    ...(project ? [{ role: 'system' as const, content: planPrompt }] : []),
    ...messagesOf(chat.id).map((m) => ({ role: m.role as LLMMessage['role'], content: m.content }))
  ]

  const job: GenerationJob = {
    chatId: chat.id,
    assistantId: newId(),
    model: resolvedModel.model,
    content: '',
    status: 'running',
    controller: new AbortController(),
    listeners: new Set()
  }
  generations.set(chat.id, job)

  const agent: AgentSpec | null = project ? { projectPath: project.path } : null

  void runGeneration(job, provider, resolvedModel.model, history, agent).finally(() => {
    job.finishedAt = new Date().toISOString()
  })

  return c.json({ userMsgId: userMsg.id, assistantId: job.assistantId, model: job.model })
})

// ---------------- Settings: providers & models ----------------

app.get('/api/settings/providers', (c) => {
  return c.json(getDb().providers.map(publicProvider))
})

app.post('/api/settings/providers', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const baseUrl = String(body.baseUrl ?? '').trim().replace(/\/+$/, '')
  const apiKey = String(body.apiKey ?? '').trim()
  if (!name) return c.json({ error: 'Provider name is required' }, 400)
  if (!/^https?:\/\/.+/.test(baseUrl)) return c.json({ error: 'Base URL must start with http(s)://' }, 400)
  const provider = { id: newId(), name, baseUrl, apiKey }
  getDb().providers.push(provider)
  saveDb()
  return c.json(publicProvider(provider), 201)
})

app.patch('/api/settings/providers/:id', async (c) => {
  const provider = getDb().providers.find((p) => p.id === c.req.param('id'))
  if (!provider) return c.json({ error: 'Provider not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  if (body.name !== undefined && String(body.name).trim()) provider.name = String(body.name).trim()
  if (body.baseUrl !== undefined && /^https?:\/\/.+/.test(String(body.baseUrl).trim())) {
    provider.baseUrl = String(body.baseUrl).trim().replace(/\/+$/, '')
  }
  if (body.apiKey !== undefined && String(body.apiKey).trim()) provider.apiKey = String(body.apiKey).trim()
  saveDb()
  return c.json(publicProvider(provider))
})

app.delete('/api/settings/providers/:id', (c) => {
  const db = getDb()
  const id = c.req.param('id')
  const idx = db.providers.findIndex((p) => p.id === id)
  if (idx === -1) return c.json({ error: 'Provider not found' }, 404)
  db.providers.splice(idx, 1)
  db.models = db.models.filter((m) => m.providerId !== id)
  saveDb()
  return c.json({ ok: true })
})

app.get('/api/settings/models', (c) => {
  const db = getDb()
  return c.json(
    db.models.map((m) => ({
      id: m.id,
      model: m.model,
      displayName: m.displayName?.trim() ? m.displayName.trim() : m.model,
      providerId: m.providerId,
      providerName: db.providers.find((p) => p.id === m.providerId)?.name ?? 'Unknown'
    }))
  )
})

app.post('/api/settings/models', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const model = String(body.model ?? '').trim()
  const providerId = String(body.providerId ?? '').trim()
  const displayName = String(body.displayName ?? '').trim()
  if (!model) return c.json({ error: 'Model id is required' }, 400)
  if (!getDb().providers.some((p) => p.id === providerId)) {
    return c.json({ error: 'Select a valid provider' }, 400)
  }
  const entry = { id: newId(), providerId, model, ...(displayName ? { displayName } : {}) }
  getDb().models.push(entry)
  saveDb()
  return c.json(entry, 201)
})

app.delete('/api/settings/models/:id', (c) => {
  const db = getDb()
  const idx = db.models.findIndex((m) => m.id === c.req.param('id'))
  if (idx === -1) return c.json({ error: 'Model not found' }, 404)
  db.models.splice(idx, 1)
  saveDb()
  return c.json({ ok: true })
})

// ---------------- Settings: prompts ----------------
// The primary system prompt is intentionally not readable or editable here.

app.get('/api/settings/plan-prompt', (c) => {
  return c.json({ planPrompt: getDb().planPrompt })
})

app.patch('/api/settings/plan-prompt', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const planPrompt = String(body.planPrompt ?? '').trim()
  getDb().planPrompt = planPrompt
  saveDb()
  return c.json({ ok: true, planPrompt })
})

// ---------------- Settings: retry ----------------

app.get('/api/settings/retry', (c) => {
  return c.json(getRetrySettings())
})

app.patch('/api/settings/retry', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const allowedKeys = ['enabled', 'maxRetries', 'baseDelayMs', 'maxDelayMs', 'retryOnStatusCodes', 'stopOnStatusCodes'] as const
  const patch: Partial<RetrySettings> = {}
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      const val = body[key]
      if (key === 'enabled') patch.enabled = Boolean(val)
      else if (key === 'maxRetries') patch.maxRetries = Math.max(0, Math.min(10, Number(val)))
      else if (key === 'baseDelayMs') patch.baseDelayMs = Math.max(100, Math.min(60000, Number(val)))
      else if (key === 'maxDelayMs') patch.maxDelayMs = Math.max(1000, Math.min(300000, Number(val)))
      else if (key === 'retryOnStatusCodes' && Array.isArray(val)) {
        patch.retryOnStatusCodes = val.filter((x: any) => Number.isInteger(x) && x >= 100 && x < 600)
      }
      else if (key === 'stopOnStatusCodes' && Array.isArray(val)) {
        patch.stopOnStatusCodes = val.filter((x: any) => Number.isInteger(x) && x >= 100 && x < 600)
      }
    }
  }
  return c.json(updateRetrySettings(patch))
})

// ---------------- Project files ----------------

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const MAX_LIST_ENTRIES = 500

type FileTarget = { error: Response } | { abs: string; stat: fs.Stats }

function fileTarget(c: { json: (data: unknown, status?: number) => Response }, project: Project, rel: string): FileTarget {
  const abs = resolveInProject(project.path, rel)
  if (!abs) return { error: c.json({ error: 'Invalid path' }, 400) }
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    return { error: c.json({ error: 'Path not found' }, 400) }
  }
  return { abs, stat }
}

app.get('/api/projects/:id/files', (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const t = fileTarget(c, project, String(c.req.query('path') ?? ''))
  if ('error' in t) return t.error
  if (!t.stat.isDirectory()) return c.json({ error: 'Not a directory' }, 400)
  const dirs = []
  const files = []
  for (const ent of fs.readdirSync(t.abs, { withFileTypes: true })) {
    if (ent.isDirectory()) dirs.push({ name: ent.name, type: 'dir' })
    else {
      let size = 0
      try {
        size = fs.statSync(path.join(t.abs, ent.name)).size
      } catch {}
      files.push({ name: ent.name, type: 'file', size })
    }
  }
  const byName = (x: { name: string }, y: { name: string }) => x.name.localeCompare(y.name)
  dirs.sort(byName)
  files.sort(byName)
  return c.json({
    path: relWithin(project.path, t.abs),
    entries: [...dirs, ...files].slice(0, MAX_LIST_ENTRIES)
  })
})

app.post('/api/projects/:id/files', async (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const kind = body.kind === 'folder' ? 'folder' : body.kind === 'file' ? 'file' : null
  const rel = String(body.path ?? '')
  if (!kind) return c.json({ error: 'kind must be "file" or "folder"' }, 400)
  if (!validSegment(rel)) return c.json({ error: 'Invalid name' }, 400)
  const abs = resolveInProject(project.path, rel)
  if (!abs) return c.json({ error: 'Invalid path' }, 400)
  if (fs.existsSync(abs)) return c.json({ error: `"${rel}" already exists` }, 400)
  try {
    if (kind === 'folder') fs.mkdirSync(abs)
    else fs.writeFileSync(abs, '', { flag: 'wx' })
  } catch (e: any) {
    return c.json({ error: e?.message || 'Failed to create' }, 400)
  }
  return c.json({ ok: true }, 201)
})

app.patch('/api/projects/:id/files', async (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const from = String(body.from ?? '')
  const to = String(body.to ?? '')
  const fromParts = from.split('/').filter(Boolean)
  if (fromParts.length === 0 || !fromParts.every(validSegment)) {
    return c.json({ error: 'Invalid source path' }, 400)
  }
  if (!validSegment(to)) return c.json({ error: 'Invalid new name' }, 400)
  const fromAbs = resolveInProject(project.path, from)
  if (!fromAbs) return c.json({ error: 'Invalid path' }, 400)
  const toAbs = path.join(path.dirname(fromAbs), to)
  if (!fs.existsSync(fromAbs)) return c.json({ error: `"${from}" not found` }, 400)
  if (fs.existsSync(toAbs)) return c.json({ error: `"${to}" already exists` }, 400)
  try {
    fs.renameSync(fromAbs, toAbs)
  } catch (e: any) {
    return c.json({ error: e?.message || 'Rename failed' }, 400)
  }
  return c.json({ ok: true })
})

app.delete('/api/projects/:id/files', (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const rel = String(c.req.query('path') ?? '')
  if (!rel || rel === '.') return c.json({ error: 'Cannot delete the project root' }, 400)
  const abs = resolveInProject(project.path, rel)
  if (!abs) return c.json({ error: 'Invalid path' }, 400)
  try {
    fs.rmSync(abs, { recursive: true })
  } catch (e: any) {
    return c.json({ error: e?.message || 'Delete failed' }, 400)
  }
  return c.json({ ok: true })
})

app.get('/api/projects/:id/files/download', (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const t = fileTarget(c, project, String(c.req.query('path') ?? ''))
  if ('error' in t) return t.error
  if (!t.stat.isFile()) return c.json({ error: 'Not a file' }, 400)
  const filename = path.basename(t.abs)
  const ascii =
    filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_') || 'download'
  c.header('Content-Type', 'application/octet-stream')
  c.header('Content-Length', String(t.stat.size))
  c.header(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  )
  return c.body(Readable.toWeb(fs.createReadStream(t.abs)))
})

app.post('/api/projects/:id/files/upload', async (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const form = await c.req.parseBody({ all: true }).catch(() => null)
  if (!form) return c.json({ error: 'Expected multipart form data' }, 400)
  const dirRel = typeof form.path === 'string' ? form.path : ''
  const t = fileTarget(c, project, dirRel)
  if ('error' in t) return t.error
  if (!t.stat.isDirectory()) return c.json({ error: 'Target is not a directory' }, 400)
  const raw = form.file
  const list = Array.isArray(raw) ? raw : [raw]
  const saved = []
  for (const item of list) {
    if (!(item instanceof File)) continue
    if (!validSegment(item.name)) return c.json({ error: `Invalid file name: "${item.name}"` }, 400)
    if (item.size > MAX_UPLOAD_BYTES) return c.json({ error: `"${item.name}" exceeds size limit` }, 400)
    const buf = Buffer.from(await item.arrayBuffer())
    fs.writeFileSync(path.join(t.abs, item.name), buf)
    saved.push(item.name)
  }
  if (saved.length === 0) return c.json({ error: 'No files in upload' }, 400)
  return c.json({ ok: true, saved }, 201)
})

app.get('/api/projects/:id/files/content', (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const rel = String(c.req.query('path') ?? '')
  if (!rel || rel === '.') return c.json({ error: 'Invalid path' }, 400)
  const abs = resolveInProject(project.path, rel)
  if (!abs) return c.json({ error: 'Invalid path' }, 400)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    return c.json({ error: 'File not found' }, 404)
  }
  if (!stat.isFile()) return c.json({ error: 'Not a file' }, 400)
  if (stat.size > 10 * 1024 * 1024) return c.json({ error: 'File too large to edit' }, 400)
  const content = fs.readFileSync(abs, 'utf8')
  return c.json({ content })
})

app.put('/api/projects/:id/files/content', async (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const rel = String(body.path ?? '')
  const content = String(body.content ?? '')
  if (!rel || rel === '.') return c.json({ error: 'Invalid path' }, 400)
  const abs = resolveInProject(project.path, rel)
  if (!abs) return c.json({ error: 'Invalid path' }, 400)
  let stat: fs.Stats
  try {
    stat = fs.statSync(abs)
  } catch {
    return c.json({ error: 'File not found' }, 404)
  }
  if (!stat.isFile()) return c.json({ error: 'Not a file' }, 400)
  if (content.length > 10 * 1024 * 1024) return c.json({ error: 'Content too large' }, 400)
  try {
    fs.writeFileSync(abs, content, 'utf8')
  } catch (e: any) {
    return c.json({ error: e?.message || 'Failed to write file' }, 400)
  }
  return c.json({ ok: true })
})

app.post('/api/projects/:id/files/upload-url', async (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const urlStr = String(body.url ?? '').trim()
  const destDir = String(body.path ?? '')
  let name = String(body.name ?? '').trim()
  let parsed: URL
  try {
    parsed = new URL(urlStr)
  } catch {
    return c.json({ error: 'Invalid URL' }, 400)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return c.json({ error: 'Only http(s) URLs are allowed' }, 400)
  }
  if (isBlockedHost(parsed.hostname)) return c.json({ error: 'Blocked host' }, 400)
  const t = fileTarget(c, project, destDir)
  if ('error' in t) return t.error
  if (!t.stat.isDirectory()) return c.json({ error: 'Target is not a directory' }, 400)
  if (!name) {
    const base = path.basename(decodeURIComponent(parsed.pathname))
    name = base && base !== '/' && base !== '.' ? base : 'download'
  }
  if (!validSegment(name)) return c.json({ error: 'Invalid file name' }, 400)
  let res: Response
  try {
    res = await fetch(parsed, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
  } catch (e: any) {
    return c.json({ error: e?.message || 'Failed to fetch URL' }, 400)
  }
  if (isBlockedHost(new URL(res.url).hostname)) return c.json({ error: 'Blocked host' }, 400)
  if (!res.ok) return c.json({ error: `Failed to fetch URL (${res.status})` }, 400)
  if (!res.body) return c.json({ error: 'Empty download' }, 400)
  const chunks = []
  let total = 0
  try {
    for await (const chunk of res.body) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buf.length
      if (total > MAX_UPLOAD_BYTES) return c.json({ error: 'Download exceeds size limit' }, 400)
      chunks.push(buf)
    }
  } catch (e: any) {
    return c.json({ error: e?.message || 'Download failed' }, 400)
  }
  try {
    fs.writeFileSync(path.join(t.abs, name), Buffer.concat(chunks), { flag: 'wx' })
  } catch (e: any) {
    return c.json({ error: e?.message || 'Failed to save file' }, 400)
  }
  return c.json({ ok: true, name }, 201)
})

// ---------------- Terminals ----------------

app.get('/api/projects/:id/terminals', (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  return c.json(terminalsOf(project.id))
})

app.post('/api/projects/:id/terminals', async (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim() || 'Terminal'
  const now = new Date().toISOString()
  const terminal: Terminal = {
    id: newId(),
    projectId: project.id,
    name,
    createdAt: now,
    updatedAt: now
  }
  getDb().terminals.push(terminal)
  saveDb()
  return c.json(terminal, 201)
})

app.patch('/api/terminals/:id', async (c) => {
  const terminal = findTerminal(c.req.param('id'))
  if (!terminal) return c.json({ error: 'Terminal not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  if (body.name !== undefined) {
    const name = String(body.name).trim()
    if (!name) return c.json({ error: 'Name cannot be empty' }, 400)
    terminal.name = name
  }
  terminal.updatedAt = new Date().toISOString()
  saveDb()
  return c.json(terminal)
})

app.delete('/api/terminals/:id', (c) => {
  const db = getDb()
  const idx = db.terminals.findIndex((t) => t.id === c.req.param('id'))
  if (idx === -1) return c.json({ error: 'Terminal not found' }, 404)
  db.terminals.splice(idx, 1)
  saveDb()
  return c.json({ ok: true })
})

app.post('/api/terminals/:id/exec', async (c) => {
  const terminal = findTerminal(c.req.param('id'))
  if (!terminal) return c.json({ error: 'Terminal not found' }, 404)
  const project = findProject(terminal.projectId)
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const command = String(body.command ?? '').trim()
  if (!command) return c.json({ error: 'Command is required' }, 400)
  if (command.length > 4000) return c.json({ error: 'Command too long' }, 400)
  const { code, output } = await new Promise<{ code: number; output: string }>((resolve) => {
    exec(
      command,
      { cwd: project.path, timeout: 30_000, maxBuffer: 1024 * 1024, shell: '/bin/bash', windowsHide: true },
      (error, stdout, stderr) => {
        const code = error && typeof (error as any).code === 'number' ? (error as any).code : error ? 1 : 0
        const raw = `${stdout}${stderr}`
        let out = raw.slice(0, 8192)
        if (raw.length > 8192) out += '\n…[truncated]'
        resolve({ code, output: out || '(no output)' })
      }
    )
  })
  return c.json({ output, exitCode: code, cwd: project.path })
})

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[/, '').replace(/\]$/, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal'))
    return true
  if (h === '::1' || h === '::') return true
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const a = Number(m[1])
  const b = Number(m[2])
  if (a === 127 || a === 10 || a === 0) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  return false
}

// ---------------- Static frontend ----------------

const distDir = process.env.KS_WEB_DIST || './dist'

app.use('*', serveStatic({ root: distDir }))
app.get('*', serveStatic({ root: distDir, rewriteRequestPath: () => '/index.html' }))

const port = Number(process.env.PORT || 8787)
serve({ fetch: app.fetch, port, hostname: process.env.HOST || '0.0.0.0' })
console.log(`KS Agent listening on http://localhost:${port}`)
