import Database from 'better-sqlite3';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { generateId } from '@ks-agent/shared';

export interface DatabaseConfig {
  path: string;
}

const SCHEMA = `
-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_directory TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  settings TEXT DEFAULT '{}'
);

-- Chats table
CREATE TABLE IF NOT EXISTS chats (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT,
  agent_role TEXT,
  created_at TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
);

-- Agent runs table
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL,
  current_state TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  input TEXT NOT NULL,
  metadata TEXT DEFAULT '{}',
  FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Agent steps table
CREATE TABLE IF NOT EXISTS agent_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  agent_role TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  input TEXT NOT NULL,
  output TEXT,
  error TEXT,
  FOREIGN KEY (run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
);

-- Tool calls table
CREATE TABLE IF NOT EXISTS tool_calls (
  id TEXT PRIMARY KEY,
  step_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  parameters TEXT NOT NULL,
  result TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (step_id) REFERENCES agent_steps(id) ON DELETE CASCADE
);

-- Model settings table
CREATE TABLE IF NOT EXISTS model_settings (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  role TEXT NOT NULL,
  model_id TEXT NOT NULL,
  temperature REAL,
  max_tokens INTEGER,
  context_limit INTEGER,
  timeout INTEGER,
  retry_count INTEGER,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- App settings table
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_chat ON agent_runs(chat_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_project ON agent_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_agent_steps_run ON agent_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_step ON tool_calls(step_id);
CREATE INDEX IF NOT EXISTS idx_model_settings_project ON model_settings(project_id);
`;

export class DatabaseService {
  private db: Database.Database;

