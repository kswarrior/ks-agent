import { useState } from 'react'
import { reloadExtensions } from '../api'
import type { ExtensionInfo } from '../types'
import { Modal } from './Modal'

type ExtensionTab = 'extensions' | 'skills' | 'mcp' | 'lsp'

const TABS: { id: ExtensionTab; label: string }[] = [
  { id: 'extensions', label: 'Extensions' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
  { id: 'lsp', label: 'LSP' }
]

const TAB_EMPTY: Record<Exclude<ExtensionTab, 'extensions'>, { title: string; body: string }> = {
  skills: {
    title: 'No skills yet',
    body: 'Reusable skills will appear here when skill support is enabled.'
  },
  mcp: {
    title: 'No MCP servers',
    body: 'MCP servers and their tools will appear here when MCP support is enabled.'
  },
  lsp: {
    title: 'No language servers',
    body: 'Language servers will appear here when LSP support is enabled.'
  }
}

export function ExtensionsModal({
  extensions,
  onClose,
  onRefresh
}: {
  extensions: ExtensionInfo[]
  onClose: () => void
  onRefresh: () => Promise<void>
}) {
  const [tab, setTab] = useState<ExtensionTab>('extensions')
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
      fullHeight
      footer={
        tab === 'extensions' ? (
          <>
            <span className="muted small">
              Each extension runs in its own process and receives only the active project path.
            </span>
            <button className="btn primary" onClick={reload} disabled={busy}>
              {busy ? 'Reloading…' : 'Reload extensions'}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="settings-tabs" role="tablist" aria-label="Extensions">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className={`settings-tab ${tab === entry.id ? 'active' : ''}`}
            onClick={() => {
              setTab(entry.id)
              setError(null)
            }}
            role="tab"
            aria-selected={tab === entry.id}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tab === 'extensions' ? (
        <>
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
        </>
      ) : (
        <div className="extension-tab-empty">
          <strong>{TAB_EMPTY[tab].title}</strong>
          <p className="muted">{TAB_EMPTY[tab].body}</p>
        </div>
      )}
    </Modal>
  )
}
