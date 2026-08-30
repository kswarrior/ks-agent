import { spawn, type ChildProcess } from 'node:child_process'
import type { ToolDef } from './llm.js'
import type { MCPServer, MCPTransport } from './store.js'
import { findMcpServer, getDb } from './store.js'

// ---------------- Types ----------------

export interface MCPTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

interface MCPClient {
  listTools(): Promise<MCPTool[]>
  callTool(name: string, args: Record<string, unknown>): Promise<{ content: unknown; isError?: boolean }>
  close(): void
}

interface ServerState {
  server: MCPServer
  client: MCPClient | null
  tools: MCPTool[]
  connected: boolean
  connecting: boolean
  error?: string
  lastConnectedAt?: string
}

// In-memory state
const states = new Map<string, ServerState>()

// Map full tool name -> { serverId, originalName }
const toolMap = new Map<string, { serverId: string; toolName: string }>()

// ---------------- Helpers ----------------

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 32) || 'srv'
}

function toolFullName(server: MCPServer, toolName: string): string {
  const srv = sanitizeSegment(server.name).toLowerCase()
  const t = toolName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
  // Use server id suffix to guarantee uniqueness, but keep name readable
  const suffix = server.id.slice(0, 8).replace(/-/g, '_')
  // OpenAI tool name must be ^[a-zA-Z0-9_-]{1,64}
  let full = `mcp_${srv}_${t}_${suffix}`
  if (full.length > 64) full = full.slice(0, 64)
  // Ensure not duplicate due to truncation: if collision, fallback to id-based
  return full
}

function rebuildToolMap(): void {
  toolMap.clear()
  for (const [id, st] of states) {
    if (!st.connected || !st.server.enabled) continue
    for (const tool of st.tools) {
      const full = toolFullName(st.server, tool.name)
      toolMap.set(full, { serverId: id, toolName: tool.name })
    }
  }
}

function projectMatches(server: MCPServer, projectId?: string): boolean {
  if (!server.enabled) return false
  if (!server.projectId) return true // global
  if (!projectId) return false
  return server.projectId === projectId
}

// ---------------- Stdio client ----------------

