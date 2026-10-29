import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

export type SelectOption = {
  value: string
  label: string
}

export function SelectMenu({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  ariaLabel,
  className = ''
}: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [placement, setPlacement] = useState<'down' | 'up'>('down')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const selected = options.find((option) => option.value === value)

  const position = () => {
    const next = triggerRef.current?.getBoundingClientRect()
    if (!next) return
    setRect(next)
    const spaceBelow = window.innerHeight - next.bottom
    setPlacement(spaceBelow < 220 && next.top > spaceBelow ? 'up' : 'down')
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
    if (disabled) setOpen(false)
  }, [disabled])

  const toggle = () => {
    if (!open) position()
    setOpen(!open)
  }

  return (
    <div className={`select-menu ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className={`select-trigger ${open ? 'open' : ''}`}
        onClick={toggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={`select-value ${selected ? '' : 'placeholder'}`}>{selected?.label ?? placeholder}</span>
        <span className="select-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popupRef}
            className={`select-popup ${placement}`}
            style={{
              left: rect.left,
              minWidth: rect.width,
              ...(placement === 'up'
                ? { bottom: window.innerHeight - rect.top + 6 }
                : { top: rect.bottom + 6 })
            }}
            role="listbox"
            aria-label={ariaLabel}
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`select-option ${option.value === value ? 'active' : ''}`}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                  triggerRef.current?.focus()
                }}
              >
                <span>{option.label}</span>
                {option.value === value && <span className="select-check">✓</span>}
              </button>
            ))}
            {options.length === 0 && <div className="select-empty">{placeholder}</div>}
          </div>,
          document.body
        )}
    </div>
  )
}
