export interface Project {
  id: string;
  name: string;
  rootDirectory: string;
  createdAt: string;
  updatedAt: string;
  settings: Record<string, unknown>;
  chats?: Chat[];
}

export interface Chat {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  status: string;
}

export interface Message {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  model?: string;
  agent_role?: string;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRun {
  id: string;
  chat_id: string;
  project_id: string;
  status: 'running' | 'completed' | 'failed' | 'paused' | 'waiting_approval';
  current_state: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
  input: string;
}

export interface ModelDefinition {
  id: string;
  name: string;
  provider: string;
  capabilities: {
    coding: boolean;
    tools: boolean;
    reasoning: boolean;
    longContext: boolean;
  };
  maxTokens?: number;
  contextWindow?: number;
}

export interface AgentSettings {
  autonomousMode: boolean;
  maxFixIterations: number;
  requireApprovalForShell: boolean;
  autoRunTests: boolean;
  reviewBeforeCompletion: boolean;
  maxAgentSteps: number;
}

export interface ModelSettings {
  planner: string;
  explorer: string;
  coder: string;
  tester: string;
  reviewer: string;
  fixer: string;
  final_tester: string;
}

export interface WSEvent {
  type: string;
  runId: string;
  data?: any;
  timestamp: string;
}