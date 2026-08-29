import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import { spawn, ChildProcess } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, rmSync, cpSync } from 'fs'
import { join, resolve, extname, basename } from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import archiver from 'archiver'
import mime from 'mime-types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')

const DATA_DIR = resolve(__dirname, '../../data')
const SERVER_DIR = resolve(DATA_DIR, 'server')
const LOGS_DIR = resolve(DATA_DIR, 'logs')
const CONFIG_FILE = resolve(DATA_DIR, 'config.json')

;[DATA_DIR, SERVER_DIR, LOGS_DIR].forEach(dir => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
})

interface ServerConfig {
  javaPath: string
  jarName: string
  javaArgs: string
  memory: string
  port: number
  autoRestart: boolean
}

const defaultConfig: ServerConfig = {
  javaPath: 'java',
  jarName: 'server.jar',
  javaArgs: '',
  memory: '2G',
  port: 25565,
  autoRestart: false
}

let config: ServerConfig = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) : defaultConfig
let serverProcess: ChildProcess | null = null
let consoleClients: WebSocket[] = []
let consoleBuffer: string[] = []

function saveConfig() {
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2))
}

function logToConsole(message: string) {
  const timestamp = new Date().toISOString()
  const line = `[${timestamp}] ${message}`
  consoleBuffer.push(line)
  if (consoleBuffer.length > 1000) consoleBuffer.shift()
  consoleClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'console', data: line }))
    }
  })
}

function startServer() {
  if (serverProcess) return false
  
  const jarPath = join(SERVER_DIR, config.jarName)
  if (!existsSync(jarPath)) {
    logToConsole(`ERROR: Server jar not found at ${jarPath}`)
    return false
  }

  const args = [
    `-Xms${config.memory}`,
    `-Xmx${config.memory}`,
    ...config.javaArgs.split(' ').filter(Boolean),
    '-jar', config.jarName,
    'nogui'
  ]

  logToConsole(`Starting server with: ${config.javaPath} ${args.join(' ')}`)
  
  serverProcess = spawn(config.javaPath, args, {
    cwd: SERVER_DIR,
    env: { ...process.env, EULA: 'TRUE' }
  })

  serverProcess.stdout?.on('data', (data) => {
    logToConsole(data.toString().trimEnd())
  })

  serverProcess.stderr?.on('data', (data) => {
    logToConsole(data.toString().trimEnd())
  })

  serverProcess.on('exit', (code) => {
    logToConsole(`Server stopped with exit code ${code}`)
    serverProcess = null
    if (config.autoRestart) {
      setTimeout(startServer, 5000)
    }
  })

  serverProcess.on('error', (err) => {
    logToConsole(`Server error: ${err.message}`)
    serverProcess = null
  })

  return true
}

function stopServer(force = false) {
  if (!serverProcess) return false
  
  if (force) {
    serverProcess.kill('SIGKILL')
    logToConsole('Server force killed')
  } else {
    serverProcess.stdin?.write('stop\n')
    logToConsole('Stop command sent')
    setTimeout(() => {
      if (serverProcess) {
        serverProcess.kill('SIGKILL')
        logToConsole('Server force killed after timeout')
      }
    }, 30000)
  }
  return true
}

function sendCommand(command: string) {
  if (!serverProcess) return false
  serverProcess.stdin?.write(`${command}\n`)
  logToConsole(`> ${command}`)
  return true
}

const app = new Hono()

app.get('/api/health', (c) => c.json({ status: 'ok', running: !!serverProcess }))

app.get('/api/config', (c) => c.json(config))

app.post('/api/config', async (c) => {
  const body = await c.req.json()
  config = { ...config, ...body }
  saveConfig()
  return c.json(config)
})

app.get('/api/console', (c) => c.json({ buffer: consoleBuffer }))

app.post('/api/server/start', (c) => {
  const success = startServer()
  return c.json({ success, running: !!serverProcess })
})

app.post('/api/server/stop', (c) => {
  const success = stopServer(false)
  return c.json({ success, running: !!serverProcess })
})

app.post('/api/server/restart', (c) => {
  stopServer(false)
  setTimeout(() => startServer(), 2000)
  return c.json({ success: true })
})

app.post('/api/server/kill', (c) => {
  const success = stopServer(true)
  return c.json({ success, running: !!serverProcess })
})

app.post('/api/console/command', async (c) => {
  const { command } = await c.req.json()
  const success = sendCommand(command)
  return c.json({ success })
})

