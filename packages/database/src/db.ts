import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { logger } from '@ks-agent/shared';
import { runMigrations } from './migrations';

export type DB = Database.Database;

let dbInstance: DB | null = null;

export interface DBOptions {
  path: string;
}

export function openDatabase(opts: DBOptions): DB {
  if (dbInstance) return dbInstance;
  const dir = path.dirname(opts.path);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(opts.path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');
  runMigrations(db);
  logger.info(`Database opened at ${opts.path}`, undefined, 'db');
  dbInstance = db;
  return db;
}

export function getDatabase(): DB {
  if (!dbInstance) throw new Error('Database not initialized');
  return dbInstance;
}

export function closeDatabase() {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
