export interface Server {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'starting' | 'stopping';
  players: number;
  maxPlayers: number;
  motd: string;
  version: string;
  latency?: number;
}

export interface ServerStatus {
  ready: boolean;
  status: 'online' | 'offline';
  message: string;
  output: string[];
}

export interface ConsoleCommand {
  command: string;
}

export interface Player {
  name: string;
  uuid: string;
  rank?: string;
}

export interface PanelState {
  servers: Server[];
  selectedServer: string | null;
  consoleInput: string;
  isConnecting: boolean;
}