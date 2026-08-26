import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import {
  chatsOf,
  findChat,
  findProject,
  getDb,
  loadDb,
  messagesOf,
  newId,
  saveDb,
  touchChat
} from './store.js'
import { streamChat, type LLMMessage } from './llm.js'

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
  saveDb()
  return c.json({ ok: true })
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

  const body: any = await c.req.json().catch(() => ({}))
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

  const history: LLMMessage[] = [
    {
      role: 'system',
      content:
        getDb().systemPrompt.trim() ||
        'You are KS Agent, a precise coding assistant by ks warrior. Be concise and correct. Use markdown for code.'
    },
    ...(project ? [{ role: 'system' as const, content: `Active project: ${project.name} (${project.path})` }] : []),
    ...messagesOf(chat.id).map((m) => ({ role: m.role as LLMMessage['role'], content: m.content }))
  ]

  return streamSSE(c, async (stream) => {
      const assistantId = newId()
      await stream.writeSSE({
        event: 'meta',
        data: JSON.stringify({ userMsgId: userMsg.id, assistantId, model: resolvedModel.model })
      })

      let full = ''
      let aborted = false
      try {
        for await (const delta of streamChat(provider.baseUrl, provider.apiKey, resolvedModel.model, history, c.req.raw.signal)) {
          full += delta
          await stream.writeSSE({ event: 'delta', data: JSON.stringify(delta) })
        }
      } catch (e: any) {
        if (e?.name === 'AbortError') {
          aborted = true
        } else {
          const message = full
            ? `${full}\n\n_[stream interrupted: ${String(e?.message || e)}]_`
            : `Error: ${String(e?.message || e)}`
          const msg = {
            id: assistantId,
            chatId: chat.id,
            role: 'assistant' as const,
            content: message,
            createdAt: new Date().toISOString(),
            error: true
          }
          getDb().messages.push(msg)
          touchChat(chat)
          saveDb()
          await stream.writeSSE({ event: 'error', data: JSON.stringify({ message }) })
          return
        }
      }

      const msg = {
        id: assistantId,
        chatId: chat.id,
        role: 'assistant' as const,
        content: aborted ? full + '\n\n_[stopped]_' : full,
        createdAt: new Date().toISOString(),
        error: aborted && !full ? true : undefined
      }
      if (msg.content.trim()) {
        getDb().messages.push(msg)
        touchChat(chat)
        saveDb()
      }
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ messageId: assistantId }) })
  })
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

// ---------------- Static frontend ----------------

const distDir = process.env.KS_WEB_DIST || './dist'

app.use('*', serveStatic({ root: distDir }))
app.get('*', serveStatic({ root: distDir, rewriteRequestPath: () => '/index.html' }))

const port = Number(process.env.PORT || 8787)
serve({ fetch: app.fetch, port, hostname: process.env.HOST || '0.0.0.0' })
console.log(`KS Agent listening on http://localhost:${port}`)
