import { AIProvider, ModelDefinition, ProviderConfig } from '@ks-agent/types';
import { NVIDIAProvider } from './nvidia';

export type { AIProvider, ModelDefinition, ProviderConfig };
export { NVIDIAProvider };

export function createProvider(providerName: string, config: ProviderConfig): AIProvider {
  switch (providerName) {
    case 'nvidia':
      return new NVIDIAProvider(config);
    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

export const BUILTIN_MODELS: ModelDefinition[] = [
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