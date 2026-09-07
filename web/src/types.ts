export interface Project {
  id: string
  name: string
  path: string
  createdAt: string
}

export interface Chat {
  id: string
  projectId: string
  title: string
  seq?: number
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  chatId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: string
  error?: boolean
  model?: string
  modelDisplayName?: string
  providerName?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
}

export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  keyPreview?: string
}

export interface ModelEntry {
  id: string
  model: string
  displayName?: string
  providerId: string
  providerName: string
  maxTokens?: number
  systemPrompt?: string
}

export interface FileEntry {
  name: string
  type: 'file' | 'dir'
  size?: number
}

export interface FileListing {
  path: string
  entries: FileEntry[]
}

export type PlanStepStatus = 'pending' | 'working' | 'done'

export interface PlanStep {
  id: string
  title: string
  status: PlanStepStatus
}

export interface Plan {
  id: string
  chatId: string
  title: string
  steps: PlanStep[]
  createdAt: string
  updatedAt: string
}

export interface Terminal {
  id: string
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface RetrySettings {
  enabled: boolean
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  retryOnStatusCodes: number[]
  stopOnStatusCodes: number[]
  alwaysRetry?: boolean
  autoContinueEnabled?: boolean
  autoContinueDelayMs?: number
  autoContinueMaxAttempts?: number
  autoContinueOnPlanIncomplete?: boolean
}

export interface ThemeSettings {
  primary: string
  danger: string
  background: string
  radius: number
}

export type SkillRole = 'must' | 'recommended' | 'optional'

export interface Skill {
  id: string
  name: string
  note: string
  mainFile: string
  files: string[]
  projectId?: string
  role?: SkillRole
  triggers?: string
  createdAt: string
  updatedAt?: string
}

export type ActivityToolType = 'read_file' | 'write_file' | 'edit_file' | 'run_shell' | 'list_files' | 'grep' | 'glob' | 'create_plan' | 'complete_plan_step' | 'ask_question' | 'open_preview' | 'get_file_info' | 'delete_file' | 'move_file' | 'append_file' | 'apply_patch' | string

export type MCPTransport = 'stdio' | 'sse' | 'http' | 'websocket'

export interface MCPTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface MCPServer {
  id: string
  name: string
  transport: MCPTransport
  command?: string | null
  args?: string[]
  url?: string | null
  env?: Record<string, string>
  headers?: Record<string, string>
  projectId?: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
  connected: boolean
  connecting: boolean
  error?: string | null
  tools: MCPTool[]
  lastConnectedAt?: string | null
}

export type LSPTransport = 'stdio' | 'tcp' | 'socket' | 'websocket' | 'http' | 'sse'

export interface LSPServer {
  id: string
  name: string
  language: string
  transport: LSPTransport
  command?: string | null
  args?: string[]
  url?: string | null
  env?: Record<string, string>
  headers?: Record<string, string>
  projectId?: string | null
  enabled: boolean
  createdAt: string
  updatedAt: string
  connected: boolean
  connecting: boolean
  error?: string | null
  capabilities?: Record<string, unknown> | null
  lastConnectedAt?: string | null
}

// Backwards compat alias
export type LspServer = LSPServer
export type LspTransport = LSPTransport

export type PluginSource = 'manual' | 'marketplace' | 'local' | 'url'

export interface Plugin {
  id: string
  name: string
  description: string
  version: string
  publisher?: string
  entryPoint?: string | null
  source: PluginSource
  marketplaceId?: string | null
  enabled: boolean
  projectId?: string | null
  tags?: string[]
  icon?: string | null
  createdAt: string
  updatedAt: string
}

export interface MarketplacePlugin {
  id: string
  name: string
  description: string
  version: string
  publisher: string
  icon: string
  tags: string[]
  downloads: number
  rating: number
  category: string
  installed?: boolean
}

export interface Preview {
  id: string
  chatId: string
  port: number
  createdAt: string
  updatedAt: string
}

export interface Question {
  id: string
  chatId: string
  header: string
  question: string
  options: string[]
  allowCustom: boolean
  customPlaceholder?: string
  status: 'pending' | 'answered'
  answer?: string
  selectedOption?: string | null
  createdAt: string
  answeredAt?: string
  toolCallId?: string
}

export interface Activity {
  id: string
  chatId: string
  toolType: ActivityToolType
  toolCallId: string
  args: Record<string, unknown>
  summary: string
  result?: string
  ok?: boolean
  timestamp: string
  expanded?: boolean
}

export type SubAgentMode = 'research' | 'explore' | 'fix' | 'write' | 'general'
export type SubAgentStatus = 'pending' | 'working' | 'done' | 'error'

export interface SubAgent {
  id: string
  parentChatId: string
  parentSubAgentId?: string | null
  teamId?: string | null
  task: string
  mode: SubAgentMode
  status: SubAgentStatus
  worktreePath?: string | null
  modelId?: string | null
  result?: string | null
  createdAt: string
  updatedAt: string
}

export interface Team {
  id: string
  name: string
  chatId: string
  headId?: string | null
  createdAt: string
  updatedAt: string
}

export interface SubAgentMessage {
  id: string
  subAgentId: string
  parentChatId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  createdAt: string
  toolCallId?: string | null
  toolName?: string | null
}

export type ActiveAgentView =
  | { kind: 'main' }
  | { kind: 'subagent'; id: string }
  | { kind: 'team'; id: string }

export interface GithubTokenInfo {
  hasToken: boolean
  masked: string
  keyPreview: string
  source: string
  projectId: string | null
}

export interface GithubPollSettings {
  enabled: boolean
  mode: 'interval' | 'cron' | 'event' | 'manual'
  intervalMs: number
  cronExpr: string | null
  endpoints: { diff: boolean; pr: boolean; commits: boolean; actions: boolean }
  perEndpointInterval: { diffMs: number; prMs: number; commitsMs?: number; actionsMs?: number }
  pollOnFocusOnly: boolean
  pauseOnWindowBlur: boolean
  useEtag: boolean
  respectRateLimit: boolean
  smartEventOnly: boolean
  jitterMs: number
  maxRetries: number
  minIntervalMs: number
  maxIntervalMs: number
  webhookUrl?: string | null
  effectiveIntervalMs?: number
  rateLimit?: { remaining: number; resetAt: string | null; effectiveIntervalMs: number; nextPollAt: string | null; etagHitRate: number }
}

export interface GithubRateLimit {
  projectId: string
  remaining: number
  limit: number
  resetAt: string | null
  resetAtMs: number
  effectiveIntervalMs: number
  intervalMs: number
  nextPollAt: string | null
  nextPollAtMs: number | null
  etagHitRate: number
  throttled: boolean
  throttledMsg: string | null
  useEtag: boolean
  respectRateLimit: boolean
  mode: string
}
