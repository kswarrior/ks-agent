export interface ServerConfig {
  javaPath: string
  jarName: string
  javaArgs: string
  memory: string
  port: number
  autoRestart: boolean
}

export interface ConsoleLine {
  type: 'console' | 'buffer' | 'command'
  data: string | string[]
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  size?: number
  modified: string
  children?: FileNode[]
}

export interface ServerStats {
  running: boolean
  pid?: number
  uptime: number
  memory: {
    rss: number
    heapUsed: number
    heapTotal: number
  }
}

export interface ApiResponse<T> {
  success?: boolean
  error?: string
  [key: string]: any
}