import { useEffect, useState } from 'react'

export function Console() {
  const [output, setOutput] = useState<string[]>([])

  useEffect(() => {
    fetch('http://127.0.0.1:3000/api/server/console')
      .then(r => r.json())
      .then(d => setOutput(d.output || []))
  }, [])

  return (
    <div className="card">
      <h2>Console</h2>
      <div style={{height:200,overflow:'auto',background:'var(--surface-2)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:12,marginBottom:12,fontFamily:'monospace',fontSize:12}}>
        {output.map((line,i)=><div key={i}> {line}</div>)}
      </div>
    </div>
  )
}
