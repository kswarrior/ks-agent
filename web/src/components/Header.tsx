import { IconMenu } from '../icons'

export function Header({ onMenu }: { onMenu: () => void }) {
  return (
    <header className="header">
      <button className="icon-btn menu-btn" aria-label="Toggle sidebar" onClick={onMenu}>
        <IconMenu size={20} />
      </button>
      <div className="brand">
        KS Agent<span className="brand-dot" />
      </div>
      <div className="header-spacer" />
    </header>
  )
}
