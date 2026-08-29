export interface ServerStatus {
  state: 'running' | 'stopped' | 'starting' | 'stopping' | 'crashed' | 'unknown'
  uptime: number
  players: {
    online: number
    max: number
    list: Player[]
  }
  resources: {
    cpu: number
    memory: number
    disk: number
  }
  version: string
  lastUpdate: number
}

export interface Player {
  name: string
  uuid: string
  ping: number
  joinedAt: number
}

export interface ConsoleLine {
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  raw: string
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified?: number
  children?: FileNode[]
  isExpanded?: boolean
}

export interface ServerConfig {
  name: string
  jar: string
  javaVersion: string
  jvmArgs: string
  serverArgs: string
  memory: number
  autoRestart: boolean
  port: number
  maxPlayers: number
  motd: string
  difficulty: 'peaceful' | 'easy' | 'normal' | 'hard'
  gamemode: 'survival' | 'creative' | 'adventure' | 'spectator'
  pvp: boolean
  onlineMode: boolean
  whitelist: boolean
  viewDistance: number
  simulationDistance: number
}

export interface ScheduledTask {
  id: string
  name: string
  type: 'restart' | 'backup' | 'command' | 'reboot'
  cron: string
  enabled: boolean
  nextRun: number
  lastRun?: number
  command?: string
}

export interface Backup {
  id: string
  name: string
  size: number
  createdAt: number
  type: 'manual' | 'scheduled'
  status: 'completed' | 'in_progress' | 'failed'
}

export interface APIResponse<T> {
  success: boolean
  data?: T
  error?: string
}

export interface WebSocketMessage {
  type: 'console' | 'status' | 'players' | 'error'
  payload: any
}