import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Message } from '../types'
import { parseToolArgs } from '../toolDisplay'

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

export function StepMenu({ messages, streaming }: { messages: Message[]; streaming: boolean }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const activeRef = useRef<HTMLLIElement | null>(null)

  const plan = useMemo(() => latestPlan(messages), [messages])
  const completedPlanSteps = plan?.steps.filter((step) => step.done).length ?? 0
  const activePlanIndex = plan && streaming ? plan.steps.findIndex((step) => !step.done) : -1
  const countLabel = plan ? `${completedPlanSteps}/${plan.steps.length}` : ''

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
    if (!plan) setOpen(false)
  }, [plan])

  useEffect(() => {
    if (!open) return
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [open, plan])

  if (!plan) return null

  return (
    <div className="step-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`step-btn ${open ? 'open' : ''} ${streaming ? 'live' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={streaming ? 'Show live plan' : 'Show plan steps'}
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
        <span className="step-btn-count">{countLabel}</span>
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
            aria-label="Plan steps"
            style={{
              right: Math.max(8, window.innerWidth - rect.right),
              bottom: window.innerHeight - rect.top + 8
            }}
          >
            <div className="step-popup-head">
              <span>Plan</span>
              <span className="step-popup-meta">
                {streaming && (
                  <span className="step-live">
                    <span className="step-live-dot" aria-hidden="true" />
                    Live
                  </span>
                )}
                <span>{countLabel}</span>
              </span>
            </div>
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
          </div>,
          document.body
        )}
    </div>
  )
}
