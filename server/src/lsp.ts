import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { config } from './config.js'
import { resolveInProject } from './fsx.js'
import type { LspServerInfo, ToolDef, ToolResult } from './types.js'

interface LanguageServerConfig {
  name: string
  command: string
  args: string[]
  extensions: string[]
  languageId: string
  env: Record<string, string>
  initializationOptions?: Record<string, unknown>
}

interface Entry {
  name: string
  config: LanguageServerConfig | null
  error?: string
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface Diagnostic {
  range?: { start?: { line?: number; character?: number }; end?: { line?: number; character?: number } }
  severity?: number
  code?: string | number
  source?: string
  message?: string
}

interface JsonRpcMessage {
  jsonrpc?: string
  id?: number | string
  method?: string
  params?: Record<string, unknown>
  result?: unknown
  error?: { code?: number; message?: string }
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/
const INIT_TIMEOUT = 30_000
const DIAGNOSTICS_TIMEOUT = 20_000
const MAX_FILE_BYTES = 2 * 1024 * 1024

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function stringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, item] of Object.entries(asRecord(value))) {
    if (typeof item === 'string') out[key] = item
  }
  return out
}

function normalizeExtensions(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((item) => {
      const trimmed = item.trim().toLowerCase()
      return trimmed.startsWith('.') ? trimmed : `.${trimmed}`
    })
}

function normalizeServer(name: string, raw: unknown): LanguageServerConfig {
  if (!NAME_RE.test(name)) throw new Error(`invalid language server name: ${name}`)
  if (!raw || typeof raw !== 'object') throw new Error('language server config must be an object')
  const obj = raw as Record<string, unknown>
  const command = asString(obj.command).trim()
  if (!command) throw new Error('language server requires command')
  const extensions = normalizeExtensions(obj.extensions ?? obj.fileExtensions)
  if (extensions.length === 0) throw new Error('language server requires extensions')
  return {
    name,
    command,
    args: Array.isArray(obj.args) ? obj.args.filter((arg): arg is string => typeof arg === 'string') : [],
    extensions,
    languageId: asString(obj.languageId) || extensions[0].slice(1),
    env: stringMap(obj.env),
    initializationOptions: Object.keys(asRecord(obj.initializationOptions)).length
      ? asRecord(obj.initializationOptions)
      : undefined
  }
}

function parseConfig(raw: unknown): Array<{ name: string; value: unknown }> {
  if (!raw || typeof raw !== 'object') throw new Error('LSP config must be a JSON object')
  const obj = raw as Record<string, unknown>
  const source = obj.languageServers ?? obj.lspServers ?? obj.servers
  if (Array.isArray(source)) {
    return source.map((item) => ({ name: asString(asRecord(item).name), value: item }))
  }
  if (source && typeof source === 'object') {
    return Object.entries(source as Record<string, unknown>).map(([name, value]) => ({ name, value }))
  }
  return Object.entries(obj).map(([name, value]) => ({ name, value }))
}

function severityLabel(severity: number | undefined): string {
  if (severity === 1) return 'error'
  if (severity === 2) return 'warning'
  if (severity === 3) return 'info'
  if (severity === 4) return 'hint'
  return 'diagnostic'
}

function formatDiagnostics(rel: string, diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return `${rel}: no diagnostics`
  return diagnostics
    .map((diagnostic) => {
      const start = diagnostic.range?.start ?? {}
      const line = (start.line ?? 0) + 1
      const column = (start.character ?? 0) + 1
      const severity = severityLabel(diagnostic.severity)
      const source = diagnostic.source ? ` [${diagnostic.source}]` : ''
      const code = diagnostic.code !== undefined ? ` (${diagnostic.code})` : ''
      return `${rel}:${line}:${column} ${severity}: ${diagnostic.message ?? ''}${code}${source}`.trimEnd()
    })
    .join('\n')
}

class LspClient {
  status: 'stopped' | 'starting' | 'ready' | 'error' = 'stopped'
  error?: string
  private child: ChildProcessWithoutNullStreams | null = null
  private seq = 0
  private buffer = Buffer.alloc(0)
  private pending = new Map<number, Pending>()
  private diagnosticsWaiters = new Map<string, Array<(diagnostics: Diagnostic[]) => void>>()
  private openDocs = new Map<string, number>()
  private stopping = false
  private stderr: string[] = []

