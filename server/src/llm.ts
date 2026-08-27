export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  /** Assistant-only: tool calls requested by the model (echoed back in history). */
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  /** Tool-only: id of the tool call this result belongs to. */
  tool_call_id?: string
}

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ParsedToolCall {
  id: string
  name: string
  args: string
}

export interface RetrySettings {
  enabled: boolean
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  retryOnStatusCodes: number[]
  stopOnStatusCodes: number[]
  alwaysRetry?: boolean
}

interface RawChunk {
  text?: string
  finishReason?: string | null
  toolCallDeltas?: Array<{ index: number; id?: string; name?: string; argsDelta?: string }>
}

function endpoint(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(clean)) return clean
  return clean + '/chat/completions'
}

async function openStream(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  retrySettings?: RetrySettings
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const settings = retrySettings ?? {
    enabled: true,
    maxRetries: 5,
    baseDelayMs: 1200,
    maxDelayMs: 30000,
    retryOnStatusCodes: [429, 503, 502],
    stopOnStatusCodes: [400, 401, 403, 404],
    alwaysRetry: false
  }

  let attempt = 0
  while (true) {
    if (signal?.aborted) throw new Error('Aborted')
    let res: Response
    try {
      res = await fetch(endpoint(baseUrl), {
        method: 'POST',
        signal,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
      })
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e
      const shouldRetryNet = settings.enabled && attempt < settings.maxRetries
      if (!shouldRetryNet) throw e
      const delayNet = Math.min(settings.baseDelayMs * Math.pow(2, attempt) + Math.random() * 800, settings.maxDelayMs)
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delayNet)
        signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('Aborted')) }, { once: true })
      })
      attempt++
      continue
    }

    if (!res.ok) {
      let detail = ''
      try {
        detail = (await res.text()).slice(0, 400)
      } catch {}
      const status = res.status
      const errorMsg = `Provider responded ${status}${detail ? `: ${detail}` : ''}`

      if (!settings.alwaysRetry && settings.stopOnStatusCodes.includes(status)) {
        throw new Error(errorMsg)
      }

      const isRetryable = !!settings.alwaysRetry || settings.retryOnStatusCodes.includes(status)
      const shouldRetry = settings.enabled && isRetryable && attempt < settings.maxRetries

      if (!shouldRetry) {
        throw new Error(errorMsg)
      }

      let delay = Math.min(
        settings.baseDelayMs * Math.pow(2, attempt) + Math.random() * 800,
        settings.maxDelayMs
      )
      // Respect Retry-After header if present (seconds or http-date)
      const retryAfter = res.headers.get('retry-after')
      if (retryAfter) {
        const secs = Number(retryAfter)
        if (!Number.isNaN(secs) && secs >= 0 && secs < 300) {
          delay = Math.max(delay, secs * 1000)
        } else {
          const dateMs = Date.parse(retryAfter)
          if (!Number.isNaN(dateMs)) {
            const diff = dateMs - Date.now()
            if (diff > 0 && diff < 300000) delay = Math.max(delay, diff)
          }
        }
      }

      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, delay)
        signal?.addEventListener('abort', () => { clearTimeout(t); reject(new Error('Aborted')) }, { once: true })
      })
      attempt++
      continue
    }

    if (!res.body) throw new Error('Provider returned an empty response body')
    return res.body.getReader()
  }
}

/** Parses one SSE `data:` payload into deltas, or null for keep-alives. */
function parseChunk(payload: string): RawChunk | null {
  let json: any
  try {
    json = JSON.parse(payload)
  } catch {
    return null // ignore keep-alives / malformed fragments
  }
  const choice = json.choices?.[0]
  if (!choice) return null
  const delta = choice.delta ?? choice.message ?? {}
  const chunk: RawChunk = {
    text: typeof delta.content === 'string' ? delta.content : undefined,
    finishReason: choice.finish_reason ?? null
  }
  if (Array.isArray(delta.tool_calls)) {
    chunk.toolCallDeltas = delta.tool_calls.map((tc: any, i: number) => ({
      index: typeof tc.index === 'number' ? tc.index : i,
      id: typeof tc.id === 'string' ? tc.id : undefined,
      name: tc.function?.name ? String(tc.function.name) : undefined,
      argsDelta: typeof tc.function?.arguments === 'string' ? tc.function.arguments : undefined
    }))
  }
  return chunk
}

/**
 * Streams an OpenAI-compatible chat completion and yields text deltas as they arrive.
 */
export async function* streamChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  signal?: AbortSignal,
  retrySettings?: RetrySettings,
  maxTokens?: number
): AsyncGenerator<string> {
  const reader = await openStream(baseUrl, apiKey, { model, messages, stream: true, ...(maxTokens ? { max_tokens: maxTokens } : {}) }, signal, retrySettings)
  const decoder = new TextDecoder()
  let buf = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') return
      const chunk = parseChunk(payload)
      if (chunk?.text) yield chunk.text
    }
  }
}

export interface AgentStreamResult {
  /** All text streamed during this round. */
  text: string
  finishReason: string | null
  /** Complete tool calls accumulated from stream fragments. */
  toolCalls: ParsedToolCall[]
}

/**
 * Streams a chat completion with tools enabled. Text deltas are forwarded to
 * `onDelta` as they arrive; resolves with the round's full text, finish reason
 * and accumulated tool calls.
 */
export async function streamChatWithTools(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  tools: ToolDef[],
  onDelta: (text: string) => void,
  signal?: AbortSignal,
  retrySettings?: RetrySettings,
  maxTokens?: number
): Promise<AgentStreamResult> {
  const reader = await openStream(
    baseUrl,
    apiKey,
    { model, messages, stream: true, tools, tool_choice: 'auto', ...(maxTokens ? { max_tokens: maxTokens } : {}) },
    signal,
    retrySettings
  )
  const decoder = new TextDecoder()
  let buf = ''
  let text = ''
  let finishReason: string | null = null
  const calls = new Map<number, { id: string; name: string; args: string }>()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') continue
      const chunk = parseChunk(payload)
      if (!chunk) continue
      if (chunk.text) {
        text += chunk.text
        onDelta(chunk.text)
      }
      if (chunk.finishReason) finishReason = chunk.finishReason
      for (const d of chunk.toolCallDeltas ?? []) {
        const cur = calls.get(d.index) ?? { id: '', name: '', args: '' }
        if (d.id) cur.id = cur.id + d.id
        if (d.name) cur.name = cur.name + d.name
        if (d.argsDelta) cur.args += d.argsDelta
        calls.set(d.index, cur)
      }
    }
  }

  const toolCalls: ParsedToolCall[] = [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, c], i) => ({ id: c.id || `call_${i}`, name: c.name, args: c.args }))
    .filter((c) => c.name)

  return { text, finishReason, toolCalls }
}
