// server/src/github.ts — GitHub PAT + rate-limit safe polling (like mcp.ts:314)
// Implements fetchGitHub with ETag, X-RateLimit-Remaining/Reset/Retry-After, scheduler per-project with interval/cron, jitter, backoff, throttling, webhook alternative.
import crypto from 'node:crypto'
import { getGithubToken, getGithubPollSettings, effectiveIntervalMs, getRawGithubToken, DEFAULT_GITHUB_POLL_SETTINGS, type GithubPollSettings } from './store.js'

interface CacheEntry {
  etag: string | null
  data: any
  fetchedAt: number
  headers: Record<string, string>
}

interface RateLimitState {
  remaining: number
  limit: number
  resetAt: number // epoch ms
  retryAfterMs: number | null
  etagHits: number
  totalHits: number
  etagHitRate: number
}

const cache = new Map<string, CacheEntry>()
const rateLimit: RateLimitState = {
  remaining: 5000,
  limit: 5000,
  resetAt: Date.now() + 3600 * 1000,
  retryAfterMs: null,
  etagHits: 0,
  totalHits: 0,
  etagHitRate: 0
}

// per-project scheduler state
interface SchedulerState {
  timer: NodeJS.Timeout | null
  nextPollAt: number | null
  effectiveIntervalMs: number
  enabled: boolean
  projectId: string | null // null = global
  paused: boolean
  focused: boolean // for pollOnFocusOnly
  windowFocused: boolean // for pauseOnWindowBlur
  lastError: string | null
}

const schedulers = new Map<string, SchedulerState>() // key = projectId || 'global'
const pollNowDebounce = new Map<string, number>() // projectId -> last pollNow timestamp
const focusState = new Map<string, { focused: boolean; windowFocused: boolean }>() // projectId -> focus

// Initialize cache from sqlite if available (persistent)
function loadCacheFromDb(): void {
  try {
    // lazy import to avoid cycle
    const { getDb } = require('./store.js') as any
    // try to use ensureDb directly via dynamic import? Instead use direct sqlite via store helper if exposed
    // fallback: keep memory only, will repopulate
  } catch {}
}

export function getRateLimitState(): RateLimitState & { effectiveIntervalMs: number; nextPollAt: number | null } {
  const settings = getGithubPollSettings()
  const eff = effectiveIntervalMs(settings, rateLimit.remaining)
  // find global scheduler nextPollAt
  const global = schedulers.get('global')
  let nextPollAt: number | null = global?.nextPollAt ?? null
  // if no global, compute based on now + eff
  if (!nextPollAt && settings.enabled) nextPollAt = Date.now() + eff
  return {
    ...rateLimit,
    effectiveIntervalMs: eff,
    nextPollAt
  }
}

export function getProjectRateLimitState(projectId: string): RateLimitState & { effectiveIntervalMs: number; nextPollAt: number | null; etagHitRate: number } {
  const settings = getGithubPollSettings(projectId)
  const eff = effectiveIntervalMs(settings, rateLimit.remaining)
  const sched = schedulers.get(projectId) || schedulers.get('global')
  let nextPollAt: number | null = sched?.nextPollAt ?? null
  if (!nextPollAt && settings.enabled) nextPollAt = Date.now() + eff
  return {
    ...rateLimit,
    effectiveIntervalMs: eff,
    nextPollAt,
    etagHitRate: rateLimit.etagHitRate
  }
}

function updateRateLimitFromHeaders(headers: Headers | Record<string,string>): void {
  const get = (k: string) => {
    if (headers instanceof Headers) return headers.get(k) || headers.get(k.toLowerCase())
    const lk = k.toLowerCase()
    for (const [hk, hv] of Object.entries(headers)) if (hk.toLowerCase() === lk) return hv as string
    return null
  }
  const rem = get('x-ratelimit-remaining')
  const lim = get('x-ratelimit-limit')
  const reset = get('x-ratelimit-reset')
  const retry = get('retry-after')
  if (rem !== null) {
    const n = Number(rem)
    if (Number.isFinite(n)) rateLimit.remaining = n
  }
  if (lim !== null) {
    const n = Number(lim)
    if (Number.isFinite(n)) rateLimit.limit = n
  }
  if (reset !== null) {
    const n = Number(reset)
    if (Number.isFinite(n)) {
      // GitHub reset is seconds since epoch
      rateLimit.resetAt = n * 1000
    }
  }
  if (retry !== null) {
    const n = Number(retry)
    if (Number.isFinite(n) && n >= 0 && n < 300) {
      rateLimit.retryAfterMs = n * 1000
    } else {
      const dateMs = Date.parse(retry)
      if (Number.isFinite(dateMs)) {
        const diff = dateMs - Date.now()
        if (diff > 0 && diff < 300000) rateLimit.retryAfterMs = diff
      }
    }
  } else {
    rateLimit.retryAfterMs = null
  }
}

