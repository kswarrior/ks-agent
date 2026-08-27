import { IconMenu, IconPanelRight, IconMonitor } from '../icons'

interface HeaderProps {
  onMenu: () => void
  onToggleRight: () => void
  onTogglePreview: () => void
}

export function Header({ onMenu, onToggleRight, onTogglePreview }: HeaderProps) {
  return (
    <header className="header">
      <button className="icon-btn menu-btn" aria-label="Toggle sidebar" onClick={onMenu}>
        <IconMenu size={20} />
      </button>
      <div className="brand">
        KS Agent<span className="brand-dot" />
      </div>
      <div className="header-spacer" />
      <button className="icon-btn psb-toggle" aria-label="Toggle preview" onClick={onTogglePreview}>
        <IconMonitor size={20} />
      </button>
      <button className="icon-btn rsb-toggle" aria-label="Toggle workspace panel" onClick={onToggleRight}>
        <IconPanelRight size={20} />
      </button>
    </header>
  )
}
