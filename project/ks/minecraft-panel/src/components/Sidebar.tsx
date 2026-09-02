import { NavLink } from 'react-router-dom';

const navItems = [
  { name: 'Dashboard', path: '/' },
  { name: 'Console', path: '/console' },
  { name: 'Files', path: '/files' },
  { name: 'Players', path: '/players' },
  { name: 'Backups', path: '/backups' },
];

export function Sidebar() {
  return (
    <nav className="sidebar">
      <div className="nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <span className="icon">{item.name === 'Dashboard' ? '🏠' : item.name === 'Console' ? '⚙️' : item.name === 'Files' ? '📁' : item.name === 'Players' ? '👥' : '📦'}</span>
            {item.name}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}