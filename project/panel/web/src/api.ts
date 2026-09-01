import { ServerStatus, ServerConfig, Player, FileItem, ConsoleMessage } from './types';

const API_BASE = '/api';

const handleResponse = async (response: Response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || 'API request failed');
  }
  return response.json();
};

export const api = {
  // Server status and info
  getStatus: async (): Promise<{ status: ServerStatus }> => {
    const response = await fetch(`${API_BASE}/server/status`);
    return handleResponse(response);
  },

  // Server control
  startServer: async (): Promise<void> => {
    const response = await fetch(`${API_BASE}/server/start`, { method: 'POST' });
    return handleResponse(response);
  },

  stopServer: async (): Promise<void> => {
    const response = await fetch(`${API_BASE}/server/stop`, { method: 'POST' });
    return handleResponse(response);
  },

  restartServer: async (): Promise<void> => {
    const response = await fetch(`${API_BASE}/server/restart`, { method: 'POST' });
    return handleResponse(response);
  },

  // Server configuration
  getConfig: async (): Promise<{ config: ServerConfig }> => {
    const response = await fetch(`${API_BASE}/server/config`);
    return handleResponse(response);
  },

  updateConfig: async (config: Partial<ServerConfig>): Promise<ServerConfig> => {
    const response = await fetch(`${API_BASE}/server/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return handleResponse(response);
  },

  // Player management
  getPlayers: async (): Promise<{ players: Player[] }> => {
    const response = await fetch(`${API_BASE}/players`);
    return handleResponse(response);
  },

  kickPlayer: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/players/${id}/kick`, { method: 'POST' });
    return handleResponse(response);
  },

  banPlayer: async (id: number): Promise<void> => {
    const response = await fetch(`${API_BASE}/players/${id}/ban`, { method: 'POST' });
    return handleResponse(response);
  },

  // File management
  getFiles: async (path: string = ''): Promise<{ files: FileItem[] }> => {
    const response = await fetch(`${API_BASE}/files?path=${encodeURIComponent(path)}`);
    return handleResponse(response);
  },

  readFile: async (path: string): Promise<{ content: string }> => {
    const response = await fetch(`${API_BASE}/files/read?path=${encodeURIComponent(path)}`);
    return handleResponse(response);
  },

  writeFile: async (path: string, content: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/files/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    return handleResponse(response);
  },

  deleteFile: async (path: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/files/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    return handleResponse(response);
  },

  // Console
  sendCommand: async (command: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/console/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    });
    return handleResponse(response);
  },

  // Console messages
  getConsoleMessages: async (): Promise<{ messages: ConsoleMessage[] }> => {
    const response = await fetch(`${API_BASE}/console/messages`);
    return handleResponse(response);
  },

  // SSE for console streaming
  getConsoleStream: (): EventSource => {
    return new EventSource(`${API_BASE}/console/events`);
  },
};