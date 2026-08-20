import { AgentRole, AgentState, ToolResult } from '@ks-agent/types';
import { EventEmitter } from 'events';

export interface AgentEventPayload {
  type: string;
  runId: string;
  data?: unknown;
  timestamp: string;
}

export class AgentEventBus extends EventEmitter {
  emitEvent(type: string, runId: string, data?: unknown): void {
    const payload: AgentEventPayload = {
      type,
      runId,
      data,
      timestamp: new Date().toISOString()
    };
    this.emit('agent_event', payload);
    this.emit(`agent_event:${type}`, payload);
  }

  emitStateChange(runId: string, state: AgentState): void {
    this.emitEvent('state_change', runId, { state });
  }

  emitStepStart(runId: string, stepId: string, role: AgentRole, model: string): void {
    this.emitEvent('step_start', runId, { stepId, role, model });
  }

  emitStepComplete(runId: string, stepId: string, role: AgentRole, result: unknown): void {
    this.emitEvent('step_complete', runId, { stepId, role, result });
  }

  emitToolCall(runId: string, stepId: string, toolName: string, args: Record<string, unknown>): void {
    this.emitEvent('tool_call', runId, { stepId, toolName, args });
  }

  emitToolResult(runId: string, stepId: string, toolName: string, result: ToolResult): void {
    this.emitEvent('tool_result', runId, { stepId, toolName, result });
  }

  emitMessage(runId: string, content: string, role: AgentRole, model?: string): void {
    this.emitEvent('message', runId, { content, role, model });
  }

  emitError(runId: string, message: string): void {
    this.emitEvent('error', runId, { message });
  }

  emitApprovalRequest(runId: string, toolName: string, args: Record<string, unknown>, reason?: string): void {
    this.emitEvent('approval_request', runId, { toolName, args, reason });
  }
}