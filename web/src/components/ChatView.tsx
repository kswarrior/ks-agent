import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type {
  Chat,
  ChatExtensionsState,
  ExtensionKind,
  FailureInfo,
  LiveState,
  Message,
  ModelEntry,
  Project,
  RetryStatus,
  RunStep
} from '../types'
import {
  absolutePath,
  argsString,
  describeTool,
  parseToolArgs,
  shortenPath,
  toolLabel
} from '../toolDisplay'
import { ChatExtensionsMenu } from './ChatExtensionsMenu'
import { Markdown } from './Markdown'
import { MessageFooter } from './MessageFooter'
import { ModelSelect } from './ModelSelect'
import { StepMenu } from './StepMenu'
import { buildRunReports, RunReport } from './RunReport'

const SPECIAL_ARG_KEYS = new Set([
  'path',
  'paths',
  'query',
  'pattern',
  'match',
  'type',
  'old_string',
  'new_string',
  'patch',
  'content',
  'command',
  'from',
  'to',
  'message',
  'remote',
  'branch',
  'action',
  'staged',
  'ref',
  'file',
  'stat_only'
])

function splitLines(text: string): string[] {
  return text.replace(/\r\n/g, '\n').split('\n')
}

function DiffLines({
  lines,
  kind,
  startLine = 1
}: {
  lines: string[]
  kind: 'add' | 'del'
  startLine?: number
}) {
  return (
    <>
      {lines.map((line, index) => (
        <div className={`diff-line ${kind}`} key={`${kind}-${index}`}>
          <span className="diff-num">{startLine + index}</span>
          <span className="diff-sign">{kind === 'add' ? '+' : '-'}</span>
          <span className="diff-text">{line || ' '}</span>
        </div>
      ))}
    </>
  )
}

function changedLine(output?: string): number {
  const match = /\bline (\d+)\b/i.exec(output ?? '')
  return match ? Number(match[1]) : 1
}

function formatArgValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function ToolCard({
  name,
  args,
  output,
  ok,
  durationMs,
  running,
  rootPath = ''
}: {
  name: string
  args: string
  output?: string
  ok?: boolean
  durationMs?: number
  running?: boolean
  rootPath?: string
}) {
  const label = toolLabel(name, running)
  const parsedArgs = parseToolArgs(args)
  const { primary, detail } = describeTool(name, parsedArgs, rootPath || undefined)
  const rawPath = argsString(parsedArgs, 'path')
  const rawFrom = argsString(parsedArgs, 'from')
  const rawTo = argsString(parsedArgs, 'to')
  const fullPath = rawPath ? (rootPath ? absolutePath(rootPath, rawPath) : detail) : ''
  const fullFrom = rawFrom ? absolutePath(rootPath, rawFrom) : ''
  const fullTo = rawTo ? absolutePath(rootPath, rawTo) : ''
  const location =
    fullPath ||
    (rootPath &&
    ['grep', 'glob', 'find_files', 'tree', 'list_dir', 'run_shell', 'git_status', 'git_diff', 'git_log'].includes(name)
      ? rootPath
      : '')
  const oldString = typeof parsedArgs.old_string === 'string' ? parsedArgs.old_string : ''
  const newString = typeof parsedArgs.new_string === 'string' ? parsedArgs.new_string : ''
  const content = typeof parsedArgs.content === 'string' ? parsedArgs.content : ''
  const command = argsString(parsedArgs, 'command')
  const pattern = argsString(parsedArgs, 'pattern')
  const query = argsString(parsedArgs, 'query')
  const extraArgs = Object.entries(parsedArgs).filter(([key]) => !SPECIAL_ARG_KEYS.has(key))
  const isMetadataResult = [
    'edit_file',
    'write_file',
    'apply_patch',
    'append_file',
    'create_dir',
    'copy_file',
    'delete_file',
    'move_file'
  ].includes(name)
  const editStartLine = changedLine(output)
  const addedLines = content ? splitLines(content).length : 0

  return (
    <details className={`tool-card ${running ? 'running' : ok === false ? 'failed' : 'done'}`}>
      <summary>
        <span className={`tool-status${running ? ' is-running' : ''}`}>{label}</span>
        {(primary || detail) && (
          <span className="tool-target" title={[primary, detail].filter(Boolean).join(' ')}>
            {primary && <span className="tool-target-name">{primary}</span>}
            {detail && <span className="tool-target-path">{shortenPath(detail)}</span>}
          </span>
        )}
        {typeof durationMs === 'number' && <span className="tool-time">{durationMs} ms</span>}
      </summary>
      <div className="tool-body">
        {location && (
          <div className="tool-file-path" title={location}>
            {location}
          </div>
        )}

        {name === 'edit_file' && (oldString || newString) && (
          <div className="tool-diff" role="group" aria-label="File changes">
            {oldString && (
              <DiffLines lines={splitLines(oldString)} kind="del" startLine={editStartLine} />
            )}
            {newString && (
              <DiffLines lines={splitLines(newString)} kind="add" startLine={editStartLine} />
            )}
          </div>
        )}

        {name === 'write_file' && content && (
          <>
            <div className="tool-label">
              new content · {addedLines} {addedLines === 1 ? 'line' : 'lines'}
            </div>
            <div className="tool-diff" role="group" aria-label="New file content">
              <DiffLines lines={splitLines(content)} kind="add" />
            </div>
          </>
        )}

        {name === 'delete_file' && fullPath && (
          <div className="tool-diff" role="group" aria-label="Deleted file">
            <div className="diff-line del">
              <span className="diff-sign">-</span>
              <span className="diff-text">{fullPath}</span>
            </div>
          </div>
        )}

        {name === 'move_file' && (fullFrom || fullTo) && (
          <div className="tool-diff" role="group" aria-label="Moved file">
            {fullFrom && (
              <div className="diff-line del">
                <span className="diff-sign">-</span>
                <span className="diff-text">{fullFrom}</span>
              </div>
            )}
            {fullTo && (
              <div className="diff-line add">
                <span className="diff-sign">+</span>
                <span className="diff-text">{fullTo}</span>
              </div>
            )}
          </div>
        )}

        {name === 'run_shell' && command && (
          <div className="tool-command">
            <span className="tool-command-prompt">$</span>
            <code>{command}</code>
          </div>
        )}

        {(name === 'grep' || name === 'glob' || name === 'find_files') && (pattern || query) && (
          <div className="tool-arg-row">
            <span className="tool-arg-key">{name === 'find_files' ? 'query' : 'pattern'}</span>
            <code className="tool-inline-code">{name === 'find_files' ? query : pattern}</code>
          </div>
        )}

        {extraArgs.length > 0 && (
          <div className="tool-args">
            {extraArgs.map(([key, value]) => (
              <div className="tool-arg-row" key={key}>
                <span className="tool-arg-key">{key}</span>
                <span className="tool-arg-value">{formatArgValue(value)}</span>
              </div>
            ))}
          </div>
        )}

        {output !== undefined &&
          (isMetadataResult ? (
            <div className={`tool-note ${ok === false ? 'error' : 'ok'}`}>{output || '(empty)'}</div>
          ) : (
            <>
              <div className="tool-label">output</div>
              <pre className={`tool-output ${ok === false ? 'error' : ''}`}>{output || '(empty)'}</pre>
            </>
          ))}
      </div>
    </details>
  )
}

function MenuIcon() {
  return (
    <svg
      className="menu-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M3 12h13" />
      <path d="M3 18h8" />
    </svg>
  )
}

function ThinkingBlock({ reasoning, streaming }: { reasoning: string; streaming: boolean }) {
  return (
    <details className="thinking-block">
      <summary title="Show or hide reasoning">
        <span>Thinking</span>
        {streaming && (
          <span className="thinking-dots" aria-hidden="true">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
        )}
        <svg
          className="thinking-chevron"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <pre className="thinking-context">{reasoning.trim()}</pre>
    </details>
  )
}

function failureBadge(failure: FailureInfo): string {
  if (failure.status) return `HTTP ${failure.status}`
  if (failure.code) return failure.code
  return 'ERROR'
}

