import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { Plan, Project, Terminal, Activity, SubAgent, Team, SubAgentMessage, Skill } from '../types'
import * as api from '../api'
import { useToast } from '../toast'
import { IconCheck, IconPlus, IconSearch, IconActivity, IconRotate, IconChevronLeft, IconTerminal, IconTrash, IconPencil } from '../icons'
import { FilesPane } from './FilesPane'
import { ActivityPane } from './ActivityPane'
import { XTermTerminal } from './XTermTerminal'
import { useDialogs } from '../dialogs'

type RsTab = 'plan' | 'files' | 'terminal' | 'activity' | 'agents' | 'skills'

interface RightSidebarProps {
  open: boolean
  activeProject: Project | null
  activeChatId?: string | null
  plan: Plan | null
  activities: Activity[]
  streaming: boolean
  subAgents?: SubAgent[]
  teams?: Team[]
  activeAgent?: import('../types').ActiveAgentView | null
  onSelectAgent?: (view: import('../types').ActiveAgentView) => void
  onClose: () => void
}

const TABS: Array<{ id: RsTab; label: string }> = [
  { id: 'plan', label: 'Plan' },
  { id: 'agents', label: 'Agents' },
  { id: 'files', label: 'Files' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'activity', label: 'Activity' },
  { id: 'skills', label: 'Skills' }
]

