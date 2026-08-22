import {
  AIProvider,
  ChatRequest,
  ChatResponse,
  ProviderSettings,
} from '@ks-agent/types';
import { logger } from '@ks-agent/shared';
import { OpenAICompatibleProvider } from './providers/openai-compatible';
import { NvidiaProvider } from './providers/nvidia';

class AnthropicProvider implements AIProvider {
  id = 'anthropic';
  name = 'Anthropic';
  type: ProviderSettings['type'] = 'anthropic';

  async chat(req: ChatRequest, settings: ProviderSettings): Promise<ChatResponse> {
    const base = settings.base_url.replace(/\/$/, '');
    const url = `${base}/v1/messages`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.api_key ?? '',
        'anthropic-version': '2023-06-01',
        ...this.customHeaders(settings),
      },
      body: JSON.stringify({
        model: req.model || settings.model_id,
        messages: req.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content })),
        system: req.messages.find((m) => m.role === 'system')?.content,
        max_tokens: req.max_tokens ?? settings.max_tokens,
        temperature: req.temperature ?? settings.temperature,
      }),
      signal: AbortSignal.timeout(settings.timeout * 1000),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(`Anthropic error: ${JSON.stringify(data)}`);
    const content = (data.content ?? [])
      .map((c: any) => (c.type === 'text' ? c.text : ''))
      .join('');
    return {
      id: data.id ?? `ant-${Date.now()}`,
      model: data.model ?? settings.model_id,
      content,
      finish_reason: data.stop_reason,
      raw: data,
    };
  }

  async *stream(req: ChatRequest, settings: ProviderSettings): AsyncIterable<any> {
    // Fallback to non-streaming then yield
    const full = await this.chat(req, settings);
    yield { id: full.id, model: full.model, delta: full.content, finish_reason: full.finish_reason };
  }

  async testConnection(settings: ProviderSettings) {
    try {
      await this.chat(
        {
          model: settings.model_id,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        },
        settings,
      );
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  }

  private customHeaders(settings: ProviderSettings): Record<string, string> {
    if (!settings.custom_headers) return {};
    try {
      return JSON.parse(settings.custom_headers);
    } catch {
      return {};
    }
  }
}

class GoogleProvider implements AIProvider {
  id = 'google';
  name = 'Google';
  type: ProviderSettings['type'] = 'google';

  async chat(req: ChatRequest, settings: ProviderSettings): Promise<ChatResponse> {
    const base = settings.base_url.replace(/\/$/, '');
    const url = `${base}/v1beta/models/${req.model || settings.model_id}:generateContent?key=${encodeURIComponent(
      settings.api_key ?? '',
    )}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: req.messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
        systemInstruction: req.messages.find((m) => m.role === 'system')
          ? {
              parts: [
                { text: req.messages.find((m) => m.role === 'system')!.content },
              ],
            }
          : undefined,
        generationConfig: {
          temperature: req.temperature ?? settings.temperature,
          maxOutputTokens: req.max_tokens ?? settings.max_tokens,
        },
      }),
      signal: AbortSignal.timeout(settings.timeout * 1000),
    });
    const data: any = await res.json();
    if (!res.ok) throw new Error(`Google error: ${JSON.stringify(data)}`);
    const content = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p.text ?? '')
      .join('');
    return {
      id: `goog-${Date.now()}`,
      model: req.model || settings.model_id,
      content,
      finish_reason: data.candidates?.[0]?.finishReason,
      raw: data,
    };
  }

  async *stream(req: ChatRequest, settings: ProviderSettings): AsyncIterable<any> {
    const full = await this.chat(req, settings);
    yield { id: full.id, model: full.model, delta: full.content, finish_reason: full.finish_reason };
  }

  async testConnection(settings: ProviderSettings) {
    try {
      await this.chat(
        {
          model: settings.model_id,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
        },
        settings,
      );
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  }
}

export function buildProvider(settings: ProviderSettings): AIProvider {
  switch (settings.type) {
    case 'nvidia':
      return new NvidiaProvider();
    case 'openai':
    case 'openai-compatible':
    case 'custom':
      return new OpenAICompatibleProvider();
    case 'anthropic':
      return new AnthropicProvider();
    case 'google':
      return new GoogleProvider();
    default:
      logger.warn(`Unknown provider type "${settings.type}", using OpenAI-compatible`);
      return new OpenAICompatibleProvider();
  }
}
