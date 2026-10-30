export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface Project {
  id: string
  name: string
  path: string
  createdAt: number
}

export type BackupSource = 'created' | 'uploaded' | 'url'

export interface Backup {
  id: string
  projectId: string
  name: string
  path: string
  size: number
  includesChats: boolean
  source: BackupSource
  createdAt: number
  exists: boolean
}

export interface Chat {
  id: string
  projectId: string
  title: string
  modelId: string | null
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  chatId: string
  role: Role
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

export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  createdAt: number
}

export interface ProviderPublic extends Omit<Provider, 'apiKey'> {
  hasKey: boolean
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

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ExtensionTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ExtensionManifest {
  name: string
  version: string
  description: string
  command: string[]
  tools: ExtensionTool[]
  hooks: string[]
  timeoutMs: number
  permissions: {
    shell: boolean
    network: boolean
    projectWrite: boolean
  }
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

export interface AgentEvent {
  type:
    | 'step'
    | 'assistant_start'
    | 'token'
    | 'reasoning'
    | 'tool_start'
    | 'tool_end'
    | 'retry'
    | 'summary_start'
    | 'summary'
    | 'summary_error'
    | 'done'
    | 'error'
  [key: string]: unknown
}

export interface ToolResult {
  ok: boolean
  output: string
}
