import type { Project, Provider, ModelEntry } from '../types'

export function shouldAutoShowOnboarding(projects: Project[], providers: Provider[], models: ModelEntry[]): boolean {
  if (projects.length === 0) return true
  if (providers.length === 0) return true
  if (models.length === 0) return true
  return false
}

interface Props {
  open: boolean
  onClose: () => void
  projects: Project[]
  providers: Provider[]
  models: ModelEntry[]
  onProjectCreated: (p: Project) => void
  onProviderModelCreated: () => void
}

export function OnboardingWizard({ open, onClose }: Props) {
  if (!open) return null
  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          borderRadius: 'var(--radius)',
          padding: 24,
          minWidth: 320,
          maxWidth: 480,
          border: '1px solid var(--border)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Quick Setup</h3>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, marginTop: 8 }}>
          Add a project, provider and model to get started. Use Settings to configure your OpenAI-compatible provider.
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
