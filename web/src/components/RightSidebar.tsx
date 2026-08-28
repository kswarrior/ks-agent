import { useState, useEffect, useCallback, useRef } from 'react'
import type { Plan, Project, Terminal, Activity } from '../types'
import * as api from '../api'
import { useToast } from '../toast'
import { IconCheck, IconX, IconPlus, IconSearch, IconActivity, IconRotate, IconChevronLeft, IconTerminal, IconTrash, IconPencil } from '../icons'
import { FilesPane } from './FilesPane'
import { ActivityPane } from './ActivityPane'
import { XTermTerminal } from './XTermTerminal'
import { useDialogs } from '../dialogs'

type RsTab = 'plan' | 'files' | 'terminal' | 'activity'

interface RightSidebarProps {
  open: boolean
  activeProject: Project | null
  plan: Plan | null
  activities: Activity[]
  streaming: boolean
  onClose: () => void
}

const TABS: Array<{ id: RsTab; label: string }> = [
  { id: 'plan', label: 'Plan' },
  { id: 'files', label: 'Files' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'activity', label: 'Activity' }
]

function PlanView({ plan, activities, streaming }: { plan: Plan | null; activities: Activity[]; streaming: boolean }) {
  // Derive flow stage from plan + activities
  // Only treat explore as active when the agent has actually called an explore tool.
  // Use any explore activity (not just those with summary) so the stage switches as soon as the tool is invoked.
  const hasExplore = activities.some(a => ['list_files','read_file','run_shell'].includes(a.toolType))
  const hasPlan = !!plan
  const workingStep = plan?.steps.find(s => s.status === 'working')
  const workingIdx = workingStep ? plan!.steps.indexOf(workingStep) : -1
  const done = plan ? plan.steps.filter(s => s.status === 'done').length : 0
  const isPlanDone = !!plan && plan.steps.length > 0 && done === plan.steps.length

  type Stage = 'understand' | 'explore' | 'planning' | 'executing' | 'done' | 'idle'
  let stage: Stage = 'idle'
  let stageDetail = ''
  // When a previous plan is already done and a new prompt is streaming,
  // treat it as a fresh run so Understand → Explore → Planning shows again
  // instead of staying stuck on "done" or false "executing 7/6".
  if (streaming && isPlanDone && !workingStep) {
    stage = !hasExplore ? 'understand' : 'explore'
    // keep stageDetail empty for fresh run; new plan will arrive via SSE
  } else if (!hasPlan && !hasExplore) stage = streaming ? 'understand' : 'idle'
  else if (!hasPlan && hasExplore) stage = 'explore'
  else if (hasPlan && !workingStep && done === 0) stage = 'planning'
  else if (hasPlan && workingStep) { stage = 'executing'; stageDetail = `Executing step [${workingIdx + 1}] ${workingStep.title}` }
  else if (isPlanDone) stage = 'done'
  else if (hasPlan) stage = 'executing'

  const stages: Array<{ id: Exclude<Stage, 'idle' | 'done'>; label: string }> = [
    { id: 'understand', label: 'Understand' },
    { id: 'explore', label: 'Explore' },
    { id: 'planning', label: 'Planning' },
    { id: 'executing', label: 'Executing' },
  ]
  const stageOrder: Record<Exclude<Stage, 'idle'>, number> = { understand: 0, explore: 1, planning: 2, executing: 3, done: 4 }
  const currentOrder = stage === 'idle' ? -1 : stageOrder[stage as Exclude<Stage, 'idle'>]

  if (!plan) {
    const shouldShowDetail = streaming && stage !== 'idle'
    return (
      <div className="plan">
        <div className="flow">
          <div className="flow-track">
            {stages.map((s, i) => {
              const state = stage === 'idle' ? 'pending' : i < currentOrder ? 'done' : i === currentOrder ? 'active' : 'pending'
              const isActive = stage !== 'idle' && i === currentOrder
              // Animate the active dot only while streaming (or if executing with a working step — handled in hasPlan branch)
              const showPulse = isActive && streaming
              return (
                <div key={s.id} className={`flow-node ${state}`}>
                  <span className="flow-dot">{stage !== 'idle' && i < currentOrder ? <IconCheck size={10} /> : showPulse ? <span className="flow-pulse" /> : null}</span>
                  <span className="flow-label">{s.label}</span>
                  {i < stages.length - 1 && <span className={`flow-line ${stage !== 'idle' && i < currentOrder ? 'done' : ''}`} />}
                </div>
              )
            })}
          </div>
          {shouldShowDetail && (
            <div className="flow-detail">
              {stage === 'understand' && <span>Understanding<span className="dots"><span className="dot" /><span className="dot" /><span className="dot" /></span></span>}
              {stage === 'explore' && <span>Exploring<span className="dots"><span className="dot" /><span className="dot" /><span className="dot" /></span></span>}
              {stage === 'planning' && <span>Planning<span className="dots"><span className="dot" /><span className="dot" /><span className="dot" /></span></span>}
            </div>
          )}
          <div className="rsb-empty" style={{ marginTop: 16 }}>Nothing here yet — plan will appear after explore</div>
        </div>
      </div>
    )
  }

  return (
    <div className="plan">
      <div className="flow">
        <div className="flow-track">
          {stages.map((s, i) => {
            const state = i < currentOrder ? 'done' : i === currentOrder ? 'active' : 'pending'
            const isActive = i === currentOrder
            // Only animate pulse while streaming or when a step is actively working
            const showPulse = isActive && (streaming || !!workingStep)
            return (
              <div key={s.id} className={`flow-node ${state}`}>
                <span className="flow-dot">{i < currentOrder ? <IconCheck size={10} /> : showPulse ? <span className="flow-pulse" /> : null}</span>
                <span className="flow-label">{s.label}</span>
                {i < stages.length - 1 && <span className={`flow-line ${i < currentOrder ? 'done' : ''}`} />}
              </div>
            )
          })}
        </div>
        {stageDetail && streaming && <div className="flow-detail executing">{stageDetail}<span className="dots"><span className="dot" /><span className="dot" /><span className="dot" /></span></div>}
        {stage === 'done' && <div className="flow-detail done">All steps completed</div>}
      </div>

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
      <p className="flow-hint">AI can ask questions at any stage via the chat</p>
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
  }, [projectId])

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
      // auto-open the new terminal as a real PTY
      setSession(created)
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
      message: 'This terminal will be permanently removed. Running shell will be killed.',
      danger: true,
      confirmText: 'Delete',
    })
    if (!ok) return
    setDetailBusy(true)
    try {
      await api.deleteTerminal(selected.id)
      toast('Terminal deleted', 'success')
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

  if (!projectId) {
    return <div className="rsb-empty">Select a project to manage terminals</div>
  }

  if (session) {
    return (
      <div className="tp tp-session-wrap" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#000', margin: '-12px', overflow: 'hidden' }}>
        <div className="fp-subhead" style={{ background: '#000', borderBottom: '1px solid #1a1a1a', margin: 0, padding: '8px 12px', flexShrink: 0 }}>
          <button className="icon-btn" aria-label="Back to terminals" onClick={() => setSession(null)} style={{ color: '#e8e8e8' }}>
            <IconChevronLeft size={17} />
          </button>
          <span style={{ color: '#e8e8e8', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{session.name}</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#6b6b6b', fontFamily: 'ui-monospace, monospace', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={projectPath}>
            {projectPath}
          </span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#000' }}>
          <XTermTerminal terminalId={session.id} projectPath={projectPath} />
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
            <div className="dd-empty">{terminals.length === 0 ? 'No terminals yet — create one for a real Linux shell' : 'No matches'}</div>
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
                    const ok = await confirm({ title: `Delete "${terminal.name}"?`, message: 'Running shell will be killed.', danger: true, confirmText: 'Delete' })
                    if (!ok) return
                    try {
                      await api.deleteTerminal(terminal.id)
                      toast('Terminal deleted', 'success')
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

export function RightSidebar({ open, activeProject, plan, activities, streaming, onClose }: RightSidebarProps) {
  const [tab, setTab] = useState<RsTab>('plan')
  const activityCount = activities.length
  const writeCount = activities.filter(a => a.toolType === 'write_file').length
  const editCount = activities.filter(a => a.toolType === 'edit_file').length
  const readCount = activities.filter(a => a.toolType === 'read_file').length
  const hasRunning = activities.some(a => a.ok === undefined)
  const tabsRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ active: boolean; startX: number; startScrollLeft: number; moved: boolean } | null>(null)

  function handleTabsWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const el = e.currentTarget
      if (el.scrollWidth > el.clientWidth) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
  }

  function handleTabsPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth) return
    dragRef.current = { active: true, startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false }
    el.setPointerCapture(e.pointerId)
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'
  }

  function handleTabsPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const el = e.currentTarget
    if (!drag?.active) return
    const dx = e.clientX - drag.startX
    if (Math.abs(dx) > 2) drag.moved = true
    el.scrollLeft = drag.startScrollLeft - dx
  }

  function handleTabsPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const drag = dragRef.current
    dragRef.current = null
    el.style.cursor = ''
    el.style.userSelect = ''
    try { el.releasePointerCapture(e.pointerId) } catch {}
    if (drag?.moved) {
      // prevent accidental tab click after drag
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <>
      <aside className={`rsb${open ? ' open' : ''}`}>
        <div
          ref={tabsRef}
          className="tabs rsb-tabs"
          onWheel={handleTabsWheel}
          onPointerDown={handleTabsPointerDown}
          onPointerMove={handleTabsPointerMove}
          onPointerUp={handleTabsPointerUp}
          onPointerLeave={handleTabsPointerUp}
        >
          {TABS.map((t) => {
            const isActivity = t.id === 'activity'
            return (
              <button
                key={t.id}
                className={`tab${tab === t.id ? ' active' : ''}`}
                onClick={(e) => {
                  // ignore click if it was a drag
                  if (dragRef.current?.moved) return
                  setTab(t.id)
                  e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {t.label}
                  {isActivity && activityCount > 0 && (
                    <span className="rsb-tab-badge" title={`${writeCount} Write · ${editCount} Edit · ${readCount} Read · ${activityCount} total`}>
                      {activityCount}
                      {hasRunning && streaming && <span className="rsb-tab-pulse" />}
                    </span>
                  )}
                  {isActivity && activityCount > 0 && (writeCount + editCount + readCount) > 0 && (
                    <span className="rsb-tab-dots" aria-hidden>
                      {writeCount > 0 && <span className="rsb-dot write" title={`${writeCount} Write`} />}
                      {editCount > 0 && <span className="rsb-dot edit" title={`${editCount} Edit`} />}
                      {readCount > 0 && <span className="rsb-dot read" title={`${readCount} Read`} />}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
          <button className="icon-btn rsb-close" aria-label="Close panel" onClick={onClose}>
            <IconX size={16} />
          </button>
        </div>

        <div className="rsb-body">
          {tab === 'plan' && <PlanView plan={plan} activities={activities} streaming={streaming} />}
          {tab === 'terminal' && <TerminalPane project={activeProject} />}
          {tab === 'activity' && <ActivityPane activities={activities} />}
          {tab === 'files' && <FilesPane projectId={activeProject?.id ?? null} />}
        </div>
      </aside>
      <div className={`scrim rsb-scrim${open ? ' show' : ''}`} onClick={onClose} />
    </>
  )
}
