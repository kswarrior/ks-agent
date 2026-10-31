import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import {
  DEFAULT_SKIP_DIRS,
  isProbablyBinary,
  matchesGlob,
  resolveInProject,
  unsafeCommand,
  walkEntries,
  walkFiles
} from './fsx.js'
import {
  gitBranches,
  gitCheckout,
  gitCommit,
  gitCreateBranch,
  gitDiff,
  gitInit,
  gitLog,
  gitPull,
  gitPush,
  gitStatus
} from './git.js'
import {
  describePreview,
  getPreview,
  startPreview,
  stopPreview,
  waitForPreview
} from './preview.js'
import type { AgentEvent, ToolDef, ToolResult } from './types.js'

export interface ToolContext {
  projectId?: string
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
      name: 'read_multiple_files',
      description:
        'Read several UTF-8 text files inside the project in one call. Returns each file with numbered lines and a header. Use offset/limit per file for large files.',
      parameters: {
        type: 'object',
        properties: {
          paths: {
            type: 'array',
            items: { type: 'string' },
            description: 'File paths relative to the project root (1-30 files)'
          },
          offset: { type: 'integer', description: 'First line to return for each file (1-based, default 1)' },
          limit: { type: 'integer', description: 'Max lines per file (default 200, max 1000)' }
        },
        required: ['paths']
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
      name: 'apply_patch',
      description:
        'Apply a unified diff patch to a file inside the project. The patch must contain @@ hunk headers (e.g. "@@ -1,3 +1,3 @@" with context, - and + lines). More robust than edit_file for multi-line or multi-hunk changes. Creates the file when the patch adds it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the project root' },
          patch: { type: 'string', description: 'Unified diff text with @@ hunk headers' }
        },
        required: ['path', 'patch']
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
      name: 'find_files',
      description:
        'Find files or directories by NAME inside the project (filename search, not content search). Use this to locate a file when you know part of its name. match:"contains" (default) searches substrings, match:"glob" accepts patterns like "*.test.ts", match:"regex" accepts a JavaScript regular expression. Skips node_modules, .git and build outputs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'File/directory name, substring, glob or regex to find' },
          path: { type: 'string', description: 'Base directory relative to the project root (default ".")' },
          match: { type: 'string', enum: ['contains', 'glob', 'regex'], description: 'Matching mode (default "contains")' },
          type: { type: 'string', enum: ['file', 'dir', 'any'], description: 'Limit results to files, directories or any (default "file")' },
          ignore_case: { type: 'boolean', description: 'Case-insensitive matching (default true)' },
          limit: { type: 'integer', description: 'Max results (default 100, max 1000)' },
          offset: { type: 'integer', description: 'Result offset for pagination (default 0)' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'tree',
      description:
        'Show a directory tree inside the project. Useful to understand project structure quickly. Skips node_modules, .git and build outputs.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory relative to the project root (default ".")' },
          depth: { type: 'integer', description: 'Max depth to render (default 3, max 10)' },
          limit: { type: 'integer', description: 'Max entries to render (default 500, max 5000)' }
        },
        required: []
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
      name: 'create_dir',
      description: 'Create a directory (and parents) inside the project. Succeeds if it already exists.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Directory path relative to the project root' }
        },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'copy_file',
      description: 'Copy a file or directory inside the project. Fails if the destination exists unless overwrite is true.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source path relative to the project root' },
          to: { type: 'string', description: 'Destination path relative to the project root' },
          overwrite: { type: 'boolean', description: 'Replace an existing destination (default false)' }
        },
        required: ['from', 'to']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'append_file',
      description: 'Append text to a file inside the project (creates it if missing, max 2 MB total). Use for logs or adding without reading the whole file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path relative to the project root' },
          content: { type: 'string', description: 'Text to append' }
        },
        required: ['path', 'content']
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
      name: 'preview_app',
      description:
        'Start, stop or inspect the project web app in the live preview window. Start runs the dev server inside the project (auto-detects npm/pnpm/yarn/bun scripts, framework, port and subfolders such as frontend/) and opens a floating preview in the UI. Prefer this over run_shell for starting web apps so the user can see and interact with the result. Omit command/port to auto-detect, or pass them to override. Use status to read the URL and recent logs.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['start', 'stop', 'status'],
            description: 'Action to perform (default "start")'
          },
          command: {
            type: 'string',
            description: 'Optional shell command to start the app, for example "npm run dev"'
          },
          port: {
            type: 'integer',
            description: 'Optional port between 1024 and 65535; defaults to the detected port'
          },
          cwd: {
            type: 'string',
            description: 'Optional folder inside the project to run the command in'
          }
        },
        required: ['action']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'update_plan',
      description:
        'Create or replace plan.md with a short checklist of high-level phases (for example explore, reproduce, fix, test). Use it for multi-step work and call it again with updated done flags as phases finish. Do not list individual tool calls as plan steps.',
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
  },
  {
    type: 'function',
    function: {
      name: 'git_init',
      description: 'Initialize a git repository in the project (if not already initialized) and set the initial branch.',
      parameters: {
        type: 'object',
        properties: {
          branch: { type: 'string', description: 'Initial branch name (default "main")' }
        },
        required: []
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_status',
      description: 'Show native git status for the project: branch, changed files and short diff stat.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_diff',
      description: 'Show native git diff for the project (stat + capped unified diff). Supports staged, ref, a single file, or stat_only.',
      parameters: {
        type: 'object',
        properties: {
          staged: { type: 'boolean', description: 'Show staged (--staged) diff (default false)' },
          ref: { type: 'string', description: 'Optional ref to diff against (branch or SHA)' },
          file: { type: 'string', description: 'Optional single file relative to the project root' },
          stat_only: { type: 'boolean', description: 'Only show --stat (default false)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_log',
      description: 'Show recent native git commits (%h %ad %an %s).',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Commits to show 1-100 (default 20)' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_branch',
      description: 'List, create or checkout git branches in the project.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['list', 'create', 'checkout'], description: 'Action (default "list")' },
          name: { type: 'string', description: 'Branch name for create/checkout' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_commit',
      description: 'Stage files (all by default) and create a git commit in the project.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Commit message (1-2000 chars)' },
          files: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional relative files to stage (max 100); omit to stage all changes'
          }
        },
        required: ['message']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_push',
      description: 'Push the current branch to a git remote (never force-pushes).',
      parameters: {
        type: 'object',
        properties: {
          remote: { type: 'string', description: 'Remote name (default "origin")' },
          branch: { type: 'string', description: 'Optional branch to push' }
        }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'git_pull',
      description: 'Pull from a git remote with --ff-only (never creates merge commits).',
      parameters: {
        type: 'object',
        properties: {
          remote: { type: 'string', description: 'Remote name (default "origin")' },
          branch: { type: 'string', description: 'Optional branch to pull' }
        }
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

async function findFilesTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const query = str(args, 'query').trim()
  if (!query) return fail('query is required')
  if (query.length > 300) return fail('query is too long (max 300 chars)')
  const base = str(args, 'path', '.') || '.'
  if (!resolve(ctx, base)) return fail(`Refusing path outside project: ${base}`)
  const type = str(args, 'type', 'file').toLowerCase()
  if (!['file', 'dir', 'any'].includes(type)) return fail('type must be "file", "dir" or "any"')
  const match = str(args, 'match', 'contains').toLowerCase()
  if (!['contains', 'glob', 'regex'].includes(match)) return fail('match must be "contains", "glob" or "regex"')
  const ignoreCase = bool(args, 'ignore_case', true)
  const limit = int(args, 'limit', 100, 1, 1000)
  const offset = int(args, 'offset', 0, 0, 100_000)

  let re: RegExp | null = null
  if (match === 'regex') {
    try {
      re = new RegExp(query, ignoreCase ? 'i' : '')
    } catch (error) {
      return fail(`Invalid regex: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const needle = query.replace(/\\/g, '/')
  const lowered = needle.toLowerCase()
  const entries = walkEntries(ctx.projectPath, base, { maxFiles: 50_000 })
  const scored: Array<{ path: string; dir: boolean; score: number }> = []

  for (const entry of entries) {
    if (type === 'file' && entry.dir) continue
    if (type === 'dir' && !entry.dir) continue
    const name = entry.path.split('/').pop() ?? entry.path
    let score = -1
    if (match === 'glob') {
      const globPath = ignoreCase ? entry.path.toLowerCase() : entry.path
      const globName = ignoreCase ? name.toLowerCase() : name
      const globQuery = ignoreCase ? needle.toLowerCase() : needle
      if (matchesGlob(globPath, globQuery) || matchesGlob(globName, globQuery)) score = 0
    } else if (match === 'regex') {
      if (re && (re.test(name) || re.test(entry.path))) score = 0
    } else {
      const haystack = ignoreCase ? name.toLowerCase() : name
      const target = ignoreCase ? lowered : needle
      if (haystack === target) score = 0
      else if (haystack.startsWith(target)) score = 1
      else if (haystack.includes(target)) score = 2
      else {
        const full = ignoreCase ? entry.path.toLowerCase() : entry.path
        if (full.includes(target)) score = 3
      }
    }
    if (score >= 0) scored.push({ path: entry.path, dir: entry.dir, score })
  }

  scored.sort((a, b) => a.score - b.score || a.path.localeCompare(b.path))
  const total = scored.length
  const page = scored.slice(offset, offset + limit)
  if (!page.length) {
    return {
      ok: true,
      output: total
        ? `No more results at offset ${offset} (${total} total matches for "${query}")`
        : `No files or directories matching "${query}" in ${base}`
    }
  }
  const body = page.map((entry) => `${entry.path}${entry.dir ? '/' : ''}`).join('\n')
  const suffix =
    total > offset + page.length ? `\n[... ${total - offset - page.length} more; use offset=${offset + page.length}]` : ''
  return { ok: true, output: `Found ${page.length} of ${total} match(es) for "${query}" in ${base}\n${body}${suffix}` }
}

async function treeTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const rel = str(args, 'path', '.') || '.'
  const abs = resolve(ctx, rel)
  if (!abs) return fail(`Refusing path outside project: ${rel}`)
  const stat = fs.statSync(abs)
  if (!stat.isDirectory()) return fail(`${rel} is not a directory`)
  const maxDepth = int(args, 'depth', 3, 1, 10)
  const maxEntries = int(args, 'limit', 500, 1, 5000)
  const lines: string[] = []
  let truncated = false

  const walk = (dir: string, prefix: string, depthLeft: number): void => {
    if (truncated) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    entries = entries
      .filter((entry) => !entry.isSymbolicLink() && !(entry.isDirectory() && DEFAULT_SKIP_DIRS.has(entry.name)))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    for (let i = 0; i < entries.length; i++) {
      if (lines.length >= maxEntries) {
        truncated = true
        return
      }
      const entry = entries[i]
      const last = i === entries.length - 1
      const isDir = entry.isDirectory()
      lines.push(`${prefix}${last ? '└── ' : '├── '}${entry.name}${isDir ? '/' : ''}`)
      if (isDir && depthLeft > 1) {
        walk(path.join(dir, entry.name), `${prefix}${last ? '    ' : '│   '}`, depthLeft - 1)
      }
    }
  }

  lines.push(rel === '.' ? '.' : `${rel.replace(/\/+$/, '')}/`)
  walk(abs, '', maxDepth)
  const suffix = truncated ? `\n[... truncated at ${maxEntries} entries]` : ''
  return { ok: true, output: `${lines.join('\n')}${suffix}` }
}

async function createDirTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const rel = str(args, 'path')
  if (!rel) return fail('path is required')
  const abs = resolve(ctx, rel)
  if (!abs) return fail(`Refusing path outside project: ${rel}`)
  if (fs.existsSync(abs)) {
    if (!fs.statSync(abs).isDirectory()) return fail(`${rel} exists and is not a directory`)
    return { ok: true, output: `Directory already exists: ${rel}` }
  }
  fs.mkdirSync(abs, { recursive: true })
  return { ok: true, output: `Created directory ${rel}` }
}

async function copyFileTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const from = str(args, 'from')
  const to = str(args, 'to')
  if (!from || !to) return fail('from and to are required')
  const absFrom = resolve(ctx, from)
  const absTo = resolve(ctx, to)
  if (!absFrom || !absTo) return fail('Refusing path outside project')
  if (path.resolve(absFrom) === path.resolve(absTo)) return fail('from and to are the same path')
  const stat = fs.statSync(absFrom)
  const absFromResolved = path.resolve(absFrom)
  const absToResolved = path.resolve(absTo)
  if (stat.isDirectory() && (absToResolved === absFromResolved || absToResolved.startsWith(absFromResolved + path.sep))) {
    return fail('Cannot copy a directory into itself')
  }
  const overwrite = bool(args, 'overwrite')
  if (fs.existsSync(absTo)) {
    if (!overwrite) return fail(`Destination already exists: ${to} (use overwrite:true)`)
    fs.rmSync(absTo, { recursive: true, force: true })
  }
  fs.mkdirSync(path.dirname(absTo), { recursive: true })
  if (stat.isDirectory()) {
    fs.cpSync(absFrom, absTo, {
      recursive: true,
      dereference: true,
      filter: (source) => {
        if (path.resolve(source) === absFromResolved) return true
        try {
          return !fs.lstatSync(source).isSymbolicLink()
        } catch {
          return false
        }
      }
    })
    return { ok: true, output: `Copied directory ${from} -> ${to}` }
  }
  fs.copyFileSync(absFrom, absTo)
  return { ok: true, output: `Copied ${stat.size} bytes from ${from} -> ${to}` }
}

async function appendFileTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const rel = str(args, 'path')
  const content = str(args, 'content')
  if (!rel) return fail('path is required')
  if (!content) return fail('content is required')
  const abs = resolve(ctx, rel)
  if (!abs) return fail(`Refusing path outside project: ${rel}`)
  let existing = 0
  try {
    existing = fs.statSync(abs).size
  } catch {
    existing = 0
  }
  const added = Buffer.byteLength(content, 'utf8')
  if (existing + added > 2 * 1024 * 1024) return fail('resulting file would exceed 2 MB')
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.appendFileSync(abs, content, 'utf8')
  return { ok: true, output: `Appended ${added} bytes to ${rel} (now ${existing + added} bytes)` }
}

async function readMultipleFilesTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const rawPaths = Array.isArray(args.paths) ? args.paths : []
  const paths = rawPaths.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
  if (!paths.length) return fail('paths must contain at least one file path')
  if (paths.length > 30) return fail('too many paths (max 30)')
  const offset = int(args, 'offset', 1, 1, 1_000_000)
  const limit = int(args, 'limit', 200, 1, 1000)
  const sections: string[] = []
  let failures = 0

  for (const rel of paths) {
    const abs = resolve(ctx, rel)
    if (!abs) {
      failures++
      sections.push(`=== ${rel} ===\n[error: path outside project]`)
      continue
    }
    try {
      const stat = fs.statSync(abs)
      if (stat.isDirectory()) throw new Error('is a directory; use list_dir or tree')
      const buffer = fs.readFileSync(abs)
      ensureText(buffer, rel)
      const all = buffer.toString('utf8').split('\n')
      const selected = all.slice(offset - 1, offset - 1 + limit)
      const numbered = selected.map((line, index) => `${offset + index}: ${line}`).join('\n')
      const suffix = offset - 1 + selected.length < all.length ? `\n[... ${all.length} lines total]` : ''
      sections.push(`=== ${rel} ===\n${numbered}${suffix}`)
    } catch (error) {
      failures++
      const message = error instanceof Error ? error.message : String(error)
      sections.push(`=== ${rel} ===\n[error: ${message}]`)
    }
  }

  return { ok: failures === 0, output: truncate(sections.join('\n\n')) }
}

interface PatchHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: string[]
}

function parsePatchHunks(patch: string): PatchHunk[] {
  const lines = patch.replace(/\r\n/g, '\n').split('\n')
  const hunks: PatchHunk[] = []
  let index = 0
  while (index < lines.length) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(lines[index])
    if (!header) {
      index++
      continue
    }
    const hunkLines: string[] = []
    index++
    while (index < lines.length) {
      const line = lines[index]
      if (line.startsWith('@@ ') || line.startsWith('diff --git ')) break
      if (line === '' || line === '\\ No newline at end of file') {
        index++
        continue
      }
      const marker = line[0]
      if (marker !== ' ' && marker !== '+' && marker !== '-') break
      hunkLines.push(line)
      index++
    }
    hunks.push({
      oldStart: Number(header[1]),
      oldCount: header[2] === undefined ? 1 : Number(header[2]),
      newStart: Number(header[3]),
      newCount: header[4] === undefined ? 1 : Number(header[4]),
      lines: hunkLines
    })
  }
  return hunks
}

async function applyPatchTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const rel = str(args, 'path')
  const patch = str(args, 'patch')
  if (!rel) return fail('path is required')
  if (!patch.trim()) return fail('patch is required')
  const abs = resolve(ctx, rel)
  if (!abs) return fail(`Refusing path outside project: ${rel}`)
  const hunks = parsePatchHunks(patch)
  if (!hunks.length) return fail('no valid hunks found; patch must contain @@ -old,count +new,count @@ headers')
  const exists = fs.existsSync(abs)
  if (exists && fs.statSync(abs).isDirectory()) return fail(`${rel} is a directory`)
  const original = exists ? fs.readFileSync(abs) : Buffer.from('')
  ensureText(original, rel)
  const resultLines = original.toString('utf8').split('\n')
  let lineOffset = 0
  let insertions = 0
  let deletions = 0

  for (const hunk of hunks) {
    const expected: string[] = []
    const replacement: string[] = []
    for (const raw of hunk.lines) {
      const marker = raw[0]
      const text = raw.slice(1)
      if (marker === ' ') {
        expected.push(text)
        replacement.push(text)
      } else if (marker === '-') {
        expected.push(text)
        deletions++
      } else {
        replacement.push(text)
        insertions++
      }
    }
    const start = Math.max(0, (hunk.oldStart === 0 ? 0 : hunk.oldStart - 1) + lineOffset)
    const actual = resultLines.slice(start, start + expected.length)
    const mismatch = expected.findIndex((line, index) => actual[index] !== line)
    if (actual.length !== expected.length || mismatch !== -1) {
      const badIndex = mismatch === -1 ? actual.length : mismatch
      const wanted = expected[badIndex] ?? '(missing line)'
      const got = actual[badIndex] ?? '(missing line)'
      return fail(
        `Patch context mismatch in ${rel} at line ${start + badIndex + 1}: expected ${JSON.stringify(wanted)} but found ${JSON.stringify(got)}`
      )
    }
    resultLines.splice(start, expected.length, ...replacement)
    lineOffset += replacement.length - expected.length
  }

  const next = resultLines.join('\n')
  if (Buffer.byteLength(next, 'utf8') > 2 * 1024 * 1024) return fail('patched content would exceed 2 MB')
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, next, 'utf8')
  return {
    ok: true,
    output: `Patched ${rel}: ${hunks.length} hunk(s), ${insertions} insertion(s), ${deletions} deletion(s), ${resultLines.length} lines`
  }
}

async function gitTool(label: string, run: () => Promise<string>): Promise<ToolResult> {
  try {
    return { ok: true, output: truncate(await run()) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return fail(`${label} failed: ${message}`)
  }
}

async function gitInitTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  return gitTool('git_init', () => gitInit(ctx.projectPath, str(args, 'branch', 'main') || 'main'))
}

async function gitStatusTool(_args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  return gitTool('git_status', () => gitStatus(ctx.projectPath))
}

async function gitDiffTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  return gitTool('git_diff', () =>
    gitDiff(ctx.projectPath, {
      staged: bool(args, 'staged'),
      ref: str(args, 'ref') || undefined,
      file: str(args, 'file') || undefined,
      statOnly: bool(args, 'stat_only')
    })
  )
}

async function gitLogTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  return gitTool('git_log', () => gitLog(ctx.projectPath, int(args, 'limit', 20, 1, 100)))
}

async function gitBranchTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const action = str(args, 'action', 'list').toLowerCase() || 'list'
  const name = str(args, 'name')
  return gitTool('git_branch', async () => {
    if (action === 'list') return gitBranches(ctx.projectPath)
    if (!name) throw new Error('name is required for create/checkout')
    if (action === 'create') return gitCreateBranch(ctx.projectPath, name, true)
    if (action === 'checkout') return gitCheckout(ctx.projectPath, name)
    throw new Error('action must be list, create or checkout')
  })
}

async function gitCommitTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const message = str(args, 'message')
  if (!message.trim()) return fail('message is required')
  return gitTool('git_commit', () => gitCommit(ctx.projectPath, message, args.files))
}

async function gitPushTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  return gitTool('git_push', () =>
    gitPush(ctx.projectPath, str(args, 'remote', 'origin') || 'origin', str(args, 'branch') || undefined)
  )
}

async function gitPullTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  return gitTool('git_pull', () =>
    gitPull(ctx.projectPath, str(args, 'remote', 'origin') || 'origin', str(args, 'branch') || undefined)
  )
}

async function previewAppTool(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  if (!ctx.projectId) return fail('preview_app is only available inside a project')
  const project = { id: ctx.projectId, path: ctx.projectPath }
  const action = (str(args, 'action', 'start') || 'start').toLowerCase()
  try {
    if (action === 'status') return { ok: true, output: describePreview(getPreview(project), true) }
    if (action === 'stop') return { ok: true, output: describePreview(stopPreview(project), true) }
    if (action !== 'start') return fail('action must be start, stop or status')
    const rawPort = args.port
    const port =
      rawPort === undefined || rawPort === null || rawPort === ''
        ? undefined
        : int(args, 'port', 0, 1024, 65535)
    const started = await startPreview(project, {
      command: str(args, 'command') || undefined,
      cwd: str(args, 'cwd') || undefined,
      port
    })
    const status = (await waitForPreview(project.id, 30_000)) ?? started
    const output = describePreview(status, true)
    if (status.status === 'error') return fail(output)
    return { ok: true, output }
  } catch (error) {
    return fail(`preview_app failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const handlers: Record<string, (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>> = {
  read_file: readFileTool,
  read_multiple_files: readMultipleFilesTool,
  write_file: writeFileTool,
  edit_file: editFileTool,
  apply_patch: applyPatchTool,
  list_dir: listDirTool,
  tree: treeTool,
  find_files: findFilesTool,
  glob: globTool,
  grep: grepTool,
  get_file_info: fileInfoTool,
  create_dir: createDirTool,
  copy_file: copyFileTool,
  delete_file: deleteFileTool,
  move_file: moveFileTool,
  append_file: appendFileTool,
  run_shell: runShellTool,
  preview_app: previewAppTool,
  update_plan: updatePlanTool,
  git_init: gitInitTool,
  git_status: gitStatusTool,
  git_diff: gitDiffTool,
  git_log: gitLogTool,
  git_branch: gitBranchTool,
  git_commit: gitCommitTool,
  git_push: gitPushTool,
  git_pull: gitPullTool
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
