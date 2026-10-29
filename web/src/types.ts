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

export type ExtensionKind = 'skill' | 'mcp' | 'lsp'

export interface SkillInfo {
  name: string
  description: string
  path: string
  source: string
  writable: boolean
  projects: string[]
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
  projects: string[]
}

export interface LspServerInfo {
  name: string
  command: string
  extensions: string[]
  languageId: string
  status: 'stopped' | 'starting' | 'ready' | 'error'
  error?: string
  projects: string[]
}

export interface ChatExtensionsState {
  skills: Array<SkillInfo & { enabled: boolean }>
  mcpServers: Array<McpServerInfo & { enabled: boolean }>
  lspServers: Array<LspServerInfo & { enabled: boolean }>
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
  | { type: 'done'; message?: Message; aborted?: boolean; maxStepsReached?: boolean }
  | { type: 'error'; error: string }

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
