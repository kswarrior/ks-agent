import { useState } from 'react'

export function Security() {
  const [rules, setRules] = useState([
    { id: 1, name: 'Firewall', status: 'enabled' },
    { id: 2, name: 'RCON Password', status: 'set' },
    { id: 3, name: 'IP Whitelist', status: 'disabled' },
    { id: 4, name: '2FA', status: 'disabled' },
  ])

  const toggle = (id: number) => {
    setRules(rules.map(r => r.id===id ? { ...r, status: r.status === 'enabled' ? 'disabled' : 'enabled' } : r))
  }

  return (
    <div className="page">
      <h1>Security</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 4 }}>Manage server security settings and access controls.</p>

      <div className="card" style={{ marginTop: 24 }}>
        <h2>Access Control</h2>
        <div className="table" style={{ marginTop: 12 }}>
          <div className="table-header">
            <span>Feature</span>
            <span>Status</span>
            <span>Action</span>
          </div>
          {rules.map(r => (
            <div key={r.id} className="table-row">
              <span>{r.name}</span>
              <span><span className={`badge ${r.status === 'enabled' || r.status === 'set' ? 'badge-online' : 'badge-offline'}`}>{r.status}</span></span>
              <span>
                <button className="btn" onClick={() => toggle(r.id)}>Toggle</button>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
