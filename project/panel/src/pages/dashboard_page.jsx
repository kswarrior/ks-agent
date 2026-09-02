import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setServerStatus, setPlayers, setFiles, setLoadingFiles } from '../store/types'
import { apiFetch } from '../api'
import { useWebSocket } from '../api'

export function DashboardPage() {
  const dispatch = useDispatch()
  const { serverStatus, isLoadingFiles, files, players } = useSelector((s) => s)
  const { connected, logs } = useWebSocket()

  // Load initial state
  useEffect(() => {
    ;(async () => {
      try {
        const status = await apiFetch('/server/status')
        dispatch(setServerStatus(status))
        dispatch(setPlayers(await apiFetch('/players')))
        const filesResult = await apiFetch('/files')
        dispatch(setFiles(filesResult.items || []))
        dispatch(setLoadingFiles(false))
      } catch (e) {
        dispatch(setLoadingFiles(false))
      }
    })()
  }, [dispatch])

  // WebSocket sync for players + console logs
  useEffect(() => {
    if (connected) {
      ;(async () => {
        const p = await apiFetch('/players')
        dispatch(setPlayers(p.players))
      })()
    }
  }, [connected, dispatch])

  const handleStart = async () => {
    dispatch(setLoadingFiles(true))
    try {
      const result = await apiFetch('/server/start', { method: 'POST' })
      dispatch(setServerStatus(result))
    } catch (e) {
      // ignore - status update will come via WS
    }
  }

  const handleStop = async () => {
    dispatch(setLoadingFiles(true))
    try {
      await apiFetch('/server/stop', { method: 'POST' })
      dispatch(setServerStatus({ state: 'stopped', running: false, pid: null }))
    } catch (e) {}
  }

  const handleRestart = async () => {
    dispatch(setLoadingFiles(true))
    try {
      await apiFetch('/server/restart', { method: 'POST' })
      dispatch(setServerStatus({ state: 'stopped', running: false, pid: null }))
    } catch (e) {}
  }

  return (
    <div className="dashboard">
      <h1>Dashboard</h1>

      <div className="status-card">
        <h2>Server Status</h2>
        <div className={"status-indicator " + (serverStatus.state === 'running' ? 'online' : 'offline')}>
          {serverStatus.state}
        </div>
        <div>
          <p>Uptime: {serverStatus.uptimeMs ? Math.round(serverStatus.uptimeMs / 1000 / 60) + ' min' : '—'}</p>
          <p>Players: {serverStatus.players || 0}/{serverStatus.maxPlayers || 20}</p>
          <p>RAM: {serverStatus.memoryMB} MB</p>
        </div>
        <button className="btn btn-primary" onClick={handleStart} disabled={serverStatus.running}>
          {serverStatus.running ? 'Running...' : 'Start Server'}
        </button>
        <button className="btn" onClick={handleStop} disabled={!serverStatus.running}>
          Stop
        </button>
        <button className="btn" onClick={handleRestart} disabled={!serverStatus.running}>
          Restart
        </button>
      </div>

      <PlayersSection players={players} />
      <FilesSection files={files} isLoading={isLoadingFiles} />
    </div>
  )
}

function PlayersSection({ players }) {
  return (
    <div className="card">
      <h2>Players Online ({players.length})</h2>
      <ul>
        {players.map((p) => (
          <li key={p.name}>{p.name}{' '}{p.uptimeMs && <span title="joined {(p.uptimeMs / 1000 / 60).toFixed(1)} min ago">({Math.round(p.uptimeMs / 1000 / 60)} min)</span>}</li>
        ))}
        {players.length === 0 && <li>No players online</li>}
      </ul>
    </div>
  )
}

function FilesSection({ files, isLoading }) {
  return (
    <div className="card">
      <h2>Server Files</h2>
      {isLoading ? (
        <p>Loading...</p>
      ) : files.length === 0 ? (
        <p>No files found</p>
      ) : (
        <ul>
          {files.map((f) => (
            <li key={f.name}>
              <span>{f.name}</span>
              {f.isDirectory ? '' : <span title={String(f.size)}>bytes</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}