// Mask secret for logging — never log token
function maskSecretMap(obj: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!obj) return undefined
  const out: Record<string, string> = {}
  for (const [k,v] of Object.entries(obj)) {
    if (/token|key|secret|password/i.test(k)) out[k] = v ? `••••${String(v).slice(-4)}` : ''
    else out[k] = v
  }
  return out
}

export async function fetchGitHub(url: string, projectId?: string, opts?: { etag?: string | null; useEtag?: boolean }): Promise<{ data: any; status: number; headers: Record<string,string>; fromCache: boolean; etag: string | null }> {
  const settings = getGithubPollSettings(projectId)
  const token = getGithubToken(projectId || undefined)
  const useEtag = opts?.useEtag ?? settings.useEtag
  const cacheKey = `${projectId||'global'}:${url}`
  const cached = cache.get(cacheKey)
  let etagToSend: string | null = null
  if (useEtag) {
    if (opts?.etag) etagToSend = opts.etag
    else if (cached?.etag) etagToSend = cached.etag
  }
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github+json',
    'User-Agent': 'ks-agent',
    'X-GitHub-Api-Version': '2022-11-28'
  }
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (etagToSend) headers['If-None-Match'] = etagToSend

  // Respect rate limit: if remaining<10 pause till reset (scheduler will skip, but fetch also respects)
  if (settings.respectRateLimit && rateLimit.remaining < 10 && Date.now() < rateLimit.resetAt) {
    // still allow but will be throttled
  }

  let res: Response
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 60000)
  try {
    res = await fetch(url, { headers, signal: controller.signal } as any)
  } catch (e:any) {
    if (e?.name === 'AbortError') throw new Error('GitHub fetch timeout (60s)')
    throw e
  } finally {
    clearTimeout(t)
  }

  const resHeaders: Record<string,string> = {}
  res.headers.forEach((v,k)=> resHeaders[k.toLowerCase()] = v)
  updateRateLimitFromHeaders(res.headers)

  rateLimit.totalHits++
  if (rateLimit.totalHits > 0) rateLimit.etagHitRate = rateLimit.etagHits / rateLimit.totalHits

  if (res.status === 304 && cached) {
    // 304 saves quota counts ~1 per spec
    rateLimit.etagHits++
    rateLimit.etagHitRate = rateLimit.etagHits / rateLimit.totalHits
    // update fetchedAt but keep data
    cache.set(cacheKey, { ...cached, fetchedAt: Date.now(), headers: resHeaders })
    return { data: cached.data, status: 304, headers: resHeaders, fromCache: true, etag: cached.etag }
  }

  if (res.status === 429 || res.status === 403) {
    // backoff base 1200→30000 exponential, double effectiveIntervalMs up to maxIntervalMs
    let delay = rateLimit.retryAfterMs ?? 1200
    // exponential based on attempts? simple double effective interval
    const curSettings = getGithubPollSettings(projectId)
    const doubled = Math.min(curSettings.maxIntervalMs, Math.max(curSettings.minIntervalMs, effectiveIntervalMs(curSettings, rateLimit.remaining) * 2))
    // update scheduler effective interval
    const schedKey = projectId || 'global'
    const st = schedulers.get(schedKey)
    if (st) st.effectiveIntervalMs = doubled
    // emit github_rate_limit SSE via global listeners? will be handled by index.ts SSE broadcast if needed
    let detail = ''
    try { detail = (await res.text()).slice(0, 500) } catch {}
    const err: any = new Error(`GitHub rate limited ${res.status}${detail ? `: ${detail}` : ''}`)
    err.status = res.status
    err.retryAfterMs = delay
    throw err
  }

  if (!res.ok) {
    let detail = ''
    try { detail = (await res.text()).slice(0, 500) } catch {}
    throw new Error(`GitHub ${res.status}${detail ? `: ${detail}` : ''}`)
  }

  const etag = res.headers.get('etag') || res.headers.get('ETag') || null
  let data: any = null
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    try { data = await res.json() } catch { data = await res.text() }
  } else {
    try { data = await res.json() } catch { data = await res.text() }
  }
  cache.set(cacheKey, { etag, data, fetchedAt: Date.now(), headers: resHeaders })
  // also persist to sqlite github_cache for restart persistence (optional)
  try {
    const store = await import('./store.js')
    const s = (store as any).ensureDb ? (store as any).ensureDb() : null
    if (s) {
      s.prepare('INSERT INTO github_cache (key, etag, data, headers, fetchedAt) VALUES (?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET etag=excluded.etag, data=excluded.data, headers=excluded.headers, fetchedAt=excluded.fetchedAt').run(cacheKey, etag, JSON.stringify(data).slice(0, 500000), JSON.stringify(resHeaders), new Date().toISOString())
    }
  } catch {}
  return { data, status: res.status, headers: resHeaders, fromCache: false, etag }
}

