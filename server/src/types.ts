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
  createdAt: number
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

export interface SkillInfo {
  name: string
  description: string
  path: string
  source: string
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
}

export interface LspServerInfo {
  name: string
  command: string
  extensions: string[]
  languageId: string
  status: 'stopped' | 'starting' | 'ready' | 'error'
  error?: string
}

export interface AgentEvent {
  type:
    | 'step'
    | 'assistant_start'
    | 'token'
    | 'reasoning'
    | 'tool_start'
    | 'tool_end'
    | 'done'
    | 'error'
  [key: string]: unknown
}

export interface ToolResult {
  ok: boolean
  output: string
}
