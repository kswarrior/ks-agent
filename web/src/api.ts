import type { Activity, Chat, FileListing, LSPServer, MCPServer, MarketplacePlugin, Message, ModelEntry, Plan, Plugin, Preview, Project, Provider, Question, RetrySettings, Skill, Terminal } from './types'

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
export const deleteProject = (id: string, opts?: { deleteFolder?: boolean }) => {
  const qs = opts?.deleteFolder ? '?deleteFolder=true' : ''
  return req<{ ok: true }>(`/api/projects/${id}${qs}`, { method: 'DELETE' })
}
export const renameProject = (id: string, name: string) =>
  req<Project>(`/api/projects/${id}`, json('PATCH', { name }))

// Chats
export const listChats = (projectId: string) => req<Chat[]>(`/api/projects/${projectId}/chats`)
export const createChat = (projectId: string, title?: string) =>
  req<Chat>(`/api/projects/${projectId}/chats`, json('POST', { title: title ?? '' }))
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

export async function continueChat(
  chatId: string,
  content?: string,
  modelId?: string | null
): Promise<{ userMsgId?: string; assistantId: string; model: string; continued?: boolean; content?: string }> {
  const res = await fetch(`/api/chats/${chatId}/continue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: content ?? '', modelId: modelId ?? null })
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
  onToolResult?: (result: { callId: string; ok: boolean; summary: string; result?: string }) => void
  onPlan?: (plan: Plan) => void
  onQuestion?: (question: Question) => void
  onChatTitle?: (data: { chatId: string; title: string; seq?: number }) => void
  onPreview?: (preview: Preview) => void
  onRetry?: (info: { attempt: number; maxAttempts: number; delay: number; reason: string; error: string }) => void
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
  let doneCalled = false
  const callDone = () => { if (!doneCalled) { doneCalled = true; handlers.onDone() } }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const raw = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        if (!raw.trim()) continue
        const lines = raw.split('\n')
        let event = 'message'
        let data = ''
        for (const l of lines) {
          const line = l.trimEnd()
          if (line.startsWith('event:')) {
            event = line.slice(6).trim()
          } else if (line.startsWith('data:')) {
            const chunk = line.slice(5).trim()
            data = data ? data + '\n' + chunk : chunk
          }
        }
        if (event === 'ping' || event === 'idle') continue
        if (!data) continue
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
            case 'question':
              handlers.onQuestion?.(parsed)
              break
            case 'chat_title':
              handlers.onChatTitle?.(parsed)
              break
            case 'preview':
              handlers.onPreview?.(parsed as Preview)
              break
            case 'retry':
              handlers.onRetry?.(parsed as { attempt: number; maxAttempts: number; delay: number; reason: string; error: string })
              break
            case 'error':
              handlers.onError(parsed.message)
              break
            case 'done':
            case 'stopped':
              callDone()
              break
          }
        } catch {}
      }
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') throw e
    // network or parse error will be surfaced via catch in caller; ensure done is still called to clean up UI
    // but don't call onError here to avoid double toast — caller handles
    throw e
  } finally {
    callDone()
    try { reader.cancel() } catch {}
  }
}

export const listGenerations = () => req<string[]>('/api/generations')

export const stopGeneration = (chatId: string) =>
  req<{ ok: true }>(`/api/chats/${chatId}/stop`, json('POST', {}))

// Activities
export const listActivities = (chatId: string) => req<Activity[]>(`/api/chats/${chatId}/activities`)

// Previews (per chat, like plan)
export const getChatPreview = (chatId: string) => req<Preview | null>(`/api/chats/${chatId}/preview`)
export const chatPreviewProxyUrl = (chatId: string, subPath = '') =>
  `/api/chats/${chatId}/preview/proxy/${subPath.replace(/^\//, '')}`

// Plans
export const getPlan = (chatId: string) => req<Plan | null>(`/api/chats/${chatId}/plan`)

// Questions
export const listQuestions = (chatId: string) => req<Question[]>(`/api/chats/${chatId}/questions`)
export const answerQuestion = (chatId: string, questionId: string, answer: string) =>
  req<Question>(`/api/chats/${chatId}/questions/${questionId}/answer`, json('POST', { answer }))

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

export const archiveUrl = (projectId: string) =>
  `/api/projects/${projectId}/archive`

export const readFileContent = (projectId: string, path: string) =>
  req<{ content: string }>(`/api/projects/${projectId}/files/content?path=${encodeURIComponent(path)}`)

export const saveFileContent = (projectId: string, path: string, content: string) =>
  req<{ ok: true }>(`/api/projects/${projectId}/files/content`, json('PUT', { path, content }))

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

export type PreviewInfo = {
  port: number
  url: string
  proxiedUrl: string
  running: boolean
  started?: boolean
  message?: string
  error?: string
  managed?: boolean
}
export const startPreview = (projectId: string) =>
  req<PreviewInfo>(`/api/projects/${projectId}/preview/start`, json('POST', {}))
export const getPreviewStatus = (projectId: string) =>
  req<PreviewInfo>(`/api/projects/${projectId}/preview/status`)
export const stopPreview = (projectId: string) =>
  req<{ ok: true }>(`/api/projects/${projectId}/preview/stop`, json('POST', {}))
export const previewProxyUrl = (projectId: string, subPath = '') =>
  `/api/projects/${projectId}/preview/proxy/${subPath.replace(/^\//, '')}`

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
export const createModel = (m: { providerId: string; model: string; displayName?: string; maxTokens?: number; systemPrompt?: string }) =>
  req<ModelEntry>('/api/settings/models', json('POST', m))
export const updateModel = (id: string, m: { displayName?: string; maxTokens?: number | null | string; systemPrompt?: string }) =>
  req<{ ok: true; model: ModelEntry }>(`/api/settings/models/${id}`, json('PATCH', m))
export const deleteModel = (id: string) =>
  req<{ ok: true }>(`/api/settings/models/${id}`, { method: 'DELETE' })

// The primary system prompt is built-in and can be overridden here (global + per-model).
export const getSystemPrompt = () => req<{ systemPrompt: string }>('/api/settings/system-prompt')
export const saveSystemPrompt = (systemPrompt: string) =>
  req<{ ok: true; systemPrompt: string }>('/api/settings/system-prompt', json('PATCH', { systemPrompt }))

export const getPlanPrompt = () => req<{ planPrompt: string }>('/api/settings/plan-prompt')
export const savePlanPrompt = (planPrompt: string) =>
  req<{ ok: true; planPrompt: string }>('/api/settings/plan-prompt', json('PATCH', { planPrompt }))

// Settings: retry
export const getRetrySettings = () => req<RetrySettings>('/api/settings/retry')
export const updateRetrySettings = (patch: Partial<RetrySettings>) =>
  req<RetrySettings>('/api/settings/retry', json('PATCH', patch))

// Skills
export const listSkills = () => req<Skill[]>('/api/settings/skills')
export const createSkill = (s: { name: string; note: string; mainFile: string; files: string[]; projectId?: string }) =>
  req<Skill>('/api/settings/skills', json('POST', s))
export const deleteSkill = (id: string) => req<{ ok: true }>(`/api/settings/skills/${id}`, { method: 'DELETE' })
export const updateSkill = (id: string, patch: Partial<{ name: string; note: string; mainFile: string; files: string[]; projectId?: string }>) =>
  req<Skill>(`/api/settings/skills/${id}`, json('PATCH', patch))

// MCP Servers
export const listMcpServers = () => req<MCPServer[]>('/api/settings/mcp')
export const getMcpServer = (id: string) => req<MCPServer>(`/api/settings/mcp/${id}`)
export const createMcpServer = (s: { name: string; transport: string; command?: string; args?: string[]; url?: string; env?: Record<string,string>; headers?: Record<string,string>; projectId?: string; enabled?: boolean }) =>
  req<MCPServer>('/api/settings/mcp', json('POST', s))
export const updateMcpServer = (id: string, patch: Partial<{ name: string; transport: string; command?: string; args?: string[]; url?: string; env?: Record<string,string>; headers?: Record<string,string>; projectId?: string; enabled?: boolean }>) =>
  req<MCPServer>(`/api/settings/mcp/${id}`, json('PATCH', patch))
export const deleteMcpServer = (id: string) => req<{ ok: true }>(`/api/settings/mcp/${id}`, { method: 'DELETE' })
export const testMcpServer = (id: string, overrides?: Record<string, unknown>) =>
  req<{ ok: boolean; error?: string; tools: { name: string; description?: string; inputSchema?: unknown }[] }>(`/api/settings/mcp/${id}/test`, json('POST', overrides ?? {}))
export const getMcpTools = (id: string) => req<{ tools: { name: string; description?: string; inputSchema?: unknown }[] }>(`/api/settings/mcp/${id}/tools`)
export const refreshMcpServer = (id: string) => req<{ ok: true; tools: { name: string; description?: string }[] }>(`/api/settings/mcp/${id}/refresh`, json('POST', {}))
export const getMcpStatusAll = () => req<MCPServer[]>('/api/settings/mcp/status/all')

// LSP Servers
export const listLspServers = () => req<LSPServer[]>('/api/settings/lsp')
export const getLspServer = (id: string) => req<LSPServer>(`/api/settings/lsp/${id}`)
export const createLspServer = (s: { name: string; language: string; transport: string; command?: string; args?: string[]; url?: string; env?: Record<string,string>; headers?: Record<string,string>; projectId?: string; enabled?: boolean }) =>
  req<LSPServer>('/api/settings/lsp', json('POST', s))
export const updateLspServer = (id: string, patch: Partial<{ name: string; language: string; transport: string; command?: string; args?: string[]; url?: string; env?: Record<string,string>; headers?: Record<string,string>; projectId?: string; enabled?: boolean }>) =>
  req<LSPServer>(`/api/settings/lsp/${id}`, json('PATCH', patch))
export const deleteLspServer = (id: string) => req<{ ok: true }>(`/api/settings/lsp/${id}`, { method: 'DELETE' })
export const testLspServer = (id: string, overrides?: Record<string, unknown>) =>
  req<{ ok: boolean; error?: string; capabilities?: Record<string, unknown> }>(`/api/settings/lsp/${id}/test`, json('POST', overrides ?? {}))
export const getLspCapabilities = (id: string) => req<{ capabilities: Record<string, unknown> | null }>(`/api/settings/lsp/${id}/capabilities`)
export const refreshLspServer = (id: string) => req<{ ok: true; capabilities?: Record<string, unknown> }>(`/api/settings/lsp/${id}/refresh`, json('POST', {}))
export const getLspStatusAll = () => req<LSPServer[]>('/api/settings/lsp/status/all')

// Plugins
export const listPlugins = () => req<Plugin[]>('/api/settings/plugins')
export const listMarketplacePlugins = () => req<MarketplacePlugin[]>('/api/settings/plugins/marketplace')
export const createPlugin = (p: { name: string; description: string; version: string; publisher?: string; entryPoint?: string; source?: string; marketplaceId?: string; enabled?: boolean; projectId?: string; tags?: string[]; icon?: string }) =>
  req<Plugin>('/api/settings/plugins', json('POST', p))
export const installMarketplacePlugin = (marketplaceId: string, opts?: { projectId?: string; enabled?: boolean; entryPoint?: string }) =>
  req<Plugin>('/api/settings/plugins/install', json('POST', { marketplaceId, ...opts }))
export const updatePlugin = (id: string, patch: Partial<{ name: string; description: string; version: string; publisher: string; entryPoint: string; source: string; marketplaceId: string; enabled: boolean; projectId: string; tags: string[]; icon: string }>) =>
  req<Plugin>(`/api/settings/plugins/${id}`, json('PATCH', patch))
export const deletePlugin = (id: string) => req<{ ok: true }>(`/api/settings/plugins/${id}`, { method: 'DELETE' })
