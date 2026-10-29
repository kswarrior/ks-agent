export class ConfigError extends Error {
  readonly status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ConfigError'
    this.status = status
  }
}

export function errorStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = Number((error as { status: unknown }).status)
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status
  }
  return 500
}
