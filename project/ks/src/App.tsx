import { useState, useEffect, useCallback } from 'react'
import { Server, ServerStatus, Player, PanelState } from './types'

// Mock server data - in production this would connect to a real backend
const MOCK_SERVERS: Server[] = [
  {
    id: '1',
    name: 'Survival Hub',
    host: 'play.survival.example',
    port: 25565,
    rcon_port: 25575,
    password: 'admin123',
    status: 'online',
    max_players: 100,
    current_players: 67,
    motd: '§a§lSurvival §7Hub - Coming Soon!',
    version: '1.20.2',
    gamemode: 'Survival',
    difficulty: 'Hard',
  },
  {
    id: '2',
    name: 'Creative Mode',
    host: 'creative.example',
    port: 25565,
    rcon_port: 25575,
    password: 'creative456',
    status: 'offline',
    max_players: 50,
    current_players: 0,
    motd: '§6§lCreative §7Mode Server',
    version: '1.20.2',
    gamemode: 'Creative',
    difficulty: 'Peaceful',
  },
  {
    id: '3',
    name: 'Mini Games',
    host: 'games.example',
    port: 25565,
    rcon_port: 25575,
    password: 'games789',
    status: 'online',
    max_players: 30,
    current_players: 12,
    motd: '§e§lMini §7Games - Parkour & PvP',
    version: '1.20.1',
    gamemode: 'MiniGames',
    difficulty: 'Normal',
  },
]

const MOCK_PLAYERS: Player[] = [
  { uuid: '1', name: 'Notch', rank: 'admin', score: 1250, joined_at: '2h ago' },
  { uuid: '2', name: 'DanTDM', rank: 'mod', score: 980, joined_at: '3h ago' },
  { uuid: '3', name: 'Technoblade', rank: 'admin', score: 875, joined_at: '4h ago' },
  { uuid: '4', name: 'Dream', rank: 'mod', score: 720, joined_at: '5h ago' },
  { uuid: '5', name: 'GeorgeNotFound', rank: 'player', score: 450, joined_at: '6h ago' },
]