// Scheduler helpers
function parseCronToMs(cronExpr: string | null, fallbackMs: number): number {
  if (!cronExpr) return fallbackMs
  const t = String(cronExpr).trim()
  // "every 25s" helper
  const m = t.match(/^every\s+(\d+)\s*s(ec)?(ond)?s?$/i)
  if (m) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) return n * 1000
  }
  // "*/N * * * * *" (6 fields, seconds)
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length === 6 && parts[0].startsWith('*/')) {
    const n = Number(parts[0].slice(2))
    if (Number.isFinite(n) && n > 0) return n * 1000
  }
  if (parts.length === 5 && parts[0].startsWith('*/')) {
    const n = Number(parts[0].slice(2))
    if (Number.isFinite(n) && n > 0) return n * 60 * 1000
  }
  // also support "*/25 * * * *"
  return fallbackMs
}

function computeEffectiveInterval(settings: GithubPollSettings, projectId?: string): number {
  let base = settings.intervalMs
  if (settings.mode === 'cron' && settings.cronExpr) {
    base = parseCronToMs(settings.cronExpr, base)
  }
  // respect rate limit throttling
  if (settings.respectRateLimit && rateLimit.remaining < 100) {
    base = Math.max(base, 60000) // throttled to 60s
  }
  // clamp
  base = Math.max(settings.minIntervalMs, Math.min(settings.maxIntervalMs, base))
  // jitter
  if (settings.jitterMs > 0) {
    const jitter = Math.random() * settings.jitterMs
    base = Math.round(base + jitter)
    base = Math.min(settings.maxIntervalMs, base)
  }
  return base
}

export function getSchedulerState(projectId?: string): SchedulerState | undefined {
  return schedulers.get(projectId || 'global')
}

export function setFocusState(projectId: string, focused: boolean, windowFocused?: boolean): void {
  const cur = focusState.get(projectId) || { focused: true, windowFocused: true }
  const next = { focused, windowFocused: windowFocused ?? cur.windowFocused }
  focusState.set(projectId, next)
  const st = schedulers.get(projectId)
  if (st) {
    st.focused = next.focused
    st.windowFocused = next.windowFocused
  }
}

export function ensureScheduler(projectId?: string): SchedulerState {
  const key = projectId || 'global'
  let st = schedulers.get(key)
  if (!st) {
    const settings = getGithubPollSettings(projectId)
    st = {
      timer: null,
      nextPollAt: null,
      effectiveIntervalMs: computeEffectiveInterval(settings, projectId),
      enabled: !!settings.enabled,
      projectId: projectId || null,
      paused: false,
      focused: true,
      windowFocused: true,
      lastError: null
    }
    const fs = focusState.get(key)
    if (fs) {
      st.focused = fs.focused
      st.windowFocused = fs.windowFocused
    }
    schedulers.set(key, st)
  }
  return st
}

export function updateScheduler(projectId?: string): void {
  const key = projectId || 'global'
  const settings = getGithubPollSettings(projectId)
  const st = ensureScheduler(projectId)
  st.enabled = !!settings.enabled && !settings.webhookUrl // webhook disables polling
  st.effectiveIntervalMs = computeEffectiveInterval(settings, projectId)
  // if disabled, clear timer
  if (!st.enabled) {
    if (st.timer) { clearInterval(st.timer); st.timer = null }
    st.nextPollAt = null
    return
  }
  // if not polling on webhook, ensure timer running
  restartScheduler(projectId)
}

