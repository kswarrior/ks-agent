import type { Chat, FileListing, Message, ModelEntry, Plan, Project, Provider, Terminal } from './types'

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...options
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data as T
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

// Projects
export const listProjects = () => req<Project[]>('/api/projects')
export const createProject = (p: { name: string; path: string; mkdir: boolean }) =>
  req<Project>('/api/projects', json('POST', p))
export const deleteProject = (id: string) => req<{ ok: true }>(`/api/projects/${id}`, { method: 'DELETE' })
export const renameProject = (id: string, name: string) =>
  req<Project>(`/api/projects/${id}`, json('PATCH', { name }))

// Chats
export const listChats = (projectId: string) => req<Chat[]>(`/api/projects/${projectId}/chats`)
export const createChat = (projectId: string, title = 'New chat') =>
  req<Chat>(`/api/projects/${projectId}/chats`, json('POST', { title }))
export const renameChat = (id: string, title: string) => req<Chat>(`/api/chats/${id}`, json('PATCH', { title }))
export const deleteChat = (id: string) => req<{ ok: true }>(`/api/chats/${id}`, { method: 'DELETE' })

// Messages
export const listMessages = (chatId: string) => req<Message[]>(`/api/chats/${chatId}/messages`)

/** Sends a user message. The reply is generated in the background; watch it via streamChatEvents. */
export async function sendMessage(
  chatId: string,
  content: string,
  modelId: string | null
): Promise<{ userMsgId: string; assistantId: string; model: string }> {
  const res = await fetch(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, modelId })
  })
  let data: any = null
  try {
    data = await res.json()
  } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

// Background generations

export interface StreamHandlers {
  onMeta?: (meta: { assistantId: string; model: string }) => void
  onSnapshot?: (text: string) => void
  onDelta: (text: string) => void
  onTool?: (tool: { callId: string; name: string; args: string }) => void
  onToolResult?: (result: { callId: string; ok: boolean; summary: string }) => void
  onPlan?: (plan: Plan) => void
  onError: (message: string) => void
  onDone: () => void
}

/** Subscribes to the live event stream of a chat's background generation. */
export async function streamChatEvents(
  chatId: string,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`/api/chats/${chatId}/events`, { signal })
  if (!res.ok) {
    let msg = `Request failed (${res.status})`
    try {
      const data = await res.json()
      msg = data.error || msg
    } catch {}
    throw new Error(msg)
  }
  if (!res.body) throw new Error('Empty response stream')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trimEnd()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('event:') && !line.startsWith('data:')) continue

      // Collect event + data pair
      let event = 'message'
      let data = ''
      if (line.startsWith('event:')) {
        event = line.slice(6).trim()
        const nextNl = buf.indexOf('\n')
        if (nextNl >= 0) {
          const nextLine = buf.slice(0, nextNl).trimEnd()
          buf = buf.slice(nextNl + 1)
          if (nextLine.startsWith('data:')) data = nextLine.slice(5).trim()
        }
      } else {
        data = line.slice(5).trim()
      }

      if (event === 'ping' || event === 'idle') continue
      try {
        const parsed = JSON.parse(data)
        switch (event) {
          case 'meta':
            handlers.onMeta?.({ assistantId: parsed.assistantId, model: parsed.model })
            break
          case 'snapshot':
            handlers.onSnapshot?.(parsed)
            break
          case 'delta':
            handlers.onDelta(parsed)
            break
          case 'tool':
            handlers.onTool?.(parsed)
            break
          case 'tool_result':
            handlers.onToolResult?.(parsed)
            break
          case 'plan':
            handlers.onPlan?.(parsed)
            break
          case 'error':
            handlers.onError(parsed.message)
            break
          case 'done':
          case 'stopped':
            handlers.onDone()
            break
        }
      } catch {}
    }
  }
  handlers.onDone()
}

export const listGenerations = () => req<string[]>('/api/generations')

export const stopGeneration = (chatId: string) =>
  req<{ ok: true }>(`/api/chats/${chatId}/stop`, json('POST', {}))

// Plans
export const getPlan = (chatId: string) => req<Plan | null>(`/api/chats/${chatId}/plan`)

// Project files
export const listFiles = (projectId: string, path = '') =>
  req<FileListing>(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`)

export const createFileEntry = (projectId: string, kind: 'file' | 'folder', path: string) =>
  req<{ ok: true }>(`/api/projects/${projectId}/files`, json('POST', { kind, path }))

export const renameFileEntry = (projectId: string, from: string, to: string) =>
  req<{ ok: true }>(`/api/projects/${projectId}/files`, json('PATCH', { from, to }))

export const deleteFileEntry = (projectId: string, path: string) =>
  req<{ ok: true }>(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' })

export const downloadUrl = (projectId: string, path: string) =>
  `/api/projects/${projectId}/files/download?path=${encodeURIComponent(path)}`

export async function uploadLocalFiles(projectId: string, dir: string, files: File[]): Promise<void> {
  const form = new FormData()
  form.append('path', dir)
  for (const f of files) form.append('file', f)
  const res = await fetch(`/api/projects/${projectId}/files/upload`, { method: 'POST', body: form })
  let data: any = null
  try {
    data = await res.json()
  } catch {}
  if (!res.ok) throw new Error(data?.error || `Upload failed (${res.status})`)
}

export const uploadFromUrl = (projectId: string, p: { url: string; path: string }) =>
  req<{ ok: true; name: string }>(`/api/projects/${projectId}/files/upload-url`, json('POST', p))

// Terminals
export const listTerminals = (projectId: string) =>
  req<Terminal[]>(`/api/projects/${projectId}/terminals`)
export const createTerminal = (projectId: string, name: string) =>
  req<Terminal>(`/api/projects/${projectId}/terminals`, json('POST', { name }))
export const renameTerminal = (id: string, name: string) =>
  req<Terminal>(`/api/terminals/${id}`, json('PATCH', { name }))
export const deleteTerminal = (id: string) =>
  req<{ ok: true }>(`/api/terminals/${id}`, { method: 'DELETE' })

// Settings
export const listProviders = () => req<Provider[]>('/api/settings/providers')
export const createProvider = (p: { name: string; baseUrl: string; apiKey: string }) =>
  req<Provider>('/api/settings/providers', json('POST', p))
export const updateProvider = (
  id: string,
  p: Partial<{ name: string; baseUrl: string; apiKey: string }>
) => req<Provider>(`/api/settings/providers/${id}`, json('PATCH', p))
export const deleteProvider = (id: string) =>
  req<{ ok: true }>(`/api/settings/providers/${id}`, { method: 'DELETE' })

export const listModels = () => req<ModelEntry[]>('/api/settings/models')
export const createModel = (m: { providerId: string; model: string; displayName?: string }) =>
  req<ModelEntry>('/api/settings/models', json('POST', m))
export const deleteModel = (id: string) =>
  req<{ ok: true }>(`/api/settings/models/${id}`, { method: 'DELETE' })

// The primary system prompt is built-in and intentionally not exposed.
export const getPlanPrompt = () => req<{ planPrompt: string }>('/api/settings/plan-prompt')
export const savePlanPrompt = (planPrompt: string) =>
  req<{ ok: true; planPrompt: string }>('/api/settings/plan-prompt', json('PATCH', { planPrompt }))
