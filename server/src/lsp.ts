import { spawn, type ChildProcess } from 'node:child_process'
import type { LSPServer, LSPTransport } from './store.js'
import { findLspServer, getDb } from './store.js'

// ---------------- Types ----------------

export interface LspCapabilities {
  capabilities?: Record<string, unknown>
  serverInfo?: { name?: string; version?: string }
  [k: string]: unknown
}

interface LspClient {
  initialize(rootUri?: string): Promise<LspCapabilities>
  shutdown(): Promise<void>
  close(): void
}

interface ServerState {
  server: LSPServer
  client: LspClient | null
  capabilities: LspCapabilities | null
  connected: boolean
  connecting: boolean
  error?: string
  lastConnectedAt?: string
}

// In-memory state
const states = new Map<string, ServerState>()

// ---------------- Helpers ----------------

function projectMatches(server: LSPServer, projectId?: string): boolean {
  if (!server.enabled) return false
  if (!server.projectId) return true // global
  if (!projectId) return false
  return server.projectId === projectId
}

// ---------------- Stdio client ----------------

class StdioLspClient implements LspClient {
  private proc: ChildProcess
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }>()
  private nextId = 1
  private buffer = ''
  private closed = false
  private contentLengthBuffer = ''

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
      // ignore stderr logs
    })
    this.proc.on('error', (err) => this.failAll(err))
    this.proc.on('exit', (code) => {
      if (!this.closed) {
        const err = new Error(`LSP stdio process exited with code ${code ?? 'unknown'}`)
        this.failAll(err)
      }
    })
  }

  private onData(data: string): void {
    // LSP uses Content-Length header framing OR newline-delimited JSON (both observed)
    // Try Content-Length first, fallback to newline
    this.contentLengthBuffer += data
    // Try Content-Length parsing
    while (true) {
      const headerEnd = this.contentLengthBuffer.indexOf('\r\n\r\n')
      if (headerEnd !== -1) {
        const header = this.contentLengthBuffer.slice(0, headerEnd)
        const m = header.match(/Content-Length:\s*(\d+)/i)
        if (m) {
          const len = parseInt(m[1], 10)
          const totalHeaderLen = headerEnd + 4
          if (this.contentLengthBuffer.length >= totalHeaderLen + len) {
            const jsonStr = this.contentLengthBuffer.slice(totalHeaderLen, totalHeaderLen + len)
            this.contentLengthBuffer = this.contentLengthBuffer.slice(totalHeaderLen + len)
            let msg: any
            try { msg = JSON.parse(jsonStr) } catch { continue }
            this.handleMessage(msg)
            continue
          } else {
            break // wait for more data
          }
        } else {
          // malformed header, fallback to newline handling for remaining
          break
        }
      } else {
        break
      }
    }
    // Fallback newline-delimited for servers that use \n JSON (like MCP) — also handle leftover
    // Use buffer for newline parsing on what's left after Content-Length processing
    this.buffer += this.contentLengthBuffer
    // If we consumed content-length messages, contentLengthBuffer now may contain partial newline JSON
    // We'll try to parse newline JSON from buffer, and keep remainder in contentLengthBuffer
    let idx: number
    while ((idx = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, idx).trim()
      this.buffer = this.buffer.slice(idx + 1)
      this.contentLengthBuffer = this.buffer // keep in sync
      if (!line) continue
      // ignore non-JSON lines that aren't JSON-RPC (like Content-Length partials already handled)
      if (!line.startsWith('{')) continue
      let msg: any
      try { msg = JSON.parse(line) } catch { continue }
      this.handleMessage(msg)
    }
    // sync back
    this.contentLengthBuffer = this.buffer
  }

  private handleMessage(msg: any): void {
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

  private failAll(err: Error): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timeout)
      entry.reject(err)
    }
    this.pending.clear()
  }

  private request(method: string, params: unknown, timeoutMs = 10000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('Client closed'))
    const id = this.nextId++
    const payloadObj = { jsonrpc: '2.0', id, method, params }
    const json = JSON.stringify(payloadObj)
    // LSP spec uses Content-Length framing
    const payload = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`
    const fallbackPayload = json + '\n'
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`LSP request timeout (${method})`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      try {
        // Try Content-Length framing first; most LSP servers support it
        if (this.proc.stdin?.writable) {
          this.proc.stdin.write(payload, (e) => {
            if (e) {
              // fallback to newline
              try { this.proc.stdin!.write(fallbackPayload) } catch {}
            }
          })
        } else {
          clearTimeout(timeout)
          this.pending.delete(id)
          reject(new Error('stdin not writable'))
        }
      } catch (e: any) {
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(e)
      }
    })
  }

  private notify(method: string, params: unknown): void {
    if (this.closed) return
    const json = JSON.stringify({ jsonrpc: '2.0', method, params })
    const payload = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`
    try { this.proc.stdin?.write(payload) } catch {}
  }

  async initialize(rootUri?: string): Promise<LspCapabilities> {
    const params: any = {
      processId: process.pid,
      rootUri: rootUri ?? null,
      capabilities: {},
      clientInfo: { name: 'ks-agent', version: '0.1.0' }
    }
    // Some servers require workspaceFolders
    if (rootUri) {
      params.workspaceFolders = [{ uri: rootUri, name: 'workspace' }]
    }
    const result = await this.request('initialize', params, 8000)
    this.notify('initialized', {})
    // small delay
    await new Promise((r) => setTimeout(r, 80))
    return (result ?? {}) as LspCapabilities
  }

  async shutdown(): Promise<void> {
    try {
      await this.request('shutdown', {}, 3000)
    } catch {}
    try { this.notify('exit', {}) } catch {}
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

// ---------------- HTTP / Socket / WebSocket client ----------------

class HttpLspClient implements LspClient {
  constructor(
    private url: string,
    private headers: Record<string, string> | undefined,
    private transport: LSPTransport
  ) {}

  private async rpc(method: string, params: unknown, timeoutMs = 10000): Promise<any> {
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
        throw new Error(`LSP HTTP ${res.status}: ${txt}`)
      }
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('text/event-stream')) {
        const text = await res.text()
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
        try {
          const obj = JSON.parse(text)
          if (obj.error) throw new Error(obj.error.message || JSON.stringify(obj.error))
          return obj.result ?? obj
        } catch {
          throw new Error('Invalid SSE response from LSP server')
        }
      }
      const json: any = await res.json().catch(async () => {
        const txt = await res.text()
        throw new Error(`Invalid JSON from LSP server: ${txt.slice(0, 200)}`)
      })
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
      return json.result ?? json
    } finally {
      clearTimeout(t)
    }
  }

  async initialize(rootUri?: string): Promise<LspCapabilities> {
    const params: any = {
      processId: process.pid,
      rootUri: rootUri ?? null,
      capabilities: {},
      clientInfo: { name: 'ks-agent', version: '0.1.0' }
    }
    const result = await this.rpc('initialize', params, 10000)
    try { await this.rpc('initialized', {}, 2000) } catch {}
    return (result ?? {}) as LspCapabilities
  }

  async shutdown(): Promise<void> {
    try { await this.rpc('shutdown', {}, 3000) } catch {}
    try { await this.rpc('exit', {}, 2000) } catch {}
  }

  close(): void {}
}

