import Database from 'better-sqlite3'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { config } from './config.js'
import type {
  Chat,
  ChatSummary,
  ExtensionKind,
  Message,
  ModelEntry,
  Project,
  Provider,
  Role,
  ToolCall
} from './types.js'

const dbPath = path.join(config.dataDir, 'ksagent.db')
fs.mkdirSync(path.dirname(dbPath), { recursive: true })

export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
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
CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_disabled_chat ON chat_disabled_extensions(chat_id);
`)

function ensureColumn(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`)
  }
}

ensureColumn('messages', 'model_id', 'TEXT')
ensureColumn('messages', 'duration_ms', 'INTEGER')
ensureColumn('models', 'context_window', 'INTEGER NOT NULL DEFAULT 128000')

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
export function updateModelContext(id: string, contextWindow: number): ModelEntry | null {
  db.prepare('UPDATE models SET context_window = ? WHERE id = ?').run(contextWindow, id)
  return getModel(id)
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
