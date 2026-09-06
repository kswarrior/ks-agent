import { Hono } from 'hono'

const app = new Hono()

// Server state
let serverProcess: any = null
let serverReady = false
let consoleOutput: string[] = []

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

export default app