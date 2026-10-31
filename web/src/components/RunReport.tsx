import { useEffect, useState, type ReactNode } from 'react'
import type { Message, RunStep, ToolCall } from '../types'
import { formatDuration } from '../format'
import { absolutePath, argsString, parseToolArgs } from '../toolDisplay'

type ChangeAction = 'Created' | 'Edited' | 'Deleted' | 'Moved'

interface RunReportChange {
  action: ChangeAction
  path: string
}

export interface RunReportData {
  id: string
  kind: 'task' | 'chat'
  task: string
  summary: string
  status: 'complete' | 'stopped'
  steps: number
  tools: number
  files: number
  durationMs: number
  changes: RunReportChange[]
  canRecheck: boolean
  canPreview: boolean
}

const CHANGE_ACTIONS: Record<string, ChangeAction> = {
  write_file: 'Created',
  create_dir: 'Created',
  copy_file: 'Created',
  append_file: 'Edited',
  apply_patch: 'Edited',
  edit_file: 'Edited',
  delete_file: 'Deleted',
  move_file: 'Moved'
}

const MUTATING_TOOL_NAMES = new Set(Object.keys(CHANGE_ACTIONS))
const GIT_WORK_TOOL_NAMES = new Set(['git_init', 'git_commit', 'git_push', 'git_pull', 'git_branch'])
const PREVIEW_TOOL_NAMES = new Set(['preview_app', 'open_preview'])
const READ_ONLY_TOOL_NAMES = new Set([
  'read_file',
  'read_multiple_files',
  'list_dir',
  'glob',
  'find_files',
  'tree',
  'grep',
  'get_file_info',
  'git_status',
  'git_diff',
  'git_log'
])
const TASK_REPORT_TOOL = 'set_task_report'

const SHELL_WORK = /\b(?:build|test|tests|typecheck|lint|compile|install|vitest|jest|pytest|tsc|vite|next|nuxt|astro|cargo|mvn|gradle|make|dotnet)\b/i
const SHELL_DEV_SERVER =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview)\b|\b(?:vite|next\s+dev|nuxt\s+dev|astro\s+dev|ng\s+serve|serve|http\.server|flask\s+run|uvicorn|gunicorn|rails\s+(?:s|server)|php\s+-S|dotnet\s+run)\b/i

const WEB_CONFIG_FILE =
  /(?:^|\/)(?:index\.html?|(?:vite|next|nuxt|svelte|astro|remix|angular|webpack|rollup|parcel|tailwind|postcss)\.config\.[cm]?[jt]s|angular\.json)$/i
const WEB_SOURCE_FILE = /\.(?:tsx|jsx|vue|svelte|html?|css|scss|sass|less)$/i
const WEB_PUBLIC_DIR = /(?:^|\/)(?:public|static)\//i

function isWebAppPath(file: string): boolean {
  const normalized = file.replace(/\\/g, '/')
  return (
    WEB_CONFIG_FILE.test(normalized) ||
    WEB_SOURCE_FILE.test(normalized) ||
    WEB_PUBLIC_DIR.test(normalized)
  )
}

function reportActionOverride(messages: Message[]): { recheck?: boolean; preview?: boolean } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant' || !message.toolCalls) continue
    for (let callIndex = message.toolCalls.length - 1; callIndex >= 0; callIndex -= 1) {
      const call = message.toolCalls[callIndex]
      if (call.function.name !== TASK_REPORT_TOOL) continue
      const args = parseToolArgs(call.function.arguments)
      return {
        recheck: typeof args.recheck === 'boolean' ? args.recheck : undefined,
        preview: typeof args.preview === 'boolean' ? args.preview : undefined
      }
    }
  }
  return null
}

function callIsTaskWork(call: ToolCall): boolean {
  const name = call.function.name
  if (READ_ONLY_TOOL_NAMES.has(name)) return false
  if (name === 'run_shell') {
    const command = argsString(parseToolArgs(call.function.arguments), 'command')
    return SHELL_WORK.test(command) || SHELL_DEV_SERVER.test(command)
  }
  if (name === 'git_branch') {
    return argsString(parseToolArgs(call.function.arguments), 'action') !== 'list'
  }
  return true
}

