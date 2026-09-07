import type { Activity, Chat, FileListing, LSPServer, MCPServer, MarketplacePlugin, Message, ModelEntry, Plan, Plugin, Preview, Project, Provider, Question, RetrySettings, ThemeSettings, Skill, Terminal } from './types'

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
  modelId: string | null,
  mode?: string | null
): Promise<{ userMsgId: string; assistantId: string; model: string }> {
  const res = await fetch(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, modelId, ...(mode ? { mode } : {}) })
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
  modelId?: string | null,
  mode?: string | null
): Promise<{ userMsgId?: string; assistantId: string; model: string; continued?: boolean; content?: string }> {
  const res = await fetch(`/api/chats/${chatId}/continue`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: content ?? '', modelId: modelId ?? null, ...(mode ? { mode } : {}) })
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
  onThinking?: (text: string) => void
  onTool?: (tool: { callId: string; name: string; args: string }) => void
  onToolResult?: (result: { callId: string; ok: boolean; summary: string; result?: string }) => void
  onPlan?: (plan: Plan) => void
  onQuestion?: (question: Question) => void
  onChatTitle?: (data: { chatId: string; title: string; seq?: number }) => void
  onPreview?: (preview: Preview) => void
  onSubAgent?: (sub: import('./types').SubAgent) => void
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
            case 'thinking': {
              const t = typeof parsed === 'string' ? parsed : (parsed?.text ?? '')
              if (t) handlers.onThinking?.(t)
              break
            }
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
            case 'subagent':
              handlers.onSubAgent?.(parsed as import('./types').SubAgent)
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

// Sub-agents / Teams — 5 Modes Solo/Swarm/Hive/Squad/Infinity
export const listSubAgents = (chatId: string) => req<import('./types').SubAgent[]>(`/api/chats/${chatId}/subagents`)
export const listTeams = (chatId: string) => req<import('./types').Team[]>(`/api/chats/${chatId}/teams`)
export const createTeam = (chatId: string, name: string, headId?: string | null) =>
  req<import('./types').Team>(`/api/chats/${chatId}/teams`, json('POST', { name, headId: headId ?? null }))

// Activities
export const listActivities = (chatId: string) => req<Activity[]>(`/api/chats/${chatId}/activities`)
export const getSkillStatus = (chatId: string) => req<{ hasAnyRead: boolean; status: Record<string, boolean>; detailed: Array<{ id: string; name: string; mainFile: string; files: string[]; read: boolean; filesRead: Array<{ file: string; read: boolean }> }> }>(`/api/chats/${chatId}/skill-status`)

// Previews (per chat, like plan)
export const getChatPreview = (chatId: string) => req<Preview | null>(`/api/chats/${chatId}/preview`)
export const setChatPreview = (chatId: string, port: number) => req<Preview>(`/api/chats/${chatId}/preview`, json('PUT', { port }))
export const deleteChatPreview = (chatId: string) => req<{ ok: true }>(`/api/chats/${chatId}/preview`, { method: 'DELETE' })
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

// Settings: theme
export const getThemeSettings = () => req<ThemeSettings>('/api/settings/theme')
export const updateThemeSettings = (patch: Partial<ThemeSettings>) =>
  req<ThemeSettings>('/api/settings/theme', json('PATCH', patch))

// Skills
export const listSkills = () => req<Skill[]>('/api/settings/skills')
export const createSkill = (s: { name: string; note: string; mainFile: string; files: string[]; projectId?: string }) =>
  req<Skill>('/api/settings/skills', json('POST', s))
export const deleteSkill = (id: string) => req<{ ok: true }>(`/api/settings/skills/${id}`, { method: 'DELETE' })

// Semantic Search (hybrid grep + TF-IDF cosine) — server/src/store.ts:embeddings, server/src/agent.ts:semantic_search
export type SemanticHit = { path: string; score: number; snippet?: string; source: 'vector' | 'bm25' | 'grep' | 'hybrid' | 'semantic' }
export const semanticSearch = (projectId: string, query: string, opts?: { limit?: number; include?: string }) =>
  req<{ query: string; hits: SemanticHit[]; total: number; embeddingCount: number; fallback: boolean }>(`/api/projects/${projectId}/search/semantic`, json('POST', { query, limit: opts?.limit ?? 20, include: opts?.include ?? null }))
export const semanticSearchGet = (projectId: string, query: string, opts?: { limit?: number; include?: string }) => {
  const qs = new URLSearchParams({ q: query })
  if (opts?.limit) qs.set('limit', String(opts.limit))
  if (opts?.include) qs.set('include', opts.include)
  return req<{ query: string; hits: SemanticHit[]; total: number; embeddingCount: number; fallback: boolean }>(`/api/projects/${projectId}/search/semantic?${qs.toString()}`)
}
export const rebuildSemanticIndex = (projectId: string) =>
  req<{ ok: true; indexed: number; embeddingCount: number }>(`/api/projects/${projectId}/search/index`, json('POST', {}))
export const clearSemanticIndex = (projectId: string) =>
  req<{ ok: true; embeddingCount: number }>(`/api/projects/${projectId}/search/index`, { method: 'DELETE' })
export const getEmbeddingSettings = () => req<{ provider: string; baseUrl?: string; model?: string; dimensions?: number; enabled?: boolean; keyPreview?: string }>('/api/settings/embeddings')
export const updateEmbeddingSettings = (patch: Partial<{ provider: string; baseUrl: string; apiKey: string; model: string; dimensions: number; enabled: boolean }>) =>
  req<{ provider: string; baseUrl?: string; model?: string; dimensions?: number; enabled?: boolean; keyPreview: string }>('/api/settings/embeddings', json('PATCH', patch))

