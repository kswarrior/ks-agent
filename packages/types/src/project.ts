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