function plainText(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clip(value: string, max: number): string {
  if (value.length <= max) return value
  const cut = value.slice(0, max)
  const at = cut.lastIndexOf(' ')
  return `${cut.slice(0, at > max * 0.6 ? at : max).trimEnd()}…`
}

function relativePath(file: string, rootPath: string): string {
  if (!file) return ''
  if (!rootPath) return file.replace(/\\/g, '/').replace(/^\.\/+/, '')
  const full = absolutePath(rootPath, file).replace(/\\/g, '/')
  const root = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
  if (full === root) return '.'
  return full.startsWith(`${root}/`) ? full.slice(root.length + 1) : full
}

function collectChanges(messages: Message[], rootPath: string): RunReportChange[] {
  const changes = new Map<string, RunReportChange>()
  for (const message of messages) {
    if (message.role !== 'assistant' || !message.toolCalls) continue
    for (const call of message.toolCalls) {
      const action = CHANGE_ACTIONS[call.function.name]
      if (!action) continue
      const args = parseToolArgs(call.function.arguments)
      const rawPath =
        call.function.name === 'move_file' || call.function.name === 'copy_file'
          ? argsString(args, 'to')
          : argsString(args, 'path')
      if (!rawPath) continue
      const path = relativePath(rawPath, rootPath)
      if (!path) continue
      changes.set(path, { action, path })
    }
  }
  return [...changes.values()]
}

function latestPlanTitle(messages: Message[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role !== 'assistant' || !message.toolCalls) continue
    for (let callIndex = message.toolCalls.length - 1; callIndex >= 0; callIndex -= 1) {
      const call = message.toolCalls[callIndex]
      if (call.function.name !== 'update_plan') continue
      const args = parseToolArgs(call.function.arguments)
      const title = typeof args.title === 'string' ? args.title.trim() : ''
      if (title && title.toLowerCase() !== 'plan') return title
    }
  }
  return null
}

function firstMeaningfulSentence(content: string): string {
  const text = plainText(content)
  if (!text) return ''
  const sentence = text.split(/(?<=[.!?])\s/)[0]?.trim() ?? text
  if (sentence.length < 8) return ''
  if (/^(?:done|ok|okay|sure|great|all set|finished)[.!]?$/i.test(sentence)) return ''
  return sentence
}

export interface RunReportEntry {
  report: RunReportData
  finalMessageId: string
  userMessageId: string
  isLatest: boolean
}

