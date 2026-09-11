import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ActiveAgentView, Activity, Chat, Message, ModelEntry, Plan, Question, SubAgent, SubAgentMessage, Team } from '../types'
import * as api from '../api'
import { Markdown } from './Markdown'
import { IconChevronDown, IconChevronLeft, IconRotate, IconSearch, IconStop, IconCopy, IconCheck, IconModeSolo, IconModeSwarm, IconModeHive, IconModeSquad, IconModeInfinity, IconSliders, IconLayers, IconMessageSquare, IconCoins, IconSparkles } from '../icons'
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
    if (retryInfo.reason === 'rate_limit') return '429'
    if (retryInfo.reason === 'resource_exhausted') return '429'
    if (retryInfo.reason === 'provider_error') return 'ERR'
    if (retryInfo.reason === 'network') return 'NET'
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
  const [expanded, setExpanded] = useState(false)
  const fullText = useMemo(() => (thinking ?? '').trim(), [thinking])
  const hasContentFlag = !!fullText || !!retryReason || !!stage

  // Fallback only for body when no thinking yet — header always shows just Thinking
  const bodyFallback = useMemo(() => {
    if (fullText) return fullText
    if (retryReason) return retryReason === 'timeout' ? 'handling timeout' : retryReason === 'resource_exhausted' ? 'handling capacity' : `retrying ${retryReason}`
    if (stage === 'explore') return 'exploring project files'
    if (stage === 'planning') return 'planning'
    if (stage === 'executing') return 'working on your request'
    if (stage === 'understand') return 'understanding your request'
    if (!hasContent) return 'preparing response'
    return 'generating response'
  }, [fullText, stage, hasContent, retryReason])

  if (!hasContentFlag && !hasContent) return null

  return (
    <div className={`thinking-card${expanded ? ' expanded' : ''}`} aria-live="polite">
      <button
        className="thinking-header"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Hide thinking' : 'Show thinking'}
        title={expanded ? 'Hide thinking' : 'Show thinking'}
        type="button"
      >
        <span className="thinking-bracket">&lt;</span>
        <span className="thinking-text">Thinking</span>
        <span className="thinking-bracket">&gt;</span>
        <span className="thinking-chevron" aria-hidden>
          <IconChevronDown size={12} style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' } as any} />
        </span>
        <span className="dots" aria-hidden><span className="dot" /><span className="dot" /><span className="dot" /></span>
      </button>
      {expanded && (
        <div className="thinking-body" role="region" aria-label="AI thinking">
          <div className="thinking-body-content">
            {bodyFallback}
          </div>
        </div>
      )}
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
                  {q.options.map((opt, idx) => (
                    <span key={`${idx}:${opt}`} className={`q-answered-opt${q.answer === opt || q.selectedOption === opt ? ' chosen' : ''}`}>{opt}</span>
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

function SubAgentChat({ subAgentId, streaming }: { subAgentId: string; streaming: boolean }) {
  const [msgs, setMsgs] = useState<SubAgentMessage[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    api.listSubAgentMessages(subAgentId)
      .then((list) => { if (!cancelled) setMsgs(list as any) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [subAgentId])
  useEffect(() => {
    if (!streaming) return
    let cancelled = false
    const id = setInterval(() => {
      api.listSubAgentMessages(subAgentId).then((list) => { if (!cancelled) setMsgs(list as any) }).catch(() => {})
    }, 1500)
    return () => { cancelled = true; clearInterval(id) }
  }, [subAgentId, streaming])
  if (loading) return <div style={{ padding: '10px 0', color: 'var(--text-faint)', fontSize: 12.5 }}>Loading sub-agent chat…</div>
  if (msgs.length === 0) return <p className="agent-empty-note">No messages yet — sub-agent will emit here when it starts. Try sending with Swarm mode to create sub-agents.</p>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
      {msgs.map((m) => (
        <div key={m.id} className={m.role === 'user' ? 'msg-user' : 'msg-assistant'} style={m.role === 'tool' ? { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' } : undefined}>
          {m.role !== 'user' && <div className="role-tag">{m.role === 'assistant' ? 'Sub-agent' : m.role === 'tool' ? `Tool · ${m.toolName ?? 'tool'}` : m.role}</div>}
          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13.5, lineHeight: 1.55 }}>
            {m.role === 'tool' || m.role === 'system' ? <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12.5, color: 'var(--text-dim)' }}>{m.content.slice(0, 4000)}</span> : <Markdown content={m.content} />}
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'ui-monospace, monospace' }}>{Number.isNaN(Date.parse(m.createdAt)) ? '' : new Date(m.createdAt).toLocaleTimeString()}</div>
        </div>
      ))}
    </div>
  )
}

const MODES = [
  { id: 'solo', label: 'Solo', desc: 'Single session', Icon: IconModeSolo },
  { id: 'swarm', label: 'Swarm', desc: 'Main → 5 sub-agents', Icon: IconModeSwarm },
  { id: 'hive', label: 'Hive', desc: 'Fractal depth 2', Icon: IconModeHive },
  { id: 'squad', label: 'Squad', desc: 'Team + Head', Icon: IconModeSquad },
  { id: 'infinity', label: 'Infinity', desc: 'Unlimited + Preview', Icon: IconModeInfinity },
] as const
type ModeId = typeof MODES[number]['id']

const CONTEXT_MODES = [
  { id: 'qa' as const, label: 'Chat / Q&A', desc: 'Prompt + AI output', Icon: IconMessageSquare },
  { id: 'full' as const, label: 'Full Context', desc: 'Prompt + AI + file reads/logs', Icon: IconLayers },
] as const
type ContextModeId = typeof CONTEXT_MODES[number]['id']

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
  onSend: (content: string, opts?: { contextMode?: ContextModeId; maxTokens?: number | null; thinking?: boolean }) => void
  onStop: () => void
  onRequestSettings: () => void
  questions: Question[]
  onAnswerQuestion: (questionId: string, answer: string) => Promise<void>
  plan?: Plan | null
  activities?: Activity[]
  onContinue?: () => void
  retryInfo?: { attempt: number; maxAttempts: number; delay: number; reason: string; error: string } | null
  selectedMode?: ModeId | null
  onSelectMode?: (id: ModeId) => void
  selectedContextMode?: ContextModeId | null
  onSelectContextMode?: (id: ContextModeId) => void
  maxTokens?: number | null
  onSelectMaxTokens?: (v: number | null) => void
  selectedThinking?: boolean | null
  onSelectThinking?: (v: boolean) => void
  subAgents?: SubAgent[]
  teams?: Team[]
  activeAgent?: ActiveAgentView | null
  onSelectAgent?: (view: ActiveAgentView) => void
}