  constructor(config: DatabaseConfig) {
    const dir = join(config.path, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    
    this.db = new Database(config.path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(SCHEMA);
    this.seedDefaults();
  }

  private seedDefaults(): void {
    const existing = this.db.prepare('SELECT COUNT(*) as count FROM app_settings').get() as { count: number };
    if (existing.count === 0) {
      const defaults = [
        { key: 'theme', value: 'dark' },
        { key: 'language', value: 'en' },
        { key: 'autonomousMode', value: 'false' },
        { key: 'maxFixIterations', value: '5' },
        { key: 'requireApprovalForShell', value: 'true' },
        { key: 'autoRunTests', value: 'true' },
        { key: 'reviewBeforeCompletion', value: 'true' },
        { key: 'maxAgentSteps', value: '100' }
      ];
      
      const stmt = this.db.prepare('INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)');
      const now = new Date().toISOString();
      
      for (const setting of defaults) {
        stmt.run(setting.key, setting.value, now);
      }
    }
  }

  // Projects
  createProject(name: string, rootDirectory: string, settings = {}): string {
    const id = generateId('proj_');
    const now = new Date().toISOString();
    
    this.db.prepare(
      'INSERT INTO projects (id, name, root_directory, created_at, updated_at, settings) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name, rootDirectory, now, now, JSON.stringify(settings));
    
    return id;
  }

  getProject(id: string) {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  }

  getAllProjects() {
    return this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
  }

  updateProject(id: string, updates: Partial<{ name: string; rootDirectory: string; settings: object }>) {
    const setClause = [];
    const values = [];
    
    if (updates.name) { setClause.push('name = ?'); values.push(updates.name); }
    if (updates.rootDirectory) { setClause.push('root_directory = ?'); values.push(updates.rootDirectory); }
    if (updates.settings) { setClause.push('settings = ?'); values.push(JSON.stringify(updates.settings)); }
    
    setClause.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    
    this.db.prepare(`UPDATE projects SET ${setClause.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteProject(id: string) {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  }

  // Chats
  createChat(projectId: string, title: string): string {
    const id = generateId('chat_');
    const now = new Date().toISOString();
    
    this.db.prepare(
      'INSERT INTO chats (id, project_id, title, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, projectId, title, now, now, 'active');
    
    return id;
  }

  getChat(id: string) {
    return this.db.prepare('SELECT * FROM chats WHERE id = ?').get(id);
  }

  getChatsByProject(projectId: string) {
    return this.db.prepare('SELECT * FROM chats WHERE project_id = ? ORDER BY updated_at DESC').all(projectId);
  }

  updateChat(id: string, updates: Partial<{ title: string; status: string }>) {
    const setClause = [];
    const values = [];
    
    if (updates.title) { setClause.push('title = ?'); values.push(updates.title); }
    if (updates.status) { setClause.push('status = ?'); values.push(updates.status); }
    
    setClause.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    
    this.db.prepare(`UPDATE chats SET ${setClause.join(', ')} WHERE id = ?`).run(...values);
  }

  deleteChat(id: string) {
    this.db.prepare('DELETE FROM chats WHERE id = ?').run(id);
  }

  // Messages
  addMessage(message: Omit<Message, 'id' | 'createdAt'> & { id?: string }): string {
    const id = message.id || generateId('msg_');
    const now = new Date().toISOString();
    
    this.db.prepare(
      'INSERT INTO messages (id, chat_id, role, content, model, agent_role, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      message.chatId,
      message.role,
      message.content,
      message.model || null,
      message.agentRole || null,
      now,
      JSON.stringify(message.metadata || {})
    );
    
    return id;
  }

  getMessages(chatId: string) {
    return this.db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId);
  }

  // Agent Runs
  createAgentRun(run: Omit<AgentRun, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): string {
    const id = run.id || generateId('run_');
    const now = new Date().toISOString();
    
    this.db.prepare(
      `INSERT INTO agent_runs (id, chat_id, project_id, status, current_state, created_at, updated_at, input, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      run.chatId,
      run.projectId,
      run.status,
      run.currentState,
      now,
      now,
      run.input,
      JSON.stringify(run.metadata || {})
    );
    
    return id;
  }

  getAgentRun(id: string) {
    return this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id);
  }

  getAgentRunsByChat(chatId: string) {
    return this.db.prepare('SELECT * FROM agent_runs WHERE chat_id = ? ORDER BY created_at DESC').all(chatId);
  }

  updateAgentRun(id: string, updates: Partial<AgentRun>) {
    const setClause = [];
    const values = [];
    
    const columnMap: Record<string, string> = {
      status: 'status',
      currentState: 'current_state',
      completedAt: 'completed_at',
      metadata: 'metadata'
    };

    for (const field of Object.keys(columnMap)) {
      const value = updates[field as keyof AgentRun];
      if (value !== undefined) {
        setClause.push(`${columnMap[field]} = ?`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }
    
    setClause.push('updated_at = ?');
    values.push(new Date().toISOString());
    values.push(id);
    
    this.db.prepare(`UPDATE agent_runs SET ${setClause.join(', ')} WHERE id = ?`).run(...values);
  }

  // Agent Steps
  createAgentStep(step: Omit<AgentStep, 'id' | 'startedAt'> & { id?: string }): string {
    const id = step.id || generateId('step_');
    const now = new Date().toISOString();
    
    this.db.prepare(
      `INSERT INTO agent_steps (id, run_id, agent_role, model, status, started_at, input, output, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      step.runId,
      step.agentRole,
      step.model,
      step.status,
      now,
      JSON.stringify(step.input),
      step.output ? JSON.stringify(step.output) : null,
      step.error || null
    );
    
    return id;
  }

  getAgentSteps(runId: string) {
    return this.db.prepare('SELECT * FROM agent_steps WHERE run_id = ? ORDER BY started_at ASC').all(runId);
  }

  updateAgentStep(id: string, updates: Partial<AgentStep>) {
    const setClause = [];
    const values = [];
    
    const columnMap: Record<string, string> = {
      status: 'status',
      completedAt: 'completed_at',
      output: 'output',
      error: 'error'
    };

    for (const field of Object.keys(columnMap)) {
      const value = updates[field as keyof AgentStep];
      if (value !== undefined) {
        setClause.push(`${columnMap[field]} = ?`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }
    
    values.push(id);
    this.db.prepare(`UPDATE agent_steps SET ${setClause.join(', ')} WHERE id = ?`).run(...values);
  }

  // Tool Calls
  createToolCall(call: Omit<ToolCall, 'id' | 'startedAt'> & { id?: string }): string {
    const id = call.id || generateId('tool_');
    const now = new Date().toISOString();
    
    this.db.prepare(
      'INSERT INTO tool_calls (id, step_id, tool_name, parameters, result, status, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id,
      call.stepId,
      call.toolName,
      JSON.stringify(call.parameters),
      call.result ? JSON.stringify(call.result) : null,
      call.status,
      now,
      call.completedAt || null
    );
    
    return id;
  }

  getToolCalls(stepId: string) {
    return this.db.prepare('SELECT * FROM tool_calls WHERE step_id = ? ORDER BY started_at ASC').all(stepId);
  }

  updateToolCall(id: string, updates: Partial<ToolCall>) {
    const setClause = [];
    const values = [];
    
    const columnMap: Record<string, string> = {
      result: 'result',
      status: 'status',
      completedAt: 'completed_at'
    };

    for (const field of Object.keys(columnMap)) {
      const value = updates[field as keyof ToolCall];
      if (value !== undefined) {
        setClause.push(`${columnMap[field]} = ?`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }
    
    values.push(id);
    this.db.prepare(`UPDATE tool_calls SET ${setClause.join(', ')} WHERE id = ?`).run(...values);
  }

  // Model Settings
  setModelSetting(setting: {
    projectId?: string;
    role: string;
    modelId: string;
    temperature?: number;
    maxTokens?: number;
    contextLimit?: number;
    timeout?: number;
    retryCount?: number;
  }): string {
    const id = generateId('model_');
    
    this.db.prepare(
      `INSERT INTO model_settings (id, project_id, role, model_id, temperature, max_tokens, context_limit, timeout, retry_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      setting.projectId || null,
      setting.role,
      setting.modelId,
      setting.temperature ?? null,
      setting.maxTokens ?? null,
      setting.contextLimit ?? null,
      setting.timeout ?? null,
      setting.retryCount ?? null
    );
    
    return id;
  }

  getModelSettings(projectId?: string) {
    if (projectId) {
      return this.db.prepare('SELECT * FROM model_settings WHERE project_id = ? OR project_id IS NULL').all(projectId);
    }
    return this.db.prepare('SELECT * FROM model_settings WHERE project_id IS NULL').all();
  }

  // App Settings
  getAppSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value || null;
  }

  setAppSetting(key: string, value: string) {
    this.db.prepare(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)'
    ).run(key, value, new Date().toISOString());
  }

  getAllAppSettings() {
    return this.db.prepare('SELECT * FROM app_settings').all();
  }

  close() {
    this.db.close();
  }
}

export interface Message {
  chatId: string;
  role: string;
  content: string;
  model?: string;
  agentRole?: string;
  metadata?: Record<string, unknown>;
  id?: string;
}

export interface AgentRun {
  chatId: string;
  projectId: string;
  status: string;
  currentState: string;
  input: string;
  metadata?: Record<string, unknown>;
  id?: string;
  completedAt?: string;
}

export interface AgentStep {
  runId: string;
  agentRole: string;
  model: string;
  status: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  id?: string;
  completedAt?: string;
}

export interface ToolCall {
  stepId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: string;
  completedAt?: string;
  id?: string;
}