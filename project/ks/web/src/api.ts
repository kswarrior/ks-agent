import type { ServerStatus, ConsoleLine, FileNode, ServerConfig, ScheduledTask, Backup, APIResponse } from './types'

const API_BASE = '/api'

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export const api = {
  // Server status
  getStatus: () => request<ServerStatus>('/server/status'),
  startServer: () => request<{ success: boolean }>('/server/start', { method: 'POST' }),
  stopServer: () => request<{ success: boolean }>('/server/stop', { method: 'POST' }),
  restartServer: () => request<{ success: boolean }>('/server/restart', { method: 'POST' }),
  killServer: () => request<{ success: boolean }>('/server/kill', { method: 'POST' }),
  sendCommand: (command: string) => request<{ success: boolean }>('/server/command', {
    method: 'POST',
    body: JSON.stringify({ command }),
  }),

  // Console
  getConsole: (lines = 500) => request<ConsoleLine[]>(`/server/console?lines=${lines}`),
  clearConsole: () => request<{ success: boolean }>('/server/console', { method: 'DELETE' }),

  // Files
  listFiles: (path = '/') => request<FileNode[]>(`/server/files?path=${encodeURIComponent(path)}`),
  readFile: (path: string) => request<{ content: string }>(`/server/files/read?path=${encodeURIComponent(path)}`),
  writeFile: (path: string, content: string) => request<{ success: boolean }>('/server/files/write', {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  }),
  deleteFile: (path: string) => request<{ success: boolean }>(`/server/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  createFile: (path: string, isDirectory = false) => request<{ success: boolean }>('/server/files/create', {
    method: 'POST',
    body: JSON.stringify({ path, isDirectory }),
  }),
  uploadFile: (path: string, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<{ success: boolean }>(`/server/files/upload?path=${encodeURIComponent(path)}`, {
      method: 'POST',
      body: form,
      headers: {},
    })
  },

  // Config
  getConfig: () => request<ServerConfig>('/server/config'),
  updateConfig: (config: Partial<ServerConfig>) => request<{ success: boolean }>('/server/config', {
    method: 'PATCH',
    body: JSON.stringify(config),
  }),

  // Scheduled tasks
  getTasks: () => request<ScheduledTask[]>('/server/tasks'),
  createTask: (task: Omit<ScheduledTask, 'id' | 'nextRun' | 'lastRun'>) => request<ScheduledTask>('/server/tasks', {
    method: 'POST',
    body: JSON.stringify(task),
  }),
  updateTask: (id: string, task: Partial<ScheduledTask>) => request<{ success: boolean }>(`/server/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(task),
  }),
  deleteTask: (id: string) => request<{ success: boolean }>(`/server/tasks/${id}`, { method: 'DELETE' }),
  runTask: (id: string) => request<{ success: boolean }>(`/server/tasks/${id}/run`, { method: 'POST' }),

  // Backups
  getBackups: () => request<Backup[]>('/server/backups'),
  createBackup: (name?: string) => request<Backup>('/server/backups', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }),
  deleteBackup: (id: string) => request<{ success: boolean }>(`/server/backups/${id}`, { method: 'DELETE' }),
  downloadBackup: (id: string) => `${API_BASE}/server/backups/${id}/download`,
  restoreBackup: (id: string) => request<{ success: boolean }>(`/server/backups/${id}/restore`, { method: 'POST' }),

  // System
  getSystemInfo: () => request<{ cpu: number; memory: { used: number; total: number }; disk: { used: number; total: number }; uptime: number }>('/system/info'),
}

export function createConsoleWebSocket(onMessage: (msg: any) => void, onError?: (err: Event) => void): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const ws = new WebSocket(`${protocol}//${window.location.host}/api/server/ws`)
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data)
      onMessage(data)
    } catch {
      // Ignore parse errors
    }
  }
  ws.onerror = onError ?? (() => {})
  return ws
}