export const getSemanticStatus = (projectId: string) =>
  req<{ projectId: string; embeddingCount: number; hasEmbeddings: boolean }>(`/api/projects/${projectId}/search/status`)
export const updateSkill = (id: string, patch: Partial<{ name: string; note: string; mainFile: string; files: string[]; projectId?: string }>) =>
  req<Skill>(`/api/settings/skills/${id}`, json('PATCH', patch))
export const createSkillFile = (path: string, content: string) =>
  req<{ ok: true; path: string }>('/api/settings/skills/files', json('POST', { path, content }))

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

// IDE — inline autocomplete & inline chat
export const getIdeStatus = () => req<{ ready: boolean; hasProvider: boolean; hasModel: boolean; providerCount: number; modelCount: number; features: { autocomplete: boolean; inlineChat: boolean; vsCodeExtension: boolean }; vscodeExtension: { name: string; publisher: string; localPath: string; install: string; commands: string[] } }>('/api/ide/status')
export const ideComplete = (p: { projectId?: string; filePath?: string; prefix: string; suffix?: string; language?: string; modelId?: string }) =>
  req<{ completion: string; model: string; language?: string; filePath: string | null }>('/api/ide/complete', json('POST', p))
export const ideInlineChat = (p: { projectId?: string; filePath?: string; selection: string; instruction: string; surroundingContext?: string; modelId?: string }) =>
  req<{ result: string; model: string; filePath: string | null }>('/api/ide/inline-chat', json('POST', p))

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
export const publishPlugin = (id: string) => req<{ ok: true; bundle: { manifest: Record<string, unknown>; files: Record<string, string>; exportedAt: string; pluginId: string }; marketplace: MarketplacePlugin }>(`/api/settings/plugins/${id}/publish`, json('POST', {}))
export const exportPlugin = (id: string) => req<{ manifest: Record<string, unknown>; files: Record<string, string>; exportedAt: string; pluginId: string }>(`/api/settings/plugins/${id}/export`)
export const publishSkill = (id: string) => req<{ ok: true; bundle: { manifest: Record<string, unknown>; files: Record<string, string>; exportedAt: string; skillId: string }; marketplace: MarketplacePlugin }>(`/api/settings/skills/${id}/publish`, json('POST', {}))

// GitHub PAT + Polling — vs.md:98 "🔶 via shell gh pr create" only run_shell (server/src/agent.ts:341). Need GITHUB_TOKEN stored like Provider.apiKey (store.ts:40, index.ts:236 ••••, store.ts:277 chmod 600, WAL busy_timeout 10000) + user-set interval, fully customizable.
export const getGithubSettings = (projectId?: string) => {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
  return req<import('./types').GithubTokenInfo>(`/api/settings/github${qs}`)
}
export const saveGithubToken = (token: string, projectId?: string) => req<{ ok: true; masked: string; keyPreview: string; hasToken: boolean }>(`/api/settings/github`, json('POST', { token, projectId: projectId || undefined }))
export const deleteGithubToken = (projectId?: string) => {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
  return req<{ ok: true }>(`/api/settings/github${qs}`, { method: 'DELETE' } as any)
}
export const testGithubToken = (token?: string, projectId?: string) => req<{ ok: boolean; user?: string | null; remaining?: number | null; error?: string }>(`/api/settings/github/test`, json('POST', { token: token ?? undefined, projectId: projectId || undefined }))
export const getGithubPollSettings = (projectId?: string) => {
  const qs = projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''
  return req<import('./types').GithubPollSettings>(`/api/settings/github/poll${qs}`)
}
export const updateGithubPollSettings = (patch: Partial<import('./types').GithubPollSettings> & { projectId?: string }) => req<import('./types').GithubPollSettings>(`/api/settings/github/poll`, json('PUT', patch))
export const getGithubRateLimit = (projectId: string) => req<import('./types').GithubRateLimit>(`/api/projects/${projectId}/github/rate-limit`)
export const pollGithubNow = (projectId: string) => req<{ ok: true }>(`/api/projects/${projectId}/github/poll-now`, json('POST', {}))
export const setGithubFocus = (projectId: string, focused: boolean, windowFocused?: boolean) => req<{ ok: true }>(`/api/projects/${projectId}/github/focus`, json('POST', { focused, windowFocused }))
export const getGithubDiff = (projectId: string, opts?: { pr?: string; repo?: string }) => {
  const qs = new URLSearchParams()
  if (opts?.pr) qs.set('pr', opts.pr)
  if (opts?.repo) qs.set('repo', opts.repo)
  const q = qs.toString() ? `?${qs.toString()}` : ''
  return req<{ data: any; etag?: string; fromCache?: boolean }>(`/api/projects/${projectId}/github/diff${q}`)
}
export const getGithubPr = (projectId: string, repo?: string) => {
  const qs = repo ? `?repo=${encodeURIComponent(repo)}` : ''
  return req<{ data: any }>(`/api/projects/${projectId}/github/pr${qs}`)
}
export const getGithubCommits = (projectId: string, repo?: string) => {
  const qs = repo ? `?repo=${encodeURIComponent(repo)}` : ''
  return req<{ data: any }>(`/api/projects/${projectId}/github/commits${qs}`)
}