export function ChatView(props: Props) {
  const [input, setInput] = useState('')
  const [modelOpen, setModelOpen] = useState(false)
  const [modelQuery, setModelQuery] = useState('')
  const [provOpen, setProvOpen] = useState(false)
  const [provFilterId, setProvFilterId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [localMode, setLocalMode] = useState<ModeId>(() => {
    try {
      const v = localStorage.getItem('ks.selectedMode') as ModeId | null
      return (v && (MODES as any).some((m: any) => m.id === v) ? v : 'solo') as ModeId
    } catch { return 'solo' }
  })
  const selectedMode: ModeId = (props.selectedMode as ModeId) ?? localMode
  const setSelectedMode = (id: ModeId) => {
    if (props.onSelectMode) props.onSelectMode(id)
    else {
      setLocalMode(id)
      try { localStorage.setItem('ks.selectedMode', id) } catch {}
    }
  }
  const selectedModeObj = MODES.find(m => m.id === selectedMode) ?? MODES[0]
  // Context mode (Chat/Q&A vs Full) + token settings — lifted to App if provided, else local
  const [localContextMode, setLocalContextMode] = useState<ContextModeId>(() => {
    try {
      const v = localStorage.getItem('ks.contextMode') as ContextModeId | null
      return v === 'full' || v === 'qa' ? v : 'qa'
    } catch { return 'qa' }
  })
  const [localMaxTokens, setLocalMaxTokens] = useState<number | null>(() => {
    try {
      const v = localStorage.getItem('ks.maxTokens')
      if (!v || v === '' || v === 'null') return null
      const n = Number(v)
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
    } catch { return null }
  })
  const selectedContextMode: ContextModeId = (props.selectedContextMode as ContextModeId) ?? localContextMode
  const setSelectedContextMode = (id: ContextModeId) => {
    if (props.onSelectContextMode) props.onSelectContextMode(id)
    else {
      setLocalContextMode(id)
      try { localStorage.setItem('ks.contextMode', id) } catch {}
    }
  }
  const selectedMaxTokens: number | null = props.maxTokens !== undefined ? (props.maxTokens as number | null) : localMaxTokens
  const setSelectedMaxTokens = (v: number | null) => {
    if (props.onSelectMaxTokens) props.onSelectMaxTokens(v)
    else {
      setLocalMaxTokens(v)
      try {
        if (v == null) localStorage.removeItem('ks.maxTokens')
        else localStorage.setItem('ks.maxTokens', String(v))
      } catch {}
    }
  }
  // Thinking toggle — only offered when the selected model has Thinking Mode enabled in its form.
  const modelThinkingEnabled = (props.models.find((m) => m.id === props.selectedModelId)?.thinkingEnabled ?? true)
  const [localThinking, setLocalThinking] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem('ks.thinking')
      if (v === 'off' || v === '0' || v === 'false') return false
      if (v === 'on' || v === '1' || v === 'true') return true
      return null
    } catch { return null }
  })
  const selectedThinking: boolean = modelThinkingEnabled ? (props.selectedThinking ?? localThinking ?? true) : false
  const setSelectedThinking = (v: boolean) => {
    if (props.onSelectThinking) props.onSelectThinking(v)
    else {
      setLocalThinking(v)
      try { localStorage.setItem('ks.thinking', v ? 'on' : 'off') } catch {}
    }
  }
  const thinkingOff = modelThinkingEnabled && !selectedThinking
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
    props.onSend(content, { contextMode: selectedContextMode, maxTokens: selectedMaxTokens, thinking: selectedThinking })
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

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element | null
      if (!t || !t.closest('.composer-menu-wrap')) setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [menuOpen])

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
  const isPlanIncomplete = !props.streaming && !!plan && totalSteps > 0 && !isPlanDone
  const showContinue = !props.streaming && !!props.onContinue && (isInterrupted || isPlanIncomplete)

  // Sub-agents / Teams bar — always visible when items exist so user can see sub agents/teams and their chat (any mode)
  const subAgents = props.subAgents ?? []
  const teams = props.teams ?? []
  const activeAgent: ActiveAgentView = props.activeAgent ?? { kind: 'main' }
  const hasAgentItems = subAgents.length > 0 || teams.length > 0
  const showAgentBar = hasAgentItems && !!props.chat
  const activeSubAgent = activeAgent.kind === 'subagent' ? subAgents.find((s) => s.id === activeAgent.id) ?? null : null
  const activeTeam = activeAgent.kind === 'team' ? teams.find((t) => t.id === activeAgent.id) ?? null : null
  const isAgentFocused = (activeAgent.kind === 'subagent' && !!activeSubAgent) || (activeAgent.kind === 'team' && !!activeTeam)
  function agentDisplayName(s: SubAgent): string {
    const rawTask = typeof (s as any)?.task === 'string' ? (s as any).task : ''
    const mode = typeof (s as any)?.mode === 'string' ? (s as any).mode : 'agent'
    const task = rawTask.replace(/\s+/g, ' ').trim()
    const short = task.length > 28 ? task.slice(0, 27) + '…' : task || mode
    return `${mode} · ${short}`
  }

  return (
    <>
      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        {isAgentFocused ? (
          <div className="msg-col">
            <div className="agent-focus">
              <div className="agent-focus-head">
                <button
                  className="agent-back"
                  onClick={() => props.onSelectAgent?.({ kind: 'main' })}
                  aria-label="Back to main agent"
                  title="Back to main agent"
                >
                  <IconChevronLeft size={14} />
                  <span>Main</span>
                </button>
                {activeSubAgent && (
                  <span className="agent-focus-title" title={activeSubAgent.task}>
                    Sub-agent · {activeSubAgent.mode}
                  </span>
                )}
                {activeTeam && (
                  <span className="agent-focus-title" title={activeTeam.name}>
                    Team · {activeTeam.name}
                  </span>
                )}
                {activeSubAgent && (
                  <span className={`agent-status agent-status-${activeSubAgent.status}`} title={`Status: ${activeSubAgent.status}`}>
                    <span className="agent-dot" aria-hidden />
                    {activeSubAgent.status}
                  </span>
                )}
              </div>
              {activeSubAgent && (
                <div className="msg-assistant">
                  <div className="role-tag">{activeSubAgent.mode} sub-agent · {activeSubAgent.status}</div>
                  <div className="agent-task-label">Task</div>
                  <div className="agent-task">{activeSubAgent.task}</div>
                  <div className="agent-meta">
                    {activeSubAgent.teamId && <span className="agent-meta-chip" title={`Team ${activeSubAgent.teamId}`}>team:{activeSubAgent.teamId.slice(0, 6)}</span>}
                    {activeSubAgent.modelId && <span className="agent-meta-chip" title={activeSubAgent.modelId}>model:{activeSubAgent.modelId.slice(0, 18)}</span>}
                    {activeSubAgent.worktreePath && <span className="agent-meta-chip" title={activeSubAgent.worktreePath}>worktree</span>}
                    {activeSubAgent.parentSubAgentId && <span className="agent-meta-chip" title={activeSubAgent.parentSubAgentId}>parent:{activeSubAgent.parentSubAgentId.slice(0, 6)}</span>}
                  </div>
                  {activeSubAgent.result ? (
                    <>
                      <div className="agent-task-label" style={{ marginTop: 10 }}>Result</div>
                      <ClampedContent>
                        <Markdown content={activeSubAgent.result} />
                      </ClampedContent>
                    </>
                  ) : (
                    <p className="agent-empty-note">{props.streaming || activeSubAgent.status === 'working' ? 'Working — result will appear here when done.' : 'No result yet — sub-agent chat below shows live progress.'}</p>
                  )}
                  <div className="agent-task-label" style={{ marginTop: 14 }}>Chat — sub-agent conversation</div>
                  <SubAgentChat subAgentId={activeSubAgent.id} streaming={props.streaming || activeSubAgent.status === 'working'} />
                </div>
              )}
              {activeTeam && (
                <div className="msg-assistant">
                  <div className="role-tag">Team head chat · {activeTeam.name}</div>
                  <div className="agent-task-label">Head</div>
                  <div className="agent-task">{activeTeam.headId ? `Head: ${activeTeam.headId.slice(0, 8)}` : 'Head: main agent'}</div>
                  <div className="agent-task-label" style={{ marginTop: 10 }}>Members ({subAgents.filter((s) => s.teamId === activeTeam.id).length})</div>
                  {subAgents.filter((s) => s.teamId === activeTeam.id).length === 0 ? (
                    <p className="agent-empty-note">No members yet — the main agent will add sub-agents to this team.</p>
                  ) : (
                    <div className="agent-member-list">
                      {subAgents.filter((s) => s.teamId === activeTeam.id).map((m) => (
                        <button key={m.id} className="agent-box" onClick={() => props.onSelectAgent?.({ kind: 'subagent', id: m.id })} title={m.task}>
                          <span className={`agent-dot agent-status-${m.status}`} aria-hidden />
                          <span className="agent-box-name">{agentDisplayName(m)}</span>
                          <span className="agent-box-status">{m.status}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (!props.chat || props.messages.length === 0) && !props.streaming ? (
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
              <>
                <span className="empty-hint">
                  {props.models.length === 0
                    ? 'Add a provider + model in Settings to begin'
                    : selectedModelLabel
                      ? `Model: ${selectedModelLabel}`
                      : 'Select a model below'}
                </span>
                {props.models.length === 0 && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                    <button className="btn btn-primary" onClick={() => props.onRequestSettings()} style={{ padding: '10px 18px', fontSize: 14 }}>
                      Open Settings
                    </button>
                  </div>
                )}
              </>
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
        {props.retryInfo && !props.streaming && (
          <div className="msg-col" style={{ marginTop: 10 }}>
            <RetryCard retryInfo={props.retryInfo} />
          </div>
        )}
      </div>

      {showContinue && (
        <div style={{ padding: '8px 14px 0', display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13 }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{isPlanIncomplete && !isInterrupted ? `Plan incomplete · ${doneSteps}/${totalSteps} done` : isInterrupted && isPlanIncomplete ? `Interrupted · ${doneSteps}/${totalSteps} done` : 'Response was interrupted'}</span>
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
          {showAgentBar && (
            <div className="agent-bar" role="list" aria-label="Sub-agents and teams">
              <button
                className={`agent-box${activeAgent.kind === 'main' ? ' active' : ''}`}
                onClick={() => props.onSelectAgent?.({ kind: 'main' })}
                title="Main agent chat"
                aria-label="Main agent chat"
                role="listitem"
              >
                <span className="agent-dot agent-status-done" aria-hidden />
                <span className="agent-box-name">Main</span>
              </button>
              {teams.map((t) => (
                <button
                  key={t.id}
                  className={`agent-box agent-box-team${activeAgent.kind === 'team' && activeAgent.id === t.id ? ' active' : ''}`}
                  onClick={() => props.onSelectAgent?.({ kind: 'team', id: t.id })}
                  title={`Team: ${t.name} — open team head chat`}
                  aria-label={`Team ${t.name}`}
                  role="listitem"
                >
                  <span className="agent-dot agent-status-working" aria-hidden />
                  <span className="agent-box-name">Team · {t.name}</span>
                </button>
              ))}
              {subAgents.map((s) => (
                <button
                  key={s.id}
                  className={`agent-box${activeAgent.kind === 'subagent' && activeAgent.id === s.id ? ' active' : ''}`}
                  onClick={() => props.onSelectAgent?.({ kind: 'subagent', id: s.id })}
                  title={`${(s as any)?.mode ?? 'agent'} sub-agent: ${(s as any)?.task ?? ''} — open sub-agent chat`}
                  aria-label={`Sub-agent ${(s as any)?.mode ?? ''}: ${String((s as any)?.task ?? '').slice(0, 60)}`}
                  role="listitem"
                >
                  <span className={`agent-dot agent-status-${s.status}`} aria-hidden />
                  <span className="agent-box-name">{agentDisplayName(s)}</span>
                  <span className="agent-box-status">{s.status}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            className="composer-input"
            rows={1}
            aria-label="Message KS Agent"
            placeholder={!props.hasProject ? 'Select a project first' : isAgentFocused && activeSubAgent ? `Message ${activeSubAgent.mode} sub-agent… (sends to main chat)` : isAgentFocused && activeTeam ? `Message team ${activeTeam.name} head… (sends to main chat)` : 'Message KS Agent…'}
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
            <div className="composer-menu-wrap" style={{ position: 'relative' }}>
              <button
                className="menu-toggle"
                onClick={() => setMenuOpen((v) => !v)}
                title="Composer settings"
                aria-label="Composer settings"
                aria-expanded={menuOpen}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  width: 36,
                  height: 36,
                  padding: 0,
                  background: menuOpen || selectedMode !== 'solo' || selectedContextMode !== 'qa' || selectedMaxTokens != null || thinkingOff ? 'var(--primary-bg)' : 'var(--surface-2)',
                  border: `1px solid ${menuOpen || selectedMode !== 'solo' || selectedContextMode !== 'qa' || selectedMaxTokens != null || thinkingOff ? 'var(--primary-border)' : 'var(--border)'}`,
                  borderRadius: 8,
                  color: menuOpen || selectedMode !== 'solo' || selectedContextMode !== 'qa' || selectedMaxTokens != null || thinkingOff ? 'var(--primary)' : 'var(--text-dim)',
                  cursor: 'pointer',
                  lineHeight: 1,
                  position: 'relative',
                }}
              >
                <IconSliders size={16} />
                {(selectedMode !== 'solo' || selectedContextMode !== 'qa' || selectedMaxTokens != null || thinkingOff) && !menuOpen && (
                  <span style={{ position: 'absolute', top: 5, right: 5, width: 6, height: 6, borderRadius: '50%', background: 'var(--primary)', boxShadow: '0 0 6px var(--primary-ring)' }} />
                )}
              </button>
              {menuOpen && (
                <div
                  className="composer-menu"
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    left: 0,
                    width: 320,
                    maxWidth: 'min(340px, 88vw)',
                    maxHeight: 'min(520px, 70vh)',
                    overflowY: 'auto',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 12,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.12)',
                    zIndex: 45,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0,
                  }}
                >
                  {/* Mode selection */}
                  <div style={{ padding: '10px 10px 8px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', flexShrink: 0 }}><selectedModeObj.Icon size={14} /></span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 }}>Mode selection</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', background: 'var(--primary-bg)', border: '1px solid var(--primary-border)', borderRadius: 6, padding: '2px 6px' }}>{selectedModeObj.label}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {MODES.map((m) => (
                        <button
                          key={m.id}
                          className={`dd-item${m.id === selectedMode ? ' active' : ''}`}
                          onClick={() => setSelectedMode(m.id as ModeId)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', textAlign: 'left', borderRadius: 8 }}
                        >
                          <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: m.id === selectedMode ? 'var(--primary)' : 'var(--text-dim)' }}>
                            <m.Icon size={15} />
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{m.label}</span>
                            <small style={{ color: 'var(--text-faint)', fontSize: 11 }}>{m.desc}</small>
                          </span>
                          {m.id === selectedMode && <span style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>✓</span>}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.4, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 7px' }}>
                      <span style={{ fontWeight: 700, color: selectedMode !== 'solo' ? 'var(--primary)' : 'var(--text-faint)' }}>{selectedMode !== 'solo' ? 'FORCED: ' : ''}</span>Solo=1 · Swarm=2-5 · Hive=nested · Squad=2+Team · Infinity=unlimited+Preview{selectedMode !== 'solo' ? ' — AI must delegate' : ''}
                    </div>
                  </div>

                  {/* Context selection */}
                  <div style={{ padding: '10px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', flexShrink: 0 }}><IconLayers size={14} /></span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 }}>Chat context</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: selectedContextMode === 'qa' ? 'var(--text-faint)' : 'var(--primary)', background: selectedContextMode === 'qa' ? 'var(--btn)' : 'var(--primary-bg)', border: `1px solid ${selectedContextMode === 'qa' ? 'var(--border)' : 'var(--primary-border)'}`, borderRadius: 6, padding: '2px 6px' }}>{selectedContextMode === 'qa' ? 'Q&A' : 'Full'}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {CONTEXT_MODES.map((cm) => (
                        <button
                          key={cm.id}
                          className={`dd-item${cm.id === selectedContextMode ? ' active' : ''}`}
                          onClick={() => setSelectedContextMode(cm.id)}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', textAlign: 'left', borderRadius: 8 }}
                        >
                          <span style={{ width: 22, height: 22, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: cm.id === selectedContextMode ? 'var(--primary)' : 'var(--text-dim)' }}>
                            <cm.Icon size={14} />
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{cm.label}</span>
                            <small style={{ color: 'var(--text-faint)', fontSize: 11 }}>{cm.desc}</small>
                          </span>
                          {cm.id === selectedContextMode && <span style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>✓</span>}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.45 }}>
                      <span style={{ color: selectedContextMode === 'qa' ? 'var(--text)' : 'var(--text-faint)', fontWeight: selectedContextMode === 'qa' ? 600 : 400 }}>Q&A</span> = prompt + AI output (light, cheap) · <span style={{ color: selectedContextMode === 'full' ? 'var(--text)' : 'var(--text-faint)', fontWeight: selectedContextMode === 'full' ? 600 : 400 }}>Full</span> = + file reads/logs (heavy, best for coding, uses more tokens)
                    </div>
                  </div>

                  {/* Thinking toggle — only when the selected model has Thinking Mode enabled */}
                  {modelThinkingEnabled && (
                    <div style={{ padding: '10px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <span style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', flexShrink: 0 }}><IconSparkles size={14} /></span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 }}>Thinking</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: selectedThinking ? 'var(--primary)' : 'var(--text-faint)', background: selectedThinking ? 'var(--primary-bg)' : 'var(--btn)', border: `1px solid ${selectedThinking ? 'var(--primary-border)' : 'var(--border)'}`, borderRadius: 6, padding: '2px 6px' }}>{selectedThinking ? 'On' : 'Off'}</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {([
                          { id: true, label: 'On', desc: 'Show the model\u2019s reasoning in the Thinking card while it works' },
                          { id: false, label: 'Off', desc: 'Hide reasoning — reply text only (provider still thinks)' },
                        ] as const).map((opt) => (
                          <button
                            key={opt.label}
                            className={`dd-item${opt.id === selectedThinking ? ' active' : ''}`}
                            onClick={() => setSelectedThinking(opt.id)}
                            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', textAlign: 'left', borderRadius: 8 }}
                          >
                            <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{opt.label}</span>
                              <small style={{ color: 'var(--text-faint)', fontSize: 11 }}>{opt.desc}</small>
                            </span>
                            {opt.id === selectedThinking && <span style={{ color: 'var(--primary)', fontSize: 12, fontWeight: 700 }}>✓</span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Token settings */}
                  <div style={{ padding: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                      <span style={{ width: 20, height: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)', flexShrink: 0 }}><IconCoins size={14} /></span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', letterSpacing: 0.4, textTransform: 'uppercase', flex: 1 }}>Token settings</span>
                      <span style={{ fontSize: 10, fontWeight: 600, color: selectedMaxTokens == null ? 'var(--text-faint)' : 'var(--primary)', background: selectedMaxTokens == null ? 'var(--btn)' : 'var(--primary-bg)', border: `1px solid ${selectedMaxTokens == null ? 'var(--border)' : 'var(--primary-border)'}`, borderRadius: 6, padding: '2px 6px' }}>{selectedMaxTokens == null ? 'Auto' : selectedMaxTokens.toLocaleString()}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={256}
                        max={128000}
                        step={256}
                        placeholder="Auto"
                        value={selectedMaxTokens ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.trim()
                          if (v === '') setSelectedMaxTokens(null)
                          else {
                            const n = Number(v)
                            if (!Number.isFinite(n) || n <= 0) return
                            setSelectedMaxTokens(Math.max(256, Math.min(128000, Math.floor(n))))
                          }
                        }}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          padding: '8px 10px',
                          background: 'var(--input)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          color: 'var(--text)',
                          fontSize: 13,
                          outline: 'none',
                        }}
                      />
                      {selectedMaxTokens != null && (
                        <button
                          className="btn"
                          onClick={() => setSelectedMaxTokens(null)}
                          title="Reset to Auto"
                          style={{ padding: '7px 10px', fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}
                        >
                          Auto
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 7, flexWrap: 'wrap' }}>
                      {[null, 4096, 8192, 16384, 32000].map((v) => (
                        <button
                          key={String(v)}
                          onClick={() => setSelectedMaxTokens(v)}
                          className={`filter-chip${(v == null ? selectedMaxTokens == null : selectedMaxTokens === v) ? ' active' : ''}`}
                          style={{ height: 26, padding: '0 8px', fontSize: 11, borderRadius: 6 }}
                        >
                          {v == null ? 'Auto' : v.toLocaleString()}
                        </button>
                      ))}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.4 }}>
                      Max tokens per reply. Auto = model default. Higher = longer replies but more cost.
                    </div>
                  </div>
                </div>
              )}
            </div>
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