class StdioMCPClient implements MCPClient {
  private proc: ChildProcess
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }>()
  private nextId = 1
  private buffer = ''
  private closed = false

  constructor(
    private command: string,
    private args: string[],
    private env: Record<string, string> | undefined
  ) {
    const spawnEnv = { ...process.env, ...(env ?? {}) } as Record<string, string>
    this.proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: spawnEnv,
      shell: false
    })
    this.proc.stdout?.on('data', (chunk: Buffer) => this.onData(chunk.toString('utf8')))
    this.proc.stderr?.on('data', () => {
      // ignore stderr logs; useful for debugging but not fatal
    })
    this.proc.stdin?.on('error', () => {
      // EPIPE after process exit is expected (e.g. dummy echo server); prevent unhandled error crash
    })
    this.proc.on('error', (err) => this.failAll(err))
    this.proc.on('exit', (code) => {
      if (!this.closed) {
        const err = new Error(`MCP stdio process exited with code ${code ?? 'unknown'}`)
        this.failAll(err)
      }
    })
  }

  private onData(data: string): void {
    this.buffer += data
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      if (!line) continue
      let msg: any
      try {
        msg = JSON.parse(line)
      } catch {
        continue
      }
      if (msg.id != null && this.pending.has(msg.id)) {
        const entry = this.pending.get(msg.id)!
        this.pending.delete(msg.id)
        clearTimeout(entry.timeout)
        if (msg.error) {
          const errMsg = msg.error?.message ? String(msg.error.message) : JSON.stringify(msg.error)
          entry.reject(new Error(errMsg))
        } else {
          entry.resolve(msg.result)
        }
      }
    }
  }

  private failAll(err: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timeout)
      entry.reject(err)
    }
    this.pending.clear()
  }

  private request(method: string, params: unknown, timeoutMs = 15000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('Client closed'))
    const id = this.nextId++
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request timeout (${method})`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      try {
        this.proc.stdin!.write(payload, (e) => {
          if (e) {
            clearTimeout(timeout)
            this.pending.delete(id)
            reject(e)
          }
        })
      } catch (e: any) {
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(e)
      }
    })
  }

  private notify(method: string, params: unknown): void {
    if (this.closed) return
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n'
    try { this.proc.stdin!.write(payload) } catch {}
  }

  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ks-agent', version: '0.1.0' }
    }, 10000)
    this.notify('notifications/initialized', {})
    // small delay to let server process initialized
    await new Promise((r) => setTimeout(r, 100))
  }

  async listTools(): Promise<MCPTool[]> {
    const res = await this.request('tools/list', {}, 10000)
    const tools = Array.isArray(res?.tools) ? res.tools : []
    return tools.map((t: any) => ({
      name: String(t.name ?? ''),
      description: typeof t.description === 'string' ? t.description : undefined,
      inputSchema: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema as Record<string, unknown> : undefined
    })).filter((t: MCPTool) => !!t.name)
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ content: unknown; isError?: boolean }> {
    const res = await this.request('tools/call', { name, arguments: args }, 30000)
    // MCP tools/call returns { content: [{type, text}], isError }
    return res as any
  }

  close(): void {
    this.closed = true
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timeout)
      entry.reject(new Error('Client closed'))
    }
    this.pending.clear()
    try { this.proc.stdin?.end() } catch {}
    try { this.proc.kill() } catch {}
  }
}

// ---------------- HTTP / SSE client ----------------

class HttpMCPClient implements MCPClient {
  constructor(
    private url: string,
    private headers: Record<string, string> | undefined,
    private transport: MCPTransport
  ) {}

  private async rpc(method: string, params: unknown, timeoutMs = 15000): Promise<any> {
    const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now() + Math.floor(Math.random() * 10000), method, params })
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          ...(this.headers ?? {})
        },
        body,
        signal: controller.signal
      })
      if (!res.ok) {
        const txt = await res.text().catch(() => '').then((s) => s.slice(0, 500))
        throw new Error(`MCP HTTP ${res.status}: ${txt}`)
      }
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('text/event-stream')) {
        const text = await res.text()
        // SSE: find last data: line with JSON
        const lines = text.split('\n')
        for (let i = lines.length - 1; i >= 0; i--) {
          const l = lines[i].trim()
          if (l.startsWith('data:')) {
            const payload = l.slice(5).trim()
            if (!payload) continue
            try {
              const obj = JSON.parse(payload)
              if (obj.error) throw new Error(obj.error.message || JSON.stringify(obj.error))
              return obj.result ?? obj
            } catch (e: any) {
              if (e?.message && !e.message.includes('Unexpected token')) throw e
            }
          }
        }
        // fallback: try parse whole body as JSON
        try {
          const obj = JSON.parse(text)
          if (obj.error) throw new Error(obj.error.message || JSON.stringify(obj.error))
          return obj.result ?? obj
        } catch {
          throw new Error('Invalid SSE response from MCP server')
        }
      }
      const json: any = await res.json().catch(async () => {
        const txt = await res.text()
        throw new Error(`Invalid JSON from MCP server: ${txt.slice(0, 200)}`)
      })
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
      return json.result ?? json
    } finally {
      clearTimeout(t)
    }
  }

  async initialize(): Promise<void> {
    await this.rpc('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ks-agent', version: '0.1.0' }
    }, 10000)
    // notify may not be needed over HTTP, but try
    try { await this.rpc('notifications/initialized', {}, 3000) } catch {}
  }

  async listTools(): Promise<MCPTool[]> {
    const res = await this.rpc('tools/list', {}, 10000)
    const tools = Array.isArray(res?.tools) ? res.tools : []
    return tools.map((t: any) => ({
      name: String(t.name ?? ''),
      description: typeof t.description === 'string' ? t.description : undefined,
      inputSchema: t.inputSchema && typeof t.inputSchema === 'object' ? t.inputSchema as Record<string, unknown> : undefined
    })).filter((t: MCPTool) => !!t.name)
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ content: unknown; isError?: boolean }> {
    const res = await this.rpc('tools/call', { name, arguments: args }, 30000)
    return res as any
  }

  close(): void {
    // nothing to close for HTTP
  }
}

// ---------------- Public API ----------------

function createClient(server: MCPServer): MCPClient {
  if (server.transport === 'stdio') {
    if (!server.command) throw new Error('stdio transport requires command')
    return new StdioMCPClient(server.command, server.args ?? [], server.env)
  }
  if (server.transport === 'sse' || server.transport === 'http' || server.transport === 'websocket') {
    if (!server.url) throw new Error(`${server.transport} transport requires url`)
    return new HttpMCPClient(server.url, server.headers, server.transport)
  }
  throw new Error(`Unsupported transport: ${server.transport}`)
}

export async function connectMCPServer(server: MCPServer): Promise<{ ok: boolean; tools?: MCPTool[]; error?: string }> {
  let st = states.get(server.id)
  if (!st) {
    st = { server, client: null, tools: [], connected: false, connecting: false }
    states.set(server.id, st)
  } else {
    st.server = server
  }
  if (st.connecting) return { ok: false, error: 'Already connecting' }
  if (st.client) {
    try { st.client.close() } catch {}
    st.client = null
  }
  st.connecting = true
  st.error = undefined
  try {
    const client = createClient(server)
    if ('initialize' in client) {
      // both clients have initialize, but interface doesn't expose it; call via any
      await (client as any).initialize()
    }
    const tools = await client.listTools()
    st.client = client
    st.tools = tools
    st.connected = true
    st.lastConnectedAt = new Date().toISOString()
    st.error = undefined
    rebuildToolMap()
    return { ok: true, tools }
  } catch (e: any) {
    const msg = String(e?.message || e)
    st.connected = false
    st.tools = []
    st.error = msg.slice(0, 800)
    if (st.client) { try { st.client.close() } catch {} ; st.client = null }
    rebuildToolMap()
    return { ok: false, error: st.error }
  } finally {
    st.connecting = false
  }
}

export function disconnectMCPServer(id: string): void {
  const st = states.get(id)
  if (!st) return
  if (st.client) { try { st.client.close() } catch {} ; st.client = null }
  st.connected = false
  st.connecting = false
  st.tools = []
  rebuildToolMap()
}

export function disconnectAllMCP(): void {
  for (const [id] of states) disconnectMCPServer(id)
}

export async function refreshMCPServer(id: string): Promise<{ ok: boolean; tools?: MCPTool[]; error?: string }> {
  const server = findMcpServer(id)
  if (!server) return { ok: false, error: 'MCP server not found' }
  if (!server.enabled) return { ok: false, error: 'Server is disabled' }
  disconnectMCPServer(id)
  return connectMCPServer(server)
}

export async function testMCPServer(server: MCPServer): Promise<{ ok: boolean; tools?: MCPTool[]; error?: string }> {
  // Test connection without persisting state side-effects beyond temporary client
  let client: MCPClient | null = null
  try {
    client = createClient(server)
    await (client as any).initialize()
    const tools = await client.listTools()
    return { ok: true, tools }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 800) }
  } finally {
    if (client) try { client.close() } catch {}
  }
}

export function getMCPServerState(id: string): ServerState | undefined {
  return states.get(id)
}

export function getAllMCPStates(): ServerState[] {
  return [...states.values()]
}

export function syncMCPStatesFromDb(): void {
  // Remove states for deleted servers
  const validIds = new Set(getDb().mcpServers.map((s) => s.id))
  for (const id of [...states.keys()]) {
    if (!validIds.has(id)) {
      disconnectMCPServer(id)
      states.delete(id)
    }
  }
  // Update server refs
  for (const srv of getDb().mcpServers) {
    const st = states.get(srv.id)
    if (st) st.server = srv
    else {
      states.set(srv.id, { server: srv, client: null, tools: [], connected: false, connecting: false })
    }
  }
}

export async function ensureMCPConnections(): Promise<void> {
  syncMCPStatesFromDb()
  const promises: Promise<any>[] = []
  for (const srv of getDb().mcpServers) {
    if (!srv.enabled) {
      const st = states.get(srv.id)
      if (st?.connected) disconnectMCPServer(srv.id)
      continue
    }
    const st = states.get(srv.id)
    if (st?.connected || st?.connecting) continue
    promises.push(connectMCPServer(srv).catch(() => {}))
  }
  await Promise.all(promises)
}

export function getMCPTools(projectId?: string): MCPTool[] {
  const out: MCPTool[] = []
  for (const st of states.values()) {
    if (!projectMatches(st.server, projectId)) continue
    if (!st.connected) continue
    out.push(...st.tools)
  }
  return out
}

export function getMCPToolDefs(projectId?: string): ToolDef[] {
  const defs: ToolDef[] = []
  for (const st of states.values()) {
    if (!projectMatches(st.server, projectId)) continue
    if (!st.connected) continue
    for (const t of st.tools) {
      const fullName = toolFullName(st.server, t.name)
      // Ensure inputSchema is valid JSON Schema object
      let parameters: Record<string, unknown> = { type: 'object', properties: {} }
      if (t.inputSchema && typeof t.inputSchema === 'object' && !Array.isArray(t.inputSchema)) {
        parameters = t.inputSchema as Record<string, unknown>
        if (!parameters.type) parameters.type = 'object'
      }
      defs.push({
        type: 'function',
        function: {
          name: fullName,
          description: `[MCP:${st.server.name}] ${t.description ?? t.name}`.slice(0, 300),
          parameters
        }
      })
    }
  }
  return defs
}

export function isMCPTool(name: string): boolean {
  return toolMap.has(name)
}

export async function callMCPTool(fullName: string, argsJson: string): Promise<{ ok: boolean; result: string; summary: string }> {
  const mapping = toolMap.get(fullName)
  if (!mapping) return { ok: false, result: `Error: MCP tool not found: ${fullName}`, summary: `mcp tool not found` }
  const st = states.get(mapping.serverId)
  if (!st || !st.client || !st.connected) {
    // Try to reconnect if server is enabled but not connected
    const srv = findMcpServer(mapping.serverId)
    if (srv?.enabled) {
      const res = await connectMCPServer(srv)
      if (!res.ok) return { ok: false, result: `Error: MCP server "${srv.name}" not connected: ${res.error}`, summary: res.error?.slice(0, 160) ?? 'not connected' }
    } else {
      return { ok: false, result: `Error: MCP server not connected`, summary: 'mcp not connected' }
    }
  }
  const client = states.get(mapping.serverId)?.client
  if (!client) return { ok: false, result: 'Error: MCP client not available', summary: 'client unavailable' }
  let args: Record<string, unknown> = {}
  try {
    args = argsJson ? JSON.parse(argsJson) : {}
    if (typeof args !== 'object' || Array.isArray(args) || args === null) args = {}
  } catch {
    return { ok: false, result: 'Error: tool arguments are not valid JSON', summary: 'invalid args json' }
  }
  try {
    const res = await client.callTool(mapping.toolName, args)
    const isError = (res as any)?.isError
    const content = (res as any)?.content
    let text: string
    if (Array.isArray(content)) {
      text = content.map((c: any) => {
        if (typeof c.text === 'string') return c.text
        if (typeof c.content === 'string') return c.content
        return JSON.stringify(c)
      }).join('\n')
    } else if (typeof content === 'string') text = content
    else if (content != null) text = JSON.stringify(content, null, 2)
    else text = JSON.stringify(res, null, 2)
    if (!text) text = '(no content)'
    const summary = text.slice(0, 160).replace(/\s+/g, ' ')
    if (isError) return { ok: false, result: `Error: ${text}`.slice(0, 8000), summary: summary.slice(0, 160) }
    return { ok: true, result: text.slice(0, 8000), summary }
  } catch (e: any) {
    const msg = String(e?.message || e)
    return { ok: false, result: `Error: ${msg}`.slice(0, 8000), summary: msg.slice(0, 160) }
  }
}

export function getMCPStatusForApi(projectId?: string): Array<{
  id: string
  name: string
  transport: string
  enabled: boolean
  connected: boolean
  connecting: boolean
  error?: string
  tools: MCPTool[]
  toolNames: string[]
  projectId?: string
}> {
  const list: any[] = []
  for (const st of states.values()) {
    // if filtering by project, only include matching servers
    // but for API we want all; filtering is optional outside
    if (projectId !== undefined && !projectMatches(st.server, projectId)) continue
    list.push({
      id: st.server.id,
      name: st.server.name,
      transport: st.server.transport,
      enabled: st.server.enabled,
      connected: st.connected,
      connecting: st.connecting,
      error: st.error,
      tools: st.tools,
      toolNames: st.tools.map((t) => toolFullName(st.server, t.name)),
      projectId: st.server.projectId
    })
  }
  return list
}

// Graceful shutdown
try {
  process.on('exit', () => disconnectAllMCP())
  process.on('SIGINT', () => disconnectAllMCP())
  process.on('SIGTERM', () => disconnectAllMCP())
} catch {}
