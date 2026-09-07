import { useState, useEffect, useCallback } from 'react'
import { Server, BackendStatus, BackendConsole, ConsoleCommand, Player, PanelState } from './types'

const SINGLE_SERVER: Server = {
  id: 'minecraft-1',
  name: 'Survival Hub',
  host: 'localhost',
  port: 25565,
  rcon_port: 25575,
  password: '••••••',
  status: 'offline',
  max_players: 100,
  current_players: 0,
  motd: '§a§lSurvival §7Hub',
  version: '1.20.2',
  gamemode: 'Survival',
  difficulty: 'Hard',
}

const MOCK_PLAYERS: Player[] = [
  { uuid: '1', name: 'Notch', rank: 'admin', score: 1250, joined_at: '2h ago' },
  { uuid: '2', name: 'DanTDM', rank: 'mod', score: 980, joined_at: '3h ago' },
  { uuid: '3', name: 'Technoblade', rank: 'admin', score: 875, joined_at: '4h ago' },
  { uuid: '4', name: 'Dream', rank: 'mod', score: 720, joined_at: '5h ago' },
  { uuid: '5', name: 'GeorgeNotFound', rank: 'player', score: 450, joined_at: '6h ago' },
]

export function App() {
  const [server, setServer] = useState<Server>({ ...SINGLE_SERVER })
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null)
  const [consoleHistory, setConsoleHistory] = useState<ConsoleCommand[]>([])
  const [consoleOutput, setConsoleOutput] = useState<string[]>([])
  const [players, setPlayers] = useState<Player[]>(MOCK_PLAYERS)
  const [panelState, setPanelState] = useState<PanelState>({
    consoleInput: '',
    history: [],
    isRunning: false,
  })
  const [showSettings, setShowSettings] = useState(false)

  const API = 'http://127.0.0.1:3000'

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/server/status`)
      const data = await res.json()
      setBackendStatus(data)
      setServer(prev => ({
        ...prev,
        status: data.status === 'online' ? 'online' : 'offline',
        current_players: data.ready ? 67 : 0,
      }))
    } catch {
      setBackendStatus(null)
    }
  }, [])

  const fetchConsole = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/server/console`)
      const data: BackendConsole = await res.json()
      setConsoleOutput(data.output)
    } catch {}
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchConsole()
    const interval = setInterval(() => {
      fetchStatus()
      fetchConsole()
    }, 3000)
    return () => clearInterval(interval)
  }, [fetchStatus, fetchConsole])

  const toggleServer = useCallback(async () => {
    setPanelState(prev => ({ ...prev, isRunning: true }))
    try {
      const endpoint = server.status === 'online' ? '/api/server/stop' : '/api/server/start'
      await fetch(`${API}${endpoint}`)
      await fetchStatus()
    } finally {
      setPanelState(prev => ({ ...prev, isRunning: false }))
    }
  }, [server.status, fetchStatus])

  const restartServer = useCallback(async () => {
    setPanelState(prev => ({ ...prev, isRunning: true }))
    try {
      await fetch(`${API}/api/server/restart`)
      await fetchStatus()
    } finally {
      setPanelState(prev => ({ ...prev, isRunning: false }))
    }
  }, [fetchStatus])

  const sendCommand = useCallback((command: string) => {
    if (!command.trim()) return
    const trimmed = command.trim()
    setConsoleHistory(prev => [
      ...prev,
      { command: trimmed, timestamp: new Date().toISOString() },
    ])
    setPanelState(prev => ({ ...prev, consoleInput: '' }))
    // RCON send would go here
    console.log(`[RCON] Executed: ${trimmed}`)
  }, [])

  const onConsoleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') sendCommand(panelState.consoleInput)
  }, [panelState.consoleInput, sendCommand])

  const formatNumber = (num: number) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  const isOnline = server.status === 'online'

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">🛡️ KS Panel</div>
        </div>
        <nav className="sidebar-nav">
          <a href="#" className="sidebar-item active">
            <span>🏠</span> Dashboard
          </a>
          <a href="#" className="sidebar-item">
            <span>🖥️</span> Servers
          </a>
          <a href="#" className="sidebar-item">
            <span>👥</span> Players
          </a>
          <a href="#" className="sidebar-item">
            <span>⚙️</span> Console
          </a>
          <a href="#" className="sidebar-item">
            <span>📊</span> Analytics
          </a>
          <a href="#" className="sidebar-item">
            <span>🔒</span> Security
          </a>
        </nav>
      </aside>
      
      <main className="main-content">
        <header className="header">
          <div className="header-left">
            <div>
              <h1 className="header-title">{server.name}</h1>
              <p className="header-subtitle">Single Server Management • {server.host}:{server.port}</p>
            </div>
          </div>
          <div className="header-actions">
            <button className="btn" onClick={() => setShowSettings(!showSettings)}>
              Settings
            </button>
          </div>
        </header>

      <section>
        <div className="card">
          <h2>{server.name}</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Status</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>
                  {server.status}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  {backendStatus?.message || 'Checking...'}
                </span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Players</div>
              <div style={{ fontSize: 18, fontWeight: 600, marginTop: 4 }}>
                {formatNumber(server.current_players)} / {formatNumber(server.max_players)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Version</div>
              <div style={{ fontWeight: 500, marginTop: 4 }}>{server.version}</div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>MOTD</div>
              <div style={{ fontWeight: 500, marginTop: 4 }}>{server.motd}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className={`btn ${isOnline ? '' : 'btn-primary'}`}
              onClick={toggleServer}
              disabled={panelState.isRunning}
            >
              {panelState.isRunning ? 'Working...' : isOnline ? 'Stop Server' : 'Start Server'}
            </button>
            <button className="btn btn-primary" onClick={restartServer} disabled={panelState.isRunning || !isOnline}>
              Restart
            </button>
            <button className="btn">View Logs</button>
          </div>
        </div>
      </section>

      {showSettings && (
        <section>
          <div className="card">
            <h2>Server Configuration</h2>
            <div className="table">
              <div className="table-header">
                <span>Property</span>
                <span>Value</span>
              </div>
              <div className="table-row">
                <span>Host</span>
                <span>{server.host}:{server.port}</span>
              </div>
              <div className="table-row">
                <span>RCON Port</span>
                <span>{server.rcon_port}</span>
              </div>
              <div className="table-row">
                <span>Game Mode</span>
                <span>{server.gamemode}</span>
              </div>
              <div className="table-row">
                <span>Difficulty</span>
                <span>{server.difficulty}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <div className="card">
          <h2>Console</h2>
          <div style={{ height: 200, overflow: 'auto', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 12, fontFamily: 'monospace', fontSize: 12 }}>
            {consoleOutput.length === 0 && <div style={{ color: 'var(--text-faint)' }}>No output yet...</div>}
            {consoleOutput.map((line, i) => (
              <div key={i} style={{ color: 'var(--text)' }}>&gt; {line}</div>
            ))}
            {consoleHistory.map((cmd, i) => (
              <div key={`cmd-${i}`} style={{ color: 'var(--primary)' }}>
                [{cmd.timestamp.split('T')[1].split('.')[0]}] {cmd.command}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="RCON command..."
              value={panelState.consoleInput}
              onChange={(e) => setPanelState(prev => ({ ...prev, consoleInput: e.target.value }))}
              onKeyDown={onConsoleKeyDown}
              disabled={!isOnline}
            />
            <button className="btn btn-primary" onClick={() => sendCommand(panelState.consoleInput)} disabled={!isOnline}>
              Send
            </button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 24 }}>
        <div className="card">
          <h2>Online Players</h2>
          <div className="table">
            <div className="table-header">
              <span>Name</span>
              <span>Rank</span>
              <span>Score</span>
              <span>Joined</span>
            </div>
            {players.map((player) => (
              <div key={player.uuid} className="table-row">
                <span>{player.name}</span>
                <span style={{ color: player.rank === 'admin' ? '#dc2626' : player.rank === 'mod' ? '#f59e0b' : 'var(--text-dim)' }}>
                  {player.rank}
                </span>
                <span>{player.score}</span>
                <span>{player.joined_at}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
    </div>
  )
}
