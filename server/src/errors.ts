export class ConfigError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ConfigError'
    this.status = status
  }
}

export interface ProviderFailurePayload {
  error: string
  message: string
  status?: number
  code?: string
  title?: string
  details?: string
  retryAfterMs?: number
  attempts?: number
  retryable?: boolean
}

const STATUS_TITLES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  402: 'Payment Required',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  413: 'Payload Too Large',
  415: 'Unsupported Media Type',
  422: 'Unprocessable Entity',
  425: 'Too Early',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
  529: 'Service Overloaded'
}

export function statusTitle(status: number): string {
  return STATUS_TITLES[status] ?? (status > 0 ? `HTTP ${status}` : 'Provider error')
}

function bodyMessage(body: string, status: number): { message: string; code?: string } {
  const raw = body.trim()
  if (!raw) return { message: statusTitle(status) }
  try {
    const parsed = JSON.parse(raw) as unknown
    const candidate =
      parsed && typeof parsed === 'object' && 'error' in parsed
        ? (parsed as { error: unknown }).error
        : parsed
    if (typeof candidate === 'string' && candidate.trim()) {
      return { message: candidate.trim() }
    }
    if (candidate && typeof candidate === 'object') {
      const record = candidate as Record<string, unknown>
      const message = [record.message, record.detail, record.description].find(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      )
      const code = [record.code, record.type].find(
        (value): value is string => typeof value === 'string' && value.trim().length > 0
      )
      if (message || code) {
        return { message: message?.trim() ?? statusTitle(status), code: code?.trim() }
      }
    }
  } catch {
    // plain-text body
  }
  return { message: raw.slice(0, 1000) }
}

export class ProviderError extends Error {
  readonly status: number
  readonly title: string
  readonly code?: string
  readonly providerMessage: string
  readonly details?: string
  readonly retryAfterMs: number | null

  constructor(options: {
    status: number
    statusText?: string
    body?: string
    title?: string
    retryAfterMs?: number | null
  }) {
    const parsed = bodyMessage(options.body ?? '', options.status)
    const providerMessage =
      parsed.message.trim() || options.statusText?.trim() || statusTitle(options.status)
    super(options.status > 0 ? `Provider error ${options.status}: ${providerMessage}` : providerMessage)
    this.name = 'ProviderError'
    this.status = options.status
    this.title = options.title || options.statusText?.trim() || statusTitle(options.status)
    this.code = parsed.code
    this.providerMessage = providerMessage
    const raw = (options.body ?? '').trim()
    this.details = raw && raw !== providerMessage ? raw.slice(0, 4000) : undefined
    this.retryAfterMs = options.retryAfterMs ?? null
  }
}

export function parseRetryAfter(headers: Headers): number | null {
  const millis = headers.get('retry-after-ms')
  if (millis && /^\d+(?:\.\d+)?$/.test(millis.trim())) {
    return Math.max(0, Math.round(Number(millis)))
  }
  const value = headers.get('retry-after')
  if (!value) return null
  const text = value.trim()
  if (/^\d+(?:\.\d+)?$/.test(text)) return Math.max(0, Math.round(Number(text) * 1000))
  const date = Date.parse(text)
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now())
  return null
}

export function describeFailure(
  error: unknown,
  extras: { attempts?: number; retryable?: boolean } = {}
): ProviderFailurePayload {
  if (error instanceof ProviderError) {
    return {
      error: error.message,
      message: error.providerMessage,
      status: error.status > 0 ? error.status : undefined,
      code: error.code,
      title: error.title,
      details: error.details,
      retryAfterMs: error.retryAfterMs ?? undefined,
      attempts: extras.attempts,
      retryable: extras.retryable
    }
  }
  if (error instanceof Error) {
    const timeout = error.name === 'TimeoutError'
    return {
      error: error.message,
      message: error.message,
      title: timeout ? 'Provider timeout' : 'Request failed',
      attempts: extras.attempts,
      retryable: extras.retryable
    }
  }
  const message = String(error)
  return {
    error: message,
    message,
    title: 'Request failed',
    attempts: extras.attempts,
    retryable: extras.retryable
  }
}

export function errorStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status: unknown }).status)
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status
  }
  return 500
}