function buildRunReportEntry({
  taskMessage,
  runMessages,
  steps,
  isLatest,
  halted,
  rootPath
}: {
  taskMessage: Message
  runMessages: Message[]
  steps: RunStep[]
  isLatest: boolean
  halted: boolean
  rootPath: string
}): RunReportEntry | null {
  let finalMessage: Message | null = null
  for (let index = runMessages.length - 1; index >= 0; index -= 1) {
    const message = runMessages[index]
    if (message.role === 'assistant' && message.content.trim()) {
      finalMessage = message
      break
    }
  }
  if (!finalMessage) return null

  const calls = runMessages.flatMap((message) =>
    message.role === 'assistant' && message.toolCalls
      ? message.toolCalls.filter(
          (call) => call.function.name !== 'update_plan' && call.function.name !== TASK_REPORT_TOOL
        )
      : []
  )

  const resultIds = new Set(
    runMessages
      .filter((message) => message.role === 'tool' && message.toolCallId)
      .map((message) => message.toolCallId as string)
  )
  const pending = calls.some((call) => !resultIds.has(call.id))
  const stopped =
    halted || pending || /^Stopped after \d+ steps without finishing/im.test(finalMessage.content)
  const changes = collectChanges(runMessages, rootPath)

  let durationMs = finalMessage.durationMs ?? 0
  if (!durationMs) durationMs = steps.reduce((total, step) => total + (step.durationMs ?? 0), 0)
  if (!durationMs) {
    const last = runMessages[runMessages.length - 1] ?? finalMessage
    durationMs = Math.max(0, last.createdAt - taskMessage.createdAt)
  }

  const stepCount =
    steps.length ||
    runMessages.filter(
      (message) =>
        message.role === 'assistant' &&
        (message.content.trim().length > 0 || (message.toolCalls?.length ?? 0) > 0)
    ).length

  const planTitle = latestPlanTitle(runMessages)
  const doneTask = firstMeaningfulSentence(finalMessage.content)
  const task = planTitle || doneTask || plainText(taskMessage.content)

  const mutatingTool = calls.some((call) => MUTATING_TOOL_NAMES.has(call.function.name))
  const gitWork = calls.some((call) => GIT_WORK_TOOL_NAMES.has(call.function.name))
  const usedPreview = calls.some((call) => PREVIEW_TOOL_NAMES.has(call.function.name))
  const shellCommands = calls
    .filter((call) => call.function.name === 'run_shell')
    .map((call) => argsString(parseToolArgs(call.function.arguments), 'command'))
  const ranShellWork = shellCommands.some((command) => SHELL_WORK.test(command))
  const startedDevServer = shellCommands.some((command) => SHELL_DEV_SERVER.test(command))
  const hasPreviewableChanges = changes.some((change) => isWebAppPath(change.path))
  const override = reportActionOverride(runMessages)
  const kind =
    calls.some(callIsTaskWork) || override?.recheck === true || override?.preview === true
      ? 'task'
      : 'chat'
  const title = kind === 'task' ? task : plainText(taskMessage.content) || doneTask || 'Chat'

  return {
    report: {
      id: finalMessage.id,
      kind,
      task: clip(title, 200),
      summary: clip(plainText(finalMessage.content), 240),
      status: stopped ? 'stopped' : 'complete',
      steps: stepCount,
      tools: calls.length,
      files: changes.length,
      durationMs,
      changes,
      canRecheck:
        kind === 'task' &&
        (override?.recheck ?? (changes.length > 0 || mutatingTool || gitWork || ranShellWork)),
      canPreview:
        kind === 'task' &&
        (override?.preview ?? (usedPreview || startedDevServer || hasPreviewableChanges))
    },
    finalMessageId: finalMessage.id,
    userMessageId: taskMessage.id,
    isLatest
  }
}

