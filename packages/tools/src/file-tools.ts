import {
  promises as fs,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
} from 'fs';
import * as path from 'path';
import { ensureWithinRoot, safeResolve, computeDiff, formatUnifiedDiff } from '@ks-agent/shared';
import { ToolDefinitionLite } from '@ks-agent/types';

export interface FileToolResult {
  ok: boolean;
  output: string;
  error?: string;
  diff?: string;
}

function fileToolDef(name: string, description: string, parameters: Record<string, any>): ToolDefinitionLite {
  return { name: name as any, description, parameters };
}

export const TOOL_DEFINITIONS: ToolDefinitionLite[] = [
  fileToolDef(
    'write_file',
    'Create or overwrite a file with the given content. Path must be inside the project root.',
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path from project root' },
        content: { type: 'string', description: 'Full file content to write' },
      },
      required: ['path', 'content'],
    },
  ),
  fileToolDef(
    'edit_file',
    'Replace a unique occurrence of old_text in a file with new_text. Fails if old_text is not found or appears more than once unless replace_all=true.',
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path from project root' },
        old_text: { type: 'string', description: 'Exact text to find' },
        new_text: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  ),
  fileToolDef(
    'shell',
    'Execute a shell command in the project root (build, install dependencies, run tests). Has a timeout and output limits.',
    {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        timeout_ms: { type: 'integer', description: 'Optional timeout in milliseconds' },
      },
      required: ['command'],
    },
  ),
  fileToolDef(
    'read_file',
    'Read the contents of a file. Path must be inside the project root.',
    {
      type: 'object',
      properties: {
        path: { type: 'string' },
        start_line: { type: 'integer', description: '0-based start line' },
        end_line: { type: 'integer', description: '0-based exclusive end line' },
      },
      required: ['path'],
    },
  ),
  fileToolDef(
    'list_files',
    'List files and directories inside a path. Path must be inside the project root.',
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Relative path (default ".")' },
        recursive: { type: 'boolean', description: 'List recursively' },
        max_depth: { type: 'integer', description: 'Maximum recursion depth' },
        ignore: {
          type: 'array',
          items: { type: 'string' },
          description: 'Directory/file name patterns to ignore',
        },
      },
    },
  ),
  fileToolDef(
    'search_code',
    'Search for a regex pattern in text files inside the project.',
    {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern' },
        path: { type: 'string', description: 'Relative path (default ".")' },
        include: { type: 'string', description: 'File extension filter e.g. ".ts"' },
        max_results: { type: 'integer', description: 'Max number of matches' },
      },
      required: ['pattern'],
    },
  ),
];

export interface WriteFileArgs {
  path: string;
  content: string;
}

export async function writeFileTool(
  rootDir: string,
  args: WriteFileArgs,
): Promise<FileToolResult> {
  const safe = safeResolve(rootDir, args.path);
  if (!safe.safe) {
    return { ok: false, output: '', error: safe.reason ?? 'Unsafe path' };
  }
  const abs = safe.resolved;
  try {
    const dir = path.dirname(abs);
    await fs.mkdir(dir, { recursive: true });
    let before = '';
    let had = false;
    try {
      before = await fs.readFile(abs, 'utf8');
      had = true;
    } catch (_e) {
      had = false;
    }
    await fs.writeFile(abs, args.content, 'utf8');
    const diff = computeDiff(before, args.content);
    return {
      ok: true,
      output: had
        ? `Updated ${args.path} (+${diff.added}/-${diff.removed})`
        : `Created ${args.path} (${args.content.length} bytes)`,
      diff: formatUnifiedDiff(args.path, diff),
    };
  } catch (e: any) {
    return { ok: false, output: '', error: e?.message ?? String(e) };
  }
}

export interface EditFileArgs {
  path: string;
  old_text: string;
  new_text: string;
  replace_all?: boolean;
}

export async function editFileTool(
  rootDir: string,
  args: EditFileArgs,
): Promise<FileToolResult> {
  const safe = safeResolve(rootDir, args.path);
  if (!safe.safe) {
    return { ok: false, output: '', error: safe.reason ?? 'Unsafe path' };
  }
  const abs = safe.resolved;
  let before: string;
  try {
    before = await fs.readFile(abs, 'utf8');
  } catch (e: any) {
    return { ok: false, output: '', error: `Cannot read file: ${e?.message ?? String(e)}` };
  }
  if (args.old_text === '') {
    // Treat as prepend
    const after = args.new_text + before;
    await fs.writeFile(abs, after, 'utf8');
    const diff = computeDiff(before, after);
    return {
      ok: true,
      output: `Prepended content to ${args.path}`,
      diff: formatUnifiedDiff(args.path, diff),
    };
  }
  const occurrences = before.split(args.old_text).length - 1;
  if (occurrences === 0) {
    return { ok: false, output: '', error: `old_text not found in ${args.path}` };
  }
  if (occurrences > 1 && !args.replace_all) {
    return {
      ok: false,
      output: '',
      error: `old_text appears ${occurrences} times in ${args.path}. Use replace_all=true or provide more context.`,
    };
  }
  const after = args.replace_all
    ? before.split(args.old_text).join(args.new_text)
    : before.replace(args.old_text, args.new_text);
  await fs.writeFile(abs, after, 'utf8');
  const diff = computeDiff(before, after);
  return {
    ok: true,
    output: `Edited ${args.path} (+${diff.added}/-${diff.removed})`,
    diff: formatUnifiedDiff(args.path, diff),
  };
}

