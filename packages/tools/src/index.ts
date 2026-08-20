import { ToolRegistry, ToolExecutor, ToolHandler } from './registry';
import { WriteFileTool } from './write-file';
import { EditFileTool } from './edit-file';
import { ShellTool } from './shell';
import { ReadFileTool } from './read-file';
import { ListDirTool } from './list-dir';
import type { FileOperationResult, ShellResult } from '@ks-agent/types';

export function createToolsRegistry(config: { projectRoot: string }): ToolRegistry {
  const registry = new ToolRegistry();
  
  const writeTool = new WriteFileTool({ projectRoot: config.projectRoot });
  const editTool = new EditFileTool({ projectRoot: config.projectRoot });
  const shellTool = new ShellTool({ cwd: config.projectRoot });
  const readTool = new ReadFileTool({ projectRoot: config.projectRoot });
  const listDirTool = new ListDirTool({ projectRoot: config.projectRoot });

  registry.register({
    name: 'read_file',
    description: 'Read the contents of a file within the project. Use this to inspect code before editing. Supports optional offset (byte offset to resume from) and limit (max lines to return).',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file relative to project root' },
        offset: { type: 'number', description: 'Byte offset to start reading from (for large files, resume where previous read stopped)' },
        limit: { type: 'number', description: 'Maximum number of lines to return' }
      },
      required: ['path']
    },
    async execute(args) {
      const path = args.path as string;
      if (!path) return { success: false, error: 'read_file requires a path' };
      const result = await readTool.execute(path, {
        offset: typeof args.offset === 'number' ? args.offset : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined
      });
      return { success: result.success, output: result, error: result.error };
    },
    isDangerous() {
      return { dangerous: false };
    }
  });

  registry.register({
    name: 'list_dir',
    description: 'List files and directories in a directory within the project. Use to discover project structure before reading files.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path relative to project root. Defaults to project root.' }
      },
      required: []
    },
    async execute(args) {
      const path = (args.path as string) || '.';
      const result = await listDirTool.execute(path);
      return { success: result.success, output: result, error: result.error };
    },
    isDangerous() {
      return { dangerous: false };
    }
  });

  registry.register({
    name: 'write_file',
    description: 'Write content to a file. Creates the file if it does not exist. Parent directories are created automatically. Use for new files or complete rewrites.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file relative to project root' },
        content: { type: 'string', description: 'Full content to write' }
      },
      required: ['path', 'content']
    },
    async execute(args) {
      const path = args.path as string;
      const content = args.content as string;
      if (!path || typeof content !== 'string') {
        return { success: false, error: 'write_file requires path (string) and content (string)' };
      }
      const result = await writeTool.execute(path, content);
      return { success: result.success, output: result, error: result.error };
    },
    isDangerous() {
      return { dangerous: false };
    }
  });

  registry.register({
    name: 'edit_file',
    description: 'Edit an existing file by replacing an exact text match. Use when you need to make a precise change without rewriting the whole file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the file relative to project root' },
        old_text: { type: 'string', description: 'The exact text to find. Must appear exactly once in the file.' },
        new_text: { type: 'string', description: 'The replacement text' }
      },
      required: ['path', 'old_text', 'new_text']
    },
    async execute(args) {
      const path = args.path as string;
      const oldText = args.old_text as string;
      const newText = args.new_text as string;
      
      if (!path || typeof oldText !== 'string' || typeof newText !== 'string') {
        return { success: false, error: 'edit_file requires path, old_text, and new_text as strings' };
      }
      
      const result = await editTool.execute(path, oldText, newText);
      return { success: result.success, output: result, error: result.error };
    },
    isDangerous() {
      return { dangerous: false };
    }
  });

  registry.register({
    name: 'shell',
    description: 'Execute a shell command in the project directory. Use for running tests, builds, installing dependencies, and inspecting project state.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default 120000)' }
      },
      required: ['command']
    },
    async execute(args) {
      const command = args.command as string;
      if (typeof command !== 'string' || !command.trim()) {
        return { success: false, error: 'shell requires a command string' };
      }
      
      const timeout = typeof args.timeout === 'number' ? args.timeout : 120000;
      const result: ShellResult = await shellTool.execute(command.trim());
      
      const success = result.exitCode === 0;
      return {
        success,
        output: result,
        error: success ? undefined : `Command exited with code ${result.exitCode}`
      };
    },
    isDangerous(args) {
      const command = String(args.command || '');
      // Check for dangerous patterns
      if (/rm\s+-rf\s+/i.test(command) && !/node_modules|dist|build|\.git/i.test(command)) {
        return { dangerous: true, reason: 'Recursive delete of non-standard directory' };
      }
      if (/^sudo\b/i.test(command)) return { dangerous: true, reason: 'Sudo command' };
      if (/^git\s+(push|reset\s+--hard|checkout)/i.test(command)) return { dangerous: true, reason: 'Destructive git operation' };
      if (/dd\s+if=/i.test(command)) return { dangerous: true, reason: 'Disk operation command' };
      if (/mkfs/i.test(command)) return { dangerous: true, reason: 'Filesystem creation command' };
      return { dangerous: false };
    }
  });

  return registry;
}

export { ToolRegistry, ToolExecutor };
export type { ToolHandler };
export type { FileOperationResult, ShellResult };