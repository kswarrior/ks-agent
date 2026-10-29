import { parseRetryAfter, ProviderError } from './errors.js'
import type { ToolDef } from './types.js'

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
}

export interface ToolCallAccumulator {
  id: string
  name: string
  arguments: string
}

export interface StreamResult {
  content: string
  reasoning: string
  toolCalls: ToolCallAccumulator[]
  finishReason: string | null
}

export interface StreamCallbacks {
  onContent?: (text: string) => void
  onReasoning?: (text: string) => void
  onToolCallDelta?: (index: number, id?: string, name?: string, argsDelta?: string) => void
}

export interface StreamOptions {
  baseUrl: string
  apiKey: string
  model: string
  messages: LLMMessage[]
  tools?: ToolDef[]
  signal?: AbortSignal
  callbacks?: StreamCallbacks
  idleTimeoutMs?: number
  temperature?: number
}

function completionUrl(baseUrl: string): string {
  const base = (baseUrl || 'https://api.openai.com/v1').trim().replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(base)) return base
  return `${base}/chat/completions`
}

function abortError(): Error {
  const err = new Error('Aborted')
  err.name = 'AbortError'
  return err
}

function timeoutError(ms: number): Error {
  const err = new Error(`Provider stream timeout (${Math.round(ms / 1000)}s without data)`)
  err.name = 'TimeoutError'
  return err
}

interface RawDelta {
  content?: string | null
  reasoning?: string | null
  reasoning_content?: string | null
  tool_calls?: Array<{
    index?: number
    id?: string
    type?: string
    function?: { name?: string; arguments?: string }
  }>
}

interface RawChunk {
  choices?: Array<{ delta?: RawDelta; message?: RawDelta; finish_reason?: string | null }>
  error?: { message?: string; code?: string; type?: string }
}

/**
 * Stream a chat completion from any OpenAI-compatible endpoint.
 * Tool calls are accumulated by index because providers send arguments in
 * fragments; the caller receives both live deltas and the final tool calls.
 */
export async function streamCompletion(options: StreamOptions): Promise<StreamResult> {
  const idleTimeoutMs = options.idleTimeoutMs ?? 600_000
  const controller = new AbortController()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const armTimer = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, idleTimeoutMs)
  }

  const onExternalAbort = () => controller.abort()
  if (options.signal) {
    if (options.signal.aborted) throw abortError()
    options.signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  const body: Record<string, unknown> = {
    model: options.model,
    messages: options.messages,
    stream: true
  }
  if (options.tools && options.tools.length) {
    body.tools = options.tools
    body.tool_choice = 'auto'
  }
  if (typeof options.temperature === 'number') body.temperature = options.temperature

  const toolCalls = new Map<number, ToolCallAccumulator>()
  let content = ''
  let reasoning = ''
  let finishReason: string | null = null

  const applyDelta = (delta: RawDelta | undefined) => {
    if (!delta) return
    if (typeof delta.content === 'string' && delta.content.length) {
      content += delta.content
      options.callbacks?.onContent?.(delta.content)
    }
    const think = delta.reasoning_content ?? delta.reasoning
    if (typeof think === 'string' && think.length) {
      reasoning += think
      options.callbacks?.onReasoning?.(think)
    }
    if (Array.isArray(delta.tool_calls)) {
      for (const part of delta.tool_calls) {
        const index = typeof part.index === 'number' ? part.index : 0
        const current = toolCalls.get(index) ?? { id: '', name: '', arguments: '' }
        if (part.id) current.id = part.id
        if (part.function?.name) current.name += part.function.name
        if (part.function?.arguments) current.arguments += part.function.arguments
        toolCalls.set(index, current)
        options.callbacks?.onToolCallDelta?.(index, part.id, part.function?.name, part.function?.arguments)
      }
    }
  }

  try {
    armTimer()
    const res = await fetch(completionUrl(options.baseUrl), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {})
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new ProviderError({
        status: res.status,
        statusText: res.statusText,
        body: text,
        retryAfterMs: parseRetryAfter(res.headers)
      })
    }

    const contentType = res.headers.get('content-type') ?? ''
    if (!contentType.includes('text/event-stream') || !res.body) {
      const json = (await res.json()) as RawChunk
      if (json.error) {
        throw new ProviderError({
          status: 0,
          title: 'Provider stream error',
          body: JSON.stringify(json.error)
        })
      }
      const choice = json.choices?.[0]
      applyDelta(choice?.delta ?? choice?.message)
      finishReason = choice?.finish_reason ?? null
      return { content, reasoning, toolCalls: [...toolCalls.values()], finishReason }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let done = false

    while (!done) {
      const chunk = await reader.read()
      if (chunk.done) break
      armTimer()
      buffer += decoder.decode(chunk.value, { stream: true })

      let newline = buffer.indexOf('\n')
      while (newline !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        newline = buffer.indexOf('\n')
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data) continue
        if (data === '[DONE]') {
          done = true
          break
        }
        let parsed: RawChunk
        try {
          parsed = JSON.parse(data) as RawChunk
        } catch {
          continue
        }
        if (parsed.error) {
          throw new ProviderError({
            status: 0,
            title: 'Provider stream error',
            body: JSON.stringify(parsed.error)
          })
        }
        const choice = parsed.choices?.[0]
        if (!choice) continue
        applyDelta(choice.delta)
        if (choice.finish_reason) finishReason = choice.finish_reason
      }
    }

    if (buffer.trim().startsWith('data:')) {
      const data = buffer.trim().slice(5).trim()
      if (data && data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data) as RawChunk
          const choice = parsed.choices?.[0]
          applyDelta(choice?.delta)
          if (choice?.finish_reason) finishReason = choice.finish_reason
        } catch {
          // ignore incomplete trailing frame
        }
      }
    }

    return { content, reasoning, toolCalls: [...toolCalls.values()], finishReason }
  } catch (error) {
    if (controller.signal.aborted) {
      if (timedOut) throw timeoutError(idleTimeoutMs)
      throw abortError()
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
    options.signal?.removeEventListener('abort', onExternalAbort)
  }
}
