import { useEffect, useState } from 'react'
import { Server } from '../types'

export function Servers() {
  const [servers, setServers] = useState<Server[]>([])

  useEffect(() => {
    fetch('http://127.0.0.1:3000/api/servers')
      .then(r => r.json())
      .then(setServers)
      .catch(() => setServers([]))
  }, [])

  return (
    <div className="card">
      <h2>Servers</h2>
      <div className="table">
        <div className="table-header">
          <span>Name</span>
          <span>Status</span>
          <span>Players</span>
          <span>Version</span>
        </div>
        {servers.map(s => (
          <div key={s.id} className="table-row">
            <span>{s.name}</span>
            <span>{s.status}</span>
            <span>{s.current_players}/{s.max_players}</span>
            <span>{s.version}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
