type ToolMeta = { action: string; running: string }

const TOOL_META: Record<string, ToolMeta> = {
  read_file: { action: 'Read', running: 'Reading' },
  write_file: { action: 'Write', running: 'Writing' },
  edit_file: { action: 'Edit', running: 'Editing' },
  list_dir: { action: 'List', running: 'Listing' },
  glob: { action: 'Find', running: 'Finding' },
  grep: { action: 'Search', running: 'Searching' },
  get_file_info: { action: 'Inspect', running: 'Inspecting' },
  delete_file: { action: 'Delete', running: 'Deleting' },
  move_file: { action: 'Move', running: 'Moving' },
  run_shell: { action: 'Run', running: 'Running' },
  update_plan: { action: 'Plan', running: 'Planning' },
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

function argsString(args: Record<string, unknown>, key: string): string {
  const value = args[key]
  return typeof value === 'string' ? value.trim() : ''
}

function baseName(file: string): string {
  const parts = file.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? file
}

function displayPath(file: string): string {
  const clean = file.replace(/\\/g, '/').replace(/^\.\/+/, '')
  if (!clean || clean === '.') return '/'
  return clean.startsWith('/') ? clean : `/${clean}`
}

export function describeTool(
  name: string,
  args: Record<string, unknown>
): { primary: string; detail: string } {
  const rawPath = argsString(args, 'path')
  const path = rawPath ? displayPath(rawPath) : ''
  switch (name) {
    case 'run_shell':
      return { primary: argsString(args, 'command'), detail: '' }
    case 'grep':
    case 'glob':
      return { primary: argsString(args, 'pattern'), detail: path || '/' }
    case 'move_file': {
      const rawFrom = argsString(args, 'from')
      const rawTo = argsString(args, 'to')
      if (!rawFrom && !rawTo) return { primary: '', detail: '' }
      const from = displayPath(rawFrom)
      const to = rawTo ? displayPath(rawTo) : ''
      return { primary: baseName(from), detail: to ? `${from} → ${to}` : from }
    }
    case 'list_dir':
      return { primary: path === '/' ? 'project root' : baseName(path), detail: path || '/' }
    default:
      if (!path) return { primary: '', detail: '' }
      return { primary: baseName(path), detail: path }
  }
}
