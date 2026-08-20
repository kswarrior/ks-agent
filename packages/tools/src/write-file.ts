import { writeFile, mkdir } from 'fs/promises';
import { dirname, resolve, join, sep } from 'path';
import { FileOperationResult } from '@ks-agent/types';

export interface FileToolConfig {
  projectRoot: string;
}

export class WriteFileTool {
  private config: FileToolConfig;

  constructor(config: FileToolConfig) {
    this.config = config;
  }

  async execute(path: string, content: string): Promise<FileOperationResult> {
    try {
      const resolvedPath = this.resolvePath(path);

      // Create missing directories
      const dir = dirname(resolvedPath);
      await mkdir(dir, { recursive: true });

      await writeFile(resolvedPath, content, 'utf8');

      return {
        success: true,
        path: resolvedPath,
        diff: this.createWriteDiff(resolvedPath, content)
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

  private createWriteDiff(path: string, content: string): string {
    const lines = content.split('\n');
    const typedLines = lines.map((line, i) => `+${i < 10 ? ` ${line}` : ` ${line}`}`);
    
    return [
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@ -0,0 +1,${lines.length} @@`,
      ...typedLines
    ].join('\n');
  }
}