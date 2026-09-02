import 'dotenv/config'
import express from 'express'
import http from 'http'
import { Server as SocketIOServer } from 'ws'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import cors from 'cors'
import path from 'node:path'
import fs from 'node:fs/promises'

import { config } from './config.js'
import { verifyCredentials, signToken, authMiddleware, wsAuthenticate } from './auth.js'
import { connectRcon, sendCommand as rconSend, sendSafe } from './rcon.js'
import { processManager } from './processManager.js'
import { logTailer } from './logTailer.js'
import { playerTracker } from './players.js'
import { listDir, readFile, writeFile, remove, mkdir, rename, upload, getDownloadStream, readServerProperties, writeServerProperties } from './fileManager.js'

const app = express()
const server = http.createServer(app)
const wss = new SocketIOServer(server, {
  path: '/ws',
  clientTracking: true
})

// --- Middleware ---
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cors({ origin: '*', credentials: true }))

// --- Auth: login ---
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'username and password required' })
  if (verifyCredentials(username, password)) {
    const token = signToken(username)
    return res.json({ token })
  }
  return res.status(401).json({ error: 'invalid credentials' })
})

// --- Auth: whoami ---
app.get('/api/auth/whoami', authMiddleware, (req, res) => {
  res.json({ user: req.user.sub, role: req.user.role })
})

// --- Server process ---
app.get('/api/server/status', authMiddleware, (req, res) => {
  res.json(processManager.getStatus())
})

app.post('/api/server/start', authMiddleware, async (req, res) => {
  const { autoRestart = false } = req.body || {}
  try {
    const result = await processManager.start({ autoRestart })
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/server/stop', authMiddleware, async (req, res) => {
  try {
    await processManager.stop()
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/server/restart', authMiddleware, async (req, res) => {
  try {
    await processManager.stop()
    const result = await processManager.start({ autoRestart: false })
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/server/send-command', authMiddleware, async (req, res) => {
  const { command } = req.body || {}
  if (!command) return res.status(400).json({ error: 'command required' })
  try {
    // Send to MC server via RCON, fallback to stdin
    let result
    try {
      result = await sendSafe(`say ${command}`)
    } catch (rconErr) {
      // If RCON not available, try process stdin
      if (processManager.isRunning()) {
        processManager.sendCommand(command)
        result = { ok: true, note: 'sent via stdin (RCON not connected)' }
      } else {
        throw rconErr
      }
    }
    res.json({ ok: true, result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/server/console/logs', authMiddleware, (req, res) => {
  res.json({ logs: logTailer.recentLines() })
})

// --- File manager ---
app.get('/api/files', authMiddleware, async (req, res) => {
  const { path = '.' } = req.query
  try {
    const result = await listDir(path)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.get('/api/files/read', authMiddleware, async (req, res) => {
  const { path } = req.query
  if (!path) return res.status(400).json({ error: 'path required' })
  try {
    const result = await readFile(path)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

app.post('/api/files/write', authMiddleware, async (req, res) => {
  const { path, content } = req.body || {}
  if (!path || content === undefined) return res.status(400).json({ error: 'path and content required' })
  try {
    const result = await writeFile(path, content)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/files/remove', authMiddleware, async (req, res) => {
  const { path } = req.body || {}
  if (!path) return res.status(400).json({ error: 'path required' })
  try {
    const result = await remove(path)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/files/mkdir', authMiddleware, async (req, res) => {
  const { path } = req.body || {}
  if (!path) return res.status(400).json({ error: 'path required' })
  try {
    const result = await mkdir(path)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/files/rename', authMiddleware, async (req, res) => {
  const { fromPath, toPath } = req.body || {}
  if (!fromPath || !toPath) return res.status(400).json({ error: 'fromPath and toPath required' })
  try {
    const result = await rename(fromPath, toPath)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/files/upload', authMiddleware, async (req, res) => {
  const { dir, originalName } = req.body || {}
  const buffer = Buffer.from((req.body.base64 || ''), 'base64')
  if (!originalName) return res.status(400).json({ error: 'originalName required' })
  try {
    const result = await upload(dir, originalName, buffer)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/files/download/:relPath', authMiddleware, async (req, res) => {
  const { relPath } = req.params
  try {
    const { absPath, size } = await getDownloadStream(relPath)
    res.set('Content-Disposition', `attachment; filename="${path.basename(relPath)}"`)
    res.set('Content-Length', size)
    const fsp = await import('node:fs/promises')
    const stream = fsp.createReadStream(absPath)
    stream.pipe(res)
    stream.on('end', () => res.end())
  } catch (err) {
    res.status(404).json({ error: err.message })
  }
})

// --- server.properties ---
app.get('/api/properties', authMiddleware, async (req, res) => {
  try {
    const result = await readServerProperties()
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/properties', authMiddleware, async (req, res) => {
  const { content } = req.body || {}
  if (!content) return res.status(400).json({ error: 'content required' })
  try {
    const result = await writeServerProperties(content)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --- Player list ---
app.get('/api/players', authMiddleware, (req, res) => {
  res.json({ players: playerTracker.list() })
}

// --- WebSocket for live logs + console ---
wss.use((req, next) => {
  const user = wsAuthenticate(req)
  if (user) {
    req.user = user
    next()
  } else {
    next(new Error('unauthorized'))
  }
})

wss.on('connection', (ws, req) => {
  const user = req.user ? req.user.sub : 'anonymous'
  ws.user = user
  ws.send(JSON.stringify({ type: 'system', line: `Connected as ${user}` }))

  // Send recent log buffer
  try {
    const recent = logTailer.recentLines().slice(0, 50)
    ws.send(JSON.stringify({ type: 'log-buffer', lines: recent }))
  } catch {}

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg.toString())
      if (data.type === 'console-input' && data.line !== undefined) {
        // Send to RCON if connected, otherwise process stdin
        const cmd = data.line.trim()
        if (cmd) {
          // Fire and forget — don't await, just emit log
          ;(async () => {
            try {
              await sendSafe(cmd)
            } catch (e) {
              if (!processManager.isRunning()) {
                ws.send(JSON.stringify({ type: 'log', line: `[RCON err: ${e.message}]` }))
              }
            }
          })()
          ws.send(JSON.stringify({ type: 'log', line: `> ${cmd}` }))
        }
      }
    } catch {}
  })

  ws.on('close', () => {
    // nothing special
  })
})

// --- Root health ---
app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

// --- 404 ---
app.use((req, res) => {
  res.status(404).json({ error: 'not_found' })
})

const PORT = config.port
server.listen(PORT, () => {
  console.log(`Panel API running on http://localhost:${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  try {
    await processManager.stop()
  } catch {}
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})