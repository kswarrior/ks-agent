export interface Server {
  id: string
  name: string
  host: string
  port: number
  rcon_port: number
  password: string
  status: 'online' | 'offline' | 'starting' | 'stopping'
  max_players: number
  current_players: number
  motd: string
  version: string
  gamemode: string
  difficulty: string
  latency?: number
}

export interface BackendStatus {
  status: 'online' | 'offline'
  ready: boolean
  message: string
}

export interface BackendConsole {
  output: string[]
}

export interface ConsoleCommand {
  command: string
  timestamp: string
}

export interface Player {
  uuid: string
  name: string
  rank: 'player' | 'mod' | 'admin'
  score: number
  joined_at: string
}

export interface PanelState {
  consoleInput: string
  history: ConsoleCommand[]
  isRunning: boolean
}