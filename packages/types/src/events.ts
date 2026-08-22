import { AgentState, AgentRole } from './agent';
import { ToolCall, ToolApprovalRequest } from './tool';

export type ServerEvent =
  | { type: 'agent_run.started'; runId: string; chatId: string; state: AgentState }
  | { type: 'agent_run.state'; runId: string; state: AgentState }
  | { type: 'agent_run.completed'; runId: string; state: AgentState }
  | { type: 'agent_run.failed'; runId: string; error: string }
  | {
      type: 'agent_step.started';
      runId: string;
      stepId: string;
      role: AgentRole;
      title: string;
    }
  | {
      type: 'agent_step.details';
      runId: string;
      stepId: string;
      details: string;
    }
  | { type: 'agent_step.completed'; runId: string; stepId: string; status: string }
  | {
      type: 'message.delta';
      runId: string;
      messageId: string;
      delta: string;
    }
  | { type: 'message.final'; runId: string; messageId: string; content: string }
  | { type: 'tool_call.started'; runId: string; toolCall: ToolCall }
  | { type: 'tool_call.output'; runId: string; toolCallId: string; chunk: string }
  | { type: 'tool_call.completed'; runId: string; toolCall: ToolCall }
  | { type: 'approval.required'; approval: ToolApprovalRequest }
  | { type: 'log'; runId?: string; level: string; message: string; data?: any };
