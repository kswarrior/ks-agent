import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export function isDockerJailEnabled(): boolean {
  const v = process.env.KS_DOCKER_JAIL
  return v === '1' || v?.toLowerCase() === 'true'
}

export function getDockerImage(): string {
  const raw = process.env.KS_DOCKER_IMAGE?.trim()
  if (!raw) return 'node:20-alpine'
  if (raw.length > 200) {
    console.warn(`[docker] KS_DOCKER_IMAGE too long, fallback to node:20-alpine`)
    return 'node:20-alpine'
  }
  if (raw.includes('\0') || raw.includes('\n') || raw.includes(';') || raw.includes('&') || raw.includes('|') || raw.includes('`') || raw.includes('$') || raw.includes('>') || raw.includes('<')) {
    console.warn(`[docker] KS_DOCKER_IMAGE contains illegal chars, fallback to node:20-alpine`)
    return 'node:20-alpine'
  }
  if (!/^[a-zA-Z0-9\/._:-]+$/.test(raw)) {
    console.warn(`[docker] Invalid KS_DOCKER_IMAGE "${raw}", fallback to node:20-alpine`)
    return 'node:20-alpine'
  }
  return raw
}

let cachedAvailable: boolean | null = null
let cachedAt = 0
const CACHE_MS = 60_000

export async function isDockerAvailable(): Promise<boolean> {
  if (!isDockerJailEnabled()) return false
  const now = Date.now()
  if (cachedAvailable !== null && now - cachedAt < CACHE_MS) return cachedAvailable
  const available = await new Promise<boolean>((resolve) => {
    exec('docker --version', { timeout: 5000 }, (err, stdout) => {
      if (err) resolve(false)
      else resolve(!!stdout && stdout.toLowerCase().includes('docker'))
    })
  })
  cachedAvailable = available
  cachedAt = now
  if (!available) console.warn('[docker] KS_DOCKER_JAIL=1 but docker not available — falling back to native jail')
  return available
}

export function isDockerAvailableSync(): boolean {
  if (!isDockerJailEnabled()) return false
  // prefer cached async result if available
  if (cachedAvailable !== null) return cachedAvailable
  try {
    if (fs.existsSync('/usr/bin/docker') || fs.existsSync('/usr/local/bin/docker')) return true
    const pathEnv = process.env.PATH || ''
    for (const dir of pathEnv.split(':')) {
      if (!dir) continue
      try {
        if (fs.existsSync(path.join(dir, 'docker'))) return true
      } catch {}
    }
    return false
  } catch {
    return false
  }
}

export function buildDockerRunArgs(hostProjectPath: string, image: string, extra: string[] = []): string[] {
  const abs = path.resolve(hostProjectPath)
  return ['run', '--rm', '--network', 'none', '--memory=512m', '--cpus=1', '-v', `${abs}:/workspace:rw`, '-w', '/workspace', ...extra, image]
}

export async function dockerExecShell(command: string, hostProjectPath: string): Promise<{ code: number; output: string } | null> {
  const { spawn } = await import('node:child_process')
  const image = getDockerImage()
  const abs = path.resolve(hostProjectPath)
  const args = buildDockerRunArgs(abs, image, [])
  args.push('sh', '-c', command)
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let done = false
    const cp = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => {
      if (done) return
      done = true
      try { cp.kill('SIGKILL') } catch {}
      const out = (stdout + stderr).slice(0, 32 * 1024)
      resolve({ code: 124, output: out + '\n[docker] timeout after 300s' })
    }, 300_000)
    cp.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString()
      if (stdout.length > 32 * 1024) stdout = stdout.slice(0, 32 * 1024)
    })
    cp.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
      if (stderr.length > 32 * 1024) stderr = stderr.slice(0, 32 * 1024)
    })
    cp.on('error', (err: any) => {
      if (done) return
      done = true
      clearTimeout(timer)
      console.warn('[docker] docker spawn failed, fallback to native:', err?.message || err)
      resolve(null)
    })
    cp.on('close', (code: number | null) => {
      if (done) return
      done = true
      clearTimeout(timer)
      const raw = stdout + stderr
      const output = raw.slice(0, 32 * 1024)
      const truncated = raw.length > 32 * 1024 ? '\n…[truncated]' : ''
      resolve({ code: code ?? 1, output: output + truncated })
    })
  })
}
