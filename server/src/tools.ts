import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import { isProbablyBinary, matchesGlob, resolveInProject, unsafeCommand, walkFiles } from './fsx.js'
import type { AgentEvent, ToolDef, ToolResult } from './types.js'

export interface ToolContext {
  projectPath: string
  signal?: AbortSignal
  emit?: (event: AgentEvent) => void
}

export const builtinToolDefs: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a UTF-8 text file inside the project. Returns numbered lines. Use offset/limit for large files. Outside the project is forbidden.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the project root' },
          offset: { type: 'integer', description: 'First line to return (1-based, default 1)' },
          limit: { type: 'integer', description: 'Max lines to return (default 400, max 2000)' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'Create or overwrite a text file inside the project (max 2 MB). Parent directories are created. Outside the project is forbidden.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the project root' },
          content: { type: 'string', description: 'Full file content' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'Replace an exact snippet in a file. The snippet must occur exactly once unless replace_all is true. Outside the project is forbidden.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the project root' },
          old_string: { type: 'string', description: 'Exact text to replace' },
          new_string: { type: 'string', description: 'Replacement text' },
          replace_all: { type: 'boolean', description: 'Replace every occurrence (default false)' }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List files and directories inside the project. Outside the project is forbidden.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory relative to the project root (default ".")' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'glob',
      description:
        'Find files by glob pattern inside the project, e.g. "**/*.ts", "src/**/*.{tsx,ts}", "*.json". Skips node_modules, .git, build outputs.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Glob pattern' },
          path: { type: 'string', description: 'Base directory relative to the project root (default ".")' },
          limit: { type: 'integer', description: 'Max results (default 200, max 2000)' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'grep',
      description:
        'Search file contents inside the project with a regular expression. Returns path:line: text. Use include to filter files, e.g. "*.ts".',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'JavaScript regular expression' },
          path: { type: 'string', description: 'Directory relative to the project root (default ".")' },
          include: { type: 'string', description: 'Optional glob filter, e.g. "*.ts", "src/**/*.tsx"' },
          ignore_case: { type: 'boolean', description: 'Case-insensitive search (default false)' },
          max_results: { type: 'integer', description: 'Max matches (default 100, max 1000)' }
        },
        required: ['pattern']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_file_info',
      description: 'Get metadata for a file or directory inside the project without reading full content.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to the project root' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'Delete a file or directory inside the project. Use recursive:true for non-empty directories.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path relative to the project root' },
          recursive: { type: 'boolean', description: 'Delete directories recursively' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'move_file',
      description: 'Move or rename a file/directory inside the project.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Current path relative to the project root' },
          to: { type: 'string', description: 'New path relative to the project root' }
        },
        required: ['from', 'to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description:
        'Run a shell command inside the project directory. Use for installs, builds, tests, git, servers. Commands that escape the project or attack the host are rejected. Long output is truncated.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Shell command to execute' },
          timeout_ms: { type: 'integer', description: 'Timeout in milliseconds (default 120000, max 1800000)' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description:
        'Create or replace plan.md in the project with a checkbox plan. Use it to track multi-step work, and call it again with done:true as steps complete.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Plan title' },
          steps: {
            type: 'array',
            description: 'Ordered steps',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string', description: 'Step description' },
                done: { type: 'boolean', description: 'Whether the step is complete' }
              },
              required: ['text']
            }
          }
        },
        required: ['title', 'steps']
      }
    }
  }
]

export const BUILTIN_TOOL_NAMES = new Set(builtinToolDefs.map((tool) => tool.function.name))

function str(args: Record<string, unknown>, key: string, fallback = ''): string {
  const value = args[key]
  return typeof value === 'string' ? value : fallback
}

function int(args: Record<string, unknown>, key: string, fallback: number, min: number, max: number): number {
  const value = Number(args[key])
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}

function bool(args: Record<string, unknown>, key: string, fallback = false): boolean {
  return typeof args[key] === 'boolean' ? (args[key] as boolean) : fallback
}

function fail(message: string): ToolResult {
  return { ok: false, output: message }
}

