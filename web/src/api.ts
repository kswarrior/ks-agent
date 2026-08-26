import type { Chat, Message, ModelEntry, Project, Provider } from './types'

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

export interface StreamHandlers {
  onMeta?: (meta: { assistantId: string; model: string }) => void
  onDelta: (text: string) => void
  onError: (message: string) => void
  onDone: () => void
}

/** Sends a user message and consumes the SSE stream from the server. */
export async function sendMessage(
  chatId: string,
  content: string,
  modelId: string | null,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, modelId }),
    signal
  })

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

      try {
        const parsed = JSON.parse(data)
        switch (event) {
          case 'meta':
            handlers.onMeta?.({ assistantId: parsed.assistantId, model: parsed.model })
            break
          case 'delta':
            handlers.onDelta(parsed)
            break
          case 'error':
            handlers.onError(parsed.message)
            break
          case 'done':
            handlers.onDone()
            break
        }
      } catch {}
    }
  }
  handlers.onDone()
}

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

export const getSystemPrompt = () => req<{ systemPrompt: string }>('/api/settings/system-prompt')
export const saveSystemPrompt = (systemPrompt: string) =>
  req<{ ok: true; systemPrompt: string }>('/api/settings/system-prompt', json('PATCH', { systemPrompt }))
