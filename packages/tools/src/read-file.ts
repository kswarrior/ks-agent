import { readFile, stat } from 'fs/promises';
import { resolve, sep } from 'path';

export interface ReadFileToolConfig {
  projectRoot: string;
}

export interface ReadFileResult {
  success: boolean;
  path: string;
  content?: string;
  lines?: number;
  bytes?: number;
  truncated?: boolean;
  error?: string;
}

export class ReadFileTool {
  private config: ReadFileToolConfig;

  constructor(config: ReadFileToolConfig) {
    this.config = config;
  }

  async execute(path: string, options?: { offset?: number; limit?: number; maxBytes?: number }): Promise<ReadFileResult> {
    try {
      const resolvedPath = this.resolvePath(path);
      const stats = await stat(resolvedPath);

      if (stats.isDirectory()) {
        return {
          success: false,
          path,
          error: `Path is a directory, not a file: ${path}. Use list_dir to inspect directories.`
        };
      }

      const maxBytes = options?.maxBytes ?? 100000;
      const offset = options?.offset ?? 0;
      const limit = options?.limit;

      let content: string;
      let truncated = false;

      if (stats.size > maxBytes) {
        const buf = Buffer.alloc(maxBytes);
        const fd = await (await import('fs/promises')).open(resolvedPath, 'r');
        try {
          await fd.read(buf, 0, maxBytes, 0);
        } finally {
          await fd.close();
        }
        content = buf.toString('utf8');
        truncated = true;
      } else {
        content = await readFile(resolvedPath, 'utf8');
      }

      if (offset > 0 && offset < content.length) {
        let charOffset = offset;
        while (charOffset < content.length && content[charOffset] !== '\n') {
          charOffset++;
        }
        content = '\n... (reading from byte offset ' + offset + ') ...\n' + content.slice(charOffset + 1 || offset);
        truncated = true;
      }

      if (limit && limit > 0) {
        const lines = content.split('\n');
        if (lines.length > limit) {
          content = lines.slice(0, limit).join('\n') + `\n... (${lines.length - limit} more lines)`;
          truncated = true;
        }
      }

      const lineCount = content.split('\n').length;

      return {
        success: true,
        path,
        content,
        lines: lineCount,
        bytes: Buffer.byteLength(content),
        truncated
      };
    } catch (err) {
      return {
        success: false,
        path,
        error: (err as Error).message
      };
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