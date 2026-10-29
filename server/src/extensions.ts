import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { config, isInside } from './config.js'
import type { ExtensionInfo, ExtensionManifest, ExtensionTool, ToolDef, ToolResult } from './types.js'

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface Running {
  child: ChildProcessWithoutNullStreams
  rl: readline.Interface
  pending: Map<number, Pending>
  stderr: string[]
  status: 'starting' | 'ready' | 'error'
  error?: string
}

interface Entry {
  manifest: ExtensionManifest | null
  dir: string
  error?: string
}

const NAME_RE = /^[a-z0-9][a-z0-9_-]{0,40}$/
const TOOL_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function normalizeManifest(raw: unknown, dirName: string): ExtensionManifest {
  if (!raw || typeof raw !== 'object') throw new Error('manifest must be a JSON object')
  const obj = raw as Record<string, unknown>
  const name = asString(obj.name, dirName)
  if (!NAME_RE.test(name)) throw new Error(`invalid extension name: ${name}`)
  const version = asString(obj.version, '0.0.0')
  const description = asString(obj.description, '')

  const rawCommand = obj.command
  let command: string[] = []
  if (Array.isArray(rawCommand) && rawCommand.length && rawCommand.every((part) => typeof part === 'string')) {
    command = rawCommand as string[]
  } else if (typeof rawCommand === 'string' && rawCommand.trim()) {
    command = [rawCommand.trim()]
  } else {
    throw new Error('manifest.command must be a string or string[]')
  }

  const tools: ExtensionTool[] = []
  if (Array.isArray(obj.tools)) {
    for (const item of obj.tools) {
      if (!item || typeof item !== 'object') continue
      const tool = item as Record<string, unknown>
      const toolName = asString(tool.name)
      if (!TOOL_RE.test(toolName)) continue
      tools.push({
        name: toolName,
        description: asString(tool.description),
        parameters:
          tool.parameters && typeof tool.parameters === 'object'
            ? (tool.parameters as Record<string, unknown>)
            : { type: 'object', properties: {} }
      })
    }
  }

  const hooks = Array.isArray(obj.hooks) ? obj.hooks.filter((h): h is string => typeof h === 'string') : []
  const timeoutMs = Math.min(3_600_000, Math.max(1000, Number(obj.timeoutMs) || 300_000))
  const perms = (obj.permissions && typeof obj.permissions === 'object' ? obj.permissions : {}) as Record<string, unknown>

  return {
    name,
    version,
    description,
    command,
    tools,
    hooks,
    timeoutMs,
    permissions: {
      shell: perms.shell === true,
      network: perms.network === true,
      projectWrite: perms.projectWrite === true
    }
  }
}

function extractText(result: unknown): { output: string; isError: boolean } {
  if (typeof result === 'string') return { output: result, isError: false }
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>
    const isError = obj.isError === true || obj.ok === false
    if (Array.isArray(obj.content)) {
      const text = obj.content
        .map((part) => {
          if (typeof part === 'string') return part
          if (part && typeof part === 'object' && typeof (part as Record<string, unknown>).text === 'string') {
            return (part as Record<string, unknown>).text as string
          }
          return ''
        })
        .filter(Boolean)
        .join('\n')
      if (text) return { output: text, isError }
    }
    if (typeof obj.content === 'string') return { output: obj.content, isError }
    if (typeof obj.output === 'string') return { output: obj.output, isError }
    if (typeof obj.error === 'string') return { output: obj.error, isError: true }
    return { output: JSON.stringify(result, null, 2), isError }
  }
  return { output: String(result ?? ''), isError: false }
}

export class ExtensionHost {
  private entries = new Map<string, Entry>()
  private running = new Map<string, Running>()
  private starting = new Map<string, Promise<Running>>()
  private seq = 0
  private stopping = false