function isSkillRead(a: Activity): boolean {
  if (a.toolType !== 'read_file') return false
  if (a.ok === false) return false
  const raw = String((a.args as any)?.path ?? '').toLowerCase().trim()
  if (!raw) return false
  const norm = raw.replace(/^\.\//, '').replace(/^\//, '').replace(/^skills\//, '').replace(/^\.skills\//, '')
  const base = norm.split('/').pop() || norm
  const knownBases = new Set(['skill.md', 'frontend.md', 'react.md', 'ts.md', 'ejs.md', 'testing.md', 'debugging.md', 'refactoring.md', 'code-review.md'])
  if (knownBases.has(base)) return true
  if (norm.includes('skill') && norm.endsWith('.md')) return true
  if (norm.startsWith('frontend/') && norm.endsWith('.md')) return true
  if (raw.includes('frontend/skill.md') || raw.includes('frontend/react.md') || raw.includes('frontend/ts.md') || raw.includes('frontend/ejs.md')) return true
  return false
}

function getSkillDisplayName(rawPath: string): string {
  const raw = String(rawPath ?? '').trim()
  const norm = raw.replace(/^\.\//, '').replace(/^\//, '').replace(/^skills\//, '').toLowerCase()
  if (norm === 'frontend/skill.md') return 'Frontend'
  if (norm === 'frontend/react.md') return 'Frontend React'
  if (norm === 'frontend/ts.md') return 'Frontend TS'
  if (norm === 'frontend/ejs.md') return 'Frontend EJS'
  if (norm === 'testing.md') return 'Testing'
  if (norm === 'debugging.md') return 'Debugging'
  if (norm === 'refactoring.md') return 'Refactoring'
  if (norm === 'code-review.md') return 'Code Review'
  if (norm.endsWith('skill.md')) {
    const base = norm.split('/').pop()?.replace('.md','') || norm
    return base.charAt(0).toUpperCase() + base.slice(1)
  }
  return raw.replace(/^skills\//,'').replace(/^\.\//,'')
}

function SkillsPane({ activities }: { activities: Activity[] }) {
  const skillActivities = useMemo(() => activities.filter(isSkillRead), [activities])
  const [skillDefs, setSkillDefs] = useState<Skill[]>([])
  useEffect(() => {
    let cancelled = false
    api.listSkills().then(list => { if (!cancelled) setSkillDefs(list) }).catch(() => {})
    return () => { cancelled = true }
  }, [])
  const distinctSkills = useMemo(() => {
    const map = new Map<string, { display: string; raw: string; count: number; lastTs: string; role?: string; triggers?: string }>()
    for (const a of skillActivities) {
      const raw = String((a.args as any)?.path ?? '').trim()
      const norm = raw.replace(/^\.\//, '').replace(/^\//, '').replace(/^skills\//, '').toLowerCase()
      const key = norm || raw.toLowerCase()
      const display = getSkillDisplayName(raw)
      // lookup role from skill defs
      let role: string | undefined
      let triggers: string | undefined
      const def = skillDefs.find(s => {
        const mf = s.mainFile.toLowerCase()
        const n = norm
        if (mf === n) return true
        if (mf === n.replace(/^skills\//,'')) return true
        if (n.endsWith('/' + mf)) return true
        if (s.files.some(f => f.toLowerCase() === n || n.endsWith('/' + f.toLowerCase()))) return true
        return false
      })
      if (def) { role = def.role; triggers = def.triggers }
      const existing = map.get(key)
      if (existing) {
        existing.count += 1
        if (new Date(a.timestamp).getTime() > new Date(existing.lastTs).getTime()) existing.lastTs = a.timestamp
      } else {
        map.set(key, { display, raw: raw.replace(/^skills\//,''), count: 1, lastTs: a.timestamp, role, triggers })
      }
    }
    return Array.from(map.values()).sort((a,b) => new Date(b.lastTs).getTime() - new Date(a.lastTs).getTime())
  }, [skillActivities, skillDefs])

  if (skillActivities.length === 0) {
    return (
      <div className="activity-pane">
        <div className="rsb-empty" style={{ flexDirection: 'column', gap: 10, padding: '28px 14px', textAlign: 'center' }}>
          <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
            <IconActivity size={16} />
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-dim)' }}>No skills used yet</span>
          <span style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>When the agent reads <code style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px', fontSize: 11 }}>skills/*.md</code> they appear here<br/>Hidden from Activity to keep it clean</span>
        </div>
      </div>
    )
  }

  return (
    <div className="activity-pane">
      <div className="activity-summary" style={{ marginBottom: 10 }}>
        <span className="activity-summary-count">{distinctSkills.length} skill{distinctSkills.length !== 1 ? 's' : ''} · {skillActivities.length} read{skillActivities.length !== 1 ? 's' : ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px' }}>{skillActivities.length} total</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {distinctSkills.map(s => {
          const role = (s.role || 'optional').toLowerCase()
          const roleStyle = role === 'must' ? { bg: '#fee2e2', color: '#dc2626', border: '#fecaca', label: 'Must' } : role === 'recommended' ? { bg: '#fef3c7', color: '#d97706', border: '#fde68a', label: 'Recommended' } : { bg: 'var(--surface-2)', color: 'var(--text-faint)', border: 'var(--border)', label: 'Optional' }
          const borderLeft = role === 'must' ? '#ef4444' : role === 'recommended' ? '#f59e0b' : '#86efac'
          return (
          <div key={s.raw} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, borderLeft: `3px solid ${borderLeft}` }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: role === 'must' ? '#fee2e21a' : role === 'recommended' ? '#fef3c71a' : '#86efac1a', border: `1px solid ${role === 'must' ? '#fecaca30' : role === 'recommended' ? '#fde68a30' : '#86efac30'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: role === 'must' ? '#ef4444' : role === 'recommended' ? '#f59e0b' : '#86efac', boxShadow: `0 0 6px ${role === 'must' ? 'rgba(239,68,68,0.5)' : role === 'recommended' ? 'rgba(245,158,11,0.5)' : 'rgba(134,239,172,0.6)'}` }} />
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.display}</span>
                <span title={role === 'must' ? 'Must - AI must read it before writing' : role === 'recommended' ? 'Recommended - AI should read it' : 'Optional'} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.06, padding: '2px 5px', borderRadius: 999, background: roleStyle.bg, color: roleStyle.color, border: `1px solid ${roleStyle.border}`, flexShrink: 0 }}>{roleStyle.label}</span>
              </span>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'ui-monospace, monospace' }} title={s.raw}>{s.raw}</span>
              {s.triggers && <span style={{ display: 'block', fontSize: 10, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'ui-monospace, monospace' }} title={s.triggers}>↳ {s.triggers}</span>}
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
              <span style={{ fontSize: 11, fontWeight: 700, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 999, padding: '2px 7px', color: 'var(--text-dim)' }}>×{s.count}</span>
              <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>{new Date(s.lastTs).toLocaleTimeString()}</span>
            </span>
          </div>
          )
        })}
      </div>
      <div style={{ marginTop: 12, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Skill reads are <code style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px' }}>read_file</code> on <code style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '1px 4px' }}>skills/*.md</code> — excluded from Activity counts.
      </div>
    </div>
  )
}

function PlanView({ plan, activities, streaming }: { plan: Plan | null; activities: Activity[]; streaming: boolean }) {
  // Derive flow stage from plan + activities
  // Only treat explore as active when the agent has actually called an explore tool (skill reads excluded).
  const hasExplore = activities.some(a => !isSkillRead(a) && ['list_files','read_file','run_shell'].includes(a.toolType))
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

function AgentsPane({ activeChatId, subAgents, teams, activeAgent, onSelectAgent }: { activeChatId: string | null; subAgents: SubAgent[]; teams: Team[]; activeAgent?: import('../types').ActiveAgentView | null; onSelectAgent?: (view: import('../types').ActiveAgentView) => void }) {
  const [messagesBySub, setMessagesBySub] = useState<Record<string, SubAgentMessage[]>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toast = useToast()
  const total = subAgents.length + teams.length
  // poll sub-agent messages every 2s while any working
  useEffect(() => {
    if (!activeChatId) return
    let ids = subAgents.filter(s => s.status === 'working').map(s => s.id)
    if (ids.length === 0) return
    const t = setInterval(() => {
      for (const sid of ids) {
        api.listSubAgentMessages(sid).then(list => setMessagesBySub(prev => ({ ...prev, [sid]: list }))).catch(() => {})
      }
    }, 2000)
    return () => clearInterval(t)
  }, [activeChatId, subAgents])
  useEffect(() => {
    if (!activeChatId) { setMessagesBySub({}); return }
    // initial load for all sub-agents (first 3 eagerly, rest on expand)
    const eager = subAgents.slice(0, 3)
    eager.forEach(s => {
      api.listSubAgentMessages(s.id).then(list => setMessagesBySub(prev => ({ ...prev, [s.id]: list }))).catch(() => {})
    })
  }, [activeChatId, subAgents.length])
  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = { ...prev, [id]: !prev[id] }
      if (next[id] && !messagesBySub[id]) {
        api.listSubAgentMessages(id).then(list => setMessagesBySub(p => ({ ...p, [id]: list }))).catch(() => {})
      }
      return next
    })
  }
  if (!activeChatId) return <div className="rsb-empty">Select a chat to see agents</div>
  if (total === 0) {
    return (
      <div className="rsb-empty" style={{ flexDirection: 'column', gap: 10, textAlign: 'center', padding: '24px 12px' }}>
        <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>No sub-agents yet</span>
        <span style={{ fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>Choose <b>Solo</b>=1 · <b>Swarm</b>=main→5 · <b>Hive</b>=nested · <b>Squad</b>=Team+Head · <b>Infinity</b>=unlimited+Preview<br/>in the composer menu, then send a task. They appear above the input and here.</span>
        <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'ui-monospace, monospace' }}>Modes: solo/swarm/hive/squad/infinity</span>
      </div>
    )
  }
  const swarmCount = subAgents.filter(s => !s.parentSubAgentId && !s.teamId).length
  const hiveNested = subAgents.filter(s => !!s.parentSubAgentId).length
  const squadMembers = subAgents.filter(s => !!s.teamId).length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-faint)' }}>
        <span style={{ padding: '3px 7px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>{subAgents.length} sub-agents</span>
        <span style={{ padding: '3px 7px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>{teams.length} teams</span>
        {swarmCount > 0 && <span style={{ padding: '3px 7px', background: 'var(--primary-bg)', border: '1px solid var(--primary-border)', borderRadius: 6, color: 'var(--primary)' }}>{swarmCount} swarm</span>}
        {hiveNested > 0 && <span style={{ padding: '3px 7px', background: '#fef3c71a', border: '1px solid #facc1530', borderRadius: 6, color: '#facc15' }}>{hiveNested} hive-nested</span>}
        {squadMembers > 0 && <span style={{ padding: '3px 7px', background: '#22c55e1a', border: '1px solid #22c55e30', borderRadius: 6, color: '#22c55e' }}>{squadMembers} squad</span>}
      </div>
      {teams.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6 }}>Teams (Squad/Infinity)</div>
          {teams.map(t => {
            const members = subAgents.filter(s => s.teamId === t.id)
            const isActive = activeAgent?.kind === 'team' && activeAgent.id === t.id
            return (
              <div key={t.id} style={{ marginBottom: 8, border: `1px solid ${isActive ? 'var(--primary-border)' : 'var(--border)'}`, background: isActive ? 'var(--primary-bg)' : 'var(--surface)', borderLeft: '3px solid var(--primary)', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Team · {t.name}</span>
                  <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => onSelectAgent?.({ kind: 'team', id: t.id })}>{isActive ? 'Viewing' : 'View head chat'}</button>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>{members.length} member{members.length !== 1 ? 's' : ''} · head {t.headId ? t.headId.slice(0,6) : 'main'}</div>
                {members.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                    {members.map(m => (
                      <button key={m.id} onClick={() => onSelectAgent?.({ kind: 'subagent', id: m.id })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', background: activeAgent?.kind === 'subagent' && activeAgent.id === m.id ? 'var(--primary-bg)' : 'var(--surface-2)', border: `1px solid ${activeAgent?.kind === 'subagent' && activeAgent.id === m.id ? 'var(--primary-border)' : 'var(--border)'}`, borderRadius: 6, textAlign: 'left', cursor: 'pointer' }}>
                        <span className={`agent-dot agent-status-${m.status}`} style={{ width: 7, height: 7 }} />
                        <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.mode} · {m.task.slice(0, 34)}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase' }}>{m.status}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: 0.06, marginBottom: 6 }}>Sub-agents — all modes</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {subAgents.map(s => {
            const isActive = activeAgent?.kind === 'subagent' && activeAgent.id === s.id
            const isExpanded = !!expanded[s.id]
            const msgs = messagesBySub[s.id] ?? []
            const depth = s.parentSubAgentId ? 1 : 0
            return (
              <div key={s.id} style={{ border: `1px solid ${isActive ? 'var(--primary-border)' : 'var(--border)'}`, background: isActive ? 'var(--primary-bg)' : 'var(--surface)', borderRadius: 8, padding: '8px 10px', marginLeft: depth ? 14 : 0, borderLeft: depth ? '2px solid #facc15' : undefined }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className={`agent-dot agent-status-${s.status}`} style={{ width: 8, height: 8, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: 0.04 }}>{s.mode}</span>
                  <span style={{ fontSize: 11, color: s.status === 'working' ? '#eab308' : s.status === 'done' ? '#22c55e' : s.status === 'error' ? 'var(--danger)' : 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase' }}>{s.status}</span>
                  {s.teamId && <span style={{ fontSize: 10, padding: '2px 5px', background: 'var(--btn)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-faint)' }}>team:{s.teamId.slice(0,4)}</span>}
                  {s.parentSubAgentId && <span style={{ fontSize: 10, padding: '2px 5px', background: '#fef3c71a', border: '1px solid #facc1530', borderRadius: 4, color: '#facc15' }}>hive↳ {s.parentSubAgentId.slice(0,4)}</span>}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button className="btn" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => onSelectAgent?.({ kind: 'subagent', id: s.id })}>{isActive ? 'Viewing' : 'View chat'}</button>
                    <button className="btn" style={{ padding: '4px 7px', fontSize: 11 }} onClick={() => toggleExpand(s.id)} title={isExpanded ? 'Hide chat' : 'Show chat'}>{isExpanded ? 'Hide' : `Chat ${msgs.length || ''}`}</button>
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.45 }}>{s.task}</div>
                {s.result && <div style={{ marginTop: 6, padding: '6px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, color: 'var(--text-dim)', maxHeight: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-wrap' }}>{s.result.slice(0, 300)}{s.result.length > 300 ? '…' : ''}</div>}
                {isExpanded && (
                  <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8, maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {msgs.length === 0 ? <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>No chat yet — expands to load GET /api/subagents/{s.id.slice(0,6)}/messages</span> : msgs.map(m => (
                      <div key={m.id} style={{ padding: '6px 8px', background: m.role === 'user' ? 'var(--primary-bg)' : m.role === 'assistant' ? 'var(--surface-2)' : 'var(--input)', border: '1px solid var(--border)', borderRadius: 6 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-faint)', textTransform: 'uppercase', marginBottom: 3 }}>{m.role}{m.toolName ? ` · ${m.toolName}` : ''} · {new Date(m.createdAt).toLocaleTimeString()}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', lineHeight: 1.5 }}>{m.content.slice(0, 800)}{m.content.length > 800 ? '…' : ''}</div>
                      </div>
                    ))}
                    <button className="btn" style={{ marginTop: 4, padding: '4px 8px', fontSize: 11, alignSelf: 'flex-start' }} onClick={() => api.listSubAgentMessages(s.id).then(list => setMessagesBySub(prev => ({ ...prev, [s.id]: list }))).catch(() => toast('failed', 'error'))}>Refresh</button>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--text-faint)', fontFamily: 'ui-monospace, monospace', flexWrap: 'wrap' }}>
                  {s.modelId && <span>model:{s.modelId.slice(0, 16)}</span>}
                  {s.worktreePath && <span title={s.worktreePath}>wt:{s.worktreePath.split('/').pop()}</span>}
                  <span style={{ marginLeft: 'auto' }}>{new Date(s.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 8px' }}>
        <b style={{ color: 'var(--text-dim)' }}>Modes:</b> Solo=1 · Swarm=main→5 parallel · Hive=Main→Agent→5 (depth2, parentSubAgentId) · Squad=Team+Head (teamId) · Infinity=unlimited+Preview+per-role modelId
      </div>
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

export function RightSidebar({ open, activeProject, activeChatId, plan, activities, streaming, subAgents = [], teams = [], activeAgent, onSelectAgent, onClose }: RightSidebarProps) {
  const [tab, setTab] = useState<RsTab>('plan')
  // Hide skill reads from activity counts/badge — they live only in Skills tab
  const visibleActivities = activities.filter(a => !isSkillRead(a))
  const activityCount = visibleActivities.length
  const writeCount = visibleActivities.filter(a => a.toolType === 'write_file').length
  const editCount = visibleActivities.filter(a => a.toolType === 'edit_file').length
  const readCount = visibleActivities.filter(a => a.toolType === 'read_file').length
  const hasRunning = visibleActivities.some(a => a.ok === undefined)
  const agentCount = (subAgents?.length ?? 0) + (teams?.length ?? 0)
  const hasAgentRunning = (subAgents ?? []).some(s => s.status === 'working' || s.status === 'pending')
  const skillActivities = useMemo(() => activities.filter(isSkillRead), [activities])
  const distinctSkillCount = useMemo(() => {
    const s = new Set(skillActivities.map(a => String((a.args as any)?.path ?? '').toLowerCase().trim().replace(/^\.\//,'').replace(/^\//,'').replace(/^skills\//,'')))
    return s.size
  }, [skillActivities])
  const tabsRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ active: boolean; startX: number; startScrollLeft: number; moved: boolean } | null>(null)
  const dragMovedRef = useRef(false)
  // VS Code-like resizable width
  const [rsbWidth, setRsbWidth] = useState<number>(() => {
    try {
      const v = localStorage.getItem('ks.rsb.width')
      const n = v ? parseInt(v, 10) : 340
      return Number.isFinite(n) && n >= 280 && n <= 800 ? n : 340
    } catch { return 340 }
  })
  const resizingRef = useRef<{ startX: number; startW: number } | null>(null)
  const [isResizing, setIsResizing] = useState(false)

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
    dragMovedRef.current = false
    dragRef.current = { active: true, startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false }
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'
  }

  function handleTabsPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const el = e.currentTarget
    if (!drag?.active) return
    const dx = e.clientX - drag.startX
    if (Math.abs(dx) > 8) { drag.moved = true; dragMovedRef.current = true }
    if (drag.moved) el.scrollLeft = drag.startScrollLeft - dx
  }

  function handleTabsPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const drag = dragRef.current
    dragRef.current = null
    el.style.cursor = ''
    el.style.userSelect = ''
    if (drag?.moved) {
      // prevent accidental tab click after drag — keep flag for click handler
      e.preventDefault()
      e.stopPropagation()
      setTimeout(() => { dragMovedRef.current = false }, 350)
    } else {
      // tap without drag — allow click
      dragMovedRef.current = false
    }
  }

  function handleRsbResizeStart(e: React.MouseEvent) {
    e.preventDefault()
    resizingRef.current = { startX: e.clientX, startW: rsbWidth }
    setIsResizing(true)
  }

  function handleRsbResizeDoubleClick() {
    const def = 340
    setRsbWidth(def)
    try { localStorage.setItem('ks.rsb.width', String(def)) } catch {}
  }

  useEffect(() => {
    if (!isResizing) return
    function onMove(e: MouseEvent) {
      const r = resizingRef.current
      if (!r) return
      const dx = r.startX - e.clientX
      const next = Math.max(280, Math.min(800, r.startW + dx))
      const maxVw = Math.floor(window.innerWidth * 0.5)
      const clamped = Math.min(next, maxVw)
      setRsbWidth(clamped)
    }
    function onUp() {
      setIsResizing(false)
      resizingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing])

  useEffect(() => {
    if (isResizing) return
    try { localStorage.setItem('ks.rsb.width', String(rsbWidth)) } catch {}
  }, [rsbWidth, isResizing])

  return (
    <>
      <aside className={`rsb${open ? ' open' : ''}${isResizing ? ' resizing' : ''}`} style={open ? { width: rsbWidth } as any : undefined}>
        <div
          className="rsb-resizer"
          onMouseDown={handleRsbResizeStart}
          onDoubleClick={handleRsbResizeDoubleClick}
          title="Drag to resize — double-click to reset"
          aria-hidden
        />
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
            const isAgents = t.id === 'agents'
            const isSkills = t.id === 'skills'
            return (
              <button
                key={t.id}
                className={`tab${tab === t.id ? ' active' : ''}`}
                onClick={(e) => {
                  if (dragMovedRef.current) { dragMovedRef.current = false; return }
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
                  {isAgents && agentCount > 0 && (
                    <span className="rsb-tab-badge" title={`${subAgents.length} sub-agents · ${teams.length} teams`}>
                      {agentCount}
                      {hasAgentRunning && <span className="rsb-tab-pulse" style={{ background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />}
                    </span>
                  )}
                  {isAgents && agentCount > 0 && (
                    <span className="rsb-tab-dots" aria-hidden>
                      {subAgents.filter(s=> s.status==='working').length > 0 && <span className="rsb-dot" style={{ background: '#eab308', boxShadow: '0 0 6px rgba(234,179,8,0.5)' }} title={`${subAgents.filter(s=> s.status==='working').length} working`} />}
                      {subAgents.filter(s=> s.status==='done').length > 0 && <span className="rsb-dot" style={{ background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} title={`${subAgents.filter(s=> s.status==='done').length} done`} />}
                    </span>
                  )}
                  {isSkills && distinctSkillCount > 0 && (
                    <span className="rsb-tab-badge" title={`${distinctSkillCount} skills · ${skillActivities.length} reads`} style={{ background: '#86efac1a', color: '#86efac', border: '1px solid #86efac30' }}>
                      {distinctSkillCount}
                    </span>
                  )}
                  {isSkills && distinctSkillCount > 0 && (
                    <span className="rsb-tab-dots" aria-hidden>
                      <span className="rsb-dot" style={{ background: '#86efac', boxShadow: '0 0 6px rgba(134,239,172,0.5)' }} title={`${distinctSkillCount} skills`} />
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>

        <div className="rsb-body">
          {tab === 'plan' && <PlanView plan={plan} activities={activities} streaming={streaming} />}
          {tab === 'agents' && <AgentsPane activeChatId={activeChatId ?? null} subAgents={subAgents} teams={teams} activeAgent={activeAgent} onSelectAgent={onSelectAgent} />}
          {tab === 'terminal' && <TerminalPane project={activeProject} />}
          {tab === 'activity' && <ActivityPane activities={activities} />}
          {tab === 'skills' && <SkillsPane activities={activities} />}
          {tab === 'files' && <FilesPane projectId={activeProject?.id ?? null} />}
        </div>
      </aside>
      <div className={`scrim rsb-scrim${open ? ' show' : ''}`} onClick={onClose} />
    </>
  )
}
