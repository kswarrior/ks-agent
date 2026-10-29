import { useState } from 'react'
import * as api from '../api'
import { useToast } from '../toast'
import { IconX } from '../icons'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (project: { id: string }) => void
}

export function AddProjectModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [path, setPath] = useState('')
  const [mkdir, setMkdir] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const toast = useToast()

  if (!open) return null

  const resolvedPreview = (() => {
    const p = path.trim()
    if (!p) return ''
    if (p.startsWith('/') || p.startsWith('~/') || p === '~') return p
    if (p === 'project' || p.startsWith('project/')) return p
    const norm = p.replace(/^\.\//, '')
    return `project/${norm}`
  })()

  async function submit() {
    setError(null)
    if (!name.trim()) return setError('Project name is required')
    if (!path.trim()) return setError('Project path is required')
    setBusy(true)
    try {
      const project = await api.createProject({ name: name.trim(), path: path.trim(), mkdir })
      toast(`Project "${project.name}" created`, 'success')
      setName('')
      setPath('')
      onCreated(project)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h3 className="dialog-title" style={{ flex: 1 }}>
            New project
          </h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            <IconX size={17} />
          </button>
        </div>

        <label className="field-label">Name</label>
        <input
          className="input"
          placeholder="My Project"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
        />

        <label className="field-label">Path</label>
        <input
          className="input"
          placeholder="myproject  or  /myproject  or  ~/projects/my-project"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => !busy && e.key === 'Enter' && submit()}
        />
        <div style={{ fontSize: '12px', opacity: 0.6, marginTop: 4, lineHeight: 1.4 }}>
          Relative: <code>myproject</code> → <code>project/myproject</code> &nbsp;|&nbsp; Absolute: <code>/myproject</code> → <code>/myproject</code>
        </div>
        {resolvedPreview && (
          <div style={{ fontSize: '12px', opacity: 0.8, marginTop: 4 }}>
            → <code>{resolvedPreview}</code>
          </div>
        )}

        <label className="checkbox-row">
          <input type="checkbox" checked={mkdir} onChange={(e) => setMkdir(e.target.checked)} />
          Create directory if it does not exist
        </label>

        {error && <p className="field-error">{error}</p>}

        <div className="dialog-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </div>
    </div>
  )
}
