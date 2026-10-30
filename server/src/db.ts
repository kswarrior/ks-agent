import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { config } from './config.js'
import { ConfigError } from './errors.js'
import type {
  Chat,
  ChatSummary,
  ExtensionKind,
  KnowledgeEntry,
  KnowledgeScope,
  KnowledgeSource,
  Message,
  ModelEntry,
  Project,
  Provider,
  Role,
  ToolCall
} from './types.js'

const DATABASE_FILENAME = 'ksagent.db'
const DATABASE_LOCATION_FILENAME = 'database-location.json'
const pinnedDbPath = process.env.KS_DB_PATH ? path.resolve(process.env.KS_DB_PATH) : null
const defaultDbPath = pinnedDbPath ?? path.join(config.dataDir, DATABASE_FILENAME)
const databaseLocationPath = path.join(config.dataDir, DATABASE_LOCATION_FILENAME)

export interface DatabaseSettings {
  path: string
  directory: string
  defaultPath: string
  defaultDirectory: string
  sizeBytes: number
  managedByEnv: boolean
}

function readDatabaseLocation(): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(databaseLocationPath, 'utf8')) as { path?: unknown }
    return typeof parsed.path === 'string' && path.isAbsolute(parsed.path) ? path.resolve(parsed.path) : null
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[db] ignoring database location file ${databaseLocationPath}`)
    }
    return null
  }
}

function resolveInitialDatabasePath(): string {
  if (pinnedDbPath) return pinnedDbPath
  const selected = readDatabaseLocation()
  if (!selected) return defaultDbPath
  if (!fs.existsSync(selected)) {
    throw new Error(
      `Database location ${selected} is missing. Restore it or delete ${databaseLocationPath} to use ${defaultDbPath}.`
    )
  }
  return selected
}

function openDatabase(location: string): Database.Database {
  fs.mkdirSync(path.dirname(location), { recursive: true })
  const connection = new Database(location)
  connection.pragma('journal_mode = WAL')
  connection.pragma('foreign_keys = ON')
  return connection
}

function ensureColumn(connection: Database.Database, table: string, column: string, definition: string): void {
  const columns = connection.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some((entry) => entry.name === column)) {
    connection.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

function initializeSchema(connection: Database.Database): void {
  connection.exec(`
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  model_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  tool_calls TEXT,
  tool_call_id TEXT,
  model_id TEXT,
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  model_id TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_disabled_extensions (
  chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (chat_id, kind, name)
);
CREATE TABLE IF NOT EXISTS chat_summaries (
  chat_id TEXT PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  covered_message_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_disabled_chat ON chat_disabled_extensions(chat_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_project ON knowledge(project_id, updated_at DESC);
`)
  ensureColumn(connection, 'messages', 'model_id', 'TEXT')
  ensureColumn(connection, 'messages', 'duration_ms', 'INTEGER')
  ensureColumn(connection, 'models', 'context_window', 'INTEGER NOT NULL DEFAULT 128000')
}

let dbPath = resolveInitialDatabasePath()
export let db = openDatabase(dbPath)
initializeSchema(db)

function databaseFileSize(location: string): number {
  let total = 0
  for (const suffix of ['', '-wal']) {
    try {
      total += fs.statSync(location + suffix).size
    } catch {
      // missing sidecars are expected
    }
  }
  return total
}

export function getDatabaseSettings(): DatabaseSettings {
  return {
    path: dbPath,
    directory: path.dirname(dbPath),
    defaultPath: defaultDbPath,
    defaultDirectory: path.dirname(defaultDbPath),
    sizeBytes: databaseFileSize(dbPath),
    managedByEnv: Boolean(pinnedDbPath)
  }
}

function expandHome(input: string): string {
  if (input === '~') return os.homedir()
  if (input.startsWith('~/') || input.startsWith('~\\')) return path.join(os.homedir(), input.slice(2))
  return input
}

function resolveTargetDatabasePath(input: unknown): string {
  if (typeof input !== 'string' || !input.trim()) {
    throw new ConfigError('Database folder is required')
  }
  const expanded = expandHome(input.trim())
  if (!path.isAbsolute(expanded)) {
    throw new ConfigError('Database folder must be an absolute path')
  }
  const absolute = path.resolve(expanded)
  let isDirectory = false
  try {
    isDirectory = fs.statSync(absolute).isDirectory()
  } catch {
    isDirectory = false
  }
  const looksLikeFile = !isDirectory && /\.(?:db|sqlite|sqlite3)$/i.test(absolute)
  return looksLikeFile ? absolute : path.join(absolute, path.basename(dbPath))
}

function ensureWritableDirectory(directory: string): void {
  try {
    fs.mkdirSync(directory, { recursive: true })
  } catch (error) {
    throw new ConfigError(
      `Cannot create database folder ${directory}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  if (!fs.statSync(directory).isDirectory()) {
    throw new ConfigError(`Database location is not a folder: ${directory}`)
  }
  try {
    fs.accessSync(directory, fs.constants.W_OK)
  } catch {
    throw new ConfigError(`Database folder is not writable: ${directory}`)
  }
}

function verifyDatabaseCopy(location: string): void {
  const check = new Database(location, { readonly: true, fileMustExist: true })
  try {
    const rows = check.pragma('integrity_check') as Array<{ integrity_check: string }>
    if (rows.length === 0 || !rows.every((row) => row.integrity_check === 'ok')) {
      throw new Error('The copied database failed its integrity check')
    }
  } finally {
    check.close()
  }
}

function saveDatabaseLocation(location: string): void {
  if (!pinnedDbPath && path.resolve(location) === path.resolve(defaultDbPath)) {
    fs.rmSync(databaseLocationPath, { force: true })
    return
  }
  const temporary = `${databaseLocationPath}.${process.pid}.tmp`
  fs.writeFileSync(
    temporary,
    `${JSON.stringify({ path: location, updatedAt: new Date().toISOString() }, null, 2)}\n`
  )
  fs.renameSync(temporary, databaseLocationPath)
}

function removeDatabaseFiles(location: string): void {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    try {
      fs.rmSync(location + suffix, { force: true })
    } catch (error) {
      console.warn(`[db] could not remove ${location + suffix}:`, error instanceof Error ? error.message : error)
    }
  }
}

