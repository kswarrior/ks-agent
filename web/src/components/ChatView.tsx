import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Activity, Chat, Message, ModelEntry, Plan, Question } from '../types'
import { Markdown } from './Markdown'
import { IconChevronDown, IconRotate, IconSearch, IconStop, IconCopy, IconCheck } from '../icons'
import { QuestionList } from './QuestionCard'
import { useToast } from '../toast'

function ClampedContent({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1)
    check()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    if (ro) ro.observe(el)
    return () => { if (ro) ro.disconnect() }
  }, [children])

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

function RetryCard({ retryInfo }: { retryInfo: { attempt: number; maxAttempts: number; delay: number; reason: string; error: string } }) {
  const [remaining, setRemaining] = useState(retryInfo.delay)
  const [expanded, setExpanded] = useState(false)
  const startRef = useRef<number>(Date.now())
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const errorCode = useMemo(() => {
    const err = retryInfo.error || ''
    const m = err.match(/\b(429|500|502|503|400|401|403|404|408|504|524|529)\b/)
    if (m) return m[1]
    if (retryInfo.reason === 'timeout') return 'TIMEOUT'
    if (retryInfo.reason === 'resource_exhausted') return '429'
    if (retryInfo.reason === 'provider_error') return 'ERR'
    return retryInfo.reason ? retryInfo.reason.toUpperCase().slice(0, 12) : 'ERR'
  }, [retryInfo.error, retryInfo.reason])

  useEffect(() => {
    startRef.current = Date.now()
    setRemaining(retryInfo.delay)
    if (intervalRef.current) clearInterval(intervalRef.current)
    // tick every 200ms so 2s -> after 1s shows 1s -> after next 1s shows 0 (Retrying…)
    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startRef.current
      const rem = Math.max(0, retryInfo.delay - elapsed)
      setRemaining(rem)
      if (rem <= 0 && intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }, 200)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [retryInfo.attempt, retryInfo.delay, retryInfo.error, retryInfo.maxAttempts, retryInfo.reason])

  const secs = Math.max(0, Math.ceil(remaining / 1000))
  const isRetryingNow = remaining <= 0

  return (
    <div style={{ marginTop: 8, position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: expanded ? 8 : 0,
          padding: '8px 10px',
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <IconRotate size={13} className="spin" style={{ color: 'var(--text-dim)', flexShrink: 0 } as any} />
            <span style={{ color: 'var(--text-dim)', fontSize: 12.5, whiteSpace: 'nowrap' }}>
              {isRetryingNow ? 'Retrying…' : `Retry in ${secs}s`}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <button
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? 'Hide details' : 'Show full error'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                background: 'var(--danger-bg)',
                border: '1px solid #58201f',
                borderRadius: 4,
                color: 'var(--danger)',
                fontSize: 11.5,
                fontWeight: 700,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                cursor: 'pointer',
                lineHeight: 1,
              }}
            >
              <span>{errorCode}</span>
              <IconChevronDown size={10} style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' } as any} />
            </button>
            <span
              title={`${retryInfo.attempt} of ${retryInfo.maxAttempts} retries`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '3px 6px',
                background: 'var(--btn)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                color: 'var(--text-dim)',
                fontSize: 11,
                fontWeight: 600,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                lineHeight: 1,
                whiteSpace: 'nowrap',
              }}
            >
              {retryInfo.attempt}/{retryInfo.maxAttempts}
            </span>
          </div>
        </div>
        {expanded && (
          <div
            style={{
              background: 'var(--input)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '8px 10px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 11.5,
              color: 'var(--text-dim)',
              maxHeight: 180,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              lineHeight: 1.5,
            }}
          >
            {retryInfo.error?.trim() ? retryInfo.error.trim() : `Reason: ${retryInfo.reason || 'unknown'}`}
          </div>
        )}
      </div>
    </div>
  )
}

function ThinkingCard({ stage, stageLabel, thinking, hasContent, retryReason }: { stage: string; stageLabel: string; thinking?: string; hasContent: boolean; retryReason?: string }) {
  const text = useMemo(() => {
    const t = (thinking ?? '').trim().replace(/\s+/g, ' ')
    if (t) return t.length > 120 ? t.slice(0, 120) + '…' : t
    if (retryReason) return retryReason === 'timeout' ? 'handling timeout' : retryReason === 'resource_exhausted' ? 'handling capacity' : `retrying ${retryReason}`
    if (stage === 'explore') return 'exploring project files'
    if (stage === 'planning') return 'planning'
    if (stage === 'executing') return 'working on your request'
    if (stage === 'understand') return 'understanding your request'
    if (!hasContent) return 'preparing response'
    return 'generating response'
  }, [thinking, stage, hasContent, retryReason])

  const label = stageLabel && stageLabel !== 'Executing' ? stageLabel : 'Thinking'

  return (
    <div className="thinking-card" aria-live="polite">
      <span className="thinking-label">{label}</span>
      <span className="thinking-bracket">&lt;</span>
      <span className="thinking-text" title={text}>{text}</span>
      <span className="thinking-bracket">&gt;</span>
      <span className="dots" aria-hidden><span className="dot" /><span className="dot" /><span className="dot" /></span>
    </div>
  )
}

