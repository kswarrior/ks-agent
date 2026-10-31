import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'
import type { Duplex } from 'node:stream'
import { config, isInside } from './config.js'
import { ConfigError } from './errors.js'
import { unsafeCommand } from './fsx.js'

export type PreviewState = 'stopped' | 'starting' | 'running' | 'error'

export interface PreviewProject {
  id: string
  path: string
}

export interface PreviewDetection {
  command: string
  port: number
  framework: string
  cwd: string
  script: string | null
  packageManager: string | null
  note: string
}

export interface PreviewStatus {
  projectId: string
  status: PreviewState
  command: string
  port: number
  cwd: string
  framework: string
  proxyPort: number | null
  proxyPath: string | null
  url: string | null
  output: string
  error: string | null
  owned: boolean
  detected: PreviewDetection
  startedAt: number | null
  readyAt: number | null
}

interface DetectionInternal extends PreviewDetection {
  build: (port: number) => string
}

interface PreviewSession {
  projectId: string
  projectPath: string
  detection: PreviewDetection
  status: PreviewState
  command: string
  port: number
  cwd: string
  framework: string
  output: string
  error: string | null
  owned: boolean
  startedAt: number | null
  readyAt: number | null
  child: ChildProcess | null
  proxyServer: http.Server | null
  proxyPort: number | null
  stopping: boolean
}

interface StartOptions {
  command?: string
  port?: number
  cwd?: string
}

const sessions = new Map<string, PreviewSession>()
const OUTPUT_LIMIT = 40_000
const PREVIEW_PATH_ROOT = '/preview/'
const CANDIDATE_DIRS = [
  '',
  'frontend',
  'web',
  'client',
  'app',
  'ui',
  'site',
  'www',
  'packages/web',
  'packages/frontend',
  'apps/web'
]
const PREFERRED_SCRIPTS = ['dev', 'start', 'serve', 'preview', 'dev:web', 'dev:client', 'start:dev', 'develop']

interface Framework {
  name: string
  dependency: string
  port: number
  args: (port: number) => string[]
}

const FRAMEWORKS: Framework[] = [
  {
    name: 'Next.js',
    dependency: 'next',
    port: 3000,
    args: (port) => ['-p', String(port), '-H', '0.0.0.0']
  },
  {
    name: 'Nuxt',
    dependency: 'nuxt',
    port: 3000,
    args: (port) => ['--port', String(port), '--host', '0.0.0.0']
  },
  {
    name: 'SvelteKit',
    dependency: '@sveltejs/kit',
    port: 5173,
    args: (port) => ['--port', String(port), '--host', '0.0.0.0']
  },
  {
    name: 'Astro',
    dependency: 'astro',
    port: 4321,
    args: (port) => ['--port', String(port), '--host', '0.0.0.0']
  },
  {
    name: 'Angular',
    dependency: '@angular/cli',
    port: 4200,
    args: (port) => ['--port', String(port), '--host', '0.0.0.0']
  },
  {
    name: 'Vite',
    dependency: 'vite',
    port: 5173,
    args: (port) => ['--port', String(port), '--host', '0.0.0.0']
  },
  {
    name: 'React (Create React App)',
    dependency: 'react-scripts',
    port: 3000,
    args: () => []
  },
  {
    name: 'Vue CLI',
    dependency: '@vue/cli-service',
    port: 8080,
    args: () => []
  },
  {
    name: 'Express',
    dependency: 'express',
    port: 3000,
    args: () => []
  }
]

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') out[key] = entry
  }
  return out
}

function packageDependencies(pkg: Record<string, unknown>): string[] {
  return [
    ...Object.keys(stringRecord(pkg.dependencies)),
    ...Object.keys(stringRecord(pkg.devDependencies))
  ]
}

