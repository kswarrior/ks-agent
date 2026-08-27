import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { exec, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import * as pty from 'node-pty'
import { WebSocketServer, WebSocket } from 'ws'
import {
  activitiesOf,
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
  nextChatSeq,
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

// ---------------- PTY sessions (real Linux terminal) ----------------

interface PtySession {
  pty: pty.IPty
  clients: Set<WebSocket>
  buffer: string
  projectId: string
  terminalId: string
}

const ptySessions = new Map<string, PtySession>()

function resolveShell(): string {
  const envShell = process.env.SHELL
  if (envShell && fs.existsSync(envShell)) return envShell
  if (fs.existsSync('/bin/bash')) return '/bin/bash'
  if (fs.existsSync('/bin/zsh')) return '/bin/zsh'
  return '/bin/sh'
}

function getOrCreatePty(terminalId: string, projectPath: string, projectId: string, cols = 80, rows = 24): PtySession {
  const existing = ptySessions.get(terminalId)
  if (existing) return existing
  // ensure cwd exists; fallback to homedir if missing
  let cwd = projectPath
  try {
    const st = fs.statSync(projectPath)
    if (!st.isDirectory()) cwd = os.homedir()
  } catch {
    try { fs.mkdirSync(projectPath, { recursive: true }) } catch {}
    cwd = fs.existsSync(projectPath) ? projectPath : os.homedir()
  }
  const shell = resolveShell()
  const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor', LANG: process.env.LANG || 'en_US.UTF-8' } as Record<string, string>
  const p = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols,
    rows,
    cwd,
    env
  })
  const sess: PtySession = { pty: p, clients: new Set(), buffer: '', projectId, terminalId }
  // Buffer up to 200KB for reconnection replay
  p.onData((data) => {
    sess.buffer += data
    if (sess.buffer.length > 200 * 1024) sess.buffer = sess.buffer.slice(-200 * 1024)
    for (const ws of sess.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(data) } catch {}
      }
    }
  })
  p.onExit(() => {
    for (const ws of sess.clients) {
      try { ws.close() } catch {}
    }
    ptySessions.delete(terminalId)
  })
  ptySessions.set(terminalId, sess)
  return sess
}

function killPty(terminalId: string): void {
  const sess = ptySessions.get(terminalId)
  if (!sess) return
  try { sess.pty.kill() } catch {}
  for (const ws of sess.clients) {
    try { ws.close() } catch {}
  }
  ptySessions.delete(terminalId)
}

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

