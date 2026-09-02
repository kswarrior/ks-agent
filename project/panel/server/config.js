import 'dotenv/config'
import path from 'node:path'

function required(name, fallback) {
  const v = process.env[name]
  if (v === undefined || v === '') {
    if (fallback !== undefined) return fallback
    throw new Error(`Missing required env var: ${name}`)
  }
  return v
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  jwtExpiresIn: '12h',
  admin: {
    user: required('ADMIN_USER', 'admin'),
    // bcrypt hash of "admin" — change via register endpoint or .env
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
    plainPassword: process.env.ADMIN_PASSWORD || '',
  },
  mc: {
    serverDir: process.env.MC_SERVER_DIR || path.resolve(process.cwd(), 'mc-server'),
    javaBin: process.env.JAVA_BIN || 'java',
    startCmd: process.env.MC_START_CMD || 'cd "%s" && java -Xmx1024M -Xms1024M -jar server.jar nogui',
    stopCmd: process.env.MC_STOP_CMD || '',
    logFile: process.env.MC_LOG_FILE || 'logs/latest.log',
    rcon: {
      host: process.env.RCON_HOST || '127.0.0.1',
      port: parseInt(process.env.RCON_PORT || '25575', 10),
      password: process.env.RCON_PASSWORD || '',
    },
  },
  // Hard safety rails for the file manager
  fs: {
    maxUploadBytes: 50 * 1024 * 1024, // 50 MB
    maxEditBytes: 1 * 1024 * 1024,    // 1 MB editor cap
    denyPatterns: [
      /(^|\/)\.\./,        // path traversal
      /\/\.(git|env|svn|hg)/i,
    ],
  },
}
