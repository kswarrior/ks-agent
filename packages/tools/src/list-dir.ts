import { readdir } from 'fs/promises';
import { resolve, sep } from 'path';

export interface ListDirToolConfig {
  projectRoot: string;
}

export interface ListDirResult {
  success: boolean;
  path: string;
  entries: Array<{ name: string; path: string; type: 'file' | 'directory'; size?: number }>;
  error?: string;
}

export class ListDirTool {
  private config: ListDirToolConfig;

  constructor(config: ListDirToolConfig) {
    this.config = config;
  }

  async execute(dir: string = '.'): Promise<ListDirResult> {
    try {
      const resolvedDir = this.resolvePath(dir);
      const entries = await readdir(resolvedDir, { withFileTypes: true });
      const root = resolve(this.config.projectRoot);

      const result = entries
        .filter(e => !['node_modules', '.git', 'dist', 'build', '.next', '.DS_Store'].includes(e.name))
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
          return a.name.localeCompare(b.name);
        })
        .map(e => ({
          name: e.name,
          path: e.isDirectory() ? resolve(resolvedDir, e.name) + '/' : resolve(resolvedDir, e.name),
          type: e.isDirectory() ? ('directory' as const) : ('file' as const)
        }))
        .map(e => ({
          ...e,
          path: e.path.replace(root + sep, '').replace(root, '.')
        }));

      return { success: true, path: dir, entries: result };
    } catch (err) {
      return { success: false, path: dir, entries: [], error: (err as Error).message };
    }
  }

  private resolvePath(path: string): string {
    const resolved = resolve(this.config.projectRoot, path);
    const root = resolve(this.config.projectRoot);
    
    if (!resolved.startsWith(root + sep) && resolved !== root) {
      throw new Error(`Path traversal attempted: ${path}`);
    }
    
    return resolved;
  }
}