import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { config } from './config.js'
import { readJsonConfig, writeJsonConfig } from './configFile.js'
import { ConfigError } from './errors.js'
import type { McpServerInfo, McpToolInfo, ToolDef, ToolResult } from './types.js'

type Transport = 'stdio' | 'http' | 'sse'

interface ServerConfig {
  name: string
  transport: Transport
  command?: string
  args: string[]
  env: Record<string, string>
  cwd?: string
  url?: string
  headers: Record<string, string>
  enabled: boolean
  timeoutMs: number
}

interface Entry {
  name: string
  config: ServerConfig | null
  error?: string
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface JsonRpcMessage {
  jsonrpc?: string
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code?: number; message?: string; data?: unknown }
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/
const TOOL_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/
const PROTOCOL_VERSION = '2024-11-05'
const INIT_TIMEOUT = 20_000
const LIST_TIMEOUT = 20_000
const CALL_TIMEOUT = 300_000

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function stringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(asRecord(value))) {
    if (typeof item === 'string') out[key] = item
  }
  return out
}

function normalizeTransport(value: unknown, command: string, url: string): Transport | null {
  const raw = asString(value).toLowerCase().replace(/[_\s]/g, '-')
  if (raw === 'stdio') return 'stdio'
  if (raw === 'sse' || raw === 'legacy-sse') return 'sse'
  if (raw === 'http' || raw === 'streamable-http' || raw === 'streamable') return 'http'
  if (command) return 'stdio'
  if (url) {
    try {
      return new URL(url).pathname.replace(/\/+$/, '').endsWith('/sse') ? 'sse' : 'http'
    } catch {
      return 'http'
    }
  }
  return null
}

function normalizeTool(raw: unknown): McpToolInfo | null {
  if (!raw || typeof raw !== 'object') return null
  const tool = raw as Record<string, unknown>
  const name = asString(tool.name)
  if (!TOOL_RE.test(name)) return null
  const schema = asRecord(tool.inputSchema)
  return {
    name,
    description: asString(tool.description),
    inputSchema: Object.keys(schema).length ? schema : { type: 'object', properties: {} }
  }
}

function normalizeServer(name: string, raw: unknown): ServerConfig {
  if (!NAME_RE.test(name)) throw new Error(`invalid MCP server name: ${name}`)
  if (!raw || typeof raw !== 'object') throw new Error('server config must be an object')
  const obj = raw as Record<string, unknown>
  const command = asString(obj.command).trim()
  const url = asString(obj.url).trim()
  const transport = normalizeTransport(obj.transport ?? obj.type, command, url)
  if (!transport) throw new Error('server needs a command (stdio) or a url (http/sse)')
  if (transport === 'stdio' && !command) throw new Error('stdio server requires command')
  if (transport !== 'stdio' && !/^https?:\/\//i.test(url)) throw new Error('http/sse server requires an http(s) url')
  const args = Array.isArray(obj.args) ? obj.args.filter((arg): arg is string => typeof arg === 'string') : []
  const timeoutMs = Math.min(900_000, Math.max(1000, Number(obj.timeoutMs) || CALL_TIMEOUT))
  return {
    name,
    transport,
    command: command || undefined,
    args,
    env: stringMap(obj.env),
    cwd: asString(obj.cwd) || undefined,
    url: url || undefined,
    headers: stringMap(obj.headers),
    enabled: obj.enabled !== false,
    timeoutMs
  }
}

function parseConfig(raw: unknown): Array<{ name: string; value: unknown }> {
  if (!raw || typeof raw !== 'object') throw new Error('MCP config must be a JSON object')
  const obj = raw as Record<string, unknown>
  const source = obj.mcpServers ?? obj.servers
  if (Array.isArray(source)) {
    return source.map((item) => {
      const entry = asRecord(item)
      return { name: asString(entry.name), value: item }
    })
  }
  if (source && typeof source === 'object') {
    return Object.entries(source as Record<string, unknown>).map(([name, value]) => ({ name, value }))
  }
  return Object.entries(obj).map(([name, value]) => ({ name, value }))
}

function configServerMap(root: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(root.servers)) {
    const map: Record<string, unknown> = {}
    for (const item of root.servers) {
      const entry = asRecord(item)
      const name = asString(entry.name)
      if (name) map[name] = item
    }
    return map
  }
  if (root.mcpServers && typeof root.mcpServers === 'object') return asRecord(root.mcpServers)
  if (root.servers && typeof root.servers === 'object') return asRecord(root.servers)
  return {}
}

