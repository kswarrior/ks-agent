import { useEffect, useState } from 'react'
import { XTermTerminal } from './XTermTerminal'

interface TerminalState {
  terminals: number[]
  active: number
  nextId: number
}

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

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(projectId), JSON.stringify(state))
    } catch {
      // ignore
    }
  }, [projectId, state])

  const addTerminal = () => {
    setState((current) => {
      const id = current.nextId
      return { terminals: [...current.terminals, id], active: id, nextId: id + 1 }
    })
  }

  return (
    <div className={`terminal-tabs-panel${active ? ' active' : ''}`}>
      <div className="terminal-tabs" role="tablist" aria-label="Terminals">
        {state.terminals.map((id) => (
          <button
            key={id}
            className={`terminal-tab${state.active === id ? ' active' : ''}`}
            onClick={() => setState((current) => ({ ...current, active: id }))}
            role="tab"
            aria-selected={state.active === id}
            title={`Terminal ${id}`}
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
    </div>
  )
}
