import { useEffect, useState } from 'react'
import { Server } from '../types'

export function Servers() {
  const [servers, setServers] = useState<Server[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const fetchServers = () => {
      fetch('http://127.0.0.1:3000/api/servers')
        .then(r => r.json())
        .then(data => { if (active) { setServers(data); setLoading(false) } })
        .catch(() => { if (active) { setServers([]); setLoading(false) } })
    }
    fetchServers()
    const id = setInterval(fetchServers, 5000)
    return () => { active = false; clearInterval(id) }
  }, [])

  if (loading) return <div className="card"><h2>Servers</h2><p>Loading...</p></div>

  return (
    <div className="page">
      <h1>Servers</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 4 }}>Manage all Minecraft servers in your fleet.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <h2>Server List</h2>
        <div className="table" style={{ marginTop: 12 }}>
          <div className="table-header">
            <span>Name</span>
            <span>Status</span>
            <span>Players</span>
            <span>Version</span>
            <span>Action</span>
          </div>
          {servers.map(s => (
            <div key={s.id} className="table-row">
              <span>{s.name}</span>
              <span><span className={`badge ${s.status === 'online' ? 'badge-online' : 'badge-offline'}`}>{s.status}</span></span>
              <span>{s.current_players}/{s.max_players}</span>
              <span>{s.version}</span>
              <span><button className="btn" onClick={() => alert(`Open ${s.name}`)}>Open</button></span>
            </div>
          ))}
          {servers.length === 0 && <div className="table-row"><span colSpan={5}>No servers found</span></div>}
        </div>
      </div>
    </div>
  )
}
