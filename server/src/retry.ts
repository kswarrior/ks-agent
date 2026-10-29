import { config } from './config.js'
import { getSetting, setSetting } from './db.js'
import { ProviderError } from './errors.js'

export interface RetrySettings {
  enabled: boolean
  unlimited: boolean
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  multiplier: number
  jitter: boolean
  retryOnNetwork: boolean
  retryOnServerErrors: boolean
  retryOnStatusCodes: number[]
  honorRetryAfter: boolean
}

const RETRY_SETTINGS_KEY = 'retrySettings'

export const DEFAULT_RETRY_SETTINGS: RetrySettings = {
  enabled: true,
  unlimited: false,
  maxRetries: Math.max(0, config.providerRetries),
  baseDelayMs: Math.max(100, config.providerRetryDelayMs),
  maxDelayMs: Math.max(1000, config.providerRetryDelayMs * 10),
  multiplier: 2,
  jitter: true,
  retryOnNetwork: true,
  retryOnServerErrors: true,
  retryOnStatusCodes: [408, 409, 425, 429],
  honorRetryAfter: true
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number)))
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.min(max, Math.max(min, Math.round(number * 100) / 100))
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readStatusCodes(value: unknown, fallback: number[]): number[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,]+/)
      : null
  if (!source) return [...fallback]
  const codes = source
    .map((entry) => (typeof entry === 'number' ? entry : Number(String(entry).trim())))
    .filter((entry) => Number.isInteger(entry) && entry >= 400 && entry <= 599)
  return [...new Set(codes)].sort((a, b) => a - b).slice(0, 20)
}

export function normalizeRetrySettings(
  value: unknown,
  base: RetrySettings = DEFAULT_RETRY_SETTINGS
): RetrySettings {
  const input =
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const baseDelayMs = clampInt(input.baseDelayMs, base.baseDelayMs, 100, 120_000)
  const maxDelayMs = Math.max(baseDelayMs, clampInt(input.maxDelayMs, base.maxDelayMs, 100, 600_000))
  return {
    enabled: readBoolean(input.enabled, base.enabled),
    unlimited: readBoolean(input.unlimited, base.unlimited),
    maxRetries: clampInt(input.maxRetries, base.maxRetries, 0, 100),
    baseDelayMs,
    maxDelayMs,
    multiplier: clampNumber(input.multiplier, base.multiplier, 1, 10),
    jitter: readBoolean(input.jitter, base.jitter),
    retryOnNetwork: readBoolean(input.retryOnNetwork, base.retryOnNetwork),
    retryOnServerErrors: readBoolean(input.retryOnServerErrors, base.retryOnServerErrors),
    retryOnStatusCodes: readStatusCodes(input.retryOnStatusCodes, base.retryOnStatusCodes),
    honorRetryAfter: readBoolean(input.honorRetryAfter, base.honorRetryAfter)
  }
}

export function getRetrySettings(): RetrySettings {
  const raw = getSetting(RETRY_SETTINGS_KEY)
  if (!raw) return { ...DEFAULT_RETRY_SETTINGS, retryOnStatusCodes: [...DEFAULT_RETRY_SETTINGS.retryOnStatusCodes] }
  try {
    return normalizeRetrySettings(JSON.parse(raw) as unknown)
  } catch {
    return { ...DEFAULT_RETRY_SETTINGS, retryOnStatusCodes: [...DEFAULT_RETRY_SETTINGS.retryOnStatusCodes] }
  }
}

export function saveRetrySettings(value: unknown): RetrySettings {
  const settings = normalizeRetrySettings(value, getRetrySettings())
  setSetting(RETRY_SETTINGS_KEY, JSON.stringify(settings))
  return settings
}

export function isRetryableProviderError(error: unknown, settings: RetrySettings): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return false
  if (error.name === 'TimeoutError') return settings.retryOnNetwork
  if (error instanceof ProviderError) {
    if (error.status >= 500) {
      return settings.retryOnServerErrors || settings.retryOnStatusCodes.includes(error.status)
    }
    return error.status > 0 && settings.retryOnStatusCodes.includes(error.status)
  }
  return (
    settings.retryOnNetwork &&
    /fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|UND_ERR/i.test(
      error.message
    )
  )
}

export function retryDelayMs(error: unknown, attempt: number, settings: RetrySettings): number {
  const exponential = settings.baseDelayMs * Math.pow(settings.multiplier, attempt)
  let delay = Math.min(settings.maxDelayMs, exponential)
  if (settings.jitter) {
    delay = Math.min(settings.maxDelayMs, delay * (0.75 + Math.random() * 0.25))
  }
  if (settings.honorRetryAfter && error instanceof ProviderError && error.retryAfterMs !== null) {
    delay = Math.max(delay, Math.min(error.retryAfterMs, settings.maxDelayMs))
  }
  return Math.max(100, Math.round(delay))
}
