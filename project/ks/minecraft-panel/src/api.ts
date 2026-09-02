import type { ServerInfo, Player, ConsoleLog, FileNode, BackupInfo } from './types';

const API_BASE = '/api';

interface ApiResponse<T> {
  data: T;
}

export async function fetchServerInfo(): Promise<ServerInfo> {
  const response = await fetch(`${API_BASE}/server`);
  if (!response.ok) {
    throw new Error('Failed to fetch server info');
  }
  const data: ApiResponse<ServerInfo> = await response.json();
  return data.data;
}

export async function fetchPlayers(): Promise<Player[]> {
  const response = await fetch(`${API_BASE}/players`);
  if (!response.ok) {
    throw new Error('Failed to fetch players');
  }
  const data: ApiResponse<Player[]> = await response.json();
  return data.data;
}

export async function fetchConsoleLogs(): Promise<ConsoleLog[]> {
  const response = await fetch(`${API_BASE}/console`);
  if (!response.ok) {
    throw new Error('Failed to fetch console logs');
  }
  const data: ApiResponse<ConsoleLog[]> = await response.json();
  return data.data;
}

export async function fetchFiles(): Promise<FileNode[]> {
  const response = await fetch(`${API_BASE}/files`);
  if (!response.ok) {
    throw new Error('Failed to fetch files');
  }
  const data: ApiResponse<FileNode[]> = await response.json();
  return data.data;
}

export async function fetchBackups(): Promise<BackupInfo[]> {
  const response = await fetch(`${API_BASE}/backups`);
  if (!response.ok) {
    throw new Error('Failed to fetch backups');
  }
  const data: ApiResponse<BackupInfo[]> = await response.json();
  return data.data;
}