import type { ServerInfo } from '../types';

interface DashboardProps {
  server?: ServerInfo;
}

export function Dashboard({ server }: DashboardProps) {
  const defaultServer: ServerInfo = {
    name: 'Minecraft Server',
    version: '1.20.1',
    motd: 'Welcome to the server!',
    maxPlayers: 20,
    onlinePlayers: 0,
    tps: 20,
    uptime: '0 days 0 hours',
    memoryUsed: '0.5 GB',
    memoryMax: '4 GB',
    isRunning: false,
  };

  const s = server || defaultServer;

  return (
    <div className="grid grid-2">
      {/* Server Status Card */}
      <div className="card">
        <h2>Server Status</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '1rem' }}>{s.name}</h3>
              <span className="badge" style={{ padding: '4px 8px', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', fontWeight: 500, backgroundColor: s.isRunning ? 'var(--success)' : 'var(--danger)', color: 'white' }}>
                {s.isRunning ? 'Online' : 'Offline'}
              </span>
            </div>
            <p style={{ color: 'var(--text-dim)', margin: '0 0 8px 0' }}>{s.motd}</p>
            <p style={{ color: 'var(--text-dim)', margin: '0 0 8px 0', fontSize: '0.85rem' }}>Version: {s.version}</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="card">
        <h2>Quick Stats</h2>
        <div className="grid" style={{ gap: '12px' }}>
          <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginBottom: '4px' }}>TPS</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{s.tps}</div>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginBottom: '4px' }}>Players</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{s.onlinePlayers} / {s.maxPlayers}</div>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginBottom: '4px' }}>Uptime</div>
            <div style={{ fontSize: '1rem', fontWeight: 500 }}>{s.uptime}</div>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 'var(--radius)' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginBottom: '4px' }}>Memory</div>
            <div style={{ fontSize: '1rem', fontWeight: 500 }}>{s.memoryUsed} / {s.memoryMax}</div>
          </div>
        </div>
      </div>
    </div>
  );
}