import { useEffect, useMemo, useRef, useState } from 'react'
import type { Chat, LiveState, Message, ModelEntry, Project, RunStep } from '../types'
import { Markdown } from './Markdown'
import { SelectMenu } from './SelectMenu'
import { StepMenu } from './StepMenu'

function formatArgs(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function ToolCard({
  name,
  args,
  output,
  ok,
  durationMs,
  running
}: {
  name: string
  args: string
  output?: string
  ok?: boolean
  durationMs?: number
  running?: boolean
}) {
  return (
    <details className={`tool-card ${running ? 'running' : ok === false ? 'failed' : 'done'}`}>
      <summary>
        <span className="tool-name">{name}</span>
        {typeof durationMs === 'number' && <span className="tool-time">{durationMs} ms</span>}
      </summary>
      <div className="tool-body">
        <div className="tool-label">arguments</div>
        <pre>{formatArgs(args)}</pre>
        {output !== undefined && (
          <>
            <div className="tool-label">result</div>
            <pre>{output || '(empty)'}</pre>
          </>
        )}
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
                const calls = message.toolCalls ?? []
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
                {live?.content ? (
                  <Markdown text={live.content} />
                ) : streaming ? (
                  <div className="skeleton-stack" role="status" aria-label="Thinking" aria-busy="true">
                    <div className="skeleton skeleton-line" style={{ width: '72%' }} />
                    <div className="skeleton skeleton-line" style={{ width: '44%', marginBottom: 0 }} />
                  </div>
                ) : null}
                {live?.tools.map((tool) => (
                  <ToolCard
                    key={tool.id}
                    name={tool.name}
                    args={tool.arguments}
                    output={tool.output}
                    ok={tool.status === 'running' ? undefined : tool.status === 'ok'}
                    durationMs={tool.durationMs}
                    running={tool.status === 'running'}
                  />
                ))}
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
              <SelectMenu
                className="composer-model"
                value={modelId}
                options={models.map((model) => ({ value: model.id, label: model.name }))}
                onChange={onModelChange}
                placeholder="No models"
                disabled={streaming || models.length === 0}
                ariaLabel="Model"
              />
              <div className="composer-right">
                <StepMenu steps={steps} maxSteps={maxSteps} />
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
