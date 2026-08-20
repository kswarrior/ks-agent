export enum AgentRole {
  PLANNER = 'planner',
  EXPLORER = 'explorer',
  CODER = 'coder',
  TESTER = 'tester',
  REVIEWER = 'reviewer',
  FIXER = 'fixer',
  FINAL_TESTER = 'final_tester'
}

export enum AgentState {
  IDLE = 'idle',
  PLANNING = 'planning',
  EXPLORING = 'exploring',
  IMPLEMENTING = 'implementing',
  TESTING = 'testing',
  REVIEWING = 'reviewing',
  FIXING = 'fixing',
  RETESTING = 'retesting',
  COMPLETED = 'completed',
  FAILED = 'failed',
  WAITING_FOR_USER = 'waiting_for_user'
}

export enum MessageRole {
  USER = 'user',
  ASSISTANT = 'assistant',
  SYSTEM = 'system',
  TOOL = 'tool'
}

export enum ToolPermissionMode {
  ASK_EVERY_TIME = 'ask_every_time',
  ASK_DANGEROUS = 'ask_dangerous',
  AUTONOMOUS = 'autonomous'
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

export interface ModelSettings {
  [AgentRole.PLANNER]: string;
  [AgentRole.EXPLORER]: string;
  [AgentRole.CODER]: string;
  [AgentRole.TESTER]: string;
  [AgentRole.REVIEWER]: string;
  [AgentRole.FIXER]: string;
  [AgentRole.FINAL_TESTER]: string;
}

export interface AgentSettings {
  autonomousMode: boolean;
  maxFixIterations: number;
  requireApprovalForShell: boolean;
  autoRunTests: boolean;
  reviewBeforeCompletion: boolean;
  maxAgentSteps: number;
}

export interface Project {
  id: string;
  name: string;
  rootDirectory: string;
  createdAt: string;
  updatedAt: string;
  settings: ProjectSettings;
}

export interface ProjectSettings {
  modelSettings?: Partial<ModelSettings>;
  agentSettings?: Partial<AgentSettings>;
  toolPermissions?: ToolPermissionMode;
}

export interface Chat {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: ChatStatus;
}

export enum ChatStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ARCHIVED = 'archived'
}

export interface Message {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  model?: string;
  agentRole?: AgentRole;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface AgentRun {
  id: string;
  chatId: string;
  projectId: string;
  status: AgentRunStatus;
  currentState: AgentState;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  input: string;
  metadata?: Record<string, unknown>;
}

export enum AgentRunStatus {
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  WAITING_APPROVAL = 'waiting_approval'
}

export interface AgentStep {
  id: string;
  runId: string;
  agentRole: AgentRole;
  model: string;
  status: AgentStepStatus;
  startedAt: string;
  completedAt?: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
}

export enum AgentStepStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed'
}

export interface ToolCall {
  id: string;
  stepId: string;
  toolName: string;
  parameters: Record<string, unknown>;
  result?: ToolResult;
  status: ToolCallStatus;
  startedAt: string;
  completedAt?: string;
}

export enum ToolCallStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  WAITING_APPROVAL = 'waiting_approval'
}

export interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
  duration?: number;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  toolCalls?: ToolCallRequest[];
  toolCallId?: string;
  name?: string;
}

export interface ToolCallRequest {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatResponse {
  id: string;
  model: string;
  choices: ChatChoice[];
  usage?: TokenUsage;
}

export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finishReason: string;
}

export interface ChatChunk {
  id: string;
  model: string;
  choices: ChatChunkChoice[];
}

export interface ChatChunkChoice {
  index: number;
  delta: {
    role?: string;
    content?: string;
    toolCalls?: ToolCallRequest[];
  };
  finishReason: string | null;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, ToolParameter>;
      required: string[];
    };
  };
}

export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: ToolParameter;
}

export interface AIProvider {
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<ChatChunk>;
  getModels(): Promise<ModelDefinition[]>;
  testConnection?(): Promise<{ ok: boolean; message: string }>;
}

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  organization?: string;
}

export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  command: string;
}

export interface FileOperationResult {
  success: boolean;
  path: string;
  diff?: string;
  error?: string;
}

export interface ExplorerResult {
  projectType: string;
  framework?: string;
  packageManager?: string;
  relevantFiles: string[];
  summary: string;
  risks: string[];
  structure: DirectoryNode;
}

export interface DirectoryNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryNode[];
}

export interface PlanResult {
  goal: string;
  requirements: string[];
  filesLikelyAffected: string[];
  implementationSteps: PlanStep[];
  testingStrategy: string;
  risks: string[];
  unknowns: string[];
}

export interface PlanStep {
  id: string;
  description: string;
  files: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

export interface ReviewResult {
  status: 'APPROVED' | 'CHANGES_REQUIRED';
  issues: ReviewIssue[];
}

export interface ReviewIssue {
  severity: 'high' | 'medium' | 'low';
  file: string;
  description: string;
  suggestedFix: string;
}

export interface TestResult {
  status: 'PASS' | 'FAIL' | 'NEEDS_FIX' | 'UNKNOWN';
  exitCode: number;
  stdout: string;
  stderr: string;
  failures: TestFailure[];
  summary: string;
}

export interface TestFailure {
  file: string;
  test: string;
  expected: string;
  actual: string;
  message: string;
}

export interface AppSettings {
  nvidiaApiKey?: string;
  theme: 'dark' | 'light';
  language: string;
}

export interface WebSocketMessage {
  type: string;
  payload: unknown;
  timestamp: string;
}

export interface AgentEvent {
  type: 'state_change' | 'step_start' | 'step_complete' | 'tool_call' | 'tool_result' | 'message' | 'error';
  runId: string;
  stepId?: string;
  data: unknown;
  timestamp: string;
}