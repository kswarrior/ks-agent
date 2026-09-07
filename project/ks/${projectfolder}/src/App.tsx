import React, { useState, useEffect, useCallback } from 'react'
import { ServerStatus } from '../types/server'
import { Server, PanelState, ConsoleCommand } from '../types'
import { ServersTable } from './ServersTable'
import './styles.css'

interface AppProps {
  initialServers?: Server[]
}

export const App: React.FC<AppProps> = ({ initialServers = [] }) => {
  const [servers, setServers] = useState<Server[]>(initialServers)
  const [panelState, setPanelState] = useState<PanelState>({
    servers,
    selectedServer: null,
    consoleInput: '',
    isConnecting: false,
  })

  // Fetch server list from API
  useEffect(() => {
    fetchServers()
  }, [])

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch('/api/server/list')
      if (!res.ok) throw new Error('Failed to fetch servers')
      const data = await res.json()
      setServers(data.servers || [])
    } catch (err) {
      console.error('Failed to fetch servers:', err)
    }
  }, [])

  // Start server
  const handleStart = useCallback(async (id: string) => {
    try {
      setPanelState(prev => ({ ...prev, isConnecting: true }))
      const res = await fetch(`/api/server/start/${id}`, { method: 'POST' })
      const data = await res.json()
      setPanelState(prev => ({ ...prev, isConnecting: false }))
      if (res.ok) {
        fetchServers()
        // Show success - in a real UI we'd use a toast
        alert(data.message || 'Server started successfully')
      } else {
        alert(data.message || 'Failed to start server')
      }
    } catch (err) {
      setPanelState(prev => ({ ...prev, isConnecting: false }))
      console.error('Start error:', err)
      alert('Failed to start server')
    }
  }, [fetchServers])

  // Stop server
  const handleStop = useCallback(async (id: string) => {
    try {
      setPanelState(prev => ({ ...prev, isConnecting: true }))
      const res = await fetch(`/api/server/stop/${id}`, { method: 'POST' })
      const data = await res.json()
      setPanelState(prev => ({ ...prev, isConnecting: false }))
      if (res.ok) {
        fetchServers()
        alert(data.message || 'Server stopped successfully')
      } else {
        alert(data.message || 'Failed to stop server')
      }
    } catch (err) {
      setPanelState(prev => ({ ...prev, isConnecting: false }))
      console.error('Stop error:', err)
      alert('Failed to stop server')
    }
  }, [fetchServers])

  // Restart server
  const handleRestart = useCallback(async (id: string) => {
    try {
      setPanelState(prev => ({ ...prev, isConnecting: true }))
      const res = await fetch(`/api/server/restart/${id}`, { method: 'POST' })
      const data = await res.json()
      setPanelState(prev => ({ ...prev, isConnecting: false }))
      if (res.ok) {
        fetchServers()
        alert(data.message || 'Server restarted successfully')
      } else {
        alert(data.message || 'Failed to restart server')
      }
    } catch (err) {
      setPanelState(prev => ({ ...prev, isConnecting: false }))
      console.error('Restart error:', err)
      alert('Failed to restart server')
    }
  }, [fetchServers])

  // Get server status
  const handleStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/server/status/${id}`)
      const data = await res.json()
      return data
    } catch (err) {
      console.error('Status error:', err)
      return { status: 'offline', ready: false, message: 'Error checking status' }
    }
  }, [])

  // Send console command
  const handleConsole = useCallback(async (id: string, command: string) => {
    try {
      const res = await fetch(`/api/server/console/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      })
      const data = await res.json()
      return data
    } catch (err) {
      console.error('Console error:', err)
      return { output: ['Error sending command'] }
    }
  }, [])

  // Handle input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPanelState(prev => ({ ...prev, consoleInput: e.target.value }))
  }, [])

  // Send console command button
  const handleSendCommand = useCallback(async () => {
    const { consoleInput, ...rest } = panelState
    if (!consoleInput.trim()) return
    // Send to selected server or broadcast
    if (panelState.selectedServer) {
      await handleConsole(panelState.selectedServer, consoleInput)
    }
    setPanelState(prev => ({ ...prev, consoleInput: '', isConnecting: false }))
  }, [panelState.selectedServer, handleConsole])

  return (
    <div className="container">
      <header className="header">
        <div className="nav">
          <div className="logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              <circle cx="12" cy="19" r="10"/>
            </svg>
            Minecraft Panel
          </div>
          <div className="nav-links">
            <a href="#" className="nav-link">Servers</a>
            <a href="#" className="nav-link">Tools</a>
            <a href="#" className="nav-link">Settings</a>
          </div>
        </div>
      </header>

      <main>
        <section className="section">
          <div className="card">
            <h2 className="mb-4">Server Management</h2>
            <ServersTable
              servers={servers}
              onToggle={/* handle toggle */}
            />
          </div>
        </section>

        {/* Server Tools Section */}
        <section className="section" id="tools">
          <div className="card">
            <h2 className="mb-4">Server Tools</h2>
            <div className="row g-3">
              {/* Start Server Button */}
              <div className="col-md-4">
                <div className="text-center">
                  <button
                    className="btn btn-primary w-100"
                    onClick={() => handleStart(servers[0]?.id || 'server-1')}
                    disabled={panelState.isConnecting}
                  >
                    {panelState.isConnecting ? 'Starting...' : 'Start Server'}
                  </button>
                </div>
              </div>

              {/* Stop Server Button */}
              <div className="col-md-4">
                <div className="text-center">
                  <button
                    className="btn btn-danger w-100"
                    onClick={() => handleStop(servers[0]?.id || 'server-1')}
                    disabled={panelState.isConnecting}
                  >
                    {panelState.isConnecting ? 'Stopping...' : 'Stop Server'}
                  </button>
                </div>
              </div>

              {/* Restart Server Button */}
              <div className="col-md-4">
                <div className="text-center">
                  <button
                    className="btn btn-success w-100"
                    onClick={() => handleRestart(servers[0]?.id || 'server-1')}
                    disabled={panelState.isConnecting}
                  >
                    {panelState.isConnecting ? 'Restarting...' : 'Restart Server'}
                  </button>
                </div>
              </div>
            </div>

            {/* Server Status Card */}
            {servers.length > 0 && (
              <div className="mt-4 p-3 bg-primary text-white rounded" style={{ marginTop: '16px' }}>
                <h4 className="mb-2">Server Status</h4>
                <div className="row">
                  <div className="col-6">
                    <small>Status</small>
                    <span className="badge bg-success">{servers[0]?.status || 'offline'}</span>
                  </div>
                  <div className="col-6">
                    <small>Players</small>
                    <span>{servers[0]?.players || 0}/{servers[0]?.maxPlayers || 20}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Console Section */}
            <div className="mt-4">
              <h4>Console</h4>
              <div className="row g-2">
                <div className="col-8">
                  <input
                    className="input"
                    type="text"
                    value={panelState.consoleInput}
                    onChange={handleInputChange}
                    placeholder="Type command (e.g. /time set day)..."
                    disabled={panelState.isConnecting}
                  />
                </div>
                <div className="col-2">
                  <button
                    className="btn btn-primary"
                    onClick={handleSendCommand}
                    disabled={panelState.isConnecting || !panelState.consoleInput.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Minecraft Tools Section */}
        <section className="section" id="minecraft-tools">
          <div className="card">
            <h2 className="mb-4">Minecraft Tools</h2>
            <div className="row g-4">
              {/* Seed Generator */}
              <div className="col-md-4">
                <div className="p-3 border rounded" style={{ borderColor: var(--border) }}>
                  <h5>Seed Info</h5>
                  <p className="text-muted small">Enter a seed to get biome information</p>
                  <button className="btn btn-sm btn-outline-primary w-100 mt-2">Generate</button>
                </div>
              </div>

              {/* Biome Map */}
              <div className="col-md-4">
                <div className="p-3 border rounded" style={{ borderColor: var(--border) }}>
                  <h5>Biome Lookup</h5>
                  <p className="text-muted small">Find biomes at coordinates</p>
                  <button className="btn btn-sm btn-outline-primary w-100 mt-2">Lookup</button>
                </div>
              </div>

              {/* Enchantment Calculator */}
              <div className="col-md-4">
                <div className="p-3 border rounded" style={{ borderColor: var(--border) }}>
                  <h5>Enchanter</h5>
                  <p className="text-muted small">Calculate enchantment chances</p>
                  <button className="btn btn-sm btn-outline-primary w-100 mt-2">Calculate</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Players Section */}
        <section className="section" id="players">
          <div className="card">
            <h2 className="mb-4">Recent Players</h2>
            <div className="table-responsive">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Rank</th>
                    <th>Playtime</th>
                    <th>Last Seen</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Notch</td>
                    <td>Founder</td>
                    <td>12,456h</td>
                    <td>2024-01-15</td>
                  </tr>
                  <tr>
                    <td>Digit</td>
                    <td>Admin</td>
                    <td>8,234h</td>
                    <td>2024-01-14</td>
                  </tr>
                  <tr>
                    <td>Steve</td>
                    <td>VIP</td>
                    <td>5,123h</td>
                    <td>2024-01-13</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-auto py-3" style={{ borderTop: `1px solid var(--border)`, color: var(--text-dim), fontSize: '12px' }}>
        <div className="container">
          <span>Minecraft Panel v1.0.0 • Made with React + Hono</span>
        </div>
      </footer>
    </div>
  )
}