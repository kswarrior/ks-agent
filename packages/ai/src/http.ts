import { logger } from '@ks-agent/shared';
import { Readable } from 'stream';

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
}

export async function httpRequest(
  url: string,
  opts: HttpRequestOptions,
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30000);
  try {
    const res = await fetch(url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body as any,
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(
        `HTTP ${res.status} ${res.statusText}: ${text.slice(0, 500)}`,
      );
    }
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      throw new Error(`Request timed out after ${opts.timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function* streamSSEInternal(
  url: string,
  opts: HttpRequestOptions,
): AsyncIterable<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body as any,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(timer);
    throw new Error(`Stream connection failed: ${e?.message ?? String(e)}`);
  }
  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const nodeStream = Readable.fromWeb(res.body as any);
  let buffer = '';
  try {
    for await (const chunk of nodeStream) {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (event.trim()) yield event;
      }
    }
    if (buffer.trim()) yield buffer;
  } finally {
    clearTimeout(timer);
  }
}

export function streamSSE(
  url: string,
  opts: HttpRequestOptions,
): AsyncIterable<string> {
  return streamSSEInternal(url, opts);
}
