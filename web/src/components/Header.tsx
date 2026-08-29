import { IconMenu, IconPanelRight, IconMonitor, IconPuzzle } from '../icons'

interface HeaderProps {
  onMenu: () => void
  onToggleRight: () => void
  onTogglePreview: () => void
  onToggleExtensions?: () => void
  hasPreview?: boolean
  previewPort?: number | null
}

export function Header({ onMenu, onToggleRight, onTogglePreview, onToggleExtensions, hasPreview, previewPort }: HeaderProps) {
  return (
    <header className="header">
      <button className="icon-btn menu-btn" aria-label="Toggle sidebar" onClick={onMenu}>
        <IconMenu size={20} />
      </button>
      <div className="brand">
        KS Agent<span className="brand-dot" />
      </div>
      <div className="header-spacer" />
      <div className="header-actions" role="toolbar" aria-label="Workspace toggles">
        <button className="icon-btn ext-toggle" aria-label="Toggle extensions" onClick={onToggleExtensions} title="Extensions — MCP, LSP, Plugins, Skills">
          <IconPuzzle size={20} />
        </button>
        <button
          className="icon-btn psb-toggle"
          aria-label="Toggle preview"
          onClick={onTogglePreview}
          style={{ position: 'relative' }}
          title={hasPreview ? `Preview Live :${previewPort} — click to open` : 'Toggle preview'}
        >
          <IconMonitor size={20} />
          {hasPreview && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: '#22c55e',
                border: '2px solid var(--surface)',
                boxShadow: '0 0 8px rgba(34,197,94,0.85)',
              }}
            />
          )}
          {hasPreview && (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: '#22c55e',
                opacity: 0.55,
                animation: 'previewPing 1.6s cubic-bezier(0,0,0.2,1) infinite',
              }}
            />
          )}
        </button>
        <button className="icon-btn rsb-toggle" aria-label="Toggle workspace panel" onClick={onToggleRight} title="Workspace — Plan / Files / Terminal / Activity">
          <IconPanelRight size={20} />
        </button>
      </div>
    </header>
  )
}