function detectPackageManager(cwd: string): string {
  if (fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm'
  if (fs.existsSync(path.join(cwd, 'yarn.lock'))) return 'yarn'
  if (fs.existsSync(path.join(cwd, 'bun.lockb')) || fs.existsSync(path.join(cwd, 'bun.lock'))) return 'bun'
  return 'npm'
}

function scriptPort(script: string): number | null {
  const match = /(?:--port[=\s]+|-p[=\s]+|PORT=)(\d{2,5})/.exec(script)
  if (!match) return null
  const port = Number(match[1])
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : null
}

function runCommand(packageManager: string, script: string, args: string[]): string {
  if (packageManager === 'yarn') {
    return `yarn ${script}${args.length ? ` ${args.join(' ')}` : ''}`
  }
  return `${packageManager} run ${script}${args.length ? ` -- ${args.join(' ')}` : ''}`
}

function candidateDirectories(projectPath: string): string[] {
  const dirs = new Set<string>()
  for (const candidate of CANDIDATE_DIRS) {
    const abs = path.resolve(projectPath, candidate)
    if (!isInside(projectPath, abs)) continue
    if (candidate === '' || fs.existsSync(path.join(abs, 'package.json'))) dirs.add(candidate)
  }
  try {
    const entries = fs.readdirSync(projectPath, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (['node_modules', '.git', 'dist', 'build', 'target', '.next', '.nuxt'].includes(entry.name)) continue
      const rel = entry.name
      if (fs.existsSync(path.join(projectPath, rel, 'package.json'))) dirs.add(rel)
    }
  } catch {
    // ignore unreadable project roots
  }
  return [...dirs]
}

function scoreCandidate(
  projectPath: string,
  rel: string,
  scripts: Record<string, string>,
  deps: string[]
): number {
  let score = rel === '' ? 1 : 0
  if (scripts.dev) score += 6
  if (scripts.start) score += 3
  if (scripts.serve) score += 2
  if (scripts.preview) score += 1
  if (FRAMEWORKS.some((framework) => deps.includes(framework.dependency))) score += 4
  if (fs.existsSync(path.join(projectPath, rel, 'index.html'))) score += 2
  return score
}

function noCommandDetection(note: string, cwd = '', port = 3000): DetectionInternal {
  return {
    command: '',
    port,
    framework: 'Web app',
    cwd,
    script: null,
    packageManager: null,
    note,
    build: () => ''
  }
}

function detect(projectPath: string): DetectionInternal {
  let best: { score: number; cwd: string; scripts: Record<string, string>; deps: string[] } | null = null

  for (const rel of candidateDirectories(projectPath)) {
    const cwd = path.resolve(projectPath, rel)
    const pkg = readJson(path.join(cwd, 'package.json'))
    if (!pkg) continue
    const scripts = stringRecord(pkg.scripts)
    const deps = packageDependencies(pkg)
    const score = scoreCandidate(projectPath, rel, scripts, deps)
    if (!best || score > best.score) best = { score, cwd: rel, scripts, deps }
  }

  if (best) {
    const script = PREFERRED_SCRIPTS.find((name) => Boolean(best?.scripts[name]?.trim())) ?? null
    if (script) {
      const framework =
        FRAMEWORKS.find((entry) => best?.deps.includes(entry.dependency)) ??
        ({ name: 'Node app', dependency: '', port: 3000, args: () => [] } as Framework)
      const scriptText = best.scripts[script]
      const port = scriptPort(scriptText) ?? framework.port
      const packageManager = detectPackageManager(path.resolve(projectPath, best.cwd))
      const args = framework.args(port)
      return {
        command: runCommand(packageManager, script, args),
        port,
        framework: framework.name,
        cwd: best.cwd,
        script,
        packageManager,
        note: `Detected ${framework.name} in ${best.cwd || 'the project root'} using ${packageManager} run ${script}.`,
        build: (nextPort) => runCommand(packageManager, script, framework.args(nextPort))
      }
    }

    const viteBin = path.join(projectPath, best.cwd, 'node_modules', '.bin', 'vite')
    if (fs.existsSync(viteBin)) {
      const port = 5173
      return {
        command: `./node_modules/.bin/vite --port ${port} --host 0.0.0.0`,
        port,
        framework: 'Vite',
        cwd: best.cwd,
        script: null,
        packageManager: null,
        note: `Detected a local Vite binary in ${best.cwd || 'the project root'}.`,
        build: (nextPort) => `./node_modules/.bin/vite --port ${nextPort} --host 0.0.0.0`
      }
    }
  }

  for (const rel of candidateDirectories(projectPath)) {
    const cwd = path.resolve(projectPath, rel)
    if (fs.existsSync(path.join(cwd, 'manage.py'))) {
      const port = 8000
      return {
        command: `python3 manage.py runserver 0.0.0.0:${port}`,
        port,
        framework: 'Django',
        cwd: rel,
        script: null,
        packageManager: null,
        note: `Detected manage.py in ${rel || 'the project root'}.`,
        build: (nextPort) => `python3 manage.py runserver 0.0.0.0:${nextPort}`
      }
    }
    if (fs.existsSync(path.join(cwd, 'index.html'))) {
      const port = 8000
      return {
        command: `python3 -m http.server ${port} --bind 0.0.0.0`,
        port,
        framework: 'Static site',
        cwd: rel,
        script: null,
        packageManager: null,
        note: `Detected index.html in ${rel || 'the project root'}; serving it with Python.`,
        build: (nextPort) => `python3 -m http.server ${nextPort} --bind 0.0.0.0`
      }
    }
  }

  return noCommandDetection(
    'No web dev script was detected. Enter the command (for example "npm run dev") or ask the AI to start the app.'
  )
}

export function detectPreview(projectPath: string): PreviewDetection {
  const { build: _build, ...publicDetection } = detect(projectPath)
  return publicDetection
}

function validatePort(value: unknown): number {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new ConfigError('port must be an integer between 1024 and 65535')
  }
  return port
}