function AnsweredQuestionsCard({ questions }: { questions: Question[] }) {
  const [expanded, setExpanded] = useState(false)
  const answered = useMemo(() => questions.filter(q => q.status === 'answered'), [questions])
  if (answered.length === 0) return null
  const sorted = [...answered].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return (
    <div className={`q-answered-card${expanded ? ' expanded' : ''}`} onClick={() => setExpanded(v => !v)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v) } }} aria-expanded={expanded}>
      <div className="q-answered-head">
        <span className="q-answered-title">Question</span>
        <span className="q-answered-count">· {answered.length} answered</span>
        <span className="q-answered-chevron"><IconChevronDown size={14} style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' } as any} /></span>
        <span className="q-answered-hint">{expanded ? 'Hide' : 'Show'}</span>
      </div>
      {expanded && (
        <div className="q-answered-body" onClick={(e) => e.stopPropagation()}>
          {sorted.map((q) => (
            <div key={q.id} className="q-answered-item">
              <div className="q-answered-header">{q.header}</div>
              <div className="q-answered-question">{q.question}</div>
              <div className="q-answered-answer">
                <span className="q-answered-answer-label">You answered:</span>
                <span className="q-answered-answer-text">{q.answer}</span>
                {q.selectedOption && q.selectedOption !== q.answer && <span className="q-answered-selected">({q.selectedOption})</span>}
              </div>
              {q.options.length > 0 && (
                <div className="q-answered-options">
                  {q.options.map(opt => (
                    <span key={opt} className={`q-answered-opt${q.answer === opt || q.selectedOption === opt ? ' chosen' : ''}`}>{opt}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AssistantMeta({ message }: { message: Message }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const modelLabel = (message.modelDisplayName?.trim() ? message.modelDisplayName.trim() : '') || message.model || ''
  const providerLabel = message.providerName || ''
  const displayModel = modelLabel || providerLabel
  const fullModelTitle = modelLabel && message.model && modelLabel !== message.model ? `${modelLabel} · ${message.model}` : modelLabel || providerLabel
  const startIso = message.startedAt
  const endIso = message.finishedAt || message.createdAt
  const startShort = formatTimeShort(startIso)
  const endShort = formatTimeShort(endIso)
  const durationMs = message.durationMs ?? (startIso && endIso ? Date.parse(endIso) - Date.parse(startIso) : undefined)
  const durationStr = durationMs != null && Number.isFinite(durationMs) && durationMs >= 0 ? formatDuration(durationMs) : ''

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      toast('Copied', 'success')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setCopied(false), 1400)
    } catch {
      toast('Copy failed', 'error')
    }
  }

  return (
    <div className="msg-meta">
      <div className="msg-meta-row">
        <button className="msg-meta-copy" onClick={handleCopy} title={copied ? 'Copied' : 'Copy'} aria-label={copied ? 'Copied' : 'Copy'}>
          {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
        </button>
        {displayModel && (
          <span className="msg-meta-model" title={fullModelTitle}>
            <span className="msg-meta-value msg-meta-ellipsis">{displayModel}</span>
          </span>
        )}
        {(startShort || endShort || durationStr) && (
          <span className="msg-meta-times-inline">
            {startShort && endShort ? (
              <span title={`${formatTime(startIso)} > ${formatTime(endIso)}`}>{startShort} &gt; {endShort}</span>
            ) : startShort ? (
              <span title={formatTime(startIso)}>{startShort}</span>
            ) : endShort ? (
              <span title={formatTime(endIso)}>{endShort}</span>
            ) : null}
            {durationStr && (
              <>
                <span className="msg-meta-dot">·</span>
                <span className="msg-meta-duration" title={`${durationMs}ms`}>{durationStr}</span>
              </>
            )}
          </span>
        )}
      </div>
    </div>
  )
}

interface Props {
  chat: Chat | null
  hasProject: boolean
  messages: Message[]
  streaming: boolean
  streamText: string
  streamThinking?: string
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
  onContinue?: () => void
  retryInfo?: { attempt: number; maxAttempts: number; delay: number; reason: string; error: string } | null
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

  useEffect(() => {
    if (!provOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (!t || !t.closest('.prov-filter-wrap')) setProvOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setProvOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [provOpen])

  useEffect(() => {
    if (!modelOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setModelOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [modelOpen])

  // Flow status for chat (replaces rectangular while AI writes)
  const plan = (props as any).plan as Plan | null | undefined
  const activities = ((props as any).activities as Activity[] | undefined) ?? []

  const flowStatus = useMemo(() => {
    const hasExplore = activities.some(a => ['list_files', 'read_file', 'run_shell'].includes(a.toolType))
    const workingStep = plan?.steps.find(s => s.status === 'working')
    const workingIdx = workingStep && plan ? plan.steps.indexOf(workingStep) : -1
    const totalSteps = plan?.steps.length ?? 0
    const doneSteps = plan ? plan.steps.filter(s => s.status === 'done').length : 0
    const isPlanDone = !!plan && totalSteps > 0 && doneSteps === totalSteps

    let chatStage: 'understand' | 'explore' | 'planning' | 'executing' | 'done' | 'idle' = 'idle'
    let chatStageLabel = ''

    if (props.streaming) {
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

    return { hasExplore, workingStep, workingIdx, totalSteps, doneSteps, isPlanDone, chatStage, chatStageLabel }
  }, [plan, activities, props.streaming])

  const { hasExplore, workingStep, workingIdx, totalSteps, doneSteps, isPlanDone, chatStage, chatStageLabel } = flowStatus

  const showExecCard = (props.streaming && chatStage === 'executing' && totalSteps > 0) || (!props.streaming && !!workingStep)
  const execStepNum = workingIdx >= 0 ? workingIdx + 1 : Math.min(doneSteps + 1, totalSteps || 1)
  const execStepBadge = totalSteps > 0 ? `${execStepNum}/${totalSteps}` : `${execStepNum}`
  const execTitle = workingStep?.title ?? ''

  const lastAssistantMsg = props.messages.length > 0 ? props.messages[props.messages.length - 1] : null
  const isInterrupted = !props.streaming && !!lastAssistantMsg && lastAssistantMsg.role === 'assistant' && (!!lastAssistantMsg.error || /\n\n_\[stopped\]_\s*$/.test(lastAssistantMsg.content) || /\n\n_\[stream interrupted:/.test(lastAssistantMsg.content) || /\n\n_\[truncated/.test(lastAssistantMsg.content))

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
                {props.retryInfo && <RetryCard retryInfo={props.retryInfo} />}
                {props.streamText ? <Markdown content={props.streamText} /> : null}
                <ThinkingCard
                  stage={chatStage}
                  stageLabel={chatStageLabel}
                  thinking={props.streamThinking ?? ''}
                  hasContent={!!props.streamText}
                  retryReason={props.retryInfo?.reason}
                />
              </div>
            )}
            {(() => {
              const pending = props.questions.filter(q => q.status === 'pending')
              if (pending.length > 0) return <QuestionList questions={props.questions} onAnswer={props.onAnswerQuestion} />
              const answered = props.questions.filter(q => q.status === 'answered')
              if (answered.length > 0) return <AnsweredQuestionsCard questions={props.questions} />
              return null
            })()}
          </div>
        )}
        {props.questions.length > 0 && (!props.chat || props.messages.length === 0) && !props.streaming && (
          <div className="msg-col" style={{ marginTop: 18 }}>
            {(() => {
              const pending = props.questions.filter(q => q.status === 'pending')
              if (pending.length > 0) return <QuestionList questions={props.questions} onAnswer={props.onAnswerQuestion} />
              const answered = props.questions.filter(q => q.status === 'answered')
              if (answered.length > 0) return <AnsweredQuestionsCard questions={props.questions} />
              return null
            })()}
          </div>
        )}
      </div>

      {isInterrupted && props.onContinue && (
        <div style={{ padding: '8px 14px 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Response was interrupted</span>
            <button
              className="btn btn-primary"
              style={{ padding: '5px 12px', fontSize: 12, borderRadius: 8 }}
              onClick={() => props.onContinue?.()}
            >
              Continue
            </button>
            <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>or type anything to resume</span>
          </div>
        </div>
      )}
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

            {showExecCard && (
              <div className="composer-exec-card" title={execTitle ? `Executing • Step [${execStepBadge}] ${execTitle}` : `Executing • Step [${execStepBadge}]`}>
                <span className="exec-label">Executing</span>
                <span className="exec-step-badge">[{execStepBadge}]</span>
                {execTitle && <span className="exec-title">{execTitle}</span>}
                <span className="dots" aria-hidden><span className="dot" /><span className="dot" /><span className="dot" /></span>
              </div>
            )}

            {props.streaming ? (
              <button className="send-btn stop-btn" onClick={props.onStop} aria-label="Stop" title="Stop">
                <IconStop size={14} />
              </button>
            ) : (
              <button className="send-btn" onClick={send} disabled={!canSend} aria-label="Send" title="Send">
                <span aria-hidden style={{ fontSize: 18, lineHeight: 1, letterSpacing: 0 }}>⌯⌲</span>
              </button>
            )}
          </div>
        </div>
      </footer>
    </>
  )
}
