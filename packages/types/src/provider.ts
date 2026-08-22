export interface ProviderSettings {
  id: string;
  name: string;
  type: 'nvidia' | 'openai' | 'openai-compatible' | 'anthropic' | 'google' | 'custom';
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

export interface ChatRequestMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatRequestMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  stop?: string[];
  tools?: ToolDefinition[];
}

export interface ChatResponse {
  id: string;
  model: string;
  content: string;
  finish_reason?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  raw?: any;
}

export interface ChatChunk {
  id: string;
  model: string;
  delta: string;
  finish_reason?: string;
  raw?: any;
}

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface AIProvider {
  id: string;
  name: string;
  type: ProviderSettings['type'];
  chat(request: ChatRequest, settings: ProviderSettings): Promise<ChatResponse>;
  stream(
    request: ChatRequest,
    settings: ProviderSettings,
  ): AsyncIterable<ChatChunk>;
  testConnection(settings: ProviderSettings): Promise<{ ok: boolean; error?: string; models?: string[] }>;
}
