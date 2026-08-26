export interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function endpoint(baseUrl: string): string {
  const clean = baseUrl.replace(/\/+$/, '')
  if (/\/chat\/completions$/.test(clean)) return clean
  return clean + '/chat/completions'
}

/**
 * Streams an OpenAI-compatible chat completion.
 * Yields text deltas as they arrive.
 */
export async function* streamChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: LLMMessage[],
  signal?: AbortSignal
): AsyncGenerator<string> {
  const res = await fetch(endpoint(baseUrl), {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ model, messages, stream: true })
  })

  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 300)
    } catch {}
    throw new Error(`Provider responded ${res.status}${detail ? `: ${detail}` : ''}`)
  }
  if (!res.body) throw new Error('Provider returned an empty response body')

  const reader = res.body.getReader()
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
      try {
        const json = JSON.parse(payload)
        const choice = json.choices?.[0]
        const delta: string = choice?.delta?.content ?? choice?.text ?? ''
        if (delta) yield delta
      } catch {
        // ignore keep-alives / malformed fragments
      }
    }
  }
}
