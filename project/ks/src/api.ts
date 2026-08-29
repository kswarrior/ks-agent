import type { ServerStatus, ConsoleLine, FileNode, ServerConfig, BackupInfo, ApiResponse } from './types';

const API_BASE = '/api';

async function fetchJson<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    });
    const data = await response.json();
    if (!response.ok) {
      return { success: false, error: data.error || `HTTP ${response.status}` };
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'Network error' };
  }
}

export const api = {
  // Server control
  getStatus: () => fetchJson<ServerStatus>('/server/status'),
  startServer: () => fetchJson<{ message: string }>('/server/start', { method: 'POST' }),
  stopServer: () => fetchJson<{ message: string }>('/server/stop', { method: 'POST' }),
  restartServer: () => fetchJson<{ message: string }>('/server/restart', { method: 'POST' }),
  killServer: () => fetchJson<{ message: string }>('/server/kill', { method: 'POST' }),
  sendCommand: (command: string) => fetchJson<{ message: string }>('/server/command', {
    method: 'POST',
    body: JSON.stringify({ command }),
  }),

  // Console
  getConsole: (lines = 500) => fetchJson<ConsoleLine[]>(`/server/console?lines=${lines}`),

  // Files
  listFiles: (path = '/') => fetchJson<FileNode[]>(`/server/files?path=${encodeURIComponent(path)}`),
  readFile: (path: string) => fetchJson<{ content: string }>(`/server/files/read?path=${encodeURIComponent(path)}`),
  writeFile: (path: string, content: string) => fetchJson<{ message: string }>(`/server/files/write`, {
    method: 'POST',
    body: JSON.stringify({ path, content }),
  }),
  deleteFile: (path: string) => fetchJson<{ message: string }>(`/server/files/delete`, {
    method: 'DELETE',
    body: JSON.stringify({ path }),
  }),
  createFile: (path: string, isDirectory: boolean) => fetchJson<{ message: string }>(`/server/files/create`, {
    method: 'POST',
    body: JSON.stringify({ path, isDirectory }),
  }),

  // Config
  getConfig: () => fetchJson<ServerConfig>('/server/config'),
  updateConfig: (config: Partial<ServerConfig>) => fetchJson<{ message: string }>('/server/config', {
    method: 'PATCH',
    body: JSON.stringify(config),
  }),

  // Backups
  listBackups: () => fetchJson<BackupInfo[]>('/server/backups'),
  createBackup: (name?: string) => fetchJson<{ message: string }>('/server/backups', {
    method: 'POST',
    body: JSON.stringify({ name }),
  }),
  restoreBackup: (id: string) => fetchJson<{ message: string }>(`/server/backups/${id}/restore`, {
    method: 'POST',
  }),
  deleteBackup: (id: string) => fetchJson<{ message: string }>(`/server/backups/${id}`, {
    method: 'DELETE',
  }),
  downloadBackup: (id: string) => `${API_BASE}/server/backups/${id}/download`,

  // System
  getSystemInfo: () => fetchJson<{ cpu: number; memory: number; disk: number }>('/system/info'),
};