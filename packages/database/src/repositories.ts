import { DB } from './db';
import { randomId } from '@ks-agent/shared';
import {
  AgentRun,
  AgentStep,
  AgentRole,
  AgentState,
  AppSettings,
  AppearanceSettings,
  Chat,
  GeneralSettings,
  Message,
  ModelSettings,
  Project,
  ProviderSettings,
  ToolCall,
  ToolsSettings,
  AgentSettings,
  APISettings,
  DatabaseSettings,
} from '@ks-agent/types';

function nowIso() {
  return new Date().toISOString();
}

// ---------- Projects ----------

export const ProjectsRepo = {
  list(db: DB): Project[] {
    return db
      .prepare(`SELECT * FROM projects ORDER BY updated_at DESC`)
      .all() as Project[];
  },
  get(db: DB, id: string): Project | undefined {
    return db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as
      | Project
      | undefined;
  },
  create(db: DB, name: string, root_directory: string, settings?: string): Project {
    const id = randomId('prj');
    const ts = nowIso();
    db.prepare(
      `INSERT INTO projects (id, name, root_directory, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, name, root_directory, settings ?? null, ts, ts);
    return { id, name, root_directory, settings, created_at: ts, updated_at: ts };
  },
  rename(db: DB, id: string, name: string) {
    db.prepare(`UPDATE projects SET name = ?, updated_at = ? WHERE id = ?`).run(
      name,
      nowIso(),
      id,
    );
  },
  update(db: DB, id: string, fields: Partial<Pick<Project, 'name' | 'root_directory' | 'settings'>>) {
    const cur = this.get(db, id);
    if (!cur) throw new Error('Project not found');
    db.prepare(
      `UPDATE projects SET name = ?, root_directory = ?, settings = ?, updated_at = ? WHERE id = ?`,
    ).run(
      fields.name ?? cur.name,
      fields.root_directory ?? cur.root_directory,
      fields.settings ?? cur.settings ?? null,
      nowIso(),
      id,
    );
  },
  delete(db: DB, id: string) {
    db.prepare(`DELETE FROM projects WHERE id = ?`).run(id);
  },
};

// ---------- Chats ----------

export const ChatsRepo = {
  listByProject(db: DB, projectId: string): Chat[] {
    return db
      .prepare(
        `SELECT * FROM chats WHERE project_id = ? ORDER BY updated_at DESC`,
      )
      .all(projectId) as Chat[];
  },
  get(db: DB, id: string): Chat | undefined {
    return db.prepare(`SELECT * FROM chats WHERE id = ?`).get(id) as
      | Chat
      | undefined;
  },
  create(db: DB, project_id: string, title: string): Chat {
    const id = randomId('cht');
    const ts = nowIso();
    db.prepare(
      `INSERT INTO chats (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).run(id, project_id, title, ts, ts);
    return { id, project_id, title, created_at: ts, updated_at: ts };
  },
  rename(db: DB, id: string, title: string) {
    db.prepare(`UPDATE chats SET title = ?, updated_at = ? WHERE id = ?`).run(
      title,
      nowIso(),
      id,
    );
  },
  touch(db: DB, id: string) {
    db.prepare(`UPDATE chats SET updated_at = ? WHERE id = ?`).run(nowIso(), id);
  },
  delete(db: DB, id: string) {
    db.prepare(`DELETE FROM chats WHERE id = ?`).run(id);
  },
};

// ---------- Messages ----------

export const MessagesRepo = {
  listByChat(db: DB, chatId: string): Message[] {
    return db
      .prepare(`SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC`)
      .all(chatId) as Message[];
  },
  get(db: DB, id: string): Message | undefined {
    return db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as
      | Message
      | undefined;
  },
  create(
    db: DB,
    chat_id: string,
    role: Message['role'],
    content: string,
    agent_run_id?: string,
  ): Message {
    const id = randomId('msg');
    const ts = nowIso();
    db.prepare(
      `INSERT INTO messages (id, chat_id, role, content, agent_run_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, chat_id, role, content, agent_run_id ?? null, ts);
    ChatsRepo.touch(db, chat_id);
    return { id, chat_id, role, content, agent_run_id, created_at: ts };
  },
  update(db: DB, id: string, content: string) {
    db.prepare(`UPDATE messages SET content = ? WHERE id = ?`).run(content, id);
  },
};

// ---------- Agent Runs ----------

export const AgentRunsRepo = {
  listByChat(db: DB, chatId: string): AgentRun[] {
    return db
      .prepare(`SELECT * FROM agent_runs WHERE chat_id = ? ORDER BY created_at DESC`)
      .all(chatId) as AgentRun[];
  },
  get(db: DB, id: string): AgentRun | undefined {
    return db.prepare(`SELECT * FROM agent_runs WHERE id = ?`).get(id) as
      | AgentRun
      | undefined;
  },
  create(
    db: DB,
    chat_id: string,
    prompt: string,
    max_fix_iterations: number,
  ): AgentRun {
    const id = randomId('run');
    const ts = nowIso();
    db.prepare(
      `INSERT INTO agent_runs (id, chat_id, state, status, prompt, fix_iteration, max_fix_iterations, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      chat_id,
      'IDLE' as AgentState,
      'pending',
      prompt,
      0,
      max_fix_iterations,
      ts,
      ts,
    );
    return {
      id,
      chat_id,
      state: 'IDLE',
      status: 'pending',
      prompt,
      fix_iteration: 0,
      max_fix_iterations,
      created_at: ts,
      updated_at: ts,
    };
  },
  update(
    db: DB,
    id: string,
    fields: Partial<
      Pick<
        AgentRun,
        'state' | 'status' | 'plan' | 'review' | 'fix_iteration' | 'message_id' | 'finished_at'
      >
    >,
  ) {
    const cur = this.get(db, id);
    if (!cur) return;
    db.prepare(
      `UPDATE agent_runs SET state = ?, status = ?, plan = ?, review = ?, fix_iteration = ?, message_id = ?, updated_at = ?, finished_at = ? WHERE id = ?`,
    ).run(
      fields.state ?? cur.state,
      fields.status ?? cur.status,
      fields.plan ?? cur.plan ?? null,
      fields.review ?? cur.review ?? null,
      fields.fix_iteration ?? cur.fix_iteration,
      fields.message_id ?? cur.message_id ?? null,
      nowIso(),
      fields.finished_at ?? cur.finished_at ?? null,
      id,
    );
  },
  delete(db: DB, id: string) {
    db.prepare(`DELETE FROM agent_runs WHERE id = ?`).run(id);
  },
};

// ---------- Agent Steps ----------

export const AgentStepsRepo = {
  listByRun(db: DB, runId: string): AgentStep[] {
    return db
      .prepare(
        `SELECT * FROM agent_steps WHERE agent_run_id = ? ORDER BY started_at ASC`,
      )
      .all(runId) as AgentStep[];
  },
  create(
    db: DB,
    agent_run_id: string,
    role: AgentRole,
    state: AgentState,
    title: string,
  ): AgentStep {
    const id = randomId('step');
    const ts = nowIso();
    db.prepare(
      `INSERT INTO agent_steps (id, agent_run_id, role, state, title, started_at, status) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, agent_run_id, role, state, title, ts, 'running');
    return {
      id,
      agent_run_id,
      role,
      state,
      title,
      started_at: ts,
      status: 'running',
    };
  },
  updateDetails(db: DB, id: string, details: string) {
    db.prepare(`UPDATE agent_steps SET details = ? WHERE id = ?`).run(details, id);
  },
  finish(db: DB, id: string, status: 'completed' | 'failed' = 'completed') {
    db.prepare(
      `UPDATE agent_steps SET status = ?, finished_at = ? WHERE id = ?`,
    ).run(status, nowIso(), id);
  },
};

// ---------- Tool Calls ----------

export const ToolCallsRepo = {
  listByRun(db: DB, runId: string): ToolCall[] {
    return db
      .prepare(
        `SELECT * FROM tool_calls WHERE agent_run_id = ? ORDER BY started_at ASC`,
      )
      .all(runId) as ToolCall[];
  },
  get(db: DB, id: string): ToolCall | undefined {
    return db.prepare(`SELECT * FROM tool_calls WHERE id = ?`).get(id) as
      | ToolCall
      | undefined;
  },
  create(
    db: DB,
    agent_run_id: string,
    agent_step_id: string | undefined,
    tool_name: string,
    args: any,
    approved: boolean | undefined,
  ): ToolCall {
    const id = randomId('tool');
    const ts = nowIso();
    db.prepare(
      `INSERT INTO tool_calls (id, agent_run_id, agent_step_id, tool_name, arguments, status, approved, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      agent_run_id,
      agent_step_id ?? null,
      tool_name,
      JSON.stringify(args),
      'pending',
      approved === undefined ? null : approved ? 1 : 0,
      ts,
    );
    return {
      id,
      agent_run_id,
      agent_step_id,
      tool_name: tool_name as any,
      arguments: JSON.stringify(args),
      status: 'pending',
      approved,
      started_at: ts,
    };
  },
  setStatus(
    db: DB,
    id: string,
    status: ToolCall['status'],
    extras: {
      result?: string;
      error?: string;
      duration_ms?: number;
    } = {},
  ) {
    db.prepare(
      `UPDATE tool_calls SET status = ?, result = COALESCE(?, result), error = COALESCE(?, error), duration_ms = COALESCE(?, duration_ms), finished_at = ? WHERE id = ?`,
    ).run(
      status,
      extras.result ?? null,
      extras.error ?? null,
      extras.duration_ms ?? null,
      nowIso(),
      id,
    );
  },
  setApproved(db: DB, id: string, approved: boolean) {
    db.prepare(`UPDATE tool_calls SET approved = ? WHERE id = ?`).run(
      approved ? 1 : 0,
      id,
    );
  },
  appendResult(db: DB, id: string, chunk: string) {
    const cur = this.get(db, id);
    if (!cur) return;
    const next = (cur.result ?? '') + chunk;
    db.prepare(`UPDATE tool_calls SET result = ? WHERE id = ?`).run(next, id);
  },
};

// ---------- Providers ----------

export const ProvidersRepo = {
  list(db: DB): ProviderSettings[] {
    return db
      .prepare(`SELECT * FROM provider_settings ORDER BY builtin DESC, name ASC`)
      .all() as ProviderSettings[];
  },
  get(db: DB, id: string): ProviderSettings | undefined {
    return db
      .prepare(`SELECT * FROM provider_settings WHERE id = ?`)
      .get(id) as ProviderSettings | undefined;
  },
  upsert(db: DB, p: Omit<ProviderSettings, 'created_at' | 'updated_at'> & { id?: string }) {
    const ts = nowIso();
    const existing = p.id ? this.get(db, p.id) : undefined;
    const id = p.id ?? randomId('prov');
    if (existing) {
      db.prepare(
        `UPDATE provider_settings SET name = ?, type = ?, base_url = ?, api_key = ?, model_id = ?, model_name = ?, chat_endpoint = ?, streaming = ?, auth_header = ?, custom_headers = ?, temperature = ?, max_tokens = ?, context_limit = ?, timeout = ?, builtin = ?, enabled = ?, updated_at = ? WHERE id = ?`,
      ).run(
        p.name,
        p.type,
        p.base_url,
        p.api_key ?? null,
        p.model_id,
        p.model_name,
        p.chat_endpoint ?? null,
        p.streaming ? 1 : 0,
        p.auth_header ?? null,
        p.custom_headers ?? null,
        p.temperature,
        p.max_tokens,
        p.context_limit,
        p.timeout,
        p.builtin ? 1 : 0,
        p.enabled ? 1 : 0,
        ts,
        id,
      );
      return { ...existing, ...p, updated_at: ts } as ProviderSettings;
    } else {
      db.prepare(
        `INSERT INTO provider_settings (id, name, type, base_url, api_key, model_id, model_name, chat_endpoint, streaming, auth_header, custom_headers, temperature, max_tokens, context_limit, timeout, builtin, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        p.name,
        p.type,
        p.base_url,
        p.api_key ?? null,
        p.model_id,
        p.model_name,
        p.chat_endpoint ?? null,
        p.streaming ? 1 : 0,
        p.auth_header ?? null,
        p.custom_headers ?? null,
        p.temperature,
        p.max_tokens,
        p.context_limit,
        p.timeout,
        p.builtin ? 1 : 0,
        p.enabled ? 1 : 0,
        ts,
        ts,
      );
      return {
        ...p,
        id,
        created_at: ts,
        updated_at: ts,
      } as ProviderSettings;
    }
  },
  delete(db: DB, id: string) {
    db.prepare(`DELETE FROM provider_settings WHERE id = ?`).run(id);
  },
  setEnabled(db: DB, id: string, enabled: boolean) {
    db.prepare(
      `UPDATE provider_settings SET enabled = ?, updated_at = ? WHERE id = ?`,
    ).run(enabled ? 1 : 0, nowIso(), id);
  },
};

// ---------- Model Settings ----------

export const ModelsRepo = {
  list(db: DB): ModelSettings[] {
    return db.prepare(`SELECT * FROM model_settings`).all() as ModelSettings[];
  },
  get(db: DB, role: string): ModelSettings | undefined {
    return db
      .prepare(`SELECT * FROM model_settings WHERE role = ?`)
      .get(role) as ModelSettings | undefined;
  },
  upsert(db: DB, m: ModelSettings) {
    db.prepare(
      `INSERT INTO model_settings (role, provider_id, model_id, temperature, max_tokens, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(role) DO UPDATE SET provider_id = excluded.provider_id, model_id = excluded.model_id, temperature = excluded.temperature, max_tokens = excluded.max_tokens, updated_at = excluded.updated_at`,
    ).run(
      m.role,
      m.provider_id,
      m.model_id,
      m.temperature,
      m.max_tokens,
      nowIso(),
    );
  },
};

// ---------- App Settings (generic key-value JSON) ----------

export const AppSettingsRepo = {
  get(db: DB, key: string): any {
    const row = db
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(key) as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  },
  set(db: DB, key: string, value: any) {
    db.prepare(
      `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    ).run(key, JSON.stringify(value), nowIso());
  },
};

export function defaultAppSettings(): AppSettings {
  return {
    general: {
      workspace_root: process.cwd(),
      default_shell: '/bin/bash',
      shell_timeout: 60000,
      log_level: 'info',
    } as GeneralSettings,
    agent: {
      autonomous_mode: false,
      max_fix_iterations: 5,
      shell_approval: 'dangerous',
      automatic_tests: true,
      review_before_completion: true,
      max_agent_steps: 40,
    } as AgentSettings,
    appearance: {
      background_type: 'image',
      background_image_url:
        'https://image.slidesdocs.com/responsive-images/background/creative-computer-business-black-technology-light-effect-powerpoint-background_3107e2a67a__960_540.jpg',
      background_color: '#000000',
      border_radius: 5,
      primary_color: '#ffffff',
      text_color: '#ffffff',
      muted_color: '#9ca3af',
      border_color: '#1f2937',
      overlay_opacity: 0.55,
    } as AppearanceSettings,
    tools: {
      enable_write_file: true,
      enable_edit_file: true,
      enable_shell: true,
      enable_read_file: true,
      enable_list_files: true,
      enable_search_code: true,
    } as ToolsSettings,
    api: {
      host: '0.0.0.0',
      port: 8080,
      cors_origins: '*',
    } as APISettings,
    database: {
      path: './data/ks-agent.db',
      backup_enabled: false,
    } as DatabaseSettings,
  };
}

export function loadAppSettings(db: DB): AppSettings {
  const def = defaultAppSettings();
  const stored = AppSettingsRepo.get(db, 'app_settings');
  if (!stored) return def;
  return {
    general: { ...def.general, ...(stored.general ?? {}) },
    agent: { ...def.agent, ...(stored.agent ?? {}) },
    appearance: { ...def.appearance, ...(stored.appearance ?? {}) },
    tools: { ...def.tools, ...(stored.tools ?? {}) },
    api: { ...def.api, ...(stored.api ?? {}) },
    database: { ...def.database, ...(stored.database ?? {}) },
  };
}

export function saveAppSettings(db: DB, s: AppSettings) {
  AppSettingsRepo.set(db, 'app_settings', s);
}
