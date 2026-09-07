import { useEffect, useState } from 'react'
import { Player } from '../types'

export function Players() {
  const [players, setPlayers] = useState<Player[]>([])
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let active = true
    const fetchPlayers = () => {
      fetch('http://127.0.0.1:3000/api/players')
        .then(r => r.json())
        .then(data => { if (active) setPlayers(data) })
        .catch(() => { if (active) setPlayers([]) })
    }
    fetchPlayers()
    const id = setInterval(fetchPlayers, 5000)
    return () => { active = false; clearInterval(id) }
  }, [])

  const filtered = players.filter(p => p.name.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="page">
      <h1>Players</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 4 }}>View and manage online players.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <h2>Online Players</h2>
        <input className="input" placeholder="Filter by name..." value={filter} onChange={e => setFilter(e.target.value)} style={{ margin: '12px 0' }} />
        <div className="table">
          <div className="table-header">
            <span>Name</span>
            <span>Rank</span>
            <span>Score</span>
            <span>Joined</span>
          </div>
          {filtered.map(p => (
            <div key={p.uuid} className="table-row">
              <span>{p.name}</span>
              <span style={{ color: p.rank === 'admin' ? '#dc2626' : p.rank === 'mod' ? '#f59e0b' : 'var(--text-dim)' }}>{p.rank}</span>
              <span>{p.score}</span>
              <span>{p.joined_at}</span>
            </div>
          ))}
          {filtered.length === 0 && <div className="table-row"><span colSpan={4}>No players</span></div>}
        </div>
      </div>
    </div>
  )
}