export function App() {
  const [servers, setServers] = useState<Server[]>(MOCK_SERVERS)
  const [status, setStatus] = useState<ServerStatus | null>(null)
  const [consoleHistory, setConsoleHistory] = useState<ConsoleCommand[]>([])
  const [players, setPlayers] = useState<Player[]>(MOCK_PLAYERS)
  const [panelState, setPanelState] = useState<PanelState>({
    selectedServer: null,
    consoleInput: '',
    history: [],
    isRunning: false,
  })

  // Connect to server status
  useEffect(() => {
    const updateStatus = () => {
      const server = servers.find(s => s.status === 'online')
      if (server && status?.online !== true) {
        setStatus({
          online: true,
          players_online: server.current_players,
          players_max: server.max_players,
          motd: server.motd,
          version: server.version,
          ping: Math.floor(Math.random() * 50) + 20,
        })
      } else if (!server && status?.online !== false) {
        setStatus(null)
      }
    }
    updateStatus()
    const interval = setInterval(updateStatus, 5000)
    return () => clearInterval(interval)
  }, [servers, status])

  // Send console command
  const sendCommand = useCallback((command: string) => {
    if (!command.trim()) return
    const trimmed = command.trim()
    setConsoleHistory(prev => [
      ...prev,
      { command: trimmed, timestamp: new Date().toISOString() },
    ])
    setPanelState(prev => ({ ...prev, consoleInput: '' }))

    // Simulate command execution
    console.log(`[RCON] Executed: ${trimmed}`)
  }, [])

  // Select server
  const selectServer = useCallback((id: string) => {
    setPanelState(prev => ({ ...prev, selectedServer: id }))
    const server = servers.find(s => s.id === id)
    if (server) {
      setStatus({
        online: server.status === 'online',
        players_online: server.current_players,
        players_max: server.max_players,
        motd: server.motd,
        version: server.version,
        ping: 20 + Math.floor(Math.random() * 80),
      })
    }
  }, [servers])

  // Connect/disconnect
  const toggleServer = useCallback(async (id: string) => {
    const server = servers.find(s => s.id === id)
    if (!server) return

    setPanelState(prev => ({ ...prev, isRunning: true }))

    try {
      // In production: actual RCON connection
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      const newStatus = server.status === 'online' ? 'stopping' : 'starting'
      setServers(prev =>
        prev.map(s =>
          s.id === id
            ? { ...s, status: newStatus, current_players: newStatus === 'starting' ? 0 : s.current_players }
            : s
        )
      )

      // Simulate completion
      setTimeout(() => {
        setServers(prev =>
          prev.map(s =>
            s.id === id
              ? { ...s, status: newStatus === 'starting' ? 'online' : 'offline', current_players: newStatus === 'starting' ? 20 : s.current_players }
              : s
        ))
        setPanelState(prev => ({ ...prev, isRunning: false }))
        updateStatus()
      }, 1000)
    } catch (err) {
      console.error('Server toggle error:', err)
      setPanelState(prev => ({ ...prev, isRunning: false }))
    }
  }, [])

  // Format number
  const formatNumber = (num: number) => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  // Console input handler
  const onConsoleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      sendCommand(panelState.consoleInput)
    }
  }, [panelState.consoleInput, sendCommand])

  return (
    <div className="page">
      <!-- Header -->
      <header className="header">
        <h1>🛡️ Minecraft Panel</h1>
        <p>Multi-Server Management & Tools</p>
      </header>

      <!-- Tabs -->
      <div className="tabs">
        <button className="tab active">Servers</button>
        <button className="tab">Console</button>
        <button className="tab">Players</button>
        <button className="tab">Tools</button>
      </div>

      <!-- Servers Card -->
      <section>
        <div className="card">
          <h2>Server Cluster</h2>

          <div className="table">
            <div className="table-header">
              <span>Name</span>
              <span>Status</span>
              <slot name="players">Players</slot>
              <slot name="version">Version</slot>
              <slot name="action">Action</slot>
            </div>

            {servers.map((server) => (
              <div key={server.id} className="table-row">
                <span className="table-cell">{server.name}</span>
                <span className="status-badge badge badge-{server.status === 'online' ? 'online' : 'offline'}">
                  {server.status}
                </span>
                <span className="table-cell">{formatNumber(server.current_players)}/{formatNumber(server.max_players)}</span>
                <span className="table-cell">{server.version}</span>
                <span className="table-cell">
                  <button
                    className="btn btn-primary"
                    onClick={() => selectServer(server.id)}
                  >
                    Manage
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Selected Server Details */}
        {panelState.selectedServer && (
          <div className="card" style={{ marginTop: 16 }}>
            <h2>Server Details: {panelState.selectedServer}</h2>
            <div className="table">
              <div className="table-header">
                <span>Property</span>
                <span>Value</span>
              </div>
              <div className="table-row">
                <span className="table-cell">Host</span>
                <span className="table-cell">{MOCK_SERVERS.find(s => s.id === panelState.selectedServer)?.host}</span>
              </div>
              <div className="table-row">
                <span className="table-cell">RCON Port</span>
                <span className="table-cell">{MOCK_SERVERS.find(s => s.id === panelState.selectedServer)?.rcon_port}</span>
              </div>
              <div className="table-row">
                <span className="table-cell">Password</span>
                <span className="table-cell">••••••</span>
              </div>
              <div className="table-row">
                <span className="table-cell">Max Players</span>
                <span className="table-cell">{MOCK_SERVERS.find(s => s.id === panelState.selectedServer)?.max_players}</span>
              </div>
            </div>
          </div>
        )}
      </section>

      <!-- Console Card -->
      <section style={{ marginTop: 24 }}>
        <div className="card">
          <h2>Console</h2>
          <div style={{ height: 200px, overflow: 'auto', marginBottom: 12 }}>
            {consoleHistory.map((cmd, i) => (
              <div key={i} style={{ fontFamily: 'monospace', fontSize: 12, color: var(--text-dim) }}>
                {cmd.timestamp.split('T')[1].split('.')[0]} — {cmd.command}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="input"
              placeholder="RCON command..."
              value={panelState.consoleInput}
              onChange={(e) =>
                setPanelState(prev => ({ ...prev, consoleInput: e.target.value }))
              }
              onKeyDown={onConsoleKeyDown}
            />
            <button
              className="btn btn-primary"
              onClick={() => sendCommand(panelState.consoleInput)}
            >
              Send
            </button>
          </div>
        </div>
      </section>

      <!-- Players Card -->
      <section style={{ marginTop: 24 }}>
        <div className="card">
          <h2>Online Players</h2>
          <div className="table">
            <div className="table-header">
              <span>Name</span>
              <span>Rank</span>
              <span>Score</span>
            </div>
            {players.map((player) => (
              <div key={player.uuid} className="table-row">
                <span className="table-cell">{player.name}</span>
                <span className="table-cell" style={{ color: player.rank === 'admin' ? '#dc2626' : '#f59e0b' }}>
                  {player.rank}
                </span>
                <span className="table-cell">{player.score}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <!-- Tools Card -->
      <section style={{ marginTop: 24 }}>
        <div className="card">
          <h2>Minecraft Tools</h2>
          <div className="table">
            <div className="table-header">
              <span>Tool</span>
              <span>Description</span>
            </div>
            <div className="table-row">
              <span className="table-cell">Seed Generator</span>
              <span className="table-cell">Generate world seeds</span>
            </div>
            <div className="table-row">
              <span className="table-cell">Biome Lookup</span>
              <span className="table-cell">Find biomes by coordinates</span>
            </div>
            <div className="table-row">
              <span className="table-cell">Enchantment Calc</span>
              <span className="table-cell">Calculate enchantment odds</span>
            </div>
            <div className="table-row">
              <span className="table-cell">UUID Finder</span>
              <span className="table-cell">Convert username to UUID</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}