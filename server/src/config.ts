import fs from 'node:fs'
import path from 'node:path'

const root = process.env.KS_ROOT_DIR ? path.resolve(process.env.KS_ROOT_DIR) : process.cwd()

export const config = {
  root,
  port: Number(process.env.PORT || 8787),
  dataDir: path.resolve(process.env.KS_DATA_DIR || path.join(root, 'storage')),
  projectsDir: path.resolve(process.env.KS_PROJECTS_DIR || path.join(root, 'project')),
  extensionsDir: path.resolve(process.env.KS_EXTENSIONS_DIR || path.join(root, 'extensions')),
  distDir: path.join(root, 'dist'),
  maxSteps: Math.max(1, Number(process.env.KS_MAX_STEPS || 30)),
  shellTimeoutMs: Math.max(1000, Number(process.env.KS_SHELL_TIMEOUT_MS || 120_000)),
  maxToolOutput: Math.max(1000, Number(process.env.KS_MAX_TOOL_OUTPUT || 40_000)),
  maxContextChars: Math.max(20_000, Number(process.env.KS_MAX_CONTEXT_CHARS || 240_000)),
  maxHistoryMessages: Math.max(10, Number(process.env.KS_MAX_HISTORY_MESSAGES || 120)),
  providerRetries: Math.max(0, Number(process.env.KS_PROVIDER_RETRIES || 2)),
  providerRetryDelayMs: Math.max(100, Number(process.env.KS_PROVIDER_RETRY_DELAY_MS || 1000)),
  dockerJail: process.env.KS_DOCKER_JAIL === '1',
  dockerImage: process.env.KS_DOCKER_IMAGE || 'node:20-alpine'
}

for (const dir of [config.dataDir, config.projectsDir, config.extensionsDir]) {
  fs.mkdirSync(dir, { recursive: true })
}

export function isInside(rootPath: string, candidate: string): boolean {
  const rootAbs = path.resolve(rootPath)
  const abs = path.resolve(candidate)
  return abs === rootAbs || abs.startsWith(rootAbs + path.sep)
}
