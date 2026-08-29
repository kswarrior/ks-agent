export interface ServerStatus {
  running: boolean;
  players: number;
  maxPlayers: number;
  uptime: number;
  tps: number;
  memory: {
    used: number;
    max: number;
  };
  startedAt: string | null;
}

export interface FileInfo {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string | null;
}

export interface LogEntry {
  name: string;
  content: string;
}

export interface ConsoleMessage {
  type: 'console' | 'status';
  data: string;
  timestamp: string;
}

export interface ServerConfig {
  [key: string]: string | number | boolean;
}