class SocketLspClient implements LspClient {
  private url: string
  constructor(url: string, _headers?: Record<string, string>) {
    this.url = url
  }
  private async rpc(method: string, params: unknown, timeoutMs = 10000): Promise<any> {
    // For tcp/socket we treat url as http endpoint; try fetch
    const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now() + Math.floor(Math.random() * 10000), method, params })
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const endpoint = this.url.startsWith('tcp://') ? this.url.replace('tcp://', 'http://') : this.url
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller.signal
      })
      if (!res.ok) throw new Error(`LSP socket ${res.status}`)
      const json: any = await res.json()
      if (json.error) throw new Error(json.error.message || JSON.stringify(json.error))
      return json.result ?? json
    } finally {
      clearTimeout(t)
    }
  }
  async initialize(rootUri?: string): Promise<LspCapabilities> {
    const params: any = { processId: process.pid, rootUri: rootUri ?? null, capabilities: {}, clientInfo: { name: 'ks-agent', version: '0.1.0' } }
    const result = await this.rpc('initialize', params, 10000)
    try { await this.rpc('initialized', {}, 2000) } catch {}
    return (result ?? {}) as LspCapabilities
  }
  async shutdown(): Promise<void> {
    try { await this.rpc('shutdown', {}, 3000) } catch {}
    try { await this.rpc('exit', {}, 2000) } catch {}
  }
  close(): void {}
}

// ---------------- Public API ----------------

