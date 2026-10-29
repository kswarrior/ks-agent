import { useEffect, useMemo, useRef, useState } from 'react'
import type { Chat, LiveState, Message, ModelEntry, Project } from '../types'
import { Markdown } from './Markdown'

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
        <span className="tool-status">{running ? '•' : ok === false ? '!' : '✓'}</span>
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

export function ChatView({
  project,
  projects,
  chat,
  messages,
  models,
  modelId,
  live,
  streaming,
  error,
  onSelectProject,
  onModelChange,
  onSend,
  onStop,
  onOpenSidebar
}: {
  project: Project | null
  projects: Project[]
  chat: Chat | null
  messages: Message[]
  models: ModelEntry[]
  modelId: string
  live: LiveState | null
  streaming: boolean
  error: string | null
  onSelectProject: (project: Project) => void
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
            ☰
          </button>
          <div className="main-title">KS Agent</div>
        </header>
        <div className="empty-state">
          <div className="empty-mark">KS</div>
          <h1>Build anything, extend everything</h1>
          <p>Create a project in the sidebar, add a provider and model in Settings, then start chatting.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="main">
      <header className="main-head">
        <button className="icon-btn mobile-only" onClick={onOpenSidebar} aria-label="Open sidebar">
          ☰
        </button>
        <div className="main-title">
          <strong>{chat?.title || 'New chat'}</strong>
          <span>{project.name}</span>
        </div>
        <select
          className="project-select"
          value={project.id}
          onChange={(event) => {
            const next = projects.find((entry) => entry.id === event.target.value)
            if (next) onSelectProject(next)
          }}
          title="Project"
          aria-label="Project"
        >
          {projects.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </header>

      {!chat ? (
        <div className="empty-state">
          <h1>No chat selected</h1>
          <p>Create a chat in the sidebar to start a task.</p>
        </div>
      ) : (
        <>
          <div className="messages">
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
                {live?.step ? <div className="step-badge">step {live.step}</div> : null}
                {live?.reasoning ? (
                  <details className="reasoning">
                    <summary>Reasoning</summary>
                    <pre>{live.reasoning}</pre>
                  </details>
                ) : null}
                {live?.content ? <Markdown text={live.content} /> : streaming ? <span className="typing">thinking…</span> : null}
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
              <select
                className="model-select composer-model"
                value={modelId}
                onChange={(event) => onModelChange(event.target.value)}
                disabled={streaming || models.length === 0}
                title="Model"
                aria-label="Model"
              >
                {models.length === 0 && <option value="">No models</option>}
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
              {streaming ? (
                <button className="btn danger" onClick={onStop}>
                  Stop
                </button>
              ) : (
                <button className="btn primary" onClick={send} disabled={!draft.trim() || !modelId}>
                  Send
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </main>
  )
}