function resolve(ctx: ToolContext, rel: string): string | null {
  return resolveInProject(ctx.projectPath, rel)
}

function truncate(text: string, max = config.maxToolOutput): string {
  if (text.length <= max) return text
  const head = Math.floor(max * 0.65)
  const tail = Math.floor(max * 0.3)
  return `${text.slice(0, head)}\n\n[... ${text.length - head - tail} chars truncated ...]\n\n${text.slice(-tail)}`
}

function ensureText(buffer: Buffer, file: string): void {
  if (buffer.length > 2 * 1024 * 1024) throw new Error(`${file} is larger than 2 MB`)
  if (isProbablyBinary(buffer)) throw new Error(`${file} looks binary; use run_shell for binary files`)
}

async function readFileTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const rel = str(args, 'path')
  if (!rel) return fail('path is required')
  const abs = resolve(ctx, rel)
  if (!abs) return fail(`Refusing path outside project: ${rel}`)
  const stat = fs.statSync(abs)
  if (stat.isDirectory()) return fail(`${rel} is a directory; use list_dir`)
  const buffer = fs.readFileSync(abs)
  ensureText(buffer, rel)
  const lines = buffer.toString('utf8').split('\n')
  const offset = int(args, 'offset', 1, 1, Math.max(1, lines.length))
  const limit = int(args, 'limit', 400, 1, 2000)
  const selected = lines.slice(offset - 1, offset - 1 + limit)
  const numbered = selected.map((line, i) => `${offset + i}: ${line}`).join('\n')
  const suffix = offset - 1 + selected.length < lines.length ? `\n[... ${lines.length} lines total]` : ''
  return { ok: true, output: numbered + suffix }
}

async function writeFileTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const rel = str(args, 'path')
  const content = str(args, 'content')
  if (!rel) return fail('path is required')
  if (Buffer.byteLength(content, 'utf8') > 2 * 1024 * 1024) return fail('content is larger than 2 MB')
  const abs = resolve(ctx, rel)
  if (!abs) return fail(`Refusing path outside project: ${rel}`)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content, 'utf8')
  return { ok: true, output: `Wrote ${Buffer.byteLength(content, 'utf8')} bytes to ${rel}` }
}

async function editFileTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const rel = str(args, 'path')
  const oldString = str(args, 'old_string')
  const newString = str(args, 'new_string')
  if (!rel || !oldString) return fail('path and old_string are required')
  const abs = resolve(ctx, rel)
  if (!abs) return fail(`Refusing path outside project: ${rel}`)
  const buffer = fs.readFileSync(abs)
  ensureText(buffer, rel)
  const text = buffer.toString('utf8')
  const count = text.split(oldString).length - 1
  if (count === 0) return fail(`old_string not found in ${rel}`)
  if (count > 1 && !bool(args, 'replace_all')) {
    return fail(`old_string occurs ${count} times in ${rel}; provide more context or set replace_all`)
  }
  const next = bool(args, 'replace_all') ? text.split(oldString).join(newString) : text.replace(oldString, newString)
  fs.writeFileSync(abs, next, 'utf8')
  const firstLine = text.slice(0, text.indexOf(oldString)).split('\n').length
  const where = count === 1 ? ` at line ${firstLine}` : `, first at line ${firstLine}`
  return { ok: true, output: `Updated ${rel} (${count} occurrence${count === 1 ? '' : 's'} replaced${where})` }
}

async function listDirTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const rel = str(args, 'path', '.') || '.'
  const abs = resolve(ctx, rel)
  if (!abs) return fail(`Refusing path outside project: ${rel}`)
  const entries = fs.readdirSync(abs, { withFileTypes: true })
  const lines = entries
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .slice(0, 1000)
    .map((entry) => {
      if (entry.isDirectory()) return `${entry.name}/`
      if (entry.isSymbolicLink()) return `${entry.name} -> symlink`
      try {
        return `${entry.name} (${fs.statSync(path.join(abs, entry.name)).size} B)`
      } catch {
        return entry.name
      }
    })
  return { ok: true, output: lines.join('\n') || '(empty directory)' }
}