function createClient(server: LSPServer): LspClient {
  if (server.transport === 'stdio') {
    if (!server.command) throw new Error('stdio transport requires command')
    return new StdioLspClient(server.command, server.args ?? [], server.env)
  }
  if (server.transport === 'tcp' || server.transport === 'socket') {
    if (!server.url) throw new Error(`${server.transport} transport requires url`)
    return new SocketLspClient(server.url, server.headers)
  }
  if (server.transport === 'http' || server.transport === 'sse' || server.transport === 'websocket') {
    if (!server.url) throw new Error(`${server.transport} transport requires url`)
    return new HttpLspClient(server.url, server.headers, server.transport)
  }
  throw new Error(`Unsupported transport: ${server.transport}`)
}

export async function connectLspServer(server: LSPServer): Promise<{ ok: boolean; capabilities?: LspCapabilities; error?: string }> {
  let st = states.get(server.id)
  if (!st) {
    st = { server, client: null, capabilities: null, connected: false, connecting: false }
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
    const caps = await client.initialize()
    st.client = client
    st.capabilities = caps
    st.connected = true
    st.lastConnectedAt = new Date().toISOString()
    st.error = undefined
    return { ok: true, capabilities: caps }
  } catch (e: any) {
    const msg = String(e?.message || e)
    st.connected = false
    st.capabilities = null
    st.error = msg.slice(0, 800)
    if (st.client) { try { st.client.close() } catch {}; st.client = null }
    return { ok: false, error: st.error }
  } finally {
    st.connecting = false
  }
}

export function disconnectLspServer(id: string): void {
  const st = states.get(id)
  if (!st) return
  if (st.client) { try { st.client.shutdown().catch(() => {}); st.client.close() } catch {} ; st.client = null }
  st.connected = false
  st.connecting = false
  st.capabilities = null
}

export function disconnectAllLsp(): void {
  for (const [id] of states) disconnectLspServer(id)
}

export async function refreshLspServer(id: string): Promise<{ ok: boolean; capabilities?: LspCapabilities; error?: string }> {
  const server = findLspServer(id)
  if (!server) return { ok: false, error: 'LSP server not found' }
  if (!server.enabled) return { ok: false, error: 'Server is disabled' }
  disconnectLspServer(id)
  return connectLspServer(server)
}

export async function testLspServer(server: LSPServer): Promise<{ ok: boolean; capabilities?: LspCapabilities; error?: string }> {
  let client: LspClient | null = null
  try {
    client = createClient(server)
    const caps = await client.initialize()
    await client.shutdown().catch(() => {})
    return { ok: true, capabilities: caps }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 800) }
  } finally {
    if (client) try { client.close() } catch {}
  }
}

export function getLspServerState(id: string): ServerState | undefined {
  return states.get(id)
}

export function getAllLspStates(): ServerState[] {
  return [...states.values()]
}

export function syncLspStatesFromDb(): void {
  const validIds = new Set(getDb().lspServers.map((s) => s.id))
  for (const id of [...states.keys()]) {
    if (!validIds.has(id)) {
      disconnectLspServer(id)
      states.delete(id)
    }
  }
  for (const srv of getDb().lspServers) {
    const st = states.get(srv.id)
    if (st) st.server = srv
    else {
      states.set(srv.id, { server: srv, client: null, capabilities: null, connected: false, connecting: false })
    }
  }
}

export async function ensureLspConnections(): Promise<void> {
  syncLspStatesFromDb()
  const promises: Promise<any>[] = []
  for (const srv of getDb().lspServers) {
    if (!srv.enabled) {
      const st = states.get(srv.id)
      if (st?.connected) disconnectLspServer(srv.id)
      continue
    }
    const st = states.get(srv.id)
    if (st?.connected || st?.connecting) continue
    promises.push(connectLspServer(srv).catch(() => {}))
  }
  await Promise.all(promises)
}

export function getLspStatusForApi(projectId?: string): Array<{
  id: string
  name: string
  language: string
  transport: string
  enabled: boolean
  connected: boolean
  connecting: boolean
  error?: string
  capabilities: LspCapabilities | null
  projectId?: string
}> {
  const list: any[] = []
  for (const st of states.values()) {
    if (projectId !== undefined && !projectMatches(st.server, projectId)) continue
    list.push({
      id: st.server.id,
      name: st.server.name,
      language: st.server.language,
      transport: st.server.transport,
      enabled: st.server.enabled,
      connected: st.connected,
      connecting: st.connecting,
      error: st.error,
      capabilities: st.capabilities,
      projectId: st.server.projectId
    })
  }
  return list
}

// Graceful shutdown
try {
  process.on('exit', () => disconnectAllLsp())
  process.on('SIGINT', () => disconnectAllLsp())
  process.on('SIGTERM', () => disconnectAllLsp())
} catch {}
