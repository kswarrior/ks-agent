import { useState, useEffect, useCallback } from 'react'
import type { Plan, Project, Terminal, Activity } from '../types'
import * as api from '../api'
import { useToast } from '../toast'
import { IconCheck, IconX, IconPlus, IconSearch, IconActivity, IconRotate, IconChevronLeft } from '../icons'
import { FilesPane } from './FilesPane'
import { ActivityPane } from './ActivityPane'

type RsTab = 'plan' | 'files' | 'terminal' | 'activity'

interface RightSidebarProps {
  open: boolean
  activeProject: Project | null
  plan: Plan | null
  activities: Activity[]
  onClose: () => void
}

const TABS: Array<{ id: RsTab; label: string }> = [
  { id: 'plan', label: 'Plan' },
  { id: 'files', label: 'Files' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'activity', label: 'Activity' }
]

function PlanView({ plan }: { plan: Plan }) {
  const done = plan.steps.filter((s) => s.status === 'done').length
  return (
    <div className="plan">
      <div className="plan-head">
        <span className="plan-title" title={plan.title}>
          {plan.title}
        </span>
        <span className="plan-count">
          {done}/{plan.steps.length}
        </span>
      </div>
      {plan.steps.map((step, i) => (
        <div key={step.id} className={`plan-card${step.status === 'done' ? ' done' : ''}${step.status === 'working' ? ' working' : ''}`}>
          <span className="plan-check">
            {step.status === 'done' ? <IconCheck size={11} /> : step.status === 'working' ? <IconRotate size={11} className="spin" /> : null}
          </span>
          <span className="plan-step">{step.title}</span>
          <span className="plan-num">{i + 1}</span>
        </div>
      ))}
    </div>
  )
}

function TerminalPane({ projectId }: { projectId: string | null }) {
  const toast = useToast()
  const [terminals, setTerminals] = useState<Terminal[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const list = await api.listTerminals(projectId)
      setTerminals(list)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [projectId, toast])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    setShowCreate(false)
    setNewName('')
    setQuery('')
    setBusy(false)
  }, [projectId])

  const filtered = terminals.filter((t) => t.name.toLowerCase().includes(query.trim().toLowerCase()))

  async function handleCreate() {
    if (!projectId || !newName.trim() || busy) return
    setBusy(true)
    try {
      await api.createTerminal(projectId, newName.trim())
      toast('Terminal created', 'success')
      setNewName('')
      setShowCreate(false)
      await refresh()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!projectId) {
    return <div className="rsb-empty">Select a project to manage terminals</div>
  }

  if (showCreate) {
    return (
      <div className="tp">
        <div className="fp-subhead">
          <button className="icon-btn" aria-label="Back to terminals" onClick={() => { setShowCreate(false); setNewName(''); }}>
            <IconChevronLeft size={17} />
          </button>
          <span>Create</span>
        </div>
        <label className="field-label">Terminal name</label>
        <input
          className="input"
          placeholder="my-terminal"
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate()
            if (e.key === 'Escape') { setShowCreate(false); setNewName(''); }
          }}
        />
        <button className="btn btn-primary fp-submit" disabled={busy || !newName.trim()} onClick={handleCreate}>
          Create terminal
        </button>
      </div>
    )
  }

  return (
    <div className="tp">
      <div className="tp-toolbar">
        <div className="search-box">
          <IconSearch size={14} />
          <input
            className="search-input"
            placeholder="Search terminals…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="plus-btn" onClick={() => { setNewName(''); setShowCreate(true); }} title="Create terminal" aria-label="Create terminal">
          <IconPlus size={16} />
        </button>
      </div>

      <div className="tp-list">
        {loading ? (
          <div className="fp-skel" aria-label="Loading terminals">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="fp-skel-row">
                <span className="fp-skel-icon" style={{ animationDelay: `${i * 70}ms` }} />
                <span className="fp-skel-bar" style={{ width: `${52 + ((i * 17) % 34)}%`, animationDelay: `${i * 70}ms` }} />
              </div>
            ))}
          </div>
        ) : (
          filtered.length === 0 ? (
            <div className="dd-empty">{terminals.length === 0 ? 'No terminals yet' : 'No matches'}</div>
          ) : (
            filtered.map((terminal) => (
              <div key={terminal.id} className="tp-row" role="button" tabIndex={0}>
                <span className="tp-name">{terminal.name}</span>
                <button
                  className="icon-btn tp-delete"
                  aria-label="Delete terminal"
                  onClick={async (e) => {
                    e.stopPropagation()
                    try {
                      await api.deleteTerminal(terminal.id)
                      toast('Terminal deleted', 'success')
                      await refresh()
                    } catch (err: any) {
                      toast(err.message, 'error')
                    }
                  }}
                >
                  <IconX size={14} />
                </button>
              </div>
            ))
          )
        )}
      </div>
    </div>
  )
}

export function RightSidebar({ open, activeProject, plan, activities, onClose }: RightSidebarProps) {
  const [tab, setTab] = useState<RsTab>('plan')

  return (
    <>
      <aside className={`rsb${open ? ' open' : ''}`}>
        <div className="tabs rsb-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
          <button className="icon-btn rsb-close" aria-label="Close panel" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="rsb-body">
          {tab === 'plan' && (plan ? <PlanView plan={plan} /> : <div className="rsb-empty">Nothing here yet</div>)}
          {tab === 'terminal' && <TerminalPane projectId={activeProject?.id ?? null} />}
          {tab === 'activity' && <ActivityPane activities={activities} />}
          {tab === 'files' && <FilesPane projectId={activeProject?.id ?? null} />}
        </div>
      </aside>
      <div className={`scrim rsb-scrim${open ? ' show' : ''}`} onClick={onClose} />
    </>
  )
}