export interface ReadFileArgs {
  path: string;
  start_line?: number;
  end_line?: number;
}

export async function readFileTool(
  rootDir: string,
  args: ReadFileArgs,
): Promise<FileToolResult> {
  const safe = safeResolve(rootDir, args.path);
  if (!safe.safe) {
    return { ok: false, output: '', error: safe.reason ?? 'Unsafe path' };
  }
  const abs = safe.resolved;
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) {
      return { ok: false, output: '', error: `Not a file: ${args.path}` };
    }
    if (stat.size > 1_500_000) {
      return { ok: false, output: '', error: `File too large (${stat.size} bytes)` };
    }
    const text = await fs.readFile(abs, 'utf8');
    const lines = text.split(/\r?\n/);
    const start = args.start_line ?? 0;
    const end = args.end_line ?? lines.length;
    const sliced = lines.slice(start, end);
    const numbered = sliced.map((l, i) => `${(start + i + 1).toString().padStart(4)} | ${l}`);
    return {
      ok: true,
      output: numbered.join('\n'),
    };
  } catch (e: any) {
    return { ok: false, output: '', error: e?.message ?? String(e) };
  }
}

export interface ListFilesArgs {
  path?: string;
  recursive?: boolean;
  max_depth?: number;
  ignore?: string[];
}

const DEFAULT_IGNORE = ['node_modules', '.git', 'dist', 'build', '.cache', '.next'];

export async function listFilesTool(
  rootDir: string,
  args: ListFilesArgs,
): Promise<FileToolResult> {
  const target = args.path ?? '.';
  const safe = safeResolve(rootDir, target);
  if (!safe.safe) {
    return { ok: false, output: '', error: safe.reason ?? 'Unsafe path' };
  }
  const ignore = new Set([...DEFAULT_IGNORE, ...(args.ignore ?? [])]);
  const maxDepth = args.recursive ? args.max_depth ?? 5 : 0;

  const lines: string[] = [];
  const walk = (dir: string, depth: number, prefix: string) => {
    let entries: any[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as any;
    } catch (_e) {
      return;
    }
    entries.sort((a: any, b: any) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const entry of entries) {
      if (ignore.has(entry.name)) continue;
      const type = entry.isDirectory() ? 'DIR ' : 'FILE';
      lines.push(`${prefix}${type} ${entry.name}`);
      if (entry.isDirectory() && depth < maxDepth) {
        walk(path.join(dir, entry.name), depth + 1, prefix + '  ');
      }
    }
  };

  try {
    const stat = statSync(safe.resolved);
    if (!stat.isDirectory()) {
      return { ok: true, output: `FILE ${path.basename(safe.resolved)}` };
    }
  } catch (e: any) {
    return { ok: false, output: '', error: e?.message ?? String(e) };
  }

  walk(safe.resolved, 0, '');
  return { ok: true, output: lines.join('\n') || '(empty)' };
}

export interface SearchCodeArgs {
  pattern: string;
  path?: string;
  include?: string;
  max_results?: number;
}

export async function searchCodeTool(
  rootDir: string,
  args: SearchCodeArgs,
): Promise<FileToolResult> {
  const target = args.path ?? '.';
  const safe = safeResolve(rootDir, target);
  if (!safe.safe) {
    return { ok: false, output: '', error: safe.reason ?? 'Unsafe path' };
  }
  let regex: RegExp;
  try {
    // No 'g' flag: lastIndex state from .test() can skip matches; we test
    // every line independently.
    regex = new RegExp(args.pattern, 'm');
  } catch (e: any) {
    return { ok: false, output: '', error: `Invalid regex: ${e?.message ?? String(e)}` };
  }
  const includeExt = args.include?.startsWith('.') ? args.include : args.include ? `.${args.include}` : null;
  const max = args.max_results ?? 100;
  const ignore = new Set(['node_modules', '.git', 'dist', 'build']);
  const matches: string[] = [];

  const walk = (dir: string) => {
    let entries: any[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as any;
    } catch (_e) {
      return;
    }
    for (const entry of entries) {
      if (matches.length >= max) return;
      if (ignore.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (includeExt && !entry.name.endsWith(includeExt)) continue;
      let stat;
      try {
        stat = statSync(full);
      } catch (_e) {
        continue;
      }
      if (stat.size > 1_500_000) continue;
      let text: string;
      try {
        text = readFileSync(full, 'utf8');
      } catch (_e) {
        continue;
      }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (matches.length >= max) return;
        regex.lastIndex = 0;
        if (regex.test(lines[i])) {
          const rel = path.relative(rootDir, full);
          matches.push(`${rel}:${i + 1}:${lines[i]}`);
        }
      }
    }
  };
  walk(safe.resolved);
  return { ok: true, output: matches.join('\n') || '(no matches)' };
}
