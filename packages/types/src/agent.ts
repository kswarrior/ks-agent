export type AgentState =
  | 'IDLE'
  | 'PLANNING'
  | 'EXPLORING'
  | 'IMPLEMENTING'
  | 'TESTING'
  | 'REVIEWING'
  | 'FIXING'
  | 'RETESTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'WAITING_FOR_USER';

export type AgentRole =
  | 'planner'
  | 'explorer'
  | 'coder'
  | 'tester'
  | 'reviewer'
  | 'fixer'
  | 'finalTester';

export const AGENT_ROLES: AgentRole[] = [
  'planner',
  'explorer',
  'coder',
  'tester',
  'reviewer',
  'fixer',
  'finalTester',
];

export const AGENT_ROLE_LABELS: Record<AgentRole, string> = {
  planner: 'Planner',
  explorer: 'Explorer',
  coder: 'Coder',
  tester: 'Test Agent',
  reviewer: 'Reviewer',
  fixer: 'Fixer',
  finalTester: 'Final Tester',
};

export interface AgentStep {
  id: string;
  agent_run_id: string;
  role: AgentRole;
  state: AgentState;
  title: string;
  details?: string;
  started_at: string;
  finished_at?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
}

export interface AgentRun {
  id: string;
  chat_id: string;
  message_id?: string;
  state: AgentState;
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
