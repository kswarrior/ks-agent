import fs from 'node:fs'
import path from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import Database from 'better-sqlite3'

export interface Project {
  id: string
  name: string
  path: string
  createdAt: string
}

export interface Chat {
  id: string
  projectId: string
  title: string
  seq?: number
  createdAt: string
  updatedAt: string
}

export type Role = 'system' | 'user' | 'assistant'

export interface Message {
  id: string
  chatId: string
  role: Role
  content: string
  createdAt: string
  error?: boolean
  // AI run metadata (only for assistant messages)
  model?: string
  modelDisplayName?: string
  providerName?: string
  startedAt?: string
  finishedAt?: string
  durationMs?: number
}

export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
}

export interface ModelEntry {
  id: string
  providerId: string
  model: string
  displayName?: string
  maxTokens?: number
  /** Per-model system prompt override. When set it replaces the global/built-in system prompt. */
  systemPrompt?: string
}

export type PlanStepStatus = 'pending' | 'working' | 'done'

export interface PlanStep {
  id: string
  title: string
  status: PlanStepStatus
}

export interface Plan {
  id: string
  chatId: string
  title: string
  steps: PlanStep[]
  createdAt: string
  updatedAt: string
}

export interface Terminal {
  id: string
  projectId: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface Question {
  id: string
  chatId: string
  header: string
  question: string
  options: string[]
  allowCustom: boolean
  customPlaceholder?: string
  status: 'pending' | 'answered'
  answer?: string
  selectedOption?: string | null
  createdAt: string
  answeredAt?: string
  toolCallId?: string
}

export interface RetrySettings {
  enabled: boolean
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  retryOnStatusCodes: number[]
  stopOnStatusCodes: number[]
  alwaysRetry?: boolean
  autoContinueEnabled?: boolean
  autoContinueDelayMs?: number
  autoContinueMaxAttempts?: number
  autoContinueOnPlanIncomplete?: boolean
}

export interface ThemeSettings {
  primary: string
  danger: string
  background: string
  radius: number
}

export interface Skill {
  id: string
  name: string
  note: string
  mainFile: string
  files: string[]
  projectId?: string
  createdAt: string
  updatedAt?: string
}

export type MCPTransport = 'stdio' | 'sse' | 'http' | 'websocket'

export interface MCPServer {
  id: string
  name: string
  transport: MCPTransport
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  projectId?: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type LSPTransport = 'stdio' | 'tcp' | 'socket' | 'websocket' | 'http' | 'sse'

export interface LSPServer {
  id: string
  name: string
  language: string
  transport: LSPTransport
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
  headers?: Record<string, string>
  projectId?: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export type PluginSource = 'manual' | 'marketplace' | 'local' | 'url'

export interface Plugin {
  id: string
  name: string
  description: string
  version: string
  publisher?: string
  entryPoint?: string
  source: PluginSource
  marketplaceId?: string
  enabled: boolean
  projectId?: string
  tags?: string[]
  icon?: string
  createdAt: string
  updatedAt: string
}

export interface Preview {
  id: string
  chatId: string
  port: number
  createdAt: string
  updatedAt: string
}

// ---------------- Sub-agents / Teams — 5 Modes: Solo/Swarm/Hive/Squad/Infinity (vs.md:96, vs.md:3.1) ----------------
export type SubAgentMode = 'research' | 'explore' | 'fix' | 'write' | 'general'
export type SubAgentStatus = 'pending' | 'working' | 'done' | 'error'
export interface SubAgent {
  id: string
  parentChatId: string
  parentSubAgentId?: string | null // for Hive nested (M3): agent → 5 sub-agents
  teamId?: string | null // for Squad/Infinity M4/M5
  task: string
  mode: SubAgentMode
  status: SubAgentStatus
  worktreePath?: string | null
  modelId?: string | null // per-role multi-model for Infinity M5
  result?: string | null
  createdAt: string
  updatedAt: string
}
export interface Team {
  id: string
  name: string
  chatId: string // parent chat that created team
  headId?: string | null // head member id
  createdAt: string
  updatedAt: string
}
export interface TeamMember {
  id: string
  teamId: string
  role: string // research/explore/fix/write/preview
  subAgentId?: string | null
  createdAt: string
}

export interface SubAgentMessage {
  id: string
  subAgentId: string
  parentChatId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  createdAt: string
  toolCallId?: string | null
  toolName?: string | null
}

export type ActivityToolType = 'read_file' | 'write_file' | 'edit_file' | 'run_shell' | 'list_files' | 'grep' | 'glob' | 'semantic_search' | 'create_plan' | 'complete_plan_step' | 'ask_question' | 'open_preview' | 'get_file_info' | 'delete_file' | 'move_file' | 'append_file' | 'apply_patch' | 'delegate_task'

export interface Activity {
  id: string
  chatId: string
  toolType: ActivityToolType
  toolCallId: string
  args: Record<string, unknown>
  summary: string
  result?: string
  ok?: boolean
  timestamp: string
  expanded?: boolean
}

export const DEFAULT_THEME: ThemeSettings = {
  primary: '#2563eb',
  danger: '#ef4444',
  background: '#000000',
  radius: 10
}

// ---------------- GitHub Token (PAT) + Poll Settings — vs.md:98 "🔶 via shell gh pr create" only run_shell (server/src/agent.ts:341). Need GITHUB_TOKEN stored like Provider.apiKey (store.ts:40, index.ts:236 ••••, store.ts:277 chmod 600, WAL busy_timeout 10000) + user-set interval, fully customizable. ----------------
export interface GithubToken {
  id: string
  projectId?: string
  token: string
  createdAt: string
}

export interface GithubPollSettings {
  enabled: boolean
  mode: 'interval' | 'cron' | 'event' | 'manual'
  intervalMs: number
  cronExpr: string | null
  endpoints: { diff: boolean; pr: boolean; commits: boolean; actions: boolean }
  perEndpointInterval: { diffMs: number; prMs: number; commitsMs?: number; actionsMs?: number }
  pollOnFocusOnly: boolean
  pauseOnWindowBlur: boolean
  useEtag: boolean
  respectRateLimit: boolean
  smartEventOnly: boolean
  jitterMs: number
  maxRetries: number
  minIntervalMs: number
  maxIntervalMs: number
  webhookUrl?: string | null
}

export const GITHUB_TOKEN_REGEX = /^(gh[opsr]_|github_pat_)[A-Za-z0-9_]+$/
export const DEFAULT_GITHUB_POLL_SETTINGS: GithubPollSettings = {
  enabled: false,
  mode: 'interval',
  intervalMs: 25000,
  cronExpr: null,
  endpoints: { diff: true, pr: true, commits: true, actions: false },
  perEndpointInterval: { diffMs: 25000, prMs: 60000, commitsMs: 30000, actionsMs: 60000 },
  pollOnFocusOnly: false,
  pauseOnWindowBlur: false,
  useEtag: true,
  respectRateLimit: true,
  smartEventOnly: false,
  jitterMs: 0,
  maxRetries: 3,
  minIntervalMs: 5000,
  maxIntervalMs: 300000,
  webhookUrl: null
}

interface DB {
  projects: Project[]
  chats: Chat[]
  messages: Message[]
  providers: Provider[]
  models: ModelEntry[]
  systemPrompt: string
  planPrompt: string
  plans: Plan[]
  terminals: Terminal[]
  questions: Question[]
  activities: Activity[]
  retrySettings: RetrySettings
  themeSettings: ThemeSettings
  skills: Skill[]
  previews: Preview[]
  mcpServers: MCPServer[]
  lspServers: LSPServer[]
  plugins: Plugin[]
  subAgents: SubAgent[]
  teams: Team[]
  teamMembers: TeamMember[]
  subAgentMessages: SubAgentMessage[]
}

// Backwards compat alias
export type LspServer = LSPServer
export type LspTransport = LSPTransport

// Storage location: agent root where skills/web/server folders live.
// Default: <cwd>/storage/ksagent.db  (or <cwd>/data/ksagent.db if KS_DATA_DIR is set for backward compat)
// Env overrides: KS_SQLITE_PATH (full file path) takes precedence over KS_DATA_DIR (directory)
const legacyDataDir = path.join(process.cwd(), 'data')
const legacyDbFile = path.join(legacyDataDir, 'db.json')
const defaultSkillsDir = path.join(process.cwd(), 'skills')

const storageDir = process.env.KS_SQLITE_PATH
  ? path.dirname(path.resolve(process.env.KS_SQLITE_PATH))
  : process.env.KS_DATA_DIR
    ? path.resolve(process.env.KS_DATA_DIR)
    : path.join(process.cwd(), 'storage')

const dbFile = process.env.KS_SQLITE_PATH
  ? path.resolve(process.env.KS_SQLITE_PATH)
  : path.join(storageDir, 'ksagent.db')

let db: DB = { projects: [], chats: [], messages: [], providers: [], models: [], systemPrompt: '', planPrompt: '', plans: [], terminals: [], questions: [], activities: [], retrySettings: { enabled: true, maxRetries: 5, baseDelayMs: 1200, maxDelayMs: 30000, retryOnStatusCodes: [429, 500, 502, 503], stopOnStatusCodes: [400, 401, 403, 404], alwaysRetry: false, autoContinueEnabled: false, autoContinueDelayMs: 1500, autoContinueMaxAttempts: 5, autoContinueOnPlanIncomplete: true }, themeSettings: { ...DEFAULT_THEME }, skills: [], previews: [], mcpServers: [], lspServers: [], plugins: [], subAgents: [], teams: [], teamMembers: [], subAgentMessages: [] }

let sqlite: Database.Database | null = null

function ensureDb(): Database.Database {
  if (sqlite) return sqlite
  fs.mkdirSync(path.dirname(dbFile), { recursive: true })
  sqlite = new Database(dbFile)
  // WAL for concurrency, foreign_keys for integrity, busy timeout to avoid SQLITE_BUSY on concurrent access
  try { sqlite.pragma('journal_mode = WAL') } catch {}
  try { sqlite.pragma('busy_timeout = 10000') } catch {}
  try { sqlite.pragma('synchronous = NORMAL') } catch {}
  try { sqlite.pragma('wal_autocheckpoint = 1000') } catch {}
  try { sqlite.pragma('journal_size_limit = 67108864') } catch {}
  try { sqlite.pragma('foreign_keys = ON') } catch {}
  try { sqlite.pragma('cache_size = -2000') } catch {}
  initSchema(sqlite)
  migrateLspSchema(sqlite)
  migrateActivityIndex(sqlite)
  // vector+hybrid chunk table migration — backward compatible, missing vec ≠ crash
  try { sqlite.exec(`
    CREATE TABLE IF NOT EXISTS embedding_chunks (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      chunkIndex INTEGER NOT NULL,
      contentHash TEXT NOT NULL,
      chunkText TEXT NOT NULL,
      vector TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_embedding_chunks_projectId ON embedding_chunks(projectId);
    CREATE INDEX IF NOT EXISTS idx_embedding_chunks_project_path ON embedding_chunks(projectId, filePath);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_chunks_project_path_idx ON embedding_chunks(projectId, filePath, chunkIndex);
  `) } catch {}
  // try sqlite-vec virtual table for HNSW (optional)
  try { sqlite.exec("CREATE VIRTUAL TABLE IF NOT EXISTS vec_tmp_test USING vec0(dummy float[384])"); sqlite.exec("DROP TABLE IF EXISTS vec_tmp_test"); sqlite.exec("CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(projectId TEXT, filePath TEXT, chunkIndex INTEGER, embedding FLOAT[384] distance_metric=cosine)") } catch {}
  // Re-ensure FK enabled after init (initSchema may have been run on existing DB)
  try { sqlite.pragma('foreign_keys = ON') } catch {}
  // GitHub tables — ensure exist even on old DBs
  try { sqlite.exec(`
    CREATE TABLE IF NOT EXISTS github_tokens (
      id TEXT PRIMARY KEY,
      projectId TEXT,
      token TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_github_tokens_projectId ON github_tokens(projectId);
    CREATE TABLE IF NOT EXISTS github_poll_settings (
      projectId TEXT PRIMARY KEY,
      settings TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS github_cache (
      key TEXT PRIMARY KEY,
      etag TEXT,
      data TEXT NOT NULL,
      headers TEXT,
      fetchedAt TEXT NOT NULL
    );
  `) } catch {}
  // Sub-agents / Teams — 5 Modes: Solo/Swarm/Hive/Squad/Infinity (vs.md:3.1, vs.md:96)
  try { sqlite.exec(`
    CREATE TABLE IF NOT EXISTS subAgents (
      id TEXT PRIMARY KEY,
      parentChatId TEXT NOT NULL,
      parentSubAgentId TEXT,
      teamId TEXT,
      task TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      worktreePath TEXT,
      modelId TEXT,
      result TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(parentChatId) REFERENCES chats(id) ON DELETE CASCADE,
      FOREIGN KEY(parentSubAgentId) REFERENCES subAgents(id) ON DELETE CASCADE,
      FOREIGN KEY(teamId) REFERENCES teams(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_subAgents_parentChatId ON subAgents(parentChatId);
    CREATE INDEX IF NOT EXISTS idx_subAgents_teamId ON subAgents(teamId);
    CREATE INDEX IF NOT EXISTS idx_subAgents_status ON subAgents(status);
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      chatId TEXT NOT NULL,
      headId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(chatId) REFERENCES chats(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_teams_chatId ON teams(chatId);
    CREATE TABLE IF NOT EXISTS teamMembers (
      id TEXT PRIMARY KEY,
      teamId TEXT NOT NULL,
      role TEXT NOT NULL,
      subAgentId TEXT,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(teamId) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY(subAgentId) REFERENCES subAgents(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_teamMembers_teamId ON teamMembers(teamId);
    CREATE TABLE IF NOT EXISTS subAgentMessages (
      id TEXT PRIMARY KEY,
      subAgentId TEXT NOT NULL,
      parentChatId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      toolCallId TEXT,
      toolName TEXT,
      FOREIGN KEY(subAgentId) REFERENCES subAgents(id) ON DELETE CASCADE,
      FOREIGN KEY(parentChatId) REFERENCES chats(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_subAgentMessages_subAgentId ON subAgentMessages(subAgentId);
    CREATE INDEX IF NOT EXISTS idx_subAgentMessages_parentChatId ON subAgentMessages(parentChatId);
  `) } catch {}
  // Harden DB file permissions — secrets at rest (apiKeys) must be 600
  try { fs.chmodSync(dbFile, 0o600) } catch {}
  try { fs.chmodSync(dbFile + '-wal', 0o600) } catch {}
  try { fs.chmodSync(dbFile + '-shm', 0o600) } catch {}
  return sqlite
}

// ---------------- GitHub Token + Poll Settings helpers — store.ts:214 kv "githubToken" + github_tokens {id,projectId,token,createdAt}. Helpers get/set/masked ••••xxxx, regex ^(gh[opsr]_|github_pat_) 20-120 chars. ----------------
export function isValidGithubToken(token: string): boolean {
  const t = String(token ?? '').trim()
  if (!t) return false
  if (t.length < 20 || t.length > 120) return false
  if (!GITHUB_TOKEN_REGEX.test(t)) return false
  return true
}
export function maskGithubToken(token: string): string {
  const t = String(token ?? '').trim()
  if (!t) return ''
  if (t.length <= 4) return '••••'
  return `••••${t.slice(-4)}`
}
export function getGithubToken(projectId?: string): string | null {
  // env override — GITHUB_TOKEN || GH_TOKEN like store.ts:277
  const envTok = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '').trim()
  if (envTok) return envTok
  try {
    const s = ensureDb()
    if (projectId) {
      const row = s.prepare('SELECT token FROM github_tokens WHERE projectId=? ORDER BY createdAt DESC LIMIT 1').get(projectId) as any
      if (row && typeof row.token === 'string' && row.token.trim()) return String(row.token).trim()
    }
    const kv = s.prepare("SELECT value FROM kv WHERE key='githubToken'").get() as any
    if (kv && typeof kv.value === 'string') {
      const v = String(kv.value).trim()
      if (v) return v
    }
  } catch {}
  return null
}
export function getGithubTokenMasked(projectId?: string): string {
  const tok = getGithubToken(projectId)
  return tok ? maskGithubToken(tok) : ''
}
export function hasGithubToken(projectId?: string): boolean {
  return !!getGithubToken(projectId)
}
export function setGithubToken(token: string, projectId?: string): string {
  const t = String(token ?? '').trim()
  if (!t) {
    // clear
    try {
      const s = ensureDb()
      if (projectId) s.prepare('DELETE FROM github_tokens WHERE projectId=?').run(projectId)
      else s.prepare("DELETE FROM kv WHERE key='githubToken'").run()
    } catch {}
    return ''
  }
  if (!isValidGithubToken(t)) throw new Error('Invalid GitHub token: must start with ghp_/gho_/ghs_/ghr_/github_pat_ and be 20-120 chars')
  try {
    const s = ensureDb()
    if (projectId) {
      if (!findProject(projectId)) throw new Error('Project not found')
      s.prepare('DELETE FROM github_tokens WHERE projectId=?').run(projectId)
      s.prepare('INSERT INTO github_tokens (id, projectId, token, createdAt) VALUES (?,?,?,?)').run(randomUUID(), projectId, t, new Date().toISOString())
      // also ensure perms
      try { fs.chmodSync(dbFile, 0o600) } catch {}
    } else {
      s.prepare("INSERT INTO kv (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('githubToken', t)
      try { fs.chmodSync(dbFile, 0o600) } catch {}
    }
  } catch (e:any) {
    if (String(e?.message||'').includes('Project not found')) throw e
    throw new Error(String(e?.message||'Failed to save GitHub token').slice(0,300))
  }
  return maskGithubToken(t)
}
export function getRawGithubToken(projectId?: string): string | null {
  // without env override — for API masked display check
  try {
    const s = ensureDb()
    if (projectId) {
      const row = s.prepare('SELECT token FROM github_tokens WHERE projectId=? ORDER BY createdAt DESC LIMIT 1').get(projectId) as any
      if (row && typeof row.token === 'string') return String(row.token).trim() || null
    }
    const kv = s.prepare("SELECT value FROM kv WHERE key='githubToken'").get() as any
    if (kv && typeof kv.value === 'string') return String(kv.value).trim() || null
  } catch {}
  return null
}

// Poll settings — githubPollSettings {enabled, mode, intervalMs, cronExpr, endpoints, perEndpointInterval, pollOnFocusOnly, pauseOnWindowBlur, useEtag, respectRateLimit, smartEventOnly, jitterMs, maxRetries, minIntervalMs, maxIntervalMs} persisted kv "githubPollSettings" + per-project override (like mcpServers projectId). Validation: intervalMs 5000-300000 (5s-5min) any custom value, cronExpr validated via cron parser if mode=cron (e.g. "*/25 * * * * *" or "every 25s"), jitter 0-5000.
function isValidCronExpr(expr: string): boolean {
  const t = String(expr ?? '').trim()
  if (!t) return false
  // helper "every 25s" or "every 25s" -> valid
  if (/^every\s+\d+\s*s(ec)?(ond)?s?$/i.test(t)) return true
  // standard 5 or 6 field cron: "*/25 * * * * *" | "*/25 * * * *" | "0 * * * *" etc - allow *, numbers, */, -, ,  for each field
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length === 5 || parts.length === 6) {
    const fieldRe = /^(\*|\*\/\d+|\d+(-\d+)?(,\d+(-\d+)?)*)$/
    // seconds field (if 6 parts) same, but first field must be valid
    for (const p of parts) {
      if (!fieldRe.test(p)) {
        // allow "*/25" already covered; also allow lists like "0,15,30"
        // but also need to handle "*/" already; if not matched, invalid
        // try numeric
        if (!/^(\*|\d+)$/.test(p) && !/^\*\/\d+$/.test(p)) return false
      }
    }
    return true
  }
  return false
}
function clampPollSettings(s: any): GithubPollSettings {
  const def = DEFAULT_GITHUB_POLL_SETTINGS
  const out: GithubPollSettings = { ...def }
  if (typeof s.enabled === 'boolean') out.enabled = s.enabled
  if (typeof s.mode === 'string' && ['interval','cron','event','manual'].includes(s.mode)) out.mode = s.mode as any
  let intervalMs = Number(s.intervalMs)
  if (Number.isFinite(intervalMs)) {
    intervalMs = Math.round(intervalMs)
    // clamp 5000-300000 (5s-5min) any custom value — spec requires reject outside range via API, but here clamp for safety
    if (intervalMs < def.minIntervalMs) intervalMs = def.minIntervalMs
    if (intervalMs > def.maxIntervalMs) intervalMs = def.maxIntervalMs
    out.intervalMs = intervalMs
  }
  if (s.cronExpr === null || s.cronExpr === undefined) out.cronExpr = null
  else if (typeof s.cronExpr === 'string') {
    const v = String(s.cronExpr).trim().slice(0, 200) || null
    out.cronExpr = v
  }
  if (s.endpoints && typeof s.endpoints === 'object') {
    out.endpoints = {
      diff: s.endpoints.diff !== false,
      pr: s.endpoints.pr !== false,
      commits: s.endpoints.commits !== false,
      actions: !!s.endpoints.actions
    }
  }
  if (s.perEndpointInterval && typeof s.perEndpointInterval === 'object') {
    const pe: any = {}
    for (const k of ['diffMs','prMs','commitsMs','actionsMs'] as const) {
      let v = Number((s.perEndpointInterval as any)[k])
      if (Number.isFinite(v)) {
        v = Math.round(v)
        v = Math.max(def.minIntervalMs, Math.min(def.maxIntervalMs, v))
        pe[k] = v
      }
    }
    out.perEndpointInterval = { ...def.perEndpointInterval, ...pe }
  }
  if (typeof s.pollOnFocusOnly === 'boolean') out.pollOnFocusOnly = s.pollOnFocusOnly
  if (typeof s.pauseOnWindowBlur === 'boolean') out.pauseOnWindowBlur = s.pauseOnWindowBlur
  if (typeof s.useEtag === 'boolean') out.useEtag = s.useEtag
  if (typeof s.respectRateLimit === 'boolean') out.respectRateLimit = s.respectRateLimit
  if (typeof s.smartEventOnly === 'boolean') out.smartEventOnly = s.smartEventOnly
  let jitter = Number(s.jitterMs)
  if (Number.isFinite(jitter)) out.jitterMs = Math.max(0, Math.min(5000, Math.round(jitter)))
  let mr = Number(s.maxRetries)
  if (Number.isFinite(mr)) out.maxRetries = Math.max(0, Math.min(10, Math.round(mr)))
  if (s.webhookUrl !== undefined) out.webhookUrl = s.webhookUrl ? String(s.webhookUrl).trim().slice(0,500) || null : null
  return out
}
export function getGithubPollSettings(projectId?: string): GithubPollSettings {
  try {
    const s = ensureDb()
    let base: any = null
    const row = s.prepare("SELECT value FROM kv WHERE key='githubPollSettings'").get() as any
    if (row && typeof row.value === 'string') {
      try { base = JSON.parse(row.value) } catch { base = null }
    }
    let merged = base ? clampPollSettings(base) : { ...DEFAULT_GITHUB_POLL_SETTINGS }
    if (projectId) {
      const prow = s.prepare('SELECT settings FROM github_poll_settings WHERE projectId=?').get(projectId) as any
      if (prow && typeof prow.settings === 'string') {
        try {
          const parsed = JSON.parse(prow.settings)
          const projClamped = clampPollSettings({ ...merged, ...parsed })
          // deep merge endpoints
          if (parsed.endpoints) projClamped.endpoints = { ...merged.endpoints, ...parsed.endpoints }
          if (parsed.perEndpointInterval) projClamped.perEndpointInterval = { ...merged.perEndpointInterval, ...parsed.perEndpointInterval }
          merged = projClamped
        } catch {}
      }
    }
    return merged
  } catch { return { ...DEFAULT_GITHUB_POLL_SETTINGS } }
}
export function updateGithubPollSettings(patch: Partial<GithubPollSettings>, projectId?: string): GithubPollSettings {
  // Validation per spec: intervalMs 5000-300000 any custom value, cronExpr validated via cron parser if mode=cron (e.g. "*/25 * * * * *" or "every 25s"), jitter 0-5000.
  if (patch.intervalMs !== undefined) {
    const v = Number(patch.intervalMs)
    if (!Number.isFinite(v) || !Number.isInteger(Math.round(v))) throw new Error('intervalMs must be an integer')
    const rounded = Math.round(v)
    if (rounded < 5000 || rounded > 300000) throw new Error('intervalMs must be 5000-300000 (5s-5min), got ' + rounded)
  }
  if (patch.perEndpointInterval) {
    for (const k of ['diffMs','prMs','commitsMs','actionsMs'] as const) {
      const v = (patch.perEndpointInterval as any)[k]
      if (v !== undefined) {
        const n = Number(v)
        if (!Number.isFinite(n) || Math.round(n) < 5000 || Math.round(n) > 300000) throw new Error(`perEndpointInterval.${k} must be 5000-300000`)
      }
    }
  }
  if (patch.jitterMs !== undefined) {
    const j = Number(patch.jitterMs)
    if (!Number.isFinite(j) || Math.round(j) < 0 || Math.round(j) > 5000) throw new Error('jitterMs must be 0-5000')
  }
  if (patch.mode === 'cron' && patch.cronExpr != null) {
    const expr = String(patch.cronExpr).trim()
    if (expr && !isValidCronExpr(expr)) throw new Error('Invalid cronExpr: expected "*/25 * * * * *" or "every 25s"')
  }
  if (patch.minIntervalMs !== undefined || patch.maxIntervalMs !== undefined) {
    // these are constants, not patchable beyond clamp display — ignore or validate clamp
  }
  if (patch.webhookUrl !== undefined && patch.webhookUrl !== null) {
    const u = String(patch.webhookUrl).trim()
    if (u) {
      if (u.length > 500) throw new Error('webhookUrl too long')
      try { const url = new URL(u); if (!['http:','https:'].includes(url.protocol)) throw new Error('webhookUrl must be http(s)') } catch { throw new Error('Invalid webhookUrl') }
    }
  }
  const cur = getGithubPollSettings(projectId)
  const next = clampPollSettings({ ...cur, ...patch, perEndpointInterval: patch.perEndpointInterval ? { ...cur.perEndpointInterval, ...patch.perEndpointInterval } : cur.perEndpointInterval, endpoints: patch.endpoints ? { ...cur.endpoints, ...patch.endpoints } : cur.endpoints })
  // ensure cron validation when mode becomes cron
  if (next.mode === 'cron' && next.cronExpr) {
    if (!isValidCronExpr(next.cronExpr)) throw new Error('Invalid cronExpr')
  }
  try {
    const s = ensureDb()
    if (projectId) {
      if (!findProject(projectId)) throw new Error('Project not found')
      s.prepare('INSERT INTO github_poll_settings (projectId, settings, updatedAt) VALUES (?,?,?) ON CONFLICT(projectId) DO UPDATE SET settings=excluded.settings, updatedAt=excluded.updatedAt').run(projectId, JSON.stringify(next), new Date().toISOString())
    } else {
      s.prepare("INSERT INTO kv (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('githubPollSettings', JSON.stringify(next))
    }
  } catch (e:any) {
    if (String(e?.message||'').includes('Project not found') || String(e?.message||'').includes('intervalMs') || String(e?.message||'').includes('jitter') || String(e?.message||'').includes('cron')) throw e
    throw new Error(String(e?.message||'Failed to save poll settings').slice(0,400))
  }
  return next
}
export function validateGithubCronExpr(expr: string): boolean { return isValidCronExpr(expr) }
export function effectiveIntervalMs(settings: GithubPollSettings, remaining?: number): number {
  let eff = settings.intervalMs
  // per spec: If Remaining<100 auto stretch to 60s regardless of custom (with toast "throttled to 60s").
  if (settings.respectRateLimit && typeof remaining === 'number' && remaining < 100) {
    eff = Math.max(eff, 60000)
  }
  return Math.max(settings.minIntervalMs, Math.min(settings.maxIntervalMs, eff))
}

// ---------------- Sub-agents / Teams helpers — 5 Modes Solo/Swarm/Hive/Squad/Infinity (vs.md:3.1) ----------------
export function createSubAgent(opts: { parentChatId: string; task: string; mode?: SubAgentMode; parentSubAgentId?: string | null; teamId?: string | null; worktreePath?: string | null; modelId?: string | null }): SubAgent {
  const parentChatId = String(opts.parentChatId ?? '').trim()
  if (!parentChatId) throw new Error('parentChatId required')
  const task = String(opts.task ?? '').trim()
  if (!task) throw new Error('task required')
  if (task.length > 5000) throw new Error('task too long (max 5000)')
  const mode = (String(opts.mode ?? 'general').trim().toLowerCase() as SubAgentMode) || 'general'
  const allowed: SubAgentMode[] = ['research','explore','fix','write','general']
  if (!allowed.includes(mode)) throw new Error('Invalid mode: ' + mode)
  const id = randomUUID()
  const now = new Date().toISOString()
  const sa: SubAgent = { id, parentChatId, parentSubAgentId: opts.parentSubAgentId ?? null, teamId: opts.teamId ?? null, task, mode, status: 'pending', worktreePath: opts.worktreePath ?? null, modelId: opts.modelId ?? null, result: null, createdAt: now, updatedAt: now }
  try {
    const s = ensureDb()
    s.prepare('INSERT INTO subAgents (id, parentChatId, parentSubAgentId, teamId, task, mode, status, worktreePath, modelId, result, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, parentChatId, sa.parentSubAgentId, sa.teamId, task, mode, 'pending', sa.worktreePath, sa.modelId, sa.result, now, now)
  } catch {}
  // also keep in-memory for persist bulk
  try { db.subAgents.push(sa) } catch {}
  return sa
}
export function subAgentsOf(parentChatId: string): SubAgent[] {
  const pid = String(parentChatId ?? '').trim()
  if (!pid) return []
  try {
    const s = ensureDb()
    const rows = s.prepare('SELECT id, parentChatId, parentSubAgentId, teamId, task, mode, status, worktreePath, modelId, result, createdAt, updatedAt FROM subAgents WHERE parentChatId=? ORDER BY createdAt').all(pid) as any[]
    if (rows.length) return rows.map((r: any) => ({ id: r.id, parentChatId: r.parentChatId, parentSubAgentId: r.parentSubAgentId ?? null, teamId: r.teamId ?? null, task: r.task, mode: r.mode as SubAgentMode, status: r.status as SubAgentStatus, worktreePath: r.worktreePath ?? null, modelId: r.modelId ?? null, result: r.result ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt }))
  } catch {}
  return (db.subAgents || []).filter((a) => a.parentChatId === pid)
}
export function findSubAgent(id: string): SubAgent | null {
  const sid = String(id ?? '').trim()
  if (!sid) return null
  try {
    const s = ensureDb()
    const r = s.prepare('SELECT id, parentChatId, parentSubAgentId, teamId, task, mode, status, worktreePath, modelId, result, createdAt, updatedAt FROM subAgents WHERE id=?').get(sid) as any
    if (r) return { id: r.id, parentChatId: r.parentChatId, parentSubAgentId: r.parentSubAgentId ?? null, teamId: r.teamId ?? null, task: r.task, mode: r.mode, status: r.status, worktreePath: r.worktreePath ?? null, modelId: r.modelId ?? null, result: r.result ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt }
  } catch {}
  return (db.subAgents || []).find((a) => a.id === sid) ?? null
}
export function updateSubAgent(id: string, patch: Partial<Pick<SubAgent,'status'|'result'|'worktreePath'|'modelId'>>): SubAgent | null {
  const sa = findSubAgent(id)
  if (!sa) return null
  if (patch.status) sa.status = patch.status
  if (patch.result !== undefined) sa.result = patch.result ?? null
  if (patch.worktreePath !== undefined) sa.worktreePath = patch.worktreePath ?? null
  if (patch.modelId !== undefined) sa.modelId = patch.modelId ?? null
  sa.updatedAt = new Date().toISOString()
  try {
    const s = ensureDb()
    s.prepare('UPDATE subAgents SET status=?, result=?, worktreePath=?, modelId=?, updatedAt=? WHERE id=?').run(sa.status, sa.result, sa.worktreePath, sa.modelId, sa.updatedAt, id)
  } catch {}
  try {
    const idx = (db.subAgents || []).findIndex((a) => a.id === id)
    if (idx !== -1) db.subAgents[idx] = { ...sa }
  } catch {}
  return sa
}
export function createTeam(chatId: string, name: string, headId?: string | null): Team {
  const cid = String(chatId ?? '').trim()
  if (!cid) throw new Error('chatId required')
  const n = String(name ?? '').trim().slice(0,80) || 'Team'
  const id = randomUUID()
  const now = new Date().toISOString()
  const t: Team = { id, name: n, chatId: cid, headId: headId ?? null, createdAt: now, updatedAt: now }
  try {
    const s = ensureDb()
    s.prepare('INSERT INTO teams (id, name, chatId, headId, createdAt, updatedAt) VALUES (?,?,?,?,?,?)').run(id, n, cid, t.headId, now, now)
  } catch {}
  try { db.teams.push(t) } catch {}
  return t
}
// ---------------- SubAgent Messages — per sub-agent chat (so frontend can see sub-agent chat) ----------------
export function addSubAgentMessage(subAgentId: string, parentChatId: string, role: SubAgentMessage['role'], content: string, extra?: { toolCallId?: string | null; toolName?: string | null }): SubAgentMessage {
  const sid = String(subAgentId ?? '').trim()
  const pid = String(parentChatId ?? '').trim()
  if (!sid) throw new Error('subAgentId required')
  if (!pid) throw new Error('parentChatId required')
  const msg: SubAgentMessage = { id: randomUUID(), subAgentId: sid, parentChatId: pid, role, content: String(content ?? ''), createdAt: new Date().toISOString(), toolCallId: extra?.toolCallId ?? null, toolName: extra?.toolName ?? null }
  try {
    const s = ensureDb()
    s.prepare('INSERT INTO subAgentMessages (id, subAgentId, parentChatId, role, content, createdAt, toolCallId, toolName) VALUES (?,?,?,?,?,?,?,?)').run(msg.id, msg.subAgentId, msg.parentChatId, msg.role, msg.content, msg.createdAt, msg.toolCallId, msg.toolName)
  } catch {}
  try { db.subAgentMessages.push(msg) } catch {}
  // keep sorted by createdAt — push order is chronological
  return msg
}
export function messagesOfSubAgent(subAgentId: string): SubAgentMessage[] {
  const sid = String(subAgentId ?? '').trim()
  if (!sid) return []
  try {
    const s = ensureDb()
    const rows = s.prepare('SELECT id, subAgentId, parentChatId, role, content, createdAt, toolCallId, toolName FROM subAgentMessages WHERE subAgentId=? ORDER BY createdAt').all(sid) as any[]
    if (rows.length) return rows as SubAgentMessage[]
  } catch {}
  return (db.subAgentMessages || []).filter((m) => m.subAgentId === sid).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}
export function messagesOfSubAgentsForChat(parentChatId: string): SubAgentMessage[] {
  const pid = String(parentChatId ?? '').trim()
  if (!pid) return []
  try {
    const s = ensureDb()
    const rows = s.prepare('SELECT id, subAgentId, parentChatId, role, content, createdAt, toolCallId, toolName FROM subAgentMessages WHERE parentChatId=? ORDER BY createdAt').all(pid) as any[]
    if (rows.length) return rows as SubAgentMessage[]
  } catch {}
  return (db.subAgentMessages || []).filter((m) => m.parentChatId === pid).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function teamsOf(chatId: string): Team[] {
  const cid = String(chatId ?? '').trim()
  if (!cid) return []
  try {
    const s = ensureDb()
    const rows = s.prepare('SELECT id, name, chatId, headId, createdAt, updatedAt FROM teams WHERE chatId=? ORDER BY createdAt').all(cid) as any[]
    if (rows.length) return rows as Team[]
  } catch {}
  return (db.teams || []).filter((t) => t.chatId === cid)
}

export function closeDb(): void {
  if (!sqlite) return
  try { sqlite.pragma('wal_checkpoint(TRUNCATE)') } catch {}
  try { sqlite.close() } catch {}
  sqlite = null
}

// Graceful shutdown: checkpoint WAL and close handle so no WAL file lingers with uncheckpointed data
try {
  process.on('SIGINT', () => { try { closeDb() } catch {} })
  process.on('SIGTERM', () => { try { closeDb() } catch {} })
  process.on('beforeExit', () => { try { closeDb() } catch {} })
} catch {}

function initSchema(s: Database.Database): void {
  s.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      title TEXT NOT NULL,
      seq INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_chats_projectId ON chats(projectId);
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      baseUrl TEXT NOT NULL,
      apiKey TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      providerId TEXT NOT NULL,
      model TEXT NOT NULL,
      displayName TEXT,
      maxTokens INTEGER,
      systemPrompt TEXT,
      FOREIGN KEY(providerId) REFERENCES providers(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_models_providerId ON models(providerId);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      error INTEGER,
      model TEXT,
      modelDisplayName TEXT,
      providerName TEXT,
      startedAt TEXT,
      finishedAt TEXT,
      durationMs INTEGER,
      FOREIGN KEY(chatId) REFERENCES chats(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_messages_chatId ON messages(chatId);
    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      title TEXT NOT NULL,
      steps TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(chatId) REFERENCES chats(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_plans_chatId ON plans(chatId);
    CREATE TABLE IF NOT EXISTS terminals (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      name TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_terminals_projectId ON terminals(projectId);
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      header TEXT NOT NULL,
      question TEXT NOT NULL,
      options TEXT NOT NULL,
      allowCustom INTEGER NOT NULL,
      customPlaceholder TEXT,
      status TEXT NOT NULL,
      answer TEXT,
      selectedOption TEXT,
      createdAt TEXT NOT NULL,
      answeredAt TEXT,
      toolCallId TEXT,
      FOREIGN KEY(chatId) REFERENCES chats(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_questions_chatId ON questions(chatId);
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      toolType TEXT NOT NULL,
      toolCallId TEXT NOT NULL,
      args TEXT NOT NULL,
      summary TEXT NOT NULL,
      result TEXT,
      ok INTEGER,
      timestamp TEXT NOT NULL,
      expanded INTEGER,
      FOREIGN KEY(chatId) REFERENCES chats(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_activities_chatId ON activities(chatId);
    CREATE INDEX IF NOT EXISTS idx_activities_toolCallId ON activities(toolCallId);
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      note TEXT NOT NULL,
      mainFile TEXT NOT NULL,
      files TEXT NOT NULL,
      projectId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_skills_projectId ON skills(projectId);
    CREATE TABLE IF NOT EXISTS previews (
      id TEXT PRIMARY KEY,
      chatId TEXT NOT NULL,
      port INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(chatId) REFERENCES chats(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_previews_chatId ON previews(chatId);
    CREATE TABLE IF NOT EXISTS mcpServers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      transport TEXT NOT NULL,
      command TEXT,
      args TEXT,
      url TEXT,
      env TEXT,
      headers TEXT,
      projectId TEXT,
      enabled INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mcpServers_projectId ON mcpServers(projectId);
    CREATE TABLE IF NOT EXISTS lspServers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      language TEXT NOT NULL,
      transport TEXT NOT NULL,
      command TEXT,
      args TEXT,
      url TEXT,
      env TEXT,
      headers TEXT,
      projectId TEXT,
      enabled INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_lspServers_projectId ON lspServers(projectId);
    CREATE INDEX IF NOT EXISTS idx_lspServers_language ON lspServers(language);
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      version TEXT NOT NULL,
      publisher TEXT,
      entryPoint TEXT,
      source TEXT NOT NULL,
      marketplaceId TEXT,
      enabled INTEGER NOT NULL,
      projectId TEXT,
      tags TEXT,
      icon TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_plugins_projectId ON plugins(projectId);
    CREATE INDEX IF NOT EXISTS idx_plugins_enabled ON plugins(enabled);
    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      contentHash TEXT NOT NULL,
      tokens TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_projectId ON embeddings(projectId);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_project_path ON embeddings(projectId, filePath);
    CREATE TABLE IF NOT EXISTS embedding_chunks (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      chunkIndex INTEGER NOT NULL,
      contentHash TEXT NOT NULL,
      chunkText TEXT NOT NULL,
      vector TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_embedding_chunks_projectId ON embedding_chunks(projectId);
    CREATE INDEX IF NOT EXISTS idx_embedding_chunks_project_path ON embedding_chunks(projectId, filePath);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_chunks_project_path_idx ON embedding_chunks(projectId, filePath, chunkIndex);
    CREATE TABLE IF NOT EXISTS github_tokens (
      id TEXT PRIMARY KEY,
      projectId TEXT,
      token TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_github_tokens_projectId ON github_tokens(projectId);
    CREATE TABLE IF NOT EXISTS github_poll_settings (
      projectId TEXT PRIMARY KEY,
      settings TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS github_cache (
      key TEXT PRIMARY KEY,
      etag TEXT,
      data TEXT NOT NULL,
      headers TEXT,
      fetchedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS subAgentMessages (
      id TEXT PRIMARY KEY,
      subAgentId TEXT NOT NULL,
      parentChatId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      toolCallId TEXT,
      toolName TEXT,
      FOREIGN KEY(subAgentId) REFERENCES subAgents(id) ON DELETE CASCADE,
      FOREIGN KEY(parentChatId) REFERENCES chats(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_subAgentMessages_subAgentId ON subAgentMessages(subAgentId);
    CREATE INDEX IF NOT EXISTS idx_subAgentMessages_parentChatId ON subAgentMessages(parentChatId);
  `)
}

// ---------------- Embeddings / Semantic Search — vector+hybrid (20k vector+BM25+grep, sqlite-vec/HNSW) (server/src/store.ts:embeddings) ----------------
// Stores FLOAT32[384/768] per CHUNK (400-600 tokens, 100 overlap), not per file. Hybrid score = 0.5*vectorCosine + 0.3*BM25 + 0.2*grepBoost.
// Primary vector store via sqlite-vec if extension available (vec0 virtual table), fallback to pure-JS brute-force cosine (HNSW-like scan) + JSON vecs per chunk in SQLite.
// Keeps TF-IDF/BM25 fallback when vec extension missing or embeddings empty. Migration backward compatible (missing vec ≠ crash).
// Chunking: isTextFileForEmbed, 500KB cap, 5k indexed/20k scanned keep, chunk table JSON vecs per chunk, contentHash incremental.
// Provider: OpenAI-compatible baseUrl (text-embedding-3-small default) + Ollama nomic-embed-text + local MiniLM fallback (hash-based dense 384d). Batch embedMany with retry like llm.ts:125 openStream.
const EMBED_STOPWORDS = new Set([
  'the','is','at','which','on','and','a','an','of','to','in','for','with','as','by','that','this','it','from','or','be','are','was','were','has','have','had','will','would','can','if','else','when','then','than','so','but','not','we','you','they','he','she','its','our','your','their','i','me','my','us'
])
const EMBED_MAX_FILE_SIZE = 500 * 1024 // 500 KB cap per file for embedding
const EMBED_MAX_TOKENS_PER_FILE = 2000
const EMBED_MAX_FILES_INDEXED = 5000
const EMBED_MAX_FILES_SCANNED = 20000
const EMBED_IGNORED_DIRS = new Set(['node_modules','.git','.hg','.svn','dist','dist-server','storage','data','.next','build','.turbo','.vite','coverage','.cache','.opencode','.claude','.cursor','.vscode','.idea','.parcel-cache','.output','.vercel','.netlify','tmp','logs','.tmp'])
// Vector chunk constants (spec: 400-600 tokens, 100 overlap) — store FLOAT32[384/768] per CHUNK, not per file
const VECTOR_DIM = 384
const VECTOR_DIM_LARGE = 768
const CHUNK_TOKENS = 500
const CHUNK_OVERLAP_TOKENS = 100
const CHUNK_MAX_CHARS = 2400
const CHUNK_OVERLAP_CHARS = 400
const VECTOR_MAX_CHUNKS_PER_FILE = 60
const EMBEDDING_BATCH_SIZE = 64
const EMBED_PROVIDER_DEFAULT_MODEL = 'text-embedding-3-small'
const OLLAMA_EMBED_DEFAULT_MODEL = 'nomic-embed-text'
const EMBEDDING_RETRY_MAX = 3

export interface EmbeddingSettings {
  provider: 'local' | 'openai' | 'ollama'
  baseUrl?: string
  apiKey?: string
  model?: string
  dimensions?: number
  enabled?: boolean
}

function tokenizeForEmbedding(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9_]+/).filter(t => t.length >= 2 && t.length <= 32 && !EMBED_STOPWORDS.has(t)).slice(0, EMBED_MAX_TOKENS_PER_FILE)
}
function termFreqMap(tokens: string[]): Record<string, number> {
  const m: Record<string, number> = {}
  for (const t of tokens) m[t] = (m[t] || 0) + 1
  return m
}
function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32)
}
function sanitizeEmbeddingPath(p: string): string | null {
  const t = p.trim().replace(/\\/g, '/')
  if (!t || t.length > 500 || t.includes('\0') || t.includes('..') || t.startsWith('/') ) return null
  if (t.split('/').some(seg => !seg || seg === '.' || seg === '..')) return null
  return t
}

function isIgnoredDirEmbed(name: string): boolean {
  return EMBED_IGNORED_DIRS.has(name)
}
function isTextFileForEmbed(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase()
  const binaryExts = new Set(['.png','.jpg','.jpeg','.gif','.webp','.ico','.pdf','.zip','.tar','.gz','.7z','.mp4','.mp3','.woff','.woff2','.ttf','.eot','.otf','.exe','.dll','.so','.a','.o','.class','.jar','.pyc','.pyo','.bin','.dat','.db','.sqlite','.sqlite3'])
  if (binaryExts.has(ext)) return false
  return true
}
function globToRegExpEmbed(pattern: string): RegExp | null {
  try {
    let s = pattern.trim()
    let re = ''
    let i = 0
    while (i < s.length) {
      const c = s[i]
      if (c === '*') {
        if (s[i+1] === '*') {
          if (s[i+2] === '/') { re += '(?:.*\\/)?'; i+=3 } else { re += '.*'; i+=2 }
        } else { re += '[^\\/]*'; i++ }
      } else if (c === '?') { re += '[^\\/]'; i++ }
      else if (c === '{') {
        const j = s.indexOf('}', i)
        if (j > i) { const inner = s.slice(i+1, j); const parts = inner.split(',').map(p=>p.trim().replace(/[.*+^${}()|[\]\\]/g,'\\$&')); re += '(?:'+parts.join('|')+')'; i=j+1 } else { re += '\\{'; i++ }
      } else if (c === '[') {
        const j = s.indexOf(']', i)
        if (j > i) { re += s.slice(i, j+1); i=j+1 } else { re += '\\['; i++ }
      } else if (/[.+^${}()|[\]\\]/.test(c)) { re += '\\'+c; i++ } else { re += c; i++ }
    }
    return new RegExp('^'+re+'$')
  } catch { return null }
}

// Chunking: 400-600 tokens, 100 overlap — per spec chunk per CHUNK not per file
export function chunkContentForEmbedding(content: string, chunkTokens = CHUNK_TOKENS, overlapTokens = CHUNK_OVERLAP_TOKENS): string[] {
  if (!content || content.length < 50) return content ? [content] : []
  // token-based chunking: split by whitespace approx token = word
  const words = content.split(/\s+/).filter(Boolean)
  if (words.length <= chunkTokens) return [content]
  const chunks: string[] = []
  let start = 0
  while (start < words.length && chunks.length < VECTOR_MAX_CHUNKS_PER_FILE) {
    const end = Math.min(start + chunkTokens, words.length)
    const slice = words.slice(start, end).join(' ')
    if (slice.trim()) chunks.push(slice)
    if (end >= words.length) break
    start = end - overlapTokens
    if (start < 0) start = 0
  }
  return chunks.length ? chunks : [content.slice(0, CHUNK_MAX_CHARS)]
}
// Alternative char-based fallback for very long single-line files (no whitespace)
function chunkContentCharFallback(content: string): string[] {
  if (content.length <= CHUNK_MAX_CHARS) return [content]
  const chunks: string[] = []
  let start = 0
  while (start < content.length && chunks.length < VECTOR_MAX_CHUNKS_PER_FILE) {
    const end = Math.min(start + CHUNK_MAX_CHARS, content.length)
    chunks.push(content.slice(start, end))
    if (end >= content.length) break
    start = end - CHUNK_OVERLAP_CHARS
  }
  return chunks
}

// Vector helpers — local MiniLM fallback (hash-based dense 384d) + cosine + BM25
function hashCode(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
export function localEmbed(text: string, dim: number = VECTOR_DIM): number[] {
  const tokens = tokenizeForEmbedding(text)
  const vec = new Float32Array(dim)
  if (tokens.length === 0) {
    // char bigram fallback
    const t = text.toLowerCase()
    for (let i = 0; i < t.length - 1; i++) {
      const bg = t.slice(i, i+2)
      if (bg.trim().length < 2) continue
      const h = hashCode(bg)
      vec[h % dim] += 1
      vec[(h >>> 7) % dim] += 0.5
    }
  } else {
    for (const tok of tokens) {
      const h = hashCode(tok)
      vec[h % dim] += 1
      vec[(h >>> 11) % dim] += 0.7
      // second hash for distribution
      const h2 = hashCode(tok.split('').reverse().join(''))
      vec[h2 % dim] += 0.3
    }
  }
  let norm = 0
  for (let i = 0; i < dim; i++) norm += vec[i]*vec[i]
  norm = Math.sqrt(norm)
  if (norm > 0) { for (let i=0;i<dim;i++) vec[i]/=norm }
  return Array.from(vec)
}
function cosineVec(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, na = 0, nb = 0
  for (let i=0;i<a.length;i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i] }
  if (na===0||nb===0) return 0
  return dot / (Math.sqrt(na)*Math.sqrt(nb))
}
function bm25Score(queryTf: Record<string,number>, docTf: Record<string,number>, docLen:number, avgLen:number, df: Map<string,number>, N:number): number {
  const k1 = 1.2, b = 0.75
  let score = 0
  for (const [term, qCnt] of Object.entries(queryTf)) {
    const tf = (docTf as any)[term] ?? 0
    if (tf===0) continue
    const d = df.get(term) ?? 0
    const idf = Math.log((N - d + 0.5)/(d + 0.5) + 1)
    const norm = tf * (k1+1) / (tf + k1*(1 - b + b*docLen/avgLen))
    score += idf * norm * Math.min(qCnt, 2)
  }
  return score
}

// Embedding settings stored in kv 'embeddingSettings' — provider abstraction OpenAI-compatible + Ollama + local
export function getEmbeddingSettings(): EmbeddingSettings {
  try {
    const s = ensureDb()
    const row = s.prepare("SELECT value FROM kv WHERE key='embeddingSettings'").get() as any
    if (row && typeof row.value === 'string') {
      const parsed = JSON.parse(row.value)
      if (parsed && typeof parsed === 'object') {
        const p = String(parsed.provider||'local').trim().toLowerCase()
        const provider: EmbeddingSettings['provider'] = (p==='openai'||p==='ollama'||p==='local') ? p as any : 'local'
        const baseUrl = typeof parsed.baseUrl==='string'? String(parsed.baseUrl).trim().slice(0,500): undefined
        const apiKey = typeof parsed.apiKey==='string'? String(parsed.apiKey).trim().slice(0,500): undefined
        const model = typeof parsed.model==='string'? String(parsed.model).trim().slice(0,100): undefined
        const dimensions = Number.isFinite(parsed.dimensions)? Math.max(64, Math.min(3072, Number(parsed.dimensions))): undefined
        const enabled = parsed.enabled===false? false:true
        return { provider, baseUrl: baseUrl||undefined, apiKey: apiKey||undefined, model: model||undefined, dimensions, enabled }
      }
    }
  } catch {}
  return { provider: 'local', model: EMBED_PROVIDER_DEFAULT_MODEL, dimensions: VECTOR_DIM, enabled: true }
}
export function updateEmbeddingSettings(patch: Partial<EmbeddingSettings>): EmbeddingSettings {
  const cur = getEmbeddingSettings()
  const next: EmbeddingSettings = { ...cur }
  if (patch.provider!==undefined) {
    const p = String(patch.provider).trim().toLowerCase()
    if (p==='openai'||p==='ollama'||p==='local') next.provider = p as any
  }
  if (patch.baseUrl!==undefined) next.baseUrl = String(patch.baseUrl||'').trim().slice(0,500) || undefined
  if (patch.apiKey!==undefined) next.apiKey = String(patch.apiKey||'').trim().slice(0,500) || undefined
  if (patch.model!==undefined) next.model = String(patch.model||'').trim().slice(0,100) || undefined
  if (patch.dimensions!==undefined) {
    const d = Number(patch.dimensions)
    if (Number.isFinite(d)) next.dimensions = Math.max(64, Math.min(3072, Math.round(d)))
  }
  if (patch.enabled!==undefined) next.enabled = Boolean(patch.enabled)
  try {
    const s = ensureDb()
    s.prepare("INSERT INTO kv (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run('embeddingSettings', JSON.stringify(next))
    // need to flush via saveDb logic? kv is already persisted, but also need to ensure db in-memory sync — our ensureDb handles sqlite directly
  } catch (e) { console.warn('updateEmbeddingSettings failed', e) }
  return next
}

// Batch embedMany with retry like llm.ts:125 openStream — OpenAI-compatible + Ollama + local fallback
async function fetchWithRetry(url: string, init: RequestInit, maxRetries = EMBEDDING_RETRY_MAX): Promise<Response> {
  let attempt = 0
  while (true) {
    try {
      const res = await fetch(url, init as any)
      if (res.ok) return res
      let detail = ''
      try { detail = (await res.text()).slice(0,500) } catch {}
      const status = (res as any).status
      const retryable = status===429 || status===500 || status===502 || status===503
      if (!retryable || attempt>=maxRetries) throw new Error(`Provider responded ${status}${detail?`: ${detail}`:''}`)
      let delay = Math.min(800*Math.pow(2,attempt)+Math.random()*400, 10000)
      const ra = res.headers.get('retry-after')
      if (ra) { const secs = Number(ra); if (!isNaN(secs) && secs>=0 && secs<300) delay = Math.max(delay, secs*1000) }
      await new Promise(r=>setTimeout(r, delay))
      attempt++
      continue
    } catch (e:any) {
      if (attempt>=maxRetries) throw e
      // network error retry
      let delay = Math.min(800*Math.pow(2,attempt)+Math.random()*400, 10000)
      await new Promise(r=>setTimeout(r, delay))
      attempt++
    }
  }
}
export async function embedManyRemote(texts: string[]): Promise<number[][]> {
  const settings = getEmbeddingSettings()
  if (!settings.enabled || settings.provider==='local') throw new Error('local provider')
  const clean = texts.map(t=> String(t||'').slice(0,8000))
  if (settings.provider==='openai') {
    const base = (settings.baseUrl||'').trim().replace(/\/+$/,'') || 'https://api.openai.com/v1'
    const url = /\/embeddings$/.test(base) ? base : base + '/embeddings'
    const model = settings.model || EMBED_PROVIDER_DEFAULT_MODEL
    const headers: Record<string,string> = { 'content-type':'application/json' }
    if (settings.apiKey && settings.apiKey.trim()) headers.authorization = `Bearer ${settings.apiKey.trim()}`
    // batch
    const all: number[][] = []
    for (let i=0;i<clean.length;i+=EMBEDDING_BATCH_SIZE) {
      const batch = clean.slice(i, i+EMBEDDING_BATCH_SIZE)
      const body = JSON.stringify({ model, input: batch, encoding_format: 'float' })
      const res = await fetchWithRetry(url, { method:'POST', headers, body })
      const data:any = await res.json().catch(()=>null)
      const arr = data?.data
      if (!Array.isArray(arr) || arr.length!==batch.length) throw new Error('Invalid embedding response from OpenAI-compatible provider')
      for (const item of arr) {
        const emb = (item as any).embedding
        if (!Array.isArray(emb)) throw new Error('Invalid embedding vector')
        // normalize already? ensure float array
        all.push(emb.map((x:any)=> Number(x)||0))
      }
    }
    return all
  } else if (settings.provider==='ollama') {
    const base = (settings.baseUrl||'').trim().replace(/\/+$/,'') || 'http://localhost:11434'
    // Ollama native: POST /api/embed with { model, input: string | string[] }
    const cleanBase = base.replace(/\/v1\/?$/,'')
    const model = settings.model || OLLAMA_EMBED_DEFAULT_MODEL
    const headers: Record<string,string> = { 'content-type':'application/json' }
    if (settings.apiKey && settings.apiKey.trim()) headers.authorization = `Bearer ${settings.apiKey.trim()}`
    // Try batch embed API if available (Ollama 0.1.20+ supports input as array)
    const url = cleanBase + '/api/embed'
    // batch
    const all: number[][] = []
    for (let i=0;i<clean.length;i+=EMBEDDING_BATCH_SIZE) {
      const batch = clean.slice(i, i+EMBEDDING_BATCH_SIZE)
      try {
        const body = JSON.stringify({ model, input: batch })
        const res = await fetchWithRetry(url, { method:'POST', headers, body })
        const data:any = await res.json().catch(()=>null)
        const embs = (data as any)?.embeddings
        if (Array.isArray(embs) && embs.length===batch.length) {
          for (const emb of embs) all.push((emb as any[]).map((x:any)=> Number(x)||0))
          continue
        }
        throw new Error('fallback to per-item')
      } catch {
        // fallback per-item to /api/embeddings with prompt
        for (const text of batch) {
          const u2 = cleanBase + '/api/embeddings'
          const body2 = JSON.stringify({ model, prompt: text })
          const res2 = await fetchWithRetry(u2, { method:'POST', headers, body: body2 })
          const data2:any = await res2.json().catch(()=>null)
          const emb = (data2 as any)?.embedding
          if (!Array.isArray(emb)) throw new Error('Invalid Ollama embedding')
          all.push(emb.map((x:any)=> Number(x)||0))
        }
      }
    }
    return all
  }
  throw new Error('unknown provider')
}
export async function embedMany(texts: string[]): Promise<number[][]> {
  const toEmbed = texts.map(t=> String(t||''))
  if (toEmbed.length===0) return []
  try {
    const settings = getEmbeddingSettings()
    if (settings.provider!=='local' && settings.enabled) {
      const remote = await embedManyRemote(toEmbed)
      if (remote.length===toEmbed.length) {
        // normalize remote vectors to unit for cosine consistency
        return remote.map(v=>{
          let n=0; for(const x of v) n+=x*x; n=Math.sqrt(n); if(n>0) return v.map(x=> x/n); return v
        })
      }
    }
  } catch (e) { console.warn('[embed] remote failed, fallback to local', String((e as any)?.message||e).slice(0,120)) }
  return toEmbed.map(t=> localEmbed(t))
}
export function embedManyLocal(texts: string[]): number[][] {
  return texts.map(t=> localEmbed(String(t||'')))
}

export function ensureEmbeddingTable(): void {
  const s = ensureDb()
  s.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      contentHash TEXT NOT NULL,
      tokens TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_embeddings_projectId ON embeddings(projectId);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_project_path ON embeddings(projectId, filePath);
  `)
  ensureEmbeddingChunkTable()
}
export function ensureEmbeddingChunkTable(): void {
  const s = ensureDb()
  s.exec(`
    CREATE TABLE IF NOT EXISTS embedding_chunks (
      id TEXT PRIMARY KEY,
      projectId TEXT NOT NULL,
      filePath TEXT NOT NULL,
      chunkIndex INTEGER NOT NULL,
      contentHash TEXT NOT NULL,
      chunkText TEXT NOT NULL,
      vector TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_embedding_chunks_projectId ON embedding_chunks(projectId);
    CREATE INDEX IF NOT EXISTS idx_embedding_chunks_project_path ON embedding_chunks(projectId, filePath);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_embedding_chunks_project_path_idx ON embedding_chunks(projectId, filePath, chunkIndex);
  `)
  // Attempt sqlite-vec virtual table (optional, fallback to JSON scan if missing) — pure-JS HNSW fallback handled in search
  try {
    // Test if vec0 available
    s.exec("CREATE VIRTUAL TABLE IF NOT EXISTS vec_tmp_test USING vec0(dummy float[384])")
    s.exec("DROP TABLE IF EXISTS vec_tmp_test")
    // If success, create vec_chunks for HNSW-like KNN (distance_metric=cosine)
    s.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(
        projectId TEXT,
        filePath TEXT,
        chunkIndex INTEGER,
        embedding FLOAT[384] distance_metric=cosine
      );
    `)
  } catch (e) {
    // sqlite-vec not available — fallback to JSON brute force, which is our default HNSW-like pure-JS scan
  }
}

export function upsertEmbedding(projectId: string, filePath: string, content: string): void {
  const pid = String(projectId ?? '').trim()
  if (!pid || pid.length > 100) throw new Error('projectId required')
  const fp = sanitizeEmbeddingPath(filePath)
  if (!fp) throw new Error('invalid filePath')
  const text = String(content ?? '')
  if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) throw new Error('content too large')
  const tokens = tokenizeForEmbedding(text)
  const tf = termFreqMap(tokens)
  const hash = hashContent(text)
  const s = ensureDb()
  ensureEmbeddingTable()
  const now = new Date().toISOString()
  const id = `${pid}:${fp}`
  try {
    s.prepare(`INSERT INTO embeddings (id, projectId, filePath, contentHash, tokens, updatedAt) VALUES (?,?,?,?,?,?)
               ON CONFLICT(projectId, filePath) DO UPDATE SET contentHash=excluded.contentHash, tokens=excluded.tokens, updatedAt=excluded.updatedAt`).run(
      id, pid, fp, hash, JSON.stringify(tf), now
    )
  } catch {}
  // Also upsert chunk vectors (vector per CHUNK) — sync local fallback for immediate availability
  try { upsertEmbeddingChunksSync(pid, fp, text) } catch (e) { console.warn('upsertEmbeddingChunksSync failed', String((e as any)?.message||e).slice(0,200)) }
}
export function upsertEmbeddingChunksSync(projectId: string, filePath: string, content: string): void {
  const pid = String(projectId ?? '').trim()
  const fp = sanitizeEmbeddingPath(filePath)
  if (!pid || !fp) return
  const text = String(content ?? '')
  if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) return
  const chunksRaw = text.length > 4000 && !text.includes(' ') ? chunkContentCharFallback(text) : chunkContentForEmbedding(text)
  const chunks = chunksRaw.map(c=> c.trim()).filter(Boolean).slice(0, VECTOR_MAX_CHUNKS_PER_FILE)
  if (chunks.length===0) return
  const s = ensureDb()
  ensureEmbeddingChunkTable()
  const now = new Date().toISOString()
  // incremental: check existing hashes to skip unchanged chunks (contentHash per chunk)
  let existingMap = new Map<string,string>() // chunkIndex -> hash
  try {
    const rows = s.prepare('SELECT chunkIndex, contentHash FROM embedding_chunks WHERE projectId=? AND filePath=?').all(pid, fp) as any[]
    for (const r of rows) existingMap.set(String(r.chunkIndex), String(r.contentHash))
  } catch {}
  const toEmbed: { idx:number; text:string; hash:string }[] = []
  for (let i=0;i<chunks.length;i++) {
    const h = hashContent(chunks[i])
    if (existingMap.get(String(i)) === h) continue // skip unchanged
    toEmbed.push({ idx:i, text: chunks[i], hash:h })
  }
  if (toEmbed.length===0 && existingMap.size===chunks.length) return // all unchanged
  // generate vectors for needed chunks via localEmbed sync
  const vectors = toEmbed.map(e=> localEmbed(e.text))
  const txn = s.transaction(()=>{
    // delete stale chunks beyond new length? We'll delete all then reinsert changed + keep unchanged by not deleting unchanged? Simpler: delete all for this file then insert all with appropriate vectors (reusing old where unchanged)
    // To keep incremental efficient, we already skipped unchanged, but we still need to ensure DB has correct set: delete those indices that are no longer present or changed
    // For simplicity, delete all for this file and reinsert all (fast for 5k files, 60 chunks each)
    // First collect vectors for all chunks (including unchanged need to fetch existing vector)
    const allRows: { idx:number; hash:string; vec:number[]; txt:string }[] = []
    // map existing vectors for unchanged
    const existingVecMap = new Map<string, string>()
    try {
      const rows = s.prepare('SELECT chunkIndex, vector FROM embedding_chunks WHERE projectId=? AND filePath=?').all(pid, fp) as any[]
      for (const r of rows) existingVecMap.set(String(r.chunkIndex), String(r.vector))
    } catch {}
    const newVecMap = new Map<string, number[]>()
    for (let k=0;k<toEmbed.length;k++) newVecMap.set(String(toEmbed[k].idx), vectors[k])
    for (let i=0;i<chunks.length;i++) {
      const h = hashContent(chunks[i])
      let vec = newVecMap.get(String(i))
      if (!vec) {
        const existingJson = existingVecMap.get(String(i))
        if (existingJson) {
          try { vec = JSON.parse(existingJson) as number[] } catch { vec = localEmbed(chunks[i]) }
        } else vec = localEmbed(chunks[i])
      }
      allRows.push({ idx:i, hash:h, vec, txt: chunks[i] })
    }
    // clear existing for this file
    s.prepare('DELETE FROM embedding_chunks WHERE projectId=? AND filePath=?').run(pid, fp)
    // try clear vec_chunks as well if exists
    try { s.prepare('DELETE FROM vec_chunks WHERE projectId=? AND filePath=?').run(pid, fp) } catch {}
    const ins = s.prepare('INSERT INTO embedding_chunks (id, projectId, filePath, chunkIndex, contentHash, chunkText, vector, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
    let vecIns: any = null
    try { vecIns = s.prepare('INSERT INTO vec_chunks (projectId, filePath, chunkIndex, embedding) VALUES (?,?,?,?)') } catch {}
    for (const r of allRows) {
      const id = `${pid}:${fp}:${r.idx}`
      ins.run(id, pid, fp, r.idx, r.hash, r.txt, JSON.stringify(r.vec), now)
      if (vecIns) {
        try {
          // sqlite-vec expects vec as JSON string or float array? Pass as JSON
          vecIns.run(pid, fp, r.idx, JSON.stringify(r.vec))
        } catch {}
      }
    }
  })
  try { txn() } catch (e) { console.warn('upsertEmbeddingChunksSync txn failed', e) }
}
export async function upsertEmbeddingAsync(projectId: string, filePath: string, content: string): Promise<void> {
  const pid = String(projectId ?? '').trim()
  const fp = sanitizeEmbeddingPath(filePath)
  if (!pid || !fp) return
  const text = String(content ?? '')
  if (Buffer.byteLength(text, 'utf8') > 2 * 1024 * 1024) return
  // Sync part for TF-IDF
  try { upsertEmbedding(pid, fp, text) } catch {}
  // Async chunk vector with provider
  const s = ensureDb()
  ensureEmbeddingChunkTable()
  const chunksRaw = text.length > 4000 && !text.includes(' ') ? chunkContentCharFallback(text) : chunkContentForEmbedding(text)
  const chunks = chunksRaw.map(c=> c.trim()).filter(Boolean).slice(0, VECTOR_MAX_CHUNKS_PER_FILE)
  if (chunks.length===0) return
  let existingMap = new Map<string,string>()
  try {
    const rows = s.prepare('SELECT chunkIndex, contentHash FROM embedding_chunks WHERE projectId=? AND filePath=?').all(pid, fp) as any[]
    for (const r of rows) existingMap.set(String(r.chunkIndex), String(r.contentHash))
  } catch {}
  const toEmbed: { idx:number; text:string; hash:string }[] = []
  for (let i=0;i<chunks.length;i++) {
    const h = hashContent(chunks[i])
    if (existingMap.get(String(i)) === h) continue
    toEmbed.push({ idx:i, text: chunks[i], hash:h })
  }
  if (toEmbed.length===0 && existingMap.size===chunks.length) return
  const texts = toEmbed.map(e=> e.text)
  let vectors: number[][] = []
  try { vectors = await embedMany(texts) } catch { vectors = toEmbed.map(e=> localEmbed(e.text)) }
  const now = new Date().toISOString()
  const txn = s.transaction(()=>{
    s.prepare('DELETE FROM embedding_chunks WHERE projectId=? AND filePath=?').run(pid, fp)
    try { s.prepare('DELETE FROM vec_chunks WHERE projectId=? AND filePath=?').run(pid, fp) } catch {}
    const ins = s.prepare('INSERT INTO embedding_chunks (id, projectId, filePath, chunkIndex, contentHash, chunkText, vector, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
    let vecIns: any = null
    try { vecIns = s.prepare('INSERT INTO vec_chunks (projectId, filePath, chunkIndex, embedding) VALUES (?,?,?,?)') } catch {}
    // Need to reconstitute all chunks with vectors (reuse existing for unchanged)
    const existingVecMap = new Map<string, string>()
    // we already deleted, so need to use cached? Simpler: after delete, insert all with generated or local
    const newVecMap = new Map<string, number[]>()
    for (let k=0;k<toEmbed.length;k++) newVecMap.set(String(toEmbed[k].idx), vectors[k] || localEmbed(toEmbed[k].text))
    for (let i=0;i<chunks.length;i++) {
      const h = hashContent(chunks[i])
      let vec = newVecMap.get(String(i))
      if (!vec) {
        // for unchanged we deleted, so need to recompute (should not happen as we included only changed, but if toEmbed didn't include i, vec is undefined -> use local)
        vec = localEmbed(chunks[i])
      }
      const id = `${pid}:${fp}:${i}`
      ins.run(id, pid, fp, i, h, chunks[i], JSON.stringify(vec), now)
      if (vecIns) try { vecIns.run(pid, fp, i, JSON.stringify(vec)) } catch {}
    }
  })
  try { txn() } catch (e) { console.warn('upsertEmbeddingAsync txn failed', e) }
}
export function deleteEmbedding(projectId: string, filePath: string): void {
  const pid = String(projectId ?? '').trim()
  const fp = sanitizeEmbeddingPath(filePath)
  if (!pid || !fp) return
  try { ensureDb().prepare('DELETE FROM embeddings WHERE projectId=? AND filePath=?').run(pid, fp) } catch {}
  try { ensureDb().prepare('DELETE FROM embedding_chunks WHERE projectId=? AND filePath=?').run(pid, fp) } catch {}
  try { ensureDb().prepare('DELETE FROM vec_chunks WHERE projectId=? AND filePath=?').run(pid, fp) } catch {}
}
export function clearEmbeddingsForProject(projectId: string): void {
  const pid = String(projectId ?? '').trim()
  if (!pid) return
  try { ensureDb().prepare('DELETE FROM embeddings WHERE projectId=?').run(pid) } catch {}
  try { ensureDb().prepare('DELETE FROM embedding_chunks WHERE projectId=?').run(pid) } catch {}
  try { ensureDb().prepare('DELETE FROM vec_chunks WHERE projectId=?').run(pid) } catch {}
}
export function getEmbeddingCount(projectId: string): number {
  const pid = String(projectId ?? '').trim()
  if (!pid) return 0
  try {
    ensureEmbeddingChunkTable()
    const row = ensureDb().prepare('SELECT COUNT(*) as c FROM embedding_chunks WHERE projectId=?').get(pid) as any
    const chunkCount = Number(row?.c ?? 0)
    if (chunkCount>0) return chunkCount
    const row2 = ensureDb().prepare('SELECT COUNT(*) as c FROM embeddings WHERE projectId=?').get(pid) as any
    return Number(row2?.c ?? 0)
  } catch { return 0 }
}
function collectFilesForEmbedding(root: string, includePattern: string | null, maxFiles: number): string[] {
  const includeRe = includePattern ? globToRegExpEmbed(includePattern) : null
  const results: string[] = []
  const stack: string[] = [root]
  let scannedDirs = 0
  while (stack.length && results.length < maxFiles && scannedDirs < EMBED_MAX_FILES_SCANNED) {
    const cur = stack.pop()!
    scannedDirs++
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(cur, { withFileTypes: true }) } catch { continue }
    for (const ent of entries) {
      const full = path.join(cur, ent.name)
      if (ent.isDirectory()) {
        if (isIgnoredDirEmbed(ent.name)) continue
        stack.push(full)
      } else if (ent.isFile()) {
        if (results.length >= maxFiles) break
        if (!isTextFileForEmbed(ent.name)) continue
        if (includeRe) {
          const rel = path.relative(root, full).split(path.sep).join('/')
          if (!includeRe.test(rel) && !includeRe.test(ent.name)) continue
        }
        results.push(full)
      }
    }
  }
  return results
}
function cosineTfIdf(queryTf: Record<string, number>, docTf: Record<string, number>, idf: Map<string, number>, queryLen: number, docLen: number): number {
  let dot = 0
  let normQ = 0
  let normD = 0
  for (const [term, cnt] of Object.entries(queryTf)) {
    const tfQ = cnt / Math.max(1, queryLen)
    const idfVal = idf.get(term) ?? 1
    const wQ = tfQ * idfVal
    normQ += wQ * wQ
    const cntD = (docTf as any)[term]
    if (cntD != null) {
      const tfD = cntD / Math.max(1, docLen)
      const wD = tfD * idfVal
      dot += wQ * wD
    }
  }
  for (const [term, cnt] of Object.entries(docTf)) {
    const tfD = cnt / Math.max(1, docLen)
    const idfVal = idf.get(term) ?? 1
    const wD = tfD * idfVal
    normD += wD * wD
  }
  if (normQ === 0 || normD === 0) return 0
  return dot / (Math.sqrt(normQ) * Math.sqrt(normD))
}
export function rebuildEmbeddingsForProject(projectId: string): number {
  const proj = findProject(projectId)
  if (!proj) throw new Error('Project not found')
  const root = proj.path
  try { if (!fs.statSync(root).isDirectory()) throw new Error('Project path not a directory') } catch (e: any) { throw new Error(e?.message || 'Invalid project path') }
  const files = collectFilesForEmbedding(root, null, EMBED_MAX_FILES_INDEXED)
  let indexed = 0
  for (const abs of files) {
    try {
      const st = fs.statSync(abs)
      if (st.size > EMBED_MAX_FILE_SIZE) continue
      const content = fs.readFileSync(abs, 'utf8')
      if (content.includes('\0')) continue
      const rel = path.relative(root, abs).split(path.sep).join('/')
      const safe = sanitizeEmbeddingPath(rel)
      if (!safe) continue
      upsertEmbedding(projectId, safe, content)
      indexed++
    } catch {}
  }
  return indexed
}
export async function rebuildEmbeddingsForProjectAsync(projectId: string): Promise<number> {
  const proj = findProject(projectId)
  if (!proj) throw new Error('Project not found')
  const root = proj.path
  try { if (!fs.statSync(root).isDirectory()) throw new Error('Project path not a directory') } catch (e: any) { throw new Error(e?.message || 'Invalid project path') }
  const files = collectFilesForEmbedding(root, null, EMBED_MAX_FILES_INDEXED)
  let indexed = 0
  // Batch collect all chunks needing embedding across files for efficient remote batching
  const batchTexts: string[] = []
  const batchMeta: { pid:string; fp:string; chunkIdx:number; hash:string; txt:string }[] = []
  // First, for each file compute chunks and check existing hash to decide what to embed
  const s = ensureDb()
  ensureEmbeddingChunkTable()
  const fileChunksMap = new Map<string, { abs:string; rel:string; content:string; chunks:string[] }>()
  for (const abs of files) {
    try {
      const st = fs.statSync(abs)
      if (st.size > EMBED_MAX_FILE_SIZE) continue
      const content = fs.readFileSync(abs, 'utf8')
      if (content.includes('\0')) continue
      const rel = path.relative(root, abs).split(path.sep).join('/')
      const safe = sanitizeEmbeddingPath(rel)
      if (!safe) continue
      const chunks = (content.length > 4000 && !content.includes(' ') ? chunkContentCharFallback(content) : chunkContentForEmbedding(content)).map(c=>c.trim()).filter(Boolean).slice(0, VECTOR_MAX_CHUNKS_PER_FILE)
      if (chunks.length===0) continue
      fileChunksMap.set(safe, { abs, rel: safe, content, chunks })
    } catch {}
  }
  // For each file, diff against existing DB hashes
  for (const [fp, info] of fileChunksMap) {
    const { chunks } = info
    let existingHashes = new Set<string>()
    try {
      const rows = s.prepare('SELECT chunkIndex, contentHash FROM embedding_chunks WHERE projectId=? AND filePath=?').all(projectId, fp) as any[]
      for (const r of rows) existingHashes.add(`${r.chunkIndex}:${r.contentHash}`)
    } catch {}
    for (let i=0;i<chunks.length;i++) {
      const h = hashContent(chunks[i])
      if (existingHashes.has(`${i}:${h}`)) continue
      batchTexts.push(chunks[i])
      batchMeta.push({ pid: projectId, fp, chunkIdx: i, hash: h, txt: chunks[i] })
    }
  }
  // Also need to upsert TF-IDF embeddings for all files (sync part)
  for (const [fp, info] of fileChunksMap) {
    try {
      const tokens = tokenizeForEmbedding(info.content)
      const tf = termFreqMap(tokens)
      const hash = hashContent(info.content)
      const now = new Date().toISOString()
      const id = `${projectId}:${fp}`
      s.prepare(`INSERT INTO embeddings (id, projectId, filePath, contentHash, tokens, updatedAt) VALUES (?,?,?,?,?,?)
                 ON CONFLICT(projectId, filePath) DO UPDATE SET contentHash=excluded.contentHash, tokens=excluded.tokens, updatedAt=excluded.updatedAt`).run(
        id, projectId, fp, hash, JSON.stringify(tf), now
      )
      indexed++
    } catch {}
  }
  if (batchTexts.length>0) {
    // embed batch with fallback
    let vectors: number[][] = []
    try { vectors = await embedMany(batchTexts) } catch { vectors = batchTexts.map(t=> localEmbed(t)) }
    // Now upsert those chunks that were missing; also need to handle files where chunks changed but we deleted all? Simpler: for each file, rewrite all chunks with correct vectors (reuse for unchanged)
    // Build per-file full vectors map
    const vecMap = new Map<string, Map<number, number[]>>()
    for (let k=0;k<batchMeta.length;k++) {
      const m = batchMeta[k]
      const v = vectors[k] || localEmbed(m.txt)
      if (!vecMap.has(m.fp)) vecMap.set(m.fp, new Map())
      vecMap.get(m.fp)!.set(m.chunkIdx, v)
    }
    const txn = s.transaction(()=> {
      for (const [fp, info] of fileChunksMap) {
        const now = new Date().toISOString()
        // Check if this file had any changed chunk or was not yet indexed
        const hasChanged = batchMeta.some(m=> m.fp===fp)
        if (!hasChanged) continue // already fully indexed and unchanged
        // For changed file, rebuild all its chunks: fetch existing vectors for unchanged indices to keep
        const existingVecMap = new Map<number, number[]>()
        try {
          const rows = s.prepare('SELECT chunkIndex, vector FROM embedding_chunks WHERE projectId=? AND filePath=?').all(projectId, fp) as any[]
          for (const r of rows) {
            try { existingVecMap.set(Number(r.chunkIndex), JSON.parse(String(r.vector)) as number[]) } catch {}
          }
        } catch {}
        s.prepare('DELETE FROM embedding_chunks WHERE projectId=? AND filePath=?').run(projectId, fp)
        try { s.prepare('DELETE FROM vec_chunks WHERE projectId=? AND filePath=?').run(projectId, fp) } catch {}
        const ins = s.prepare('INSERT INTO embedding_chunks (id, projectId, filePath, chunkIndex, contentHash, chunkText, vector, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
        let vecIns: any = null
        try { vecIns = s.prepare('INSERT INTO vec_chunks (projectId, filePath, chunkIndex, embedding) VALUES (?,?,?,?)') } catch {}
        for (let i=0;i<info.chunks.length;i++) {
          const txt = info.chunks[i]
          const h = hashContent(txt)
          let vec = vecMap.get(fp)?.get(i)
          if (!vec) vec = existingVecMap.get(i) || localEmbed(txt)
          const id = `${projectId}:${fp}:${i}`
          ins.run(id, projectId, fp, i, h, txt, JSON.stringify(vec), now)
          if (vecIns) try { vecIns.run(projectId, fp, i, JSON.stringify(vec)) } catch {}
        }
      }
      // For files that had no changed but not yet in DB (new file with no entry before), they were not in batchMeta? Actually new files are in fileChunksMap but not in existing, so batchTexts would have included them, so they are handled above as hasChanged true. Good.
      // For completely new files where batchMeta empty because they are new but we still need to insert? Those files are already handled as hasChanged true because they had missing rows, they will be inserted.
      // However for files that are new and had no existingVecMap, they are inserted via above loop only if hasChanged true (which they are). So need to ensure new files get inserted even if they were not in batchMeta due to maybe zero chunks? Already handled.
      // Also need to insert files that were not changed but have no DB rows yet (first index) — they would have been considered changed because existingHashes empty, so batchTexts includes them.
    })
    try { txn() } catch (e) { console.warn('rebuildEmbeddingsForProjectAsync txn failed', e) }
    // For files that were unchanged (no txn), they already have rows and count as indexed (already counted)
  } else {
    // No batch needed, but we still need to ensure chunk rows exist for files that have TF-IDF but no chunk rows yet (first run with old DB where only embeddings table existed)
    // Fallback: for any file in fileChunksMap where chunk rows missing, fill via localEmbed sync
    for (const [fp, info] of fileChunksMap) {
      try {
        const cnt = (s.prepare('SELECT COUNT(*) as c FROM embedding_chunks WHERE projectId=? AND filePath=?').get(projectId, fp) as any)?.c ?? 0
        if (cnt>0) continue
        // need to create chunks
        const now = new Date().toISOString()
        const ins = s.prepare('INSERT INTO embedding_chunks (id, projectId, filePath, chunkIndex, contentHash, chunkText, vector, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
        const tx = s.transaction(()=>{
          for (let i=0;i<info.chunks.length;i++) {
            const txt = info.chunks[i]
            const h = hashContent(txt)
            const vec = localEmbed(txt)
            const id = `${projectId}:${fp}:${i}`
            ins.run(id, projectId, fp, i, h, txt, JSON.stringify(vec), now)
            try { s.prepare('INSERT INTO vec_chunks (projectId, filePath, chunkIndex, embedding) VALUES (?,?,?,?)').run(projectId, fp, i, JSON.stringify(vec)) } catch {}
          }
        })
        try { tx() } catch {}
      } catch {}
    }
  }
  return indexed
}
export interface SemanticHit { path: string; score: number; snippet?: string; source: 'vector' | 'bm25' | 'grep' | 'hybrid' | 'semantic' | 'grep' }
export function semanticSearch(projectId: string, query: string, opts?: { limit?: number; include?: string | null; projectPath?: string }): SemanticHit[] {
  const rawQuery = String(query ?? '').trim()
  if (!rawQuery) return []
  if (rawQuery.length > 500) throw new Error('query too long (max 500)')
  if (rawQuery.includes('\0')) throw new Error('invalid query')
  const pid = String(projectId ?? '').trim()
  if (!pid) throw new Error('projectId required')
  const limit = Math.max(1, Math.min(100, Math.floor(Number(opts?.limit ?? 20) || 20)))
  const includeRaw = opts?.include != null ? String(opts.include).trim().slice(0, 200) : null
  if (includeRaw && includeRaw.includes('\0')) throw new Error('invalid include')
  let projectPath = opts?.projectPath ?? null
  if (!projectPath) {
    const proj = findProject(pid)
    if (!proj) return []
    projectPath = proj.path
  }
  const projCheck = findProject(pid)
  if (projCheck && path.resolve(projectPath) !== path.resolve(projCheck.path)) {
    throw new Error('projectPath mismatch')
  }
  let rootAbs: string
  try { rootAbs = path.resolve(projectPath!); if (!fs.existsSync(rootAbs) || !fs.statSync(rootAbs).isDirectory()) return [] } catch { return [] }
  ensureEmbeddingChunkTable()
  // collect candidate files (respect include)
  const files = collectFilesForEmbedding(rootAbs, includeRaw || null, EMBED_MAX_FILES_SCANNED)
  if (files.length === 0) return []
  const queryTokensArr = tokenizeForEmbedding(rawQuery)
  const effectiveQueryForTokens = queryTokensArr.length ? queryTokensArr : rawQuery.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).slice(0, 20)
  const queryTf = termFreqMap(effectiveQueryForTokens)
  const queryLen = effectiveQueryForTokens.length || 1
  // Query vector for cosine (vector part) — localEmbed sync for query (fast, no remote needed for search; remote query embedding would be async and not feasible sync)
  const queryVec = localEmbed(rawQuery)
  // Prepare per-chunk data: load stored chunk vectors if available
  type ChunkData = { filePath: string; chunkIdx: number; chunkText: string; vec: number[] | null; tf: Record<string,number>; docLen: number; hasGrep: boolean; snippet: string }
  const chunkDatas: ChunkData[] = []
  const df = new Map<string, number>()
  let grepRe: RegExp | null = null
  try { grepRe = new RegExp(rawQuery, 'mi') } catch {
    try { const esc = rawQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); grepRe = new RegExp(esc, 'mi') } catch { grepRe = null }
  }
  // Load embedding_chunks for this project
  let chunkRows: any[] = []
  try {
    chunkRows = ensureDb().prepare('SELECT filePath, chunkIndex, chunkText, vector FROM embedding_chunks WHERE projectId=?').all(pid) as any[]
  } catch { chunkRows = [] }
  const chunkVecMap = new Map<string, number[]>()
  const chunkTextMap = new Map<string, string>()
  for (const r of chunkRows) {
    const key = `${r.filePath}:${r.chunkIndex}`
    try { chunkVecMap.set(key, JSON.parse(String(r.vector)) as number[]) } catch {}
    chunkTextMap.set(key, String(r.chunkText||''))
  }
  const hasAnyVector = chunkVecMap.size > 0
  // Also load file-level embeddings for fallback BM25 when no chunk vectors
  let embedMap = new Map<string, Record<string, number>>()
  try {
    const rows = ensureDb().prepare('SELECT filePath, tokens FROM embeddings WHERE projectId=?').all(pid) as any[]
    for (const r of rows) {
      try { const parsed = JSON.parse(r.tokens); if (parsed && typeof parsed === 'object') embedMap.set(r.filePath, parsed as Record<string, number>) } catch {}
    }
  } catch {}
  // For chunk mode: iterate over stored chunks if available, else fallback to file scan live
  if (hasAnyVector && chunkRows.length>0) {
    // Use stored chunks as corpus — filter by include if needed
    const includeRe = includeRaw ? globToRegExpEmbed(includeRaw) : null
    for (const r of chunkRows) {
      const fp = String(r.filePath)
      if (includeRe) {
        if (!includeRe.test(fp) && !includeRe.test(path.basename(fp))) continue
      }
      const txt = String(r.chunkText||'')
      const vec = chunkVecMap.get(`${fp}:${r.chunkIndex}`) || null
      const toks = tokenizeForEmbedding(txt)
      if (toks.length===0) continue
      const tf = termFreqMap(toks)
      const docLen = toks.length
      for (const term of Object.keys(tf)) df.set(term, (df.get(term)??0)+1)
      let hasGrep=false
      let snippet=''
      if (grepRe) {
        try {
          if (grepRe.test(txt)) { hasGrep=true; const line = txt.split('\n').find(l=> { try{ if(grepRe!.global) grepRe!.lastIndex=0; return grepRe!.test(l)}catch{return false}}); snippet = `${fp}:${r.chunkIndex}:${(line||txt).trim().slice(0,300)}` }
          else if (txt.toLowerCase().includes(rawQuery.toLowerCase())) { hasGrep=true; snippet=`${fp}:${r.chunkIndex}:${txt.slice(0,300).replace(/\n/g,' ').trim()}` }
        } catch { if (txt.toLowerCase().includes(rawQuery.toLowerCase())) { hasGrep=true; snippet=`${fp}:${r.chunkIndex}:${txt.slice(0,300)}` } }
      } else if (txt.toLowerCase().includes(rawQuery.toLowerCase())) { hasGrep=true; snippet=`${fp}:${r.chunkIndex}:${txt.slice(0,300)}` }
      if (!snippet) snippet=`${fp}:${r.chunkIndex}:${txt.slice(0,200).replace(/\n/g,' ').trim()}`
      chunkDatas.push({ filePath: fp, chunkIdx: Number(r.chunkIndex), chunkText: txt, vec, tf, docLen, hasGrep, snippet })
    }
    // If include filtered out all chunks, fallback to live scan of files
    if (chunkDatas.length===0 && files.length>0) {
      // fall through to file scan
    } else if (chunkDatas.length>0) {
      // Compute BM25 + vector hybrid per chunk
      const N = chunkDatas.length
      let avgLen = 0
      for (const c of chunkDatas) avgLen+=c.docLen
      avgLen = avgLen / Math.max(1,N)
      // compute IDF for all terms
      const idfMap = new Map<string, number>()
      const allTerms = new Set<string>([...Object.keys(queryTf), ...Array.from(df.keys())])
      for (const term of allTerms) {
        const d = df.get(term) ?? 0
        const v = Math.log((N + 1) / (d + 1)) + 1
        idfMap.set(term, v)
      }
      // compute raw scores
      type Scored = ChunkData & { vectorScore:number; bm25:number; grepBoost:number; finalScore:number; source: SemanticHit['source'] }
      const scored: Scored[] = []
      let maxBm25 = 0
      const tmp = chunkDatas.map(c=> {
        const bm = bm25Score(queryTf, c.tf, c.docLen, avgLen, df, N)
        if (bm>maxBm25) maxBm25 = bm
        return { c, bm }
      })
      for (const {c,bm} of tmp) {
        const vecScore = c.vec ? cosineVec(queryVec, c.vec) : 0
        // normalize bm25 0-1
        const normBm = maxBm25>0 ? bm / maxBm25 : 0
        const grepBoost = c.hasGrep ? 1 : 0
        // hybrid: 0.5*vector +0.3*BM25 +0.2*grepBoost — per spec store.ts:839
        let final = 0.5*vecScore + 0.3*normBm + 0.2*grepBoost
        // when no grep but high vector, keep vector dominance; when grep hit ensure at least 0.35
        if (c.hasGrep && final<0.35) final = 0.35 + vecScore*0.1
        // Determine source
        let source: SemanticHit['source'] = 'hybrid'
        if (!hasAnyVector) source='grep'
        else if (c.hasGrep && vecScore>0.2) source='hybrid'
        else if (vecScore>0.35) source='vector'
        else if (normBm>0.4) source='bm25'
        else if (c.hasGrep) source='grep'
        else source='vector'
        scored.push({ ...c, vectorScore: vecScore, bm25: normBm, grepBoost, finalScore: final, snippet: c.snippet, source })
        // augment source for low fallback
      }
      // Filter very low when no vector and no grep? keep hybrid behavior: if no grep and score <0.15 hide
      let filtered = scored
      // Sort
      scored.sort((a,b)=> {
        if (b.finalScore!==a.finalScore) return b.finalScore-a.finalScore
        if (a.hasGrep!==b.hasGrep) return a.hasGrep? -1:1
        return a.filePath.localeCompare(b.filePath)
      })
      // Deduplicate per filePath keep highest score per file (chunk-level -> file-level)
      const bestPerFile = new Map<string, Scored>()
      for (const s of scored) {
        const existing = bestPerFile.get(s.filePath)
        if (!existing || s.finalScore>existing.finalScore) bestPerFile.set(s.filePath, s)
      }
      const deduped = Array.from(bestPerFile.values())
      deduped.sort((a,b)=> b.finalScore-a.finalScore)
      // If no vector but grep hits exist, strictly prioritize grep hits (fallback)
      let finalList = deduped
      if (!hasAnyVector) {
        const grepHits = deduped.filter(s=> s.hasGrep)
        if (grepHits.length>0) finalList = grepHits
      }
      const top = finalList.slice(0, limit)
      return top.map(s=> ({ path: s.filePath, score: Math.round(s.finalScore*1000)/1000, snippet: s.snippet, source: s.source as any }))
    }
  }
  // Fallback: no chunk vectors or filtered empty — use file-level TF-IDF + grep hybrid like before (but with BM25 + grepBoost weighting)
  // Build per-file data live from files
  type FileData = { abs: string; rel: string; tf: Record<string, number>; docLen: number; hasGrep: boolean; snippet: string; size: number }
  const fileDatas: FileData[] = []
  const df2 = new Map<string, number>()
  let embedMap2 = embedMap
  for (const abs of files) {
    try {
      const st = fs.statSync(abs)
      if (st.size > EMBED_MAX_FILE_SIZE) continue
      const rel = path.relative(rootAbs, abs).split(path.sep).join('/')
      const safe = sanitizeEmbeddingPath(rel)
      if (!safe) continue
      let content: string
      try { content = fs.readFileSync(abs, 'utf8') } catch { continue }
      if (content.includes('\0')) continue
      let hasGrep = false
      let snippet = ''
      if (grepRe) {
        const lines = content.split('\n')
        for (let i=0;i<lines.length;i++) {
          try {
            if (grepRe.global) grepRe.lastIndex = 0
            if (grepRe.test(lines[i])) { hasGrep = true; const trim = lines[i].trim().slice(0, 300); snippet = `${rel}:${i+1}:${trim}`; break }
            if (grepRe.global) grepRe.lastIndex = 0
          } catch { if (lines[i].toLowerCase().includes(rawQuery.toLowerCase())) { hasGrep = true; snippet = `${rel}:${i+1}:${lines[i].trim().slice(0,300)}`; break } }
        }
        if (!hasGrep && content.toLowerCase().includes(rawQuery.toLowerCase())) { hasGrep = true; if (!snippet) snippet = `${rel}:1:${content.slice(0,300).replace(/\n/g,' ').trim()}` }
      } else {
        if (content.toLowerCase().includes(rawQuery.toLowerCase())) { hasGrep = true; snippet = `${rel}:1:${content.slice(0,300).replace(/\n/g,' ').trim()}` }
      }
      if (!snippet) snippet = `${rel}:1:${content.slice(0,200).replace(/\n/g,' ').trim()}`
      let tf: Record<string, number>
      let docLen: number
      const stored = embedMap2.get(safe)
      if (stored && Object.keys(stored).length) {
        tf = stored
        docLen = Object.values(stored).reduce((a,b)=>a+b, 0) || 1
      } else {
        const toks = tokenizeForEmbedding(content)
        if (toks.length === 0) continue
        tf = termFreqMap(toks)
        docLen = toks.length
      }
      for (const term of Object.keys(tf)) df2.set(term, (df2.get(term) ?? 0) + 1)
      fileDatas.push({ abs, rel, tf, docLen, hasGrep, snippet, size: st.size })
    } catch {}
  }
  if (fileDatas.length === 0) return []
  const N2 = fileDatas.length
  let avgLen2 = 0
  for (const fd of fileDatas) avgLen2+=fd.docLen
  avgLen2/=Math.max(1,N2)
  const idf2 = new Map<string, number>()
  const allTerms2 = new Set<string>([...Object.keys(queryTf), ...Array.from(df2.keys())])
  for (const term of allTerms2) {
    const d = df2.get(term) ?? 0
    const v = Math.log((N2 + 1) / (d + 1)) + 1
    idf2.set(term, v)
  }
  for (const term of Object.keys(queryTf)) if (!idf2.has(term)) idf2.set(term, Math.log((N2+1)/1)+1)
  const hasAnyEmbedding2 = embedMap2.size > 0
  // Compute BM25 + query vector cosine against file-level local vectors (fallback when chunk vectors missing)
  const fileQueryVec = hasAnyEmbedding2 ? queryVec : localEmbed(rawQuery) // already queryVec
  // For file-level fallback we need file vectors: generate localEmbed per file content? But we have TF-IDF; we can approximate vector score via cosineTfIdf
  type ScoredF = FileData & { score:number; finalScore:number; source: SemanticHit['source']; vectorScore:number; bm25:number }
  const scored2: ScoredF[] = []
  let maxBm2=0
  const bmPerFile = fileDatas.map(fd=>{
    const bm = bm25Score(queryTf, fd.tf, fd.docLen, avgLen2, df2, N2)
    if(bm>maxBm2) maxBm2=bm
    return { fd, bm }
  })
  for (const {fd,bm} of bmPerFile) {
    const sem = cosineTfIdf(queryTf, fd.tf, idf2, queryLen, fd.docLen)
    const vecScore = sem // use TF-IDF cosine as vector proxy when no chunk vectors
    const normBm = maxBm2>0 ? bm/maxBm2 : 0
    const grepBoost = fd.hasGrep?1:0
    let final: number
    let source: SemanticHit['source'] = hasAnyEmbedding2 ? 'hybrid' : 'grep'
    if (fd.hasGrep) {
      final = 0.5*vecScore + 0.3*normBm + 0.2*grepBoost
      if (final<0.35) final=0.35+vecScore*0.1
      source = hasAnyEmbedding2 ? 'hybrid' : 'grep'
    } else {
      final = 0.5*vecScore*0.9 + 0.3*normBm
      source = 'semantic'
    }
    if (!fd.hasGrep && !hasAnyEmbedding2 && sem<0.05) continue
    scored2.push({ ...fd, score:sem, finalScore:final, source, vectorScore: vecScore, bm25:normBm })
  }
  scored2.sort((a,b)=> {
    if (b.finalScore!==a.finalScore) return b.finalScore-a.finalScore
    if (a.hasGrep!==b.hasGrep) return a.hasGrep?-1:1
    return a.rel.localeCompare(b.rel)
  })
  let filtered2 = scored2
  if (!hasAnyEmbedding2) {
    const grepHits = scored2.filter(s=>s.hasGrep)
    if (grepHits.length>0) filtered2=grepHits
  }
  const top2 = filtered2.slice(0, limit)
  return top2.map(s=> ({ path: s.rel, score: Math.round(s.finalScore*1000)/1000, snippet: s.snippet, source: s.source }))
}



function migrateLspSchema(s: Database.Database): void {
  try {
    const cols = s.prepare("PRAGMA table_info(lspServers)").all() as any[]
    if (!cols.length) return
    const names = new Set(cols.map((c: any) => c.name))
    // need to ensure transport, url, headers, command nullability matches new schema
    // SQLite cannot alter NOT NULL directly, but we can add missing columns
    if (!names.has('transport')) {
      try { s.exec("ALTER TABLE lspServers ADD COLUMN transport TEXT") } catch {}
      try { s.exec("UPDATE lspServers SET transport='stdio' WHERE transport IS NULL OR transport=''") } catch {}
    }
    if (!names.has('url')) {
      try { s.exec("ALTER TABLE lspServers ADD COLUMN url TEXT") } catch {}
    }
    if (!names.has('headers')) {
      try { s.exec("ALTER TABLE lspServers ADD COLUMN headers TEXT") } catch {}
    }
    // If command is NOT NULL but we want nullable, we leave as is — SQLite allows null inserts even if declared NOT NULL? We'll handle by ensuring command has default
    // Also ensure new columns have defaults for existing rows
  } catch {}
}

function migrateActivityIndex(s: Database.Database): void {
  try {
    const row = s.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND name='idx_activities_toolCallId'").get() as any
    if (row && typeof row.sql === 'string' && row.sql.toUpperCase().includes('UNIQUE')) {
      try { s.exec("DROP INDEX IF EXISTS idx_activities_toolCallId") } catch {}
      try { s.exec("CREATE INDEX IF NOT EXISTS idx_activities_toolCallId ON activities(toolCallId)") } catch {}
      console.log('[migrate] Fixed activities toolCallId index from UNIQUE to non-unique')
    }
  } catch {}
}

function titleFromFileName(base: string): string {
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function seedDefaultSkills(): boolean {
  let changed = false
  try {
    if (!fs.existsSync(defaultSkillsDir)) return false
    const entries = fs.readdirSync(defaultSkillsDir, { withFileTypes: true })
    for (const ent of entries) {
      if (!ent.isFile() || !ent.name.endsWith('.md')) continue
      const mainFile = ent.name
      const exists = db.skills.some((s) => s.mainFile === mainFile || s.name.toLowerCase() === titleFromFileName(mainFile.slice(0, -3)).toLowerCase())
      if (exists) continue
      let note = ''
      try {
        const content = fs.readFileSync(path.join(defaultSkillsDir, mainFile), 'utf8')
        const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)
        // first heading without '#'
        const heading = lines.find((l) => l.startsWith('#'))
        if (heading) note = heading.replace(/^#+\s*/, '').slice(0, 80)
        else if (lines[0]) note = lines[0].slice(0, 80)
      } catch {}
      const now = new Date().toISOString()
      db.skills.push({
        id: randomUUID(),
        name: titleFromFileName(mainFile.slice(0, -3)),
        note,
        mainFile,
        files: [],
        createdAt: now,
        updatedAt: now
      })
      changed = true
    }
    // Structured frontend skill folder: skills/frontend/skill.md + sub-files (react.md/ts.md/ejs.md)
    try {
      const frontendSkillDir = path.join(defaultSkillsDir, 'frontend')
      const frontendSkillMain = path.join(frontendSkillDir, 'skill.md')
      if (fs.existsSync(frontendSkillMain)) {
        const mainFile = 'frontend/skill.md'
        const expectedFiles = ['frontend/react.md', 'frontend/ts.md', 'frontend/ejs.md']
        const existingFiles = expectedFiles.filter((f) => fs.existsSync(path.join(defaultSkillsDir, f)))
        const existingSkill = db.skills.find((s) => s.name.toLowerCase() === 'frontend' || s.mainFile === 'frontend.md' || s.mainFile === mainFile)
        if (!existingSkill) {
          let note = 'Frontend Dev Skill'
          try {
            const content = fs.readFileSync(frontendSkillMain, 'utf8')
            const lines = content.split('\n').map((l) => l.trim()).filter(Boolean)
            const heading = lines.find((l) => l.startsWith('#'))
            if (heading) note = heading.replace(/^#+\s*/, '').slice(0, 80)
          } catch {}
          const now = new Date().toISOString()
          db.skills.push({
            id: randomUUID(),
            name: 'Frontend',
            note,
            mainFile,
            files: existingFiles,
            createdAt: now,
            updatedAt: now
          })
          changed = true
        } else {
          let needUpdate = false
          if (existingSkill.mainFile === 'frontend.md') {
            existingSkill.mainFile = mainFile
            needUpdate = true
          }
          const currentFiles = new Set(existingSkill.files || [])
          for (const f of existingFiles) {
            if (!currentFiles.has(f)) {
              currentFiles.add(f)
              needUpdate = true
            }
          }
          if (needUpdate) {
            existingSkill.files = [...currentFiles]
            existingSkill.updatedAt = new Date().toISOString()
            changed = true
          }
        }
      }
    } catch {}
  } catch {}
  return changed
}

function ensureChatSeqs(chats: Chat[]): boolean {
  let changed = false
  const byProject = new Map<string, Chat[]>()
  for (const c of chats) {
    if (!byProject.has(c.projectId)) byProject.set(c.projectId, [])
    byProject.get(c.projectId)!.push(c)
  }
  for (const [, list] of byProject) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    const used = new Set<number>()
    let next = 1
    for (const c of list) {
      const isValid = Number.isInteger(c.seq) && (c.seq as number) > 0
      const val = c.seq as number
      if (isValid && !used.has(val)) {
        used.add(val)
        if (val >= next) {
          next = val + 1
          while (used.has(next)) next++
        } else {
          while (used.has(next)) next++
        }
      } else {
        while (used.has(next)) next++
        c.seq = next
        used.add(next)
        changed = true
        next++
        while (used.has(next)) next++
      }
    }
  }
  return changed
}

export function nextChatSeq(projectId: string): number {
  const seqs = db.chats.filter((c) => c.projectId === projectId).map((c) => c.seq).filter((n): n is number => Number.isInteger(n) && (n as number) > 0)
  return seqs.length ? Math.max(...seqs) + 1 : 1
}

function persistToSqlite(): void {
  const s = ensureDb()
  // Sanitize orphaned skill.projectId left over from old delete-project bug (FK would reject otherwise)
  if (db.skills.length) {
    const validProjects = new Set(db.projects.map((p) => p.id))
    for (const sk of db.skills) {
      if (sk.projectId && !validProjects.has(sk.projectId)) {
        sk.projectId = undefined
      }
    }
  }
  if ((db.mcpServers ?? []).length) {
    const validProjects = new Set(db.projects.map((p) => p.id))
    for (const ms of db.mcpServers) {
      if (ms.projectId && !validProjects.has(ms.projectId)) {
        ms.projectId = undefined
      }
    }
  }
  if ((db.lspServers ?? []).length) {
    const validProjects = new Set(db.projects.map((p) => p.id))
    for (const ls of db.lspServers) {
      if (ls.projectId && !validProjects.has(ls.projectId)) {
        ls.projectId = undefined
      }
    }
  }
  if ((db.plugins ?? []).length) {
    const validProjects = new Set(db.projects.map((p) => p.id))
    for (const pl of db.plugins) {
      if (pl.projectId && !validProjects.has(pl.projectId)) {
        pl.projectId = undefined
      }
    }
  }
  // Embeddings are managed independently in SQLite (not via db JSON). Preserve them across bulk replace:
  // temporarily disable FK so DELETE FROM projects does not cascade-delete embeddings for projects that are immediately re-inserted.
  // Preserve GitHub kv keys across bulk replace (token + poll settings) — otherwise global token would be wiped
  let preservedGithubKv: { key: string; value: string }[] = []
  try {
    preservedGithubKv = s.prepare("SELECT key, value FROM kv WHERE key IN ('githubToken','githubPollSettings') OR key LIKE 'githubPollSettings:%' OR key LIKE 'github:%'").all() as any
  } catch {}
  // Also preserve github_cache? not needed (ephemeral)
  // Preserve sub-agents/teams/messages across bulk replace (they live in separate tables not covered by legacy db.json)
  let preservedSubAgents: any[] = []
  let preservedTeams: any[] = []
  let preservedTeamMembers: any[] = []
  let preservedSubAgentMessages: any[] = []
  try { preservedSubAgents = s.prepare('SELECT * FROM subAgents').all() as any[] } catch {}
  try { preservedTeams = s.prepare('SELECT * FROM teams').all() as any[] } catch {}
  try { preservedTeamMembers = s.prepare('SELECT * FROM teamMembers').all() as any[] } catch {}
  try { preservedSubAgentMessages = s.prepare('SELECT * FROM subAgentMessages').all() as any[] } catch {}
  try { s.pragma('foreign_keys = OFF') } catch {}
  const txn = s.transaction(() => {
    s.prepare('DELETE FROM subAgentMessages').run()
    s.prepare('DELETE FROM teamMembers').run()
    s.prepare('DELETE FROM teams').run()
    s.prepare('DELETE FROM subAgents').run()
    s.prepare('DELETE FROM activities').run()
    s.prepare('DELETE FROM previews').run()
    s.prepare('DELETE FROM questions').run()
    s.prepare('DELETE FROM plans').run()
    s.prepare('DELETE FROM messages').run()
    s.prepare('DELETE FROM terminals').run()
    s.prepare('DELETE FROM chats').run()
    s.prepare('DELETE FROM models').run()
    s.prepare('DELETE FROM providers').run()
    s.prepare('DELETE FROM skills').run()
    s.prepare('DELETE FROM mcpServers').run()
    s.prepare('DELETE FROM lspServers').run()
    s.prepare('DELETE FROM plugins').run()
    s.prepare('DELETE FROM projects').run()
    s.prepare('DELETE FROM kv').run()

    const insProject = s.prepare('INSERT INTO projects (id, name, path, createdAt) VALUES (?,?,?,?)')
    for (const p of db.projects) insProject.run(p.id, p.name, p.path, p.createdAt)

    const insChat = s.prepare('INSERT INTO chats (id, projectId, title, seq, createdAt, updatedAt) VALUES (?,?,?,?,?,?)')
    for (const c of db.chats) insChat.run(c.id, c.projectId, c.title, c.seq ?? null, c.createdAt, c.updatedAt)

    const insProvider = s.prepare('INSERT INTO providers (id, name, baseUrl, apiKey) VALUES (?,?,?,?)')
    for (const p of db.providers) insProvider.run(p.id, p.name, p.baseUrl, p.apiKey)

    const insModel = s.prepare('INSERT INTO models (id, providerId, model, displayName, maxTokens, systemPrompt) VALUES (?,?,?,?,?,?)')
    for (const m of db.models) insModel.run(m.id, m.providerId, m.model, m.displayName ?? null, m.maxTokens ?? null, m.systemPrompt ?? null)

    const insMessage = s.prepare('INSERT INTO messages (id, chatId, role, content, createdAt, error, model, modelDisplayName, providerName, startedAt, finishedAt, durationMs) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    for (const m of db.messages) insMessage.run(m.id, m.chatId, m.role, m.content, m.createdAt, m.error ? 1 : null, m.model ?? null, m.modelDisplayName ?? null, m.providerName ?? null, m.startedAt ?? null, m.finishedAt ?? null, m.durationMs ?? null)

    const insPlan = s.prepare('INSERT INTO plans (id, chatId, title, steps, createdAt, updatedAt) VALUES (?,?,?,?,?,?)')
    for (const p of db.plans) insPlan.run(p.id, p.chatId, p.title, JSON.stringify(p.steps), p.createdAt, p.updatedAt)

    const insTerminal = s.prepare('INSERT INTO terminals (id, projectId, name, createdAt, updatedAt) VALUES (?,?,?,?,?)')
    for (const t of db.terminals) insTerminal.run(t.id, t.projectId, t.name, t.createdAt, t.updatedAt)

    const insQuestion = s.prepare('INSERT INTO questions (id, chatId, header, question, options, allowCustom, customPlaceholder, status, answer, selectedOption, createdAt, answeredAt, toolCallId) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    for (const q of db.questions) insQuestion.run(q.id, q.chatId, q.header, q.question, JSON.stringify(q.options), q.allowCustom ? 1 : 0, q.customPlaceholder ?? null, q.status, q.answer ?? null, q.selectedOption ?? null, q.createdAt, q.answeredAt ?? null, q.toolCallId ?? null)

    const insActivity = s.prepare('INSERT INTO activities (id, chatId, toolType, toolCallId, args, summary, result, ok, timestamp, expanded) VALUES (?,?,?,?,?,?,?,?,?,?)')
    for (const a of db.activities) insActivity.run(a.id, a.chatId, a.toolType, a.toolCallId, JSON.stringify(a.args), a.summary, a.result ?? null, a.ok == null ? null : a.ok ? 1 : 0, a.timestamp, a.expanded ? 1 : null)

    const insSkill = s.prepare('INSERT INTO skills (id, name, note, mainFile, files, projectId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?)')
    for (const sk of db.skills) insSkill.run(sk.id, sk.name, sk.note, sk.mainFile, JSON.stringify(sk.files), sk.projectId ?? null, sk.createdAt, sk.updatedAt ?? null)

    const insMcp = s.prepare('INSERT INTO mcpServers (id, name, transport, command, args, url, env, headers, projectId, enabled, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    for (const m of db.mcpServers) insMcp.run(m.id, m.name, m.transport, m.command ?? null, m.args ? JSON.stringify(m.args) : null, m.url ?? null, m.env ? JSON.stringify(m.env) : null, m.headers ? JSON.stringify(m.headers) : null, m.projectId ?? null, m.enabled ? 1 : 0, m.createdAt, m.updatedAt)

    const insLsp = s.prepare('INSERT INTO lspServers (id, name, language, transport, command, args, url, env, headers, projectId, enabled, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
    for (const l of (db.lspServers ?? [])) insLsp.run(l.id, l.name, l.language, l.transport, l.command ?? null, l.args ? JSON.stringify(l.args) : null, l.url ?? null, l.env ? JSON.stringify(l.env) : null, l.headers ? JSON.stringify(l.headers) : null, l.projectId ?? null, l.enabled ? 1 : 0, l.createdAt, l.updatedAt)

    const insPlugin = s.prepare('INSERT INTO plugins (id, name, description, version, publisher, entryPoint, source, marketplaceId, enabled, projectId, tags, icon, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    for (const pl of (db.plugins ?? [])) insPlugin.run(pl.id, pl.name, pl.description, pl.version, pl.publisher ?? null, pl.entryPoint ?? null, pl.source, pl.marketplaceId ?? null, pl.enabled ? 1 : 0, pl.projectId ?? null, pl.tags ? JSON.stringify(pl.tags) : null, pl.icon ?? null, pl.createdAt, pl.updatedAt)

    const insPreview = s.prepare('INSERT INTO previews (id, chatId, port, createdAt, updatedAt) VALUES (?,?,?,?,?)')
    for (const p of db.previews) insPreview.run(p.id, p.chatId, p.port, p.createdAt, p.updatedAt)

    // sub-agents/teams: prefer in-memory db values if present, else restore preserved sqlite rows (covers restart after direct inserts)
    const subAgentsToPersist = (db.subAgents && db.subAgents.length) ? db.subAgents : preservedSubAgents.map((r: any) => ({ id: r.id, parentChatId: r.parentChatId, parentSubAgentId: r.parentSubAgentId ?? null, teamId: r.teamId ?? null, task: r.task, mode: r.mode, status: r.status, worktreePath: r.worktreePath ?? null, modelId: r.modelId ?? null, result: r.result ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt }))
    const teamsToPersist = (db.teams && db.teams.length) ? db.teams : preservedTeams.map((r: any) => ({ id: r.id, name: r.name, chatId: r.chatId, headId: r.headId ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt }))
    const teamMembersToPersist = (db.teamMembers && db.teamMembers.length) ? db.teamMembers : preservedTeamMembers.map((r: any) => ({ id: r.id, teamId: r.teamId, role: r.role, subAgentId: r.subAgentId ?? null, createdAt: r.createdAt }))
    const subMsgsToPersist = (db.subAgentMessages && db.subAgentMessages.length) ? db.subAgentMessages : preservedSubAgentMessages.map((r: any) => ({ id: r.id, subAgentId: r.subAgentId, parentChatId: r.parentChatId, role: r.role, content: r.content, createdAt: r.createdAt, toolCallId: r.toolCallId ?? null, toolName: r.toolName ?? null }))
    try {
      const insSub = s.prepare('INSERT INTO subAgents (id, parentChatId, parentSubAgentId, teamId, task, mode, status, worktreePath, modelId, result, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      for (const a of subAgentsToPersist) insSub.run(a.id, a.parentChatId, a.parentSubAgentId ?? null, a.teamId ?? null, a.task, a.mode, a.status, a.worktreePath ?? null, a.modelId ?? null, a.result ?? null, a.createdAt, a.updatedAt)
    } catch {}
    try {
      const insTeam = s.prepare('INSERT INTO teams (id, name, chatId, headId, createdAt, updatedAt) VALUES (?,?,?,?,?,?)')
      for (const t of teamsToPersist) insTeam.run(t.id, t.name, t.chatId, t.headId ?? null, t.createdAt, t.updatedAt)
    } catch {}
    try {
      const insMember = s.prepare('INSERT INTO teamMembers (id, teamId, role, subAgentId, createdAt) VALUES (?,?,?,?,?)')
      for (const m of teamMembersToPersist) insMember.run(m.id, m.teamId, m.role, m.subAgentId ?? null, m.createdAt)
    } catch {}
    try {
      const insSubMsg = s.prepare('INSERT INTO subAgentMessages (id, subAgentId, parentChatId, role, content, createdAt, toolCallId, toolName) VALUES (?,?,?,?,?,?,?,?)')
      for (const sm of subMsgsToPersist) insSubMsg.run(sm.id, sm.subAgentId, sm.parentChatId, sm.role, sm.content, sm.createdAt, sm.toolCallId ?? null, sm.toolName ?? null)
    } catch {}

    const insKv = s.prepare('INSERT INTO kv (key, value) VALUES (?,?)')
    insKv.run('systemPrompt', db.systemPrompt)
    insKv.run('planPrompt', db.planPrompt)
    insKv.run('retrySettings', JSON.stringify(db.retrySettings))
    insKv.run('themeSettings', JSON.stringify(db.themeSettings ?? DEFAULT_THEME))
    // restore preserved GitHub kv entries (token + poll settings) after bulk delete
    for (const kv of preservedGithubKv) {
      try { insKv.run(kv.key, kv.value) } catch {}
    }
    // also ensure github_tokens and github_poll_settings tables are not truncated — they are managed independently and preserved via FK OFF trick
  })
  try {
    txn()
  } catch (e) {
    console.error('persistToSqlite transaction failed:', e)
    throw e
  }
  // Validate FK integrity after bulk replace; should be clean
  try {
    const violations = s.prepare('PRAGMA foreign_key_check').all() as any[]
    if (violations.length) console.error('Foreign key violations after persistToSqlite:', violations)
    // Ensure FK remains ON for subsequent writes
    s.pragma('foreign_keys = ON')
  } catch {}
  // Clean orphaned embeddings for projects that were truly deleted (not re-inserted)
  try { s.prepare('DELETE FROM embeddings WHERE projectId NOT IN (SELECT id FROM projects)').run() } catch {}
  try { s.prepare('DELETE FROM embedding_chunks WHERE projectId NOT IN (SELECT id FROM projects)').run() } catch {}
  try { s.prepare('DELETE FROM vec_chunks WHERE projectId NOT IN (SELECT id FROM projects)').run() } catch {}
  try { s.prepare('DELETE FROM github_tokens WHERE projectId IS NOT NULL AND projectId NOT IN (SELECT id FROM projects)').run() } catch {}
  try { s.prepare('DELETE FROM github_poll_settings WHERE projectId NOT IN (SELECT id FROM projects)').run() } catch {}
}

function loadFromSqlite(s: Database.Database): DB | null {
  try {
    // Check if kv exists to know if db was ever initialized
    const kvCheck = s.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kv'").get() as any
    if (!kvCheck) return null

    const projects = s.prepare('SELECT id, name, path, createdAt FROM projects ORDER BY createdAt').all() as Project[]
    const chatsRows = s.prepare('SELECT id, projectId, title, seq, createdAt, updatedAt FROM chats ORDER BY createdAt').all() as any[]
    const chats: Chat[] = chatsRows.map((r) => ({ id: r.id, projectId: r.projectId, title: r.title, seq: r.seq != null ? Number(r.seq) : undefined, createdAt: r.createdAt, updatedAt: r.updatedAt }))

    const providers = s.prepare('SELECT id, name, baseUrl, apiKey FROM providers').all() as Provider[]

    const modelsRows = s.prepare('SELECT id, providerId, model, displayName, maxTokens, systemPrompt FROM models').all() as any[]
    const models: ModelEntry[] = modelsRows.map((r) => ({
      id: r.id,
      providerId: r.providerId,
      model: r.model,
      displayName: r.displayName ?? undefined,
      maxTokens: r.maxTokens != null ? Number(r.maxTokens) : undefined,
      systemPrompt: r.systemPrompt ?? undefined
    }))

    const messagesRows = s.prepare('SELECT id, chatId, role, content, createdAt, error, model, modelDisplayName, providerName, startedAt, finishedAt, durationMs FROM messages ORDER BY createdAt').all() as any[]
    const messages: Message[] = messagesRows.map((r) => ({
      id: r.id,
      chatId: r.chatId,
      role: r.role as Role,
      content: r.content,
      createdAt: r.createdAt,
      error: r.error ? true : undefined,
      model: r.model ?? undefined,
      modelDisplayName: r.modelDisplayName ?? undefined,
      providerName: r.providerName ?? undefined,
      startedAt: r.startedAt ?? undefined,
      finishedAt: r.finishedAt ?? undefined,
      durationMs: r.durationMs != null ? Number(r.durationMs) : undefined
    }))

    const plansRows = s.prepare('SELECT id, chatId, title, steps, createdAt, updatedAt FROM plans').all() as any[]
    const plans: Plan[] = []
    for (const r of plansRows) {
      try {
        plans.push({
          id: r.id,
          chatId: r.chatId,
          title: r.title,
          steps: JSON.parse(r.steps) as PlanStep[],
          createdAt: r.createdAt,
          updatedAt: r.updatedAt
        })
      } catch (e) { console.warn('Skipping corrupted plan row', r.id, e) }
    }

    const terminals = s.prepare('SELECT id, projectId, name, createdAt, updatedAt FROM terminals').all() as Terminal[]

    const questionsRows = s.prepare('SELECT id, chatId, header, question, options, allowCustom, customPlaceholder, status, answer, selectedOption, createdAt, answeredAt, toolCallId FROM questions').all() as any[]
    const questions: Question[] = []
    for (const r of questionsRows) {
      try {
        questions.push({
          id: r.id,
          chatId: r.chatId,
          header: r.header,
          question: r.question,
          options: JSON.parse(r.options) as string[],
          allowCustom: !!r.allowCustom,
          customPlaceholder: r.customPlaceholder ?? undefined,
          status: r.status as 'pending' | 'answered',
          answer: r.answer ?? undefined,
          selectedOption: r.selectedOption ?? null,
          createdAt: r.createdAt,
          answeredAt: r.answeredAt ?? undefined,
          toolCallId: r.toolCallId ?? undefined
        })
      } catch (e) { console.warn('Skipping corrupted question row', r.id, e) }
    }

    const activitiesRows = s.prepare('SELECT id, chatId, toolType, toolCallId, args, summary, result, ok, timestamp, expanded FROM activities ORDER BY timestamp').all() as any[]
    const activities: Activity[] = []
    for (const r of activitiesRows) {
      try {
        activities.push({
          id: r.id,
          chatId: r.chatId,
          toolType: r.toolType as ActivityToolType,
          toolCallId: r.toolCallId,
          args: JSON.parse(r.args) as Record<string, unknown>,
          summary: r.summary,
          result: r.result ?? undefined,
          ok: r.ok == null ? undefined : !!r.ok,
          timestamp: r.timestamp,
          expanded: r.expanded ? true : undefined
        })
      } catch (e) { console.warn('Skipping corrupted activity row', r.id, e) }
    }

    const skillsRows = s.prepare('SELECT id, name, note, mainFile, files, projectId, createdAt, updatedAt FROM skills').all() as any[]
    const skills: Skill[] = []
    for (const r of skillsRows) {
      try {
        let parsedFiles: string[] = []
        try {
          const v = r.files ? JSON.parse(r.files as string) : []
          if (Array.isArray(v)) parsedFiles = v.filter((x: any) => typeof x === 'string')
        } catch {}
        skills.push({
          id: r.id,
          name: r.name,
          note: r.note,
          mainFile: r.mainFile,
          files: parsedFiles,
          projectId: r.projectId ?? undefined,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt ?? undefined
        })
      } catch (e) { console.warn('Skipping corrupted skill row', r.id, e) }
    }

    let mcpServers: MCPServer[] = []
    try {
      const mcpRows = s.prepare('SELECT id, name, transport, command, args, url, env, headers, projectId, enabled, createdAt, updatedAt FROM mcpServers').all() as any[]
      for (const r of mcpRows) {
        try {
          mcpServers.push({
            id: r.id,
            name: r.name,
            transport: r.transport as MCPTransport,
            command: r.command ?? undefined,
            args: r.args ? JSON.parse(r.args) as string[] : undefined,
            url: r.url ?? undefined,
            env: r.env ? JSON.parse(r.env) as Record<string,string> : undefined,
            headers: r.headers ? JSON.parse(r.headers) as Record<string,string> : undefined,
            projectId: r.projectId ?? undefined,
            enabled: !!r.enabled,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
          })
        } catch (e) { console.warn('Skipping corrupted mcpServer row', r.id, e) }
      }
    } catch {}

    let lspServers: LSPServer[] = []
    try {
      const lspRows = s.prepare('SELECT id, name, language, transport, command, args, url, env, headers, projectId, enabled, createdAt, updatedAt FROM lspServers').all() as any[]
      for (const r of lspRows) {
        try {
          lspServers.push({
            id: r.id,
            name: r.name,
            language: r.language,
            transport: (r.transport as LSPTransport) ?? 'stdio',
            command: r.command ?? undefined,
            args: r.args ? JSON.parse(r.args) as string[] : undefined,
            url: r.url ?? undefined,
            env: r.env ? JSON.parse(r.env) as Record<string,string> : undefined,
            headers: r.headers ? JSON.parse(r.headers) as Record<string,string> : undefined,
            projectId: r.projectId ?? undefined,
            enabled: !!r.enabled,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
          })
        } catch (e) { console.warn('Skipping corrupted lspServer row', r.id, e) }
      }
    } catch {
      // fallback for old schema without transport/url/headers
      try {
        const lspRows = s.prepare('SELECT id, name, language, command, args, env, projectId, enabled, createdAt, updatedAt FROM lspServers').all() as any[]
        for (const r of lspRows) {
          try {
            lspServers.push({
              id: r.id,
              name: r.name,
              language: r.language,
              transport: 'stdio' as LSPTransport,
              command: r.command ?? undefined,
              args: r.args ? JSON.parse(r.args) as string[] : undefined,
              url: undefined,
              env: r.env ? JSON.parse(r.env) as Record<string,string> : undefined,
              headers: undefined,
              projectId: r.projectId ?? undefined,
              enabled: !!r.enabled,
              createdAt: r.createdAt,
              updatedAt: r.updatedAt
            })
          } catch (e2) { console.warn('Skipping corrupted legacy lspServer row', r.id, e2) }
        }
      } catch {}
    }

    const previews = s.prepare('SELECT id, chatId, port, createdAt, updatedAt FROM previews').all() as Preview[]

    let plugins: Plugin[] = []
    try {
      const pluginRows = s.prepare('SELECT id, name, description, version, publisher, entryPoint, source, marketplaceId, enabled, projectId, tags, icon, createdAt, updatedAt FROM plugins ORDER BY createdAt DESC').all() as any[]
      for (const r of pluginRows) {
        try {
          plugins.push({
            id: r.id,
            name: r.name,
            description: r.description,
            version: r.version,
            publisher: r.publisher ?? undefined,
            entryPoint: r.entryPoint ?? undefined,
            source: (r.source as PluginSource) ?? 'manual',
            marketplaceId: r.marketplaceId ?? undefined,
            enabled: !!r.enabled,
            projectId: r.projectId ?? undefined,
            tags: r.tags ? (JSON.parse(r.tags) as string[]) : undefined,
            icon: r.icon ?? undefined,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt
          })
        } catch (e) { console.warn('Skipping corrupted plugin row', r.id, e) }
      }
    } catch {}

    const kvRows = s.prepare('SELECT key, value FROM kv').all() as any[]
    const kv = new Map(kvRows.map((r) => [r.key, r.value]))
    const systemPrompt = typeof kv.get('systemPrompt') === 'string' ? kv.get('systemPrompt') as string : ''
    const planPrompt = typeof kv.get('planPrompt') === 'string' ? kv.get('planPrompt') as string : ''
    let retrySettings: RetrySettings
    try {
      const parsed = kv.get('retrySettings') ? JSON.parse(kv.get('retrySettings') as string) : null
      const def: RetrySettings = { enabled: true, maxRetries: 5, baseDelayMs: 1200, maxDelayMs: 30000, retryOnStatusCodes: [429, 500, 502, 503], stopOnStatusCodes: [400, 401, 403, 404], alwaysRetry: false, autoContinueEnabled: false, autoContinueDelayMs: 1500, autoContinueMaxAttempts: 5, autoContinueOnPlanIncomplete: true }
      if (parsed && typeof parsed === 'object') {
        retrySettings = {
          enabled: Boolean(parsed.enabled ?? def.enabled),
          maxRetries: Number(parsed.maxRetries ?? def.maxRetries),
          baseDelayMs: Number(parsed.baseDelayMs ?? def.baseDelayMs),
          maxDelayMs: Number(parsed.maxDelayMs ?? def.maxDelayMs),
          retryOnStatusCodes: Array.isArray(parsed.retryOnStatusCodes) ? parsed.retryOnStatusCodes.filter((x: any) => Number.isInteger(x)) : def.retryOnStatusCodes,
          stopOnStatusCodes: Array.isArray(parsed.stopOnStatusCodes) ? parsed.stopOnStatusCodes.filter((x: any) => Number.isInteger(x)) : def.stopOnStatusCodes,
          alwaysRetry: Boolean(parsed.alwaysRetry ?? def.alwaysRetry),
          autoContinueEnabled: Boolean(parsed.autoContinueEnabled ?? def.autoContinueEnabled),
          autoContinueDelayMs: Number(parsed.autoContinueDelayMs ?? def.autoContinueDelayMs),
          autoContinueMaxAttempts: Number(parsed.autoContinueMaxAttempts ?? def.autoContinueMaxAttempts),
          autoContinueOnPlanIncomplete: Boolean(parsed.autoContinueOnPlanIncomplete ?? def.autoContinueOnPlanIncomplete)
        }
      } else retrySettings = def
    } catch {
      retrySettings = { enabled: true, maxRetries: 5, baseDelayMs: 1200, maxDelayMs: 30000, retryOnStatusCodes: [429, 500, 502, 503], stopOnStatusCodes: [400, 401, 403, 404], alwaysRetry: false, autoContinueEnabled: false, autoContinueDelayMs: 1500, autoContinueMaxAttempts: 5, autoContinueOnPlanIncomplete: true }
    }
    let themeSettings: ThemeSettings
    try {
      const parsed = kv.get('themeSettings') ? JSON.parse(kv.get('themeSettings') as string) : null
      if (parsed && typeof parsed === 'object' && typeof parsed.primary === 'string') {
        themeSettings = {
          primary: /^#[0-9a-fA-F]{6}$/.test(parsed.primary) ? parsed.primary : DEFAULT_THEME.primary,
          danger: typeof parsed.danger === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.danger) ? parsed.danger : DEFAULT_THEME.danger,
          background: typeof parsed.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.background) ? parsed.background : DEFAULT_THEME.background,
          radius: Number.isFinite(parsed.radius) ? Math.max(6, Math.min(16, Number(parsed.radius))) : DEFAULT_THEME.radius
        }
      } else themeSettings = { ...DEFAULT_THEME }
    } catch {
      themeSettings = { ...DEFAULT_THEME }
    }

    // Load sub-agents/teams/messages for persistence
    let subAgents: SubAgent[] = []
    try {
      const rows = s.prepare('SELECT id, parentChatId, parentSubAgentId, teamId, task, mode, status, worktreePath, modelId, result, createdAt, updatedAt FROM subAgents ORDER BY createdAt').all() as any[]
      subAgents = rows.map((r: any) => ({ id: r.id, parentChatId: r.parentChatId, parentSubAgentId: r.parentSubAgentId ?? null, teamId: r.teamId ?? null, task: r.task, mode: r.mode as SubAgentMode, status: r.status as SubAgentStatus, worktreePath: r.worktreePath ?? null, modelId: r.modelId ?? null, result: r.result ?? null, createdAt: r.createdAt, updatedAt: r.updatedAt }))
    } catch {}
    let teams: Team[] = []
    try {
      const rows = s.prepare('SELECT id, name, chatId, headId, createdAt, updatedAt FROM teams ORDER BY createdAt').all() as any[]
      teams = rows as Team[]
    } catch {}
    let teamMembers: TeamMember[] = []
    try {
      const rows = s.prepare('SELECT id, teamId, role, subAgentId, createdAt FROM teamMembers ORDER BY createdAt').all() as any[]
      teamMembers = rows as TeamMember[]
    } catch {}
    let subAgentMessages: SubAgentMessage[] = []
    try {
      const rows = s.prepare('SELECT id, subAgentId, parentChatId, role, content, createdAt, toolCallId, toolName FROM subAgentMessages ORDER BY createdAt').all() as any[]
      subAgentMessages = rows as SubAgentMessage[]
    } catch {}

    return { projects, chats, messages, providers, models, systemPrompt, planPrompt, plans, terminals, questions, activities, retrySettings, themeSettings, skills, previews, mcpServers, lspServers, plugins, subAgents, teams, teamMembers, subAgentMessages }
  } catch (e) {
    console.error('Failed to load from sqlite:', e)
    return null
  }
}

function tryMigrateFromJson(): boolean {
  if (!fs.existsSync(legacyDbFile)) return false
  try {
    const s = ensureDb()
    // Only migrate if sqlite is empty
    const hasData = (() => {
      try {
        const c = (s.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c
        if (c > 0) return true
        const c2 = (s.prepare('SELECT COUNT(*) as c FROM chats').get() as any).c
        if (c2 > 0) return true
        const c3 = (s.prepare('SELECT COUNT(*) as c FROM kv').get() as any).c
        if (c3 > 0) return true
        return false
      } catch { return false }
    })()
    if (hasData) return false

    const raw = fs.readFileSync(legacyDbFile, 'utf8')
    const parsed = JSON.parse(raw)
    const defaultRetrySettings: RetrySettings = {
      enabled: true,
      maxRetries: 5,
      baseDelayMs: 1200,
      maxDelayMs: 30000,
      retryOnStatusCodes: [429, 500, 502, 503],
      stopOnStatusCodes: [400, 401, 403, 404],
      alwaysRetry: false,
      autoContinueEnabled: false,
      autoContinueDelayMs: 1500,
      autoContinueMaxAttempts: 5,
      autoContinueOnPlanIncomplete: true
    }
    db = {
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      chats: Array.isArray(parsed.chats) ? parsed.chats : [],
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      providers: Array.isArray(parsed.providers) ? parsed.providers : [],
      models: Array.isArray(parsed.models) ? parsed.models : [],
      systemPrompt: typeof parsed.systemPrompt === 'string' ? parsed.systemPrompt : '',
      planPrompt: typeof parsed.planPrompt === 'string' ? parsed.planPrompt : '',
      plans: Array.isArray(parsed.plans) ? parsed.plans : [],
      terminals: Array.isArray(parsed.terminals) ? parsed.terminals : [],
      questions: Array.isArray(parsed.questions) ? parsed.questions : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      retrySettings: parsed.retrySettings && typeof parsed.retrySettings === 'object'
        ? {
            enabled: Boolean(parsed.retrySettings.enabled ?? defaultRetrySettings.enabled),
            maxRetries: Number(parsed.retrySettings.maxRetries ?? defaultRetrySettings.maxRetries),
            baseDelayMs: Number(parsed.retrySettings.baseDelayMs ?? defaultRetrySettings.baseDelayMs),
            maxDelayMs: Number(parsed.retrySettings.maxDelayMs ?? defaultRetrySettings.maxDelayMs),
            retryOnStatusCodes: Array.isArray(parsed.retrySettings.retryOnStatusCodes)
              ? parsed.retrySettings.retryOnStatusCodes.filter((x: any) => Number.isInteger(x))
              : defaultRetrySettings.retryOnStatusCodes,
            stopOnStatusCodes: Array.isArray(parsed.retrySettings.stopOnStatusCodes)
              ? parsed.retrySettings.stopOnStatusCodes.filter((x: any) => Number.isInteger(x))
              : defaultRetrySettings.stopOnStatusCodes,
            alwaysRetry: Boolean(parsed.retrySettings.alwaysRetry ?? defaultRetrySettings.alwaysRetry),
            autoContinueEnabled: Boolean(parsed.retrySettings.autoContinueEnabled ?? defaultRetrySettings.autoContinueEnabled),
            autoContinueDelayMs: Number(parsed.retrySettings.autoContinueDelayMs ?? defaultRetrySettings.autoContinueDelayMs),
            autoContinueMaxAttempts: Number(parsed.retrySettings.autoContinueMaxAttempts ?? defaultRetrySettings.autoContinueMaxAttempts),
            autoContinueOnPlanIncomplete: Boolean(parsed.retrySettings.autoContinueOnPlanIncomplete ?? defaultRetrySettings.autoContinueOnPlanIncomplete)
          }
        : defaultRetrySettings,
      themeSettings: parsed.themeSettings && typeof parsed.themeSettings === 'object' && typeof parsed.themeSettings.primary === 'string'
        ? {
            primary: /^#[0-9a-fA-F]{6}$/.test(parsed.themeSettings.primary) ? parsed.themeSettings.primary : DEFAULT_THEME.primary,
            danger: typeof parsed.themeSettings.danger === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.themeSettings.danger) ? parsed.themeSettings.danger : DEFAULT_THEME.danger,
            background: typeof parsed.themeSettings.background === 'string' && /^#[0-9a-fA-F]{6}$/.test(parsed.themeSettings.background) ? parsed.themeSettings.background : DEFAULT_THEME.background,
            radius: Number.isFinite(parsed.themeSettings.radius) ? Math.max(6, Math.min(16, Number(parsed.themeSettings.radius))) : DEFAULT_THEME.radius
          }
        : { ...DEFAULT_THEME },
      skills: Array.isArray(parsed.skills) ? parsed.skills.filter((s: any) => s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.mainFile === 'string' && s.mainFile.trim().endsWith('.md')).map((s: any) => ({
        id: String(s.id),
        name: String(s.name).trim(),
        note: typeof s.note === 'string' ? String(s.note).trim() : '',
        mainFile: String(s.mainFile).trim(),
        files: Array.isArray(s.files) ? [...new Set(s.files.map((f: any) => String(f).trim()).filter(Boolean))] : [],
        projectId: typeof s.projectId === 'string' && s.projectId.trim() ? String(s.projectId).trim() : undefined,
        createdAt: typeof s.createdAt === 'string' ? s.createdAt : new Date().toISOString(),
        updatedAt: typeof s.updatedAt === 'string' ? s.updatedAt : undefined
      })) : [],
      previews: Array.isArray(parsed.previews) ? parsed.previews.filter((p: any) => p && typeof p.id === 'string' && typeof p.chatId === 'string' && Number.isInteger(p.port)) : [],
      mcpServers: Array.isArray(parsed.mcpServers) ? parsed.mcpServers.filter((m: any) => m && typeof m.id === 'string' && typeof m.name === 'string' && typeof m.transport === 'string').map((m: any) => ({
        id: String(m.id),
        name: String(m.name).trim(),
        transport: ['stdio','sse','http','websocket'].includes(String(m.transport)) ? String(m.transport) as MCPTransport : 'stdio',
        command: typeof m.command === 'string' && m.command.trim() ? String(m.command).trim() : undefined,
        args: Array.isArray(m.args) ? m.args.map((a: any) => String(a)).filter(Boolean) : undefined,
        url: typeof m.url === 'string' && m.url.trim() ? String(m.url).trim() : undefined,
        env: m.env && typeof m.env === 'object' && !Array.isArray(m.env) ? Object.fromEntries(Object.entries(m.env).map(([k,v]: any) => [String(k), String(v)])) as Record<string,string> : undefined,
        headers: m.headers && typeof m.headers === 'object' && !Array.isArray(m.headers) ? Object.fromEntries(Object.entries(m.headers).map(([k,v]: any) => [String(k), String(v)])) as Record<string,string> : undefined,
        projectId: typeof m.projectId === 'string' && m.projectId.trim() ? String(m.projectId).trim() : undefined,
        enabled: m.enabled !== false,
        createdAt: typeof m.createdAt === 'string' ? m.createdAt : new Date().toISOString(),
        updatedAt: typeof m.updatedAt === 'string' ? m.updatedAt : new Date().toISOString()
      })) : [],
      lspServers: Array.isArray((parsed as any).lspServers) ? (parsed as any).lspServers.filter((l: any) => l && typeof l.id === 'string' && typeof l.name === 'string' && typeof l.language === 'string').map((l: any) => ({
        id: String(l.id),
        name: String(l.name).trim(),
        language: String(l.language).trim().toLowerCase(),
        transport: ['stdio','tcp','socket','websocket','http','sse'].includes(String(l.transport)) ? String(l.transport) as LSPTransport : 'stdio',
        command: typeof l.command === 'string' && l.command.trim() ? String(l.command).trim() : undefined,
        args: Array.isArray(l.args) ? l.args.map((a: any) => String(a)).filter(Boolean) : undefined,
        url: typeof l.url === 'string' && l.url.trim() ? String(l.url).trim() : undefined,
        env: l.env && typeof l.env === 'object' && !Array.isArray(l.env) ? Object.fromEntries(Object.entries(l.env).map(([k,v]: any) => [String(k), String(v)])) as Record<string,string> : undefined,
        headers: l.headers && typeof l.headers === 'object' && !Array.isArray(l.headers) ? Object.fromEntries(Object.entries(l.headers).map(([k,v]: any) => [String(k), String(v)])) as Record<string,string> : undefined,
        projectId: typeof l.projectId === 'string' && l.projectId.trim() ? String(l.projectId).trim() : undefined,
        enabled: l.enabled !== false,
        createdAt: typeof l.createdAt === 'string' ? l.createdAt : new Date().toISOString(),
        updatedAt: typeof l.updatedAt === 'string' ? l.updatedAt : new Date().toISOString()
      })) : [],
      plugins: Array.isArray((parsed as any).plugins) ? (parsed as any).plugins.filter((p: any) => p && typeof p.id === 'string' && typeof p.name === 'string').map((p: any) => ({
        id: String(p.id),
        name: String(p.name).trim(),
        description: typeof p.description === 'string' ? String(p.description).trim() : '',
        version: typeof p.version === 'string' ? String(p.version).trim() : '1.0.0',
        publisher: typeof p.publisher === 'string' && p.publisher.trim() ? String(p.publisher).trim() : undefined,
        entryPoint: typeof p.entryPoint === 'string' && p.entryPoint.trim() ? String(p.entryPoint).trim() : undefined,
        source: ['manual','marketplace','local','url'].includes(String(p.source)) ? String(p.source) as PluginSource : 'manual',
        marketplaceId: typeof p.marketplaceId === 'string' && p.marketplaceId.trim() ? String(p.marketplaceId).trim() : undefined,
        enabled: p.enabled !== false,
        projectId: typeof p.projectId === 'string' && p.projectId.trim() ? String(p.projectId).trim() : undefined,
        tags: Array.isArray(p.tags) ? p.tags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 8) : undefined,
        icon: typeof p.icon === 'string' && p.icon.trim() ? String(p.icon).trim().slice(0, 4) : undefined,
        createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date().toISOString(),
        updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString()
      })) : [],
      subAgents: Array.isArray((parsed as any).subAgents) ? (parsed as any).subAgents : [],
      teams: Array.isArray((parsed as any).teams) ? (parsed as any).teams : [],
      teamMembers: Array.isArray((parsed as any).teamMembers) ? (parsed as any).teamMembers : [],
      subAgentMessages: Array.isArray((parsed as any).subAgentMessages) ? (parsed as any).subAgentMessages : []
    }
    // Migrate old skills missing updatedAt / projectId
    let migrated = false
    for (const s of db.skills) {
      if (!s.updatedAt) { s.updatedAt = s.createdAt; migrated = true }
      if (Array.isArray(s.files)) {
        const deduped = [...new Set(s.files.map((f: any) => String(f).trim()).filter(Boolean))]
        if (deduped.length !== s.files.length) { s.files = deduped; migrated = true }
      }
    }
    if (!db.retrySettings.retryOnStatusCodes.includes(500)) {
      db.retrySettings.retryOnStatusCodes = [...new Set([...db.retrySettings.retryOnStatusCodes, 500])].sort((a, b) => a - b)
      migrated = true
    }
    if (seedDefaultSkills()) migrated = true
    if (ensureChatSeqs(db.chats) || migrated) {
      // will be persisted below
    }
    persistToSqlite()
    // Keep legacy file as backup, rename to .bak if we want
    try {
      const bak = legacyDbFile + '.bak'
      if (!fs.existsSync(bak)) fs.copyFileSync(legacyDbFile, bak)
    } catch {}
    console.log(`Migrated legacy ${legacyDbFile} -> ${dbFile}`)
    return true
  } catch (e) {
    console.error('Migration from JSON failed:', e)
    return false
  }
}

function tryMigrateFromLegacySqlite(): boolean {
  const legacySqliteFile = path.join(legacyDataDir, 'ksagent.db')
  if (path.resolve(legacySqliteFile) === path.resolve(dbFile)) return false
  if (!fs.existsSync(legacySqliteFile)) return false
  let attached = false
  try {
    const s = ensureDb()
    const hasData = (() => {
      try {
        const c = (s.prepare('SELECT COUNT(*) as c FROM projects').get() as any).c
        if (c > 0) return true
        const c2 = (s.prepare('SELECT COUNT(*) as c FROM chats').get() as any).c
        if (c2 > 0) return true
        const c3 = (s.prepare('SELECT COUNT(*) as c FROM kv').get() as any).c
        if (c3 > 0) return true
        return false
      } catch { return false }
    })()
    if (hasData) return false
    const safePath = legacySqliteFile.replace(/'/g, "''")
    s.exec(`ATTACH DATABASE '${safePath}' AS legacy`)
    attached = true
    // Verify legacy has expected tables
    const legacyHasKv = (() => {
      try { const r = (s.prepare("SELECT name FROM legacy.sqlite_master WHERE type='table' AND name='kv'").get() as any); return !!r } catch { return false }
    })()
    if (!legacyHasKv) { s.exec('DETACH DATABASE legacy'); attached = false; return false }
    // Copy all tables if not already present (INSERT OR IGNORE keeps existing empty dest untouched)
    // Use explicit column lists to stay robust against schema drift
    s.exec(`
      INSERT OR IGNORE INTO main.projects SELECT * FROM legacy.projects;
      INSERT OR IGNORE INTO main.chats SELECT * FROM legacy.chats;
      INSERT OR IGNORE INTO main.providers SELECT * FROM legacy.providers;
      INSERT OR IGNORE INTO main.models SELECT * FROM legacy.models;
      INSERT OR IGNORE INTO main.messages SELECT * FROM legacy.messages;
      INSERT OR IGNORE INTO main.plans SELECT * FROM legacy.plans;
      INSERT OR IGNORE INTO main.terminals SELECT * FROM legacy.terminals;
      INSERT OR IGNORE INTO main.questions SELECT * FROM legacy.questions;
      INSERT OR IGNORE INTO main.activities SELECT * FROM legacy.activities;
      INSERT OR IGNORE INTO main.skills SELECT * FROM legacy.skills;
      INSERT OR IGNORE INTO main.previews SELECT * FROM legacy.previews;
      INSERT OR IGNORE INTO main.kv SELECT * FROM legacy.kv;
    `)
    // LSP servers added in v0.2 — legacy DBs won't have this table; try separately
    try {
      s.exec(`INSERT OR IGNORE INTO main.lspServers SELECT * FROM legacy.lspServers`)
    } catch {}
    try {
      s.exec(`INSERT OR IGNORE INTO main.mcpServers SELECT * FROM legacy.mcpServers`)
    } catch {}
    try {
      s.exec(`INSERT OR IGNORE INTO main.plugins SELECT * FROM legacy.plugins`)
    } catch {}
    s.exec('DETACH DATABASE legacy')
    attached = false
    const loaded = loadFromSqlite(s)
    if (loaded) db = loaded
    console.log(`Migrated legacy sqlite ${legacySqliteFile} -> ${dbFile}`)
    return true
  } catch (e) {
    console.error('Migration from legacy sqlite failed:', e)
    if (attached) { try { ensureDb().exec('DETACH DATABASE legacy') } catch {} }
    return false
  }
}

export function loadDb(): void {
  try {
    const s = ensureDb()
    // Attempt migration from legacy sqlite file (data/ksagent.db) before JSON so we preserve richer data if both exist
    tryMigrateFromLegacySqlite()
    // Attempt migration from legacy JSON (data/db.json) if sqlite still empty
    tryMigrateFromJson()

    const loaded = loadFromSqlite(s)
    if (loaded) {
      db = loaded
      // Migrate old skills missing updatedAt / projectId
      let migrated = false
      if (!db.themeSettings || typeof db.themeSettings.primary !== 'string') {
        db.themeSettings = { ...DEFAULT_THEME }
        migrated = true
      }
      for (const sk of db.skills) {
        if (!sk.updatedAt) { sk.updatedAt = sk.createdAt; migrated = true }
        if (Array.isArray(sk.files)) {
          const deduped = [...new Set(sk.files.map((f: any) => String(f).trim()).filter(Boolean))]
          if (deduped.length !== sk.files.length) { (sk as any).files = deduped; migrated = true }
        }
      }
      if (!db.retrySettings.retryOnStatusCodes.includes(500)) {
        db.retrySettings.retryOnStatusCodes = [...new Set([...db.retrySettings.retryOnStatusCodes, 500])].sort((a, b) => a - b)
        migrated = true
      }
      // migrate new auto-continue fields (existing DBs before this feature)
      if (db.retrySettings.autoContinueEnabled === undefined) { db.retrySettings.autoContinueEnabled = false; migrated = true }
      if (db.retrySettings.autoContinueDelayMs === undefined) { db.retrySettings.autoContinueDelayMs = 1500; migrated = true }
      if (db.retrySettings.autoContinueMaxAttempts === undefined) { db.retrySettings.autoContinueMaxAttempts = 5; migrated = true }
      if (db.retrySettings.autoContinueOnPlanIncomplete === undefined) { db.retrySettings.autoContinueOnPlanIncomplete = true; migrated = true }
      if (seedDefaultSkills()) migrated = true
      if (ensureChatSeqs(db.chats) || migrated) {
        try { persistToSqlite() } catch {}
      }
      return
    }
    // No data in sqlite and no legacy: initialize fresh
    const defaultRetrySettings: RetrySettings = {
      enabled: true,
      maxRetries: 5,
      baseDelayMs: 1200,
      maxDelayMs: 30000,
      retryOnStatusCodes: [429, 500, 502, 503],
      stopOnStatusCodes: [400, 401, 403, 404],
      alwaysRetry: false,
      autoContinueEnabled: false,
      autoContinueDelayMs: 1500,
      autoContinueMaxAttempts: 5,
      autoContinueOnPlanIncomplete: true
    }
    db = { projects: [], chats: [], messages: [], providers: [], models: [], systemPrompt: '', planPrompt: '', plans: [], terminals: [], questions: [], activities: [], retrySettings: defaultRetrySettings, themeSettings: { ...DEFAULT_THEME }, skills: [], previews: [], mcpServers: [], lspServers: [], plugins: [], subAgents: [], teams: [], teamMembers: [], subAgentMessages: [] }
    if (seedDefaultSkills()) {
      try { persistToSqlite() } catch {}
    } else {
      // ensure kv is persisted even if empty
      try { persistToSqlite() } catch {}
    }
  } catch (e) {
    console.error('loadDb failed:', e)
    const defaultRetrySettings: RetrySettings = {
      enabled: true,
      maxRetries: 5,
      baseDelayMs: 1200,
      maxDelayMs: 30000,
      retryOnStatusCodes: [429, 500, 502, 503],
      stopOnStatusCodes: [400, 401, 403, 404],
      alwaysRetry: false,
      autoContinueEnabled: false,
      autoContinueDelayMs: 1500,
      autoContinueMaxAttempts: 5,
      autoContinueOnPlanIncomplete: true
    }
    db = { projects: [], chats: [], messages: [], providers: [], models: [], systemPrompt: '', planPrompt: '', plans: [], terminals: [], questions: [], activities: [], retrySettings: defaultRetrySettings, themeSettings: { ...DEFAULT_THEME }, skills: [], previews: [], mcpServers: [], lspServers: [], plugins: [], subAgents: [], teams: [], teamMembers: [], subAgentMessages: [] }
    if (seedDefaultSkills()) {
      try { persistToSqlite() } catch {}
    }
  }
}

let saveLock = false
let pendingSave = false
export function saveDb(): void {
  if (saveLock) {
    pendingSave = true
    return
  }
  saveLock = true
  try {
    // Ensure directory exists
    fs.mkdirSync(path.dirname(dbFile), { recursive: true })
    persistToSqlite()
    // Harden perms on every save (secrets at rest)
    try { fs.chmodSync(dbFile, 0o600) } catch {}
    try { fs.chmodSync(dbFile + '-wal', 0o600) } catch {}
    try { fs.chmodSync(dbFile + '-shm', 0o600) } catch {}
  } catch (e) {
    console.error('saveDb failed:', e)
  } finally {
    saveLock = false
    if (pendingSave) {
      pendingSave = false
      // Coalesce pending saves into one
      setImmediate(() => saveDb())
    }
  }
}

export function getDb(): DB {
  return db
}

export function newId(): string {
  return randomUUID()
}

export function findProject(id: string): Project | undefined {
  return db.projects.find((p) => p.id === id)
}

export function findChat(id: string): Chat | undefined {
  return db.chats.find((c) => c.id === id)
}

export function chatsOf(projectId: string): Chat[] {
  return db.chats
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function messagesOf(chatId: string): Message[] {
  return db.messages.filter((m) => m.chatId === chatId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function touchChat(chat: Chat): void {
  chat.updatedAt = new Date().toISOString()
}

/** Latest plan for a chat (create_plan replaces older ones, so at most one remains). */
export function findPlanForChat(chatId: string): Plan | undefined {
  return [...db.plans]
    .filter((p) => p.chatId === chatId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

export function getRetrySettings(): RetrySettings {
  return db.retrySettings
}

export function updateRetrySettings(partial: Partial<RetrySettings>): RetrySettings {
  db.retrySettings = { ...db.retrySettings, ...partial }
  saveDb()
  return db.retrySettings
}

export function getThemeSettings(): ThemeSettings {
  if (!db.themeSettings) db.themeSettings = { ...DEFAULT_THEME }
  return db.themeSettings
}

export function updateThemeSettings(partial: Partial<ThemeSettings>): ThemeSettings {
  const cur = db.themeSettings ?? { ...DEFAULT_THEME }
  const next: ThemeSettings = { ...cur }
  if (partial.primary !== undefined) {
    const v = String(partial.primary).trim()
    if (/^#[0-9a-fA-F]{6}$/.test(v)) next.primary = v.toLowerCase()
  }
  if (partial.danger !== undefined) {
    const v = String(partial.danger).trim()
    if (/^#[0-9a-fA-F]{6}$/.test(v)) next.danger = v.toLowerCase()
  }
  if (partial.background !== undefined) {
    const v = String(partial.background).trim()
    if (/^#[0-9a-fA-F]{6}$/.test(v)) next.background = v.toLowerCase()
  }
  if (partial.radius !== undefined) {
    const n = Number(partial.radius)
    if (Number.isFinite(n)) next.radius = Math.max(6, Math.min(16, Math.round(n)))
  }
  db.themeSettings = next
  saveDb()
  return db.themeSettings
}

export function terminalsOf(projectId: string): Terminal[] {
  return db.terminals
    .filter((t) => t.projectId === projectId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function findTerminal(id: string): Terminal | undefined {
  return db.terminals.find((t) => t.id === id)
}

export function questionsOf(chatId: string): Question[] {
  return db.questions.filter((q) => q.chatId === chatId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function findQuestion(id: string): Question | undefined {
  return db.questions.find((q) => q.id === id)
}

export function pendingQuestionsOf(chatId: string): Question[] {
  return questionsOf(chatId).filter((q) => q.status === 'pending')
}

export function activitiesOf(chatId: string): Activity[] {
  return db.activities.filter((a) => a.chatId === chatId).sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

export function findActivityByToolCallId(toolCallId: string): Activity | undefined {
  return db.activities.find((a) => a.toolCallId === toolCallId)
}

export function clearActivitiesForChat(chatId: string): void {
  const before = db.activities.length
  db.activities = db.activities.filter((a) => a.chatId !== chatId)
  if (db.activities.length !== before) saveDb()
}

export function getSkills(): Skill[] {
  return [...db.skills].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function findSkill(id: string): Skill | undefined {
  return db.skills.find((s) => s.id === id)
}

export function findPreviewForChat(chatId: string): Preview | undefined {
  return [...db.previews]
    .filter((p) => p.chatId === chatId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
}

export function previewsOfChat(chatId: string): Preview[] {
  return db.previews.filter((p) => p.chatId === chatId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function getMcpServers(): MCPServer[] {
  return [...db.mcpServers].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function findMcpServer(id: string): MCPServer | undefined {
  return db.mcpServers.find((s) => s.id === id)
}

export function getLspServers(): LSPServer[] {
  return [...db.lspServers].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function findLspServer(id: string): LSPServer | undefined {
  return db.lspServers.find((s) => s.id === id)
}

export function getPlugins(): Plugin[] {
  return [...(db.plugins ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function findPlugin(id: string): Plugin | undefined {
  return (db.plugins ?? []).find((p) => p.id === id)
}