function serverToConfig(server: ServerConfig): Record<string, unknown> {
  const value: Record<string, unknown> = {
    transport: server.transport,
    args: server.args,
    timeoutMs: server.timeoutMs
  }
  if (server.command) value.command = server.command
  if (Object.keys(server.env).length) value.env = server.env
  if (server.cwd) value.cwd = server.cwd
  if (server.url) value.url = server.url
  if (Object.keys(server.headers).length) value.headers = server.headers
  return value
}

function validateStringMap(value: unknown, label: string): void {
  if (value === undefined) return
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ConfigError(`${label} must be an object of string values.`)
  }
  for (const [key, item] of Object.entries(value)) {
    if (typeof item !== 'string' || !key.trim() || key.length > 200 || item.length > 4000) {
      throw new ConfigError(`${label} must use non-empty string keys and values.`)
    }
  }
}

function validateArgs(value: unknown): void {
  if (value === undefined) return
  if (!Array.isArray(value) || value.length > 100 || value.some((item) => typeof item !== 'string' || item.length > 4000)) {
    throw new ConfigError('args must be an array of up to 100 strings.')
  }
}

function mcpResultToText(result: unknown): { ok: boolean; output: string } {
  if (result === undefined || result === null) return { ok: true, output: '' }
  if (typeof result === 'string') return { ok: true, output: result }
  const obj = asRecord(result)
  const isError = obj.isError === true
  const parts: string[] = []
  if (Array.isArray(obj.content)) {
    for (const item of obj.content) {
      if (typeof item === 'string') {
        parts.push(item)
        continue
      }
      const part = asRecord(item)
      const type = asString(part.type, 'text')
      if (type === 'text') parts.push(asString(part.text))
      else if (type === 'resource') {
        const resource = asRecord(part.resource)
        parts.push(asString(resource.text) || `[resource ${asString(resource.uri)}]`)
      } else if (type === 'image') parts.push(`[image ${asString(part.mimeType, 'unknown')}]`)
      else if (type === 'audio') parts.push(`[audio ${asString(part.mimeType, 'unknown')}]`)
      else if (type === 'resource_link') parts.push(`[resource ${asString(part.uri)}]`)
      else parts.push(JSON.stringify(item))
    }
  }
  if (parts.length === 0 && obj.structuredContent !== undefined) {
    parts.push(JSON.stringify(obj.structuredContent, null, 2))
  }
  if (parts.length === 0) parts.push(JSON.stringify(result, null, 2))
  return { ok: !isError, output: parts.filter(Boolean).join('\n') }
}

abstract class BaseMcpClient {
  tools: McpToolInfo[] = []
  status: 'stopped' | 'starting' | 'ready' | 'error' = 'stopped'
  error?: string
  protected seq = 0
  protected stopping = false

  constructor(protected readonly cfg: ServerConfig) {}

  async start(): Promise<void> {
    this.status = 'starting'
    try {
      await this.connect()
      const init = asRecord(
        await this.request(
          'initialize',
          {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {},
            clientInfo: { name: 'ks-agent', version: '0.2.0' }
          },
          INIT_TIMEOUT
        )
      )
      const version = asString(init.protocolVersion, PROTOCOL_VERSION)
      await this.notify('notifications/initialized', {})
      this.tools = await this.listTools()
      this.status = 'ready'
      this.error = undefined
      void version
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.stop()
      this.status = 'error'
      this.error = message
      throw error
    }
  }

  protected abstract connect(): Promise<void>
  abstract request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown>
  abstract notify(method: string, params: Record<string, unknown>): Promise<void>
  abstract stop(): void

  protected nextId(): number {
    return ++this.seq
  }

  private async listTools(): Promise<McpToolInfo[]> {
    const tools: McpToolInfo[] = []
    let cursor: string | undefined
    for (let page = 0; page < 20; page++) {
      const result = asRecord(
        await this.request('tools/list', cursor ? { cursor } : {}, LIST_TIMEOUT)
      )
      if (Array.isArray(result.tools)) {
        for (const item of result.tools) {
          const tool = normalizeTool(item)
          if (tool && !tools.some((existing) => existing.name === tool.name)) tools.push(tool)
        }
      }
      cursor = typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : undefined
      if (!cursor) break
    }
    return tools
  }

