import { DB } from './db';

const MIGRATIONS: { id: string; up: (db: DB) => void }[] = [
  {
    id: '001_init',
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          root_directory TEXT NOT NULL,
          settings TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chats (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_chats_project ON chats(project_id);

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          agent_run_id TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id);

        CREATE TABLE IF NOT EXISTS agent_runs (
          id TEXT PRIMARY KEY,
          chat_id TEXT NOT NULL,
          message_id TEXT,
          state TEXT NOT NULL,
          status TEXT NOT NULL,
          prompt TEXT NOT NULL,
          plan TEXT,
          review TEXT,
          fix_iteration INTEGER NOT NULL DEFAULT 0,
          max_fix_iterations INTEGER NOT NULL DEFAULT 5,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          finished_at TEXT,
          FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_runs_chat ON agent_runs(chat_id);

        CREATE TABLE IF NOT EXISTS agent_steps (
          id TEXT PRIMARY KEY,
          agent_run_id TEXT NOT NULL,
          role TEXT NOT NULL,
          state TEXT NOT NULL,
          title TEXT NOT NULL,
          details TEXT,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          status TEXT NOT NULL,
          FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_steps_run ON agent_steps(agent_run_id);

        CREATE TABLE IF NOT EXISTS tool_calls (
          id TEXT PRIMARY KEY,
          agent_run_id TEXT NOT NULL,
          agent_step_id TEXT,
          tool_name TEXT NOT NULL,
          arguments TEXT NOT NULL,
          result TEXT,
          error TEXT,
          status TEXT NOT NULL,
          approved INTEGER,
          started_at TEXT NOT NULL,
          finished_at TEXT,
          duration_ms INTEGER,
          FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_tool_run ON tool_calls(agent_run_id);

        CREATE TABLE IF NOT EXISTS model_settings (
          role TEXT PRIMARY KEY,
          provider_id TEXT NOT NULL,
          model_id TEXT NOT NULL,
          temperature REAL NOT NULL DEFAULT 0.2,
          max_tokens INTEGER NOT NULL DEFAULT 4096,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS provider_settings (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          base_url TEXT NOT NULL,
          api_key TEXT,
          model_id TEXT NOT NULL,
          model_name TEXT NOT NULL,
          chat_endpoint TEXT,
          streaming INTEGER NOT NULL DEFAULT 1,
          auth_header TEXT,
          custom_headers TEXT,
          temperature REAL NOT NULL DEFAULT 0.2,
          max_tokens INTEGER NOT NULL DEFAULT 4096,
          context_limit INTEGER NOT NULL DEFAULT 32000,
          timeout INTEGER NOT NULL DEFAULT 120,
          builtin INTEGER NOT NULL DEFAULT 0,
          enabled INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
    },
  },
];

export function runMigrations(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set<string>(
    (db.prepare(`SELECT id FROM _migrations`).all() as { id: string }[]).map(
      (r) => r.id,
    ),
  );

  const insertMigration = db.prepare(
    `INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`,
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    const tx = db.transaction(() => {
      migration.up(db);
      insertMigration.run(migration.id, new Date().toISOString());
    });
    tx();
  }
}