app.delete('/api/projects/:id', async (c) => {
  const db = getDb()
  const idx = db.projects.findIndex((p) => p.id === c.req.param('id'))
  if (idx === -1) return c.json({ error: 'Project not found' }, 404)
  const project = db.projects[idx]

  // Determine whether to also delete the project folder from disk
  let shouldDeleteFolder = false
  const q = c.req.query('deleteFolder')
  if (q === 'true' || q === '1') shouldDeleteFolder = true
  else {
    try {
      const body = await c.req.json() as any
      if (body && (body.deleteFolder === true || body.deleteFolder === 'true' || body.deleteFolder === '1')) {
        shouldDeleteFolder = true
      }
    } catch {}
  }

  if (shouldDeleteFolder && project.path) {
    const resolved = path.resolve(project.path)
    const home = path.resolve(os.homedir())
    if (resolved === '/' || resolved === home || resolved === path.resolve('/home')) {
      return c.json({ error: 'Refusing to delete protected path: ' + resolved }, 400)
    }
    try {
      if (fs.existsSync(resolved)) {
        const stat = fs.statSync(resolved)
        if (!stat.isDirectory()) {
          return c.json({ error: 'Project path is not a directory' }, 400)
        }
        fs.rmSync(resolved, { recursive: true, force: true })
      }
    } catch (e: any) {
      return c.json({ error: e?.message || 'Failed to delete project folder' }, 500)
    }
  }

  const [removed] = db.projects.splice(idx, 1)
  const chatIds = new Set(db.chats.filter((ch) => ch.projectId === removed.id).map((ch) => ch.id))
  db.chats = db.chats.filter((ch) => ch.projectId !== removed.id)
  db.messages = db.messages.filter((m) => !chatIds.has(m.chatId))
  db.plans = db.plans.filter((p) => !chatIds.has(p.chatId))
  db.questions = db.questions.filter((q) => !chatIds.has(q.chatId))
  // @ts-ignore - activities may not exist in old DB files
  db.activities = (db.activities || []).filter((a: any) => !chatIds.has(a.chatId))
  for (const cid of chatIds) {
    generations.get(cid)?.controller.abort()
    generations.delete(cid)
  }
  // kill terminals + ptys for this project
  const termIds = db.terminals.filter((t) => t.projectId === removed.id).map((t) => t.id)
  db.terminals = db.terminals.filter((t) => t.projectId !== removed.id)
  for (const tid of termIds) killPty(tid)
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
  const seq = nextChatSeq(project.id)
  const rawTitle = String(body.title ?? '').trim()
  const title = !rawTitle || rawTitle === 'New chat' ? `Chat ${seq}` : rawTitle
  const chat: Chat = {
    id: newId(),
    projectId: project.id,
    title,
    seq,
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
  // @ts-ignore
  db.activities = (db.activities || []).filter((a: any) => a.chatId !== id)
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

// ---------------- Activities ----------------

app.get('/api/chats/:id/activities', (c) => {
  const chat = findChat(c.req.param('id'))
  if (!chat) return c.json({ error: 'Chat not found' }, 404)
  return c.json(activitiesOf(chat.id))
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
  const body = await c.req.json().catch(() => ({}))
  const answer = String(body.answer ?? '').trim()
  if (!answer) return c.json({ error: 'Answer is required' }, 400)
  if (answer.length > 2000) return c.json({ error: 'Answer too long' }, 400)
  if (!question.allowCustom && !question.options.includes(answer)) {
    return c.json({ error: 'Custom answer not allowed for this question' }, 400)
  }
  const wasPending = question.status === 'pending'
  // allow re-answering (for Back → change answer), but don't re-resolve if already answered
  if (!wasPending && question.answer === answer) {
    return c.json(question)
  }
  question.answer = answer
  question.selectedOption = question.options.includes(answer) ? answer : null
  question.status = 'answered'
  question.answeredAt = new Date().toISOString()
  saveDb()
  if (wasPending) resolvePendingQuestion(question.id, answer)
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
  modelDisplayName?: string
  providerName?: string
  content: string
  status: 'running' | 'done' | 'stopped' | 'error'
  errorMessage?: string
  startedAt: string
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

// ---------------- Chat title generator ----------------

function isDefaultChatTitle(chat: Chat): boolean {
  const t = chat.title.trim()
  if (t === 'New chat') return true
  if (chat.seq != null && t === `Chat ${chat.seq}`) return true
  if (/^Chat #?\d+$/.test(t)) return true
  return false
}

function heuristicTitle(content: string): string {
  const cleaned = content.replace(/\s+/g, ' ').trim()
  if (!cleaned) return 'New chat'
  let words = cleaned.split(' ').slice(0, 6).join(' ')
  if (words.length > 50) words = words.slice(0, 47) + '...'
  words = words.replace(/[:\.!\?]+$/, '')
  if (words.length < 3) words = cleaned.slice(0, 40)
  // Capitalize first letter of each word for a title-like look, keep rest as is
  const titled = words
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
  return titled.slice(0, 50)
}

function sanitizeLLMTitle(raw: string): string | null {
  let t = raw.trim()
  // strip surrounding quotes
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) t = t.slice(1, -1).trim()
  // strip common prefix
  t = t.replace(/^(title\s*:\s*)/i, '').trim()
  t = t.replace(/^["'`]+|["'`]+$/g, '').trim()
  // first line only
  t = t.split('\n')[0].trim()
  // remove trailing period
  t = t.replace(/[.。]+$/, '').trim()
  if (t.length < 2 || t.length > 60) return null
  // ensure not too generic like "Chat Title"
  if (/^(untitled|new chat|chat title)$/i.test(t)) return null
  return t.slice(0, 50)
}

function chatTitleEndpoint(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(clean)) return clean
  return clean + '/chat/completions'
}

async function generateChatTitleViaLLM(
  provider: { baseUrl: string; apiKey: string },
  model: string,
  userContent: string
): Promise<string | null> {
  const prompt = `Generate a concise chat title (3-6 words, max 40 characters, Title Case, no quotes, no period, no prefix) for this user prompt. Only output the title.\n\nUser prompt: "${userContent.slice(0, 400).replace(/"/g, "'")}"`
  const body = {
    model,
    messages: [
      { role: 'system', content: 'You are a chat title generator. Output only the title.' },
      { role: 'user', content: prompt }
    ],
    max_tokens: 30,
    temperature: 0.4,
    stream: false
  }
  try {
    const res = await fetch(chatTitleEndpoint(provider.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    })
    if (!res.ok) return null
    const data: any = await res.json().catch(() => null)
    const raw = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? ''
    if (typeof raw !== 'string' || !raw.trim()) return null
    return sanitizeLLMTitle(raw)
  } catch {
    return null
  }
}

async function generateAndPersistTitle(
  chat: Chat,
  userContent: string,
  provider: { baseUrl: string; apiKey: string },
  model: string
): Promise<void> {
  if (!isDefaultChatTitle(chat)) return
  // Only generate on first user message; if chat already has many messages but still default, we still allow one attempt
  const count = messagesOf(chat.id).length
  // heuristic: if count > 3 (multiple turns) and still default, still generate from first user message but use current prompt as fallback
  // Allow generation if count <= 5 to avoid overwriting later deliberate default
  if (count > 5) return
  let title: string | null = null
  if (provider?.baseUrl && provider?.apiKey && model) {
    title = await generateChatTitleViaLLM(provider, model, userContent)
  }
  if (!title) title = heuristicTitle(userContent)
  if (!title || title === chat.title) return
  // avoid race: re-check default before overwrite (user may have renamed in the meantime)
  if (!isDefaultChatTitle(chat)) return
  chat.title = title
  // touchChat would update updatedAt to now, but we want to preserve original ordering somewhat? Use touch.
  chat.updatedAt = new Date().toISOString()
  saveDb()
  const job = generations.get(chat.id)
  if (job) emitTo(job, 'chat_title', JSON.stringify({ chatId: chat.id, title: chat.title, seq: chat.seq }))
}

// Persistence failures must never leave subscribers hanging without a terminal event.
async function persistAssistantSafe(job: GenerationJob, content: string, isError: boolean): Promise<void> {
  try {
    const chat = findChat(job.chatId)
    if (!chat) return
    const finishedAt = new Date().toISOString()
    const startedAt = job.startedAt || finishedAt
    let durationMs: number | undefined
    try {
      const d = Date.parse(finishedAt) - Date.parse(startedAt)
      if (Number.isFinite(d) && d >= 0) durationMs = d
    } catch {}
    if (!job.finishedAt) job.finishedAt = finishedAt
    getDb().messages.push({
      id: job.assistantId,
      chatId: job.chatId,
      role: 'assistant',
      content,
      createdAt: finishedAt,
      error: isError || undefined,
      model: job.model,
      modelDisplayName: job.modelDisplayName,
      providerName: job.providerName,
      startedAt,
      finishedAt,
      durationMs
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
  agent: AgentSpec | null,
  maxTokens?: number
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
        maxTokens,
        onDelta: (text) => {
          job.content += text
          emitTo(job, 'delta', JSON.stringify(text))
        },
        onEvent: (event, data) => emitTo(job, event, data),
        retrySettings
      })
    } else {
      for await (const delta of streamChat(provider.baseUrl, provider.apiKey, model, history, job.controller.signal, retrySettings, maxTokens)) {
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
    }, 10000)

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
  // Ensure legacy chats without seq get one assigned now
  if (chat.seq == null || !Number.isInteger(chat.seq)) {
    chat.seq = nextChatSeq(chat.projectId)
    // keep title in sync if it was the generic placeholder before migration
    if (chat.title === 'New chat') chat.title = `Chat ${chat.seq}`
  }
  touchChat(chat)
  // Clear previous activities for this chat so next run starts fresh (like client does)
  // Persisted per chat, so refresh after sending shows empty until new activity arrives
  // @ts-ignore
  db.activities = (db.activities || []).filter((a: any) => a.chatId !== chat.id)
  saveDb()

  // Resolve the system prompt: per-model override > global setting > built-in default.
  // Smaller/weaker models (e.g. meta/muse-glimmer-30b) often fail to follow the
  // built-in prompt, so letting each model import its own tuned prompt helps a lot.
  const modelSystemPrompt =
    (resolvedModel.systemPrompt?.trim()) ||
    (db.systemPrompt?.trim()) ||
    PRIMARY_SYSTEM_PROMPT
  const planPrompt = db.planPrompt.trim() || DEFAULT_PLAN_PROMPT
  const history: LLMMessage[] = [
    { role: 'system', content: modelSystemPrompt },
    ...(project ? [{ role: 'system' as const, content: `Active project: ${project.name} (${project.path})` }] : []),
    ...(project ? [{ role: 'system' as const, content: planPrompt }] : []),
    ...messagesOf(chat.id).map((m) => ({ role: m.role as LLMMessage['role'], content: m.content }))
  ]

  const job: GenerationJob = {
    chatId: chat.id,
    assistantId: newId(),
    model: resolvedModel.model,
    modelDisplayName: resolvedModel.displayName,
    providerName: provider.name,
    content: '',
    status: 'running',
    startedAt: new Date().toISOString(),
    controller: new AbortController(),
    listeners: new Set()
  }
  generations.set(chat.id, job)

  // Fire-and-forget chat title generation (AI understands prompt and numbers the chat)
  void generateAndPersistTitle(chat, content, provider, resolvedModel.model).catch(() => {})

  const agent: AgentSpec | null = project ? { projectPath: project.path } : null

  void runGeneration(job, provider, resolvedModel.model, history, agent, resolvedModel.maxTokens).finally(() => {
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
      providerName: db.providers.find((p) => p.id === m.providerId)?.name ?? 'Unknown',
      maxTokens: m.maxTokens,
      systemPrompt: m.systemPrompt ?? ''
    }))
  )
})

app.post('/api/settings/models', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const model = String(body.model ?? '').trim()
  const providerId = String(body.providerId ?? '').trim()
  const displayName = String(body.displayName ?? '').trim()
  const systemPrompt = String(body.systemPrompt ?? '').trim()
  const maxTokens = body.maxTokens != null ? Number(body.maxTokens) : undefined
  if (!model) return c.json({ error: 'Model id is required' }, 400)
  if (!getDb().providers.some((p) => p.id === providerId)) {
    return c.json({ error: 'Select a valid provider' }, 400)
  }
  if (maxTokens != null && (isNaN(maxTokens) || maxTokens < 1)) {
    return c.json({ error: 'Max tokens must be a positive number' }, 400)
  }
  const entry = { id: newId(), providerId, model, ...(displayName ? { displayName } : {}), ...(systemPrompt ? { systemPrompt } : {}), ...(maxTokens ? { maxTokens } : {}) }
  getDb().models.push(entry)
  saveDb()
  return c.json(entry, 201)
})

app.patch('/api/settings/models/:id', async (c) => {
  const db = getDb()
  const model = db.models.find((m) => m.id === c.req.param('id'))
  if (!model) return c.json({ error: 'Model not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  if (body.displayName !== undefined) {
    const displayName = String(body.displayName).trim()
    if (displayName) model.displayName = displayName
    else delete model.displayName
  }
  if (body.systemPrompt !== undefined) {
    const systemPrompt = String(body.systemPrompt).trim()
    if (systemPrompt) model.systemPrompt = systemPrompt
    else delete model.systemPrompt
  }
  if (body.maxTokens !== undefined) {
    const maxTokens = Number(body.maxTokens)
    if (maxTokens != null && !isNaN(maxTokens) && maxTokens >= 1) model.maxTokens = maxTokens
    else delete model.maxTokens
  }
  saveDb()
  return c.json({ ok: true, model })
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

app.get('/api/settings/system-prompt', (c) => {
  return c.json({ systemPrompt: getDb().systemPrompt })
})

app.patch('/api/settings/system-prompt', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const systemPrompt = String(body.systemPrompt ?? '').trim()
  getDb().systemPrompt = systemPrompt
  saveDb()
  return c.json({ ok: true, systemPrompt })
})

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
  const allowedKeys = ['enabled', 'maxRetries', 'baseDelayMs', 'maxDelayMs', 'retryOnStatusCodes', 'stopOnStatusCodes', 'alwaysRetry'] as const
  const patch: Partial<RetrySettings> = {}
  for (const key of allowedKeys) {
    if (body[key] !== undefined) {
      const val = body[key]
      if (key === 'enabled') patch.enabled = Boolean(val)
      else if (key === 'alwaysRetry') (patch as any).alwaysRetry = Boolean(val)
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
  const relParts = rel.split('/').filter(Boolean)
  if (relParts.length === 0 || !relParts.every(validSegment)) return c.json({ error: 'Invalid name' }, 400)
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

app.get('/api/projects/:id/archive', (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  let stat: fs.Stats
  try {
    stat = fs.statSync(project.path)
  } catch {
    return c.json({ error: 'Project path not found' }, 404)
  }
  if (!stat.isDirectory()) return c.json({ error: 'Project path is not a directory' }, 400)

  const base = path.basename(project.path) || project.name || 'project'
  const safeBase = base.replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'project'
  const filename = `${safeBase}.zip`
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  c.header('Content-Type', 'application/zip')
  c.header(
    'Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  )

  const child = spawn('zip', ['-r', '-q', '-', '.'], {
    cwd: project.path,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.on('error', (err) => {
    console.error('zip spawn failed:', err)
  })

  if (!child.stdout) {
    return c.json({ error: 'Failed to create archive' }, 500)
  }

  // If zip writes errors to stderr, log them; don't break the stream
  child.stderr?.on('data', () => {})

  return c.body(Readable.toWeb(child.stdout as any) as any)
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
  const files = list.filter((x): x is File => x instanceof File)
  if (files.length === 0) return c.json({ error: 'No files in upload' }, 400)
  for (const item of files) {
    if (!validSegment(item.name)) return c.json({ error: `Invalid file name: "${item.name}"` }, 400)
    if (item.size > MAX_UPLOAD_BYTES) return c.json({ error: `"${item.name}" exceeds size limit` }, 400)
  }
  const saved: string[] = []
  for (const item of files) {
    const buf = Buffer.from(await item.arrayBuffer())
    fs.writeFileSync(path.join(t.abs, item.name), buf)
    saved.push(item.name)
  }
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
  if (Buffer.byteLength(content, 'utf8') > 10 * 1024 * 1024) return c.json({ error: 'Content too large' }, 400)
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
  try {
    if (res.url && isBlockedHost(new URL(res.url).hostname)) return c.json({ error: 'Blocked host' }, 400)
  } catch {
    return c.json({ error: 'Blocked host' }, 400)
  }
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
  const id = c.req.param('id')
  const idx = db.terminals.findIndex((t) => t.id === id)
  if (idx === -1) return c.json({ error: 'Terminal not found' }, 404)
  db.terminals.splice(idx, 1)
  saveDb()
  killPty(id)
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

// PTY resize via HTTP (also supported via WS JSON message)
app.post('/api/terminals/:id/resize', async (c) => {
  const terminal = findTerminal(c.req.param('id'))
  if (!terminal) return c.json({ error: 'Terminal not found' }, 404)
  const body = await c.req.json().catch(() => ({}))
  const cols = Number(body.cols)
  const rows = Number(body.rows)
  if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols <= 0 || rows <= 0 || cols > 500 || rows > 500) {
    return c.json({ error: 'Invalid cols/rows' }, 400)
  }
  const sess = ptySessions.get(terminal.id)
  if (sess) {
    try { sess.pty.resize(cols, rows) } catch {}
  }
  return c.json({ ok: true })
})

function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '').replace(/^\[/, '').replace(/\]$/, '')
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal'))
    return true
  if (h === '::1' || h === '::') return true
  if (h.includes(':') && (h.startsWith('fe80:') || /^f[cd][0-9a-f]{2}:/.test(h))) return true
  if (h.startsWith('::ffff:')) {
    const v4 = h.slice(7)
    if (v4) return isBlockedHost(v4)
  }
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

// ---------------- Preview ----------------

// Detect port from multiple sources: package.json dev script, vite/next config, env files
function detectPreviewPort(projectPath: string): number {
  let port = 3000
  const packageJsonPath = path.join(projectPath, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      const scripts: Record<string, string> = pkg.scripts ?? {}
      const devLike = scripts.dev ?? scripts.start ?? scripts.preview ?? ''
      if (devLike) {
        const m1 = devLike.match(/--port[=\s]+(\d{2,5})/)
        const m2 = devLike.match(/(?:^|\s)-p[=\s]+(\d{2,5})/)
        const m3 = devLike.match(/:(\d{4})\b/)
        const m4 = devLike.match(/PORT[=\s]+(\d{2,5})/)
        const raw = m1?.[1] || m2?.[1] || m3?.[1] || m4?.[1]
        if (raw) {
          const n = parseInt(raw, 10)
          if (n >= 1 && n <= 65535) port = n
        }
      }
      // framework defaults: vite default 5173 if vite present
      const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) }
      if (deps['vite'] && port === 3000) {
        // leave 5173 as vite default unless overridden by dev script
        // check vite config for explicit port
        let vitePort: number | null = null
        for (const fname of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
          const vp = path.join(projectPath, fname)
          if (fs.existsSync(vp)) {
            try {
              const content = fs.readFileSync(vp, 'utf8')
              const mp = content.match(/port\s*:\s*(\d{2,5})/)
              if (mp) vitePort = parseInt(mp[1], 10)
            } catch {}
          }
        }
        if (vitePort) port = vitePort
        else if (!deps['next'] && !deps['react-scripts']) port = 5173
      }
      if (deps['next'] && port === 3000) port = 3000 // next default
    } catch {}
  }
  // Also check vite.config outside of package.json case
  if (port === 3000) {
    for (const fname of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']) {
      const vp = path.join(projectPath, fname)
      if (fs.existsSync(vp)) {
        try {
          const content = fs.readFileSync(vp, 'utf8')
          const mp = content.match(/port\s*:\s*(\d{2,5})/)
          if (mp) {
            const n = parseInt(mp[1], 10)
            if (n >= 1 && n <= 65535) { port = n; break }
          }
        } catch {}
      }
    }
  }
  return port
}

async function isPortReachable(port: number, timeoutMs = 1500): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    const res = await fetch(`http://127.0.0.1:${port}/`, { signal: ctrl.signal, redirect: 'manual' } as any)
    clearTimeout(t)
    // any response (even 404) means port is listening
    return !!res
  } catch {
    return false
  }
}

const previewProcs = new Map<string, { port: number; child: ReturnType<typeof spawn> | null; startedAt: number }>()

app.get('/api/projects/:id/preview/status', async (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const port = detectPreviewPort(project.path)
  const running = await isPortReachable(port)
  const proc = previewProcs.get(project.id)
  return c.json({
    port,
    url: `http://127.0.0.1:${port}`,
    proxiedUrl: `/api/projects/${project.id}/preview/proxy/`,
    running,
    managed: !!proc?.child
  })
})

app.post('/api/projects/:id/preview/start', async (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)

  const detectedPort = detectPreviewPort(project.path)

  // If already reachable, return immediately
  if (await isPortReachable(detectedPort, 1000)) {
    return c.json({
      port: detectedPort,
      url: `http://127.0.0.1:${detectedPort}`,
      proxiedUrl: `/api/projects/${project.id}/preview/proxy/`,
      running: true
    })
  }

  // Try to auto-start dev server if package.json has dev script
  const packageJsonPath = path.join(project.path, 'package.json')
  let hasDevScript = false
  try {
    if (fs.existsSync(packageJsonPath)) {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      hasDevScript = !!pkg.scripts?.dev
    }
  } catch {}

  if (hasDevScript && !previewProcs.get(project.id)?.child) {
    try {
      const child = spawn('npm', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', String(detectedPort)], {
        cwd: project.path,
        shell: true,
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PORT: String(detectedPort), HOST: '0.0.0.0' } as any
      })
      previewProcs.set(project.id, { port: detectedPort, child, startedAt: Date.now() })
      child.on('exit', () => {
        const cur = previewProcs.get(project.id)
        if (cur?.child === child) previewProcs.delete(project.id)
      })
      child.on('error', () => {
        const cur = previewProcs.get(project.id)
        if (cur?.child === child) previewProcs.delete(project.id)
      })
      // Wait up to 8s for port to become reachable
      for (let i = 0; i < 16; i++) {
        await new Promise((r) => setTimeout(r, 500))
        if (await isPortReachable(detectedPort, 800)) {
          return c.json({
            port: detectedPort,
            url: `http://127.0.0.1:${detectedPort}`,
            proxiedUrl: `/api/projects/${project.id}/preview/proxy/`,
            running: true,
            started: true
          })
        }
        if (child.exitCode !== null) break
      }
      // Even if not yet reachable, return proxied url so frontend can retry/poll
      return c.json({
        port: detectedPort,
        url: `http://127.0.0.1:${detectedPort}`,
        proxiedUrl: `/api/projects/${project.id}/preview/proxy/`,
        running: false,
        started: true,
        message: 'Dev server starting…'
      })
    } catch (e: any) {
      return c.json({
        port: detectedPort,
        url: `http://127.0.0.1:${detectedPort}`,
        proxiedUrl: `/api/projects/${project.id}/preview/proxy/`,
        running: false,
        error: e?.message || 'Failed to start dev server'
      })
    }
  }

  return c.json({
    port: detectedPort,
    url: `http://127.0.0.1:${detectedPort}`,
    proxiedUrl: `/api/projects/${project.id}/preview/proxy/`,
    running: false,
    ...(hasDevScript ? {} : { message: 'No dev server running. Start it with: npm run dev' })
  })
})

app.post('/api/projects/:id/preview/stop', async (c) => {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const entry = previewProcs.get(project.id)
  if (entry?.child) {
    try { entry.child.kill('SIGTERM') } catch {}
    previewProcs.delete(project.id)
  }
  return c.json({ ok: true })
})

// Reverse-proxy for preview: forwards to http://127.0.0.1:<port> so iframe can use same origin
// Must be registered before the static fallback.
app.all('/api/projects/:id/preview/proxy', async (c) => proxyPreview(c, ''))
app.all('/api/projects/:id/preview/proxy/', async (c) => proxyPreview(c, ''))
app.all('/api/projects/:id/preview/proxy/*', async (c) => {
  const suffix = c.req.path.replace(/^\/api\/projects\/[^/]+\/preview\/proxy\/?/, '')
  return proxyPreview(c, suffix)
})

async function proxyPreview(c: any, suffix: string): Promise<Response> {
  const project = findProject(c.req.param('id'))
  if (!project) return c.json({ error: 'Project not found' }, 404)
  const port = detectPreviewPort(project.path)
  const query = c.req.query() as Record<string, string>
  const qs = new URLSearchParams(query).toString()
  let targetPath = '/' + suffix
  // preserve original query string if any leftover
  const url = new URL(c.req.url)
  const rawQuery = url.search
  if (qs && !rawQuery) targetPath += '?' + qs
  else if (rawQuery) targetPath = '/' + suffix + rawQuery
  // ensure we don't double-slash
  targetPath = targetPath.replace(/\/\//g, '/')
  if (!targetPath.startsWith('/')) targetPath = '/' + targetPath
  const target = `http://127.0.0.1:${port}${targetPath}`

  // Quick reachability check to give helpful error instead of hanging
  if (!(await isPortReachable(port, 800))) {
    return c.json({ error: `Preview not reachable on port ${port}. Run "npm run dev" in ${project.path}` }, 502)
  }

  try {
    const method = c.req.method
    const headers = new Headers()
    // copy safe headers
    for (const [k, v] of Object.entries(c.req.header())) {
      const lk = k.toLowerCase()
      if (['host', 'connection', 'content-length'].includes(lk)) continue
      if (typeof v === 'string') headers.set(k, v)
    }
    // For proxy, we need to forward body if present
    let body: any = undefined
    if (!['GET', 'HEAD'].includes(method)) {
      try { body = await c.req.arrayBuffer() as any } catch {}
    }
    const proxied = await fetch(target, {
      method,
      headers,
      body,
      redirect: 'manual'
    } as any)

    // Build response headers, filter hop-by-hop and security headers that break iframe embedding
    const outHeaders = new Headers()
    proxied.headers.forEach((v: string, k: string) => {
      const lk = k.toLowerCase()
      if (['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(lk)) return
      if (lk === 'x-frame-options') return // allow embedding
      if (lk === 'content-security-policy') return // strip to allow iframe
      outHeaders.set(k, v)
    })
    // Ensure we allow framing from same origin
    outHeaders.set('X-Frame-Options', 'ALLOWALL')

    // Handle redirect location rewriting: map absolute localhost:port redirects back to proxied path
    const location = proxied.headers.get('location')
    if (location) {
      try {
        const locUrl = new URL(location, target)
        if (locUrl.hostname === '127.0.0.1' && String(locUrl.port) === String(port)) {
          const newLoc = `/api/projects/${project.id}/preview/proxy${locUrl.pathname}${locUrl.search}`
          outHeaders.set('location', newLoc)
        }
      } catch {}
    }

    const buf = await proxied.arrayBuffer()
    return new Response(buf, { status: proxied.status, headers: outHeaders })
  } catch (e: any) {
    return c.json({ error: e?.message || 'Proxy fetch failed' }, 502)
  }
}

// ---------------- Static frontend ----------------

const distDir = process.env.KS_WEB_DIST || './dist'

app.use('*', serveStatic({ root: distDir }))
app.get('*', serveStatic({ root: distDir, rewriteRequestPath: () => '/index.html' }))

const port = Number(process.env.PORT || 8787)
const server = serve({ fetch: app.fetch, port, hostname: process.env.HOST || '0.0.0.0' })
console.log(`KS Agent listening on http://localhost:${port}`)

// ---------------- WebSocket PTY ----------------

const wss = new WebSocketServer({ noServer: true })

// Attach upgrade handler for /api/terminals/:id/pty
server.on('upgrade', (req: any, socket: any, head: any) => {
  try {
    const host = req.headers.host || `localhost:${port}`
    const url = new URL(req.url || '', `http://${host}`)
    const m = url.pathname.match(/^\/api\/terminals\/([^/]+)\/pty$/)
    if (!m) return
    const terminalId = m[1]
    const terminal = findTerminal(terminalId)
    if (!terminal) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }
    const project = findProject(terminal.projectId)
    if (!project) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n')
      socket.destroy()
      return
    }
    // optional cols/rows from query
    const cols = Number(url.searchParams.get('cols') || 80)
    const rows = Number(url.searchParams.get('rows') || 24)
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, terminalId, project.path, terminal, cols, rows)
    })
  } catch (e) {
    try { socket.destroy() } catch {}
  }
})