  async call(tool: string, args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.request('tools/call', { name: tool, arguments: args }, this.cfg.timeoutMs)
    const { ok, output } = mcpResultToText(result)
    return { ok, output: output.slice(0, config.maxToolOutput) }
  }
}

class StdioMcpClient extends BaseMcpClient {
  private child: ChildProcessWithoutNullStreams | null = null
  private rl: readline.Interface | null = null
  private pending = new Map<number, Pending>()
  private stderr: string[] = []

  protected async connect(): Promise<void> {
    const cfg = this.cfg
    const child = spawn(cfg.command as string, cfg.args, {
      cwd: cfg.cwd || config.root,
      env: { ...process.env, ...cfg.env },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    this.child = child
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (text: string) => {
      const line = text.trim()
      if (!line) return
      this.stderr.push(line)
      if (this.stderr.length > 30) this.stderr.shift()
      console.warn(`[mcp:${cfg.name}] ${line}`)
    })
    child.on('error', (error) => {
      this.status = 'error'
      this.error = error.message
      this.failPending(error)
    })
    child.on('exit', (code, signal) => {
      if (!this.stopping) {
        this.status = 'error'
        this.error = `exited (code=${code ?? 'null'}, signal=${signal ?? 'none'})${
          this.stderr.length ? `: ${this.stderr.at(-1)}` : ''
        }`
        console.warn(`[mcp:${cfg.name}] ${this.error}`)
      }
      this.failPending(new Error(`MCP server ${cfg.name} exited`))
    })

    const rl = readline.createInterface({ input: child.stdout })
    this.rl = rl
    rl.on('line', (line) => this.handleLine(line))

    if (!child.stdin.writable) throw new Error('MCP server stdin is not writable')
  }

  private handleLine(line: string): void {
    if (!line.trim()) return
    let message: JsonRpcMessage
    try {
      message = JSON.parse(line) as JsonRpcMessage
    } catch {
      console.warn(`[mcp:${this.cfg.name}] non-JSON stdout: ${line.slice(0, 300)}`)
      return
    }
    this.handleMessage(message)
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (pending) {
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
        if (message.error) pending.reject(new Error(asString(message.error.message, 'MCP error')))
        else pending.resolve(message.result)
        return
      }
    }
    if (message.method && message.id !== undefined) {
      this.respondUnsupported(message)
    }
  }

