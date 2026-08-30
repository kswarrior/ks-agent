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
  reasoning?: string
  finishReason?: string | null
  toolCallDeltas?: Array<{ index: number; id?: string; name?: string; argsDelta?: string }>
}

// Streaming idle timeout — how long we wait for the next chunk before
// considering the provider stalled. 20s was too aggressive for large
// edits/tool calls or reasoning models that pause between tokens; a
// longer window avoids spurious "stream interrupted" errors while still
// surfacing genuine hangs. 90s was still too short and caused auto-stop
// after 1-5m for long runs. 10m covers long-running tasks (large edits,
// reasoning models, slow providers) without hanging forever on a dead stream.
const STREAM_IDLE_TIMEOUT_MS = 600_000

function timeoutError(ms: number): Error {
  return Object.assign(new Error(`Provider stream timeout (${Math.round(ms / 1000)}s no data)`), { name: 'TimeoutError' })
}

function abortErr(): Error {
  return Object.assign(new Error('Aborted'), { name: 'AbortError' })
}

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal | undefined,
  timeoutMs: number
): Promise<{ done: boolean; value?: Uint8Array }> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let onAbort: (() => void) | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      try { reader.cancel().catch(() => {}) } catch {}
      reject(timeoutError(timeoutMs))
    }, timeoutMs)
    if (signal) {
      if (signal.aborted) {
        if (timeoutId) clearTimeout(timeoutId)
        try { reader.cancel().catch(() => {}) } catch {}
        reject(abortErr())
        return
      }
      onAbort = () => {
        if (timeoutId) clearTimeout(timeoutId)
        try { reader.cancel().catch(() => {}) } catch {}
        reject(abortErr())
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
  const readPromise: Promise<{ done: boolean; value?: Uint8Array }> = reader.read() as any
  const cleanup = () => {
    if (timeoutId) clearTimeout(timeoutId)
    if (signal && onAbort) signal.removeEventListener('abort', onAbort)
  }
  readPromise.then(cleanup, cleanup)
  timeoutPromise.catch(() => cleanup())
  try {
    const result = (await Promise.race([readPromise, timeoutPromise])) as { done: boolean; value?: Uint8Array }
    cleanup()
    return result
  } catch (e) {
    cleanup()
    try { reader.cancel().catch(() => {}) } catch {}
    throw e
  }
}

function delayWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(abortErr())
    let t: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      if (t) clearTimeout(t)
      reject(abortErr())
    }
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
  })
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
    retryOnStatusCodes: [429, 500, 502, 503],
    stopOnStatusCodes: [400, 401, 403, 404],
    alwaysRetry: false
  }

  let attempt = 0
  while (true) {
    if (signal?.aborted) throw new Error('Aborted')
    let res: Response
    try {
      // Add a 60s connect timeout for hanging providers (e.g. lightning) — race fetch against a timer with proper abort
      const fetchWithTimeout = async (): Promise<Response> => {
        const timeoutMs = 60000
        const fetchController = new AbortController()
        let timeoutId: ReturnType<typeof setTimeout> | null = null
        const onOrigAbort = () => fetchController.abort()
        if (signal) {
          if (signal.aborted) fetchController.abort()
          else signal.addEventListener('abort', onOrigAbort, { once: true })
        }
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            fetchController.abort()
            reject(Object.assign(new Error('Provider connect timeout (60s)'), { name: 'TimeoutError' }))
          }, timeoutMs)
        })
        const fetchPromise = fetch(endpoint(baseUrl), {
          method: 'POST',
          signal: fetchController.signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(body)
        })
        try {
          const r = await Promise.race([fetchPromise, timeoutPromise])
          if (timeoutId) clearTimeout(timeoutId)
          if (signal) signal.removeEventListener('abort', onOrigAbort)
          return r as Response
        } catch (e) {
          if (timeoutId) clearTimeout(timeoutId)
          if (signal) signal.removeEventListener('abort', onOrigAbort)
          try { fetchController.abort() } catch {}
          throw e
        }
      }
      res = await fetchWithTimeout()
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e
      const shouldRetryNet = settings.enabled && attempt < settings.maxRetries
      if (!shouldRetryNet) throw e
      const delayNet = Math.min(settings.baseDelayMs * Math.pow(2, attempt) + Math.random() * 800, settings.maxDelayMs)
      console.warn(`[llm retry] Network error — retry ${attempt + 1}/${settings.maxRetries} in ${Math.round(delayNet)}ms: ${String(e?.message||e).slice(0,120)}`)
      await delayWithSignal(delayNet, signal).catch((err) => { throw Object.assign(err, { name: 'AbortError' }) })
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
      const isResourceExhausted = /resourceexhausted|worker local total request limit/i.test(detail) || /resourceexhausted|worker local total request limit/i.test(errorMsg)

      // Stop codes (e.g. 400 Bad Request) should fail fast — retrying a client
      // error won't fix it. Only ResourceExhausted is exempt because it is
      // transient even when reported as a 4xx/5xx. The alwaysRetry flag
      // widens retryOnStatus but must NOT bypass stopOnStatus.
      if (!isResourceExhausted && settings.stopOnStatusCodes.includes(status)) {
        throw new Error(errorMsg)
      }

      const isRetryable = !!settings.alwaysRetry || isResourceExhausted || settings.retryOnStatusCodes.includes(status)
      // For ResourceExhausted with alwaysRetry, allow many more retries (provider capacity is transient)
      const effectiveMaxRetries = isResourceExhausted && settings.alwaysRetry ? Math.max(settings.maxRetries, 30) : settings.maxRetries
      const shouldRetry = settings.enabled && isRetryable && attempt < effectiveMaxRetries

      if (!shouldRetry) {
        throw new Error(errorMsg)
      }

      let delay = Math.min(
        settings.baseDelayMs * Math.pow(2, attempt) + Math.random() * 800,
        settings.maxDelayMs
      )
      console.warn(`[llm retry] Provider ${status} — retry ${attempt + 1}/${effectiveMaxRetries} in ${Math.round(delay)}ms: ${errorMsg.slice(0,120)}`)
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

      await delayWithSignal(delay, signal).catch((err) => { throw Object.assign(err, { name: 'AbortError' }) })
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
  // Some providers return top-level error instead of choices (e.g. ResourceExhausted 500 streaming)
  if (json.error) {
    const errMsg = (json.error as any).message || JSON.stringify(json.error)
    const errCode = (json.error as any).code || (json.error as any).status || 500
    throw Object.assign(new Error(`Provider responded ${errCode}: ${errMsg}`), { name: 'ProviderError', status: errCode })
  }
  const choice = json.choices?.[0]
  if (!choice) return null
  const delta = choice.delta ?? choice.message ?? {}
  // Reasoning models (nemotron, deepseek, etc.) send thinking in reasoning_content / reasoning / thinking
  let reasoning: string | undefined
  if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) reasoning = delta.reasoning_content
  else if (typeof delta.reasoning === 'string' && delta.reasoning) reasoning = delta.reasoning
  else if (delta.reasoning && typeof delta.reasoning === 'object' && typeof (delta.reasoning as any).content === 'string') reasoning = (delta.reasoning as any).content
  else if (typeof delta.thinking === 'string' && delta.thinking) reasoning = delta.thinking
  else if (typeof (delta as any).reasoning_details === 'string' && (delta as any).reasoning_details) reasoning = (delta as any).reasoning_details

  const chunk: RawChunk = {
    text: typeof delta.content === 'string' ? delta.content : undefined,
    reasoning,
    finishReason: choice.finish_reason ?? choice.finishReason ?? null
  }
  if (Array.isArray(delta.tool_calls)) {
    chunk.toolCallDeltas = delta.tool_calls.map((tc: any, i: number) => ({
      index: typeof tc.index === 'number' ? tc.index : i,
      id: typeof tc.id === 'string' ? tc.id : undefined,
      name: tc.function?.name ? String(tc.function.name) : undefined,
      argsDelta: typeof tc.function?.arguments === 'string' ? tc.function.arguments : undefined
    }))
  }
  // Some providers (e.g. older OpenRouter) put tool_calls at choice.message.tool_calls for first chunk
  if (!chunk.toolCallDeltas && Array.isArray((choice as any).message?.tool_calls)) {
    const mTool = (choice as any).message.tool_calls
    chunk.toolCallDeltas = mTool.map((tc: any, i: number) => ({
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
  let lastContentAt = Date.now()

  let sawDone = false
  while (true) {
    let readResult: { done: boolean; value?: Uint8Array }
    try {
      readResult = await readWithTimeout(reader, signal, STREAM_IDLE_TIMEOUT_MS)
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e
      throw e
    }
    const { done, value } = readResult as any
    if (done) break
    buf += decoder.decode(value as Uint8Array, { stream: true })
    let nl: number
    let yieldedThisRead = false
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') { sawDone = true; break }
      const chunk = parseChunk(payload)
      if (!chunk) continue
      // Hide reasoning/thinking — only stream visible content to user
      const out = chunk.text ?? ''
      if (out) {
        yieldedThisRead = true
        lastContentAt = Date.now()
        yield out
      } else if (chunk.reasoning != null) {
        // Reasoning deltas don't count as visible content but indicate
        // the stream is still alive - refresh idle timer without yielding.
        lastContentAt = Date.now()
      }
    }
    if (sawDone) break
    // Content-level idle detection: provider sent keep-alives/bytes but no
    // visible token for STREAM_IDLE_TIMEOUT_MS means it is stalled
    // ("connected but not working"). Without this, keep-alives prevent
    // readWithTimeout from firing and the agent appears stuck on same step.
    if (!yieldedThisRead && buf.trim() === '' && Date.now() - lastContentAt > STREAM_IDLE_TIMEOUT_MS) {
      throw timeoutError(STREAM_IDLE_TIMEOUT_MS)
    }
  }
  if (buf.trim().startsWith('data:')) {
    const payload = buf.trim().slice(5).trim()
    if (payload && payload !== '[DONE]') {
      const chunk = parseChunk(payload)
      if (chunk) {
        const out = chunk.text ?? ''
        if (out) yield out
      }
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
  let lastProgressAt = Date.now()

  let sawDone2 = false
  while (true) {
    let readResult: { done: boolean; value?: Uint8Array }
    try {
      readResult = await readWithTimeout(reader, signal, STREAM_IDLE_TIMEOUT_MS)
    } catch (e: any) {
      if (e?.name === 'AbortError') throw e
      throw e
    }
    const { done, value } = readResult as any
    if (done) break
    buf += decoder.decode(value as Uint8Array, { stream: true })
    let nl: number
    let progressedThisRead = false
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (payload === '[DONE]') { sawDone2 = true; break }
      const chunk = parseChunk(payload)
      if (!chunk) continue
      // Hide reasoning/thinking — only forward visible content
      const deltaOut = chunk.text ?? ''
      if (deltaOut) {
        text += deltaOut
        onDelta(deltaOut)
        progressedThisRead = true
        lastProgressAt = Date.now()
      } else if (chunk.reasoning != null) {
        progressedThisRead = true
        lastProgressAt = Date.now()
      }
      if (chunk.finishReason) {
        finishReason = chunk.finishReason
        progressedThisRead = true
        lastProgressAt = Date.now()
      }
      if (chunk.toolCallDeltas && chunk.toolCallDeltas.length > 0) {
        for (const d of chunk.toolCallDeltas ?? []) {
          const cur = calls.get(d.index) ?? { id: '', name: '', args: '' }
          if (d.id) cur.id = cur.id + d.id
          if (d.name) cur.name = cur.name + d.name
          if (d.argsDelta) cur.args += d.argsDelta
          calls.set(d.index, cur)
        }
        progressedThisRead = true
        lastProgressAt = Date.now()
      }
    }
    if (sawDone2) break
    if (!progressedThisRead && buf.trim() === '' && Date.now() - lastProgressAt > STREAM_IDLE_TIMEOUT_MS) {
      throw timeoutError(STREAM_IDLE_TIMEOUT_MS)
    }
  }
  // Flush trailing buffer without newline
  if (buf.trim().startsWith('data:')) {
    const payload = buf.trim().slice(5).trim()
    if (payload && payload !== '[DONE]') {
      const chunk = parseChunk(payload)
      if (chunk) {
        const deltaOut = chunk.text ?? ''
        if (deltaOut) {
          text += deltaOut
          onDelta(deltaOut)
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
  }

  const toolCalls: ParsedToolCall[] = [...calls.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, c], i) => ({ id: c.id || `call_${i}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: c.name, args: c.args }))
    .filter((c) => c.name)

  return { text, finishReason, toolCalls }
}