export function buildRunReports({
  messages,
  steps,
  streaming,
  loading,
  halted,
  rootPath
}: {
  messages: Message[]
  steps: RunStep[]
  streaming: boolean
  loading: boolean
  halted: boolean
  rootPath: string
}): RunReportEntry[] {
  if (loading || messages.length === 0) return []

  const userIndices: number[] = []
  messages.forEach((message, index) => {
    if (message.role === 'user') userIndices.push(index)
  })
  if (userIndices.length === 0) return []

  const entries: RunReportEntry[] = []
  userIndices.forEach((taskIndex, runIndex) => {
    const isLatest = runIndex === userIndices.length - 1
    if (isLatest && streaming) return
    const end = runIndex + 1 < userIndices.length ? userIndices[runIndex + 1] : messages.length
    const entry = buildRunReportEntry({
      taskMessage: messages[taskIndex],
      runMessages: messages.slice(taskIndex + 1, end),
      steps: isLatest ? steps : [],
      isLatest,
      halted: isLatest && halted,
      rootPath
    })
    if (entry) entries.push(entry)
  })
  return entries
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 7v5" />
      <path d="M12 16.5v.5" />
    </svg>
  )
}

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
      <path d="M8 11h.01M12 11h.01M16 11h.01" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function RunReport({
  report,
  onContinue,
  onRecheck,
  onPreview,
  busy = false,
  defaultOpen = true,
  compact = false,
  children
}: {
  report: RunReportData
  onContinue?: () => void
  onRecheck?: (task: string) => void
  onPreview?: (task: string) => void
  busy?: boolean
  defaultOpen?: boolean
  compact?: boolean
  children?: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [showAllChanges, setShowAllChanges] = useState(false)
  const visibleChanges = showAllChanges ? report.changes : report.changes.slice(0, 4)
  const showRecheck = report.canRecheck && Boolean(onRecheck)
  const showPreview = report.canPreview && Boolean(onPreview)

  useEffect(() => {
    setShowAllChanges(false)
  }, [report.id])

  useEffect(() => {
    setOpen(defaultOpen)
  }, [report.id, defaultOpen])

  return (
    <details
      className={`run-report${report.status === 'stopped' ? ' stopped' : ''}${compact ? ' compact' : ''}`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="run-report-head">
        <span className="run-report-badge" aria-hidden="true">
          {report.status === 'complete' ? <CheckIcon /> : <StopIcon />}
        </span>
        <span className="run-report-heading">
          <span className="run-report-kicker">Task report</span>
          <span className="run-report-title">
            {compact ? report.task : report.status === 'complete' ? 'Completed' : 'Stopped early'}
          </span>
        </span>
        {compact && (
          <span className={`run-report-status ${report.status}`}>
            {report.status === 'complete' ? 'Completed' : 'Stopped'}
          </span>
        )}
        <span className="run-report-duration">{formatDuration(report.durationMs)}</span>
        <span className="run-report-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </summary>

      {children && <div className="run-turn-transcript">{children}</div>}

      <div className="run-report-body">
        <div className="run-report-row">
          <span className="run-report-label">Task</span>
          <p className="run-report-text run-report-task">{report.task}</p>
        </div>

        <div className="run-report-row">
          <span className="run-report-label">Summary</span>
          <p className="run-report-text">{report.summary}</p>
        </div>

        {visibleChanges.length > 0 && (
          <div className="run-report-row">
            <span className="run-report-label">Changed</span>
            <div className="run-report-changes">
              {visibleChanges.map((change) => (
                <span className="run-change" key={`${change.action}-${change.path}`}>
                  <span className={`run-change-action ${change.action.toLowerCase()}`}>
                    {change.action}
                  </span>
                  <code>{change.path}</code>
                </span>
              ))}
              {report.changes.length > 4 && (
                <button
                  type="button"
                  className="run-change-more"
                  onClick={() => setShowAllChanges((shown) => !shown)}
                >
                  {showAllChanges ? 'Show less' : `+${report.changes.length - 4} more`}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="run-report-stats">
          <span>
            <strong>{report.steps}</strong> {report.steps === 1 ? 'step' : 'steps'}
          </span>
          <span>
            <strong>{report.tools}</strong> {report.tools === 1 ? 'tool' : 'tools'}
          </span>
          {report.files > 0 && (
            <span>
              <strong>{report.files}</strong> {report.files === 1 ? 'file' : 'files'}
            </span>
          )}
          <span className="run-report-local" title="Generated from this run. No extra AI tokens.">
            Local · no extra tokens
          </span>
        </div>

        {(showRecheck || showPreview) && (
          <div className="run-report-actions">
            {showRecheck && onRecheck && (
              <button
                type="button"
                className="btn small"
                onClick={() => onRecheck(report.task)}
                disabled={busy}
                title="Ask the agent to verify this task again"
              >
                Recheck
              </button>
            )}
            {showPreview && onPreview && (
              <button
                type="button"
                className="btn small primary"
                onClick={() => onPreview(report.task)}
                disabled={busy}
                title="Ask the agent to open the web app preview on its port"
              >
                Open preview
              </button>
            )}
          </div>
        )}

        {report.status === 'stopped' && onContinue && (
          <div className="run-report-continue">
            <span>Resume from this point, or add instructions in the composer first.</span>
            <button type="button" className="btn primary small" onClick={onContinue}>
              Continue
            </button>
          </div>
        )}
      </div>
    </details>
  )
}
