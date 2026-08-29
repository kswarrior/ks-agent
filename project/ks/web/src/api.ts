const API_BASE = '/api'
const WS_URL = 'ws://127.0.0.1:3456/ws'

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const configApi = {
  get: () => api<import('./types').ServerConfig>('/config'),
  update: (cfg: Partial<import('./types').ServerConfig>) => 
    api<import('./types').ServerConfig>('/config', { method: 'POST', body: JSON.stringify(cfg) })
}

export const serverApi = {
  start: () => api<{ success: boolean; running: boolean }>('/server/start', { method: 'POST' }),
  stop: () => api<{ success: boolean; running: boolean }>('/server/stop', { method: 'POST' }),
  restart: () => api<{ success: boolean }>('/server/restart', { method: 'POST' }),
  kill: () => api<{ success: boolean; running: boolean }>('/server/kill', { method: 'POST' }),
  sendCommand: (command: string) => 
    api<{ success: boolean }>('/console/command', { method: 'POST', body: JSON.stringify({ command }) }),
  getStats: () => api<import('./types').ServerStats>('/stats'),
  getConsole: () => api<{ buffer: string[] }>('/console')
}

export const filesApi = {
  list: () => api<{ files: import('./types').FileNode[] }>('/files'),
  read: (path: string) => fetch(`${API_BASE}/files/${encodeURIComponent(path)}`).then(r => r.text()),
  write: (path: string, content: string) => 
    api<{ success: boolean }>('/files', { method: 'POST', body: JSON.stringify({ path, content }) }),
  delete: (path: string) => 
    api<{ success: boolean }>(`/files/${encodeURIComponent(path)}`, { method: 'DELETE' }),
  upload: (file: File, targetPath: string) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('path', targetPath)
    return fetch(`${API_BASE}/files/upload`, { method: 'POST', body: formData }).then(r => r.json())
  },
  download: (path: string) => `${API_BASE}/files/download/${encodeURIComponent(path)}`
}

export function createConsoleWebSocket(onMessage: (msg: import('./types').ConsoleLine) => void) {
  const ws = new WebSocket(WS_URL)
  ws.onmessage = (event) => {
    try {
      onMessage(JSON.parse(event.data))
    } catch (e) {
      console.error('WS parse error', e)
    }
  }
  ws.onerror = (err) => console.error('WS error', err)
  return ws
}

export async function checkHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`)
    return res.ok
  } catch {
    return false
  }
}