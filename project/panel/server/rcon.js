import { Rcon } from 'rcon'
import { config } from './config.js'

let rcon = null
let connecting = null

function isOpen() {
  return rcon && rcon.connected
}

export function connectRcon() {
  return new Promise((resolve, reject) => {
    if (isOpen()) return resolve(true)
    if (connecting) return connecting.then(resolve, reject)
    if (!config.mc.rcon.password) {
      return reject(new Error('RCON_PASSWORD is not configured'))
    }
    const client = new Rcon(config.mc.rcon.host, config.mc.rcon.port, config.mc.rcon.password)
    rcon = client
    connecting = client.connect()
      .then(() => {
        connecting = null
        resolve(true)
      })
      .catch((e) => {
        connecting = null
        rcon = null
        reject(e)
      })
    client.on('error', () => {
      rcon = null
    })
    return connecting
  })
}

export function sendCommand(cmd) {
  return new Promise((resolve, reject) => {
    if (!isOpen()) {
      return reject(new Error('RCON not connected'))
    }
    const response = rcon.send(cmd)
    if (response === undefined || response === null) {
      return reject(new Error('No RCON response'))
    }
    resolve(response)
  })
}

export async function sendSafe(cmd) {
  try {
    await connectRcon()
    if (!isOpen()) {
      throw new Error('RCON connection failed')
    }
    return await sendCommand(cmd)
  } catch (e) {
    throw e
  }
}