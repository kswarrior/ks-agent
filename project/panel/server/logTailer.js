import fs from 'node:fs'
import fsP from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { EventEmitter } from 'node:events'
import { config } from './config.js'

class LogTailer extends EventEmitter {
  constructor() {
    super()
    this.watcher = null
    this.stream = null
    this.rl = null
    this.currentPath = null
    this.lastSize = 0
    this.buffer = []      // last N lines for replay
    this.maxBuffer = 500
  }

  absPath() {
    const p = config.mc.logFile
    if (path.isAbsolute(p)) return p
    return path.join(config.mc.serverDir, p)
  }

  async start() {
    const target = this.absPath()
    this.currentPath = target

    // Read existing content once for replay, then tail.
    try {
      const stat = await fsP.stat(target)
      this.lastSize = stat.size
      const stream = fs.createReadStream(target, { encoding: 'utf8', start: Math.max(0, stat.size - 32 * 1024) })
      const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
      const lines = []
      rl.on('line', (line) => {
        lines.push(line)
        if (lines.length > this.maxBuffer) lines.shift()
      })
      await new Promise((res) => rl.once('close', res))
      this.buffer = lines
    } catch (e) {
      this.buffer = []
    }

    this._attach(target)
  }

  _attach(target) {
    try {
      this.stream = fs.createReadStream(target, { encoding: 'utf8', start: this.lastSize })
      this.rl = readline.createInterface({ input: this.stream, crlfDelay: Infinity })
      this.rl.on('line', (line) => {
        this._pushLine(line)
      })
      this.rl.on('close', () => {
        // Re-attach: file might have been rotated/truncated
        setTimeout(() => this._reattachIfChanged(), 500)
      })
    } catch (e) {
      this.emit('error', e)
    }
  }

  async _reattachIfChanged() {
    try {
      const stat = await fsP.stat(this.currentPath)
      if (stat.size < this.lastSize) {
        // Truncated/rotated — restart from beginning for replay then tail new content
        this.lastSize = 0
      }
      this._attach(this.currentPath)
    } catch {
      // File may not exist yet; retry
      setTimeout(() => this._reattachIfChanged(), 1000)
    }
  }

  _pushLine(line) {
    this.buffer.push(line)
    if (this.buffer.length > this.maxBuffer) this.buffer.shift()
    this.emit('line', line)
  }

  recentLines() {
    return this.buffer.slice()
  }
}

export const logTailer = new LogTailer()
