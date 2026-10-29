import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RunStep } from '../types'

export function StepMenu({ steps, maxSteps }: { steps: RunStep[]; maxSteps: number }) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)

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
    if (steps.length === 0) setOpen(false)
  }, [steps.length])

  if (steps.length === 0) return null

  const ordered = [...steps].sort((a, b) => a.step - b.step)
  const latest = ordered[ordered.length - 1]

  return (
    <div className="step-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`step-btn ${open ? 'open' : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Show steps"
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
          <path d="M8 6h13M8 12h13M8 18h13" />
          <path d="M3 6h.01M3 12h.01M3 18h.01" />
        </svg>
        <span>Steps</span>
        <span className="step-btn-count">
          {latest.step}
          {maxSteps ? `/${maxSteps}` : ''}
        </span>
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
            aria-label="All steps"
            style={{
              right: Math.max(8, window.innerWidth - rect.right),
              bottom: window.innerHeight - rect.top + 8
            }}
          >
            <div className="step-popup-head">
              <span>All steps</span>
              <span>
                {ordered.length}
                {maxSteps ? ` / ${maxSteps}` : ''}
              </span>
            </div>
            <ol className="step-list">
              {ordered.map((step) => (
                <li key={step.step} className={`step-item ${step.step === latest.step ? 'active' : ''}`}>
                  <span className="step-item-num">{step.step}</span>
                  <div className="step-item-main">
                    <span className="step-item-title">
                      Step {step.step}
                      {step.step === latest.step ? ' · current' : ''}
                    </span>
                    <span className="step-item-snippet">
                      {step.content.trim() ? step.content.trim().slice(0, 140) : 'No text output'}
                    </span>
                    {step.tools.length > 0 && (
                      <div className="step-item-tools">
                        {step.tools.map((tool) => (
                          <span className={`step-tool ${tool.status}`} key={tool.id}>
                            {tool.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>,
          document.body
        )}
    </div>
  )
}
