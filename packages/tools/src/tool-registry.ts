import {
  ToolCall,
  ToolDefinition,
  ToolDefinitionLite,
  ToolName,
} from '@ks-agent/types';
import { logger } from '@ks-agent/shared';
import { ShellRunner, isDangerous, ShellResult, truncate } from './shell';
import {
  writeFileTool,
  editFileTool,
  readFileTool,
  listFilesTool,
  searchCodeTool,
  TOOL_DEFINITIONS,
  FileToolResult,
} from './file-tools';
import { AppSettings } from '@ks-agent/types';

export interface ToolContext {
  rootDir: string;
  agentRunId: string;
  settings: AppSettings;
  onToolUpdate: (call: Partial<ToolCall> & { id: string }) => void;
  onOutput?: (toolCallId: string, chunk: string) => void;
  requestApproval?: (
    toolName: ToolName,
    args: any,
  ) => Promise<boolean>;
}

export interface ToolInvocation {
  toolName: ToolName;
  args: any;
}

export async function executeTool(
  ctx: ToolContext,
  invocation: ToolInvocation,
): Promise<{ result: FileToolResult | ShellResult; raw: string; error?: string }> {
  const { toolName, args } = invocation;

  const isShell = toolName === 'shell';
  const isFileWrite = toolName === 'write_file' || toolName === 'edit_file';

  if (isShell && ctx.settings.tools.enable_shell === false) {
    throw new Error('Shell tool is disabled in settings');
  }
  if (toolName === 'write_file' && ctx.settings.tools.enable_write_file === false) {
    throw new Error('write_file tool is disabled in settings');
  }
  if (toolName === 'edit_file' && ctx.settings.tools.enable_edit_file === false) {
    throw new Error('edit_file tool is disabled in settings');
  }
  if (toolName === 'read_file' && ctx.settings.tools.enable_read_file === false) {
    throw new Error('read_file tool is disabled in settings');
  }
  if (toolName === 'list_files' && ctx.settings.tools.enable_list_files === false) {
    throw new Error('list_files tool is disabled in settings');
  }
  if (toolName === 'search_code' && ctx.settings.tools.enable_search_code === false) {
    throw new Error('search_code tool is disabled in settings');
  }

  // Permission checks
  if (ctx.requestApproval) {
    let needsApproval = false;
    if (isShell) {
      const approvalMode = ctx.settings.agent.shell_approval;
      if (approvalMode === 'always') needsApproval = true;
      else if (approvalMode === 'dangerous') {
        const dangerous = isDangerous(String(args?.command ?? ''));
        if (dangerous) needsApproval = true;
      }
    } else if (isFileWrite) {
      if (!ctx.settings.agent.autonomous_mode) needsApproval = true;
    }
    if (needsApproval) {
      const ok = await ctx.requestApproval(toolName, args);
      if (!ok) {
        throw new Error('User denied tool execution');
      }
    }
  }

  switch (toolName) {
    case 'write_file': {
      const r = await writeFileTool(ctx.rootDir, args);
      if (!r.ok) throw new Error(r.error || 'write_file failed');
      return { result: r, raw: r.output + (r.diff ? `\n\n${r.diff}` : '') };
    }
    case 'edit_file': {
      const r = await editFileTool(ctx.rootDir, args);
      if (!r.ok) throw new Error(r.error || 'edit_file failed');
      return { result: r, raw: r.output + (r.diff ? `\n\n${r.diff}` : '') };
    }
    case 'read_file': {
      const r = await readFileTool(ctx.rootDir, args);
      if (!r.ok) throw new Error(r.error || 'read_file failed');
      return { result: r, raw: r.output };
    }
    case 'list_files': {
      const r = await listFilesTool(ctx.rootDir, args);
      if (!r.ok) throw new Error(r.error || 'list_files failed');
      return { result: r, raw: r.output };
    }
    case 'search_code': {
      const r = await searchCodeTool(ctx.rootDir, args);
      if (!r.ok) throw new Error(r.error || 'search_code failed');
      return { result: r, raw: r.output };
    }
    case 'shell': {
      const command = String(args?.command ?? '');
      const timeoutMs = Math.min(
        Math.max(Number(args?.timeout_ms ?? ctx.settings.general.shell_timeout), 1000),
        30 * 60 * 1000,
      );
      const maxOutput = Number(args?.max_output_bytes ?? 200_000);
      const runner = new ShellRunner();
      const shellRes = await runner.run({
        cwd: ctx.rootDir,
        command,
        timeoutMs,
        maxOutputBytes: maxOutput,
        onOutput: (chunk) => {
          ctx.onOutput?.('__pending__', chunk);
        },
      });
      const out = [
        `$ ${command}`,
        `[exit=${shellRes.exitCode}${shellRes.signal ? ` signal=${shellRes.signal}` : ''}${shellRes.timedOut ? ' timedOut=true' : ''}${shellRes.truncated ? ' truncated=true' : ''}]`,
        '--- stdout ---',
        truncate(shellRes.stdout, maxOutput),
        '--- stderr ---',
        truncate(shellRes.stderr, maxOutput),
      ].join('\n');
      return { result: shellRes, raw: out };
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

export function getToolDefinitions(): ToolDefinitionLite[] {
  return TOOL_DEFINITIONS;
}

export function toolsAsOpenAITools(): ToolDefinition[] {
  return TOOL_DEFINITIONS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}
