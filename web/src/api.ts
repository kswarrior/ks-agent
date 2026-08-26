import type { Chat, FileListing, Message, ModelEntry, Project, Provider } from './types'

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

export interface SendResult {
  userMsgId: string
  assistantId: string
  model: string
}

/** Sends a user message; generation runs in background on the server. */
export const sendMessage = (chatId: string, content: string, modelId: string | null) =>
  req<SendResult>(`/api/chats/${chatId}/messages`, json('POST', { content, modelId }))

/** Aborts the background generation of a chat server-side. */
export const stopGeneration = (chatId: string) => req<{ ok: true }>(`/api/chats/${chatId}/stop`, { method: 'POST' })

export const listGenerations = () => req<string[]>('/api/generations')

export interface GenerationHandlers {
  onMeta?: (meta: { assistantId: string; model: string }) => void
  onSnapshot: (text: string) => void
  onDelta: (text: string) => void
  onError: (message: string) => void
  onDone: () => void
}

/** Subscribes to a chat's background generation: snapshot so far + live deltas. */
export async function streamChatEvents(
  chatId: string,
  handlers: GenerationHandlers,
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
  let terminated = false

  const dispatch = (frame: string): boolean => {
    let event = 'message'
    let data = ''
    for (const line of frame.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) data = line.slice(5).trim()
    }
    let parsed: any = null
    try {
      parsed = JSON.parse(data)
    } catch {}
    switch (event) {
      case 'meta':
        handlers.onMeta?.({ assistantId: parsed?.assistantId ?? '', model: parsed?.model ?? '' })
        return false
      case 'snapshot':
        handlers.onSnapshot(typeof parsed === 'string' ? parsed : '')
        return false
      case 'delta':
        handlers.onDelta(typeof parsed === 'string' ? parsed : '')
        return false
      case 'error':
        handlers.onError(parsed?.message || 'Generation failed')
        terminated = true
        return true
      case 'done':
      case 'stopped':
      case 'idle':
        handlers.onDone()
        terminated = true
        return true
      default:
        return false
    }
  }

  while (!terminated) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      if (dispatch(frame)) return
    }
  }
  if (!terminated) handlers.onDone()
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

// Project files
async function formReq<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch(url, { method: 'POST', body: form })
  let data: any = null
  try {
    data = await res.json()
  } catch {}
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data as T
}

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

export function uploadLocalFiles(projectId: string, dir: string, files: File[]) {
  const form = new FormData()
  form.set('path', dir)
  for (const f of files) form.append('file', f, f.name)
  return formReq<{ ok: true; saved: string[] }>(`/api/projects/${projectId}/files/upload`, form)
}

export const uploadFromUrl = (projectId: string, p: { url: string; path?: string; name?: string }) =>
  req<{ ok: true; name: string }>(`/api/projects/${projectId}/files/upload-url`, json('POST', p))
