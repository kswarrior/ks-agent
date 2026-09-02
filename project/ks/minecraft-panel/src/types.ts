/**
 * Minecraft Server Management Panel Types
 */

export interface Player {
  id: number;
  uuid: string;
  name: string;
  ping: number;
  mode: 'survival' | 'creative' | 'spectator';
  isOnCooldown: boolean;
  level: number;
  exp: number;
}

export interface FileNode {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  children?: FileNode[];
}

export interface ServerInfo {
  name: string;
  version: string;
  motd: string;
  maxPlayers: number;
  onlinePlayers: number;
  tps: number;
  uptime: string;
  memoryUsed: string;
  memoryMax: string;
  isRunning: boolean;
}

export interface ConsoleLog {
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  message: string;
}

export interface ServerCommand {
  command: string;
  args?: string[];
}

export interface BackupInfo {
  name: string;
  timestamp: string;
  size: string;
}

export interface ServerStats {
  players: Player[];
  recentCommands: string[];
  backupHistory: BackupInfo[];
  files: FileNode[];
  consoleLogs: ConsoleLog[];
}