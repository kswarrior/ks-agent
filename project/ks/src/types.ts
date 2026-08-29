export interface ServerStatus {
  status: 'running' | 'stopped' | 'starting' | 'stopping' | 'crashed' | 'unknown';
  uptime: number;
  cpu: number;
  memory: number;
  memoryMax: number;
  playersOnline: number;
  playersMax: number;
  version: string;
}

export interface ConsoleLine {
  id: number;
  timestamp: string;
  type: 'stdout' | 'stderr' | 'system' | 'command';
  content: string;
}

export interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: string;
  children?: FileNode[];
}

export interface ServerConfig {
  name: string;
  javaVersion: string;
  jarFile: string;
  memory: string;
  jvmArgs: string;
  serverArgs: string;
  autoRestart: boolean;
  autoRestartOnCrash: boolean;
}

export interface BackupInfo {
  id: string;
  name: string;
  size: number;
  createdAt: string;
  type: 'manual' | 'scheduled';
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}