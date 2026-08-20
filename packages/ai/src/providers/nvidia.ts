import { AIProvider, ChatRequest, ChatResponse, ChatChunk, ModelDefinition, ProviderConfig } from '@ks-agent/types';

const NVIDIA_MODELS: ModelDefinition[] = [
  {
    id: 'nemotron-3-ultra',
    name: 'Nemotron 3 Ultra',
    provider: 'nvidia',
    capabilities: {
      coding: true,
      tools: true,
      reasoning: true,
      longContext: true
    },
    maxTokens: 8192,
    contextWindow: 131072
  },
  {
    id: 'nemotron-3.5-lightning-30b',
    name: 'Nemotron 3.5 Lightning 30B-A3B',
    provider: 'nvidia',
    capabilities: {
      coding: true,
      tools: true,
      reasoning: true,
      longContext: true
    },
    maxTokens: 4096,
    contextWindow: 65536
  },
  {
    id: 'step-3-7-flash',
    name: 'Step 3.7 Flash',
    provider: 'nvidia',
    capabilities: {
      coding: true,
      tools: true,
      reasoning: false,
      longContext: false
    },
    maxTokens: 4096,
    contextWindow: 32768
  }
];

export class NVIDIAProvider implements AIProvider {
  readonly name = 'nvidia';
  private apiKey: string;
  private baseUrl: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = {
      model: request.model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {})
      })),
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 4096,
      ...(request.tools ? { tools: request.tools, tool_choice: request.toolChoice ?? 'auto' } : {})
    };

    const response = await this.fetchWithRetry(this.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA API error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    return this.mapResponse(data);
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const body = {
      model: request.model,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.toolCalls ? { tool_calls: m.toolCalls } : {}),
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {})
      })),
      temperature: request.temperature ?? 0.3,
      max_tokens: request.maxTokens ?? 4096,
      stream: true,
      ...(request.tools ? { tools: request.tools, tool_choice: request.toolChoice ?? 'auto' } : {})
    };

    const response = await this.fetchWithRetry(this.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`NVIDIA API error (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') return;

        try {
          const data = JSON.parse(dataStr);
          yield this.mapChunk(data);
        } catch {
          // ignore malformed chunk
        }
      }
    }
  }

  async getModels(): Promise<ModelDefinition[]> {
    return NVIDIA_MODELS;
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await this.fetchWithRetry(this.baseUrl + '/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      
      if (response.ok) {
        return { ok: true, message: 'Connection successful' };
      }
      
      return { ok: false, message: `Connection failed: HTTP ${response.status}` };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${(err as Error).message}` };
    }
  }

  private mapResponse(data: any): ChatResponse {
    return {
      id: data.id || '',
      model: data.model || '',
      choices: (data.choices || []).map((choice: any) => ({
        index: choice.index,
        message: {
          role: choice.message?.role || 'assistant',
          content: choice.message?.content ?? null,
          toolCalls: choice.message?.tool_calls || undefined
        },
        finishReason: choice.finish_reason || 'stop'
      })),
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens
      } : undefined
    };
  }

  private mapChunk(data: any): ChatChunk {
    const choice = data.choices?.[0] || {};
    return {
      id: data.id || '',
      model: data.model || '',
      choices: [{
        index: choice.index || 0,
        delta: {
          role: choice.delta?.role,
          content: choice.delta?.content,
          toolCalls: choice.delta?.tool_calls || undefined
        },
        finishReason: choice.finish_reason || null
      }]
    };
  }

  private async fetchWithRetry(url: string, options: RequestInit, retries = 3): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, options);
        
        // Retry on rate limits and 5xx errors
        if (response.status === 429 || response.status >= 500) {
          if (attempt < retries - 1) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }
        
        return response;
      } catch (err) {
        lastError = err as Error;
        if (attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error('Fetch failed');
  }
}