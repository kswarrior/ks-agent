import { AIProvider, ChatRequest, ChatResponse, ChatChunk, ModelDefinition, ProviderConfig, AgentRole } from '@ks-agent/types';

export abstract class BaseProvider implements AIProvider {
  protected config: ProviderConfig;
  abstract name: string;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  abstract chat(request: ChatRequest): Promise<ChatResponse>;
  abstract stream(request: ChatRequest): AsyncIterable<ChatChunk>;
  abstract getModels(): Promise<ModelDefinition[]>;

  protected abstract formatRequest(request: ChatRequest): unknown;
}

export { AIProvider, ChatRequest, ChatResponse, ChatChunk, ModelDefinition, ProviderConfig, AgentRole };