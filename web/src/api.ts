import type {
  AgentEvent,
  Chat,
  ChatExtensionsState,
  ChatSummary,
  ExtensionInfo,
  ExtensionKind,
  FileContent,
  FileListing,
  KnowledgeEntry,
  KnowledgeJob,
  LspServerDetail,
  LspServerInfo,
  McpServerDetail,
  McpServerInfo,
  Message,
  ModelEntry,
  Project,
  ProviderPublic,
  RetrySettings,
  SkillDetail,
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

export const killProjectTerminal = (projectId: string, terminalId: string) =>
  req<{ ok: true }>(`/api/projects/${projectId}/terminal/${encodeURIComponent(terminalId)}`, {
    method: 'DELETE'
  })

export const listProjectFiles = (projectId: string, path = '') =>
  req<FileListing>(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`)

export const readProjectFile = (projectId: string, path: string) =>
  req<FileContent>(`/api/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`)

export const writeProjectFile = (projectId: string, path: string, content: string) =>
  req<{ ok: true }>(`/api/projects/${projectId}/files/content`, json('PUT', { path, content }))

export const createFileEntry = (projectId: string, kind: 'file' | 'folder', path: string) =>
  req<{ ok: true; path: string }>(`/api/projects/${projectId}/files`, json('POST', { kind, path }))

export const renameFileEntry = (projectId: string, from: string, to: string) =>
  req<{ ok: true; path: string }>(`/api/projects/${projectId}/files`, json('PATCH', { from, to }))

export const deleteFileEntry = (projectId: string, path: string) =>
  req<{ ok: true }>(`/api/projects/${projectId}/files?path=${encodeURIComponent(path)}`, {
    method: 'DELETE'
  })

export const uploadProjectFiles = async (projectId: string, path: string, files: File[]) => {
  const form = new FormData()
  form.append('path', path)
  for (const file of files) form.append('file', file)
  const res = await fetch(`/api/projects/${projectId}/files/upload`, { method: 'POST', body: form })
  const data = (await res.json().catch(() => null)) as { error?: string } | null
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
  return data as { ok: true; saved: string[] }
}

export const projectFileDownloadUrl = (projectId: string, path: string) =>
  `/api/projects/${projectId}/files/download?path=${encodeURIComponent(path)}`

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

export const listGlobalKnowledge = () => req<KnowledgeEntry[]>('/api/knowledge?scope=global')
export const listProjectKnowledge = (projectId: string) =>
  req<KnowledgeEntry[]>(`/api/projects/${projectId}/knowledge`)
export const createGlobalKnowledge = (body: {
  title: string
  content: string
  enabled?: boolean
}) => req<KnowledgeEntry>('/api/knowledge', json('POST', { ...body, scope: 'global' }))
export const createProjectKnowledge = (
  projectId: string,
  body: { title: string; content: string; enabled?: boolean }
) => req<KnowledgeEntry>(`/api/projects/${projectId}/knowledge`, json('POST', body))
export const updateKnowledge = (
  id: string,
  body: { title?: string; content?: string; enabled?: boolean }
) => req<KnowledgeEntry>(`/api/knowledge/${encodeURIComponent(id)}`, json('PATCH', body))
export const deleteKnowledge = (id: string) =>
  req<{ ok: true }>(`/api/knowledge/${encodeURIComponent(id)}`, { method: 'DELETE' })
export const generateProjectKnowledge = (projectId: string, modelId?: string) =>
  req<KnowledgeEntry>(
    `/api/projects/${projectId}/knowledge/summary`,
    json('POST', modelId ? { modelId } : {})
  )
export const startProjectKnowledge = (projectId: string, modelId?: string) =>
  req<KnowledgeJob>(
    `/api/projects/${projectId}/knowledge/summary`,
    json('POST', { background: true, ...(modelId ? { modelId } : {}) })
  )
export const getProjectKnowledgeJob = (projectId: string) =>
  req<{ job: KnowledgeJob | null }>(`/api/projects/${projectId}/knowledge/summary/status`)

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
export const updateProvider = (
  id: string,
  body: { name?: string; baseUrl?: string; apiKey?: string }
) => req<ProviderPublic>(`/api/providers/${encodeURIComponent(id)}`, json('PATCH', body))
export const deleteProvider = (id: string) => req<{ ok: true }>(`/api/providers/${id}`, { method: 'DELETE' })

export const listModels = () => req<ModelEntry[]>('/api/models')
export const createModel = (body: {
  providerId: string
  name: string
  modelId: string
  contextWindow?: number
}) => req<ModelEntry>('/api/models', json('POST', body))
export const updateModel = (
  id: string,
  body: { providerId?: string; name?: string; modelId?: string; contextWindow?: number }
) => req<ModelEntry>(`/api/models/${encodeURIComponent(id)}`, json('PATCH', body))
export const updateModelContext = (id: string, contextWindow: number) =>
  updateModel(id, { contextWindow })
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
export const getSkill = (name: string) =>
  req<SkillDetail>(`/api/skills/${encodeURIComponent(name)}`)
export const createSkill = (body: {
  name: string
  description: string
  content: string
  projects?: string[]
  overwrite?: boolean
}) => req<SkillInfo>('/api/skills', json('POST', body))
export const updateSkill = (
  name: string,
  body: { name?: string; description?: string; content?: string; projects?: string[] }
) => req<SkillInfo>(`/api/skills/${encodeURIComponent(name)}`, json('PATCH', body))
export const deleteSkill = (name: string) =>
  req<{ ok: true }>(`/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' })

export const listMcpServers = () => req<McpServerInfo[]>('/api/mcp')
export const reloadMcpServers = () => req<McpServerInfo[]>('/api/mcp/reload', { method: 'POST' })
export const getMcpServer = (name: string) =>
  req<McpServerDetail>(`/api/mcp/${encodeURIComponent(name)}`)
export const createMcpServer = (body: {
  name: string
  transport: 'stdio' | 'http' | 'sse'
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  url?: string
  headers?: Record<string, string>
  installCommand?: string
  projects?: string[]
}) => req<McpServerInfo[]>('/api/mcp', json('POST', body))
export const updateMcpServer = (
  name: string,
  body: {
    transport?: 'stdio' | 'http' | 'sse'
    command?: string
    args?: string[]
    env?: Record<string, string>
    cwd?: string
    url?: string
    headers?: Record<string, string>
    installCommand?: string
    projects?: string[]
  }
) => req<McpServerInfo[]>(`/api/mcp/${encodeURIComponent(name)}`, json('PATCH', body))
export const installMcpServer = (name: string, background = false) =>
  req<McpServerInfo[]>(`/api/mcp/${encodeURIComponent(name)}/install`, json('POST', { background }))
export const deleteMcpServer = (name: string) =>
  req<McpServerInfo[]>(`/api/mcp/${encodeURIComponent(name)}`, { method: 'DELETE' })

export const listLspServers = () => req<LspServerInfo[]>('/api/lsp')
export const reloadLspServers = () => req<LspServerInfo[]>('/api/lsp/reload', { method: 'POST' })
export const getLspServer = (name: string) =>
  req<LspServerDetail>(`/api/lsp/${encodeURIComponent(name)}`)
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
export const updateLspServer = (
  name: string,
  body: {
    command?: string
    args?: string[]
    extensions?: string[]
    languageId?: string
    installCommand?: string
    env?: Record<string, string>
    projects?: string[]
  }
) => req<LspServerInfo[]>(`/api/lsp/${encodeURIComponent(name)}`, json('PATCH', body))
export const deleteLspServer = (name: string) =>
  req<LspServerInfo[]>(`/api/lsp/${encodeURIComponent(name)}`, { method: 'DELETE' })
export const installLspServer = (name: string) =>
  req<LspServerInfo[]>(`/api/lsp/${encodeURIComponent(name)}/install`, { method: 'POST' })
