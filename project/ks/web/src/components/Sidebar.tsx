import { useState, useEffect, useRef } from 'react'
import { 
  IconDashboard, IconConsole, IconFiles, IconSettings,
  IconChevronLeft, IconChevronRight, IconMenu,
  IconServer, IconMemory, IconCpu, IconGlobe
} from './Icons'
import { ServerStats } from '../types'

interface SidebarProps {
  activeTab: string
  onTabChange: (tab: string) => void
  stats?: ServerStats
  serverRunning: boolean
}

export function Sidebar({ activeTab, onTabChange, stats, serverRunning }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [hovered, setHovered] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024 && !collapsed) {
        setCollapsed(true)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [collapsed])

  const tabs = [
    { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
    { id: 'console', label: 'Console', icon: IconConsole },
    { id: 'files', label: 'Files', icon: IconFiles },
    { id: 'settings', label: 'Settings', icon: IconSettings }
  ]

  const effectiveCollapsed = collapsed || hovered

  return (
    <div
      ref={sidebarRef}
      className={`sidebar ${collapsed ? 'collapsed' : ''} ${hovered && !collapsed ? 'hovered' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ width: effectiveCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)' }}
    >
      <div className="sidebar-header">
        {!collapsed && (
          <div className="logo">
            <IconServer size={28} style={{ color: 'var(--accent-primary)' }} />
            <span>MinePanel</span>
          </div>
        )}
        <button
          className="collapse-btn"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <IconChevronRight size={18} /> : <IconChevronLeft size={18} />}
        </button>
      </div>

      <nav className="sidebar-nav" role="navigation" aria-label="Main navigation">
        <ul>
          {tabs.map(tab => (
            <li key={tab.id}>
              <button
                className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => onTabChange(tab.id)}
                title={collapsed ? tab.label : ''}
              >
                <tab.icon size={20} className="nav-icon" />
                {!collapsed && <span className="nav-label">{tab.label}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {stats && (
        <div className={`sidebar-stats ${collapsed ? 'collapsed' : ''}`}>
          <div className="stat-card">
            <div className="stat-icon cpu">
              <IconCpu size={16} />
            </div>
            {!collapsed && (
              <div className="stat-info">
                <span className="stat-label">CPU</span>
                <span className="stat-value">{(stats.memory.heapUsed / stats.memory.heapTotal * 100).toFixed(1)}%</span>
              </div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-icon mem">
              <IconMemory size={16} />
            </div>
            {!collapsed && (
              <div className="stat-info">
                <span className="stat-label">Memory</span>
                <span className="stat-value">{stats.memory.rss} MB</span>
              </div>
            )}
          </div>
          <div className="stat-card">
            <div className="stat-icon net">
              <IconGlobe size={16} />
            </div>
            {!collapsed && (
              <div className="stat-info">
                <span className="stat-label">Port</span>
                <span className="stat-value">25565</span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="sidebar-footer">
        {!collapsed && (
          <div className="server-status">
            <span className={`status-indicator ${serverRunning ? 'running' : 'stopped'}`}></span>
            <span className="status-text">{serverRunning ? 'Server Running' : 'Server Stopped'}</span>
          </div>
        )}
        <div className="version">v1.0.0</div>
      </div>

      <style jsx>{`
        .sidebar {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: var(--bg-secondary);
          border-right: 1px solid var(--border-color);
          transition: width var(--transition);
          position: relative;
          z-index: 100;
          overflow: hidden;
        }
        .sidebar.collapsed {
          width: var(--sidebar-collapsed);
        }
        .sidebar-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: var(--header-height);
          padding: 0 16px;
          border-bottom: 1px solid var(--border-color);
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 600;
          font-size: 15px;
          color: var(--text-primary);
          white-space: nowrap;
        }
        .collapse-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          transition: all var(--transition);
        }
        .collapse-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .sidebar-nav {
          flex: 1;
          padding: 12px 8px;
          overflow-y: auto;
        }
        .sidebar-nav ul {
          list-style: none;
        }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          width: 100%;
          padding: 10px 12px;
          border-radius: var(--radius-md);
          color: var(--text-secondary);
          transition: all var(--transition);
          position: relative;
        }
        .nav-item:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .nav-item.active {
          background: rgba(88, 166, 255, 0.15);
          color: var(--accent-primary);
          border-left: 3px solid var(--accent-primary);
          padding-left: 9px;
        }
        .nav-item.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 60%;
          background: var(--accent-primary);
          border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
        }
        .nav-icon {
          flex-shrink: 0;
        }
        .nav-label {
          font-size: 13px;
          font-weight: 500;
          white-space: nowrap;
          opacity: 1;
          transition: opacity var(--transition);
        }
        .sidebar.collapsed .nav-label {
          opacity: 0;
          width: 0;
        }
        .sidebar-stats {
          padding: 0 8px 12px;
          border-top: 1px solid var(--border-color);
          margin-top: auto;
        }
        .sidebar-stats.collapsed {
          display: none;
        }
        .stat-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: var(--radius-md);
          background: var(--bg-tertiary);
          margin-bottom: 8px;
          transition: all var(--transition);
        }
        .stat-card:last-child {
          margin-bottom: 0;
        }
        .stat-card:hover {
          background: var(--bg-hover);
        }
        .stat-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
        }
        .stat-icon.cpu { background: rgba(88, 166, 255, 0.15); color: var(--accent-primary); }
        .stat-icon.mem { background: rgba(63, 185, 80, 0.15); color: var(--accent-green); }
        .stat-icon.net { background: rgba(163, 113, 247, 0.15); color: var(--accent-purple); }
        .stat-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .stat-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .stat-value {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
          font-family: 'JetBrains Mono', monospace;
        }
        .sidebar-footer {
          padding: 12px 16px;
          border-top: 1px solid var(--border-color);
        }
        .server-status {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: var(--radius-md);
          background: var(--bg-tertiary);
          margin-bottom: 8px;
        }
        .status-indicator {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .status-indicator.running {
          background: var(--accent-green);
          box-shadow: 0 0 8px var(--accent-green);
        }
        .status-indicator.stopped {
          background: var(--accent-red);
        }
        .status-text {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-primary);
        }
        .version {
          font-size: 11px;
          color: var(--text-muted);
          text-align: center;
        }
      `}</style>
    </div>
  )
}