  private respondUnsupported(message: JsonRpcMessage): void {
    const child = this.child
    if (!child?.stdin.writable) return
    const payload = {
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32601, message: `Method not supported by KS Agent: ${message.method}` }
    }
    child.stdin.write(`${JSON.stringify(payload)}\n`)
  }

  request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const child = this.child
      if (!child || child.exitCode !== null || !child.stdin.writable) {
        reject(new Error(this.error ?? 'MCP server is not running'))
        return
      }
      const id = this.nextId()
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`MCP request timed out after ${Math.round(timeoutMs / 1000)}s (${method})`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  async notify(method: string, params: Record<string, unknown>): Promise<void> {
    const child = this.child
    if (!child?.stdin.writable) throw new Error('MCP server is not running')
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
  }

  stop(): void {
    this.stopping = true
    this.status = 'stopped'
    this.failPending(new Error('MCP server stopped'))
    try {
      this.rl?.close()
    } catch {
      // ignore
    }
    if (this.child && this.child.exitCode === null) {
      try {
        this.child.kill('SIGTERM')
      } catch {
        // ignore
      }
      const child = this.child
      const timer = setTimeout(() => {
        if (child.exitCode === null) {
          try {
            child.kill('SIGKILL')
          } catch {
            // ignore
          }
        }
      }, 1000)
      timer.unref()
    }
    this.child = null
    this.rl = null
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

class HttpMcpClient extends BaseMcpClient {
  private abort: AbortController | null = null
  private sessionId: string | undefined
  private endpoint: string | undefined
  private endpointResolve: ((value: string) => void) | null = null
  private endpointReject: ((error: Error) => void) | null = null
  private pending = new Map<number, Pending>()
  private streamClosed = false

  protected async connect(): Promise<void> {
    this.abort = new AbortController()
    if (this.cfg.transport === 'sse') {
      this.endpoint = await this.openSseEndpoint()
    }
  }

  private baseHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...this.cfg.headers,
      ...extra
    }
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId
    return headers
  }

  private async openSseEndpoint(): Promise<string> {
    const controller = this.abort
    const headers: Record<string, string> = {
      accept: 'text/event-stream',
      'cache-control': 'no-cache',
      ...this.cfg.headers
    }
    const res = await fetch(this.cfg.url as string, { headers, signal: controller?.signal })
    if (!res.ok || !res.body) throw new Error(`MCP SSE connect failed (${res.status})`)
    const url = this.cfg.url as string
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let eventName = ''
    const dataLines: string[] = []

    const endpointPromise = new Promise<string>((resolve, reject) => {
      this.endpointResolve = resolve
      this.endpointReject = reject
    })
    const endpointTimer = setTimeout(() => {
      this.endpointReject?.(new Error('MCP SSE endpoint event timed out'))
    }, INIT_TIMEOUT)

    void (async () => {
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          buffer += decoder.decode(chunk.value, { stream: true })
          let newline = buffer.indexOf('\n')
          while (newline !== -1) {
            const line = buffer.slice(0, newline).replace(/\r$/, '')
            buffer = buffer.slice(newline + 1)
            newline = buffer.indexOf('\n')
            if (line === '') {
              if (dataLines.length) {
                this.handleSseEvent(eventName, dataLines.join('\n'), url)
              }
              eventName = ''
              dataLines.length = 0
              continue
            }
            if (line.startsWith(':')) continue
            const colon = line.indexOf(':')
            const field = colon === -1 ? line : line.slice(0, colon)
            const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
            if (field === 'event') eventName = value
            else if (field === 'data') dataLines.push(value)
          }
        }
      } catch (error) {
        if (!this.stopping) {
          this.endpointReject?.(error instanceof Error ? error : new Error(String(error)))
        }
      } finally {
        clearTimeout(endpointTimer)
        this.streamClosed = true
        this.failPending(new Error('MCP SSE stream closed'))
        this.endpointReject?.(new Error('MCP SSE stream closed before endpoint'))
      }
    })()

    return endpointPromise
  }

  private handleSseEvent(event: string, data: string, baseUrl: string): void {
    if (event === 'endpoint') {
      try {
        this.endpoint = new URL(data, baseUrl).toString()
        this.endpointResolve?.(this.endpoint)
      } catch (error) {
        this.endpointReject?.(error instanceof Error ? error : new Error(String(error)))
      }
      this.endpointResolve = null
      this.endpointReject = null
      return
    }
    let message: JsonRpcMessage
    try {
      message = JSON.parse(data) as JsonRpcMessage
    } catch {
      return
    }
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (pending) {
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
        if (message.error) pending.reject(new Error(asString(message.error.message, 'MCP error')))
        else pending.resolve(message.result)
      }
    }
  }

  private async post(message: Record<string, unknown>, timeoutMs: number): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('MCP request timed out')), timeoutMs)
    try {
      const url = this.cfg.transport === 'sse' ? this.endpoint : this.cfg.url
      if (!url) throw new Error('MCP endpoint is not ready')
      const response = await fetch(url, {
        method: 'POST',
        headers: this.baseHeaders(),
        body: JSON.stringify(message),
        signal: controller.signal
      })
      const session = response.headers.get('mcp-session-id')
      if (session) this.sessionId = session
      return response
    } finally {
      clearTimeout(timer)
    }
  }

  private async readResponse(response: Response, id: number, timeoutMs: number): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? ''
    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let eventName = ''
      let timedOut = false
      const dataLines: string[] = []
      const timer = setTimeout(() => {
        timedOut = true
        void reader.cancel().catch(() => {})
      }, timeoutMs)
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          buffer += decoder.decode(chunk.value, { stream: true })
          let newline = buffer.indexOf('\n')
          while (newline !== -1) {
            const line = buffer.slice(0, newline).replace(/\r$/, '')
            buffer = buffer.slice(newline + 1)
            newline = buffer.indexOf('\n')
            if (line === '') {
              if (dataLines.length) {
                const data = dataLines.join('\n')
                dataLines.length = 0
                eventName = ''
                let message: JsonRpcMessage
                try {
                  message = JSON.parse(data) as JsonRpcMessage
                } catch {
                  continue
                }
                if (message.id === id) {
                  await reader.cancel().catch(() => {})
                  if (message.error) throw new Error(asString(message.error.message, 'MCP error'))
                  return message.result
                }
                continue
              }
              eventName = ''
              continue
            }
            if (line.startsWith(':')) continue
            const colon = line.indexOf(':')
            const field = colon === -1 ? line : line.slice(0, colon)
            const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
            if (field === 'event') eventName = value
            else if (field === 'data') dataLines.push(value)
          }
        }
      } finally {
        clearTimeout(timer)
        eventName = ''
      }
      throw new Error(
        timedOut
          ? `MCP response timed out after ${Math.round(timeoutMs / 1000)}s`
          : 'MCP stream ended without a response'
      )
    }

    const text = await new Promise<string>((resolveText, rejectText) => {
      const timer = setTimeout(
        () => rejectText(new Error(`MCP response timed out after ${Math.round(timeoutMs / 1000)}s`)),
        timeoutMs
      )
      response.text().then(
        (value) => {
          clearTimeout(timer)
          resolveText(value)
        },
        (error) => {
          clearTimeout(timer)
          rejectText(error instanceof Error ? error : new Error(String(error)))
        }
      )
    })
    if (!text.trim()) throw new Error('MCP server returned an empty response')
    let parsed: unknown
    try {
      parsed = JSON.parse(text) as unknown
    } catch {
      throw new Error(`MCP server returned invalid JSON: ${text.slice(0, 200)}`)
    }
    const messages = Array.isArray(parsed) ? parsed : [parsed]
    const message = messages.find((item) => asRecord(item).id === id) ?? messages[0]
    const obj = asRecord(message)
    if (obj.error && typeof obj.error === 'object') {
      throw new Error(asString(asRecord(obj.error).message, 'MCP error'))
    }
    return obj.result
  }

  request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    if (this.cfg.transport === 'sse') {
      return new Promise((resolve, reject) => {
        const id = this.nextId()
        const timer = setTimeout(() => {
          this.pending.delete(id)
          reject(new Error(`MCP request timed out after ${Math.round(timeoutMs / 1000)}s (${method})`))
        }, timeoutMs)
        this.pending.set(id, { resolve, reject, timer })
        void this.post({ jsonrpc: '2.0', id, method, params }, timeoutMs).catch((error) => {
          clearTimeout(timer)
          this.pending.delete(id)
          reject(error instanceof Error ? error : new Error(String(error)))
        })
      })
    }

    return (async () => {
      const id = this.nextId()
      const response = await this.post({ jsonrpc: '2.0', id, method, params }, timeoutMs)
      if (!response.ok) {
        throw new Error(`MCP HTTP request failed (${response.status}): ${(await response.text()).slice(0, 300)}`)
      }
      if (response.status === 202) throw new Error(`MCP server returned no response for ${method}`)
      return this.readResponse(response, id, timeoutMs)
    })()
  }

  async notify(method: string, params: Record<string, unknown>): Promise<void> {
    const response = await this.post({ jsonrpc: '2.0', method, params }, INIT_TIMEOUT)
    if (!response.ok) {
      throw new Error(`MCP notification failed (${response.status})`)
    }
    await response.body?.cancel().catch(() => {})
  }

  stop(): void {
    this.stopping = true
    this.status = 'stopped'
    this.streamClosed = true
    this.failPending(new Error('MCP server stopped'))
    try {
      this.abort?.abort()
    } catch {
      // ignore
    }
    this.abort = null
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

interface RunningEntry {
  client: BaseMcpClient
  promise: Promise<void>
}

export class McpRegistry {
  private entries = new Map<string, Entry>()
  private running = new Map<string, RunningEntry>()

  discover(): void {
    this.entries.clear()
    let raw: unknown
    try {
      raw = JSON.parse(fs.readFileSync(config.mcpConfigPath, 'utf8')) as unknown
    } catch (error) {
      const message = (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? ''
        : error instanceof Error
          ? error.message
          : String(error)
      if (message) console.warn(`[mcp] config error: ${message}`)
      return
    }
    let list: Array<{ name: string; value: unknown }>
    try {
      list = parseConfig(raw)
    } catch (error) {
      console.warn(`[mcp] config error: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    for (const item of list) {
      try {
        const server = normalizeServer(item.name, item.value)
        if (!server.enabled) continue
        this.entries.set(server.name, { name: server.name, config: server })
      } catch (error) {
        const name = item.name || `invalid-${this.entries.size}`
        this.entries.set(name, {
          name,
          config: null,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }

  count(): number {
    return this.entries.size
  }

  private toolName(server: string, tool: string): string {
    return `mcp_${server}_${tool}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  toolDefs(): ToolDef[] {
    const defs: ToolDef[] = []
    for (const [name, entry] of this.entries) {
      const running = this.running.get(name)
      if (!entry.config || !running || running.client.status !== 'ready') continue
      for (const tool of running.client.tools) {
        defs.push({
          type: 'function',
          function: {
            name: this.toolName(name, tool.name),
            description: `[mcp:${name}] ${tool.description || tool.name}`,
            parameters: tool.inputSchema
          }
        })
      }
    }
    return defs
  }

  findTool(fullName: string): { server: string; tool: string } | null {
    for (const name of this.running.keys()) {
      const entry = this.entries.get(name)
      const running = this.running.get(name)
      if (!entry?.config || !running || running.client.status !== 'ready') continue
      for (const tool of running.client.tools) {
        if (this.toolName(name, tool.name) === fullName) return { server: name, tool: tool.name }
      }
    }
    return null
  }

  list(): McpServerInfo[] {
    return [...this.entries.values()]
      .map((entry) => {
        const running = this.running.get(entry.name)
        const client = running?.client
        return {
          name: entry.name,
          transport: entry.config?.transport ?? 'stdio',
          tools: client?.tools ?? [],
          status: entry.error ? 'error' : client?.status ?? 'stopped',
          ...(entry.error
            ? { error: entry.error }
            : client?.error
              ? { error: client.error }
              : {})
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  private ensureStarted(name: string): Promise<void> {
    const entry = this.entries.get(name)
    if (!entry?.config) return Promise.reject(new Error(entry?.error ?? `Unknown MCP server: ${name}`))
    const existing = this.running.get(name)
    if (existing) {
      if (existing.client.status === 'ready') return Promise.resolve()
      if (existing.client.status === 'starting') return existing.promise
    }
    const client = entry.config.transport === 'stdio'
      ? new StdioMcpClient(entry.config)
      : new HttpMcpClient(entry.config)
    const promise = client.start().catch((error) => {
      console.warn(`[mcp:${name}] ${error instanceof Error ? error.message : String(error)}`)
    })
    this.running.set(name, { client, promise })
    return promise
  }

  async startAll(): Promise<void> {
    await Promise.allSettled([...this.entries.keys()].map((name) => this.ensureStarted(name)))
  }

  async ready(): Promise<void> {
    for (const [name, entry] of this.entries) {
      if (entry.config && !this.running.has(name)) {
        void this.ensureStarted(name)
      }
    }
    await this.startAll()
  }

  async reload(): Promise<McpServerInfo[]> {
    this.stopAll()
    this.discover()
    await this.startAll()
    return this.list()
  }

  stopAll(): void {
    for (const running of this.running.values()) {
      running.client.stop()
    }
    this.running.clear()
  }

  async callTool(fullName: string, args: Record<string, unknown>): Promise<ToolResult> {
    const found = this.findTool(fullName)
    if (!found) return { ok: false, output: `Unknown MCP tool: ${fullName}` }
    try {
      await this.ensureStarted(found.server)
      const running = this.running.get(found.server)
      if (!running || running.client.status !== 'ready') {
        throw new Error(this.entries.get(found.server)?.error ?? 'MCP server is not ready')
      }
      return await running.client.call(found.tool, args)
    } catch (error) {
      return {
        ok: false,
        output: `MCP ${found.server} failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }

  promptSection(): string {
    const servers = this.list()
    if (servers.length === 0) return ''
    const lines = servers.map(
      (server) => `- ${server.name} (${server.transport}): ${server.tools.length} tool(s)`
    )
    return `## MCP servers
Tools from configured MCP servers are available as mcp_<server>_<tool>. Prefer them for integrations they provide.
${lines.join('\n')}`
  }
}

export const mcp = new McpRegistry()
mcp.discover()
