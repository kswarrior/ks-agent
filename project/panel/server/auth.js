import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { config } from './config.js'

let cachedHash = null

function getAdminHash() {
  if (cachedHash) return cachedHash
  if (config.admin.passwordHash) {
    cachedHash = config.admin.passwordHash
    return cachedHash
  }
  if (config.admin.plainPassword) {
    cachedHash = bcrypt.hashSync(config.admin.plainPassword, 10)
    return cachedHash
  }
  // Default dev hash for password "admin" — printed on first start so it's obvious.
  cachedHash = bcrypt.hashSync('admin', 10)
  return cachedHash
}

export function verifyCredentials(username, password) {
  if (username !== config.admin.user) return false
  return bcrypt.compareSync(password, getAdminHash())
}

export function signToken(user) {
  return jwt.sign({ sub: user, role: 'admin' }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  })
}

export function authMiddleware(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  try {
    const payload = jwt.verify(token, config.jwtSecret)
    req.user = payload
    next()
  } catch (err) {
    return res.status(401).json({ error: 'invalid_token' })
  }
}

export function wsAuthenticate(req) {
  const url = new URL(req.url, 'http://localhost')
  const token = url.searchParams.get('token')
  if (!token) return null
  try {
    return jwt.verify(token, config.jwtSecret)
  } catch {
    return null
  }
}
