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
}

export interface Skill {
  id: string
  name: string
  note: string
  mainFile: string
  files: string[]
  projectId?: string
  createdAt: string
  updatedAt?: string
}

export type ActivityToolType = 'read_file' | 'write_file' | 'edit_file' | 'run_shell' | 'list_files' | 'create_plan' | 'complete_plan_step' | 'ask_question' | 'open_preview' | string

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
