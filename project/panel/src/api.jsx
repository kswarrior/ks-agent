import { useEffect, useState } from 'react'

const API_BASE = '/api'
const WS_BASE = 'ws://localhost:3001/ws'

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`
  const headers = {}
  const token = localStorage.getItem('token')
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
  }
  const opts = {
    method: options.method || 'GET',
    headers,
    body: options.body,
  }
  const res = await fetch(url, opts)
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('token') || null)
  const [user, setUser] = useState(null)

  useEffect(() => {
    if (token) {
      try {
        const payload = jwtDecode(token)
        setUser({ sub: payload.sub, role: payload.role })
      } catch {}
    } else {
      setUser(null)
    }
  }, [token])

  const login = (tok) => {
    setToken(tok)
    localStorage.setItem('token', tok)
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('token')
  }

  return { token, user, login, logout }
}

export function useWebSocket() {
  const [ws, setWs] = useState(null)
  const [connected, setConnected] = useState(false)
  const [logs, setLogs] = useState([])
  const [playerList, setPlayerList] = useState([])

  useEffect(() => {
    if (!token) return

    const ws = new WS_BASE + `?token=${token}`
    const socket = new WebSocket(ws)

    socket.onopen = () => {
      setWs(socket)
      setConnected(true)
    }

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'log') {
          setLogs((prev) => {
            const newLogs = [...prev, data.line].filter(
              (l, idx) => idx >= prev.length ? true : l !== prev[prev.length - 1]
            )
            return newLogs.slice(-100)
          })
        } else if (data.type === 'log-buffer') {
          setLogs(data.lines)
        } else if (data.type === 'players') {
          setPlayerList(data.players)
        }
      } catch {}
    }

    socket.onclose = () => {
      setConnected(false)
      setWs(null)
    }

    socket.onerror = (err) => {
      console.error('WS error', err)
    }

    return () => {
      socket.close()
    }
  }, [token])

  return { ws, connected, logs, playerList }
}

// JWT decode helper (no dependency)
function jwtDecode(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}