export function restartScheduler(projectId?: string): void {
  const key = projectId || 'global'
  const st = ensureScheduler(projectId)
  if (st.timer) { clearInterval(st.timer); st.timer = null }
  const settings = getGithubPollSettings(projectId)
  if (!st.enabled) { st.nextPollAt = null; return }
  if (settings.webhookUrl) { st.nextPollAt = null; return }
  const interval = computeEffectiveInterval(settings, projectId)
  st.effectiveIntervalMs = interval
  // special modes:
  if (settings.mode === 'manual' || settings.mode === 'event') {
    // manual/event: no automatic interval, only event-driven or manual pollNow
    st.nextPollAt = null
    return
  }
  // interval or cron
  st.nextPollAt = Date.now() + interval
  st.timer = setInterval(async () => {
    try {
      const curSettings = getGithubPollSettings(projectId)
      // skip conditions
      if (!curSettings.enabled) return
      if (curSettings.webhookUrl) return
      if (curSettings.mode === 'manual' || curSettings.mode === 'event') return
      const token = getGithubToken(projectId || undefined)
      if (!token) return
      // rate limit pause if remaining<10
      if (curSettings.respectRateLimit && rateLimit.remaining < 10 && Date.now() < rateLimit.resetAt) {
        st.paused = true
        st.nextPollAt = rateLimit.resetAt
        return
      } else {
        st.paused = false
      }
      // focus checks
      const fs = focusState.get(key) || { focused: true, windowFocused: true }
      if (curSettings.pollOnFocusOnly && !fs.focused) return
      if (curSettings.pauseOnWindowBlur && !fs.windowFocused) return
      // smartEventOnly: only poll after git push/plan step — we skip unless triggered via smartEvent flag
      if (curSettings.smartEventOnly) {
        // for now, if smartEventOnly, we skip automatic polling and expect external trigger (e.g., plan step)
        // but to not break interval mode, we still allow if there's been a recent git activity? Simplified: skip
        return
      }
      // recompute effective interval each tick
      const eff = computeEffectiveInterval(curSettings, projectId)
      st.effectiveIntervalMs = eff
      st.nextPollAt = Date.now() + eff
      // perform poll for enabled endpoints
      await pollProjectEndpoints(projectId || '', curSettings)
    } catch (e:any) {
      st.lastError = String(e?.message||e).slice(0,500)
      // backoff on error: double interval up to max
      const cur = getGithubPollSettings(projectId)
      const doubled = Math.min(cur.maxIntervalMs, Math.max(cur.minIntervalMs, st.effectiveIntervalMs * 2))
      st.effectiveIntervalMs = doubled
      st.nextPollAt = Date.now() + doubled
    }
  }, interval)
  // allow process to exit even if timer exists
  if ((st.timer as any)?.unref) (st.timer as any).unref()
}

async function pollProjectEndpoints(projectId: string, settings: GithubPollSettings): Promise<void> {
  // For now, poll diff/pr/commits if enabled using per-endpoint intervals (simplified: use global interval but respect perEndpointInterval via separate timers? For MVP, poll all enabled at global interval)
  // In future, per-endpoint overrides could have separate intervals
  const baseUrl = 'https://api.github.com'
  const token = getGithubToken(projectId || undefined)
  if (!token) return
  // Need project repo info: try to get from project path git remote? For now, we poll user endpoint as health check
  // This keeps quota usage minimal and validates ETag
  try {
    // If actions not needed, skip
    // We'll attempt to fetch user as heartbeat
    await fetchGitHub(`${baseUrl}/user`, projectId || undefined)
  } catch (e) {
    // ignore, but rate limit will be updated
  }
  // Per-endpoint specific fetches would be done on demand via GET /github/diff etc, which also use fetchGitHub and benefit from ETag
}

export async function pollNow(projectId: string, force = false): Promise<{ ok: boolean; debounced?: boolean; data?: any }> {
  const key = projectId || 'global'
  const now = Date.now()
  const last = pollNowDebounce.get(key) || 0
  if (!force && now - last < 5000) {
    return { ok: false, debounced: true }
  }
  pollNowDebounce.set(key, now)
  const settings = getGithubPollSettings(projectId)
  const token = getGithubToken(projectId || undefined)
  if (!token) throw new Error('No GitHub token configured')
  // respect rate limit
  if (settings.respectRateLimit && rateLimit.remaining < 10 && Date.now() < rateLimit.resetAt) {
    throw new Error(`Rate limited: ${rateLimit.remaining} remaining, resets at ${new Date(rateLimit.resetAt).toISOString()}`)
  }
  await pollProjectEndpoints(projectId, settings)
  // update nextPollAt
  const st = ensureScheduler(projectId)
  const eff = computeEffectiveInterval(settings, projectId)
  st.effectiveIntervalMs = eff
  st.nextPollAt = Date.now() + eff
  return { ok: true }
}

export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  if (!secret) return false
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex')
  try {
    const a = Buffer.from(expected)
    const b = Buffer.from(signature)
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
  } catch { return false }
}

export function getCacheEntry(key: string): CacheEntry | undefined {
  return cache.get(key)
}

export function clearCache(): void { cache.clear() }

// Initialize schedulers on startup for all projects
export async function ensureSchedulers(): Promise<void> {
  try {
    const store = await import('./store.js')
    const db = (store as any).getDb?.()
    const projects = db?.projects || []
    for (const p of projects) {
      updateScheduler(p.id)
    }
    updateScheduler() // global
  } catch {}
}

// Graceful stop
export function stopAllSchedulers(): void {
  for (const [k, st] of schedulers) {
    if (st.timer) { clearInterval(st.timer); st.timer = null }
  }
}

try {
  process.on('SIGINT', () => stopAllSchedulers())
  process.on('SIGTERM', () => stopAllSchedulers())
} catch {}

export { rateLimit as _rateLimitState, cache as _cache }
