import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { config } from './config.js'
import { readJsonConfig, writeJsonConfig } from './configFile.js'
import { ConfigError } from './errors.js'
import { resolveInProject } from './fsx.js'
import { outputTail, runInstallCommand } from './install.js'
import { isProjectEnabled, normalizeProjects } from './scope.js'
import type { LspServerDetail, LspServerInfo, ToolDef, ToolResult } from './types.js'

interface LanguageServerConfig {
  name: string
  command: string
  args: string[]
  extensions: string[]
  languageId: string
  env: Record<string, string>
  initializationOptions?: Record<string, unknown>
  installCommand?: string
  projects: string[]
}

interface Entry {
  name: string
  config: LanguageServerConfig | null
  error?: string
}

function executable(file: string): boolean {
  try {
    fs.accessSync(file, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

function commandAvailable(command: string): boolean {
  const value = command.trim()
  if (!value) return false
  if (value.includes('/') || value.includes('\\')) return executable(value)
  const extensions =
    process.platform === 'win32'
      ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
      : ['']
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    if (executable(path.join(dir, value))) return true
    for (const extension of extensions) {
      if (executable(path.join(dir, `${value}${extension}`))) return true
    }
  }
  return false
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
  const installCommand = asString(obj.installCommand ?? obj.install).trim()
  return {
    name,
    command,
    args: Array.isArray(obj.args) ? obj.args.filter((arg): arg is string => typeof arg === 'string') : [],
    extensions,
    languageId: asString(obj.languageId) || extensions[0].slice(1),
    env: stringMap(obj.env),
    initializationOptions: Object.keys(asRecord(obj.initializationOptions)).length
      ? asRecord(obj.initializationOptions)
      : undefined,
    ...(installCommand ? { installCommand } : {}),
    projects: normalizeProjects(obj.projects)
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
  if (root.languageServers && typeof root.languageServers === 'object') return asRecord(root.languageServers)
  if (root.lspServers && typeof root.lspServers === 'object') return asRecord(root.lspServers)
  if (root.servers && typeof root.servers === 'object') return asRecord(root.servers)
  return {}
}

function serverToConfig(server: LanguageServerConfig): Record<string, unknown> {
  return {
    command: server.command,
    args: server.args,
    extensions: server.extensions,
    languageId: server.languageId,
    ...(Object.keys(server.env).length ? { env: server.env } : {}),
    ...(server.initializationOptions ? { initializationOptions: server.initializationOptions } : {}),
    ...(server.installCommand ? { installCommand: server.installCommand } : {}),
    ...(server.projects.length ? { projects: server.projects } : {})
  }
}

function validateLspInput(obj: Record<string, unknown>): void {
  if (obj.args !== undefined && (!Array.isArray(obj.args) || obj.args.length > 100 || obj.args.some((item) => typeof item !== 'string' || item.length > 4000))) {
    throw new ConfigError('args must be an array of up to 100 strings.')
  }
  const extensions = obj.extensions ?? obj.fileExtensions
  if (!Array.isArray(extensions) || extensions.length === 0 || extensions.length > 50) {
    throw new ConfigError('extensions must be a non-empty array (for example [".ts", ".tsx"]).')
  }
  if (obj.env !== undefined) {
    if (!obj.env || typeof obj.env !== 'object' || Array.isArray(obj.env)) {
      throw new ConfigError('env must be an object of string values.')
    }
    for (const [key, value] of Object.entries(obj.env)) {
      if (typeof value !== 'string' || !key.trim() || key.length > 200 || value.length > 4000) {
        throw new ConfigError('env must use non-empty string keys and values.')
      }
    }
  }
  const installCommand = obj.installCommand ?? obj.install
  if (installCommand !== undefined && (typeof installCommand !== 'string' || installCommand.length > 2000)) {
    throw new ConfigError('installCommand must be a string of at most 2000 characters.')
  }
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

  private matches(name: string, entry: Entry, projectId?: string, disabled?: Set<string>): boolean {
    if (!entry.config) return false
    if (projectId !== undefined && !isProjectEnabled(entry.config.projects, projectId)) return false
    return !disabled?.has(name)
  }

  private usable(entry: Entry): boolean {
    return Boolean(entry.config && commandAvailable(entry.config.command))
  }

  listForProject(projectId: string): LspServerInfo[] {
    return this.list().filter((server) => isProjectEnabled(server.projects, projectId))
  }

  add(input: unknown): LspServerInfo[] {
    const obj = asRecord(input)
    const name = asString(obj.name).trim().toLowerCase()
    if (!NAME_RE.test(name)) {
      throw new ConfigError('Language server name must use lowercase letters, numbers, dashes or underscores (max 40 characters).')
    }
    validateLspInput(obj)
    const command = asString(obj.command).trim()
    if (!command || command.length > 2000) {
      throw new ConfigError('command is required and must be at most 2000 characters.')
    }
    let server: LanguageServerConfig
    try {
      server = normalizeServer(name, { ...obj, name })
    } catch (error) {
      throw new ConfigError(error instanceof Error ? error.message : String(error))
    }
    const root = readJsonConfig(config.lspConfigPath)
    const servers = configServerMap(root)
    if (servers[name]) throw new ConfigError(`Language server "${name}" already exists.`, 409)
    servers[name] = serverToConfig(server)
    root.languageServers = servers
    if (root.servers) delete root.servers
    if (root.lspServers) delete root.lspServers
    writeJsonConfig(config.lspConfigPath, root)
    this.discover()
    return this.list()
  }

  update(name: string, input: unknown): LspServerInfo[] {
    const key = name.trim().toLowerCase()
    if (!NAME_RE.test(key)) throw new ConfigError('Invalid language server name.')
    const obj = asRecord(input)
    const root = readJsonConfig(config.lspConfigPath)
    const servers = configServerMap(root)
    const current = servers[key]
    if (!current || typeof current !== 'object') {
      throw new ConfigError(`Language server "${name}" was not found.`, 404)
    }
    const merged = { ...asRecord(current), ...obj, name: key }
    validateLspInput(merged)
    const command = asString(merged.command).trim()
    if (!command || command.length > 2000) {
      throw new ConfigError('command is required and must be at most 2000 characters.')
    }
    let server: LanguageServerConfig
    try {
      server = normalizeServer(key, merged)
    } catch (error) {
      throw new ConfigError(error instanceof Error ? error.message : String(error))
    }
    servers[key] = serverToConfig(server)
    root.languageServers = servers
    if (root.servers) delete root.servers
    if (root.lspServers) delete root.lspServers
    writeJsonConfig(config.lspConfigPath, root)
    this.discover()
    return this.list()
  }

  get(name: string): LspServerDetail | null {
    const entry = this.entries.get(name.trim().toLowerCase())
    if (!entry?.config) return null
    return {
      ...this.list().find((server) => server.name === entry.name) as LspServerInfo,
      args: entry.config.args,
      env: entry.config.env,
      initializationOptions: entry.config.initializationOptions
    }
  }

  remove(name: string): LspServerInfo[] {
    const key = name.trim().toLowerCase()
    const root = readJsonConfig(config.lspConfigPath)
    const servers = configServerMap(root)
    if (!servers[key]) throw new ConfigError(`Language server "${name}" was not found.`, 404)
    delete servers[key]
    root.languageServers = servers
    if (root.servers) delete root.servers
    if (root.lspServers) delete root.lspServers
    writeJsonConfig(config.lspConfigPath, root)
    this.discover()
    return this.list()
  }

  async install(name: string): Promise<LspServerInfo[]> {
    const key = name.trim().toLowerCase()
    const entry = this.entries.get(key)
    if (!entry?.config) throw new ConfigError(`Language server "${name}" was not found.`, 404)
    const installCommand = entry.config.installCommand?.trim()
    if (!installCommand) {
      throw new ConfigError(`Language server "${name}" has no install command. Add one to .ks-agent/lsp.json.`, 400)
    }
    const result = await runInstallCommand(installCommand)
    this.discover()
    if (!result.ok) {
      const detail = outputTail(result.output)
      throw new ConfigError(`Install failed for "${name}": ${detail || 'command exited with an error'}`, 500)
    }
    return this.list()
  }

  toolDefs(projectId?: string, disabled?: Set<string>): ToolDef[] {
    const available = [...this.entries.entries()].filter(
      ([name, entry]) => this.matches(name, entry, projectId, disabled) && this.usable(entry)
    )
    if (available.length === 0) return []
    const servers = available.map(([name]) => name).sort().join(', ')
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
        const missing = entry.config ? !commandAvailable(entry.config.command) : false
        const error =
          entry.error ??
          clients.find((client) => client.error)?.error ??
          (missing ? `Command not found: ${entry.config?.command}` : undefined)
        const status: LspServerInfo['status'] = entry.error || missing
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
          ...(entry.config?.installCommand ? { installCommand: entry.config.installCommand } : {}),
          status,
          projects: entry.config?.projects ?? [],
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

  promptSection(projectId?: string, disabled?: Set<string>): string {
    const servers = this.list().filter(
      (server) =>
        (projectId === undefined || isProjectEnabled(server.projects, projectId)) &&
        !disabled?.has(server.name)
    )
    if (servers.length === 0) return ''
    const usable = servers.filter((server) => server.status !== 'error')
    const unavailable = servers.filter((server) => server.status === 'error')
    const unavailableLine = unavailable.length
      ? `\nUnavailable (do not call): ${unavailable
          .map((server) => `${server.name} (${server.error ?? 'unavailable'})`)
          .join('; ')}`
      : ''
    if (usable.length === 0) {
      return `## Language servers
No usable language servers are enabled in this chat.${unavailableLine}`
    }
    const lines = usable.map(
      (server) => `- ${server.name}: ${server.extensions.join(', ')} (${server.command})`
    )
    return `## Language servers
Use lsp_diagnostics after editing source files to surface type and syntax errors. Usable servers:
${lines.join('\n')}${unavailableLine}`
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

  async callTool(
    name: string,
    args: Record<string, unknown>,
    projectPath: string,
    projectId?: string,
    disabled?: Set<string>
  ): Promise<ToolResult> {
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
    const ext = path.extname(rel).toLowerCase()
    const candidates = [...this.entries.entries()].filter(([, entry]) => {
      if (!entry.config) return false
      if (projectId !== undefined && !isProjectEnabled(entry.config.projects, projectId)) return false
      return entry.config.extensions.includes(ext)
    })
    const enabled = candidates.filter(([name]) => !disabled?.has(name))
    const usable = enabled.filter(([, entry]) => this.usable(entry))
    if (usable.length === 0) {
      if (enabled.length > 0) {
        const info = this.list()
        const detail = enabled
          .map(([name]) => {
            const error = info.find((server) => server.name === name)?.error ?? 'unavailable'
            return `${name} (${error})`
          })
          .join('; ')
        return {
          ok: false,
          output: `Language server${enabled.length === 1 ? '' : 's'} unavailable: ${detail}`
        }
      }
      const blocked = candidates.filter(([name]) => disabled?.has(name))
      if (blocked.length > 0) {
        return { ok: false, output: `Language server "${blocked[0][0]}" is disabled in this chat.` }
      }
      const configured = this.list()
        .filter(
          (entry) =>
            entry.extensions.length &&
            (projectId === undefined || isProjectEnabled(entry.projects, projectId))
        )
        .map(
          (entry) =>
            `${entry.name} (${entry.extensions.join(', ')}${
              entry.status === 'error' ? ', unavailable' : ''
            })`
        )
        .join('; ')
      return {
        ok: false,
        output: `No language server is enabled for ${ext || 'this file'}. Configured: ${
          configured || '(none)'
        }`
      }
    }
    const server = usable[0][1].config as LanguageServerConfig
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
