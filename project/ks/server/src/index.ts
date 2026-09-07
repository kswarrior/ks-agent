import { Hono } from 'hono'

const app = new Hono()

// Server state
let serverProcess: any = null
let serverReady = false
let consoleOutput: string[] = []
let servers = [
  { id: 'minecraft-1', name: 'Survival Hub', host: 'localhost', port: 25565, rcon_port: 25575, password: '••••••', status: 'online', max_players: 100, current_players: 67, motd: '§a§lSurvival §7Hub', version: '1.20.2', gamemode: 'Survival', difficulty: 'Hard' },
  { id: 'minecraft-2', name: 'Creative World', host: 'localhost', port: 25566, rcon_port: 25576, password: '••••••', status: 'offline', max_players: 50, current_players: 0, motd: '§eCreative', version: '1.19.3', gamemode: 'Creative', difficulty: 'Peaceful' },
]
let players = [
  { uuid: '1', name: 'Notch', rank: 'admin', score: 4200, joined_at: '2024-01-10' },
  { uuid: '2', name: 'Dinnerbone', rank: 'mod', score: 3100, joined_at: '2024-01-12' },
  { uuid: '3', name: 'Jeb_', rank: 'player', score: 1800, joined_at: '2024-01-15' },
]

// Start server
app.get('/api/server/start', (c) => {
  if (serverProcess) {
    return c.json({ status: 'already_running', message: 'Server is already running' }, 400)
  }

  // In a real implementation, this would start the Minecraft server process
  // For now, simulate server start
  serverReady = true
  consoleOutput = ['Server starting...', 'Loading world...', 'Done!']

  return c.json({ status: 'started', message: 'Server started successfully' })
})

// Stop server
app.get('/api/server/stop', (c) => {
  if (!serverProcess) {
    return c.json({ status: 'not_running', message: 'Server is not running' }, 400)
  }

  serverProcess = null
  serverReady = false
  consoleOutput = []

  return c.json({ status: 'stopped', message: 'Server stopped successfully' })
})

// Restart server
app.get('/api/server/restart', (c) => {
  // Stop first, then start
  serverProcess = null
  serverReady = false
  consoleOutput = []

  // Then start
  serverReady = true
  consoleOutput = ['Server restarting...', 'Loading world...', 'Done!']

  return c.json({ status: 'restarted', message: 'Server restarted successfully' })
})

// Get server status
app.get('/api/server/status', (c) => {
  return c.json({
    status: serverReady ? 'online' : 'offline',
    ready: serverReady,
    message: serverReady ? 'Server is running' : 'Server is stopped'
  })
})

// Get console output
app.get('/api/server/console', (c) => {
  return c.json({ output: consoleOutput })
})

// Clear console output
app.post('/api/server/console/clear', (c) => {
  consoleOutput = []
  return c.json({ status: 'cleared' })
})

// Servers list
app.get('/api/servers', (c) => {
  return c.json(servers)
})

// Players list
app.get('/api/players', (c) => {
  return c.json(players)
})

// Analytics
app.get('/api/analytics', (c) => {
  return c.json({
    total_players: 3421,
    avg_uptime: '98.7%',
    peak_players: 89,
    cpu_usage: 42.5,
    memory_usage: 67.3
  })
})

export default app