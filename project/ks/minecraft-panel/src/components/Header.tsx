export function Header() {
  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '1.5rem', fontWeight: 600 }}>Minecraft Panel</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button className="btn-primary">Start Server</button>
      </div>
    </header>
  );
}