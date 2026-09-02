import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { setPlayers } from '../types.js'
import { apiFetch } from '../api.jsx'

export function PlayersPage() {
  const dispatch = useDispatch()
  const players = useSelector((s) => s.players)
  const token = useSelector((s) => s.currentUser?.token)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await apiFetch('/players', { token })
        if (!cancelled && data?.players) dispatch(setPlayers(data.players))
      } catch (e) {
        console.warn('Failed to fetch players', e)
      }
    }
    load()
    const id = setInterval(load, 5000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [dispatch, token])

  return (
    <div className="page">
      <header className="page-header">
        <h1>Players</h1>
        <p className="subtitle">Online players (refreshes every 5s)</p>
      </header>
      <div className="card">
        {players.length === 0 ? (
          <p className="muted">No players online</p>
        ) : (
          <table className="players-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>First seen</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.name}>
                  <td>{p.name}</td>
                  <td>{p.firstSeen ? new Date(p.firstSeen).toLocaleString() : '—'}</td>
                  <td>{p.lastSeen ? new Date(p.lastSeen).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