  constructor(
    private readonly cfg: LanguageServerConfig,
    private readonly rootPath: string
  ) {}

  async start(): Promise<void> {
    if (this.status === 'ready') return
    this.status = 'starting'
    try {
      const child = spawn(this.cfg.command, this.cfg.args, {
        cwd: this.rootPath,
        env: { ...process.env, ...this.cfg.env, KS_PROJECT_DIR: this.rootPath },
        stdio: ['pipe', 'pipe', 'pipe']
      })
      this.child = child
      child.stdout.on('data', (chunk: Buffer) => this.onData(chunk))
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (text: string) => {
        const line = text.trim()
        if (!line) return
        this.stderr.push(line)
        if (this.stderr.length > 30) this.stderr.shift()
        console.warn(`[lsp:${this.cfg.name}] ${line}`)
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
          console.warn(`[lsp:${this.cfg.name}] ${this.error}`)
        }
        this.failPending(new Error(`Language server ${this.cfg.name} exited`))
      })

      await this.request(
        'initialize',
        {
          processId: process.pid,
          clientInfo: { name: 'ks-agent', version: '0.2.0' },
          rootUri: pathToFileURL(this.rootPath).toString(),
          rootPath: this.rootPath,
          workspaceFolders: [{ uri: pathToFileURL(this.rootPath).toString(), name: path.basename(this.rootPath) }],
          capabilities: {
            workspace: { configuration: true, workspaceFolders: true },
            textDocument: {
              publishDiagnostics: { relatedInformation: true },
              hover: { contentFormat: ['markdown', 'plaintext'] },
              definition: { linkSupport: true }
            }
          },
          ...(this.cfg.initializationOptions ? { initializationOptions: this.cfg.initializationOptions } : {})
        },
        INIT_TIMEOUT
      )
      await this.notify('initialized', {})
      this.status = 'ready'
      this.error = undefined
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.stop()
      this.status = 'error'
      this.error = message
      throw error
    }
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk])
    for (;;) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n')
      if (headerEnd === -1) return
      const header = this.buffer.subarray(0, headerEnd).toString('ascii')
      const match = /Content-Length:\s*(\d+)/i.exec(header)
      if (!match) {
        this.buffer = this.buffer.subarray(headerEnd + 4)
        continue
      }
      const length = Number(match[1])
      const start = headerEnd + 4
      if (this.buffer.length < start + length) return
      const body = this.buffer.subarray(start, start + length).toString('utf8')
      this.buffer = this.buffer.subarray(start + length)
      let message: JsonRpcMessage
      try {
        message = JSON.parse(body) as JsonRpcMessage
      } catch {
        continue
      }
      this.handleMessage(message)
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if (typeof message.id === 'number') {
      const pending = this.pending.get(message.id)
      if (pending) {
        this.pending.delete(message.id)
        clearTimeout(pending.timer)
        if (message.error) pending.reject(new Error(asString(message.error.message, 'LSP error')))
        else pending.resolve(message.result)
        return
      }
    }

    if (message.method && message.id !== undefined) {
      this.respondToServerRequest(message)
      return
    }

    if (message.method === 'textDocument/publishDiagnostics') {
      const params = asRecord(message.params)
      const uri = asString(params.uri)
      const diagnostics = Array.isArray(params.diagnostics) ? (params.diagnostics as Diagnostic[]) : []
      const waiters = this.diagnosticsWaiters.get(uri) ?? []
      this.diagnosticsWaiters.delete(uri)
      for (const resolve of waiters) resolve(diagnostics)
    }
  }

  private respondToServerRequest(message: JsonRpcMessage): void {
    const child = this.child
    if (!child?.stdin.writable) return
    let result: unknown = null
    if (message.method === 'workspace/configuration') {
      const params = asRecord(message.params)
      const items = Array.isArray(params.items) ? params.items : []
      result = items.map(() => null)
    }
    const body = JSON.stringify({ jsonrpc: '2.0', id: message.id, result })
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }

  private send(message: Record<string, unknown>): void {
    const child = this.child
    if (!child || child.exitCode !== null || !child.stdin.writable) {
      throw new Error(this.error ?? `Language server ${this.cfg.name} is not running`)
    }
    const body = JSON.stringify(message)
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
  }

  request(method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = ++this.seq
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`LSP request timed out after ${Math.round(timeoutMs / 1000)}s (${method})`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.send({ jsonrpc: '2.0', id, method, params })
      } catch (error) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  async notify(method: string, params: Record<string, unknown>): Promise<void> {
    this.send({ jsonrpc: '2.0', method, params })
  }

  async diagnostics(absPath: string, relPath: string, timeoutMs = DIAGNOSTICS_TIMEOUT): Promise<ToolResult> {
    const stat = fs.statSync(absPath)
    if (stat.size > MAX_FILE_BYTES) {
      return { ok: false, output: `${relPath} is larger than 2 MB` }
    }
    const text = fs.readFileSync(absPath, 'utf8')
    const uri = pathToFileURL(absPath).toString()
    const languageId = this.cfg.languageId
    const version = (this.openDocs.get(uri) ?? 0) + 1
    this.openDocs.set(uri, version)

    return new Promise<ToolResult>((resolve) => {
      let settled = false
      let timer: ReturnType<typeof setTimeout>
      const removeWaiter = () => {
        const waiters = this.diagnosticsWaiters.get(uri) ?? []
        const index = waiters.indexOf(onDiagnostics)
        if (index !== -1) waiters.splice(index, 1)
        if (waiters.length === 0) this.diagnosticsWaiters.delete(uri)
      }
      const finish = (diagnostics: Diagnostic[] | null) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        removeWaiter()
        if (diagnostics === null) {
          resolve({
            ok: true,
            output: `${relPath}: no diagnostics reported by ${this.cfg.name} within ${Math.round(timeoutMs / 1000)}s`
          })
          return
        }
        resolve({
          ok: !diagnostics.some((diagnostic) => diagnostic.severity === 1),
          output: formatDiagnostics(relPath, diagnostics)
        })
      }
      const onDiagnostics = (diagnostics: Diagnostic[]) => finish(diagnostics)
      timer = setTimeout(() => finish(null), timeoutMs)
      const waiters = this.diagnosticsWaiters.get(uri) ?? []
      waiters.push(onDiagnostics)
      this.diagnosticsWaiters.set(uri, waiters)

      try {
        if (version === 1) {
          this.send({
            jsonrpc: '2.0',
            method: 'textDocument/didOpen',
            params: { textDocument: { uri, languageId, version, text } }
          })
        } else {
          this.send({
            jsonrpc: '2.0',
            method: 'textDocument/didChange',
            params: { textDocument: { uri, version }, contentChanges: [{ text }] }
          })
        }
      } catch (error) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        removeWaiter()
        resolve({
          ok: false,
          output: `Language server ${this.cfg.name} failed: ${
            error instanceof Error ? error.message : String(error)
          }`
        })
      }
    })
  }

  stop(): void {
    this.stopping = true
    this.status = 'stopped'
    this.failPending(new Error('Language server stopped'))
    const child = this.child
    if (child && child.exitCode === null) {
      try {
        const body = JSON.stringify({ jsonrpc: '2.0', id: ++this.seq, method: 'shutdown', params: null })
        child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`)
        const exitBody = JSON.stringify({ jsonrpc: '2.0', method: 'exit', params: null })
        child.stdin.write(`Content-Length: ${Buffer.byteLength(exitBody)}\r\n\r\n${exitBody}`)
      } catch {
        // ignore
      }
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
    this.openDocs.clear()
    this.diagnosticsWaiters.clear()
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this.pending.clear()
  }
}

export class LspRegistry {
  private entries = new Map<string, Entry>()
  private clients = new Map<string, LspClient>()
  private starting = new Map<string, Promise<LspClient>>()

  discover(): void {
    this.stopAll()
    this.entries.clear()
    let raw: unknown
    try {
      raw = JSON.parse(fs.readFileSync(config.lspConfigPath, 'utf8')) as unknown
    } catch (error) {
      const message = (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? ''
        : error instanceof Error
          ? error.message
          : String(error)
      if (message) console.warn(`[lsp] config error: ${message}`)
      return
    }
    let list: Array<{ name: string; value: unknown }>
    try {
      list = parseConfig(raw)
    } catch (error) {
      console.warn(`[lsp] config error: ${error instanceof Error ? error.message : String(error)}`)
      return
    }
    for (const item of list) {
      try {
        const server = normalizeServer(item.name, item.value)
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

  toolDefs(): ToolDef[] {
    if (this.entries.size === 0) return []
    const servers = [...this.entries.keys()].sort().join(', ')
    return [
      {
        type: 'function',
        function: {
          name: 'lsp_diagnostics',
          description: `Get language-server diagnostics (errors, warnings) for a file. Configured servers: ${servers}. Use after editing to catch type and syntax errors.`,
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path relative to the project root' }
            },
            required: ['path']
          }
        }
      }
    ]
  }

  list(): LspServerInfo[] {
    return [...this.entries.values()]
      .map((entry) => {
        const clients = [...this.clients.entries()]
          .filter(([key]) => key.startsWith(`${entry.name}:`))
          .map(([, client]) => client)
        const ready = clients.find((client) => client.status === 'ready')
        const error = entry.error ?? clients.find((client) => client.error)?.error
        const status: LspServerInfo['status'] = entry.error
          ? 'error'
          : ready
            ? 'ready'
            : clients.some((client) => client.status === 'starting')
              ? 'starting'
              : clients.some((client) => client.status === 'error')
                ? 'error'
                : 'stopped'
        return {
          name: entry.name,
          command: entry.config ? [entry.config.command, ...entry.config.args].join(' ') : '',
          extensions: entry.config?.extensions ?? [],
          languageId: entry.config?.languageId ?? '',
          status,
          ...(error ? { error } : {})
        }
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  reload(): LspServerInfo[] {
    this.discover()
    return this.list()
  }

  stopAll(): void {
    for (const client of this.clients.values()) client.stop()
    this.clients.clear()
    this.starting.clear()
  }

  promptSection(): string {
    const servers = this.list()
    if (servers.length === 0) return ''
    const lines = servers.map(
      (server) => `- ${server.name}: ${server.extensions.join(', ')} (${server.command})`
    )
    return `## Language servers
Use lsp_diagnostics after editing source files to surface type and syntax errors. Configured servers:
${lines.join('\n')}`
  }

  private serverFor(relPath: string): LanguageServerConfig | null {
    const ext = path.extname(relPath).toLowerCase()
    for (const entry of this.entries.values()) {
      if (entry.config?.extensions.includes(ext)) return entry.config
    }
    return null
  }

  private ensureClient(server: LanguageServerConfig, rootPath: string): Promise<LspClient> {
    const key = `${server.name}:${rootPath}`
    const existing = this.clients.get(key)
    if (existing?.status === 'ready') return Promise.resolve(existing)
    const inFlight = this.starting.get(key)
    if (inFlight) return inFlight
    const client = existing ?? new LspClient(server, rootPath)
    this.clients.set(key, client)
    const promise = client
      .start()
      .then(() => client)
      .finally(() => this.starting.delete(key))
    this.starting.set(key, promise)
    return promise
  }

  async callTool(name: string, args: Record<string, unknown>, projectPath: string): Promise<ToolResult> {
    if (name !== 'lsp_diagnostics') return { ok: false, output: `Unknown LSP tool: ${name}` }
    const rel = typeof args.path === 'string' ? args.path : ''
    if (!rel) return { ok: false, output: 'path is required' }
    const abs = resolveInProject(projectPath, rel)
    if (!abs) return { ok: false, output: `Refusing path outside project: ${rel}` }
    let stat: fs.Stats
    try {
      stat = fs.statSync(abs)
    } catch {
      return { ok: false, output: `File not found: ${rel}` }
    }
    if (!stat.isFile()) return { ok: false, output: `${rel} is not a file` }
    const server = this.serverFor(rel)
    if (!server) {
      const available = this.list()
        .filter((entry) => entry.extensions.length)
        .map((entry) => `${entry.name} (${entry.extensions.join(', ')})`)
        .join('; ')
      return {
        ok: false,
        output: `No language server configured for ${path.extname(rel) || 'this file'}. Available: ${available || '(none)'}`
      }
    }
    try {
      const client = await this.ensureClient(server, projectPath)
      return await client.diagnostics(abs, rel)
    } catch (error) {
      return {
        ok: false,
        output: `Language server ${server.name} failed: ${error instanceof Error ? error.message : String(error)}`
      }
    }
  }
}

export const lsp = new LspRegistry()
lsp.discover()
