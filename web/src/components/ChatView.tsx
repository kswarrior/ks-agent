import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Chat, Message, ModelEntry } from '../types'
import { Markdown } from './Markdown'
import { IconChevronDown, IconSearch, IconSend, IconStop } from '../icons'

function ClampedContent({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setOverflowing(el.scrollHeight > el.clientHeight + 1)
  }, [])

  return (
    <>
      <div ref={ref} className={`msg-clamp${expanded ? ' open' : ''}`}>
        {children}
      </div>
      {overflowing && !expanded && (
        <button className="read-more-btn" onClick={() => setExpanded(true)}>
          Read more
        </button>
      )}
    </>
  )
}

interface Props {
  chat: Chat | null
  hasProject: boolean
  messages: Message[]
  streaming: boolean
  streamText: string
  models: ModelEntry[]
  selectedModelId: string | null
  onSelectModel: (id: string) => void
  onSend: (content: string) => void
  onStop: () => void
  onRequestSettings: () => void
}

export function ChatView(props: Props) {
  const [input, setInput] = useState('')
  const [modelOpen, setModelOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [provOpen, setProvOpen] = useState(false)
  const [provFilterId, setProvFilterId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setInput('')
    stickToBottom.current = true
  }, [props.chat?.id])

  useEffect(() => {
    if (stickToBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [props.messages.length, props.streamText])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 130
  }

  function autoGrow() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 180) + 'px'
  }

  function send() {
    const content = input.trim()
    if (!content || props.streaming || !props.hasProject) return
    setInput('')
    requestAnimationFrame(() => {
      autoGrow()
      textareaRef.current?.focus()
    })
    props.onSend(content)
  }

  const selectedModel = props.models.find((m) => m.id === props.selectedModelId)
  const selectedModelLabel = selectedModel ? selectedModel.displayName || selectedModel.model : null
  const canSend = input.trim().length > 0 && !props.streaming && props.hasProject

  const providers = [...new Map(props.models.map((m) => [m.providerId, m.providerName])).entries()]
  const provFilterName = provFilterId ? providers.find(([id]) => id === provFilterId)?.[1] ?? null : null
  const q = modelQuery.trim().toLowerCase()
  const visibleModels = props.models.filter(
    (m) =>
      (provFilterId === null || m.providerId === provFilterId) &&
      (q === '' ||
        `${m.displayName ?? ''} ${m.model} ${m.providerName}`.toLowerCase().includes(q))
  )

  useEffect(() => {
    if (!modelOpen) {
      setProvOpen(false)
      setModelQuery('')
    }
  }, [modelOpen])

  return (
    <>
      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        {(!props.chat || props.messages.length === 0) && !props.streaming ? (
          <div className="empty" style={{ height: '100%' }}>
            <div className="empty-logo">KS</div>
            <h2>
              {props.chat
                ? 'Start the conversation'
                : props.hasProject
                  ? 'Start a chat'
                  : 'Select a project'}
            </h2>
            <p>
              {props.chat
                ? 'Ask anything about your project.'
                : props.messages.length > 0
                  ? ''
                  : props.hasProject
                    ? 'Send a message and a chat is created automatically.'
                    : 'Pick a project in the sidebar to begin.'}
            </p>
            {props.chat && (
              <span className="empty-hint">
                {props.models.length === 0
                  ? 'Add a provider + model in Settings to begin'
                  : selectedModelLabel
                    ? `Model: ${selectedModelLabel}`
                    : 'Select a model below'}
              </span>
            )}
          </div>
        ) : (
          <div className="msg-col">
            {props.messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="msg-user">
                  <ClampedContent>{m.content}</ClampedContent>
                </div>
              ) : (
                <div key={m.id} className={`msg-assistant${m.error ? ' msg-error-text' : ''}`}>
                  <div className="role-tag">KS Agent</div>
                  <ClampedContent>
                    <Markdown content={m.content} />
                  </ClampedContent>
                </div>
              )
            )}
            {props.streaming && (
              <div className="msg-assistant">
                <div className="role-tag">KS Agent</div>
                <Markdown content={props.streamText} />
                <span className="cursor-blink" />
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="composer">
        <div className="composer-inner">
          <textarea
            ref={textareaRef}
            className="composer-input"
            rows={1}
            placeholder={!props.hasProject ? 'Select a project first' : 'Message KS Agent…'}
            disabled={!props.hasProject}
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              autoGrow()
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
          />
          <div className="composer-bar">
            <div className="model-chip-wrap">
              <button
                className={`model-chip${selectedModel ? '' : ' none'}`}
                onClick={() => setModelOpen((v) => !v)}
                title="Choose model"
              >
                <IconChevronDown size={14} style={{ transform: 'rotate(90deg)' }} />
                <span>
                  {selectedModel && selectedModelLabel
                    ? `${selectedModel.providerName} · ${selectedModelLabel}`
                    : 'No model'}
                </span>
              </button>

              {modelOpen && (
                <div className="model-dd">
                  {props.models.length > 0 && (
                    <div className="dd-toolbar">
                    <div className="search-box">
                      <IconSearch size={14} />
                      <input
                        className="search-input"
                        placeholder="Search models…"
                        value={modelQuery}
                        onChange={(e) => setModelQuery(e.target.value)}
                      />
                    </div>
                    <div className="prov-filter-wrap">
                      <button
                        className={`filter-chip${provFilterId ? ' active' : ''}`}
                        onClick={() => setProvOpen((v) => !v)}
                        title="Filter by provider"
                      >
                        <span>{provFilterName ?? 'All'}</span>
                        <IconChevronDown size={12} />
                      </button>
                      {provOpen && (
                        <div className="prov-pop">
                          <button
                            className={`dd-item${provFilterId === null ? ' active' : ''}`}
                            onClick={() => {
                              setProvFilterId(null)
                              setProvOpen(false)
                            }}
                          >
                            <span>All providers</span>
                          </button>
                          {providers.map(([id, name]) => (
                            <button
                              key={id}
                              className={`dd-item${provFilterId === id ? ' active' : ''}`}
                              onClick={() => {
                                setProvFilterId(id)
                                setProvOpen(false)
                              }}
                            >
                              <span>{name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    </div>
                  )}
                  <div className="model-dd-list">
                    {props.models.length === 0 && (
                      <div style={{ padding: '12px' }}>
                        <div className="dd-empty">No models configured.</div>
                        <button
                          className="btn"
                          style={{ width: '100%', marginTop: 8 }}
                          onClick={() => {
                            setModelOpen(false)
                            props.onRequestSettings()
                          }}
                        >
                          Open Settings
                        </button>
                      </div>
                    )}
                    {props.models.length > 0 && visibleModels.length === 0 && (
                      <div className="dd-empty">No matching models.</div>
                    )}
                    {visibleModels.map((m) => (
                      <button
                        key={m.id}
                        className={`dd-item${m.id === props.selectedModelId ? ' active' : ''}`}
                        onClick={() => {
                          props.onSelectModel(m.id)
                          setModelOpen(false)
                        }}
                      >
                        <span>{m.displayName || m.model}</span>
                        <small style={{ color: 'var(--text-faint)' }}>
                          {m.displayName && m.displayName !== m.model ? `${m.providerName} · ${m.model}` : m.providerName}
                        </small>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {modelOpen && (
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                  onMouseDown={() => setModelOpen(false)}
                />
              )}
            </div>

            {props.streaming ? (
              <button className="send-btn stop-btn" onClick={props.onStop}>
                <IconStop size={16} />
                Stop
              </button>
            ) : (
              <button className="send-btn" onClick={send} disabled={!canSend}>
                <IconSend size={15} />
                <span className="send-label">Send</span>
              </button>
            )}
          </div>
        </div>
      </footer>
    </>
  )
}
