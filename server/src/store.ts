import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

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
}

const dataDir = process.env.KS_DATA_DIR || path.join(process.cwd(), 'data')
const dbFile = path.join(dataDir, 'db.json')
const defaultSkillsDir = path.join(process.cwd(), 'skills')

let db: DB = { projects: [], chats: [], messages: [], providers: [], models: [], systemPrompt: '', planPrompt: '', plans: [], terminals: [], questions: [], activities: [], retrySettings: { enabled: true, maxRetries: 5, baseDelayMs: 1200, maxDelayMs: 30000, retryOnStatusCodes: [429, 500, 502, 503], stopOnStatusCodes: [400, 401, 403, 404], alwaysRetry: false }, skills: [], previews: [] }

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

export function loadDb(): void {
  try {
    const raw = fs.readFileSync(dbFile, 'utf8')
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
      // Legacy field kept (and re-saved) so old settings are never lost.
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
    // Migrate old skills missing updatedAt / projectId: ensure defaults and deduplicate files
    let migrated = false
    for (const s of db.skills) {
      if (!s.updatedAt) { s.updatedAt = s.createdAt; migrated = true }
      if (Array.isArray(s.files)) {
        const deduped = [...new Set(s.files.map((f: any) => String(f).trim()).filter(Boolean))]
        if (deduped.length !== s.files.length) { s.files = deduped; migrated = true }
      }
    }
    // Migrate retry settings to include 500 (ResourceExhausted) for Nvidia rate limits
    if (!db.retrySettings.retryOnStatusCodes.includes(500)) {
      db.retrySettings.retryOnStatusCodes = [...new Set([...db.retrySettings.retryOnStatusCodes, 500])].sort((a, b) => a - b)
      migrated = true
    }
    if (seedDefaultSkills()) migrated = true
    if (ensureChatSeqs(db.chats) || migrated) {
      try { saveDb() } catch {}
    }
  } catch {
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
      try { saveDb() } catch {}
    }
  }
}

export function saveDb(): void {
  fs.mkdirSync(dataDir, { recursive: true })
  const tmp = dbFile + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2))
  fs.renameSync(tmp, dbFile)
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
