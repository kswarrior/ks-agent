import Rcon from 'node-rcon'
import { config } from './config.js'

let rcon = null
let connecting = null

function isOpen() {
  return rcon && rcon.socket && !rcon.socket.destroyed
}

export function connectRcon() {
  return new Promise((resolve, reject) => {
    if (isOpen()) return resolve(true)
    if (connecting) return connecting.then(resolve, reject)
    if (!config.mc.rcon.password) {
      return reject(new Error('RCON_PASSWORD is not configured'))
    }
    const client = new Rcon(config.mc.rcon.port, config.mc.rcon.password, { host: config.mc.rcon.host })
    rcon = client
    connecting = new Promise((res, rej) => {
      const onReady = () => { connecting = null; cleanup(); res(true) }
      const onErr = (err) => { connecting = null; cleanup(); rej(err) }
      function cleanup() {
        client.off('auth', onReady)
        client.off('error', onErr)
      }
      client.once('auth', onReady)
      client.once('error', onErr)
      try { client.connect() } catch (e) { connecting = null; rej(e) }
    })
    client.on('error', (err) => {
      // surface to caller only; reconnect on next send
      rcon = null
    })
    client.on('end', () => { rcon = null })
    return connecting.then(resolve, reject)
  })
}

export function sendCommand(cmd) {
  return new Promise((resolve, reject) => {
    if (!isOpen()) {
      return reject(new Error('RCON not connected'))
    }
    rcon.send(cmd, (resp) => {
      // node-rcon returns undefined on errors
      if (resp === undefined || resp === null) {
        return reject(new Error('No RCON response'))
      }
      resolve(resp)
    })
  })
}

export async function sendSafe(cmd) {
  try {
    await connectRcon()
    return await sendCommand(cmd)
  } catch (e) {
    throw e
  }
}
