import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { LSPServer } from './store.js'
import { findLspServer, findProject, getDb } from './store.js'

// ---------------- Types ----------------

export interface LSPCapabilities {
  textDocumentSync?: unknown
  completionProvider?: unknown
  hoverProvider?: boolean
  definitionProvider?: boolean
  referencesProvider?: boolean
  documentSymbolProvider?: boolean
  workspaceSymbolProvider?: boolean
  [key: string]: unknown
}

interface LSPClient {
  initialize(rootUri: string | null): Promise<LSPCapabilities>
  shutdown(): Promise<void>
  close(): void
  isAlive(): boolean
}

interface ServerState {
  server: LSPServer
  client: LSPClient | null
  capabilities: LSPCapabilities | null
  connected: boolean
  connecting: boolean
  error?: string
  lastConnectedAt?: string
}

// In-memory state
const states = new Map<string, ServerState>()

// Known language identifiers for validation / UI hints
export const SUPPORTED_LANGUAGES = [
  'typescript',
  'javascript',
  'python',
  'go',
  'rust',
  'css',
  'json',
  'html',
  'yaml',
  'bash',
  'shell',
  'markdown',
  'java',
  'c',
  'cpp',
  'csharp',
  'php',
  'ruby',
  'swift',
  'kotlin',
  'dart',
  'toml',
  'xml',
  'sql',
  'graphql',
  'dockerfile'
] as const

export type LSPLanguageId = string

function projectMatches(server: LSPServer, projectId?: string): boolean {
  if (!server.enabled) return false
  if (!server.projectId) return true
  if (!projectId) return false
  return server.projectId === projectId
}

function resolveRootUri(server: LSPServer): string | null {
  try {
    if (server.projectId) {
      const proj = findProject(server.projectId)
      if (proj?.path) {
        const abs = path.resolve(proj.path)
        if (fs.existsSync(abs)) return 'file://' + abs
      }
    }
    // fallback to cwd as root
    return 'file://' + path.resolve(process.cwd())
  } catch {
    return null
  }
}

// ---------------- Stdio client with Content-Length framing ----------------

class StdioLSPClient implements LSPClient {
  private proc: ChildProcess
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }>()
  private nextId = 1
  private buffer = Buffer.alloc(0)
  private closed = false
  private alive = true

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
    this.proc.stdout?.on('data', (chunk: Buffer) => this.onData(chunk))
    this.proc.stderr?.on('data', () => {
      // stderr is often used for logging; ignore but keep process alive
    })
    this.proc.on('error', (err) => this.failAll(err))
    this.proc.on('exit', (code) => {
      this.alive = false
      if (!this.closed) {
        const err = new Error(`LSP process exited with code ${code ?? 'unknown'}`)
        this.failAll(err)
      }
    })
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) break
      const header = this.buffer.slice(0, headerEnd).toString('utf8')
      const match = header.match(/Content-Length:\s*(\d+)/i)
      if (!match) {
        // malformed header, skip
        this.buffer = this.buffer.slice(headerEnd + 4)
        continue
      }
      const len = Number(match[1])
      const total = headerEnd + 4 + len
      if (this.buffer.length < total) break // wait for more data
      const body = this.buffer.slice(headerEnd + 4, total).toString('utf8')
      this.buffer = this.buffer.slice(total)
      if (!body) continue
      let msg: any
      try {
        msg = JSON.parse(body)
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
      } else if (msg.method) {
        // notification or server-initiated request – ignore for now (diagnostics etc.)
        // If it's a request from server, we should respond with empty result to avoid hanging
        if (msg.id != null) {
          try {
            const response = JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: null })
            const header = `Content-Length: ${Buffer.byteLength(response, 'utf8')}\r\n\r\n`
            this.proc.stdin?.write(header + response)
          } catch {}
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

  private send(payload: string): void {
    if (this.closed) throw new Error('Client closed')
    // LSP requires Content-Length header
    const header = `Content-Length: ${Buffer.byteLength(payload, 'utf8')}\r\n\r\n`
    this.proc.stdin!.write(header + payload)
  }

  private request(method: string, params: unknown, timeoutMs = 10000): Promise<any> {
    if (this.closed) return Promise.reject(new Error('Client closed'))
    const id = this.nextId++
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params })
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`LSP request timeout (${method})`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      try {
        this.send(payload)
      } catch (e: any) {
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(e)
      }
    })
  }

  private notify(method: string, params: unknown): void {
    if (this.closed) return
    const payload = JSON.stringify({ jsonrpc: '2.0', method, params })
    try { this.send(payload) } catch {}
  }

  async initialize(rootUri: string | null): Promise<LSPCapabilities> {
    const params: any = {
      processId: process.pid,
      rootUri,
      capabilities: {
        workspace: { configuration: true, workspaceFolders: true },
        textDocument: {
          synchronization: { dynamicRegistration: false, willSave: false, didSave: false },
          completion: { dynamicRegistration: false, completionItem: { snippetSupport: false } },
          hover: { dynamicRegistration: false },
          definition: { dynamicRegistration: false },
          references: { dynamicRegistration: false },
          documentSymbol: { dynamicRegistration: false }
        }
      },
      initializationOptions: {}
    }
    if (rootUri) {
      params.workspaceFolders = [{ uri: rootUri, name: path.basename(rootUri.replace('file://', '')) || 'workspace' }]
    }
    const result = await this.request('initialize', params, 15000)
    this.notify('initialized', {})
    // small delay to let server process initialized
    await new Promise((r) => setTimeout(r, 100))
    if (result && typeof result === 'object' && (result as any).capabilities) {
      return (result as any).capabilities as LSPCapabilities
    }
    return (result as LSPCapabilities) ?? {}
  }

  async shutdown(): Promise<void> {
    try {
      await this.request('shutdown', null, 5000)
    } catch {}
    this.notify('exit', null)
  }

  isAlive(): boolean {
    return this.alive && !this.closed && this.proc.exitCode === null
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
    // force kill after 2s if still alive
    setTimeout(() => {
      try { if (this.proc.exitCode === null) this.proc.kill('SIGKILL') } catch {}
    }, 2000).unref?.()
  }
}

