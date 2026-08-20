import { AgentRole, AgentState } from '@ks-agent/types';
import { DatabaseService } from '@ks-agent/database';

export interface AgentRunRecord {
  id: string;
  chatId: string;
  projectId: string;
  status: string;
  currentState: AgentState;
  input: string;
}

export interface AgentStepRecord {
  id?: string;
  runId: string;
  agentRole: AgentRole;
  model: string;
  status: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

export interface ToolCallRecord {
  stepId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  status: string;
}

export interface AgentRunStore {
  createStep(step: AgentStepRecord): string;
  updateStepStatus(id: string, status: 'running' | 'completed' | 'failed', output?: string): void;
  createToolCall(call: ToolCallRecord): string;
  updateToolCallResult(id: string, result: Record<string, unknown>, status: string): void;
  createMessage(message: { chatId: string; role: string; content: string; agentRole?: AgentRole; model?: string }): string;
  getMessages(chatId: string): Array<{ role: string; content: string }>;
  updateRunStatus(runId: string, status: string, state: AgentState): void;
}

export class SqliteAgentRunStore implements AgentRunStore {
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
  }

  createStep(step: AgentStepRecord): string {
    return this.db.createAgentStep({
      runId: step.runId,
      agentRole: step.agentRole,
      model: step.model,
      status: step.status,
      input: step.input,
      output: step.output,
      error: step.error
    });
  }

  updateStepStatus(id: string, status: 'running' | 'completed' | 'failed', output?: string): void {
    this.db.updateAgentStep(id as string, {
      status,
      completedAt: status !== 'running' ? new Date().toISOString() : undefined,
      output: output ? { content: output } : undefined
    });
  }

  createToolCall(call: ToolCallRecord): string {
    return this.db.createToolCall({
      stepId: call.stepId,
      toolName: call.toolName,
      parameters: call.parameters,
      status: call.status
    });
  }

  updateToolCallResult(id: string, result: Record<string, unknown>, status: string): void {
    this.db.updateToolCall(id as string, {
      result,
      status,
      completedAt: new Date().toISOString()
    });
  }

  createMessage(message: { chatId: string; role: string; content: string; agentRole?: AgentRole; model?: string }): string {
    return this.db.addMessage({
      chatId: message.chatId,
      role: message.role,
      content: message.content,
      agentRole: message.agentRole,
      model: message.model
    });
  }

  getMessages(chatId: string): Array<{ role: string; content: string }> {
    return (this.db.getMessages(chatId) as Array<{ role: string; content: string }>).map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  updateRunStatus(runId: string, status: string, state: AgentState): void {
    this.db.updateAgentRun(runId, {
      status,
      currentState: state,
      completedAt: status === 'completed' || status === 'failed' ? new Date().toISOString() : undefined
    } as any);
  }
}