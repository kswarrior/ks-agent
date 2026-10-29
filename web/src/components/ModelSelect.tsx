import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ModelEntry } from '../types'

export function ModelSelect({
  value,
  models,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  ariaLabel,
  className = ''
}: {
  value: string
  models: ModelEntry[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [placement, setPlacement] = useState<'down' | 'up'>('down')
  const [search, setSearch] = useState('')
  const [providerId, setProviderId] = useState('')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)
  const selected = models.find((model) => model.id === value)

  const providers = useMemo(() => {
    const map = new Map<string, string>()
    for (const model of models) {
      if (!map.has(model.providerId)) map.set(model.providerId, model.providerName ?? 'Provider')
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [models])

  const groups = useMemo(() => {
    const query = search.trim().toLowerCase()
    const filtered = models.filter((model) => {
      if (providerId && model.providerId !== providerId) return false
      if (!query) return true
      return (
        model.name.toLowerCase().includes(query) ||
        model.modelId.toLowerCase().includes(query) ||
        (model.providerName ?? '').toLowerCase().includes(query)
      )
    })
    const map = new Map<string, { id: string; name: string; models: ModelEntry[] }>()
    for (const model of filtered) {
      const group = map.get(model.providerId) ?? {
        id: model.providerId,
        name: model.providerName ?? 'Provider',
        models: []
      }
      group.models.push(model)
      map.set(model.providerId, group)
    }
    return [...map.values()]
  }, [models, providerId, search])

  const position = () => {
    const next = triggerRef.current?.getBoundingClientRect()
    if (!next) return
    setRect(next)
    const spaceBelow = window.innerHeight - next.bottom
    setPlacement(spaceBelow < 280 && next.top > spaceBelow ? 'up' : 'down')
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

  useEffect(() => {
    if (providerId && !providers.some((provider) => provider.id === providerId)) setProviderId('')
  }, [providerId, providers])

  const select = (id: string) => {
    onChange(id)
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className={`select-menu ${className}`.trim()}>
      <button
        ref={triggerRef}
        type="button"
        className={`select-trigger ${open ? 'open' : ''}`}
        onClick={() => {
          if (!open) position()
          setOpen((current) => !current)
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className={`select-value ${selected ? '' : 'placeholder'}`}>{selected?.name ?? placeholder}</span>
        <span className="select-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popupRef}
            className={`select-popup model-popup ${placement}`}
            style={{
              left: Math.max(8, Math.min(rect.left, window.innerWidth - 328)),
              minWidth: rect.width,
              ...(placement === 'up'
                ? { bottom: window.innerHeight - rect.top + 6 }
                : { top: rect.bottom + 6 })
            }}
            role="dialog"
            aria-label={ariaLabel}
          >
            <div className="model-filter-row">
              <input
                className="model-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search models…"
                aria-label="Search models"
                autoFocus
              />
              <select
                className="model-provider-select"
                value={providerId}
                onChange={(event) => setProviderId(event.target.value)}
                aria-label="Filter by provider"
              >
                <option value="">All providers</option>
                {providers.map((provider) => (
                  <option value={provider.id} key={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="model-list">
              {groups.map((group) => (
                <div className="model-group" key={group.id}>
                  <div className="model-group-title">{group.name}</div>
                  {group.models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      className={`select-option ${model.id === value ? 'active' : ''}`}
                      onClick={() => select(model.id)}
                    >
                      <span>{model.name}</span>
                      {model.id === value && <span className="select-check">✓</span>}
                    </button>
                  ))}
                </div>
              ))}
              {groups.length === 0 && <div className="select-empty">No models found.</div>}
            </div>
          </div>,
          document.body
        )}
    </div>
  )
}
