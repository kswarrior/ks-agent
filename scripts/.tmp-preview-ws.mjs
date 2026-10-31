import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'

const repo = process.cwd()
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-preview-ws-'))
const projectsDir = path.join(temp, 'projects')
const dataDir = path.join(temp, 'data')
const extensionsDir = path.join(temp, 'extensions')
fs.mkdirSync(projectsDir, { recursive: true })
fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(extensionsDir, { recursive: true })

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer()
    s.listen(0, '127.0.0.1', () => {
      const port = s.address().port
      s.close(() => resolve(port))
    })
  })

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const serverPort = await freePort()
const child = spawn(process.execPath, [path.join(repo, 'dist-server', 'index.js')], {
  cwd: repo,
  env: {
    ...process.env,
    PORT: String(serverPort),
    KS_ROOT_DIR: repo,
    KS_DATA_DIR: dataDir,
    KS_PROJECTS_DIR: projectsDir,
    KS_EXTENSIONS_DIR: extensionsDir
  },
  stdio: ['ignore', 'inherit', 'inherit']
})

const api = async (method, pathName, body) => {
  const res = await fetch(`http://127.0.0.1:${serverPort}${pathName}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) throw new Error(`${method} ${pathName} -> ${res.status}: ${await res.text()}`)
  return res.json()
}

try {
  for (let i = 0; i < 100; i += 1) {
    try {
      if ((await fetch(`http://127.0.0.1:${serverPort}/api/health`)).ok) break
    } catch {}
    await sleep(100)
  }
  const project = await api('POST', '/api/projects', { name: 'ws-preview' })
  fs.writeFileSync(
    path.join(project.path, 'ws-server.mjs'),
    `import http from 'node:http'
import { WebSocketServer } from 'ws'
const server = http.createServer((req, res) => { res.end('ok') })
const wss = new WebSocketServer({ server })
wss.on('connection', (ws) => ws.on('message', (data) => ws.send('echo:' + data.toString())))
server.listen(Number(process.env.PORT), '127.0.0.1')
`
  )
  const targetPort = await freePort()
  await api('POST', `/api/projects/${project.id}/preview/start`, {
    command: 'node ws-server.mjs',
    port: targetPort
  })
  let status
  for (let i = 0; i < 100; i += 1) {
    status = await api('GET', `/api/projects/${project.id}/preview`)
    if (status.status === 'running') break
    await sleep(100)
  }
  if (status.status !== 'running') throw new Error(`preview not running: ${JSON.stringify(status)}`)

  const ws = new WebSocket(`ws://127.0.0.1:${serverPort}/preview/${project.id}/?token=test`)
  const reply = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('ws timeout')), 5000)
    ws.on('open', () => ws.send('hello'))
    ws.on('message', (data) => {
      clearTimeout(timer)
      resolve(data.toString())
    })
    ws.on('error', reject)
  })
  ws.close()
  if (reply !== 'echo:hello') throw new Error(`unexpected ws reply: ${reply}`)

  const fallback = new WebSocket(`ws://127.0.0.1:${serverPort}/?token=test`)
  const fallbackReply = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('fallback ws timeout')), 5000)
    fallback.on('open', () => fallback.send('root'))
    fallback.on('message', (data) => {
      clearTimeout(timer)
      resolve(data.toString())
    })
    fallback.on('error', reject)
  })
  fallback.close()
  if (fallbackReply !== 'echo:root') throw new Error(`unexpected fallback ws reply: ${fallbackReply}`)

  console.log('PASS preview websocket path proxy + root HMR fallback')
} finally {
  child.kill('SIGTERM')
  fs.rmSync(temp, { recursive: true, force: true })
}