// ---------------- Public API ----------------

function createClient(server: LSPServer): LSPClient {
  if (!server.command) throw new Error('LSP server requires command')
  return new StdioLSPClient(server.command, server.args ?? [], server.env)
}

export async function connectLSPServer(server: LSPServer): Promise<{ ok: boolean; capabilities?: LSPCapabilities; error?: string }> {
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
    const rootUri = resolveRootUri(server)
    const caps = await client.initialize(rootUri)
    // Verify process still alive after initialize
    if (!client.isAlive()) throw new Error('LSP process died after initialize')
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

export function disconnectLSPServer(id: string): void {
  const st = states.get(id)
  if (!st) return
  if (st.client) {
    try {
      // best-effort shutdown
      void (st.client as StdioLSPClient).shutdown().catch(() => {})
      st.client.close()
    } catch {}
    st.client = null
  }
  st.connected = false
  st.connecting = false
  st.capabilities = null
}

export function disconnectAllLSP(): void {
  for (const [id] of states) disconnectLSPServer(id)
}

export async function refreshLSPServer(id: string): Promise<{ ok: boolean; capabilities?: LSPCapabilities; error?: string }> {
  const server = findLspServer(id)
  if (!server) return { ok: false, error: 'LSP server not found' }
  if (!server.enabled) return { ok: false, error: 'Server is disabled' }
  disconnectLSPServer(id)
  return connectLSPServer(server)
}

export async function testLSPServer(server: LSPServer): Promise<{ ok: boolean; capabilities?: LSPCapabilities; error?: string }> {
  let client: LSPClient | null = null
  try {
    client = createClient(server)
    const rootUri = resolveRootUri(server)
    const caps = await client.initialize(rootUri)
    // verify still alive
    if (!client.isAlive()) throw new Error('Process died after initialize')
    return { ok: true, capabilities: caps }
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e).slice(0, 800) }
  } finally {
    if (client) try { client.close() } catch {}
  }
}

export function getLSPServerState(id: string): ServerState | undefined {
  return states.get(id)
}

export function getAllLSPStates(): ServerState[] {
  return [...states.values()]
}

export function syncLSPStatesFromDb(): void {
  const validIds = new Set(getDb().lspServers.map((s) => s.id))
  for (const id of [...states.keys()]) {
    if (!validIds.has(id)) {
      disconnectLSPServer(id)
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

export async function ensureLSPConnections(): Promise<void> {
  syncLSPStatesFromDb()
  const promises: Promise<any>[] = []
  for (const srv of getDb().lspServers) {
    if (!srv.enabled) {
      const st = states.get(srv.id)
      if (st?.connected) disconnectLSPServer(srv.id)
      continue
    }
    const st = states.get(srv.id)
    if (st?.connected || st?.connecting) continue
    promises.push(connectLSPServer(srv).catch(() => {}))
  }
  await Promise.all(promises)
}

export function getLSPServersForProject(projectId?: string): LSPServer[] {
  return getDb().lspServers.filter((s) => projectMatches(s, projectId))
}

export function getLSPStatusForApi(projectId?: string): Array<{
  id: string
  name: string
  language: string
  enabled: boolean
  connected: boolean
  connecting: boolean
  error?: string
  capabilities?: LSPCapabilities | null
  projectId?: string
}> {
  const list: any[] = []
  for (const st of states.values()) {
    if (projectId !== undefined && !projectMatches(st.server, projectId)) continue
    list.push({
      id: st.server.id,
      name: st.server.name,
      language: st.server.language,
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
  process.on('exit', () => disconnectAllLSP())
  process.on('SIGINT', () => disconnectAllLSP())
  process.on('SIGTERM', () => disconnectAllLSP())
} catch {}
