// Server types
export interface ServerStatus {
  running: boolean;
  players: number;
  tps: number;
  uptime: number;
  memory: {
    used: number;
    max: number;
  };
}

export interface ServerConfig {
  name: string;
  port: number;
  maxPlayers: number;
  onlineMode: boolean;
  gamemode: string;
  difficulty: string;
  levelName: string;
  [key: string]: any;
}

export interface Player {
  id: number;
  name: string;
  uuid: string;
  ping: number;
  isOnline: boolean;
}

export interface FileItem {
  name: string;
  type: 'file' | 'directory';
  path: string;
  size?: number;
  children?: FileItem[];
}

export interface ConsoleMessage {
  type: 'output' | 'input';
  content: string;
  timestamp: number;
}

export interface ServerStats {
  status: ServerStatus;
  players: Player[];
  config: ServerConfig;
}