function waitLabel(ms: number): string {
  if (ms <= 100) return 'now'
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`
}

function FailureCard({ failure, onContinue }: { failure: FailureInfo; onContinue: () => void }) {
  const attempts = failure.attempts ?? 0
  return (
    <div className="agent-failure" role="alert">
      <div className="agent-failure-head">
        <span className="agent-failure-code">{failureBadge(failure)}</span>
        <strong>{failure.title || 'Request failed'}</strong>
        {attempts > 1 && (
          <span className="agent-failure-attempts">
            {attempts} attempts
          </span>
        )}
      </div>
      <p className="agent-failure-message">{failure.message}</p>
      {failure.code && failure.status ? (
        <p className="agent-failure-meta">
          Provider code: <code>{failure.code}</code>
        </p>
      ) : null}
      {failure.retryAfterMs ? (
        <p className="agent-failure-meta">The provider asked to wait {waitLabel(failure.retryAfterMs)}.</p>
      ) : null}
      {failure.details && (
        <details className="agent-failure-details">
          <summary>Response details</summary>
          <pre>{failure.details}</pre>
        </details>
      )}
      <div className="agent-failure-actions">
        <button type="button" className="btn ghost small" onClick={onContinue}>
          Continue
        </button>
      </div>
    </div>
  )
}

function RetryCard({ retry, now }: { retry: RetryStatus; now: number }) {
  const remaining = Math.max(0, retry.nextAt - now)
  const attemptLabel =
    retry.maxAttempts === null
      ? `retry ${retry.attempt}, unlimited`
      : `retry ${retry.attempt} of ${retry.maxAttempts}`
  return (
    <div className="agent-retry" role="status" aria-live="polite">
      <div className="agent-retry-head">
        <span className="agent-retry-badge">{retry.status ? `HTTP ${retry.status}` : 'RETRY'}</span>
        <strong>
          {remaining > 100 ? `Retrying in ${waitLabel(remaining)}` : 'Retrying now'} · {attemptLabel}
        </strong>
      </div>
      <p className="agent-retry-message">
        {retry.title ? `${retry.title}: ` : ''}
        {retry.message}
      </p>
    </div>
  )
}

function MessageSkeleton() {
  return (
    <div className="skeleton-stack" role="status" aria-label="Loading messages" aria-busy="true">
      <div className="skeleton skeleton-message" style={{ width: '62%', marginLeft: 'auto' }} />
      <div className="skeleton skeleton-line" style={{ width: '84%' }} />
      <div className="skeleton skeleton-line" style={{ width: '70%' }} />
      <div className="skeleton skeleton-line" style={{ width: '48%' }} />
      <div className="skeleton skeleton-message" style={{ width: '76%' }} />
    </div>
  )
}

export function ChatView({
  project,
  chat,
  messages,
  models,
  modelId,
  chatExtensions,
  live,
  streaming,
  steps,
  loading,
  error,
  failure,
  retryStatus,
  onModelChange,
  onToggleChatExtension,
  onSend,
  onStop,
  onOpenSidebar
}: {
  project: Project | null
  chat: Chat | null
  messages: Message[]
  models: ModelEntry[]
  modelId: string
  chatExtensions: ChatExtensionsState | null
  live: LiveState | null
  streaming: boolean
  steps: RunStep[]
  loading: boolean
  error: string | null
  failure: FailureInfo | null
  retryStatus: RetryStatus | null
  onModelChange: (id: string) => void
  onToggleChatExtension: (kind: ExtensionKind, name: string, enabled: boolean) => Promise<void>
  onSend: (content: string) => void
  onStop: () => void
  onOpenSidebar: () => void
}) {
  const [draft, setDraft] = useState('')
  const [now, setNow] = useState(Date.now())
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const rootPath = project?.path ?? ''

  useEffect(() => {
    if (!retryStatus) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(timer)
  }, [retryStatus])

  useEffect(() => {
    setDraft('')
  }, [chat?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, live?.content, live?.tools.length, streaming])

  const toolResults = useMemo(() => {
    const map = new Map<string, Message>()
    for (const message of messages) {
      if (message.role === 'tool' && message.toolCallId) map.set(message.toolCallId, message)
    }
    return map
  }, [messages])

  const hiddenToolCallIds = useMemo(() => {
    const ids = new Set<string>()
    for (const message of messages) {
      if (message.role !== 'assistant' || !message.toolCalls) continue
      for (const call of message.toolCalls) {
        if (call.function.name === 'update_plan') ids.add(call.id)
      }
    }
    return ids
  }, [messages])

  const runReports = useMemo(
    () => buildRunReports({ messages, steps, streaming, loading, halted: Boolean(error), rootPath }),
    [messages, steps, streaming, loading, error, rootPath]
  )

  const reportsByFinalMessage = useMemo(
    () => new Map(runReports.map((entry) => [entry.finalMessageId, entry])),
    [runReports]
  )

  const persistedToolCallIds = useMemo(() => {
    const ids = new Set<string>()
    for (const message of messages) {
      if (message.role !== 'assistant' || !message.toolCalls) continue
      for (const call of message.toolCalls) ids.add(call.id)
    }
    return ids
  }, [messages])

  const visibleTools = (tools: LiveState['tools']) =>
    tools.filter((tool) => tool.name !== 'update_plan' && !persistedToolCallIds.has(tool.id))

  const send = () => {
    const content = draft.trim()
    if (!content || streaming || !modelId) return
    setDraft('')
    onSend(content)
  }

  const continueRun = () => {
    const composer = composerRef.current
    if (!composer) return
    composer.focus()
    composer.setSelectionRange(composer.value.length, composer.value.length)
    composer.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const latestReport = runReports.find((entry) => entry.isLatest)
  const stopped = latestReport?.report.status === 'stopped'

  if (!project) {
    return (
      <main className="main">
        <header className="main-head">
          <button className="icon-btn mobile-only" onClick={onOpenSidebar} aria-label="Open sidebar">
            <MenuIcon />
          </button>
          <div className="main-title">KS Agent</div>
        </header>
        {loading ? (
          <div className="messages">
            <MessageSkeleton />
          </div>
        ) : (
          <div className="empty-state">
            <h1>Build anything, extend everything</h1>
            <p>Create a project in the sidebar, add a provider and model in Settings, then start chatting.</p>
          </div>
        )}
      </main>
    )
  }

  return (
    <main className="main">
      <header className="main-head">
        <button className="icon-btn mobile-only" onClick={onOpenSidebar} aria-label="Open sidebar">
          <MenuIcon />
        </button>
        <div className="main-title">
          <strong>{chat?.title || 'New chat'}</strong>
          <span>{project.name}</span>
        </div>
      </header>

      {!chat ? (
        loading ? (
          <div className="messages">
            <MessageSkeleton />
          </div>
        ) : (
          <div className="empty-state">
            <h1>No chat selected</h1>
            <p>Create a chat in the sidebar to start a task.</p>
          </div>
        )
      ) : (
        <>
          <div className="messages">
            {loading ? (
              <MessageSkeleton />
            ) : (
              <>
            {messages.length === 0 && !live && (
              <div className="empty-chat">
                <h2>What should we build?</h2>
                <p>
                  Ask for a feature, a bug fix, a Minecraft plugin, a web app, an Android screen — the agent
                  can use built-in tools and extensions.
                </p>
              </div>
            )}

            {messages.map((message) => {
              if (message.role === 'user') {
                return (
                  <div className="msg user" key={message.id}>
                    <Markdown text={message.content} />
                  </div>
                )
              }
              if (message.role === 'assistant') {
                const calls = (message.toolCalls ?? []).filter((call) => call.function.name !== 'update_plan')
                const hiddenOnly =
                  !message.content &&
                  calls.length === 0 &&
                  (message.toolCalls?.length ?? 0) > 0
                if (hiddenOnly) return null
                const reportEntry = reportsByFinalMessage.get(message.id)
                const messageModelId = message.modelId ?? chat?.modelId ?? null
                const messageModel = messageModelId
                  ? models.find((entry) => entry.id === messageModelId)
                  : undefined
                return (
                  <Fragment key={message.id}>
                    <div className="msg assistant">
                      {message.content && <Markdown text={message.content} />}
                      {calls.map((call) => {
                        const result = toolResults.get(call.id)
                        return (
                          <ToolCard
                            key={call.id}
                            name={call.function.name}
                            args={call.function.arguments}
                            output={result?.content}
                            ok={result ? true : undefined}
                            running={streaming && !result}
                            rootPath={project.path}
                          />
                        )
                      })}
                      {!message.content && calls.length === 0 && <p className="muted">(empty response)</p>}
                      {message.content && (
                        <MessageFooter
                          content={message.content}
                          model={messageModel}
                          modelId={messageModelId}
                          durationMs={message.durationMs}
                        />
                      )}
                    </div>
                    {reportEntry && (
                      <RunReport
                        report={reportEntry.report}
                        onContinue={reportEntry.isLatest ? continueRun : undefined}
                      />
                    )}
                  </Fragment>
                )
              }
              if (message.role === 'tool') {
                const paired = messages.some(
                  (entry) => entry.role === 'assistant' && entry.toolCalls?.some((call) => call.id === message.toolCallId)
                )
                if (paired) return null
                if (message.toolCallId && hiddenToolCallIds.has(message.toolCallId)) return null
                return (
                  <div className="msg assistant" key={message.id}>
                    <ToolCard name="tool result" args="{}" output={message.content} ok />
                  </div>
                )
              }
              return null
            })}

            {(streaming || live) && (
              <div className="msg assistant live">
                {live?.reasoning.trim() ? (
                  <ThinkingBlock reasoning={live.reasoning} streaming={streaming} />
                ) : null}
                {live?.content ? <Markdown text={live.content} /> : null}
                {visibleTools(live?.tools ?? []).map((tool) => (
                  <ToolCard
                    key={tool.id}
                    name={tool.name}
                    args={tool.arguments}
                    output={tool.output}
                    ok={tool.status === 'running' ? undefined : tool.status === 'ok'}
                    durationMs={tool.durationMs}
                    running={tool.status === 'running'}
                    rootPath={project.path}
                  />
                ))}
                {streaming && failure && <FailureCard failure={failure} onContinue={continueRun} />}
                {streaming && !failure && retryStatus && <RetryCard retry={retryStatus} now={now} />}
                {streaming && !failure && !retryStatus && !live?.reasoning.trim() && (
                  <div className="thinking" role="status" aria-label="Thinking" aria-live="polite">
                    <span>Thinking</span>
                    <span className="thinking-dots" aria-hidden="true">
                      <span>.</span>
                      <span>.</span>
                      <span>.</span>
                    </span>
                  </div>
                )}
              </div>
            )}

            {failure && !streaming && (
              <div className="msg assistant">
                <FailureCard failure={failure} onContinue={continueRun} />
              </div>
            )}
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {error && !failure && (
            <div className={`error-banner ${!streaming && modelId && !stopped ? 'with-action' : ''}`}>
              <span>{error}</span>
              {!streaming && modelId && !stopped && (
                <button type="button" className="btn ghost small" onClick={continueRun}>
                  Continue
                </button>
              )}
            </div>
          )}

          <div className="composer">
            <textarea
              ref={composerRef}
              value={draft}
              placeholder={
                !modelId
                  ? 'Add a provider and model in Settings first'
                  : !streaming && (stopped || error)
                    ? 'Add instructions to continue from here… (Enter to send)'
                    : 'Describe a task… (Enter to send, Shift+Enter for newline)'
              }
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  send()
                }
              }}
              rows={2}
              disabled={!modelId}
            />
            <div className="composer-actions">
              <ChatExtensionsMenu
                extensions={chatExtensions}
                disabled={streaming}
                onToggle={onToggleChatExtension}
              />
              <ModelSelect
                className="composer-model"
                value={modelId}
                models={models}
                onChange={onModelChange}
                placeholder="No models"
                disabled={streaming || models.length === 0}
                ariaLabel="Model"
              />
              <div className="composer-right">
                <StepMenu messages={messages} streaming={streaming} />
                {streaming ? (
                  <button className="icon-action" onClick={onStop} aria-label="Stop" title="Stop">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
                    </svg>
                  </button>
                ) : (
                  <button
                    className="icon-action primary"
                    onClick={send}
                    disabled={!draft.trim() || !modelId}
                    aria-label="Send"
                    title="Send"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 19V5" />
                      <path d="m5 12 7-7 7 7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
