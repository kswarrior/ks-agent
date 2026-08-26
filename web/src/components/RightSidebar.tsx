import { useState } from 'react'
import type { Plan, Project } from '../types'
import { IconCheck, IconX } from '../icons'
import { FilesPane } from './FilesPane'

type RsTab = 'plan' | 'files' | 'terminal' | 'settings'

interface RightSidebarProps {
  open: boolean
  activeProject: Project | null
  plan: Plan | null
  onClose: () => void
  onOpenSettings: () => void
}

const TABS: Array<{ id: RsTab; label: string }> = [
  { id: 'plan', label: 'Plan' },
  { id: 'files', label: 'Files' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'settings', label: 'Settings' }
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
        <div key={step.id} className={`plan-card${step.status === 'done' ? ' done' : ''}`}>
          <span className="plan-check">{step.status === 'done' && <IconCheck size={11} />}</span>
          <span className="plan-step">{step.title}</span>
          <span className="plan-num">{i + 1}</span>
        </div>
      ))}
    </div>
  )
}

export function RightSidebar({ open, activeProject, plan, onClose, onOpenSettings }: RightSidebarProps) {
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
          {tab === 'terminal' && <div className="rsb-empty">Nothing here yet</div>}
          {tab === 'settings' && (
            <div className="rsb-settings">
              <p>Providers, models and prompts are managed in Settings.</p>
              <button className="btn btn-primary" onClick={onOpenSettings}>
                Open settings
              </button>
            </div>
          )}
          {tab === 'files' && <FilesPane projectId={activeProject?.id ?? null} />}
        </div>
      </aside>
      <div className={`scrim rsb-scrim${open ? ' show' : ''}`} onClick={onClose} />
    </>
  )
}
