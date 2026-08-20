import { readFile, writeFile } from 'fs/promises';
import { resolve, sep } from 'path';
import { FileOperationResult } from '@ks-agent/types';

export interface EditFileToolConfig {
  projectRoot: string;
}

export class EditFileTool {
  private config: EditFileToolConfig;

  constructor(config: EditFileToolConfig) {
    this.config = config;
  }

  async execute(path: string, oldText: string, newText: string): Promise<FileOperationResult> {
    try {
      const resolvedPath = this.resolvePath(path);
      let content: string;

      try {
        content = await readFile(resolvedPath, 'utf8');
      } catch {
        return {
          success: false,
          path,
          error: `File does not exist: ${path}`
        };
      }

      const occurrences = this.countOccurrences(content, oldText);

      if (occurrences === 0) {
        return {
          success: false,
          path,
          error: `Text not found in file. Expected exact text:\n${this.preview(oldText)}`
        };
      }

      if (occurrences > 1) {
        return {
          success: false,
          path,
          error: `Text found ${occurrences} times in file. Ambiguous edit, provide more context to make the match unique.`
        };
      }

      const newContent = content.replace(oldText, newText);
      await writeFile(resolvedPath, newContent, 'utf8');

      return {
        success: true,
        path: resolvedPath,
        diff: this.createDiff(path, oldText, newText)
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

  private countOccurrences(content: string, searchText: string): number {
    if (searchText === '') return 0;
    let count = 0;
    let index = 0;
    while ((index = content.indexOf(searchText, index)) !== -1) {
      count++;
      index += searchText.length;
    }
    return count;
  }

  private preview(text: string): string {
    const lines = text.split('\n');
    const previewLines = lines.slice(0, 15);
    if (lines.length > 15) {
      previewLines.push(`... (${lines.length - 15} more lines)`);
    }
    return previewLines.map(line => `  ${line}`).join('\n');
  }

  private createDiff(path: string, oldText: string, newText: string): string {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    const lines: string[] = [
      `--- a/${path}`,
      `+++ b/${path}`,
      `@@`
    ];
    
    const maxLen = Math.min(30, Math.max(oldLines.length, newLines.length));
    for (let i = 0; i < maxLen; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      
      if (oldLine !== newLine) {
        if (oldLine !== undefined) lines.push(`-${oldLine}`);
        if (newLine !== undefined) lines.push(`+${newLine}`);
      } else {
        lines.push(` ${oldLine}`);
      }
    }
    
    return lines.join('\n');
  }
}