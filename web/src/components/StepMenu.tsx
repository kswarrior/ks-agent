import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Message, RunStep } from '../types'
import { describeTool, parseToolArgs, toolLabel } from '../toolDisplay'

type PlanStep = { text: string; done: boolean }
type PlanSnapshot = { title: string; steps: PlanStep[] }

function latestPlan(messages: Message[]): PlanSnapshot | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.role === 'user') break
    if (message.role !== 'assistant' || !message.toolCalls) continue
    for (let callIndex = message.toolCalls.length - 1; callIndex >= 0; callIndex -= 1) {
      const call = message.toolCalls[callIndex]
      if (call.function.name !== 'update_plan') continue
      const args = parseToolArgs(call.function.arguments)
      const title = typeof args.title === 'string' && args.title.trim() ? args.title.trim() : 'Plan'
      const rawSteps = Array.isArray(args.steps) ? args.steps : []
      const steps: PlanStep[] = []
      for (const item of rawSteps) {
        if (typeof item === 'string') {
          if (item.trim()) steps.push({ text: item.trim(), done: false })
          continue
        }
        if (!item || typeof item !== 'object') continue
        const step = item as Record<string, unknown>
        if (typeof step.text !== 'string' || !step.text.trim()) continue
        steps.push({ text: step.text.trim(), done: step.done === true })
      }
      if (steps.length > 0) return { title, steps }
    }
  }
  return null
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  if (ms < 10_000) return `${(ms / 1000).toFixed(1)}s`
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

function stepSnippet(step: RunStep): string {
  const text = step.content.trim()
  if (text) {
    const line = text.split('\n').map((entry) => entry.trim()).find(Boolean) ?? ''
    return line.replace(/^[#>*\-\s]+/, '').slice(0, 140)
  }
  if (step.tools.length) {
    return `${step.tools.length} tool ${step.tools.length === 1 ? 'call' : 'calls'}`
  }
  return step.status === 'running' ? 'Waiting for output…' : 'No text output'
}

function stepStatusLabel(step: RunStep): string {
  if (step.status === 'error') return 'Failed'
  if (step.status === 'done') return 'Done'
  return 'Running'
}

export function StepMenu({
  messages,
  steps,
  streaming
}: {
  messages: Message[]
  steps: RunStep[]
  streaming: boolean
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLLIElement | null>(null)

  const ordered = [...steps].sort((a, b) => a.step - b.step)
  const latest = ordered[ordered.length - 1]
  const currentStep = latest?.step ?? 0
  const plan = useMemo(() => latestPlan(messages), [messages])
  const completedPlanSteps = plan?.steps.filter((step) => step.done).length ?? 0
  const activePlanIndex = plan && streaming ? plan.steps.findIndex((step) => !step.done) : -1
  const countLabel = plan
    ? `${completedPlanSteps}/${plan.steps.length}`
    : ordered.length > 0
      ? String(currentStep)
      : ''

  const position = () => {
    const next = triggerRef.current?.getBoundingClientRect()
    if (next) setRect(next)
  }

  useEffect(() => {
    if (!open) return
    position()
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !popupRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open])

  useEffect(() => {
    if (steps.length === 0 && !streaming && !plan) setOpen(false)
  }, [steps.length, streaming, plan])

  useEffect(() => {
    if (!open || !streaming) return
    const timer = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(timer)
  }, [open, streaming])

  useEffect(() => {
    if (!open) return
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open, plan, ordered.length, latest?.status, latest?.content.length, latest?.tools.length])

  if (ordered.length === 0 && !streaming && !plan) return null

  return (
    <div className="step-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`step-btn ${open ? 'open' : ''} ${streaming ? 'live' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={streaming ? 'Show live steps' : 'Show steps'}
      >
        {streaming ? (
          <span className="step-live-dot" aria-hidden="true" />
        ) : (
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 6h13M8 12h13M8 18h13" />
            <path d="M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        )}
        <span>Steps</span>
        {countLabel && <span className="step-btn-count">{countLabel}</span>}
        <svg
          className="step-caret"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 15 6-6 6 6" />
        </svg>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popupRef}
            className="step-popup"
            role="dialog"
            aria-label="Run steps"
            style={{
              right: Math.max(8, window.innerWidth - rect.right),
              bottom: window.innerHeight - rect.top + 8
            }}
          >
            <div className="step-popup-head">
              <span>{plan ? 'Plan' : 'Run steps'}</span>
              <span className="step-popup-meta">
                {streaming && (
                  <span className="step-live">
                    <span className="step-live-dot" aria-hidden="true" />
                    Live
                  </span>
                )}
                {countLabel && <span>{countLabel}</span>}
              </span>
            </div>
            {plan ? (
              <>
                {plan.title !== 'Plan' && <div className="plan-title">{plan.title}</div>}
                <ol className="step-list plan-list">
                  {plan.steps.map((step, index) => {
                    const status = step.done ? 'done' : index === activePlanIndex ? 'running' : 'pending'
                    return (
                      <li
                        key={`${index}-${step.text}`}
                        ref={status === 'running' ? activeRef : undefined}
                        className={`plan-item ${status}`}
                      >
                        <span className={`plan-dot ${status}`} aria-hidden="true" />
                        <span className="plan-text">{step.text}</span>
                      </li>
                    )
                  })}
                </ol>
              </>
            ) : ordered.length === 0 ? (
              <div className="step-empty">Waiting for the first step…</div>
            ) : (
              <ol className="step-list">
                {ordered.map((step) => {
                  const isActive = step.step === latest?.step
                  const duration =
                    step.status === 'running' ? Math.max(0, now - step.startedAt) : step.durationMs ?? 0
                  return (
                    <li
                      key={step.step}
                      ref={isActive ? activeRef : undefined}
                      className={`step-item ${isActive ? 'active' : ''} ${step.status}`}
                    >
                      <span className="step-item-num">{step.step}</span>
                      <div className="step-item-main">
                        <div className="step-item-row">
                          <span className="step-item-title">Step {step.step}</span>
                          <span className={`step-item-state ${step.status}`}>{stepStatusLabel(step)}</span>
                          {duration > 0 && <span className="step-item-time">{formatDuration(duration)}</span>}
                        </div>
                        <span className="step-item-snippet">{stepSnippet(step)}</span>
                        {step.tools.length > 0 && (
                          <div className="step-item-tools">
                            {step.tools.map((tool) => {
                              const label = toolLabel(tool.name, tool.status === 'running')
                              const { primary, detail } = describeTool(
                                tool.name,
                                parseToolArgs(tool.arguments)
                              )
                              const text = primary ? `${label} ${primary}` : label
                              return (
                                <span
                                  className={`step-tool ${tool.status}`}
                                  key={tool.id}
                                  title={detail || text}
                                >
                                  {tool.status === 'running' && (
                                    <span className="step-tool-dot" aria-hidden="true" />
                                  )}
                                  {text}
                                  {tool.status !== 'running' && typeof tool.durationMs === 'number' && (
                                    <span className="step-tool-time">{formatDuration(tool.durationMs)}</span>
                                  )}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
