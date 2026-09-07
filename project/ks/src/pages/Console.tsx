import { useEffect, useState } from 'react'

export function Console() {
  const [output, setOutput] = useState<string[]>([])
  const [command, setCommand] = useState('')

  useEffect(() => {
    let active = true
    const fetchOutput = () => {
      fetch('http://127.0.0.1:3000/api/server/console')
        .then(r => r.json())
        .then(d => { if (active) setOutput(d.output || []) })
    }
    fetchOutput()
    const id = setInterval(fetchOutput, 3000)
    return () => { active = false; clearInterval(id) }
  }, [])

  const send = () => {
    if (!command.trim()) return
    // In real app, POST command
    console.log('Send:', command)
    setCommand('')
  }

  return (
    <div className="page">
      <h1>Console</h1>
      <p style={{ color: 'var(--text-dim)', marginTop: 4 }}>Live server console and RCON commands.</p>
      <div className="card" style={{ marginTop: 24 }}>
        <h2>Server Output</h2>
        <div style={{height:300,overflow:'auto',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:12,margin:'12px 0',fontFamily:'monospace',fontSize:12}}>
          {output.length === 0 && <div style={{ color: 'var(--text-faint)' }}>No output yet...</div>}
          {output.map((line,i)=><div key={i}>&gt; {line}</div>)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input className="input" placeholder="RCON command..." value={command} onChange={e => setCommand(e.target.value)} onKeyDown={e => e.key==='Enter' && send()} />
          <button className="btn btn-primary" onClick={send}>Send</button>
        </div>
      </div>
    </div>
  )
}
