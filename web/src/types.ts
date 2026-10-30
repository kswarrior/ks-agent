export interface Project {
  id: string
  name: string
  path: string
  createdAt: number
}

export type ProjectCreateMode = 'new' | 'link' | 'copy' | 'move'

export interface CreateProjectInput {
  name: string
  path?: string
  sourcePath?: string
  mode?: ProjectCreateMode
}

export interface DirectoryListing {
  path: string
  parent: string | null
  directories: Array<{ name: string; path: string }>
  truncated: boolean
  home: string
  projectsDir: string
  root: string
}

export interface FileEntry {
  name: string
  type: 'dir' | 'file'
  size?: number
}

export interface FileListing {
  path: string
  entries: FileEntry[]
}

export interface FileContent {
  path: string
  size: number
  binary: boolean
  content: string
}

export interface Chat {
  id: string
  projectId: string
  title: string
  modelId: string | null
  createdAt: number
  updatedAt: number
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface Message {
  id: string
  chatId: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls: ToolCall[] | null
  toolCallId: string | null
  modelId: string | null
  durationMs: number | null
  createdAt: number
}

export interface ChatSummary {
  chatId: string
  summary: string
  coveredMessageId: string
  updatedAt: number
}

export interface ProviderPublic {
  id: string
  name: string
  baseUrl: string
  hasKey: boolean
  createdAt: number
}

export interface ModelEntry {
  id: string
  providerId: string
  name: string
  modelId: string
  contextWindow: number
  createdAt: number
  providerName?: string
}

export interface ExtensionTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ExtensionInfo {
  name: string
  version: string
  description: string
  tools: ExtensionTool[]
  hooks: string[]
  status: 'stopped' | 'starting' | 'ready' | 'error'
  error?: string
}

export type KnowledgeScope = 'global' | 'project'
export type KnowledgeSource = 'manual' | 'generated'

export interface KnowledgeEntry {
  id: string
  scope: KnowledgeScope
  projectId: string | null
  title: string
  content: string
  enabled: boolean
  source: KnowledgeSource
  createdAt: number
  updatedAt: number
}

export interface ChatKnowledgeInfo {
  id: string
  scope: KnowledgeScope
  projectId: string | null
  title: string
  source: KnowledgeSource
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export type KnowledgeJobStatus = 'running' | 'completed' | 'error'

export interface KnowledgeJob {
  id: string
  projectId: string
  modelId?: string
  status: KnowledgeJobStatus
  startedAt: number
  finishedAt?: number
  entryId?: string
  error?: string
}

export type ExtensionKind = 'skill' | 'mcp' | 'lsp' | 'knowledge'

export interface SkillInfo {
  name: string
  description: string
  path: string
  source: string
  writable: boolean
  projects: string[]
}

export interface SkillDetail extends SkillInfo {
  content: string
}

export interface McpToolInfo {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpServerInfo {
  name: string
  transport: 'stdio' | 'http' | 'sse'
  tools: McpToolInfo[]
  status: 'stopped' | 'starting' | 'ready' | 'error'
  error?: string
  installCommand?: string
  projects: string[]
}

export interface McpServerDetail extends McpServerInfo {
  command?: string
  args: string[]
  env: Record<string, string>
  cwd?: string
  url?: string
  headers: Record<string, string>
  timeoutMs: number
}

export interface LspServerInfo {
  name: string
  command: string
  extensions: string[]
  languageId: string
  installCommand?: string
  status: 'stopped' | 'starting' | 'ready' | 'error'
  error?: string
  projects: string[]
}

export interface LspServerDetail extends LspServerInfo {
  args: string[]
  env: Record<string, string>
  initializationOptions?: Record<string, unknown>
}

export interface ChatExtensionsState {
  skills: Array<SkillInfo & { enabled: boolean }>
  knowledge: ChatKnowledgeInfo[]
  mcpServers: Array<McpServerInfo & { enabled: boolean }>
  lspServers: Array<LspServerInfo & { enabled: boolean }>
}

export interface RetrySettings {
  enabled: boolean
  unlimited: boolean
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  multiplier: number
  jitter: boolean
  retryOnNetwork: boolean
  retryOnServerErrors: boolean
  retryOnStatusCodes: number[]
  honorRetryAfter: boolean
}

export interface DatabaseSettings {
  path: string
  directory: string
  defaultPath: string
  defaultDirectory: string
  sizeBytes: number
  managedByEnv: boolean
}

export interface FailureInfo {
  message: string
  status?: number
  code?: string
  title?: string
  details?: string
  retryAfterMs?: number
  attempts?: number
  retryable?: boolean
}

export interface RetryStatus extends FailureInfo {
  attempt: number
  maxAttempts: number | null
  delayMs: number
  nextAt: number
  unlimited: boolean
}

export type AgentEvent =
  | { type: 'step'; step: number; maxSteps: number }
  | { type: 'assistant_start'; step: number }
  | { type: 'token'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_start'; call: { id: string; name: string; arguments: string } }
  | {
      type: 'tool_end'
      call: { id: string; name: string; arguments: string }
      result: { ok: boolean; output: string }
      durationMs: number
    }
  | ({ type: 'retry' } & RetryStatus)
  | { type: 'summary_start'; estimatedTokens: number; contextWindow: number }
  | { type: 'summary'; summary: ChatSummary }
  | { type: 'summary_error'; message: string }
  | { type: 'done'; message?: Message; aborted?: boolean; maxStepsReached?: boolean }
  | ({ type: 'error'; error: string } & FailureInfo)

export interface LiveTool {
  id: string
  name: string
  arguments: string
  status: 'running' | 'ok' | 'error'
  output?: string
  durationMs?: number
}

export interface LiveState {
  content: string
  reasoning: string
  tools: LiveTool[]
  step: number
}

export interface RunStepTool {
  id: string
  name: string
  arguments?: string
  status: 'running' | 'ok' | 'error'
  durationMs?: number
}

export interface RunStep {
  step: number
  content: string
  tools: RunStepTool[]
  status: 'running' | 'done' | 'error'
  startedAt: number
  durationMs?: number
}
