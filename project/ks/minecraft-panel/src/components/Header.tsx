import type { ServerInfo } from '../types';

export function Header({ server, onStart, onStop }: { server: ServerInfo | null; onStart: () => Promise<void>; onStop: () => Promise<void> }) {
  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>Minecraft Panel</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button className="btn-primary" onClick={server?.isRunning ? onStop : onStart}>
          {server?.isRunning ? 'Stop Server' : 'Start Server'}
        </button>
      </div>
    </header>
  );
}