  discover(): void {
    this.entries.clear()
    let dirs: fs.Dirent[] = []
    try {
      dirs = fs.readdirSync(config.extensionsDir, { withFileTypes: true })
    } catch {
      return
    }
    for (const dir of dirs) {
      if (!dir.isDirectory() || dir.name.startsWith('.') || dir.name === 'sdk') continue
      const extDir = path.join(config.extensionsDir, dir.name)
      const manifestPath = path.join(extDir, 'extension.json')
      if (!fs.existsSync(manifestPath)) continue
      try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as unknown
        const manifest = normalizeManifest(raw, dir.name)
        this.entries.set(manifest.name, { manifest, dir: extDir })
      } catch (error) {
        this.entries.set(dir.name, {
          manifest: null,
          dir: extDir,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }

  list(): ExtensionInfo[] {
    return [...this.entries.entries()].map(([name, entry]) => {
      const running = this.running.get(name)
      return {
        name,
        version: entry.manifest?.version ?? '0.0.0',
        description: entry.manifest?.description ?? '',
        tools: entry.manifest?.tools ?? [],
        hooks: entry.manifest?.hooks ?? [],
        status: entry.error ? 'error' : running?.status ?? 'stopped',
        ...(entry.error ? { error: entry.error } : running?.error ? { error: running.error } : {})
      }
    })
  }

  toolDefs(): ToolDef[] {
    const defs: ToolDef[] = []
    for (const entry of this.entries.values()) {
      if (!entry.manifest) continue
      for (const tool of entry.manifest.tools) {
        defs.push({
          type: 'function',
          function: {
            name: this.fullToolName(entry.manifest.name, tool.name),
            description: `[extension:${entry.manifest.name}] ${tool.description}`,
            parameters: tool.parameters
          }
        })
      }
    }
    return defs
  }

  private fullToolName(extension: string, tool: string): string {
    return `ext_${extension}_${tool}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  findTool(fullName: string): { extension: string; tool: string } | null {
    for (const entry of this.entries.values()) {
      if (!entry.manifest) continue
      for (const tool of entry.manifest.tools) {
        if (this.fullToolName(entry.manifest.name, tool.name) === fullName) {
          return { extension: entry.manifest.name, tool: tool.name }
        }
      }
    }
    return null
  }

  async callTool(fullName: string, args: Record<string, unknown>, projectPath: string): Promise<ToolResult> {
    const found = this.findTool(fullName)
    if (!found) return { ok: false, output: `Unknown extension tool: ${fullName}` }
    const entry = this.entries.get(found.extension)
    if (!entry?.manifest) return { ok: false, output: `Extension unavailable: ${found.extension}` }
    if (!isInside(config.projectsDir, projectPath)) {
      return { ok: false, output: 'Project path is outside the KS Agent projects directory' }
    }
    try {
      const running = await this.ensureStarted(found.extension, entry)
      const result = await this.request(
        running,
        'tools/call',
        { name: found.tool, arguments: args, projectPath },
        entry.manifest.timeoutMs
      )
      const { output, isError } = extractText(result)
      return { ok: !isError, output: output.slice(0, config.maxToolOutput) }
    } catch (error) {
      return { ok: false, output: `Extension ${found.extension} failed: ${error instanceof Error ? error.message : String(error)}` }
    }
  }

  async runHook(name: string, projectPath: string, data: Record<string, unknown> = {}): Promise<void> {
    for (const entry of this.entries.values()) {
      if (!entry.manifest || !entry.manifest.hooks.includes(name)) continue
      if (!isInside(config.projectsDir, projectPath)) continue
      try {
        const running = await this.ensureStarted(entry.manifest.name, entry)
        await this.request(running, 'hook', { name, projectPath, data }, 60_000)
      } catch (error) {
        console.warn(`[extension:${entry.manifest.name}] hook ${name} failed:`, error instanceof Error ? error.message : error)
      }
    }
  }

  async reload(): Promise<ExtensionInfo[]> {
    await this.stopAll()
    this.discover()
    return this.list()
  }

  async stopAll(): Promise<void> {
    this.stopping = true
    const children = [...this.running.values()]
    this.running.clear()
    for (const running of children) {
      try {
        running.rl.close()
        running.child.kill('SIGTERM')
      } catch {
        // already gone
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
    for (const running of children) {
      if (running.child.exitCode === null) {
        try {
          running.child.kill('SIGKILL')
        } catch {
          // already gone
        }
      }
      for (const pending of running.pending.values()) {
        clearTimeout(pending.timer)
        pending.reject(new Error('Extension stopped'))
      }
      running.pending.clear()
    }
    this.starting.clear()
    this.stopping = false
  }

  private ensureStarted(name: string, entry: Entry): Promise<Running> {
    const existing = this.running.get(name)
    if (existing && existing.status === 'ready') return Promise.resolve(existing)
    const inFlight = this.starting.get(name)
    if (inFlight) return inFlight
    if (!entry.manifest) return Promise.reject(new Error(entry.error ?? 'Invalid extension'))
    const promise = this.spawnAndInitialize(name, entry).finally(() => this.starting.delete(name))
    this.starting.set(name, promise)
    return promise
  }

  private async spawnAndInitialize(name: string, entry: Entry): Promise<Running> {
    const manifest = entry.manifest as ExtensionManifest
    const [command, ...args] = manifest.command
    const child = spawn(command, args, {
      cwd: entry.dir,
      env: {
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? entry.dir,
        LANG: process.env.LANG ?? 'C.UTF-8',
        NODE_ENV: 'production',
        KS_EXTENSION: name,
        KS_EXTENSION_DIR: entry.dir
      },
      stdio: ['pipe', 'pipe', 'pipe']
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')

    const running: Running = {
      child,
      rl: readline.createInterface({ input: child.stdout }),
      pending: new Map(),
      stderr: [],
      status: 'starting'
    }
    this.running.set(name, running)

    child.stderr.on('data', (text: string) => {
      const line = text.trim()
      if (!line) return
      running.stderr.push(line)
      if (running.stderr.length > 30) running.stderr.shift()
      console.warn(`[extension:${name}] ${line}`)
    })

    child.on('error', (error) => {
      running.status = 'error'
      running.error = error.message
      this.failPending(running, error)
    })

    child.on('exit', (code, signal) => {
      const expected = this.stopping
      running.status = 'error'
      if (!expected) {
        running.error = `exited (code=${code ?? 'null'}, signal=${signal ?? 'none'})${running.stderr.length ? `: ${running.stderr.at(-1)}` : ''}`
        console.warn(`[extension:${name}] ${running.error}`)
      }
      this.running.delete(name)
      this.failPending(running, new Error(`Extension ${name} exited`))
    })

    running.rl.on('line', (line) => {
      if (!line.trim()) return
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(line) as Record<string, unknown>
      } catch {
        console.warn(`[extension:${name}] non-JSON stdout: ${line.slice(0, 300)}`)
        return
      }
      if (typeof msg.id !== 'number') return
      const pending = running.pending.get(msg.id)
      if (!pending) return
      running.pending.delete(msg.id)
      clearTimeout(pending.timer)
      if (msg.error && typeof msg.error === 'object') {
        const err = msg.error as Record<string, unknown>
        pending.reject(new Error(asString(err.message, 'Extension error')))
      } else {
        pending.resolve(msg.result)
      }
    })

    try {
      await this.request(running, 'initialize', { protocolVersion: 1, name }, 20_000)
      const listed = await this.request(running, 'tools/list', {}, 20_000).catch(() => null)
      const listedTools = listed && typeof listed === 'object' ? (listed as Record<string, unknown>).tools : null
      if (Array.isArray(listedTools)) {
        const dynamic: ExtensionTool[] = []
        for (const item of listedTools) {
          if (!item || typeof item !== 'object') continue
          const tool = item as Record<string, unknown>
          const toolName = asString(tool.name)
          if (!TOOL_RE.test(toolName)) continue
          dynamic.push({
            name: toolName,
            description: asString(tool.description),
            parameters:
              tool.parameters && typeof tool.parameters === 'object'
                ? (tool.parameters as Record<string, unknown>)
                : tool.inputSchema && typeof tool.inputSchema === 'object'
                  ? (tool.inputSchema as Record<string, unknown>)
                  : { type: 'object', properties: {} }
          })
        }
        if (dynamic.length) manifest.tools = dynamic
      }
      running.status = 'ready'
      return running
    } catch (error) {
      running.status = 'error'
      running.error = error instanceof Error ? error.message : String(error)
      try {
        child.kill('SIGTERM')
      } catch {
        // ignore
      }
      throw error
    }
  }

  private failPending(running: Running, error: Error): void {
    for (const pending of running.pending.values()) {
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    running.pending.clear()
  }

  private request(running: Running, method: string, params: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (running.child.exitCode !== null || !running.child.stdin.writable) {
        reject(new Error('Extension process is not running'))
        return
      }
      const id = ++this.seq
      const timer = setTimeout(() => {
        running.pending.delete(id)
        reject(new Error(`Extension request timed out after ${Math.round(timeoutMs / 1000)}s (${method})`))
      }, timeoutMs)
      running.pending.set(id, { resolve, reject, timer })
      try {
        running.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      } catch (error) {
        clearTimeout(timer)
        running.pending.delete(id)
        reject(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }
}

export const extensions = new ExtensionHost()
extensions.discover()
