import { spawn } from 'node:child_process'
import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { WebSocket } from 'ws'

const repo = process.cwd()
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-preview-vite-'))
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
  const project = await api('POST', '/api/projects', { name: 'vite-preview' })
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(project.path, 'node_modules'), 'dir')
  fs.writeFileSync(path.join(project.path, 'package.json'), JSON.stringify({ scripts: { dev: 'vite' } }))
  fs.writeFileSync(
    path.join(project.path, 'index.html'),
    '<!doctype html><html><head></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>'
  )
  fs.writeFileSync(
    path.join(project.path, 'main.js'),
    "import './style.css'\ndocument.querySelector('#app').textContent = 'vite-live'\n"
  )
  fs.writeFileSync(path.join(project.path, 'style.css'), 'body { background: rgb(1, 2, 3); }\n')

  const targetPort = await freePort()
  const started = await api('POST', `/api/projects/${project.id}/preview/start`, { port: targetPort })
  let status = started
  for (let i = 0; i < 200; i += 1) {
    status = await api('GET', `/api/projects/${project.id}/preview`)
    if (status.status !== 'starting') break
    await sleep(100)
  }
  if (status.status !== 'running') throw new Error(`preview not running: ${JSON.stringify(status)}`)

  const prefix = `/preview/${project.id}/`
  const html = await (await fetch(`http://127.0.0.1:${serverPort}${prefix}`)).text()
  if (!html.includes(`${prefix}@vite/client`)) throw new Error(`vite client not rewritten: ${html.slice(0, 800)}`)
  if (!html.includes(`${prefix}main.js`)) throw new Error(`main script not rewritten: ${html.slice(0, 800)}`)
  if (!html.includes('data-ks-preview')) throw new Error('preview websocket shim missing')

  const main = await fetch(`http://127.0.0.1:${serverPort}${prefix}main.js`)
  if (!(await main.text()).includes('vite-live')) throw new Error('prefixed main.js not served')
  const rootMain = await fetch(`http://127.0.0.1:${serverPort}/main.js`, {
    headers: { referer: `http://127.0.0.1:${serverPort}${prefix}` }
  })
  const rootType = rootMain.headers.get('content-type') ?? ''
  const rootText = await rootMain.text()
  if (!rootType.includes('javascript') || !rootText.includes('vite-live')) {
    throw new Error(`referer fallback failed: ${rootType} ${rootText.slice(0, 300)}`)
  }

  const ws = new WebSocket(`ws://127.0.0.1:${serverPort}${prefix}`, 'vite-hmr')
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('vite hmr ws timeout')), 5000)
    ws.on('open', () => {
      clearTimeout(timer)
      resolve()
    })
    ws.on('error', reject)
  })
  ws.close()
  console.log('PASS real Vite dev server through same-origin preview proxy')
} finally {
  child.kill('SIGTERM')
  fs.rmSync(temp, { recursive: true, force: true })
}
