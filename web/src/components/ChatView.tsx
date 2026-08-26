import { useEffect, useRef, useState } from 'react'
import type { Chat, Message, ModelEntry } from '../types'
import { Markdown } from './Markdown'
import { IconChevronDown, IconSend, IconStop } from '../icons'

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
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className={`msg-assistant${m.error ? ' msg-error-text' : ''}`}>
                  <div className="role-tag">KS Agent</div>
                  <Markdown content={m.content} />
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
                  {selectedModelLabel
                    ? `${selectedModel.providerName} · ${selectedModelLabel}`
                    : 'No model'}
                </span>
              </button>

              {modelOpen && (
                <div className="model-dd">
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
                  {props.models.map((m) => (
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