function resolveCwd(projectPath: string, requested?: string): { abs: string; rel: string } {
  const rel = (requested ?? '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  const abs = path.resolve(projectPath, rel || '.')
  if (!isInside(projectPath, abs)) throw new ConfigError('cwd must be inside the project')
  try {
    if (!fs.statSync(abs).isDirectory()) throw new Error('not a directory')
  } catch {
    throw new ConfigError(`Preview folder not found: ${rel || '.'}`)
  }
  return { abs, rel: path.relative(projectPath, abs).split(path.sep).join('/') }
}

function isPortOpen(port: number, timeoutMs = 350): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    let settled = false
    const finish = (open: boolean) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

function rewriteLocation(value: string, targetPort: number): string {
  try {
    const url = new URL(value)
    if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && Number(url.port) === targetPort) {
      return `${url.pathname}${url.search}${url.hash}`
    }
  } catch {
    // relative location
  }
  return value
}

function stripCookieDomain(value: string): string {
  return value
    .split(';')
    .map((part) => part.trim())
    .filter((part) => !/^domain=/i.test(part))
    .join('; ')
}

function proxyHostHeader(targetPort: number): string {
  return `127.0.0.1:${targetPort}`
}

function rewriteProxyRequest(req: http.IncomingMessage, targetPort: number): Record<string, string | string[]> {
  const headers: Record<string, string | string[]> = {}
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue
    const lower = name.toLowerCase()
    if (['host', 'origin', 'referer'].includes(lower)) continue
    headers[lower] = value
  }
  headers.host = proxyHostHeader(targetPort)
  if (req.headers.origin) headers.origin = `http://${proxyHostHeader(targetPort)}`
  if (req.headers.referer) {
    try {
      const referer = new URL(req.headers.referer)
      referer.protocol = 'http:'
      referer.hostname = '127.0.0.1'
      referer.port = String(targetPort)
      headers.referer = referer.toString()
    } catch {
      // leave a malformed referer out
    }
  }
  return headers
}

function rawUpgradeRequest(req: http.IncomingMessage, targetPort: number): string {
  const lines = [`${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/1.1`]
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    const name = req.rawHeaders[index]
    const lower = name.toLowerCase()
    let value = req.rawHeaders[index + 1]
    if (lower === 'host') value = proxyHostHeader(targetPort)
    else if (lower === 'origin') value = `http://${proxyHostHeader(targetPort)}`
    lines.push(`${name}: ${value}`)
  }
  return `${lines.join('\r\n')}\r\n\r\n`
}

