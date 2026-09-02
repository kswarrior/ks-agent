import { EventEmitter } from 'node:events'
import { logTailer } from './logTailer.js'

// Minecraft log lines look like:
// [12:34:56] [Server thread/INFO]: PlayerName joined the game
// [12:34:56] [Server thread/INFO]: PlayerName left the game
// [12:34:56] [Server thread/INFO]: PlayerName lost connection: ...

const JOIN_RE = /:\s+(\S+) joined the game/
const LEAVE_RE = /:\s+(\S+) (?:left the game|lost connection)/

class PlayerTracker extends EventEmitter {
  constructor() {
    super()
    this.online = new Map() // name -> { joinedAt }
    this._onLine = this._onLine.bind(this)
  }

  start() {
    // Seed from existing log lines (helps after a panel restart)
    for (const line of logTailer.recentLines()) {
      this._onLine(line, /*silent*/ true)
    }
    logTailer.on('line', (l) => this._onLine(l, false))
  }

  _onLine(line, silent) {
    let m
    if ((m = line.match(JOIN_RE))) {
      const name = m[1]
      if (!this.online.has(name)) {
        this.online.set(name, { joinedAt: Date.now() })
        if (!silent) this.emit('change', this.list())
      }
    } else if ((m = line.match(LEAVE_RE))) {
      const name = m[1]
      if (this.online.delete(name)) {
        if (!silent) this.emit('change', this.list())
      }
    }
  }

  list() {
    return Array.from(this.online.entries()).map(([name, info]) => ({
      name,
      joinedAt: info.joinedAt,
      uptimeMs: Date.now() - info.joinedAt,
    }))
  }
}

export const playerTracker = new PlayerTracker()
