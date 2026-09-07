import { useEffect, useState } from 'react'

export function Analytics() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetch('http://127.0.0.1:3000/api/analytics')
      .then(r => r.json())
      .then(d => { if (active) { setData(d); setLoading(false) } })
      .catch(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  if (loading) return <div className="page"><h1>Analytics</h1><p>Loading...</p></div>

  return (
    <div className="page">
      <h1>Analytics</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 4 }}>Server performance and usage metrics.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <h2>Overview</h2>
        <div className="table" style={{ marginTop: 12 }}>
          <div className="table-row"><span>Total Players</span><span>{data?.total_players ?? 0}</span></div>
          <div className="table-row"><span>Avg Uptime</span><span>{data?.avg_uptime ?? 'N/A'}</span></div>
          <div className="table-row"><span>Peak Players</span><span>{data?.peak_players ?? 0}</span></div>
          <div className="table-row"><span>CPU Usage</span><span>{data?.cpu_usage ?? 0}%</span></div>
          <div className="table-row"><span>Memory Usage</span><span>{data?.memory_usage ?? 0}%</span></div>
        </div>
      </div>
    </div>
  )
}
