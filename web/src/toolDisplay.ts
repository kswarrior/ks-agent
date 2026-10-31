type ToolMeta = { action: string; running: string }

const TOOL_META: Record<string, ToolMeta> = {
  read_file: { action: 'Read', running: 'Reading' },
  read_multiple_files: { action: 'Read', running: 'Reading' },
  write_file: { action: 'Write', running: 'Writing' },
  edit_file: { action: 'Edit', running: 'Editing' },
  apply_patch: { action: 'Patch', running: 'Patching' },
  append_file: { action: 'Append', running: 'Appending' },
  create_dir: { action: 'Mkdir', running: 'Creating' },
  copy_file: { action: 'Copy', running: 'Copying' },
  list_dir: { action: 'List', running: 'Listing' },
  tree: { action: 'Tree', running: 'Scanning' },
  find_files: { action: 'Find', running: 'Finding' },
  glob: { action: 'Find', running: 'Finding' },
  grep: { action: 'Search', running: 'Searching' },
  get_file_info: { action: 'Inspect', running: 'Inspecting' },
  delete_file: { action: 'Delete', running: 'Deleting' },
  move_file: { action: 'Move', running: 'Moving' },
  run_shell: { action: 'Run', running: 'Running' },
  preview_app: { action: 'Preview', running: 'Starting preview' },
  update_plan: { action: 'Plan', running: 'Planning' },
  use_skill: { action: 'Skill', running: 'Loading skill' },
  git_init: { action: 'Git init', running: 'Initializing' },
  git_status: { action: 'Git status', running: 'Checking git' },
  git_diff: { action: 'Git diff', running: 'Diffing' },
  git_log: { action: 'Git log', running: 'Reading log' },
  git_branch: { action: 'Git branch', running: 'Branching' },
  git_commit: { action: 'Git commit', running: 'Committing' },
  git_push: { action: 'Git push', running: 'Pushing' },
  git_pull: { action: 'Git pull', running: 'Pulling' },
  'tool result': { action: 'Result', running: 'Working' }
}

export function toolLabel(name: string, running = false): string {
  const meta = TOOL_META[name]
  return running ? meta?.running ?? name : meta?.action ?? name
}

export function parseToolArgs(raw?: string): Record<string, unknown> {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

export function argsString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

export function baseName(file: string): string {
  const parts = file.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? file
}

function trimRoot(rootPath: string): string {
  return rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function absolutePath(rootPath: string, file: string): string {
  const root = trimRoot(rootPath)
  const clean = file.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '')
  if (!clean || clean === '.') return root || '/'
  if (root && clean.startsWith(`${root}/`)) return clean
  if (!root) return `/${clean}`
  return `${root}/${clean}`
}

function displayPath(file: string, rootPath?: string): string {
  const clean = file.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (!clean || clean === '.') return rootPath ? trimRoot(rootPath) || '/' : '/'
  if (rootPath) return absolutePath(rootPath, clean)
  return clean.startsWith('/') ? clean : `/${clean}`
}

export function shortenPath(path: string, max = 72): string {
  if (path.length <= max) return path
  const head = Math.max(12, Math.ceil((max - 3) * 0.38))
  const tail = max - 3 - head
  return `${path.slice(0, head)}...${path.slice(-tail)}`
}

export function describeTool(
  name: string,
  args: Record<string, unknown>,
  rootPath?: string
): { primary: string; detail: string } {
  const rawPath = argsString(args, 'path')
  const path = rawPath ? displayPath(rawPath, rootPath) : ''
  switch (name) {
    case 'run_shell':
      return { primary: argsString(args, 'command'), detail: '' }
    case 'preview_app': {
      const action = argsString(args, 'action') || 'start'
      const port = args.port === undefined ? '' : String(args.port)
      return {
        primary: action === 'stop' ? 'Stop preview' : action === 'status' ? 'Preview status' : 'Start preview',
        detail: [port ? `port ${port}` : '', argsString(args, 'cwd')].filter(Boolean).join(' · ')
      }
    }
    case 'grep':
    case 'glob':
      return { primary: argsString(args, 'pattern'), detail: path || displayPath('.', rootPath) }
    case 'find_files':
      return { primary: argsString(args, 'query'), detail: path || displayPath('.', rootPath) }
    case 'read_multiple_files': {
      const paths = Array.isArray(args.paths)
        ? args.paths.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : []
      if (!paths.length) return { primary: '', detail: '' }
      return {
        primary: `${paths.length} file${paths.length === 1 ? '' : 's'}`,
        detail: paths.map((file) => displayPath(file, rootPath)).join(', ')
      }
    }
    case 'tree':
      return {
        primary: path === '/' || (rootPath && path === trimRoot(rootPath)) ? 'project root' : baseName(path),
        detail: path || displayPath('.', rootPath)
      }
    case 'move_file':
    case 'copy_file': {
      const rawFrom = argsString(args, 'from')
      const rawTo = argsString(args, 'to')
      if (!rawFrom && !rawTo) return { primary: '', detail: '' }
      const from = displayPath(rawFrom, rootPath)
      const to = rawTo ? displayPath(rawTo, rootPath) : ''
      return { primary: baseName(from), detail: to ? `${from} → ${to}` : from }
    }
    case 'git_commit':
      return { primary: argsString(args, 'message'), detail: '' }
    case 'git_branch':
      return {
        primary: argsString(args, 'name') || argsString(args, 'action') || 'list',
        detail: 'branch'
      }
    case 'git_push':
    case 'git_pull':
      return {
        primary: [argsString(args, 'remote'), argsString(args, 'branch')].filter(Boolean).join(' ') || 'origin',
        detail: ''
      }
    case 'list_dir':
      return {
        primary: path === '/' || (rootPath && path === trimRoot(rootPath)) ? 'project root' : baseName(path),
        detail: path || displayPath('.', rootPath)
      }
    default:
      if (!path) return { primary: '', detail: '' }
      return { primary: baseName(path), detail: path }
  }
}
