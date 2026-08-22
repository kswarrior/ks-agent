import { OpenAICompatibleProvider } from './openai-compatible';
import { ProviderSettings } from '@ks-agent/types';

export class NvidiaProvider extends OpenAICompatibleProvider {
  id = 'nvidia';
  name = 'NVIDIA';
  type: ProviderSettings['type'] = 'nvidia';
}
