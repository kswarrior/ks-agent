import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
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

export interface Preview {
  id: string
  chatId: string
  port: number
  createdAt: string
  updatedAt: string
}

export type ActivityToolType = 'read_file' | 'write_file' | 'edit_file' | 'run_shell' | 'list_files' | 'create_plan' | 'complete_plan_step' | 'ask_question' | 'open_preview'

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
  skills: Skill[]
  previews: Preview[]
  mcpServers: MCPServer[]
}

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

let db: DB = { projects: [], chats: [], messages: [], providers: [], models: [], systemPrompt: '', planPrompt: '', plans: [], terminals: [], questions: [], activities: [], retrySettings: { enabled: true, maxRetries: 5, baseDelayMs: 1200, maxDelayMs: 30000, retryOnStatusCodes: [429, 500, 502, 503], stopOnStatusCodes: [400, 401, 403, 404], alwaysRetry: false }, skills: [], previews: [], mcpServers: [] }

let sqlite: Database.Database | null = null

function ensureDb(): Database.Database {
  if (sqlite) return sqlite
  fs.mkdirSync(path.dirname(dbFile), { recursive: true })
  sqlite = new Database(dbFile)
  // WAL for concurrency, foreign_keys for integrity, busy timeout to avoid SQLITE_BUSY on concurrent access
  try { sqlite.pragma('journal_mode = WAL') } catch {}
  try { sqlite.pragma('busy_timeout = 5000') } catch {}
  try { sqlite.pragma('synchronous = NORMAL') } catch {}
  try { sqlite.pragma('wal_autocheckpoint = 1000') } catch {}
  try { sqlite.pragma('foreign_keys = ON') } catch {}
  initSchema(sqlite)
  // Re-ensure FK enabled after init (initSchema may have been run on existing DB)
  try { sqlite.pragma('foreign_keys = ON') } catch {}
  return sqlite
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_activities_toolCallId ON activities(toolCallId);
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
    CREATE TABLE IF NOT EXISTS kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)
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
  // Keep FK ON throughout: deletes are children-first, inserts are parents-first (both satisfy FK)
  try { s.pragma('foreign_keys = ON') } catch {}
  const txn = s.transaction(() => {
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

    const insPreview = s.prepare('INSERT INTO previews (id, chatId, port, createdAt, updatedAt) VALUES (?,?,?,?,?)')
    for (const p of db.previews) insPreview.run(p.id, p.chatId, p.port, p.createdAt, p.updatedAt)

    const insKv = s.prepare('INSERT INTO kv (key, value) VALUES (?,?)')
    insKv.run('systemPrompt', db.systemPrompt)
    insKv.run('planPrompt', db.planPrompt)
    insKv.run('retrySettings', JSON.stringify(db.retrySettings))
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
    const plans: Plan[] = plansRows.map((r) => ({
      id: r.id,
      chatId: r.chatId,
      title: r.title,
      steps: JSON.parse(r.steps) as PlanStep[],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt
    }))

    const terminals = s.prepare('SELECT id, projectId, name, createdAt, updatedAt FROM terminals').all() as Terminal[]

    const questionsRows = s.prepare('SELECT id, chatId, header, question, options, allowCustom, customPlaceholder, status, answer, selectedOption, createdAt, answeredAt, toolCallId FROM questions').all() as any[]
    const questions: Question[] = questionsRows.map((r) => ({
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
    }))

    const activitiesRows = s.prepare('SELECT id, chatId, toolType, toolCallId, args, summary, result, ok, timestamp, expanded FROM activities ORDER BY timestamp').all() as any[]
    const activities: Activity[] = activitiesRows.map((r) => ({
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
    }))

    const skillsRows = s.prepare('SELECT id, name, note, mainFile, files, projectId, createdAt, updatedAt FROM skills').all() as any[]
    const skills: Skill[] = skillsRows.map((r) => ({
      id: r.id,
      name: r.name,
      note: r.note,
      mainFile: r.mainFile,
      files: JSON.parse(r.files) as string[],
      projectId: r.projectId ?? undefined,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt ?? undefined
    }))

    const previews = s.prepare('SELECT id, chatId, port, createdAt, updatedAt FROM previews').all() as Preview[]

    const kvRows = s.prepare('SELECT key, value FROM kv').all() as any[]
    const kv = new Map(kvRows.map((r) => [r.key, r.value]))
    const systemPrompt = typeof kv.get('systemPrompt') === 'string' ? kv.get('systemPrompt') as string : ''
    const planPrompt = typeof kv.get('planPrompt') === 'string' ? kv.get('planPrompt') as string : ''
    let retrySettings: RetrySettings
    try {
      const parsed = kv.get('retrySettings') ? JSON.parse(kv.get('retrySettings') as string) : null
      const def: RetrySettings = { enabled: true, maxRetries: 5, baseDelayMs: 1200, maxDelayMs: 30000, retryOnStatusCodes: [429, 500, 502, 503], stopOnStatusCodes: [400, 401, 403, 404], alwaysRetry: false }
      if (parsed && typeof parsed === 'object') {
        retrySettings = {
          enabled: Boolean(parsed.enabled ?? def.enabled),
          maxRetries: Number(parsed.maxRetries ?? def.maxRetries),
          baseDelayMs: Number(parsed.baseDelayMs ?? def.baseDelayMs),
          maxDelayMs: Number(parsed.maxDelayMs ?? def.maxDelayMs),
          retryOnStatusCodes: Array.isArray(parsed.retryOnStatusCodes) ? parsed.retryOnStatusCodes.filter((x: any) => Number.isInteger(x)) : def.retryOnStatusCodes,
          stopOnStatusCodes: Array.isArray(parsed.stopOnStatusCodes) ? parsed.stopOnStatusCodes.filter((x: any) => Number.isInteger(x)) : def.stopOnStatusCodes,
          alwaysRetry: Boolean(parsed.alwaysRetry ?? def.alwaysRetry)
        }
      } else retrySettings = def
    } catch {
      retrySettings = { enabled: true, maxRetries: 5, baseDelayMs: 1200, maxDelayMs: 30000, retryOnStatusCodes: [429, 500, 502, 503], stopOnStatusCodes: [400, 401, 403, 404], alwaysRetry: false }
    }

    return { projects, chats, messages, providers, models, systemPrompt, planPrompt, plans, terminals, questions, activities, retrySettings, skills, previews }
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
      alwaysRetry: false
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
            alwaysRetry: Boolean(parsed.retrySettings.alwaysRetry ?? defaultRetrySettings.alwaysRetry)
          }
        : defaultRetrySettings,
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
      previews: Array.isArray(parsed.previews) ? parsed.previews.filter((p: any) => p && typeof p.id === 'string' && typeof p.chatId === 'string' && Number.isInteger(p.port)) : []
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
      alwaysRetry: false
    }
    db = { projects: [], chats: [], messages: [], providers: [], models: [], systemPrompt: '', planPrompt: '', plans: [], terminals: [], questions: [], activities: [], retrySettings: defaultRetrySettings, skills: [], previews: [] }
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
      alwaysRetry: false
    }
    db = { projects: [], chats: [], messages: [], providers: [], models: [], systemPrompt: '', planPrompt: '', plans: [], terminals: [], questions: [], activities: [], retrySettings: defaultRetrySettings, skills: [], previews: [] }
    if (seedDefaultSkills()) {
      try { persistToSqlite() } catch {}
    }
  }
}

export function saveDb(): void {
  try {
    // Ensure directory exists
    fs.mkdirSync(path.dirname(dbFile), { recursive: true })
    persistToSqlite()
  } catch (e) {
    console.error('saveDb failed:', e)
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
