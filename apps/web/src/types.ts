export interface Project {
  id: string;
  name: string;
  root_directory: string;
  settings?: string;
  created_at: string;
  updated_at: string;
}

export interface Chat {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  agent_run_id?: string;
  created_at: string;
}

export interface AgentRun {
  id: string;
  chat_id: string;
  message_id?: string;
  state: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  prompt: string;
  plan?: string;
  review?: string;
  fix_iteration: number;
  max_fix_iterations: number;
  created_at: string;
  updated_at: string;
  finished_at?: string;
}

export interface AgentStep {
  id: string;
  agent_run_id: string;
  role: string;
  state: string;
  title: string;
  details?: string;
  started_at: string;
  finished_at?: string;
  status: string;
}

export interface ToolCall {
  id: string;
  agent_run_id: string;
  agent_step_id?: string;
  tool_name: string;
  arguments: string;
  result?: string;
  error?: string;
  status: string;
  approved?: boolean;
  started_at: string;
  finished_at?: string;
  duration_ms?: number;
}

export interface ProviderSettings {
  id: string;
  name: string;
  type: string;
  base_url: string;
  api_key?: string;
  model_id: string;
  model_name: string;
  chat_endpoint?: string;
  streaming: boolean;
  auth_header?: string;
  custom_headers?: string;
  temperature: number;
  max_tokens: number;
  context_limit: number;
  timeout: number;
  builtin: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelSettings {
  role: string;
  provider_id: string;
  model_id: string;
  temperature: number;
  max_tokens: number;
  updated_at: string;
}

export interface AppSettings {
  general: {
    workspace_root: string;
    default_shell: string;
    shell_timeout: number;
    log_level: string;
  };
  agent: {
    autonomous_mode: boolean;
    max_fix_iterations: number;
    shell_approval: 'always' | 'dangerous' | 'never';
    automatic_tests: boolean;
    review_before_completion: boolean;
    max_agent_steps: number;
  };
  appearance: {
    background_type: 'image' | 'color';
    background_image_url: string;
    background_color: string;
    border_radius: number;
    primary_color: string;
    text_color: string;
    muted_color: string;
    border_color: string;
    overlay_opacity: number;
  };
  tools: {
    enable_write_file: boolean;
    enable_edit_file: boolean;
    enable_shell: boolean;
    enable_read_file: boolean;
    enable_list_files: boolean;
    enable_search_code: boolean;
  };
  api: {
    host: string;
    port: number;
    cors_origins: string;
  };
  database: {
    path: string;
    backup_enabled: boolean;
  };
}

export interface ApprovalRequest {
  id: string;
  tool_call_id: string;
  agent_run_id: string;
  tool_name: string;
  arguments: any;
  reason?: string;
  created_at: string;
}