function createProxy(targetPort: number): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const upstream = http.request(
        {
          host: '127.0.0.1',
          port: targetPort,
          method: req.method,
          path: req.url,
          headers: rewriteProxyRequest(req, targetPort)
        },
        (upstreamRes) => {
          const headers: http.OutgoingHttpHeaders = { ...upstreamRes.headers }
          delete headers['x-frame-options']
          delete headers['content-security-policy']
          delete headers['content-security-policy-report-only']
          delete headers.connection
          delete headers['keep-alive']
          delete headers['transfer-encoding']
          if (typeof headers.location === 'string') {
            headers.location = rewriteLocation(headers.location, targetPort)
          }
          const cookies = headers['set-cookie']
          if (Array.isArray(cookies)) headers['set-cookie'] = cookies.map(stripCookieDomain)
          else if (typeof cookies === 'string') headers['set-cookie'] = stripCookieDomain(cookies)
          res.writeHead(upstreamRes.statusCode ?? 502, headers)
          upstreamRes.pipe(res)
        }
      )
      upstream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' })
        }
        res.end(
          '<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;background:#0b0b0d;color:#f2f2f4;font-family:system-ui,sans-serif"><div style="text-align:center"><strong>Preview server is not reachable</strong><p style="color:#8b8b96">Check the command and logs in the preview window.</p></div></body></html>'
        )
      })
      req.pipe(upstream)
    })

    server.on('upgrade', (req, socket, head) => {
      const upstream = net.connect(targetPort, '127.0.0.1', () => {
        upstream.write(rawUpgradeRequest(req, targetPort))
        if (head.length) upstream.write(head)
        upstream.pipe(socket)
        socket.pipe(upstream)
      })
      upstream.on('error', () => socket.destroy())
      socket.on('error', () => upstream.destroy())
    })

    server.once('error', reject)
    server.listen(0, config.previewBind, () => {
      server.off('error', reject)
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Could not allocate a preview proxy port'))
        return
      }
      resolve({ server, port: address.port })
    })
  })
}

async function attachProxy(session: PreviewSession): Promise<void> {
  if (session.proxyServer && session.proxyPort) return
  const { server, port } = await createProxy(session.port)
  session.proxyServer = server
  session.proxyPort = port
}

function closeProxy(session: PreviewSession): void {
  const server = session.proxyServer
  session.proxyServer = null
  session.proxyPort = null
  if (!server) return
  try {
    server.closeAllConnections()
    server.close()
  } catch {
    // already closed
  }
}

function appendOutput(session: PreviewSession, chunk: Buffer): void {
  session.output = `${session.output}${chunk.toString('utf8')}`.slice(-OUTPUT_LIMIT)
}

function killChild(child: ChildProcess | null): void {
  if (!child?.pid) return
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM')
    else child.kill('SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {
      // already gone
    }
  }
  const timer = setTimeout(() => {
    try {
      if (process.platform !== 'win32') process.kill(-child.pid!, 'SIGKILL')
      else child.kill('SIGKILL')
    } catch {
      // already gone
    }
  }, 1500)
  timer.unref()
}

function statusOf(session: PreviewSession): PreviewStatus {
  return {
    projectId: session.projectId,
    status: session.status,
    command: session.command,
    port: session.port,
    cwd: session.cwd,
    framework: session.framework,
    proxyPort: session.proxyPort,
    url: session.proxyPort ? `http://localhost:${session.proxyPort}/` : null,
    output: session.output,
    error: session.error,
    owned: session.owned,
    detected: session.detection,
    startedAt: session.startedAt,
    readyAt: session.readyAt
  }
}

function emptyStatus(project: PreviewProject, detection: PreviewDetection): PreviewStatus {
  return {
    projectId: project.id,
    status: 'stopped',
    command: detection.command,
    port: detection.port,
    cwd: detection.cwd,
    framework: detection.framework,
    proxyPort: null,
    url: null,
    output: '',
    error: null,
    owned: false,
    detected: detection,
    startedAt: null,
    readyAt: null
  }
}

