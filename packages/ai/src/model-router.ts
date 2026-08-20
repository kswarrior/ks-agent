import { AgentRole, ChatRequest, ChatResponse, ModelDefinition } from '@ks-agent/types';
import { createProvider } from './providers';

export class ModelRegistry {
  private models: ModelDefinition[] = [];

  registerModel(model: ModelDefinition): void {
    this.models.push(model);
  }

  registerModels(models: ModelDefinition[]): void {
    this.models.push(...models);
  }

  getModels(): ModelDefinition[] {
    return this.models;
  }

  getModel(id: string): ModelDefinition | undefined {
    return this.models.find(m => m.id === id);
  }

  clear(): void {
    this.models = [];
  }
}

export class ModelRouter {
  private registry: ModelRegistry;
  private getApiKey: () => string | null;

  constructor(registry: ModelRegistry, getApiKey: () => string | null) {
    this.registry = registry;
    this.getApiKey = getApiKey;
  }

  getModel(role: AgentRole, projectId?: string): ModelDefinition {
    // In production, this reads from database settings per-role
    const roleModelMap: Record<string, string> = {
      [AgentRole.PLANNER]: 'nemotron-3-ultra',
      [AgentRole.EXPLORER]: 'nemotron-3.5-lightning-30b',
      [AgentRole.CODER]: 'step-3-7-flash',
      [AgentRole.TESTER]: 'nemotron-3.5-lightning-30b',
      [AgentRole.REVIEWER]: 'nemotron-3-ultra',
      [AgentRole.FIXER]: 'step-3-7-flash',
      [AgentRole.FINAL_TESTER]: 'nemotron-3.5-lightning-30b'
    };

    const modelId = roleModelMap[role];
    const model = this.registry.getModel(modelId) || this.registry.getModels()[0];
    
    if (!model) {
      throw new Error(`No model available for role ${role}`);
    }
    
    return model;
  }

  async run(role: AgentRole, request: ChatRequest): Promise<ChatResponse> {
    const model = this.getModel(role);
    const apiKey = this.getApiKey();
    
    if (!apiKey) {
      throw new Error('NVIDIA API key is not configured. Set NVIDIA_API_KEY environment variable or configure it in Settings.');
    }
    
    const provider = createProvider('nvidia', { apiKey });
    
    try {
      return await provider.chat({
        ...request,
        model: model.id
      });
    } catch (err) {
      const error = err as Error;
      if (error.message.includes('rate limit') || error.message.includes('429')) {
        throw new Error(`Rate limit exceeded while calling ${model.name}`);
      }
      throw new Error(`Model call failed for ${model.name}: ${error.message}`);
    }
  }

  async stream(role: AgentRole, request: ChatRequest): Promise<AsyncIterable<import('@ks-agent/types').ChatChunk>> {
    const model = this.getModel(role);
    const apiKey = this.getApiKey();
    
    if (!apiKey) {
      throw new Error('NVIDIA API key is not configured. Set NVIDIA_API_KEY environment variable or configure it in Settings.');
    }
    
    const provider = createProvider('nvidia', { apiKey });
    
    return provider.stream({
      ...request,
      model: model.id
    });
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      return { ok: false, message: 'NVIDIA_API_KEY not configured' };
    }
    
    const provider = createProvider('nvidia', { apiKey });
    return provider.testConnection ? provider.testConnection() : { ok: false, message: 'Provider has no connection test' };
  }
}