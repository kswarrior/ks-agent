import { useState } from 'react'
import { reloadExtensions } from '../api'
import type { ExtensionInfo } from '../types'
import { Modal } from './Modal'

export function ExtensionsModal({
  extensions,
  onClose,
  onRefresh
}: {
  extensions: ExtensionInfo[]
  onClose: () => void
  onRefresh: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setBusy(true)
    setError(null)
    try {
      await reloadExtensions()
      await onRefresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Extensions"
      onClose={onClose}
      wide
      footer={
        <>
          <span className="muted small">
            Each extension runs in its own process and receives only the active project path.
          </span>
          <button className="btn primary" onClick={reload} disabled={busy}>
            {busy ? 'Reloading…' : 'Reload extensions'}
          </button>
        </>
      }
    >
      {error && <div className="error-banner">{error}</div>}
      {extensions.length === 0 && (
        <p className="empty-hint">
          No extensions found. Add a folder under <code>extensions/</code> with an <code>extension.json</code>.
        </p>
      )}
      <div className="extension-grid">
        {extensions.map((extension) => (
          <div className="extension-card" key={extension.name}>
            <div className="extension-head">
              <div>
                <strong>{extension.name}</strong>
                <span className="muted small"> v{extension.version}</span>
              </div>
              <span className={`status ${extension.status}`}>{extension.status}</span>
            </div>
            <p className="muted">{extension.description || 'No description.'}</p>
            {extension.error && <div className="error-banner small">{extension.error}</div>}
            {extension.tools.length > 0 && (
              <div className="chips">
                {extension.tools.map((tool) => (
                  <span className="chip" key={tool.name} title={tool.description}>
                    {tool.name}
                  </span>
                ))}
              </div>
            )}
            {extension.hooks.length > 0 && (
              <div className="muted small">hooks: {extension.hooks.join(', ')}</div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}
