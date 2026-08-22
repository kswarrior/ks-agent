import {
  AIProvider,
  ChatChunk,
  ChatRequest,
  ChatResponse,
  ProviderSettings,
} from '@ks-agent/types';
import { logger } from '@ks-agent/shared';
import { httpRequest, streamSSE } from '../http';

export class OpenAICompatibleProvider implements AIProvider {
  id = 'openai-compatible';
  name = 'OpenAI Compatible';
  type: ProviderSettings['type'] = 'openai-compatible';

  private chatEndpoint(settings: ProviderSettings): string {
    const custom = settings.chat_endpoint?.trim();
    if (custom) return custom;
    const base = settings.base_url.replace(/\/$/, '');
    return `${base}/chat/completions`;
  }

  private buildHeaders(settings: ProviderSettings): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (settings.api_key) {
      const authHeader = settings.auth_header?.trim() || 'Authorization';
      if (authHeader.toLowerCase() === 'authorization') {
        headers[authHeader] = `Bearer ${settings.api_key}`;
      } else {
        headers[authHeader] = settings.api_key;
      }
    }
    if (settings.custom_headers) {
      try {
        const custom = JSON.parse(settings.custom_headers);
        if (custom && typeof custom === 'object') {
          Object.assign(headers, custom);
        }
      } catch (e) {
        logger.warn('Invalid custom_headers JSON', { provider: settings.name });
      }
    }
    return headers;
  }

  private toRequestBody(req: ChatRequest, settings: ProviderSettings) {
    return {
      model: req.model || settings.model_id,
      messages: req.messages,
      temperature: req.temperature ?? settings.temperature,
      max_tokens: req.max_tokens ?? settings.max_tokens,
      top_p: req.top_p ?? 1,
      stream: !!req.stream,
      stop: req.stop,
      tools: req.tools,
    };
  }

  async chat(req: ChatRequest, settings: ProviderSettings): Promise<ChatResponse> {
    const url = this.chatEndpoint(settings);
    const headers = this.buildHeaders(settings);
    const body = this.toRequestBody(req, { ...settings, streaming: false });
    const data = await httpRequest(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeoutMs: settings.timeout * 1000,
    });
    return this.parseResponse(data, req.model || settings.model_id);
  }

  async *stream(
    req: ChatRequest,
    settings: ProviderSettings,
  ): AsyncIterable<ChatChunk> {
    const url = this.chatEndpoint(settings);
    const headers = this.buildHeaders(settings);
    const body = this.toRequestBody({ ...req, stream: true }, settings);
    const iter = streamSSE(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeoutMs: settings.timeout * 1000,
    });
    const modelId = req.model || settings.model_id;
    for await (const evt of iter) {
      const parsed = this.parseStreamEvent(evt, modelId);
      if (parsed) yield parsed;
    }
  }

  async testConnection(
    settings: ProviderSettings,
  ): Promise<{ ok: boolean; error?: string; models?: string[] }> {
    try {
      const url = this.chatEndpoint(settings);
      const headers = this.buildHeaders(settings);
      const data = await httpRequest(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: settings.model_id,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          temperature: 0,
          stream: false,
        }),
        timeoutMs: Math.min(settings.timeout * 1000, 15000),
      });
      if (!data || (data.error && !data.choices)) {
        return { ok: false, error: data?.error?.message ?? 'Invalid response' };
      }
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  }

  private parseResponse(data: any, modelId: string): ChatResponse {
    const choice = data?.choices?.[0];
    const content = choice?.message?.content ?? choice?.text ?? '';
    return {
      id: data?.id ?? `chatcmpl-${Date.now()}`,
      model: data?.model ?? modelId,
      content: typeof content === 'string' ? content : JSON.stringify(content),
      finish_reason: choice?.finish_reason,
      usage: data?.usage,
      raw: data,
    };
  }

  private parseStreamEvent(evt: string, modelId: string): ChatChunk | null {
    if (!evt || evt.startsWith(':')) return null;
    const lines = evt.split(/\r?\n/);
    let event = 'message';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (event !== 'message' && event !== 'chat.completion.chunk') {
      // Some providers send only data lines.
      if (!data) return null;
    }
    if (!data) return null;
    if (data === '[DONE]') {
      return {
        id: 'done',
        model: modelId,
        delta: '',
        finish_reason: 'stop',
      };
    }
    try {
      const json = JSON.parse(data);
      const choice = json.choices?.[0];
      const delta = choice?.delta?.content ?? choice?.text ?? '';
      return {
        id: json.id ?? `chunk-${Date.now()}`,
        model: json.model ?? modelId,
        delta: typeof delta === 'string' ? delta : '',
        finish_reason: choice?.finish_reason,
        raw: json,
      };
    } catch (e) {
      return null;
    }
  }
}
