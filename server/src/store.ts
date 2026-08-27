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
  retrySettings: RetrySettings
}

const dataDir = process.env.KS_DATA_DIR || path.join(process.cwd(), 'data')
const dbFile = path.join(dataDir, 'db.json')

let db: DB = { projects: [], chats: [], messages: [], providers: [], models: [], systemPrompt: '', planPrompt: '', plans: [], terminals: [], questions: [], retrySettings: { enabled: true, maxRetries: 5, baseDelayMs: 1200, maxDelayMs: 30000, retryOnStatusCodes: [429, 502, 503], stopOnStatusCodes: [400, 401, 403, 404] } }

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
    for (const c of list) if (Number.isInteger(c.seq) && (c.seq as number) > 0) used.add(c.seq as number)
    let next = 1
    while (used.has(next)) next++
    for (const c of list) {
      if (!Number.isInteger(c.seq) || (c.seq as number) <= 0 || used.has(c.seq as number) === false) {
        // if already valid integer we keep it, otherwise assign next
        if (Number.isInteger(c.seq) && (c.seq as number) > 0) continue
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
      retryOnStatusCodes: [429, 502, 503],
      stopOnStatusCodes: [400, 401, 403, 404]
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
              : defaultRetrySettings.stopOnStatusCodes
          }
        : defaultRetrySettings
    }
    if (ensureChatSeqs(db.chats)) {
      try { saveDb() } catch {}
    }
  } catch {
    const defaultRetrySettings: RetrySettings = {
      enabled: true,
      maxRetries: 5,
      baseDelayMs: 1200,
      maxDelayMs: 30000,
      retryOnStatusCodes: [429, 502, 503],
      stopOnStatusCodes: [400, 401, 403, 404]
    }
    db = { projects: [], chats: [], messages: [], providers: [], models: [], systemPrompt: '', planPrompt: '', plans: [], terminals: [], questions: [], retrySettings: defaultRetrySettings }
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
