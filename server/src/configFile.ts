import fs from 'node:fs'
import path from 'node:path'
import { ConfigError } from './errors.js'

export function readJsonConfig(file: string): Record<string, unknown> {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw new ConfigError(`Could not read ${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!raw.trim()) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw) as unknown
  } catch (error) {
    throw new ConfigError(`Invalid JSON in ${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError(`${path.basename(file)} must contain a JSON object.`)
  }
  return parsed as Record<string, unknown>
}

export function writeJsonConfig(file: string, value: Record<string, unknown>): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  fs.renameSync(temp, file)
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}
