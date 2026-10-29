import { useEffect, useMemo, useRef, useState } from 'react'
import type { Chat, LiveState, Message, ModelEntry, Project, RunStep } from '../types'
import {
  absolutePath,
  argsString,
  describeTool,
  parseToolArgs,
  shortenPath,
  toolLabel
} from '../toolDisplay'
import { Markdown } from './Markdown'
import { ModelSelect } from './ModelSelect'
import { StepMenu } from './StepMenu'

const SPECIAL_ARG_KEYS = new Set(['path', 'old_string', 'new_string', 'content', 'command', 'pattern', 'from', 'to'])

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
    (rootPath && ['grep', 'glob', 'list_dir', 'run_shell'].includes(name) ? rootPath : '')
  const oldString = typeof parsedArgs.old_string === 'string' ? parsedArgs.old_string : ''
  const newString = typeof parsedArgs.new_string === 'string' ? parsedArgs.new_string : ''
  const content = typeof parsedArgs.content === 'string' ? parsedArgs.content : ''
  const command = argsString(parsedArgs, 'command')
  const pattern = argsString(parsedArgs, 'pattern')
  const extraArgs = Object.entries(parsedArgs).filter(([key]) => !SPECIAL_ARG_KEYS.has(key))
  const isMetadataResult = ['edit_file', 'write_file', 'delete_file', 'move_file'].includes(name)
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

        {(name === 'grep' || name === 'glob') && pattern && (
          <div className="tool-arg-row">
            <span className="tool-arg-key">pattern</span>
            <code className="tool-inline-code">{pattern}</code>
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
  live,
  streaming,
  steps,
  maxSteps,
  loading,
  error,
  onModelChange,
  onSend,
  onStop,
  onOpenSidebar
}: {
  project: Project | null
  chat: Chat | null
  messages: Message[]
  models: ModelEntry[]
  modelId: string
  live: LiveState | null
  streaming: boolean
  steps: RunStep[]
  maxSteps: number
  loading: boolean
  error: string | null
  onModelChange: (id: string) => void
  onSend: (content: string) => void
  onStop: () => void
  onOpenSidebar: () => void
}) {
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement | null>(null)

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
                return (
                  <div className="msg assistant" key={message.id}>
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
                  </div>
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
                {live?.reasoning ? (
                  <details className="reasoning">
                    <summary>Reasoning</summary>
                    <pre>{live.reasoning}</pre>
                  </details>
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
                {streaming && (
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
              </>
            )}
            <div ref={bottomRef} />
          </div>

          {error && <div className="error-banner">{error}</div>}

          <div className="composer">
            <textarea
              value={draft}
              placeholder={modelId ? 'Describe a task… (Enter to send, Shift+Enter for newline)' : 'Add a provider and model in Settings first'}
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
                <StepMenu steps={steps} maxSteps={maxSteps} streaming={streaming} />
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