// File management
function getFileTree(dir: string, basePath: string = ''): any[] {
  if (!existsSync(dir)) return []
  const items = readdirSync(dir)
  return items.map(name => {
    const fullPath = join(dir, name)
    const stat = statSync(fullPath)
    const relPath = join(basePath, name)
    if (stat.isDirectory()) {
      return {
        name,
        path: relPath,
        type: 'directory',
        children: getFileTree(fullPath, relPath),
        size: 0,
        modified: stat.mtime.toISOString()
      }
    }
    return {
      name,
      path: relPath,
      type: 'file',
      size: stat.size,
      modified: stat.mtime.toISOString()
    }
  })
}

app.get('/api/files', (c) => {
  const tree = getFileTree(SERVER_DIR)
  return c.json({ files: tree })
})

app.get('/api/files/*', (c) => {
  const filepath = c.req.param('*')
  const fullPath = join(SERVER_DIR, filepath)
  if (!existsSync(fullPath) || !fullPath.startsWith(SERVER_DIR)) {
    return c.json({ error: 'File not found' }, 404)
  }
  const stat = statSync(fullPath)
  if (stat.isDirectory()) {
    return c.json({ error: 'Is a directory' }, 400)
  }
  return c.body(readFileSync(fullPath), 200, { 'Content-Type': mime.lookup(fullPath) || 'application/octet-stream' })
})

app.post('/api/files', async (c) => {
  const { path: filePath, content } = await c.req.json()
  const fullPath = join(SERVER_DIR, filePath)
  if (!fullPath.startsWith(SERVER_DIR)) return c.json({ error: 'Invalid path' }, 400)
  
  const dir = resolve(fullPath, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  
  writeFileSync(fullPath, content, 'utf-8')
  return c.json({ success: true })
})

app.delete('/api/files/*', (c) => {
  const filepath = c.req.param('*')
  const fullPath = join(SERVER_DIR, filepath)
  if (!existsSync(fullPath) || !fullPath.startsWith(SERVER_DIR)) {
    return c.json({ error: 'File not found' }, 404)
  }
  const stat = statSync(fullPath)
  if (stat.isDirectory()) {
    rmSync(fullPath, { recursive: true, force: true })
  } else {
    unlinkSync(fullPath)
  }
  return c.json({ success: true })
})

app.post('/api/files/upload', async (c) => {
  const formData = await c.req.formData()
  const file = formData.get('file') as File
  const targetPath = formData.get('path') as string || ''
  
  if (!file) return c.json({ error: 'No file' }, 400)
  
  const fullPath = join(SERVER_DIR, targetPath, file.name)
  if (!fullPath.startsWith(SERVER_DIR)) return c.json({ error: 'Invalid path' }, 400)
  
  const buffer = Buffer.from(await file.arrayBuffer())
  const dir = resolve(fullPath, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  
  writeFileSync(fullPath, buffer)
  return c.json({ success: true })
})

app.get('/api/files/download/*', (c) => {
  const filepath = c.req.param('*')
  const fullPath = join(SERVER_DIR, filepath)
  if (!existsSync(fullPath) || !fullPath.startsWith(SERVER_DIR)) {
    return c.json({ error: 'Not found' }, 404)
  }
  const stat = statSync(fullPath)
  if (stat.isDirectory()) {
    const archive = archiver('zip', { zlib: { level: 9 } })
    archive.directory(fullPath, false)
    archive.finalize()
    return c.body(archive, 200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${basename(filepath)}.zip"` })
  }
  return c.body(readFileSync(fullPath), 200, { 'Content-Type': mime.lookup(fullPath) || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${basename(filepath)}"` })
})

app.get('/api/stats', (c) => {
  const mem = process.memoryUsage()
  return c.json({
    running: !!serverProcess,
    pid: serverProcess?.pid,
    uptime: process.uptime(),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024)
    }
  })
})

const httpServer = createServer((req, res) => {
  return app.fetch(req, res)
})

const wss = new WebSocketServer({ server: httpServer, path: '/ws' })

wss.on('connection', (ws) => {
  consoleClients.push(ws)
  ws.send(JSON.stringify({ type: 'buffer', data: consoleBuffer }))
  
  ws.on('close', () => {
    consoleClients = consoleClients.filter(c => c !== ws)
  })
  
  ws.on('error', () => {
    consoleClients = consoleClients.filter(c => c !== ws)
  })
})

const PORT = 3456
httpServer.listen(PORT, () => {
  console.log(`Minecraft Panel API running on http://127.0.0.1:${PORT}`)
  console.log(`WebSocket available at ws://127.0.0.1:${PORT}/ws`)
})