import { useEffect, useState } from 'react';
type Server = { id: string; name: string; status: string; ram: string };
export default function App(){
  const [servers,setServers]=useState<Server[]>([]);
  useEffect(()=>{fetch('/api/servers').then(r=>r.json()).then(setServers);},[]);
  return (
    <div>
      <header className="header"><div className="logo">KS Panel • KS Warrior</div></header>
      <aside className="sidebar"><a className="active">Dashboard</a><a>Servers</a><a>Files</a><a>Backups</a><a>Settings</a></aside>
      <main className="main">
        <h1>Servers</h1>
        <div className="grid">
          {servers.map(s=>(
            <div key={s.id} className="card">
              <div style={{display:'flex',justifyContent:'space-between'}}>
                <strong>{s.name}</strong>
                <span className={`status ${s.status}`}>{s.status}</span>
              </div>
              <div style={{marginTop:8,color:'var(--text-dim)'}}>{s.ram}</div>
              <div style={{marginTop:12}}>
                <button className="btn btn-primary" onClick={()=>fetch(`/api/servers/${s.id}/status`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:s.status==='running'?'stop':'start'})}).then(()=>location.reload())}>{s.status==='running'?'Stop':'Start'}</button>
              </div>
            </div>
          ))}
        </div>
        <div className="card" style={{marginTop:24}}>
          <h3>Console</h3>
          <pre className="console">[KS Panel] Ready\nWaiting for output...</pre>
        </div>
      </main>
    </div>
  );
}
