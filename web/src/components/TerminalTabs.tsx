import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import { XTermTerminal } from './XTermTerminal'

interface TerminalState {
  terminals: number[]
  active: number
  nextId: number
}

interface TabMenu {
  id: number
  x: number
  y: number
}

const LONG_PRESS_MS = 500
const MENU_WIDTH = 176

function defaultState(): TerminalState {
  return { terminals: [1], active: 1, nextId: 2 }
}

function storageKey(projectId: string): string {
  return `ks-terminals:${projectId}`
}

function loadState(projectId: string): TerminalState {
  try {
    const raw = localStorage.getItem(storageKey(projectId))
    if (!raw) return defaultState()
    const parsed = JSON.parse(raw) as Partial<TerminalState>
    const terminals = Array.isArray(parsed.terminals)
      ? [...new Set(parsed.terminals.filter((id): id is number => Number.isInteger(id) && id > 0))]
      : []
    if (terminals.length === 0) return defaultState()
    const active =
      typeof parsed.active === 'number' && terminals.includes(parsed.active) ? parsed.active : terminals[0]
    const max = Math.max(...terminals)
    const nextId =
      typeof parsed.nextId === 'number' && parsed.nextId > max ? Math.floor(parsed.nextId) : max + 1
    return { terminals, active, nextId }
  } catch {
    return defaultState()
  }
}

export function TerminalTabs({ projectId, active }: { projectId: string; active: boolean }) {
  const [state, setState] = useState<TerminalState>(() => loadState(projectId))
  const [menu, setMenu] = useState<TabMenu | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const pressTimerRef = useRef<number | null>(null)
  const pressStartRef = useRef<{ x: number; y: number } | null>(null)
  const suppressClickRef = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(projectId), JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [projectId, state])

  useEffect(() => {
    if (!active) setMenu(null)
  }, [active])

  useEffect(() => {
    if (!menu) return
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node | null)) return
      setMenu(null)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menu])

  useEffect(() => {
    return () => {
      if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current)
    }
  }, [])

  const clearPress = () => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
    pressStartRef.current = null
  }

  const openMenu = (id: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const x = Math.min(Math.max(8, rect.left + rect.width / 2 - MENU_WIDTH / 2), window.innerWidth - MENU_WIDTH - 8)
    const y = Math.min(rect.bottom + 6, window.innerHeight - 132)
    setMenu({ id, x, y })
  }

  const startPress = (id: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return
    clearPress()
    suppressClickRef.current = false
    pressStartRef.current = { x: event.clientX, y: event.clientY }
    const element = event.currentTarget
    pressTimerRef.current = window.setTimeout(() => {
      pressTimerRef.current = null
      suppressClickRef.current = true
      openMenu(id, element)
    }, LONG_PRESS_MS)
  }

  const movePress = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = pressStartRef.current
    if (!start) return
    if (Math.abs(event.clientX - start.x) > 8 || Math.abs(event.clientY - start.y) > 8) clearPress()
  }

  const closeTerminal = (id: number) => {
    setMenu(null)
    setState((current) => {
      if (!current.terminals.includes(id)) return current
      const remaining = current.terminals.filter((entry) => entry !== id)
      if (remaining.length === 0) return current
      let nextActive = current.active
      if (nextActive === id) {
        const index = current.terminals.indexOf(id)
        nextActive = remaining[Math.min(index, remaining.length - 1)]
      }
      return { ...current, terminals: remaining, active: nextActive }
    })
    void api.killProjectTerminal(projectId, String(id)).catch(() => {})
  }

  const closeOthers = (id: number) => {
    setMenu(null)
    const removed = state.terminals.filter((entry) => entry !== id)
    setState((current) => {
      if (!current.terminals.includes(id)) return current
      return { ...current, terminals: [id], active: id }
    })
    for (const entry of removed) {
      void api.killProjectTerminal(projectId, String(entry)).catch(() => {})
    }
  }

  const addTerminal = () => {
    setState((current) => {
      const id = current.nextId
      return { terminals: [...current.terminals, id], active: id, nextId: id + 1 }
    })
  }

  const onlyOne = state.terminals.length <= 1

  return (
    <div className={`terminal-tabs-panel${active ? ' active' : ''}`}>
      <div className="terminal-tabs" role="tablist" aria-label="Terminals">
        {state.terminals.map((id) => (
          <button
            key={id}
            className={`terminal-tab${state.active === id ? ' active' : ''}`}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false
                return
              }
              setState((current) => ({ ...current, active: id }))
            }}
            onPointerDown={(event) => startPress(id, event)}
            onPointerMove={movePress}
            onPointerUp={clearPress}
            onPointerLeave={clearPress}
            onPointerCancel={clearPress}
            onContextMenu={(event) => {
              event.preventDefault()
              clearPress()
              openMenu(id, event.currentTarget)
            }}
            role="tab"
            aria-selected={state.active === id}
            title={`Terminal ${id} — hold to close`}
          >
            [ {id} ]
          </button>
        ))}
        <button className="terminal-tab terminal-tab-add" onClick={addTerminal} title="New terminal" aria-label="New terminal">
          +
        </button>
      </div>
      <div className="terminal-slots">
        {state.terminals.map((id) => (
          <div key={id} className={`terminal-slot${state.active === id ? ' active' : ''}`}>
            <XTermTerminal
              projectId={projectId}
              terminalId={String(id)}
              active={active && state.active === id}
            />
          </div>
        ))}
      </div>
      {menu && (
        <div
          ref={menuRef}
          className="terminal-tab-menu"
          style={{ left: menu.x, top: menu.y, width: MENU_WIDTH }}
          role="menu"
          aria-label={`Terminal ${menu.id} options`}
        >
          <div className="terminal-tab-menu-head">Terminal {menu.id}</div>
          <button
            className="terminal-tab-menu-item danger"
            role="menuitem"
            disabled={onlyOne}
            onClick={() => closeTerminal(menu.id)}
            title={onlyOne ? 'At least one terminal must stay open' : `Close terminal ${menu.id}`}
          >
            Close terminal
          </button>
          <button
            className="terminal-tab-menu-item"
            role="menuitem"
            disabled={onlyOne}
            onClick={() => closeOthers(menu.id)}
            title={onlyOne ? 'No other terminals are open' : `Close all terminals except ${menu.id}`}
          >
            Close other terminals
          </button>
        </div>
      )}
    </div>
  )
}
