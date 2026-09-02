// Centralized API + WebSocket helpers for the panel.

const API_BASE = '/api'
const WS_BASE = (() => {
  if (typeof window === 'undefined') return 'ws://localhost:3001/ws'
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
})()

function getToken() {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`
  const headers = { ...(options.headers || {}) }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  let body = options.body
  if (body && !(body instanceof FormData) && typeof body !== 'string') {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  }
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

export async function login(username, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  if (data?.token) {
    localStorage.setItem('token', data.token)
  }
  return data
}

export function logout() {
  localStorage.removeItem('token')
}

export function openWebSocket({ onMessage, onOpen, onClose, onError } = {}) {
  const token = getToken()
  if (!token) return null
  const url = `${WS_BASE}?token=${encodeURIComponent(token)}`
  const socket = new WebSocket(url)
  socket.onopen = (e) => onOpen && onOpen(e)
  socket.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      onMessage && onMessage(data)
    } catch {
      // ignore non-JSON
    }
  }
  socket.onclose = (e) => onClose && onClose(e)
  socket.onerror = (e) => onError && onError(e)
  return socket
}

// JWT decode helper (no dependency)
export function jwtDecode(token) {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return null
  }
}
