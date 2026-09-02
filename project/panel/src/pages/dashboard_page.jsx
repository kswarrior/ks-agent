import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setServerStatus, setPlayers, setFiles, setLoadingFiles, addConsoleLog } from '../types.js'
import { apiFetch, openWebSocket } from '../api.jsx'

export function DashboardPage() {
  const dispatch = useDispatch()
  const serverStatus = useSelector((s) => s.serverStatus)
  const files = useSelector((s) => s.files)
  const players = useSelector((s) => s.players)
  const isLoadingFiles = useSelector((s) => s.isLoadingFiles)
  const wsRef = useRef(null)

  // Load initial state
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const status = await apiFetch('/server/status')
        if (cancelled) return
        dispatch(setServerStatus(status))
        const playersData = await apiFetch('/players')
        if (!cancelled) dispatch(setPlayers(playersData.players || []))
        const filesResult = await apiFetch('/files')
        if (!cancelled) dispatch(setFiles(filesResult.items || []))
      } catch (e) {
        console.warn('Dashboard load error', e)
      } finally {
        if (!cancelled) dispatch(setLoadingFiles(false))
      }
    })()

    // Open WS for live player updates
    wsRef.current = openWebSocket({
      onMessage: (data) => {
        if (data.type === 'players') {
          dispatch(setPlayers(data.players || []))
        } else if (data.type === 'status') {
          dispatch(setServerStatus(data.status))
        } else if (data.type === 'log') {
          dispatch(addConsoleLog(data.line))
        }
      },
    })

    return () => {
      cancelled = true
      if (wsRef.current) {
        try { wsRef.current.close() } catch {}
      }
    }
  }, [dispatch])

  // Periodically refresh players and status
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const [status, playersData] = await Promise.all([
          apiFetch('/server/status'),
          apiFetch('/players'),
        ])
        dispatch(setServerStatus(status))
        dispatch(setPlayers(playersData.players || []))
      } catch {}
    }, 5000)
    return () => clearInterval(id)
  }, [dispatch])

  const handleStart = async () => {
    try {
      const result = await apiFetch('/server/start', { method: 'POST', body: {} })
      dispatch(setServerStatus(result))
    } catch (e) {
      alert('Start failed: ' + e.message)
    }
  }

  const handleStop = async () => {
    try {
      const result = await apiFetch('/server/stop', { method: 'POST', body: {} })
      dispatch(setServerStatus(result))
    } catch (e) {
      alert('Stop failed: ' + e.message)
    }
  }

  const handleRestart = async () => {
    try {
      const result = await apiFetch('/server/restart', { method: 'POST', body: {} })
      dispatch(setServerStatus(result))
    } catch (e) {
      alert('Restart failed: ' + e.message)
    }
  }

  const isRunning = !!serverStatus?.running
  const stateClass = isRunning ? 'online' : 'offline'

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="subtitle">Server overview & quick controls</p>
      </header>

      <div className="dashboard-grid">
        <div className="card status-card">
          <h2>Server Status</h2>
          <div className={'status-indicator ' + stateClass}>
            <span className="dot" />
            <span>{serverStatus?.state || 'unknown'}</span>
          </div>
          <dl className="kv">
            <dt>Uptime</dt>
            <dd>{serverStatus?.uptimeMs ? Math.round(serverStatus.uptimeMs / 1000 / 60) + ' min' : '—'}</dd>
            <dt>Players</dt>
            <dd>{serverStatus?.players || 0} / {serverStatus?.maxPlayers || 20}</dd>
            <dt>RAM</dt>
            <dd>{serverStatus?.memoryMB ? `${serverStatus.memoryMB} MB` : '—'}</dd>
            <dt>Version</dt>
            <dd>{serverStatus?.version || '—'}</dd>
            <dt>PID</dt>
            <dd>{serverStatus?.pid || '—'}</dd>
          </dl>
          <div className="actions">
            <button className="btn btn-primary" onClick={handleStart} disabled={isRunning}>▶ Start</button>
            <button className="btn btn-danger" onClick={handleStop} disabled={!isRunning}>■ Stop</button>
            <button className="btn" onClick={handleRestart} disabled={!isRunning}>↻ Restart</button>
          </div>
        </div>

        <div className="card">
          <h2>Players Online ({players.length})</h2>
          {players.length === 0 ? (
            <p className="muted">No players online</p>
          ) : (
            <ul className="list">
              {players.map((p) => (
                <li key={p.name}>
                  <span className="player-dot" />
                  <span className="player-name">{p.name}</span>
                  {p.uptimeMs && (
                    <span className="muted">
                      joined {Math.round(p.uptimeMs / 1000 / 60)} min ago
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <h2>Server Files</h2>
          {isLoadingFiles ? (
            <p className="muted">Loading...</p>
          ) : files.length === 0 ? (
            <p className="muted">No files found</p>
          ) : (
            <ul className="list">
              {files.slice(0, 12).map((f) => (
                <li key={f.name}>
                  <span className={f.isDirectory ? 'icon-dir' : 'icon-file'}>
                    {f.isDirectory ? '📁' : '📄'}
                  </span>
                  <span className="file-name">{f.name}</span>
                  {!f.isDirectory && f.size != null && (
                    <span className="muted">{f.size} bytes</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
