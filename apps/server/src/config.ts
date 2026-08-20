import dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config();

export interface ServerConfig {
  port: number;
  host: string;
  databasePath: string;
  nvidiaApiKey: string | null;
  workspaceRoot: string;
}

const workspaceRoot = resolve(process.cwd());

const config: ServerConfig = {
  port: parseInt(process.env.PORT || '8080', 10),
  host: process.env.HOST || '0.0.0.0',
  databasePath: resolve(process.env.DATABASE_PATH || resolve(workspaceRoot, 'data', 'ks-agent.db')),
  nvidiaApiKey: process.env.NVIDIA_API_KEY || null,
  workspaceRoot
};

export function getDatabasePath(): string {
  return config.databasePath;
}

export default config;