export function relocateDatabase(input: unknown): DatabaseSettings {
  if (pinnedDbPath) {
    throw new ConfigError('Database location is pinned by KS_DB_PATH. Unset it to move the database from the app.')
  }
  const targetPath = resolveTargetDatabasePath(input)
  if (path.resolve(targetPath) === path.resolve(dbPath)) return getDatabaseSettings()

  const targetDirectory = path.dirname(targetPath)
  ensureWritableDirectory(targetDirectory)
  if (fs.existsSync(targetPath)) {
    throw new ConfigError(
      `A database already exists at ${targetPath}. Choose another folder so no data is overwritten.`
    )
  }

  const temporary = path.join(
    targetDirectory,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`
  )
  const oldPath = dbPath
  let oldClosed = false
  let targetCreated = false

  try {
    const checkpoint = db.pragma('wal_checkpoint(TRUNCATE)') as Array<{ busy?: number }>
    if (Array.isArray(checkpoint) && checkpoint.some((row) => Number(row.busy) > 0)) {
      throw new ConfigError('The database is busy. Try again in a moment.', 409)
    }
    fs.copyFileSync(oldPath, temporary)
    verifyDatabaseCopy(temporary)

    db.close()
    oldClosed = true
    fs.renameSync(temporary, targetPath)
    targetCreated = true
    removeDatabaseFiles(temporary)

    const next = openDatabase(targetPath)
    try {
      initializeSchema(next)
    } catch (error) {
      next.close()
      throw error
    }
    db = next
    dbPath = targetPath
    saveDatabaseLocation(targetPath)
    removeDatabaseFiles(oldPath)
    return getDatabaseSettings()
  } catch (error) {
    if (targetCreated) {
      try {
        db.close()
      } catch {
        // already closed or failed to open
      }
    }
    if (oldClosed) {
      db = openDatabase(oldPath)
      initializeSchema(db)
      dbPath = oldPath
    }
    removeDatabaseFiles(temporary)
    if (targetCreated) removeDatabaseFiles(targetPath)
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export function newId(): string {
  return crypto.randomUUID()
}

type ProjectRow = { id: string; name: string; path: string; created_at: number }
type ChatRow = { id: string; project_id: string; title: string; model_id: string | null; created_at: number; updated_at: number }
type MessageRow = {
  id: string
  chat_id: string
  role: Role
  content: string
  tool_calls: string | null
  tool_call_id: string | null
  model_id: string | null
  duration_ms: number | null
  created_at: number
}
type ChatSummaryRow = {
  chat_id: string
  summary: string
  covered_message_id: string
  updated_at: number
}
type KnowledgeRow = {
  id: string
  scope: KnowledgeScope
  project_id: string | null
  title: string
  content: string
  enabled: number
  source: KnowledgeSource
  created_at: number
  updated_at: number
}
type ProviderRow = { id: string; name: string; base_url: string; api_key: string; created_at: number }
type ModelRow = {
  id: string
  provider_id: string
  name: string
  model_id: string
  context_window: number
  created_at: number
  provider_name?: string
}

const project = (r: ProjectRow): Project => ({ id: r.id, name: r.name, path: r.path, createdAt: r.created_at })
const chat = (r: ChatRow): Chat => ({
  id: r.id,
  projectId: r.project_id,
  title: r.title,
  modelId: r.model_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})
const message = (r: MessageRow): Message => ({
  id: r.id,
  chatId: r.chat_id,
  role: r.role,
  content: r.content,
  toolCalls: r.tool_calls ? (JSON.parse(r.tool_calls) as ToolCall[]) : null,
  toolCallId: r.tool_call_id,
  modelId: r.model_id ?? null,
  durationMs: r.duration_ms ?? null,
  createdAt: r.created_at
})
const chatSummary = (r: ChatSummaryRow): ChatSummary => ({
  chatId: r.chat_id,
  summary: r.summary,
  coveredMessageId: r.covered_message_id,
  updatedAt: r.updated_at
})
const knowledgeEntry = (r: KnowledgeRow): KnowledgeEntry => ({
  id: r.id,
  scope: r.scope,
  projectId: r.project_id,
  title: r.title,
  content: r.content,
  enabled: Boolean(r.enabled),
  source: r.source,
  createdAt: r.created_at,
  updatedAt: r.updated_at
})
const provider = (r: ProviderRow): Provider => ({
  id: r.id,
  name: r.name,
  baseUrl: r.base_url,
  apiKey: r.api_key,
  createdAt: r.created_at
})
const model = (r: ModelRow): ModelEntry => ({
  id: r.id,
  providerId: r.provider_id,
  name: r.name,
  modelId: r.model_id,
  contextWindow: r.context_window ?? 128_000,
  createdAt: r.created_at,
  providerName: r.provider_name
})

export function listProjects(): Project[] {
  return (db.prepare('SELECT * FROM projects ORDER BY created_at ASC').all() as ProjectRow[]).map(project)
}
export function getProject(id: string): Project | null {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined
  return row ? project(row) : null
}
export function insertProject(name: string, projectPath: string): Project {
  const row: ProjectRow = { id: newId(), name, path: projectPath, created_at: Date.now() }
  db.prepare('INSERT INTO projects (id, name, path, created_at) VALUES (?, ?, ?, ?)').run(row.id, row.name, row.path, row.created_at)
  return project(row)
}
export function removeProject(id: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(id)
}

export function listChats(projectId: string): Chat[] {
  return (
    db.prepare('SELECT * FROM chats WHERE project_id = ? ORDER BY updated_at DESC').all(projectId) as ChatRow[]
  ).map(chat)
}
export function getChat(id: string): Chat | null {
  const row = db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as ChatRow | undefined
  return row ? chat(row) : null
}
export function insertChat(projectId: string, title: string, modelId: string | null): Chat {
  const now = Date.now()
  const row: ChatRow = { id: newId(), project_id: projectId, title, model_id: modelId, created_at: now, updated_at: now }
  db.prepare(
    'INSERT INTO chats (id, project_id, title, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(row.id, row.project_id, row.title, row.model_id, row.created_at, row.updated_at)
  return chat(row)
}
export function updateChat(id: string, fields: { title?: string; modelId?: string | null }): Chat | null {
  const current = getChat(id)
  if (!current) return null
  const title = fields.title ?? current.title
  const modelId = fields.modelId === undefined ? current.modelId : fields.modelId
  db.prepare('UPDATE chats SET title = ?, model_id = ?, updated_at = ? WHERE id = ?').run(
    title,
    modelId,
    Date.now(),
    id
  )
  return getChat(id)
}
export function touchChat(id: string): void {
  db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(Date.now(), id)
}
export function removeChat(id: string): void {
  db.prepare('DELETE FROM chats WHERE id = ?').run(id)
}

export function listChatDisabled(chatId: string): Record<ExtensionKind, Set<string>> {
  const out: Record<ExtensionKind, Set<string>> = {
    skill: new Set(),
    knowledge: new Set(),
    mcp: new Set(),
    lsp: new Set()
  }
  const rows = db
    .prepare('SELECT kind, name FROM chat_disabled_extensions WHERE chat_id = ?')
    .all(chatId) as Array<{ kind: ExtensionKind; name: string }>
  for (const row of rows) {
    if (row.kind in out) out[row.kind].add(row.name)
  }
  return out
}

export function setChatExtensionEnabled(
  chatId: string,
  kind: ExtensionKind,
  name: string,
  enabled: boolean
): void {
  if (enabled) {
    db.prepare('DELETE FROM chat_disabled_extensions WHERE chat_id = ? AND kind = ? AND name = ?').run(
      chatId,
      kind,
      name
    )
    return
  }
  db.prepare(
    'INSERT INTO chat_disabled_extensions (chat_id, kind, name) VALUES (?, ?, ?) ON CONFLICT DO NOTHING'
  ).run(chatId, kind, name)
}

export function listMessages(chatId: string): Message[] {
  return (
    db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC, rowid ASC').all(chatId) as MessageRow[]
  ).map(message)
}
export function getMessage(id: string): Message | null {
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined
  return row ? message(row) : null
}
export function deleteMessagesFrom(chatId: string, messageId: string): number {
  const target = db
    .prepare('SELECT rowid AS message_row FROM messages WHERE id = ? AND chat_id = ?')
    .get(messageId, chatId) as { message_row: number } | undefined
  if (!target) return 0
  return db.prepare('DELETE FROM messages WHERE chat_id = ? AND rowid >= ?').run(chatId, target.message_row)
    .changes
}
export function insertMessage(input: {
  chatId: string
  role: Role
  content: string
  toolCalls?: ToolCall[] | null
  toolCallId?: string | null
  modelId?: string | null
  durationMs?: number | null
}): Message {
  const row: MessageRow = {
    id: newId(),
    chat_id: input.chatId,
    role: input.role,
    content: input.content,
    tool_calls: input.toolCalls && input.toolCalls.length ? JSON.stringify(input.toolCalls) : null,
    tool_call_id: input.toolCallId ?? null,
    model_id: input.modelId ?? null,
    duration_ms: input.durationMs ?? null,
    created_at: Date.now()
  }
  db.prepare(
    'INSERT INTO messages (id, chat_id, role, content, tool_calls, tool_call_id, model_id, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    row.id,
    row.chat_id,
    row.role,
    row.content,
    row.tool_calls,
    row.tool_call_id,
    row.model_id,
    row.duration_ms,
    row.created_at
  )
  return message(row)
}

export function listMessagesAfter(chatId: string, messageId: string): Message[] {
  const target = db
    .prepare('SELECT rowid AS message_row FROM messages WHERE id = ? AND chat_id = ?')
    .get(messageId, chatId) as { message_row: number } | undefined
  if (!target) return listMessages(chatId)
  return (
    db
      .prepare('SELECT * FROM messages WHERE chat_id = ? AND rowid > ? ORDER BY created_at ASC, rowid ASC')
      .all(chatId, target.message_row) as MessageRow[]
  ).map(message)
}

export function getChatSummary(chatId: string): ChatSummary | null {
  const row = db.prepare('SELECT * FROM chat_summaries WHERE chat_id = ?').get(chatId) as
    | ChatSummaryRow
    | undefined
  return row ? chatSummary(row) : null
}

export function saveChatSummary(chatId: string, summary: string, coveredMessageId: string): ChatSummary {
  const row: ChatSummaryRow = {
    chat_id: chatId,
    summary,
    covered_message_id: coveredMessageId,
    updated_at: Date.now()
  }
  db.prepare(
    'INSERT INTO chat_summaries (chat_id, summary, covered_message_id, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET summary = excluded.summary, covered_message_id = excluded.covered_message_id, updated_at = excluded.updated_at'
  ).run(row.chat_id, row.summary, row.covered_message_id, row.updated_at)
  return chatSummary(row)
}

export function removeChatSummary(chatId: string): void {
  db.prepare('DELETE FROM chat_summaries WHERE chat_id = ?').run(chatId)
}

export function listKnowledge(): KnowledgeEntry[] {
  return (
    db.prepare('SELECT * FROM knowledge ORDER BY scope ASC, updated_at DESC').all() as KnowledgeRow[]
  ).map(knowledgeEntry)
}

export function listGlobalKnowledge(): KnowledgeEntry[] {
  return (
    db
      .prepare("SELECT * FROM knowledge WHERE scope = 'global' ORDER BY updated_at DESC")
      .all() as KnowledgeRow[]
  ).map(knowledgeEntry)
}

export function listProjectKnowledge(projectId: string): KnowledgeEntry[] {
  return (
    db
      .prepare("SELECT * FROM knowledge WHERE scope = 'project' AND project_id = ? ORDER BY updated_at DESC")
      .all(projectId) as KnowledgeRow[]
  ).map(knowledgeEntry)
}

export function listKnowledgeForProject(projectId: string): KnowledgeEntry[] {
  return (
    db
      .prepare(
        "SELECT * FROM knowledge WHERE scope = 'global' OR (scope = 'project' AND project_id = ?) ORDER BY scope ASC, updated_at DESC"
      )
      .all(projectId) as KnowledgeRow[]
  ).map(knowledgeEntry)
}

export function getKnowledge(id: string): KnowledgeEntry | null {
  const row = db.prepare('SELECT * FROM knowledge WHERE id = ?').get(id) as KnowledgeRow | undefined
  return row ? knowledgeEntry(row) : null
}

export function findGeneratedProjectKnowledge(projectId: string): KnowledgeEntry | null {
  const row = db
    .prepare(
      "SELECT * FROM knowledge WHERE scope = 'project' AND project_id = ? AND source = 'generated' ORDER BY updated_at DESC LIMIT 1"
    )
    .get(projectId) as KnowledgeRow | undefined
  return row ? knowledgeEntry(row) : null
}

export function insertKnowledge(input: {
  scope: KnowledgeScope
  projectId: string | null
  title: string
  content: string
  enabled?: boolean
  source?: KnowledgeSource
}): KnowledgeEntry {
  const now = Date.now()
  const row: KnowledgeRow = {
    id: newId(),
    scope: input.scope,
    project_id: input.projectId,
    title: input.title,
    content: input.content,
    enabled: input.enabled === false ? 0 : 1,
    source: input.source ?? 'manual',
    created_at: now,
    updated_at: now
  }
  db.prepare(
    'INSERT INTO knowledge (id, scope, project_id, title, content, enabled, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    row.id,
    row.scope,
    row.project_id,
    row.title,
    row.content,
    row.enabled,
    row.source,
    row.created_at,
    row.updated_at
  )
  return knowledgeEntry(row)
}

export function updateKnowledge(
  id: string,
  fields: { title?: string; content?: string; enabled?: boolean }
): KnowledgeEntry | null {
  const current = getKnowledge(id)
  if (!current) return null
  const title = fields.title ?? current.title
  const content = fields.content ?? current.content
  const enabled = fields.enabled === undefined ? current.enabled : fields.enabled
  db.prepare('UPDATE knowledge SET title = ?, content = ?, enabled = ?, updated_at = ? WHERE id = ?').run(
    title,
    content,
    enabled ? 1 : 0,
    Date.now(),
    id
  )
  return getKnowledge(id)
}

export function removeKnowledge(id: string): void {
  db.prepare('DELETE FROM knowledge WHERE id = ?').run(id)
}

export function listProviders(): Provider[] {
  return (db.prepare('SELECT * FROM providers ORDER BY created_at ASC').all() as ProviderRow[]).map(provider)
}
export function getProvider(id: string): Provider | null {
  const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id) as ProviderRow | undefined
  return row ? provider(row) : null
}
export function insertProvider(name: string, baseUrl: string, apiKey: string): Provider {
  const row: ProviderRow = { id: newId(), name, base_url: baseUrl, api_key: apiKey, created_at: Date.now() }
  db.prepare('INSERT INTO providers (id, name, base_url, api_key, created_at) VALUES (?, ?, ?, ?, ?)').run(
    row.id,
    row.name,
    row.base_url,
    row.api_key,
    row.created_at
  )
  return provider(row)
}
export function updateProvider(id: string, name: string, baseUrl: string, apiKey: string): Provider | null {
  db.prepare('UPDATE providers SET name = ?, base_url = ?, api_key = ? WHERE id = ?').run(name, baseUrl, apiKey, id)
  return getProvider(id)
}
export function removeProvider(id: string): void {
  db.prepare('DELETE FROM providers WHERE id = ?').run(id)
}

export function listModels(): ModelEntry[] {
  const rows = db
    .prepare(
      `SELECT m.*, p.name AS provider_name FROM models m
       JOIN providers p ON p.id = m.provider_id ORDER BY m.created_at ASC`
    )
    .all() as ModelRow[]
  return rows.map(model)
}
export function getModel(id: string): ModelEntry | null {
  const row = db
    .prepare(
      `SELECT m.*, p.name AS provider_name FROM models m
       JOIN providers p ON p.id = m.provider_id WHERE m.id = ?`
    )
    .get(id) as ModelRow | undefined
  return row ? model(row) : null
}
export function insertModel(
  providerId: string,
  name: string,
  modelId: string,
  contextWindow = 128_000
): ModelEntry {
  const row: ModelRow = {
    id: newId(),
    provider_id: providerId,
    name,
    model_id: modelId,
    context_window: contextWindow,
    created_at: Date.now()
  }
  db.prepare(
    'INSERT INTO models (id, provider_id, name, model_id, context_window, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(row.id, row.provider_id, row.name, row.model_id, row.context_window, row.created_at)
  return model(row)
}
export function updateModel(
  id: string,
  fields: { providerId?: string; name?: string; modelId?: string; contextWindow?: number }
): ModelEntry | null {
  const current = getModel(id)
  if (!current) return null
  const providerId = fields.providerId ?? current.providerId
  const name = fields.name ?? current.name
  const modelId = fields.modelId ?? current.modelId
  const contextWindow = fields.contextWindow ?? current.contextWindow
  db.prepare('UPDATE models SET provider_id = ?, name = ?, model_id = ?, context_window = ? WHERE id = ?').run(
    providerId,
    name,
    modelId,
    contextWindow,
    id
  )
  return getModel(id)
}

export function updateModelContext(id: string, contextWindow: number): ModelEntry | null {
  return updateModel(id, { contextWindow })
}
export function removeModel(id: string): void {
  db.prepare('DELETE FROM models WHERE id = ?').run(id)
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row ? row.value : null
}
export function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    key,
    value
  )
}
