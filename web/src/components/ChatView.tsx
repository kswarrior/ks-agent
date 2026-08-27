import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Activity, Chat, Message, ModelEntry, Plan, Question } from '../types'
import { Markdown } from './Markdown'
import { IconChevronDown, IconRotate, IconSearch, IconSend, IconStop, IconCopy, IconClock, IconCheck } from '../icons'
import { QuestionList } from './QuestionCard'
import { useToast } from '../toast'

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

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  const totalSec = Math.floor(ms / 1000)
  const msRem = ms % 1000
  if (totalSec < 60) {
    const sec = (ms / 1000).toFixed(ms < 10000 ? 1 : 0)
    return `${sec}s`
  }
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  if (mins < 60) return secs ? `${mins}m ${secs}s` : `${mins}m`
  const hrs = Math.floor(mins / 60)
  const minsRem = mins % 60
  return minsRem ? `${hrs}h ${minsRem}m` : `${hrs}h`
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' ' + d.toLocaleDateString()
  } catch { return '' }
}
function formatTimeShort(iso?: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  } catch { return '' }
}

function AssistantMeta({ message }: { message: Message }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)

  const modelLabel = (message.modelDisplayName?.trim() ? message.modelDisplayName.trim() : '') || message.model || ''
  const providerLabel = message.providerName || ''
  const startIso = message.startedAt
  const endIso = message.finishedAt || message.createdAt
  const durationMs = message.durationMs ?? (startIso && endIso ? Date.parse(endIso) - Date.parse(startIso) : undefined)
  const durationStr = durationMs != null && Number.isFinite(durationMs) && durationMs >= 0 ? formatDuration(durationMs) : ''

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      toast('Copied', 'success')
      setTimeout(() => setCopied(false), 1400)
    } catch {
      toast('Copy failed', 'error')
    }
  }

  return (
    <div className="msg-meta">
      <div className="msg-meta-row">
        <button className="msg-meta-copy" onClick={handleCopy} title="Copy response">
          {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
        {modelLabel && (
          <span className="msg-meta-model" title={modelLabel !== message.model ? `${modelLabel} · ${message.model}` : modelLabel}>
            <span className="msg-meta-label">Model</span>
            <span className="msg-meta-value">{modelLabel}</span>
            {providerLabel && <span className="msg-meta-provider">· {providerLabel}</span>}
          </span>
        )}
        {!modelLabel && providerLabel && (
          <span className="msg-meta-model">
            <span className="msg-meta-label">Model</span>
            <span className="msg-meta-value">{providerLabel}</span>
          </span>
        )}
      </div>
      {(startIso || endIso || durationStr) && (
        <div className="msg-meta-row msg-meta-times">
          <IconClock size={12} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          {startIso && (
            <span title={formatTime(startIso)}>Started {formatTimeShort(startIso)}</span>
          )}
          {endIso && (
            <>
              <span className="msg-meta-dot">·</span>
              <span title={formatTime(endIso)}>Ended {formatTimeShort(endIso)}</span>
            </>
          )}
          {durationStr && (
            <>
              <span className="msg-meta-dot">·</span>
              <span className="msg-meta-duration">{durationStr}</span>
            </>
          )}
          {!durationStr && startIso && endIso && (
            <>
              <span className="msg-meta-dot">·</span>
              <span>{formatDuration(Date.parse(endIso) - Date.parse(startIso))}</span>
            </>
          )}
        </div>
      )}
    </div>
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
  questions: Question[]
  onAnswerQuestion: (questionId: string, answer: string) => Promise<void>
  plan?: Plan | null
  activities?: Activity[]
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
  }, [props.messages.length, props.streamText, props.questions.length])

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

  // Flow status for chat (replaces rectangular while AI writes)
  const plan = (props as any).plan as Plan | null | undefined
  const activities = ((props as any).activities as Activity[] | undefined) ?? []
  const hasExplore = activities.some(a => ['list_files','read_file','run_shell'].includes(a.toolType))
  const workingStep = plan?.steps.find(s => s.status === 'working')
  const workingIdx = workingStep && plan ? plan.steps.indexOf(workingStep) : -1
  const totalSteps = plan?.steps.length ?? 0
  const doneSteps = plan ? plan.steps.filter(s => s.status === 'done').length : 0
  const isPlanDone = !!plan && totalSteps > 0 && doneSteps === totalSteps
  let chatStage: 'understand' | 'explore' | 'planning' | 'executing' | 'done' | 'idle' = 'idle'
  let chatStageLabel = ''
  if (props.streaming) {
    // When a previous plan is already done and a new prompt just started,
    // treat it as a fresh run (no plan yet) until a new plan is created.
    // This prevents stale plan (done) from forcing "Executing 7/6" and
    // allows Understand → Explore → Planning to show again.
    if (isPlanDone && !workingStep) {
      if (!hasExplore) { chatStage = 'understand'; chatStageLabel = 'Understanding' }
      else { chatStage = 'explore'; chatStageLabel = 'Exploring' }
    } else if (!plan && !hasExplore) { chatStage = 'understand'; chatStageLabel = 'Understanding' }
    else if (!plan && hasExplore) { chatStage = 'explore'; chatStageLabel = 'Exploring' }
    else if (plan && !workingStep && doneSteps === 0) { chatStage = 'planning'; chatStageLabel = 'Planning' }
    else if (plan && workingStep) { chatStage = 'executing'; chatStageLabel = 'Executing' }
    else if (isPlanDone) { chatStage = 'done'; chatStageLabel = 'Done' }
    else if (plan) { chatStage = 'executing'; chatStageLabel = 'Executing' }
  } else if (plan && workingStep) {
    chatStage = 'executing'; chatStageLabel = 'Executing'
  } else if (isPlanDone) {
    chatStage = 'done'; chatStageLabel = 'Done'
  }

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
                  <AssistantMeta message={m} />
                </div>
              )
            )}
            {props.streaming && (
              <div className="msg-assistant">
                <div className="role-tag">KS Agent</div>
                {chatStage !== 'idle' && chatStage !== 'done' ? (
                  <div className="chat-status">
                    <span>
                      {chatStageLabel}
                      {chatStage === 'executing' && totalSteps > 0 ? ` • Step [${workingIdx >= 0 ? workingIdx + 1 : Math.min(doneSteps + 1, totalSteps)}/${totalSteps}]` : ''}
                      {chatStage === 'planning' && totalSteps > 0 ? ` • ${totalSteps} steps` : ''}
                    </span>
                    <span className="dots"><span className="dot" /><span className="dot" /><span className="dot" /></span>
                  </div>
                ) : null}
                {props.streamText ? <Markdown content={props.streamText} /> : null}
                <span className="cursor-blink" />
              </div>
            )}
            {!props.streaming && plan && workingStep && (
              <div className="msg-assistant" style={{ border: 'none', background: 'transparent', padding: 0 }}>
                <div className="chat-status" style={{ margin: '0' }}>
                  <span>Executing • Step [{workingIdx + 1}/{totalSteps}] {workingStep.title}</span>
                  <span className="dots"><span className="dot" /><span className="dot" /><span className="dot" /></span>
                </div>
              </div>
            )}
            {props.questions.length > 0 && (
              <QuestionList questions={props.questions} onAnswer={props.onAnswerQuestion} />
            )}
          </div>
        )}
        {props.questions.length > 0 && (!props.chat || props.messages.length === 0) && !props.streaming && (
          <div className="msg-col" style={{ marginTop: 18 }}>
            <QuestionList questions={props.questions} onAnswer={props.onAnswerQuestion} />
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
              <button className="send-btn stop-btn" onClick={props.onStop} aria-label="Stop" title="Stop">
                <IconStop size={14} />
              </button>
            ) : (
              <button className="send-btn" onClick={send} disabled={!canSend} aria-label="Send" title="Send">
                <IconSend size={16} style={{ transform: 'translate(1px, -1px)' }} />
              </button>
            )}
          </div>
        </div>
      </footer>
    </>
  )
}
