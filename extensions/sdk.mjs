import { spawn } from 'node:child_process'
import readline from 'node:readline'

/**
 * Minimal extension runtime. An extension is a normal child process that speaks
 * newline-delimited JSON-RPC on stdin/stdout:
 *
 *   host -> extension: initialize, tools/list, tools/call, hook
 *   extension -> host: { jsonrpc: "2.0", id, result } | { ..., error }
 *
 * stdout is reserved for protocol messages. Use console.error for logs.
 */
export function serve(handlers) {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`)

  rl.on('line', async (line) => {
    if (!line.trim()) return
    let request
    try {
      request = JSON.parse(line)
    } catch {
      console.error('[sdk] ignoring non-JSON input')
      return
    }
    const { id, method, params = {} } = request
    if (typeof id !== 'number') return
    try {
      let result
      if (method === 'initialize') {
        result = {
          protocolVersion: 1,
          name: params.name,
          capabilities: { tools: true, hooks: true }
        }
      } else if (method === 'tools/list') {
        result = { tools: handlers.tools ?? [] }
      } else if (method === 'tools/call') {
        const tool = (handlers.tools ?? []).find((entry) => entry.name === params.name)
        if (!tool) throw new Error(`unknown tool: ${params.name}`)
        if (!handlers.call) throw new Error('extension does not implement tools/call')
        result = await handlers.call(params.name, params.arguments ?? {}, params)
      } else if (method === 'hook') {
        result = handlers.hook ? await handlers.hook(params.name, params.data ?? {}, params) : { ok: true }
      } else {
        throw new Error(`unknown method: ${method}`)
      }
      send({ jsonrpc: '2.0', id, result })
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id,
        error: { code: -32000, message: error instanceof Error ? error.message : String(error) }
      })
    }
  })
}

export function ok(content) {
  return {
    content: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
    isError: false
  }
}

export function fail(content) {
  return {
    content: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
    isError: true
  }
}

export function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: false
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, options.timeoutMs ?? 600_000)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
      if (stdout.length > 200_000) stdout = stdout.slice(-200_000)
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
      if (stderr.length > 200_000) stderr = stderr.slice(-200_000)
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? 1, stdout, stderr, timedOut })
    })
  })
}

export function formatRun(result) {
  const parts = []
  if (result.stdout.trim()) parts.push(`stdout:\n${result.stdout.trimEnd()}`)
  if (result.stderr.trim()) parts.push(`stderr:\n${result.stderr.trimEnd()}`)
  parts.push(`exit code: ${result.code}${result.timedOut ? ' (timed out)' : ''}`)
  return parts.join('\n\n')
}