wss.on('connection', (ws: WebSocket, _req: any, terminalId: string, projectPath: string, terminal: Terminal, cols: number, rows: number) => {
  const c = Number.isInteger(cols) && cols > 0 && cols <= 500 ? cols : 80
  const r = Number.isInteger(rows) && rows > 0 && rows <= 500 ? rows : 24
  const sess = getOrCreatePty(terminalId, projectPath, terminal.projectId, c, r)
  sess.clients.add(ws)

  // replay buffer so new client sees previous output
  if (sess.buffer) {
    try { ws.send(sess.buffer) } catch {}
  }

  ws.on('message', (msg: any) => {
    const str = msg.toString()
    // Try JSON control messages: {type:'resize', cols, rows} or {type:'data', data}
    if (str.startsWith('{')) {
      try {
        const obj = JSON.parse(str)
        if (obj && obj.type === 'resize' && Number.isInteger(obj.cols) && Number.isInteger(obj.rows)) {
          try { sess.pty.resize(obj.cols, obj.rows) } catch {}
          return
        }
        if (obj && obj.type === 'data' && typeof obj.data === 'string') {
          try { sess.pty.write(obj.data) } catch {}
          return
        }
      } catch {}
    }
    // raw bytes -> write directly
    try { sess.pty.write(str) } catch {}
  })

  ws.on('close', () => {
    sess.clients.delete(ws)
  })
  ws.on('error', () => {
    sess.clients.delete(ws)
  })
})

// Graceful cleanup
process.on('exit', () => {
  for (const sess of ptySessions.values()) {
    try { sess.pty.kill() } catch {}
  }
})
