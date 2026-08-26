import { useState } from 'react'
import type { Project } from '../types'
import { IconX } from '../icons'
import { FilesPane } from './FilesPane'

type RsTab = 'plan' | 'files' | 'terminal' | 'settings'

interface RightSidebarProps {
  open: boolean
  activeProject: Project | null
  onClose: () => void
  onOpenSettings: () => void
}

const TABS: Array<{ id: RsTab; label: string }> = [
  { id: 'plan', label: 'Plan' },
  { id: 'files', label: 'Files' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'settings', label: 'Settings' }
]

export function RightSidebar({ open, activeProject, onClose, onOpenSettings }: RightSidebarProps) {
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
          {tab === 'plan' && <div className="rsb-empty">Nothing here yet</div>}
          {tab === 'terminal' && <div className="rsb-empty">Nothing here yet</div>}
          {tab === 'settings' && (
            <div className="rsb-settings">
              <p>Providers, models and the system prompt are managed in Settings.</p>
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
