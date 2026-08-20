import { ToolDefinition } from '@ks-agent/types';

export type ToolName = 'write_file' | 'edit_file' | 'shell';

export interface ToolHandler {
  name: string;
  description: string;
  parameters: ToolDefinition['function']['parameters'];
  execute(args: Record<string, unknown>): Promise<{ success: boolean; output?: unknown; error?: string; duration?: number }>;
  isDangerous(args: Record<string, unknown>): { dangerous: boolean; reason?: string };
}

export class ToolRegistry {
  private tools: Map<string, ToolHandler> = new Map();

  register(tool: ToolHandler): void {
    this.tools.set(tool.name, tool);
  }

  unregister(name: string): void {
    this.tools.delete(name);
  }

  get(name: string): ToolHandler | undefined {
    return this.tools.get(name);
  }

  getAll(): ToolHandler[] {
    return Array.from(this.tools.values());
  }

  getToolDefinitions(): ToolDefinition[] {
    return this.getAll().map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export class ToolExecutor {
  private registry: ToolRegistry;

  constructor(registry: ToolRegistry) {
    this.registry = registry;
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    onRequireApproval?: (toolName: string, args: Record<string, unknown>) => Promise<boolean>
  ): Promise<{ success: boolean; output?: unknown; error?: string; duration?: number }> {
    const tool = this.registry.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    const danger = tool.isDangerous(args);
    if (danger.dangerous && onRequireApproval) {
      const approved = await onRequireApproval(name, args);
      if (!approved) {
        return { success: false, error: `Tool execution denied by user: ${danger.reason || 'dangerous operation'}` };
      }
    }

    const startTime = Date.now();

    try {
      const result = await tool.execute(args);
      return {
        ...result,
        duration: result.duration ?? Date.now() - startTime
      };
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
        duration: Date.now() - startTime
      };
    }
  }
}