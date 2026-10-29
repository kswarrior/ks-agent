import type {
  AgentEvent,
  Chat,
  ChatExtensionsState,
  ExtensionInfo,
  ExtensionKind,
  LspServerInfo,
  McpServerInfo,
  Message,
  ModelEntry,
  Project,
  ProviderPublic,
  RetrySettings,
  SkillInfo
} from './types'

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    ...options
  })
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // empty body
  }
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `Request failed (${res.status})`
    throw new Error(message)
  }
  return data as T
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const listProjects = () => req<Project[]>('/api/projects')
export const createProject = (body: { name: string; path?: string }) =>
  req<Project>('/api/projects', json('POST', body))
export const deleteProject = (id: string, deleteFolder = false) =>
  req<{ ok: true }>(`/api/projects/${id}${deleteFolder ? '?deleteFolder=true' : ''}`, { method: 'DELETE' })

export const listChats = (projectId: string) => req<Chat[]>(`/api/projects/${projectId}/chats`)
export const createChat = (projectId: string, body: { title?: string; modelId?: string | null } = {}) =>
  req<Chat>(`/api/projects/${projectId}/chats`, json('POST', body))
export const updateChat = (id: string, body: { title?: string; modelId?: string | null }) =>
  req<Chat>(`/api/chats/${id}`, json('PATCH', body))
export const deleteChat = (id: string) => req<{ ok: true }>(`/api/chats/${id}`, { method: 'DELETE' })

export const listChatExtensions = (chatId: string) =>
  req<ChatExtensionsState>(`/api/chats/${chatId}/extensions`)
export const setChatExtension = (
  chatId: string,
  body: { kind: ExtensionKind; name: string; enabled: boolean }
) => req<{ ok: true }>(`/api/chats/${chatId}/extensions`, json('PATCH', body))

export const listMessages = (chatId: string) => req<Message[]>(`/api/chats/${chatId}/messages`)
export const getChatSummary = (chatId: string) => req<ChatSummary | null>(`/api/chats/${chatId}/summary`)
export const saveChatSummary = (chatId: string, summary: string) =>
  req<ChatSummary>(`/api/chats/${chatId}/summary`, json('PUT', { summary }))
export const deleteChatSummary = (chatId: string) =>
  req<{ ok: true }>(`/api/chats/${chatId}/summary`, { method: 'DELETE' })
export const stopChat = (chatId: string) => req<{ ok: true }>(`/api/chats/${chatId}/stop`, { method: 'POST' })

export const startChatRun = (chatId: string, content: string, modelId: string) =>
  req<{ ok: true; chatId: string; title?: string }>(`/api/chats/${chatId}/messages`, json('POST', { content, modelId }))

export const getChatRun = (chatId: string) =>
  req<{ active: boolean }>(`/api/chats/${chatId}/run`)

export async function streamChatEvents(
  chatId: string,
  onEvent: (event: AgentEvent) => void,
  signal: AbortSignal
): Promise<boolean> {
  const res = await fetch(`/api/chats/${chatId}/events`, { signal })
  if (res.status === 404) return false
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const data = (await res.json()) as { error?: string }
      if (data.error) message = data.error
    } catch {
      // ignore
    }
    throw new Error(message)
  }
  if (!res.body) throw new Error('Streaming is not supported by this browser')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    buffer += decoder.decode(chunk.value, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, '')
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      if (!line.startsWith('data:')) continue
      const data = line.slice(5).trim()
      if (!data) continue
      try {
        onEvent(JSON.parse(data) as AgentEvent)
      } catch {
        // ignore malformed frame
      }
    }
  }
  return true
}

export const listProviders = () => req<ProviderPublic[]>('/api/providers')
export const createProvider = (body: { name: string; baseUrl: string; apiKey: string }) =>
  req<ProviderPublic>('/api/providers', json('POST', body))
export const deleteProvider = (id: string) => req<{ ok: true }>(`/api/providers/${id}`, { method: 'DELETE' })

export const listModels = () => req<ModelEntry[]>('/api/models')
export const createModel = (body: {
  providerId: string
  name: string
  modelId: string
  contextWindow?: number
}) => req<ModelEntry>('/api/models', json('POST', body))
export const updateModelContext = (id: string, contextWindow: number) =>
  req<ModelEntry>(`/api/models/${encodeURIComponent(id)}`, json('PATCH', { contextWindow }))
export const deleteModel = (id: string) => req<{ ok: true }>(`/api/models/${id}`, { method: 'DELETE' })

export const getRetrySettings = () => req<RetrySettings>('/api/settings/retry')
export const updateRetrySettings = (body: RetrySettings) =>
  req<RetrySettings>('/api/settings/retry', json('PUT', body))
export const resetRetrySettings = () =>
  req<RetrySettings>('/api/settings/retry/reset', { method: 'POST' })

export const listExtensions = () => req<ExtensionInfo[]>('/api/extensions')
export const reloadExtensions = () => req<ExtensionInfo[]>('/api/extensions/reload', { method: 'POST' })

export const listSkills = () => req<SkillInfo[]>('/api/skills')
export const reloadSkills = () => req<SkillInfo[]>('/api/skills/reload', { method: 'POST' })
export const createSkill = (body: {
  name: string
  description: string
  content: string
  projects?: string[]
  overwrite?: boolean
}) => req<SkillInfo>('/api/skills', json('POST', body))
export const deleteSkill = (name: string) =>
  req<{ ok: true }>(`/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' })

export const listMcpServers = () => req<McpServerInfo[]>('/api/mcp')
export const reloadMcpServers = () => req<McpServerInfo[]>('/api/mcp/reload', { method: 'POST' })
export const createMcpServer = (body: {
  name: string
  transport: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  projects?: string[]
}) => req<McpServerInfo[]>('/api/mcp', json('POST', body))
export const deleteMcpServer = (name: string) =>
  req<McpServerInfo[]>(`/api/mcp/${encodeURIComponent(name)}`, { method: 'DELETE' })

export const listLspServers = () => req<LspServerInfo[]>('/api/lsp')
export const reloadLspServers = () => req<LspServerInfo[]>('/api/lsp/reload', { method: 'POST' })
export const createLspServer = (body: {
  name: string
  command: string
  args?: string[]
  extensions: string[]
  languageId?: string
  installCommand?: string
  env?: Record<string, string>
  projects?: string[]
}) => req<LspServerInfo[]>('/api/lsp', json('POST', body))
export const deleteLspServer = (name: string) =>
  req<LspServerInfo[]>(`/api/lsp/${encodeURIComponent(name)}`, { method: 'DELETE' })
export const installLspServer = (name: string) =>
  req<LspServerInfo[]>(`/api/lsp/${encodeURIComponent(name)}/install`, { method: 'POST' })
