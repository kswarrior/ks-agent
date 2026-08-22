export type ToolName =
  | 'write_file'
  | 'edit_file'
  | 'shell'
  | 'read_file'
  | 'list_files'
  | 'search_code';

export interface ToolCall {
  id: string;
  agent_run_id: string;
  agent_step_id?: string;
  tool_name: ToolName;
  arguments: string;
  result?: string;
  error?: string;
  status: 'pending' | 'running' | 'awaiting_approval' | 'completed' | 'failed' | 'cancelled' | 'denied';
  approved?: boolean;
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
}

export interface ToolApprovalRequest {
  id: string;
  tool_call_id: string;
  agent_run_id: string;
  tool_name: ToolName;
  arguments: any;
  reason?: string;
  created_at: string;
}

export interface ToolDefinitionLite {
  name: ToolName;
  description: string;
  parameters: Record<string, any>;
}
