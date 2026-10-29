import { useState } from 'react'
import type { Message, RunStep } from '../types'
import { absolutePath, argsString, parseToolArgs } from '../toolDisplay'

type ChangeAction = 'Created' | 'Edited' | 'Deleted' | 'Moved'

interface RunReportChange {
  action: ChangeAction
  path: string
}

export interface RunReportData {
  id: string
  task: string
  summary: string
  status: 'complete' | 'stopped'
  steps: number
  tools: number
  files: number
  durationMs: number
  changes: RunReportChange[]
}

const CHANGE_ACTIONS: Record<string, ChangeAction> = {
  write_file: 'Created',
  edit_file: 'Edited',
  delete_file: 'Deleted',
  move_file: 'Moved'
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
        call.function.name === 'move_file'
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

function formatDuration(ms: number): string {
  if (ms < 1000) return '<1s'
  const seconds = ms / 1000
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds % 60)
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`
}

export function buildRunReport({
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
}): RunReportData | null {
  if (loading || streaming || messages.length === 0) return null

  let taskIndex = -1
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'user') {
      taskIndex = index
      break
    }
  }
  if (taskIndex < 0) return null

  const taskMessage = messages[taskIndex]
  const runMessages = messages.slice(taskIndex + 1)
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
      ? message.toolCalls.filter((call) => call.function.name !== 'update_plan')
      : []
  )
  if (calls.length === 0) return null

  const resultIds = new Set(
    runMessages
      .filter((message) => message.role === 'tool' && message.toolCallId)
      .map((message) => message.toolCallId as string)
  )
  const pending = calls.some((call) => !resultIds.has(call.id))
  const stopped =
    halted || pending || /^Stopped after \d+ steps without finishing/im.test(finalMessage.content)
  const changes = collectChanges(runMessages, rootPath)

  let durationMs = steps.reduce((total, step) => total + (step.durationMs ?? 0), 0)
  if (!durationMs) {
    const last = runMessages[runMessages.length - 1]
    durationMs = Math.max(0, last.createdAt - taskMessage.createdAt)
  }

  const stepCount =
    steps.length ||
    runMessages.filter(
      (message) =>
        message.role === 'assistant' &&
        (message.content.trim().length > 0 || (message.toolCalls?.length ?? 0) > 0)
    ).length

  return {
    id: finalMessage.id,
    task: clip(plainText(taskMessage.content), 280),
    summary: clip(plainText(finalMessage.content), 240),
    status: stopped ? 'stopped' : 'complete',
    steps: stepCount,
    tools: calls.length,
    files: changes.length,
    durationMs,
    changes
  }
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

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  )
}

export function RunReport({ report }: { report: RunReportData }) {
  const [open, setOpen] = useState(true)
  const visibleChanges = report.changes.slice(0, 4)

  return (
    <details
      className={`run-report${report.status === 'stopped' ? ' stopped' : ''}`}
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
            {report.status === 'complete' ? 'Completed' : 'Stopped early'}
          </span>
        </span>
        <span className="run-report-duration">{formatDuration(report.durationMs)}</span>
        <span className="run-report-chevron" aria-hidden="true">
          <ChevronIcon />
        </span>
      </summary>

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
              {report.changes.length > visibleChanges.length && (
                <span className="run-change-more">
                  +{report.changes.length - visibleChanges.length} more
                </span>
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
      </div>
    </details>
  )
}