async function globTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const pattern = str(args, 'pattern')
  if (!pattern) return fail('pattern is required')
  const base = str(args, 'path', '.') || '.'
  const limit = int(args, 'limit', 200, 1, 2000)
  const files = walkFiles(ctx.projectPath, base, { maxFiles: 20_000 })
  const matches = files.filter((file) => matchesGlob(file, pattern)).slice(0, limit)
  return {
    ok: true,
    output: matches.length ? matches.join('\n') : `No files match ${pattern}`
  }
}

async function grepTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const pattern = str(args, 'pattern')
  if (!pattern) return fail('pattern is required')
  let re: RegExp
  try {
    re = new RegExp(pattern, bool(args, 'ignore_case') ? 'i' : '')
  } catch (error) {
    return fail(`Invalid regex: ${error instanceof Error ? error.message : String(error)}`)
  }
  const base = str(args, 'path', '.') || '.'
  const include = str(args, 'include')
  const maxResults = int(args, 'max_results', 100, 1, 1000)
  const files = walkFiles(ctx.projectPath, base, { maxFiles: 20_000 })
  const results: string[] = []
  for (const rel of files) {
    if (include && !matchesGlob(rel, include)) continue
    const abs = path.join(ctx.projectPath, rel)
    let stat: fs.Stats
    try {
      stat = fs.statSync(abs)
    } catch {
      continue
    }
    if (stat.size > 512 * 1024) continue
    let buffer: Buffer
    try {
      buffer = fs.readFileSync(abs)
    } catch {
      continue
    }
    if (isProbablyBinary(buffer)) continue
    const lines = buffer.toString('utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue
      results.push(`${rel}:${i + 1}: ${lines[i].slice(0, 300)}`)
      if (results.length >= maxResults) break
    }
    if (results.length >= maxResults) break
  }
  return { ok: true, output: results.length ? results.join('\n') : `No matches for ${pattern}` }
}

async function fileInfoTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const rel = str(args, 'path')
  if (!rel) return fail('path is required')
  const abs = resolve(ctx, rel)
  if (!abs) return fail(`Refusing path outside project: ${rel}`)
  const stat = fs.statSync(abs)
  const info: string[] = [
    `path: ${rel}`,
    `type: ${stat.isDirectory() ? 'directory' : 'file'}`,
    `size: ${stat.size} bytes`,
    `modified: ${new Date(stat.mtimeMs).toISOString()}`
  ]
  if (stat.isFile() && stat.size <= 2 * 1024 * 1024) {
    const buffer = fs.readFileSync(abs)
    if (!isProbablyBinary(buffer)) info.push(`lines: ${buffer.toString('utf8').split('\n').length}`)
  }
  return { ok: true, output: info.join('\n') }
}

async function deleteFileTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const rel = str(args, 'path')
  if (!rel) return fail('path is required')
  const abs = resolve(ctx, rel)
  if (!abs) return fail(`Refusing path outside project: ${rel}`)
  if (path.resolve(abs) === path.resolve(ctx.projectPath)) return fail('Refusing to delete the project root')
  const recursive = bool(args, 'recursive')
  const stat = fs.lstatSync(abs)
  if (stat.isDirectory() && !recursive && fs.readdirSync(abs).length) {
    return fail(`${rel} is a non-empty directory; pass recursive:true`)
  }
  fs.rmSync(abs, { recursive, force: false })
  return { ok: true, output: `Deleted ${rel}` }
}

async function moveFileTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const from = str(args, 'from')
  const to = str(args, 'to')
  if (!from || !to) return fail('from and to are required')
  const absFrom = resolve(ctx, from)
  const absTo = resolve(ctx, to)
  if (!absFrom || !absTo) return fail('Refusing path outside project')
  fs.mkdirSync(path.dirname(absTo), { recursive: true })
  fs.renameSync(absFrom, absTo)
  return { ok: true, output: `Moved ${from} -> ${to}` }
}

let dockerAvailable: boolean | null = null

function hasDocker(): boolean {
  if (dockerAvailable !== null) return dockerAvailable
  const result = spawnSync('docker', ['--version'], { encoding: 'utf8' })
  dockerAvailable = result.status === 0
  return dockerAvailable
}

