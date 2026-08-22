import { AgentRole } from './agent';

export interface ModelSettings {
  role: AgentRole;
  provider_id: string;
  model_id: string;
  temperature: number;
  max_tokens: number;
  updated_at: string;
}

export interface AgentSettings {
  autonomous_mode: boolean;
  max_fix_iterations: number;
  shell_approval: 'always' | 'dangerous' | 'never';
  automatic_tests: boolean;
  review_before_completion: boolean;
  max_agent_steps: number;
}

export interface AppearanceSettings {
  background_type: 'image' | 'color';
  background_image_url: string;
  background_color: string;
  border_radius: number;
  primary_color: string;
  text_color: string;
  muted_color: string;
  border_color: string;
  overlay_opacity: number;
}

export interface GeneralSettings {
  workspace_root: string;
  default_shell: string;
  shell_timeout: number;
  log_level: string;
}

export interface ToolsSettings {
  enable_write_file: boolean;
  enable_edit_file: boolean;
  enable_shell: boolean;
  enable_read_file: boolean;
  enable_list_files: boolean;
  enable_search_code: boolean;
}

export interface APISettings {
  host: string;
  port: number;
  cors_origins: string;
}

export interface DatabaseSettings {
  path: string;
  backup_enabled: boolean;
}

export interface AppSettings {
  general: GeneralSettings;
  agent: AgentSettings;
  appearance: AppearanceSettings;
  tools: ToolsSettings;
  api: APISettings;
  database: DatabaseSettings;
}
