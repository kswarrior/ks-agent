import { logger } from '@ks-agent/shared';
import { Readable } from 'stream';

export interface HttpRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: string | Buffer;
  timeoutMs?: number;
  /** External cancellation signal (e.g. agent run cancelled). */
  signal?: AbortSignal;
}

function combinedSignal(opts: HttpRequestOptions): AbortSignal | undefined {
  const timeout = opts.timeoutMs
    ? AbortSignal.timeout(opts.timeoutMs)
    : undefined;
  const external = opts.signal && !opts.signal.aborted ? opts.signal : undefined;
  if (timeout && external) return AbortSignal.any([timeout, external]);
  return timeout ?? external;
}

function isAbortError(e: any): boolean {
  return (
    e?.name === 'AbortError' ||
    e?.name === 'TimeoutError' ||
    /aborted|timed?\s?out/i.test(String(e?.message ?? ''))
  );
}

export async function httpRequest(
  url: string,
  opts: HttpRequestOptions,
): Promise<any> {
  const signal = combinedSignal(opts);
  try {
    const res = await fetch(url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body as any,
      signal,
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
    if (isAbortError(e)) {
      if (opts.signal?.aborted) throw new Error('Request aborted');
      throw new Error(`Request timed out after ${opts.timeoutMs}ms`);
    }
    throw e;
  }
}

async function* streamSSEInternal(
  url: string,
  opts: HttpRequestOptions,
): AsyncIterable<string> {
  // Idle timeout: reset whenever a chunk arrives, so long-running streams
  // are only aborted if they stall.
  const idleMs = opts.timeoutMs ?? 60000;
  let idleTimer: NodeJS.Timeout | null = null;
  let abortedByExternal = false;
  const controller = new AbortController();

  const onExternalAbort = () => {
    abortedByExternal = true;
    controller.abort();
  };
  if (opts.signal) {
    if (opts.signal.aborted) onExternalAbort();
    else opts.signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), idleMs);
  };
  armIdle();

  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers: opts.headers,
      body: opts.body as any,
      signal: controller.signal,
    });
  } catch (e: any) {
    clearTimeout(idleTimer!);
    opts.signal?.removeEventListener('abort', onExternalAbort);
    throw new Error(`Stream connection failed: ${e?.message ?? String(e)}`);
  }
  if (!res.ok || !res.body) {
    clearTimeout(idleTimer!);
    opts.signal?.removeEventListener('abort', onExternalAbort);
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  const nodeStream = Readable.fromWeb(res.body as any);
  let buffer = '';
  try {
    for await (const chunk of nodeStream) {
      armIdle();
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const event = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (event.trim()) yield event;
      }
    }
    if (buffer.trim()) yield buffer;
  } catch (e: any) {
    if (isAbortError(e)) {
      throw new Error(
        abortedByExternal || opts.signal?.aborted
          ? 'Stream aborted'
          : `Stream stalled for more than ${idleMs}ms`,
      );
    }
    throw e;
  } finally {
    if (idleTimer) clearTimeout(idleTimer);
    opts.signal?.removeEventListener('abort', onExternalAbort);
  }
}

export function streamSSE(
  url: string,
  opts: HttpRequestOptions,
): AsyncIterable<string> {
  return streamSSEInternal(url, opts);
}