async function runShellTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const command = str(args, 'command')
  if (!command.trim()) return fail('command is required')
  const unsafe = unsafeCommand(command, ctx.projectPath)
  if (unsafe) return fail(`Command blocked (${unsafe})`)

  const timeoutMs = int(args, 'timeout_ms', config.shellTimeoutMs, 1000, 1_800_000)
  const useDocker = config.dockerJail && hasDocker()
  const dockerArgs = useDocker
    ? [
        'run',
        '--rm',
        '--network',
        'none',
        '--memory=512m',
        '--cpus=1',
        '-v',
        `${ctx.projectPath}:/workspace:rw`,
        '-w',
        '/workspace',
        config.dockerImage,
        'sh',
        '-lc',
        command
      ]
    : []

  return new Promise<ToolResult>((resolvePromise) => {
    const child = useDocker
      ? spawn('docker', dockerArgs, { cwd: ctx.projectPath, env: process.env })
      : spawn(process.env.SHELL || '/bin/bash', ['-lc', command], {
          cwd: ctx.projectPath,
          env: { ...process.env, KS_PROJECT_DIR: ctx.projectPath },
          detached: process.platform !== 'win32'
        })

    let stdout = ''
    let stderr = ''
    let timedOut = false
    let aborted = false
    let settled = false

    const killTree = () => {
      try {
        if (child.pid && process.platform !== 'win32' && !useDocker) process.kill(-child.pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch {
        // already exited
      }
    }

    const timer = setTimeout(() => {
      timedOut = true
      killTree()
    }, timeoutMs)

    const onAbort = () => {
      aborted = true
      killTree()
    }
    ctx.signal?.addEventListener('abort', onAbort, { once: true })

    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      ctx.signal?.removeEventListener('abort', onAbort)
      const parts: string[] = []
      if (stdout.trim()) parts.push(`stdout:\n${stdout.trimEnd()}`)
      if (stderr.trim()) parts.push(`stderr:\n${stderr.trimEnd()}`)
      parts.push(`exit code: ${code ?? 'null'}${timedOut ? ' (timed out)' : ''}${aborted ? ' (aborted)' : ''}`)
      resolvePromise({
        ok: code === 0 && !timedOut && !aborted,
        output: truncate(parts.join('\n\n'))
      })
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < config.maxToolOutput * 2) stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < config.maxToolOutput * 2) stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      stderr += `\n${error.message}`
      finish(1)
    })
    child.on('close', (code) => finish(code))
  })
}

async function updatePlanTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const title = str(args, 'title', 'Plan')
  const rawSteps = Array.isArray(args.steps) ? args.steps : []
  const steps: string[] = []
  for (const item of rawSteps) {
    if (typeof item === 'string') {
      steps.push(`- [ ] ${item}`)
      continue
    }
    if (!item || typeof item !== 'object') continue
    const step = item as Record<string, unknown>
    const text = typeof step.text === 'string' ? step.text : ''
    if (!text) continue
    steps.push(`- [${step.done === true ? 'x' : ' '}] ${text}`)
  }
  if (!steps.length) return fail('steps must contain at least one item')
  const content = `# ${title}\n\n${steps.join('\n')}\n`
  const abs = resolve(ctx, 'plan.md')
  if (!abs) return fail('Unable to write plan.md')
  fs.writeFileSync(abs, content, 'utf8')
  return { ok: true, output: `Updated plan.md\n\n${content}` }
}

const handlers: Record<string, (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>> = {
  read_file: readFileTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  list_dir: listDirTool,
  glob: globTool,
  grep: grepTool,
  get_file_info: fileInfoTool,
  delete_file: deleteFileTool,
  move_file: moveFileTool,
  run_shell: runShellTool,
  update_plan: updatePlanTool
}

export async function executeBuiltinTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  const handler = handlers[name]
  if (!handler) return fail(`Unknown tool: ${name}`)
  try {
    return await handler(args, ctx)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail(`${name} failed: ${message}`)
  }
}
