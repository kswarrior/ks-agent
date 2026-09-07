import { useEffect, useState } from 'react'

export function Analytics() {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    fetch('http://127.0.0.1:3000/api/analytics')
      .then(r => r.json())
      .then(setData)
  }, [])
  return (
    <div className="card">
      <h2>Analytics</h2>
      {!data ? (
        <p>Loading...</p>
      ) : (
        <div className="table">
          <div className="table-row"><span>Total Players</span><span>{data.total_players}</span></div>
          <div className="table-row"><span>Avg Uptime</span><span>{data.avg_uptime}</span></div>
          <div className="table-row"><span>Peak Players</span><span>{data.peak_players}</span></div>
          <div className="table-row"><span>CPU Usage</span><span>{data.cpu_usage}%</span></div>
          <div className="table-row"><span>Memory Usage</span><span>{data.memory_usage}%</span></div>
        </div>
      )}
    </div>
  )
}
