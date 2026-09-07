import { useEffect, useState } from 'react'
import { Player } from '../types'

export function Players() {
  const [players, setPlayers] = useState<Player[]>([])

  useEffect(() => {
    fetch('http://127.0.0.1:3000/api/players')
      .then(r => r.json())
      .then(setPlayers)
      .catch(() => setPlayers([]))
  }, [])

  return (
    <div className="card">
      <h2>Online Players</h2>
      <div className="table">
        <div className="table-header">
          <span>Name</span>
          <span>Rank</span>
          <span>Score</span>
          <span>Joined</span>
        </div>
        {players.map(p => (
          <div key={p.uuid} className="table-row">
            <span>{p.name}</span>
            <span>{p.rank}</span>
            <span>{p.score}</span>
            <span>{p.joined_at}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
