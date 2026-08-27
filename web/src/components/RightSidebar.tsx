import { useState, useEffect, useCallback, useRef } from 'react'
import type { Plan, Project, Terminal, Activity } from '../types'
import * as api from '../api'
import { useToast } from '../toast'
import { IconCheck, IconX, IconPlus, IconSearch, IconActivity, IconRotate, IconChevronLeft, IconTerminal, IconTrash, IconPencil } from '../icons'
import { FilesPane } from './FilesPane'
import { ActivityPane } from './ActivityPane'
import { useDialogs } from '../dialogs'

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

function TerminalPane({ project }: { project: Project | null }) {
  const projectId = project?.id ?? null
  const projectPath = project?.path ?? ''
  const toast = useToast()
  const { confirm } = useDialogs()
  const [terminals, setTerminals] = useState<Terminal[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<Terminal | null>(null)
  const [detailName, setDetailName] = useState('')
  const [detailBusy, setDetailBusy] = useState(false)
  const [session, setSession] = useState<Terminal | null>(null)
  const [histories, setHistories] = useState<Record<string, Array<{ command: string; output: string; exitCode: number }>>>({})
  const [input, setInput] = useState('')
  const [execBusy, setExecBusy] = useState(false)
  const outputRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    setSelected(null)
    setDetailName('')
    setSession(null)
    setInput('')
  }, [projectId])

  useEffect(() => {
    if (session && outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [histories, session])

  useEffect(() => {
    if (session && inputRef.current) {
      inputRef.current.focus()
    }
  }, [session])

  const filtered = terminals.filter((t: Terminal) => t.name.toLowerCase().includes(query.trim().toLowerCase()))

  async function handleCreate() {
    if (!projectId || !newName.trim() || busy) return
    setBusy(true)
    try {
      const created = await api.createTerminal(projectId, newName.trim())
      toast('Terminal created', 'success')
      setNewName('')
      setShowCreate(false)
      await refresh()
      setSelected(created)
      setDetailName(created.name)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  function openEdit(terminal: Terminal) {
    setSelected(terminal)
    setDetailName(terminal.name)
  }

  function openSession(terminal: Terminal) {
    setSession(terminal)
    setInput('')
  }

  async function handleRename() {
    if (!selected || !detailName.trim() || detailBusy) return
    const name = detailName.trim()
    if (name === selected.name) return
    setDetailBusy(true)
    try {
      const updated = await api.renameTerminal(selected.id, name)
      toast('Terminal renamed', 'success')
      setSelected(updated)
      setDetailName(updated.name)
      // keep session in sync if same terminal is open
      setSession((prev) => (prev?.id === updated.id ? updated : prev))
      await refresh()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setDetailBusy(false)
    }
  }

  async function handleDeleteSelected() {
    if (!selected) return
    const ok = await confirm({
      title: `Delete "${selected.name}"?`,
      message: 'This terminal will be permanently removed.',
      danger: true,
      confirmText: 'Delete',
    })
    if (!ok) return
    setDetailBusy(true)
    try {
      await api.deleteTerminal(selected.id)
      toast('Terminal deleted', 'success')
      setHistories((prev) => {
        const next = { ...prev }
        delete next[selected.id]
        return next
      })
      if (session?.id === selected.id) setSession(null)
      setSelected(null)
      setDetailName('')
      await refresh()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setDetailBusy(false)
    }
  }

  async function handleExec() {
    if (!session || !input.trim() || execBusy) return
    const command = input.trim()
    if (command === 'clear') {
      setHistories((prev) => ({ ...prev, [session.id]: [] }))
      setInput('')
      return
    }
    setExecBusy(true)
    const prevHistory = histories[session.id] ?? []
    // optimistic: show command immediately with placeholder
    setHistories((prev) => ({
      ...prev,
      [session.id]: [...prevHistory, { command, output: '…', exitCode: 0 }],
    }))
    setInput('')
    try {
      const res = await api.execTerminal(session.id, command)
      setHistories((prev) => {
        const list = [...(prev[session.id] ?? [])]
        // replace last placeholder
        list[list.length - 1] = { command, output: res.output, exitCode: res.exitCode }
        return { ...prev, [session.id]: list }
      })
    } catch (e: any) {
      setHistories((prev) => {
        const list = [...(prev[session.id] ?? [])]
        list[list.length - 1] = { command, output: e.message || 'Failed to execute', exitCode: 1 }
        return { ...prev, [session.id]: list }
      })
    } finally {
      setExecBusy(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }

  if (!projectId) {
    return <div className="rsb-empty">Select a project to manage terminals</div>
  }

  if (session) {
    const history = histories[session.id] ?? []
    return (
      <div className="tp tp-session-wrap">
        <div className="fp-subhead" style={{ background: '#000', borderBottom: '1px solid #1a1a1a', margin: '-12px -12px 0 -12px', padding: '8px 12px' }}>
          <button className="icon-btn" aria-label="Back to terminals" onClick={() => setSession(null)} style={{ color: '#e8e8e8' }}>
            <IconChevronLeft size={17} />
          </button>
          <span style={{ color: '#e8e8e8', fontSize: 13 }}>{session.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b6b6b', fontFamily: 'ui-monospace, monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={projectPath}>
            {projectPath}
          </span>
        </div>
        <div className="tp-session" ref={outputRef} onClick={() => inputRef.current?.focus()}>
          <div className="tp-session-output">
            {history.length === 0 && (
              <div className="tp-session-hint">Type a command and press Enter. Try `ls`, `pwd`, `clear`.</div>
            )}
            {history.map((h, i) => (
              <div key={i} className="tp-session-entry">
                <div className="tp-session-line">
                  <span className="tp-session-prompt">{projectPath} |</span>
                  <span className="tp-session-cmd">{h.command}</span>
                </div>
                <pre className={`tp-session-out${h.exitCode !== 0 ? ' error' : ''}`}>{h.output}</pre>
              </div>
            ))}
            {execBusy && history.length > 0 && history[history.length - 1]?.output === '…' && null}
          </div>
          <div className="tp-session-inputRow">
            <span className="tp-session-prompt">{projectPath} |</span>
            <input
              ref={inputRef}
              className="tp-session-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleExec()
                if (e.key === 'Escape') setSession(null)
              }}
              placeholder="enter command"
              autoFocus
              disabled={execBusy}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </div>
      </div>
    )
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

  if (selected) {
    return (
      <div className="tp">
        <div className="fp-subhead fp-edit-head">
          <button className="icon-btn" aria-label="Back to terminals" onClick={() => setSelected(null)}>
            <IconChevronLeft size={17} />
          </button>
          <span className="fp-edit-title" title={selected.name}>{selected.name}</span>
        </div>
        <label className="field-label">Terminal name</label>
        <input
          className="input"
          value={detailName}
          onChange={(e) => setDetailName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleRename()
            if (e.key === 'Escape') setSelected(null)
          }}
          autoFocus
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} disabled={detailBusy || !detailName.trim() || detailName.trim() === selected.name} onClick={handleRename}>
            {detailBusy ? 'Saving…' : 'Rename'}
          </button>
          <button className="btn btn-danger" disabled={detailBusy} onClick={handleDeleteSelected}>
            <IconTrash size={14} style={{ marginRight: 6 }} />
            Delete
          </button>
        </div>
        <p className="fp-hint">Created {new Date(selected.createdAt).toLocaleString()}</p>
        <button className="btn" style={{ width: '100%', marginTop: 8 }} onClick={() => { const t = selected; setSelected(null); setSession(t) }}>
          <IconTerminal size={14} style={{ marginRight: 6 }} />
          Open terminal
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
            filtered.map((terminal: Terminal) => (
              <div
                key={terminal.id}
                className="tp-row"
                role="button"
                tabIndex={0}
                onClick={() => openSession(terminal)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSession(terminal) } }}
              >
                <IconTerminal size={15} style={{ flexShrink: 0, color: 'var(--text-faint)' }} />
                <span className="tp-name">{terminal.name}</span>
                <button
                  className="icon-btn tp-action tp-edit"
                  aria-label="Edit terminal"
                  title="Edit terminal"
                  onClick={(e) => { e.stopPropagation(); openEdit(terminal) }}
                >
                  <IconPencil size={14} />
                </button>
                <button
                  className="icon-btn tp-action tp-delete"
                  aria-label="Delete terminal"
                  title="Delete terminal"
                  onClick={async (e) => {
                    e.stopPropagation()
                    try {
                      await api.deleteTerminal(terminal.id)
                      toast('Terminal deleted', 'success')
                      setHistories((prev) => {
                        const next = { ...prev }
                        delete next[terminal.id]
                        return next
                      })
                      if ((session as Terminal | null)?.id === terminal.id) setSession(null)
                      if ((selected as Terminal | null)?.id === terminal.id) { setSelected(null); setDetailName('') }
                      await refresh()
                    } catch (err: any) {
                      toast(err.message, 'error')
                    }
                  }}
                >
                  <IconTrash size={14} />
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
          {tab === 'terminal' && <TerminalPane project={activeProject} />}
          {tab === 'activity' && <ActivityPane activities={activities} />}
          {tab === 'files' && <FilesPane projectId={activeProject?.id ?? null} />}
        </div>
      </aside>
      <div className={`scrim rsb-scrim${open ? ' show' : ''}`} onClick={onClose} />
    </>
  )
}
