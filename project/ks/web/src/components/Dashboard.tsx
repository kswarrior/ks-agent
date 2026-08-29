import { useState, useEffect, useRef } from 'react'
import { 
  IconPlay, IconStop, IconRestart, IconTerminal, IconFolder, IconFile,
  IconUpload, IconDownload, IconDelete, IconEdit, IconNewFile, IconNewFolder,
  IconSearch, IconRefresh, IconClear, IconLock, IconUnlock, IconInfo,
  IconAlertTriangle, IconCheckCircle, IconXCircle, IconActivity, IconZap,
  IconMoon, IconSun, IconCopy, IconExternalLink, IconChevronDown, IconChevronRight
} from './Icons'
import { serverApi, configApi, filesApi, createConsoleWebSocket, checkHealth } from '../api'
import { ServerConfig, FileNode, ServerStats } from '../types'

interface DashboardProps {
  serverRunning: boolean
  onServerChange: (running: boolean) => void
  stats?: ServerStats
}

export function Dashboard({ serverRunning, onServerChange, stats }: DashboardProps) {
  const [config, setConfig] = useState<ServerConfig | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    configApi.get().then(setConfig).finally(() => setLoading(false))
  }, [])

  const handleStart = async () => {
    const res = await serverApi.start()
    onServerChange(res.running)
  }

  const handleStop = async () => {
    const res = await serverApi.stop()
    onServerChange(res.running)
  }

  const handleRestart = async () => {
    await serverApi.restart()
    onServerChange(true)
  }

  const handleKill = async () => {
    const res = await serverApi.kill()
    onServerChange(res.running)
  }

  if (loading) return <div className="dashboard-loading">Loading...</div>

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <div className="server-status-large">
          <span className={`status-badge ${serverRunning ? 'running' : 'stopped'}`}>
            <span className="status-dot"></span>
            {serverRunning ? 'Running' : 'Stopped'}
          </span>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="card primary">
          <div className="card-header">
            <h2>Server Control</h2>
          </div>
          <div className="server-controls">
            <div className="control-group">
              <button className="btn btn-primary btn-lg" onClick={handleStart} disabled={serverRunning}>
                <IconPlay size={18} /> Start Server
              </button>
              <button className="btn btn-danger btn-lg" onClick={handleStop} disabled={!serverRunning}>
                <IconStop size={18} /> Stop Server
              </button>
            </div>
            <div className="control-group">
              <button className="btn btn-warning" onClick={handleRestart} disabled={!serverRunning}>
                <IconRestart size={16} /> Restart
              </button>
              <button className="btn btn-critical" onClick={handleKill} disabled={!serverRunning}>
                <IconXCircle size={16} /> Force Kill
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Quick Stats</h2>
          </div>
          <div className="stats-grid">
            <div className="stat">
              <div className="stat-icon activity"><IconActivity size={20} /></div>
              <div className="stat-content">
                <span className="stat-value">{serverRunning ? 'Online' : 'Offline'}</span>
                <span className="stat-label">Status</span>
              </div>
            </div>
            <div className="stat">
              <div className="stat-icon memory"><IconMemory size={20} /></div>
              <div className="stat-content">
                <span className="stat-value">{stats?.memory.rss || 0} MB</span>
                <span className="stat-label">Memory (RSS)</span>
              </div>
            </div>
            <div className="stat">
              <div className="stat-icon cpu"><IconCpu size={20} /></div>
              <div className="stat-content">
                <span className="stat-value">{stats ? ((stats.memory.heapUsed / stats.memory.heapTotal) * 100).toFixed(1) : 0}%</span>
                <span className="stat-label">Heap Usage</span>
              </div>
            </div>
            <div className="stat">
              <div className="stat-icon uptime"><IconZap size={20} /></div>
              <div className="stat-content">
                <span className="stat-value">{stats ? formatUptime(stats.uptime) : '0s'}</span>
                <span className="stat-label">Uptime</span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Configuration</h2>
          </div>
          <div className="config-grid">
            {config && [
              { label: 'Java Path', value: config.javaPath, icon: IconTerminal },
              { label: 'Server Jar', value: config.jarName, icon: IconFile },
              { label: 'Memory', value: config.memory, icon: IconMemory },
              { label: 'Port', value: config.port.toString(), icon: IconGlobe },
              { label: 'Java Args', value: config.javaArgs || '(none)', icon: IconActivity },
              { label: 'Auto Restart', value: config.autoRestart ? 'Enabled' : 'Disabled', icon: config.autoRestart ? IconCheckCircle : IconXCircle }
            ].map((item, i) => (
              <div key={i} className="config-item">
                <div className="config-icon">{item.icon(size: 18)}</div>
                <div className="config-info">
                  <span className="config-label">{item.label}</span>
                  <span className="config-value">{item.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2>Quick Actions</h2>
          </div>
          <div className="quick-actions">
            <a href="/console" className="action-btn" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate', { detail: 'console' })) }}>
              <IconTerminal size={20} />
              <span>Open Console</span>
            </a>
            <a href="/files" className="action-btn" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate', { detail: 'files' })) }}>
              <IconFolder size={20} />
              <span>File Manager</span>
            </a>
            <a href="/settings" className="action-btn" onClick={(e) => { e.preventDefault(); window.dispatchEvent(new CustomEvent('navigate', { detail: 'settings' })) }}>
              <IconSettings size={20} />
              <span>Settings</span>
            </a>
          </div>
        </div>
      </div>

      <style jsx>{`
        .dashboard {
          padding: 24px;
          height: 100%;
          overflow-y: auto;
        }
        .dashboard-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }
        .dashboard-header h1 {
          font-size: 24px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 600;
        }
        .status-badge.running {
          background: rgba(63, 185, 80, 0.15);
          color: var(--accent-green);
        }
        .status-badge.stopped {
          background: rgba(248, 81, 73, 0.15);
          color: var(--accent-red);
        }
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: currentColor;
        }
        .status-badge.running .status-dot {
          box-shadow: 0 0 8px var(--accent-green);
        }
        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 20px;
        }
        .card {
          background: var(--bg-secondary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }
        .card.primary {
          border-color: rgba(88, 166, 255, 0.3);
        }
        .card-header {
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-color);
        }
        .card-header h2 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .server-controls {
          padding: 20px;
        }
        .control-group {
          display: flex;
          gap: 12px;
          margin-bottom: 12px;
        }
        .control-group:last-child {
          margin-bottom: 0;
        }
        .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 16px;
          border-radius: var(--radius-md);
          font-size: 13px;
          font-weight: 500;
          transition: all var(--transition);
          white-space: nowrap;
        }
        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-lg {
          flex: 1;
          padding: 14px 20px;
          font-size: 14px;
        }
        .btn-primary {
          background: var(--accent-primary);
          color: #0d1117;
        }
        .btn-primary:hover:not(:disabled) {
          background: var(--accent-hover);
        }
        .btn-danger {
          background: var(--accent-red);
          color: white;
        }
        .btn-danger:hover:not(:disabled) {
          background: var(--accent-red-hover);
        }
        .btn-warning {
          background: var(--accent-yellow);
          color: #0d1117;
        }
        .btn-warning:hover:not(:disabled) {
          background: #e6b02e;
        }
        .btn-critical {
          background: var(--bg-tertiary);
          color: var(--accent-red);
          border: 1px solid var(--accent-red);
        }
        .btn-critical:hover:not(:disabled) {
          background: rgba(248, 81, 73, 0.1);
        }
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 12px;
          padding: 16px 20px 20px;
        }
        .stat {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px;
          background: var(--bg-tertiary);
          border-radius: var(--radius-md);
        }
        .stat-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
        }
        .stat-icon.activity { background: rgba(88, 166, 255, 0.15); color: var(--accent-primary); }
        .stat-icon.memory { background: rgba(63, 185, 80, 0.15); color: var(--accent-green); }
        .stat-icon.cpu { background: rgba(210, 153, 34, 0.15); color: var(--accent-yellow); }
        .stat-icon.uptime { background: rgba(163, 113, 247, 0.15); color: var(--accent-purple); }
        .stat-content {
          display: flex;
          flex-direction: column;
        }
        .stat-value {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .stat-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .config-grid {
          padding: 16px 20px 20px;
        }
        .config-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: var(--radius-md);
          transition: background var(--transition);
        }
        .config-item:hover {
          background: var(--bg-hover);
        }
        .config-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          border-radius: var(--radius-sm);
          background: var(--bg-tertiary);
          color: var(--text-secondary);
        }
        .config-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .config-label {
          font-size: 11px;
          color: var(--text-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .config-value {
          font-size: 13px;
          color: var(--text-primary);
          font-family: 'JetBrains Mono', monospace;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .quick-actions {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
          padding: 16px 20px 20px;
        }
        .action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 16px 12px;
          border-radius: var(--radius-md);
          background: var(--bg-tertiary);
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
          transition: all var(--transition);
        }
        .action-btn:hover {
          background: var(--bg-hover);
          color: var(--accent-primary);
          border-color: var(--accent-primary);
          text-decoration: none;
        }
        .action-btn svg {
          color: var(--text-secondary);
          transition: color var(--transition);
        }
        .action-btn:hover svg {
          color: var(--accent-primary);
        }
        .dashboard-loading {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--text-muted);
        }
      `}</style>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  if (days > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}