import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import path from 'node:path'
import { config } from './config.js'

class ProcessManager extends EventEmitter {
  constructor() {
    super()
    this.proc = null
    this.state = 'stopped' // stopped | starting | running | stopping | crashed
    this.startedAt = null
    this.stoppedAt = null
    this.lastExitCode = null
    this.lastError = null
    this.restartAttempts = 0
    this.autoRestart = false
    this.cpuUsage = 0
    this.memUsage = 0
    this._cpuTick = null
  }

  isRunning() { return this.state === 'running' || this.state === 'starting' }

  buildCommand() {
    const cmd = config.mc.startCmd
    if (cmd.includes('%s')) {
      return cmd.replaceAll('%s', config.mc.serverDir)
    }
    return cmd
  }

  start({ autoRestart = false } = {}) {
    if (this.isRunning()) {
      throw new Error('Server is already running')
    }
    if (!config.mc.serverDir) throw new Error('MC_SERVER_DIR is not configured')

    this.autoRestart = autoRestart
    this.state = 'starting'
    this.lastError = null
    this.emit('state', this.getStatus())
    this.emit('log', { stream: 'system', line: `[panel] Starting Minecraft server...` })

    const fullCmd = this.buildCommand()
    // Use a shell so users can use cd "..." && java ... patterns as documented.
    const child = spawn(fullCmd, {
      cwd: config.mc.serverDir,
      shell: true,
      env: { ...process.env, TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.proc = child
    this.startedAt = Date.now()
    this.stoppedAt = null

    child.stdout.on('data', (buf) => {
      const text = buf.toString('utf8')
      text.split(/\r?\n/).filter(Boolean).forEach((line) => {
        this.emit('log', { stream: 'stdout', line })
      })
    })
    child.stderr.on('data', (buf) => {
      const text = buf.toString('utf8')
      text.split(/\r?\n/).filter(Boolean).forEach((line) => {
        this.emit('log', { stream: 'stderr', line })
      })
    })

    // Once we see a real PID and the JVM is alive, mark as running.
    const onReady = setTimeout(() => {
      if (this.state === 'starting') {
        this.state = 'running'
        this.emit('state', this.getStatus())
        this.emit('log', { stream: 'system', line: `[panel] Server marked as running (pid ${child.pid}).` })
      }
    }, 1500)
    // As soon as the process exits we need to mark stopped.
    child.on('exit', (code, signal) => {
      clearTimeout(onReady)
      this.lastExitCode = code
      this.stoppedAt = Date.now()
      this._stopCpuSampler()
      const wasRunning = this.state !== 'stopped' && this.state !== 'stopping'
      if (this.state === 'stopping') {
        this.state = 'stopped'
        this.emit('log', { stream: 'system', line: `[panel] Server stopped gracefully (exit ${code}).` })
        this.emit('state', this.getStatus())
      } else if (code === 0) {
        this.state = 'stopped'
        this.emit('log', { stream: 'system', line: `[panel] Server exited (code 0).` })
        this.emit('state', this.getStatus())
      } else {
        this.state = 'crashed'
        this.emit('log', { stream: 'system', line: `[panel] Server crashed (exit ${code}, signal ${signal}).` })
        this.emit('state', this.getStatus())
        if (this.autoRestart && wasRunning) {
          this.restartAttempts += 1
          if (this.restartAttempts <= 5) {
            setTimeout(() => {
              this.emit('log', { stream: 'system', line: `[panel] Auto-restart attempt ${this.restartAttempts}/5...` })
              try { this.start({ autoRestart: true }) } catch (e) { this.emit('log', { stream: 'system', line: `[panel] Auto-restart failed: ${e.message}` }) }
            }, 3000)
          }
        }
      }
      this.proc = null
    })

    child.on('error', (err) => {
      this.lastError = err.message
      this.emit('log', { stream: 'system', line: `[panel] Spawn error: ${err.message}` })
    })

    this._startCpuSampler()
    return { pid: child.pid }
  }

  sendCommand(line) {
    if (!this.proc || !this.proc.stdin || this.proc.killed) {
      throw new Error('Server is not running')
    }
    this.proc.stdin.write(line + '\n')
    this.emit('log', { stream: 'stdin', line: `> ${line}` })
    return true
  }

  async stop({ timeoutMs = 15000 } = {}) {
    if (!this.proc) throw new Error('Server is not running')
    this.state = 'stopping'
    this.emit('state', this.getStatus())
    this.emit('log', { stream: 'system', line: `[panel] Sending stop signal...` })
    this.autoRestart = false // user-initiated stop cancels auto-restart

    // Try graceful stdin "stop" first.
    try { this.proc.stdin.write('stop\n') } catch {}

    const start = Date.now()
    while (this.proc && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 250))
    }
    if (this.proc) {
      this.emit('log', { stream: 'system', line: `[panel] Graceful stop timed out, killing process...` })
      try { this.proc.kill('SIGTERM') } catch {}
      await new Promise((r) => setTimeout(r, 2000))
      if (this.proc) {
        try { this.proc.kill('SIGKILL') } catch {}
      }
    }
    return true
  }

  kill() {
    if (!this.proc) return false
    try { this.proc.kill('SIGKILL') } catch {}
    return true
  }

  getStatus() {
    return {
      state: this.state,
      running: this.isRunning(),
      pid: this.proc?.pid || null,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      uptimeMs: this.startedAt && this.isRunning() ? Date.now() - this.startedAt : 0,
      cpu: this.cpuUsage,
      memoryMB: this.memUsage,
      autoRestart: this.autoRestart,
      lastExitCode: this.lastExitCode,
      lastError: this.lastError,
      serverDir: config.mc.serverDir,
    }
  }

  _startCpuSampler() {
    let lastCpu = process.cpuUsage()
    let lastTs = Date.now()
    this._cpuTick = setInterval(() => {
      if (!this.proc?.pid) return
      const now = Date.now()
      const cur = process.cpuUsage()
      const elapsed = (now - lastTs) * 1000 // microseconds
      const used = (cur.user - lastCpu.user) + (cur.system - lastCpu.system)
      lastCpu = cur
      lastTs = now
      // Approximation: child process shares parent CPU. rss via OS-level would need
      // a platform-specific probe; we expose 0 for memory to avoid lying.
      this.cpuUsage = Math.min(100, Math.round((used / elapsed) * 100))
      this.memUsage = Math.round(process.memoryUsage().rss / 1024 / 1024)
      this.emit('metrics', { cpu: this.cpuUsage, memoryMB: this.memUsage })
    }, 2000)
  }

  _stopCpuSampler() {
    if (this._cpuTick) {
      clearInterval(this._cpuTick)
      this._cpuTick = null
    }
    this.cpuUsage = 0
    this.memUsage = 0
  }
}

export const processManager = new ProcessManager()
