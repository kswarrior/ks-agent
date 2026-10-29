import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ChatExtensionsState, ExtensionKind } from '../types'

type Item = {
  kind: ExtensionKind
  name: string
  detail?: string
  enabled: boolean
}

const KIND_LABEL: Record<ExtensionKind, string> = {
  skill: 'Skills',
  mcp: 'MCP servers',
  lsp: 'Language servers'
}

export function ChatExtensionsMenu({
  extensions,
  disabled = false,
  onToggle
}: {
  extensions: ChatExtensionsState | null
  disabled?: boolean
  onToggle: (kind: ExtensionKind, name: string, enabled: boolean) => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [placement, setPlacement] = useState<'down' | 'up'>('up')
  const [pending, setPending] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const popupRef = useRef<HTMLDivElement | null>(null)

  const sections = [
    {
      kind: 'skill' as const,
      items: (extensions?.skills ?? []).map<Item>((skill) => ({
        kind: 'skill',
        name: skill.name,
        enabled: skill.enabled
      }))
    },
    {
      kind: 'mcp' as const,
      items: (extensions?.mcpServers ?? []).map<Item>((server) => ({
        kind: 'mcp',
        name: server.name,
        detail: `${server.transport} · ${server.tools.length} tool${server.tools.length === 1 ? '' : 's'}`,
        enabled: server.enabled
      }))
    },
    {
      kind: 'lsp' as const,
      items: (extensions?.lspServers ?? []).map<Item>((server) => ({
        kind: 'lsp',
        name: server.name,
        detail: server.extensions.join(', '),
        enabled: server.enabled
      }))
    }
  ]
  const total = sections.reduce((sum, section) => sum + section.items.length, 0)
  const enabledCount = sections.reduce(
    (sum, section) => sum + section.items.filter((item) => item.enabled).length,
    0
  )

  const position = () => {
    const next = triggerRef.current?.getBoundingClientRect()
    if (!next) return
    setRect(next)
    const spaceBelow = window.innerHeight - next.bottom
    setPlacement(spaceBelow < 360 && next.top > spaceBelow ? 'up' : 'down')
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

  const toggle = async (item: Item, enabled: boolean) => {
    const key = `${item.kind}:${item.name}`
    setPending(key)
    try {
      await onToggle(item.kind, item.name, enabled)
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="chat-tools-menu">
      <button
        ref={triggerRef}
        type="button"
        className={`chat-tools-btn ${open ? 'open' : ''}`}
        onClick={() => {
          if (!open) position()
          setOpen((current) => !current)
        }}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Chat tools"
        title="Skills, MCP and LSP for this chat"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="9" cy="6" r="2" fill="var(--bg-elev)" />
          <circle cx="15" cy="12" r="2" fill="var(--bg-elev)" />
          <circle cx="8" cy="18" r="2" fill="var(--bg-elev)" />
        </svg>
        <span>Tools</span>
        <span className="chat-tools-count">
          {enabledCount}/{total}
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popupRef}
            className={`select-popup chat-extensions-popup ${placement}`}
            style={{
              left: Math.max(8, Math.min(rect.left, window.innerWidth - 348)),
              ...(placement === 'up'
                ? { bottom: window.innerHeight - rect.top + 6 }
                : { top: rect.bottom + 6 })
            }}
            role="dialog"
            aria-label="Chat tools"
          >
            <div className="chat-extensions-head">
              <strong>Chat tools</strong>
              <span className="muted small">Project-enabled only. Uncheck to disable in this chat.</span>
            </div>
            {total === 0 ? (
              <div className="select-empty">No skills, MCP servers or language servers are enabled for this project.</div>
            ) : (
              sections.map((section) =>
                section.items.length ? (
                  <div className="chat-tools-section" key={section.kind}>
                    <div className="chat-tools-title">{KIND_LABEL[section.kind]}</div>
                    {section.items.map((item) => {
                      const key = `${item.kind}:${item.name}`
                      return (
                        <label className="chat-tools-row" key={key}>
                          <input
                            type="checkbox"
                            checked={item.enabled}
                            disabled={pending === key}
                            onChange={(event) => void toggle(item, event.target.checked)}
                          />
                          <span className="chat-tools-name">{item.name}</span>
                          {item.detail && <span className="chat-tools-detail">{item.detail}</span>}
                        </label>
                      )
                    })}
                  </div>
                ) : null
              )
            )}
          </div>,
          document.body
        )}
    </div>
  )
}
