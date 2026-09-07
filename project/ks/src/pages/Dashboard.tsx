import { Server } from '../types'

export function Dashboard({ server }: { server: Server }) {
  const isOnline = server.status === 'online'
  const formatNumber = (n: number) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return (
    <div className="page">
      <h1>{server.name}</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 4 }}>Single Server Management • {server.host}:{server.port}</p>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>Overview</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Status</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{server.status}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Players</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{formatNumber(server.current_players)} / {formatNumber(server.max_players)}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Version</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{server.version}</div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>MOTD</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{server.motd}</div>
          </div>
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <span className={`badge ${isOnline ? 'badge-online' : 'badge-offline'}`}>{server.status}</span>
        </div>
      </div>
    </div>
  )
}