async function watchReady(session: PreviewSession): Promise<void> {
  const deadline = Date.now() + config.previewTimeoutMs
  while (session.status === 'starting' && Date.now() < deadline) {
    if (await isPortOpen(session.port)) {
      if (session.status !== 'starting') return
      try {
        await attachProxy(session)
        session.status = 'running'
        session.readyAt = Date.now()
        session.error = null
      } catch (error) {
        session.status = 'error'
        session.error = `Preview proxy failed: ${error instanceof Error ? error.message : String(error)}`
        if (session.owned) killChild(session.child)
      }
      return
    }
    if (session.owned && !session.child) return
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  if (session.status === 'starting') {
    session.status = 'error'
    session.error = `Timed out waiting for port ${session.port} after ${Math.round(
      config.previewTimeoutMs / 1000
    )}s. Check the output and command.`
    if (session.owned) killChild(session.child)
    closeProxy(session)
  }
}

export function getPreview(project: PreviewProject): PreviewStatus {
  const session = sessions.get(project.id)
  if (session) return statusOf(session)
  return emptyStatus(project, detectPreview(project.path))
}

export async function startPreview(project: PreviewProject, options: StartOptions = {}): Promise<PreviewStatus> {
  const existing = sessions.get(project.id)
  if (existing && (existing.status === 'starting' || existing.status === 'running')) {
    return statusOf(existing)
  }
  if (existing) {
    closeProxy(existing)
    sessions.delete(project.id)
  }

  const detection = detect(project.path)
  const cwd = resolveCwd(project.path, options.cwd ?? detection.cwd)
  const port = options.port === undefined ? detection.port : validatePort(options.port)
  const requestedCommand = options.command?.trim() ?? ''
  const command = requestedCommand || detection.build(port)
  if (!command) {
    throw new ConfigError('No dev command detected. Provide a command, for example "npm run dev".')
  }
  if (command.length > 2000) throw new ConfigError('command is too long')
  const unsafe = unsafeCommand(command, project.path)
  if (unsafe) throw new ConfigError(`Command blocked (${unsafe})`)

  const session: PreviewSession = {
    projectId: project.id,
    projectPath: project.path,
    detection,
    status: 'starting',
    command,
    port,
    cwd: cwd.rel,
    framework: detection.framework,
    output: '',
    error: null,
    owned: false,
    startedAt: Date.now(),
    readyAt: null,
    child: null,
    proxyServer: null,
    proxyPort: null,
    stopping: false
  }
  sessions.set(project.id, session)

  if (await isPortOpen(port)) {
    session.output = `Port ${port} is already open; attaching to the existing app.\n`
    void watchReady(session)
    return statusOf(session)
  }

  let child: ChildProcess
  try {
    child = spawn(process.env.SHELL || '/bin/sh', ['-lc', command], {
      cwd: cwd.abs,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '0.0.0.0',
        BROWSER: 'none',
        KS_PREVIEW_PORT: String(port),
        FORCE_COLOR: '3',
        COLORTERM: 'truecolor',
        TERM: 'xterm-256color',
        CLICOLOR_FORCE: '1'
      },
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (error) {
    session.status = 'error'
    session.error = error instanceof Error ? error.message : String(error)
    return statusOf(session)
  }

  session.child = child
  session.owned = true
  child.stdout?.on('data', (chunk: Buffer) => appendOutput(session, chunk))
  child.stderr?.on('data', (chunk: Buffer) => appendOutput(session, chunk))
  child.on('error', (error) => {
    if (session.stopping) return
    session.error = error.message
    session.status = 'error'
    session.child = null
    closeProxy(session)
  })
  child.on('exit', (code, signal) => {
    session.child = null
    closeProxy(session)
    if (session.stopping) return
    if (session.status === 'running') {
      session.status = 'stopped'
      session.error = `Preview process exited (${signal ?? `code ${code ?? 'unknown'}`}).`
      return
    }
    if (session.status === 'starting') {
      session.status = 'error'
      session.error = `Preview process exited before the port opened (${
        signal ?? `code ${code ?? 'unknown'}`
      }). Check the command and output.`
    }
  })

  void watchReady(session)
  return statusOf(session)
}

export async function openPreview(project: PreviewProject, port: number): Promise<PreviewStatus> {
  if (!(await isPortOpen(port))) {
    throw new ConfigError(
      `Nothing is listening on port ${port}. Start the server first (for example with run_shell), then open the preview with that port.`
    )
  }
  const existing = sessions.get(project.id)
  if (existing) {
    if (existing.port === port && (existing.status === 'running' || existing.status === 'starting')) {
      return statusOf(existing)
    }
    if (existing.status === 'running' || existing.status === 'starting') {
      throw new ConfigError(
        `Preview is already using port ${existing.port}. Stop it before opening port ${port}.`
      )
    }
    closeProxy(existing)
    sessions.delete(project.id)
  }

  const detection = detectPreview(project.path)
  const session: PreviewSession = {
    projectId: project.id,
    projectPath: project.path,
    detection,
    status: 'starting',
    command: '',
    port,
    cwd: detection.cwd,
    framework: detection.framework,
    output: `Attached to the server already running on port ${port}.\n`,
    error: null,
    owned: false,
    startedAt: Date.now(),
    readyAt: null,
    child: null,
    proxyServer: null,
    proxyPort: null,
    stopping: false
  }
  sessions.set(project.id, session)

  try {
    await attachProxy(session)
    session.status = 'running'
    session.readyAt = Date.now()
    session.error = null
    return statusOf(session)
  } catch (error) {
    session.status = 'error'
    session.error = `Preview proxy failed: ${error instanceof Error ? error.message : String(error)}`
    closeProxy(session)
    return statusOf(session)
  }
}

export function stopPreview(project: PreviewProject): PreviewStatus {
  const session = sessions.get(project.id)
  if (!session) return emptyStatus(project, detectPreview(project.path))
  session.stopping = true
  session.status = 'stopped'
  session.error = null
  if (session.owned) killChild(session.child)
  session.child = null
  closeProxy(session)
  return statusOf(session)
}

export function waitForPreview(projectId: string, timeoutMs = 25_000): Promise<PreviewStatus | null> {
  const session = sessions.get(projectId)
  if (!session) return Promise.resolve(null)
  if (session.status !== 'starting') return Promise.resolve(statusOf(session))
  return new Promise((resolve) => {
    const started = Date.now()
    const tick = () => {
      const current = sessions.get(projectId)
      if (!current || current.status !== 'starting' || Date.now() - started >= timeoutMs) {
        resolve(current ? statusOf(current) : null)
        return
      }
      setTimeout(tick, 250)
    }
    tick()
  })
}

export function describePreview(status: PreviewStatus, includeOutput = false): string {
  const lines = [`Preview status: ${status.status}`]
  if (status.port) {
    lines.push(`Port: ${status.port}${status.proxyPort ? ` (proxy ${status.proxyPort})` : ''}`)
  }
  if (status.url) lines.push(`URL: ${status.url}`)
  if (status.command) lines.push(`Command: ${status.command}`)
  lines.push(`Folder: ${status.cwd || '.'}`)
  if (status.framework) lines.push(`Framework: ${status.framework}`)
  if (status.owned === false && status.status === 'running') lines.push('Attached to an existing process.')
  if (status.error) lines.push(`Error: ${status.error}`)
  if (status.status === 'starting') lines.push('The app is still starting; the preview window updates automatically.')
  if (includeOutput && status.output.trim()) {
    lines.push('', 'Recent output:', status.output.slice(-3000).trimEnd())
  }
  return lines.join('\n')
}

export function stopAllPreviews(): void {
  for (const session of sessions.values()) {
    session.stopping = true
    if (session.owned) killChild(session.child)
    session.child = null
    closeProxy(session)
  }
  sessions.clear()
}
