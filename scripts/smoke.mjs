import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { resolveInProject, unsafeCommand } from '../dist-server/fsx.js'

const repo = process.cwd()
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ks-agent-smoke-'))
const projectsDir = path.join(temp, 'projects')
const dataDir = path.join(temp, 'data')
const extensionsDir = path.join(temp, 'extensions')
const skillsDir = path.join(temp, 'skills')
const mcpConfigPath = path.join(temp, 'mcp.json')
const lspConfigPath = path.join(temp, 'lsp.json')
fs.mkdirSync(projectsDir, { recursive: true })
fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(extensionsDir, { recursive: true })
fs.mkdirSync(skillsDir, { recursive: true })
fs.copyFileSync(path.join(repo, 'extensions', 'sdk.mjs'), path.join(extensionsDir, 'sdk.mjs'))
const mockExtensionDir = path.join(extensionsDir, 'mock')
fs.mkdirSync(mockExtensionDir, { recursive: true })
fs.writeFileSync(
  path.join(mockExtensionDir, 'extension.json'),
  JSON.stringify(
    {
      name: 'mock',
      version: '1.0.0',
      description: 'Smoke-test extension (created in a temp folder, not shipped)',
      command: ['node', 'index.mjs'],
      permissions: { projectWrite: true },
      tools: [
        {
          name: 'write_note',
          description: 'Write a text file inside the project',
          parameters: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' }
            },
            required: ['path', 'content']
          }
        }
      ]
    },
    null,
    2
  )
)
fs.writeFileSync(
  path.join(mockExtensionDir, 'index.mjs'),
  `import fs from 'node:fs'
import path from 'node:path'
import { serve, ok, fail } from '../sdk.mjs'

serve({
  async call(name, args, params) {
    if (name !== 'write_note') return fail('unknown tool: ' + name)
    const root = path.resolve(params.projectPath ?? '')
    const target = path.resolve(root, String(args.path ?? 'note.txt'))
    if (target !== root && !target.startsWith(root + path.sep)) return fail('path escapes project')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, String(args.content ?? ''), 'utf8')
    return ok('wrote ' + path.relative(root, target))
  }
})
`
)

const smokeSkillDir = path.join(skillsDir, 'smoke-skill')
fs.mkdirSync(smokeSkillDir, { recursive: true })
fs.writeFileSync(
  path.join(smokeSkillDir, 'SKILL.md'),
  `---
name: smoke-skill
description: Smoke-test skill that tells the agent to answer SKILL_OK
---

# Smoke Skill

When this skill is loaded, include SKILL_OK in your answer.
`
)

const mcpServerPath = path.join(temp, 'mcp-server.mjs')
fs.writeFileSync(
  mcpServerPath,
  `import readline from 'node:readline'
const send = (message) => process.stdout.write(JSON.stringify(message) + '\\n')
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    return
  }
  if (message.id === undefined) return
  if (message.method === 'initialize') {
    send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'mock-mcp', version: '1.0.0' } } })
  } else if (message.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: message.id, result: { tools: [{ name: 'echo', description: 'Echo text back', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }] } })
  } else if (message.method === 'tools/call') {
    const text = String(message.params?.arguments?.text ?? '')
    send({ jsonrpc: '2.0', id: message.id, result: { content: [{ type: 'text', text: 'mcp-echo: ' + text }] } })
  } else {
    send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'unknown method ' + message.method } })
  }
})
`
)
fs.writeFileSync(
  mcpConfigPath,
  JSON.stringify(
    {
      mcpServers: {
        mockmcp: { command: process.execPath, args: [mcpServerPath] }
      }
    },
    null,
    2
  )
)

const lspServerPath = path.join(temp, 'lsp-server.mjs')
fs.writeFileSync(
  lspServerPath,
  `const send = (message) => {
  const body = JSON.stringify(message)
  process.stdout.write('Content-Length: ' + Buffer.byteLength(body) + '\\r\\n\\r\\n' + body)
}
let buffer = Buffer.alloc(0)
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  for (;;) {
    const headerEnd = buffer.indexOf('\\r\\n\\r\\n')
    if (headerEnd === -1) return
    const header = buffer.subarray(0, headerEnd).toString('ascii')
    const length = Number(/Content-Length:\\s*(\\d+)/i.exec(header)?.[1] ?? 0)
    const start = headerEnd + 4
    if (buffer.length < start + length) return
    const body = buffer.subarray(start, start + length).toString('utf8')
    buffer = buffer.subarray(start + length)
    let message
    try {
      message = JSON.parse(body)
    } catch {
      continue
    }
    if (message.method === 'initialize' && message.id !== undefined) {
      send({ jsonrpc: '2.0', id: message.id, result: { capabilities: { textDocumentSync: 1 } } })
    } else if (message.method === 'textDocument/didOpen' || message.method === 'textDocument/didChange') {
      send({ jsonrpc: '2.0', method: 'textDocument/publishDiagnostics', params: { uri: message.params.textDocument.uri, diagnostics: [{ range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } }, severity: 1, source: 'mock-lsp', message: 'Mock type error' }] } })
    } else if (message.method === 'shutdown' && message.id !== undefined) {
      send({ jsonrpc: '2.0', id: message.id, result: null })
    } else if (message.method === 'exit') {
      process.exit(0)
    } else if (message.id !== undefined) {
      send({ jsonrpc: '2.0', id: message.id, result: null })
    }
  }
})
`
)
fs.writeFileSync(
  lspConfigPath,
  JSON.stringify(
    {
      languageServers: {
        mocklsp: {
          command: process.execPath,
          args: [lspServerPath],
          extensions: ['.ts'],
          languageId: 'typescript'
        },
        brokenlsp: {
          command: 'ks-agent-definitely-missing-lsp',
          args: [],
          extensions: ['.zz'],
          languageId: 'zz'
        }
      }
    },
    null,
    2
  )
)

const logs = []
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function fail(message, detail) {
  console.error(`\nSMOKE FAIL: ${message}`)
  if (detail) console.error(detail)
  console.error('\n--- server log ---\n' + logs.join(''))
  cleanup()
  process.exit(1)
}

let child = null
let mock = null
let lastProviderBody = null

function cleanup() {
  if (child && child.exitCode === null) {
    try {
      child.kill('SIGTERM')
    } catch {
      // ignore
    }
  }
  if (mock) {
    try {
      mock.close()
    } catch {
      // ignore
    }
  }
  try {
    fs.rmSync(temp, { recursive: true, force: true })
  } catch {
    // ignore
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      server.close(() => resolve(port))
    })
  })
}

function sse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk.toString()
    })
    req.on('end', () => resolve(raw))
  })
}

function mcpResult(message) {
  if (message.method === 'initialize') {
    return {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'mock-mcp-http', version: '1.0.0' }
    }
  }
  if (message.method === 'tools/list') {
    return {
      tools: [
        {
          name: 'echo',
          description: 'Echo text over HTTP',
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text']
          }
        }
      ]
    }
  }
  if (message.method === 'tools/call') {
    return {
      content: [{ type: 'text', text: `http-echo: ${String(message.params?.arguments?.text ?? '')}` }]
    }
  }
  return null
}

function startMockProvider() {
  return new Promise((resolve) => {
    let retryAttempts = 0
    let noRetryAttempts = 0
    let rateLimitAttempts = 0
    let unlimitedAttempts = 0
    let sseClient = null
    mock = http.createServer((req, res) => {
      const url = req.url ?? ''
      if (url === '/sse') {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive'
        })
        sseClient = res
        res.write('event: endpoint\ndata: /sse-message\n\n')
        req.on('close', () => {
          if (sseClient === res) sseClient = null
        })
        return
      }
      if (url === '/sse-message' || url === '/mcp') {
        void readBody(req).then((raw) => {
          let message
          try {
            message = JSON.parse(raw)
          } catch {
            res.writeHead(400)
            res.end('bad json')
            return
          }
          if (message.id === undefined) {
            res.writeHead(202)
            res.end()
            return
          }
          const result = mcpResult(message)
          if (!result) {
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'unknown method' } }))
            return
          }
          if (url === '/sse-message') {
            if (sseClient) {
              sseClient.write(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result })}\n\n`)
            }
            res.writeHead(202)
            res.end()
            return
          }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
        })
        return
      }
      if (!url.endsWith('/chat/completions')) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      let raw = ''
      req.on('data', (chunk) => {
        raw += chunk.toString()
      })
      req.on('end', () => {
        let body = {}
        try {
          body = JSON.parse(raw)
        } catch {
          res.writeHead(400)
          res.end('bad json')
          return
        }
        lastProviderBody = body
        const messages = Array.isArray(body.messages) ? body.messages : []
        const lastUser = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
        const systemPrompt = messages.find((message) => message.role === 'system')?.content ?? ''
        const hasTool = (id) => messages.some((message) => message.role === 'tool' && message.tool_call_id === id)
        const providerError = (status, message, code) => {
          res.writeHead(status, {
            'content-type': 'application/json',
            'retry-after': '0'
          })
          res.end(JSON.stringify({ error: { message, type: 'mock_error', code } }))
        }
        if (systemPrompt.includes('rolling handoff summary')) {
          res.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive'
          })
          sse(res, {
            choices: [
              {
                delta: {
                  role: 'assistant',
                  content:
                    '## Objective\nCompaction smoke summary.\n\n## Important Details\n- Mock summary generated during smoke.\n\n## Work State\n### Completed\n- Earlier messages were compacted.\n\n### Active\n- Continuing the chat.\n\n### Blocked\n- None\n\n## Next Move\n1. Answer the latest message.\n\n## Relevant Files\n- hello.txt'
                },
                finish_reason: null
              }
            ]
          })
          sse(res, { choices: [{ delta: {}, finish_reason: 'stop' }] })
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }
        if (lastUser.includes('rate limit no retry') && noRetryAttempts++ === 0) {
          providerError(429, 'Rate limit reached for the mock model', 'rate_limit_exceeded')
          return
        }
        if (lastUser.includes('unlimited retry storm') && unlimitedAttempts++ < 2) {
          providerError(429, 'Rate limit reached for the mock model', 'rate_limit_exceeded')
          return
        }
        if (lastUser.includes('rate limit retry') && rateLimitAttempts++ === 0) {
          providerError(429, 'Rate limit reached for the mock model', 'rate_limit_exceeded')
          return
        }
        if (lastUser.includes('bad request test')) {
          providerError(400, 'Invalid request: missing mock field', 'invalid_request')
          return
        }
        if (lastUser.includes('retry after a provider error') && retryAttempts++ === 0) {
          res.writeHead(500, { 'content-type': 'text/plain' })
          res.end('temporary provider failure')
          return
        }
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive'
        })

        if (lastUser.includes('slow')) {
          sse(res, { choices: [{ delta: { role: 'assistant', content: 'partial response' }, finish_reason: null }] })
          const timer = setTimeout(() => {
            sse(res, { choices: [{ delta: { content: ' finished' }, finish_reason: null }] })
            sse(res, { choices: [{ delta: {}, finish_reason: 'stop' }] })
            res.write('data: [DONE]\n\n')
            res.end()
          }, 5000)
          res.on('close', () => clearTimeout(timer))
          return
        }

        if (lastUser.includes('inspect extensions') && !hasTool('call_extensions')) {
          sse(res, {
            choices: [
              {
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_extensions',
                      type: 'function',
                      function: {
                        name: 'list_chat_extensions',
                        arguments: '{}'
                      }
                    }
                  ]
                },
                finish_reason: null
              }
            ]
          })
          sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }

        if (lastUser.includes('skill') && !hasTool('call_skill')) {
          sse(res, {
            choices: [
              {
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_skill',
                      type: 'function',
                      function: {
                        name: 'use_skill',
                        arguments: JSON.stringify({ name: 'smoke-skill' })
                      }
                    }
                  ]
                },
                finish_reason: null
              }
            ]
          })
          sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }

        const mcpCall = lastUser.includes('mcp http')
          ? { id: 'call_mcp_http', name: 'mcp_mockhttp_echo', text: 'hello-http' }
          : lastUser.includes('mcp sse')
            ? { id: 'call_mcp_sse', name: 'mcp_mocksse_echo', text: 'hello-sse' }
            : lastUser.includes('mcp')
              ? { id: 'call_mcp', name: 'mcp_mockmcp_echo', text: 'hello-mcp' }
              : null
        if (mcpCall && !hasTool(mcpCall.id)) {
          sse(res, {
            choices: [
              {
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: mcpCall.id,
                      type: 'function',
                      function: {
                        name: mcpCall.name,
                        arguments: JSON.stringify({ text: mcpCall.text })
                      }
                    }
                  ]
                },
                finish_reason: null
              }
            ]
          })
          sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }

        if (lastUser.includes('broken diagnostics') && !hasTool('call_lsp_broken')) {
          sse(res, {
            choices: [
              {
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_lsp_broken',
                      type: 'function',
                      function: {
                        name: 'lsp_diagnostics',
                        arguments: JSON.stringify({ path: 'broken.zz' })
                      }
                    }
                  ]
                },
                finish_reason: null
              }
            ]
          })
          sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }

        if (lastUser.includes('diagnostics again') && !hasTool('call_lsp_again')) {
          sse(res, {
            choices: [
              {
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_lsp_again',
                      type: 'function',
                      function: {
                        name: 'lsp_diagnostics',
                        arguments: JSON.stringify({ path: 'broken.ts' })
                      }
                    }
                  ]
                },
                finish_reason: null
              }
            ]
          })
          sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }

        if (lastUser.includes('diagnostics') && !hasTool('call_lsp')) {
          sse(res, {
            choices: [
              {
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_lsp',
                      type: 'function',
                      function: {
                        name: 'lsp_diagnostics',
                        arguments: JSON.stringify({ path: 'broken.ts' })
                      }
                    }
                  ]
                },
                finish_reason: null
              }
            ]
          })
          sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }

        if (lastUser.includes('note') && !hasTool('call_mock')) {
          sse(res, {
            choices: [
              {
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_mock',
                      type: 'function',
                      function: {
                        name: 'ext_mock_write_note',
                        arguments: JSON.stringify({ path: 'extension.txt', content: 'from extension' })
                      }
                    }
                  ]
                },
                finish_reason: null
              }
            ]
          })
          sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }

        if (lastUser.includes('find') && !hasTool('call_find')) {
          sse(res, {
            choices: [
              {
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_find',
                      type: 'function',
                      function: {
                        name: 'find_files',
                        arguments: JSON.stringify({ query: 'hello.txt' })
                      }
                    }
                  ]
                },
                finish_reason: null
              }
            ]
          })
          sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }

        if (lastUser.includes('hello') && !hasTool('call_1')) {
          sse(res, {
            choices: [
              {
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_1',
                      type: 'function',
                      function: {
                        name: 'write_file',
                        arguments: JSON.stringify({ path: 'hello.txt', content: 'hello from smoke' })
                      }
                    }
                  ]
                },
                finish_reason: null
              }
            ]
          })
          sse(res, { choices: [{ delta: {}, finish_reason: 'tool_calls' }] })
          res.write('data: [DONE]\n\n')
          res.end()
          return
        }

        sse(res, { choices: [{ delta: { role: 'assistant', content: 'Done. ' }, finish_reason: null }] })
        sse(res, { choices: [{ delta: { content: 'Task complete.' }, finish_reason: null }] })
        sse(res, { choices: [{ delta: {}, finish_reason: 'stop' }] })
        res.write('data: [DONE]\n\n')
        res.end()
      })
    })
    mock.listen(0, '127.0.0.1', () => resolve(mock.address().port))
  })
}

async function rawApi(method, url, body) {
  const res = await fetch(`http://127.0.0.1:${serverPort}${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const text = await res.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch {
    // keep text
  }
  return { status: res.status, data, text }
}

async function api(method, url, body) {
  const result = await rawApi(method, url, body)
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${method} ${url} -> ${result.status}: ${result.text.slice(0, 500)}`)
  }
  return result.data
}

async function readEvents(response) {
  const text = await response.text()
  const events = []
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue
    const data = line.slice(5).trim()
    if (!data) continue
    try {
      events.push(JSON.parse(data))
    } catch {
      // ignore
    }
  }
  return { events, text }
}

async function sendMessage(chatId, content, modelId) {
  const res = await fetch(`http://127.0.0.1:${serverPort}/api/chats/${chatId}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content, modelId })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`send message -> ${res.status}: ${text.slice(0, 500)}`)
  }
  const eventsRes = await fetch(`http://127.0.0.1:${serverPort}/api/chats/${chatId}/events`)
  if (!eventsRes.ok) {
    const text = await eventsRes.text()
    throw new Error(`subscribe events -> ${eventsRes.status}: ${text.slice(0, 500)}`)
  }
  return readEvents(eventsRes)
}

function callExtension(dir, tool, args, projectPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(dir, 'index.mjs')], {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const pending = new Map()
    const errors = []
    let seq = 0
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`extension ${dir} timed out\n${errors.join('\n')}`))
    }, 30_000)

    const rl = readline.createInterface({ input: child.stdout })
    rl.on('line', (line) => {
      let message
      try {
        message = JSON.parse(line)
      } catch {
        return
      }
      const entry = pending.get(message.id)
      if (!entry) return
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(message.error.message))
      else entry.resolve(message.result)
    })
    child.stderr.on('data', (chunk) => errors.push(chunk.toString()))
    child.on('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })

    const request = (method, params) => {
      const id = ++seq
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      return new Promise((resolveRequest, rejectRequest) => {
        pending.set(id, { resolve: resolveRequest, reject: rejectRequest })
      })
    }

    void (async () => {
      try {
        await request('initialize', { protocolVersion: 1, name: path.basename(dir) })
        const result = await request('tools/call', { name: tool, arguments: args, projectPath })
        clearTimeout(timer)
        rl.close()
        child.kill('SIGTERM')
        resolve(result)
      } catch (error) {
        clearTimeout(timer)
        rl.close()
        child.kill('SIGTERM')
        reject(error)
      }
    })()
  })
}

function assert(condition, message, detail) {
  if (!condition) fail(message, detail)
}

let serverPort = 0

async function main() {
  const mockPort = await startMockProvider()
  serverPort = await freePort()
  fs.writeFileSync(
    mcpConfigPath,
    JSON.stringify(
      {
        mcpServers: {
          mockmcp: { command: process.execPath, args: [mcpServerPath] },
          mockhttp: { url: `http://127.0.0.1:${mockPort}/mcp` },
          mocksse: { url: `http://127.0.0.1:${mockPort}/sse` }
        }
      },
      null,
      2
    )
  )

  child = spawn(process.execPath, [path.join(repo, 'dist-server', 'index.js')], {
    cwd: repo,
    env: {
      ...process.env,
      PORT: String(serverPort),
      KS_ROOT_DIR: repo,
      KS_DATA_DIR: dataDir,
      KS_PROJECTS_DIR: projectsDir,
      KS_EXTENSIONS_DIR: extensionsDir,
      KS_SKILLS_DIR: skillsDir,
      KS_MCP_CONFIG: mcpConfigPath,
      KS_LSP_CONFIG: lspConfigPath,
      KS_MAX_STEPS: '10'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => logs.push(chunk.toString()))
  child.stderr.on('data', (chunk) => logs.push(chunk.toString()))

  let healthy = false
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) fail(`server exited early with code ${child.exitCode}`)
    try {
      const res = await fetch(`http://127.0.0.1:${serverPort}/api/health`)
      if (res.ok) {
        healthy = true
        break
      }
    } catch {
      // not up yet
    }
    await sleep(100)
  }
  assert(healthy, 'server did not become healthy')

  console.log('PASS health')

  const project = await api('POST', '/api/projects', { name: 'smoke' })
  assert(project.id && fs.existsSync(project.path), 'project folder was not created')
  assert(resolveInProject(project.path, '../escape') === null, 'path jail allowed ../')
  assert(resolveInProject(project.path, '/etc/passwd') === null, 'path jail allowed an absolute path')
  assert(unsafeCommand('cat ../secret', project.path), 'shell guard allowed traversal')
  assert(unsafeCommand('rm -rf /', project.path), 'shell guard allowed rm -rf /')
  assert(unsafeCommand('npm run build', project.path) === null, 'shell guard blocked a safe command')
  const otherProject = await api('POST', '/api/projects', { name: 'smoke-other' })
  assert(otherProject.id && otherProject.id !== project.id, 'second project was not created')
  console.log('PASS project create + path/shell guards')

  process.env.KS_DATA_DIR = path.join(temp, 'tool-data')
  process.env.KS_PROJECTS_DIR = path.join(temp, 'tool-projects')
  process.env.KS_EXTENSIONS_DIR = path.join(temp, 'tool-extensions')
  const { executeBuiltinTool } = await import('../dist-server/tools.js')
  const callTool = (name, args) => executeBuiltinTool(name, args, { projectPath: project.path })
  const okTool = async (name, args) => {
    const result = await callTool(name, args)
    assert(result.ok, `${name} failed: ${result.output}`)
    return result.output
  }
  const failTool = async (name, args) => {
    const result = await callTool(name, args)
    assert(!result.ok, `${name} should have failed but returned: ${result.output}`)
    return result.output
  }

  await okTool('create_dir', { path: 'src/utils' })
  await okTool('create_dir', { path: 'docs' })
  await okTool('write_file', {
    path: 'src/utils/math.ts',
    content: 'export const sum = (a: number, b: number) => a + b\n'
  })
  await okTool('write_file', {
    path: 'src/index.ts',
    content: "import { sum } from './utils/math'\nconsole.log(sum(1, 2))\n"
  })
  await okTool('write_file', { path: 'docs/readme.md', content: '# Smoke docs\n' })

  const byName = await okTool('find_files', { query: 'math' })
  assert(byName.includes('src/utils/math.ts'), `find_files by name missed math.ts: ${byName}`)
  const byGlob = await okTool('find_files', { query: '*.md', match: 'glob' })
  assert(byGlob.includes('docs/readme.md'), `find_files glob missed readme.md: ${byGlob}`)
  const byRegex = await okTool('find_files', { query: '^math\\.ts$', match: 'regex' })
  assert(byRegex.includes('src/utils/math.ts'), `find_files regex missed math.ts: ${byRegex}`)
  const byDir = await okTool('find_files', { query: 'utils', type: 'dir' })
  assert(byDir.includes('src/utils/'), `find_files dir search missed src/utils: ${byDir}`)
  const byUpper = await okTool('find_files', { query: 'MATH.TS' })
  assert(byUpper.includes('src/utils/math.ts'), `find_files case-insensitive search missed math.ts: ${byUpper}`)
  await failTool('find_files', { query: 'math', path: '../' })
  const tree = await okTool('tree', { path: '.', depth: 3 })
  assert(
    tree.includes('src/') && tree.includes('utils/') && tree.includes('math.ts'),
    `tree output is incomplete: ${tree}`
  )

  const globbed = await okTool('glob', { pattern: '**/*.ts' })
  assert(globbed.includes('src/index.ts') && globbed.includes('src/utils/math.ts'), `glob missed files: ${globbed}`)
  const grepped = await okTool('grep', { pattern: 'export const sum', include: '*.ts' })
  assert(grepped.includes('src/utils/math.ts'), `grep missed math.ts: ${grepped}`)
  const read = await okTool('read_file', { path: 'src/index.ts' })
  assert(read.includes('1: ') && read.includes("import { sum }"), `read_file output is wrong: ${read}`)
  await okTool('edit_file', { path: 'src/index.ts', old_string: 'sum(1, 2)', new_string: 'sum(2, 3)' })
  assert(
    fs.readFileSync(path.join(project.path, 'src', 'index.ts'), 'utf8').includes('sum(2, 3)'),
    'edit_file failed'
  )
  const listed = await okTool('list_dir', { path: 'src' })
  assert(listed.includes('utils/'), `list_dir missed utils: ${listed}`)
  const info = await okTool('get_file_info', { path: 'src/utils/math.ts' })
  assert(info.includes('lines:'), `get_file_info missing line count: ${info}`)
  await okTool('update_plan', { title: 'Tools smoke', steps: [{ text: 'test tools', done: true }] })
  assert(fs.readFileSync(path.join(project.path, 'plan.md'), 'utf8').includes('[x] test tools'), 'update_plan failed')

  await okTool('append_file', {
    path: 'src/utils/math.ts',
    content: 'export const diff = (a: number, b: number) => a - b\n'
  })
  const mathFile = path.join(project.path, 'src', 'utils', 'math.ts')
  assert(fs.readFileSync(mathFile, 'utf8').includes('export const diff'), 'append_file failed')
  await okTool('copy_file', { from: 'src/utils/math.ts', to: 'src/utils/math.copy.ts' })
  assert(
    fs.readFileSync(path.join(project.path, 'src', 'utils', 'math.copy.ts'), 'utf8').includes('export const diff'),
    'copy_file failed'
  )
  await failTool('copy_file', { from: 'src/utils/math.ts', to: 'src/utils/math.copy.ts' })
  await okTool('copy_file', { from: 'src/utils/math.ts', to: 'src/utils/math.copy.ts', overwrite: true })
  await okTool('copy_file', { from: 'src/utils', to: 'src/utils-copy' })
  assert(
    fs.readFileSync(path.join(project.path, 'src', 'utils-copy', 'math.ts'), 'utf8').includes('export const diff'),
    'copy_file directory copy failed'
  )
  await okTool('delete_file', { path: 'src/utils-copy', recursive: true })
  const multi = await okTool('read_multiple_files', { paths: ['src/index.ts', 'docs/readme.md'] })
  assert(
    multi.includes('=== src/index.ts ===') && multi.includes('=== docs/readme.md ==='),
    `read_multiple_files missed headers: ${multi}`
  )
  await failTool('read_multiple_files', { paths: ['../outside.txt'] })
  await okTool('move_file', { from: 'src/utils/math.copy.ts', to: 'src/utils/math.moved.ts' })
  assert(fs.existsSync(path.join(project.path, 'src', 'utils', 'math.moved.ts')), 'move_file failed')
  await okTool('delete_file', { path: 'src/utils/math.moved.ts' })
  assert(!fs.existsSync(path.join(project.path, 'src', 'utils', 'math.moved.ts')), 'delete_file failed')

  await okTool('write_file', { path: 'patch-demo.txt', content: 'alpha\nbeta\ngamma\ndelta\nepsilon\n' })
  await okTool('apply_patch', {
    path: 'patch-demo.txt',
    patch: [
      '--- a/patch-demo.txt',
      '+++ b/patch-demo.txt',
      '@@ -2,1 +2,1 @@',
      '-beta',
      '+BETA',
      '@@ -4,1 +4,2 @@',
      '-delta',
      '+DELTA',
      '+DELTA2'
    ].join('\n')
  })
  assert(
    fs.readFileSync(path.join(project.path, 'patch-demo.txt'), 'utf8') === 'alpha\nBETA\ngamma\nDELTA\nDELTA2\nepsilon\n',
    'apply_patch multi-hunk result is wrong'
  )
  await okTool('write_file', { path: 'new-from-patch.txt', content: '' })
  await okTool('apply_patch', { path: 'new-from-patch.txt', patch: '@@ -0,0 +1,2 @@\n+hello\n+patch\n' })
  assert(
    fs.readFileSync(path.join(project.path, 'new-from-patch.txt'), 'utf8') === 'hello\npatch\n',
    'apply_patch new-file result is wrong'
  )
  await failTool('apply_patch', {
    path: 'patch-demo.txt',
    patch: '@@ -1,1 +1,1 @@\n-nope\n+x\n'
  })

  const shell = await okTool('run_shell', { command: 'printf shell-ok' })
  assert(shell.includes('shell-ok') && shell.includes('exit code: 0'), `run_shell failed: ${shell}`)
  console.log('PASS file tools (find/tree/glob/grep/list/info/plan/append/copy/move/delete/patch/shell)')

  await okTool('git_init', { branch: 'main' })
  assert((await okTool('git_status', {})).includes('branch: main'), 'git_init did not create branch main')
  await okTool('git_commit', { message: 'initial tools smoke' })
  assert((await okTool('git_log', { limit: 5 })).includes('initial tools smoke'), 'git_log missed commit')
  await okTool('git_branch', { action: 'create', name: 'feature/tools' })
  assert((await okTool('git_status', {})).includes('branch: feature/tools'), 'git_branch did not checkout')
  await okTool('append_file', { path: 'docs/readme.md', content: '\nfeature line\n' })
  assert((await okTool('git_diff', { file: 'docs/readme.md' })).includes('feature line'), 'git_diff missed change')
  await okTool('git_commit', { message: 'add feature line' })
  await okTool('git_branch', { action: 'checkout', name: 'main' })
  const remotePath = path.join(temp, 'remote.git')
  execFileSync('git', ['init', '--bare', remotePath], { stdio: 'ignore' })
  execFileSync('git', ['remote', 'add', 'origin', remotePath], { cwd: project.path })
  assert((await okTool('git_push', { remote: 'origin', branch: 'main' })).length > 0, 'git_push returned no output')
  assert((await okTool('git_pull', { remote: 'origin', branch: 'main' })).length > 0, 'git_pull returned no output')
  await failTool('git_diff', { file: '../outside.txt' })
  await failTool('git_branch', { action: 'create', name: 'bad name' })
  console.log('PASS git tools (init/status/diff/log/branch/commit/push/pull + guards)')

  fs.writeFileSync(
    path.join(project.path, 'broken.ts'),
    'export const value: number = 1\nconst wrong: string = value\n'
  )

  const provider = await api('POST', '/api/providers', {
    name: 'mock',
    baseUrl: `http://127.0.0.1:${mockPort}/v1`,
    apiKey: 'test-key'
  })
  assert(provider.hasKey === true && provider.apiKey === undefined, 'provider key was exposed')
  const model = await api('POST', '/api/models', {
    providerId: provider.id,
    name: 'Mock Model',
    modelId: 'mock-model',
    contextWindow: 64_000
  })
  assert(model.contextWindow === 64_000, `model context window was not saved: ${model.contextWindow}`)
  const updatedModel = await api('PATCH', `/api/models/${model.id}`, { contextWindow: 200_000 })
  assert(updatedModel.contextWindow === 200_000, 'model context window was not updated')
  const invalidModelContext = await rawApi('PATCH', `/api/models/${model.id}`, { contextWindow: 5 })
  assert(invalidModelContext.status === 400, 'invalid context window was accepted')
  console.log('PASS provider/model (key masked, context window)')

  const compactModel = await api('POST', '/api/models', {
    providerId: provider.id,
    name: 'Compaction Model',
    modelId: 'mock-compact',
    contextWindow: 10_000
  })
  const compactChat = await api('POST', `/api/projects/${project.id}/chats`, {
    title: 'compaction smoke',
    modelId: compactModel.id
  })
  const longPrompt = `compaction-first-marker ${'context '.repeat(5_000)}`
  const compactFirst = await sendMessage(compactChat.id, longPrompt, compactModel.id)
  assert(compactFirst.events.some((event) => event.type === 'done'), 'compaction seed message did not finish')
  const compactSecond = await sendMessage(compactChat.id, 'compaction second message', compactModel.id)
  const summaryStart = compactSecond.events.find((event) => event.type === 'summary_start')
  const summaryEvent = compactSecond.events.find((event) => event.type === 'summary')
  assert(summaryStart, 'context compaction did not start', compactSecond.text.slice(0, 1000))
  assert(summaryEvent, 'context compaction did not emit a summary', compactSecond.text.slice(0, 1000))
  assert(
    compactSecond.events.some((event) => event.type === 'done'),
    'compaction run did not finish',
    compactSecond.text.slice(0, 1000)
  )
  const savedSummary = await api('GET', `/api/chats/${compactChat.id}/summary`)
  assert(savedSummary && savedSummary.summary.includes('Compaction smoke summary'), 'summary was not persisted')
  assert(savedSummary.coveredMessageId, 'summary cutoff was not persisted')
  const compactSystem = (lastProviderBody?.messages ?? []).find((message) => message.role === 'system')?.content ?? ''
  assert(
    compactSystem.includes('## Conversation summary (older messages; authoritative handoff)'),
    'summary was not added to the system prompt'
  )
  assert(
    !(lastProviderBody?.messages ?? []).some(
      (message) => typeof message.content === 'string' && message.content.includes('compaction-first-marker')
    ),
    'compacted messages were still sent to the provider'
  )
  const editedSummary = await api('PUT', `/api/chats/${compactChat.id}/summary`, {
    summary: '## Objective\nEdited handoff summary.'
  })
  assert(editedSummary.summary.includes('Edited handoff summary'), 'summary edit was not saved')
  assert(
    editedSummary.coveredMessageId === savedSummary.coveredMessageId,
    'summary edit did not keep the cutoff'
  )
  const emptySummary = await rawApi('PUT', `/api/chats/${compactChat.id}/summary`, { summary: '   ' })
  assert(emptySummary.status === 400, 'empty summary was accepted')
  await api('DELETE', `/api/chats/${compactChat.id}/summary`)
  const deletedSummary = await api('GET', `/api/chats/${compactChat.id}/summary`)
  assert(deletedSummary === null, 'summary was not deleted')
  const missingSummary = await rawApi('GET', '/api/chats/missing-chat/summary')
  assert(missingSummary.status === 404, 'summary route did not reject a missing chat')
  console.log('PASS context compaction + summary API')

  const retryDefaults = await api('GET', '/api/settings/retry')
  assert(retryDefaults.enabled === true, 'retry should default to enabled')
  assert(retryDefaults.unlimited === false, 'retry should default to limited')
  assert(retryDefaults.maxRetries === 2, `unexpected default retries: ${retryDefaults.maxRetries}`)
  assert(retryDefaults.retryOnStatusCodes.includes(429), 'default retry codes should include 429')
  const clampedRetry = await api('PUT', '/api/settings/retry', {
    ...retryDefaults,
    maxRetries: -5,
    baseDelayMs: 1,
    maxDelayMs: 1,
    multiplier: 99,
    retryOnStatusCodes: [429, 999, 'bad', 500]
  })
  assert(clampedRetry.maxRetries === 0, 'negative retries were not clamped')
  assert(clampedRetry.baseDelayMs === 100, 'base delay was not clamped')
  assert(clampedRetry.maxDelayMs === 100, 'max delay was not clamped to the base delay')
  assert(clampedRetry.multiplier === 10, 'multiplier was not clamped')
  assert(
    JSON.stringify(clampedRetry.retryOnStatusCodes) === JSON.stringify([429, 500]),
    `invalid status codes were not filtered: ${JSON.stringify(clampedRetry.retryOnStatusCodes)}`
  )
  await api('PUT', '/api/settings/retry', retryDefaults)
  console.log('PASS retry settings defaults + validation')

  const chat = await api('POST', `/api/projects/${project.id}/chats`, {
    title: 'smoke chat',
    modelId: model.id
  })

  const first = await sendMessage(chat.id, 'create hello.txt', model.id)
  const toolEnd = first.events.find((event) => event.type === 'tool_end')
  assert(toolEnd, 'agent did not emit tool_end', first.text.slice(0, 1000))
  assert(toolEnd.result.ok === true, `write_file failed: ${toolEnd.result.output}`)
  assert(first.events.some((event) => event.type === 'done'), 'agent did not finish')
  const hello = fs.readFileSync(path.join(project.path, 'hello.txt'), 'utf8')
  assert(hello === 'hello from smoke', `unexpected hello.txt content: ${hello}`)
  console.log('PASS agent loop + built-in tool + persistence')

  const found = await sendMessage(chat.id, 'find the hello file', model.id)
  const findTool = found.events.find((event) => event.type === 'tool_end' && event.call.name === 'find_files')
  assert(findTool, 'agent did not call find_files', found.text.slice(0, 1000))
  assert(findTool.result.ok === true && findTool.result.output.includes('hello.txt'), `find_files failed: ${findTool.result.output}`)
  console.log('PASS agent loop + find_files tool')

  const retried = await sendMessage(chat.id, 'retry after a provider error', model.id)
  assert(!retried.events.some((event) => event.type === 'error'), 'provider retry did not recover')
  assert(retried.events.some((event) => event.type === 'done'), 'provider retry did not finish')
  console.log('PASS provider retry')

  const badRequest = await sendMessage(chat.id, 'bad request test', model.id)
  const badFailure = badRequest.events.find((event) => event.type === 'error')
  assert(badFailure, '400 response did not surface an error event', badRequest.text.slice(0, 1200))
  assert(badFailure.status === 400, `error event lost the status: ${JSON.stringify(badFailure)}`)
  assert(badFailure.title === 'Bad Request', `error event lost the title: ${JSON.stringify(badFailure)}`)
  assert(badFailure.code === 'invalid_request', `error event lost provider code: ${JSON.stringify(badFailure)}`)
  assert(
    badFailure.message === 'Invalid request: missing mock field',
    `error event lost provider message: ${JSON.stringify(badFailure)}`
  )
  assert(badFailure.attempts === 1, `400 should not be retried: ${JSON.stringify(badFailure)}`)
  assert(!badRequest.events.some((event) => event.type === 'retry'), '400 should not emit retry events')
  console.log('PASS provider error code + message details')

  await api('PUT', '/api/settings/retry', { ...retryDefaults, enabled: false })
  const disabledRetry = await sendMessage(chat.id, 'rate limit no retry', model.id)
  const disabledFailure = disabledRetry.events.find((event) => event.type === 'error')
  assert(disabledFailure, 'disabled retry did not surface the 429 error', disabledRetry.text.slice(0, 1200))
  assert(disabledFailure.status === 429, `disabled retry lost the 429 status: ${JSON.stringify(disabledFailure)}`)
  assert(disabledFailure.attempts === 1, `disabled retry should try once: ${JSON.stringify(disabledFailure)}`)
  assert(!disabledRetry.events.some((event) => event.type === 'retry'), 'disabled retry emitted a retry event')
  await api('PUT', '/api/settings/retry', retryDefaults)
  console.log('PASS retry disable setting')

  await api('PUT', '/api/settings/retry', {
    ...retryDefaults,
    maxRetries: 1,
    baseDelayMs: 100,
    maxDelayMs: 200,
    jitter: false
  })
  const limitedRetry = await sendMessage(chat.id, 'rate limit retry test', model.id)
  const limitedEvent = limitedRetry.events.find((event) => event.type === 'retry')
  assert(limitedEvent, 'limited retry did not emit a retry event', limitedRetry.text.slice(0, 1200))
  assert(limitedEvent.attempt === 1 && limitedEvent.maxAttempts === 1, `unexpected retry attempt: ${JSON.stringify(limitedEvent)}`)
  assert(limitedEvent.status === 429 && limitedEvent.code === 'rate_limit_exceeded', `retry event lost details: ${JSON.stringify(limitedEvent)}`)
  assert(limitedEvent.delayMs === 100, `Retry-After=0 should use the 100ms base delay: ${JSON.stringify(limitedEvent)}`)
  assert(limitedEvent.nextAt >= Date.now() - 5000, 'retry event has no nextAt timestamp')
  assert(!limitedRetry.events.some((event) => event.type === 'error'), 'limited retry did not recover')
  assert(limitedRetry.events.some((event) => event.type === 'done'), 'limited retry did not finish')
  console.log('PASS retry limit + event details')

  await api('PUT', '/api/settings/retry', {
    ...retryDefaults,
    unlimited: true,
    maxRetries: 0,
    baseDelayMs: 100,
    maxDelayMs: 200,
    jitter: false
  })
  const unlimitedRetry = await sendMessage(chat.id, 'unlimited retry storm', model.id)
  const unlimitedEvents = unlimitedRetry.events.filter((event) => event.type === 'retry')
  assert(unlimitedEvents.length === 2, `unlimited retry should retry twice: ${unlimitedRetry.text.slice(0, 1200)}`)
  assert(
    unlimitedEvents.every((event) => event.maxAttempts === null && event.unlimited === true),
    `unlimited retry events are missing the unlimited flag: ${JSON.stringify(unlimitedEvents)}`
  )
  assert(unlimitedEvents[0].attempt === 1 && unlimitedEvents[1].attempt === 2, 'unlimited retry attempts are wrong')
  assert(!unlimitedRetry.events.some((event) => event.type === 'error'), 'unlimited retry did not recover')
  await api('PUT', '/api/settings/retry', retryDefaults)
  console.log('PASS unlimited retry setting')

  const second = await sendMessage(chat.id, 'write a note with the extension', model.id)
  const extensionTool = second.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'ext_mock_write_note'
  )
  assert(extensionTool, 'agent did not call ext_mock_write_note', second.text.slice(0, 1500))
  assert(extensionTool.result.ok === true, `mock extension failed: ${extensionTool.result.output}`)
  assert(
    fs.readFileSync(path.join(project.path, 'extension.txt'), 'utf8') === 'from extension',
    'extension did not write extension.txt'
  )
  console.log('PASS extension host + temp extension tool')

  const skillRun = await sendMessage(chat.id, 'use the skill for this task', model.id)
  const skillTool = skillRun.events.find((event) => event.type === 'tool_end' && event.call.name === 'use_skill')
  assert(skillTool, 'agent did not call use_skill', skillRun.text.slice(0, 1500))
  assert(
    skillTool.result.ok === true && skillTool.result.output.includes('SKILL_OK'),
    `smoke skill was not loaded: ${skillTool.result.output}`
  )
  console.log('PASS skill discovery + use_skill')

  const mcpRun = await sendMessage(chat.id, 'use mcp to echo', model.id)
  const mcpTool = mcpRun.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'mcp_mockmcp_echo'
  )
  assert(mcpTool, 'agent did not call mcp_mockmcp_echo', mcpRun.text.slice(0, 1500))
  assert(
    mcpTool.result.ok === true && mcpTool.result.output.includes('mcp-echo: hello-mcp'),
    `mock MCP tool failed: ${mcpTool.result.output}`
  )
  console.log('PASS MCP stdio server + tool call')

  const mcpHttpRun = await sendMessage(chat.id, 'use mcp http to echo', model.id)
  const mcpHttpTool = mcpHttpRun.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'mcp_mockhttp_echo'
  )
  assert(mcpHttpTool, 'agent did not call mcp_mockhttp_echo', mcpHttpRun.text.slice(0, 1500))
  assert(
    mcpHttpTool.result.ok === true && mcpHttpTool.result.output.includes('http-echo: hello-http'),
    `mock Streamable HTTP MCP tool failed: ${mcpHttpTool.result.output}`
  )
  console.log('PASS MCP Streamable HTTP server + tool call')

  const mcpSseRun = await sendMessage(chat.id, 'use mcp sse to echo', model.id)
  const mcpSseTool = mcpSseRun.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'mcp_mocksse_echo'
  )
  assert(mcpSseTool, 'agent did not call mcp_mocksse_echo', mcpSseRun.text.slice(0, 1500))
  assert(
    mcpSseTool.result.ok === true && mcpSseTool.result.output.includes('http-echo: hello-sse'),
    `mock legacy SSE MCP tool failed: ${mcpSseTool.result.output}`
  )
  console.log('PASS MCP legacy SSE server + tool call')

  const lspRun = await sendMessage(chat.id, 'check diagnostics', model.id)
  const lspTool = lspRun.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'lsp_diagnostics'
  )
  assert(lspTool, 'agent did not call lsp_diagnostics', lspRun.text.slice(0, 1500))
  assert(
    lspTool.result.output.includes('Mock type error') && lspTool.result.output.includes('broken.ts:2'),
    `mock LSP diagnostics missing: ${lspTool.result.output}`
  )
  console.log('PASS LSP diagnostics tool')

  fs.writeFileSync(
    path.join(project.path, 'broken.ts'),
    'export const value: number = 1\nconst stillWrong: string = value\n'
  )
  const lspAgain = await sendMessage(chat.id, 'check diagnostics again', model.id)
  const lspAgainTool = lspAgain.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'lsp_diagnostics'
  )
  assert(lspAgainTool, 'agent did not call lsp_diagnostics again', lspAgain.text.slice(0, 1500))
  assert(
    lspAgainTool.result.output.includes('Mock type error'),
    `LSP didChange diagnostics missing: ${lspAgainTool.result.output}`
  )
  console.log('PASS LSP didChange diagnostics')

  const slowChat = await api('POST', `/api/projects/${project.id}/chats`, {
    title: 'slow chat',
    modelId: model.id
  })
  const slowPromise = sendMessage(slowChat.id, 'slow task', model.id)
  await sleep(1000)
  let stopped = false
  for (let attempt = 0; attempt < 10 && !stopped; attempt++) {
    try {
      await api('POST', `/api/chats/${slowChat.id}/stop`)
      stopped = true
    } catch {
      await sleep(100)
    }
  }
  assert(stopped, 'stop endpoint did not find the active run')
  const slow = await slowPromise
  assert(
    slow.events.some((event) => event.type === 'done' && event.aborted === true),
    'agent did not emit an aborted done event',
    slow.text.slice(0, 1000)
  )
  console.log('PASS stop / abort path')

  const titleChat = await api('POST', `/api/projects/${project.id}/chats`, { modelId: model.id })
  const titleRes = await fetch(`http://127.0.0.1:${serverPort}/api/chats/${titleChat.id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'Please fix the slow login bug', modelId: model.id })
  })
  assert(titleRes.status === 202, `auto-title run did not start: ${titleRes.status}`)
  const titleBody = await titleRes.json()
  assert(
    titleBody.title === 'Fix the slow login bug',
    `unexpected auto chat title: ${JSON.stringify(titleBody.title)}`
  )
  await api('POST', `/api/chats/${titleChat.id}/stop`)
  console.log('PASS auto chat title')

  const backgroundChat = await api('POST', `/api/projects/${project.id}/chats`, {
    title: 'background chat',
    modelId: model.id
  })
  const started = await fetch(`http://127.0.0.1:${serverPort}/api/chats/${backgroundChat.id}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: 'slow background task', modelId: model.id })
  })
  assert(started.status === 202, `background run did not start: ${started.status}`)
  await sleep(600)
  const runStatus = await api('GET', `/api/chats/${backgroundChat.id}/run`)
  assert(runStatus.active === true, 'background run was not active without an event subscriber')
  await api('POST', `/api/chats/${backgroundChat.id}/stop`)
  const backgroundEvents = await fetch(`http://127.0.0.1:${serverPort}/api/chats/${backgroundChat.id}/events`)
  assert(backgroundEvents.ok, `background event replay failed: ${backgroundEvents.status}`)
  const replayed = await readEvents(backgroundEvents)
  assert(
    replayed.events.some((event) => event.type === 'done' && event.aborted === true),
    'background run events were not replayed',
    replayed.text.slice(0, 1000)
  )
  console.log('PASS background run + event replay')

  const messages = await api('GET', `/api/chats/${chat.id}/messages`)
  assert(messages.some((message) => message.role === 'user'), 'user message not persisted')
  assert(messages.some((message) => message.role === 'assistant'), 'assistant message not persisted')
  assert(messages.some((message) => message.role === 'tool'), 'tool result not persisted')
  const assistantMessages = messages.filter((message) => message.role === 'assistant')
  assert(
    assistantMessages.every((message) => message.modelId === model.id),
    `assistant messages are missing the model id: ${JSON.stringify(assistantMessages.map((message) => message.modelId))}`
  )
  assert(
    assistantMessages.some((message) => typeof message.durationMs === 'number' && message.durationMs >= 0),
    'assistant message duration was not persisted'
  )
  assert(
    messages.filter((message) => message.role === 'user').every((message) => message.modelId === null),
    'user messages should not carry a model id'
  )
  console.log('PASS message history (model + duration metadata)')

  const extensions = await api('GET', '/api/extensions')
  const names = extensions.map((extension) => extension.name)
  assert(names.includes('mock'), `mock extension not discovered: ${names.join(', ')}`)
  assert(
    extensions.find((extension) => extension.name === 'mock').tools.length > 0,
    'mock extension has no tools'
  )
  for (const name of ['web', 'minecraft', 'android']) {
    assert(!names.includes(name), `example extension ${name} was loaded by default`)
  }
  console.log('PASS extension discovery (no default extensions)')

  const skillList = await api('POST', '/api/skills/reload')
  assert(
    skillList.some((skill) => skill.name === 'smoke-skill' && skill.description.includes('Smoke-test skill')),
    `skills API missed smoke-skill: ${JSON.stringify(skillList)}`
  )

  const createdSkill = await api('POST', '/api/skills', {
    name: 'smoke-created-skill',
    description: 'Skill created through the API',
    content: '# Created\nReturn CREATED_OK.'
  })
  assert(createdSkill.writable === true, 'created skill is not writable')
  assert(
    fs.existsSync(path.join(skillsDir, 'smoke-created-skill', 'SKILL.md')),
    'created skill file is missing'
  )
  await api('DELETE', '/api/skills/smoke-created-skill')
  assert(!fs.existsSync(path.join(skillsDir, 'smoke-created-skill')), 'deleted skill folder still exists')

  const mcpList = await api('POST', '/api/mcp/reload')
  for (const [name, transport] of [
    ['mockmcp', 'stdio'],
    ['mockhttp', 'http'],
    ['mocksse', 'sse']
  ]) {
    const server = mcpList.find((entry) => entry.name === name)
    assert(server, `MCP API missed ${name}: ${JSON.stringify(mcpList)}`)
    assert(server.transport === transport, `${name} transport is ${server.transport}, expected ${transport}`)
    assert(server.status === 'ready', `${name} is not ready: ${server.error ?? server.status}`)
    assert(server.tools.some((tool) => tool.name === 'echo'), `${name} echo tool was not listed`)
  }

  const addedMcp = await api('POST', '/api/mcp', {
    name: 'mockadded',
    transport: 'stdio',
    command: process.execPath,
    args: [mcpServerPath]
  })
  const addedMcpServer = addedMcp.find((entry) => entry.name === 'mockadded')
  assert(addedMcpServer?.status === 'ready', 'added MCP server did not start')
  assert(
    addedMcpServer.tools.some((tool) => tool.name === 'echo'),
    'added MCP server did not expose echo'
  )
  const afterMcpDelete = await api('DELETE', '/api/mcp/mockadded')
  assert(!afterMcpDelete.some((entry) => entry.name === 'mockadded'), 'deleted MCP server is still listed')
  assert(
    !JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8')).mcpServers.mockadded,
    'deleted MCP server remains in config'
  )

  const lspList = await api('POST', '/api/lsp/reload')
  const mockLsp = lspList.find((server) => server.name === 'mocklsp')
  assert(mockLsp, `LSP API missed mocklsp: ${JSON.stringify(lspList)}`)
  assert(mockLsp.extensions.includes('.ts'), 'mocklsp has no .ts extension mapping')

  const addedLsp = await api('POST', '/api/lsp', {
    name: 'mockaddedlsp',
    command: process.execPath,
    args: [lspServerPath],
    extensions: ['.ts'],
    languageId: 'typescript',
    installCommand: 'npm i -g typescript-language-server'
  })
  assert(
    addedLsp.some(
      (entry) =>
        entry.name === 'mockaddedlsp' &&
        entry.extensions.includes('.ts') &&
        entry.installCommand === 'npm i -g typescript-language-server'
    ),
    `added language server is not listed with its install command: ${JSON.stringify(addedLsp)}`
  )
  assert(
    JSON.parse(fs.readFileSync(lspConfigPath, 'utf8')).languageServers.mockaddedlsp.installCommand ===
      'npm i -g typescript-language-server',
    'install command was not persisted to lsp.json'
  )

  const installMarker = path.join(temp, 'lsp-install-ok.txt')
  await api('POST', '/api/lsp', {
    name: 'mockinstalllsp',
    command: 'ks-agent-definitely-missing-lsp',
    extensions: ['.txt'],
    languageId: 'plaintext',
    installCommand: `${process.execPath} -e 'require("fs").writeFileSync(${JSON.stringify(installMarker)}, "installed")'`
  })
  const installedLsp = await api('POST', '/api/lsp/mockinstalllsp/install')
  assert(fs.existsSync(installMarker), 'language server install command did not run')
  assert(
    installedLsp.some((entry) => entry.name === 'mockinstalllsp'),
    'installed language server is missing from the list'
  )
  await api('DELETE', '/api/lsp/mockinstalllsp')

  await api('POST', '/api/lsp', {
    name: 'mockfailedlsp',
    command: 'ks-agent-definitely-missing-lsp',
    extensions: ['.txt'],
    languageId: 'plaintext',
    installCommand: `${process.execPath} -e 'process.exit(2)'`
  })
  const failedLspInstall = await rawApi('POST', '/api/lsp/mockfailedlsp/install')
  assert(failedLspInstall.status === 500, `failed install returned ${failedLspInstall.status}`)
  assert(
    failedLspInstall.text.includes('Install failed'),
    `failed install did not return details: ${failedLspInstall.text.slice(0, 300)}`
  )
  await api('DELETE', '/api/lsp/mockfailedlsp')

  const afterLspDelete = await api('DELETE', '/api/lsp/mockaddedlsp')
  assert(!afterLspDelete.some((entry) => entry.name === 'mockaddedlsp'), 'deleted language server is still listed')
  assert(
    !JSON.parse(fs.readFileSync(lspConfigPath, 'utf8')).languageServers.mockaddedlsp,
    'deleted language server remains in config'
  )

  const missingLspList = await api('POST', '/api/lsp', {
    name: 'missinglsp',
    command: 'ks-agent-definitely-missing-lsp',
    extensions: ['.zz'],
    languageId: 'zz'
  })
  const missingLsp = missingLspList.find((entry) => entry.name === 'missinglsp')
  assert(
    missingLsp?.status === 'error' && missingLsp.error.includes('Command not found'),
    `missing language server binary was not detected: ${JSON.stringify(missingLsp)}`
  )
  await api('DELETE', '/api/lsp/missinglsp')
  console.log('PASS skills / MCP / LSP APIs + reload')

  const scopedSkill = await api('POST', '/api/skills', {
    name: 'scoped-skill',
    description: 'Only enabled for the second smoke project',
    content: '# Scoped\nReturn SCOPED_OK.',
    projects: [otherProject.id]
  })
  assert(
    scopedSkill.projects.length === 1 && scopedSkill.projects[0] === otherProject.id,
    `scoped skill projects are wrong: ${JSON.stringify(scopedSkill.projects)}`
  )
  const scopedSkillFile = fs.readFileSync(path.join(skillsDir, 'scoped-skill', 'SKILL.md'), 'utf8')
  assert(
    scopedSkillFile.includes(`projects: ${otherProject.id}`),
    'scoped skill frontmatter is missing the project id'
  )

  const scopedMcpList = await api('POST', '/api/mcp', {
    name: 'scopedmcp',
    transport: 'stdio',
    command: process.execPath,
    args: [mcpServerPath],
    projects: [otherProject.id]
  })
  const scopedMcp = scopedMcpList.find((entry) => entry.name === 'scopedmcp')
  assert(scopedMcp?.status === 'ready', `scoped MCP server did not start: ${JSON.stringify(scopedMcp)}`)
  assert(
    scopedMcp.projects.length === 1 && scopedMcp.projects[0] === otherProject.id,
    'scoped MCP projects are wrong'
  )
  const scopedMcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'))
  assert(
    JSON.stringify(scopedMcpConfig.mcpServers.scopedmcp.projects) === JSON.stringify([otherProject.id]),
    'scoped MCP config did not persist projects'
  )

  const scopedLspList = await api('POST', '/api/lsp', {
    name: 'scopedlsp',
    command: process.execPath,
    args: [lspServerPath],
    extensions: ['.py'],
    languageId: 'python',
    projects: [otherProject.id]
  })
  const scopedLsp = scopedLspList.find((entry) => entry.name === 'scopedlsp')
  assert(scopedLsp, 'scoped language server is not listed')
  assert(
    scopedLsp.projects.length === 1 && scopedLsp.projects[0] === otherProject.id,
    'scoped LSP projects are wrong'
  )
  const scopedLspConfig = JSON.parse(fs.readFileSync(lspConfigPath, 'utf8'))
  assert(
    JSON.stringify(scopedLspConfig.languageServers.scopedlsp.projects) === JSON.stringify([otherProject.id]),
    'scoped LSP config did not persist projects'
  )

  const invalidScope = await rawApi('POST', '/api/skills', {
    name: 'bad-scope-skill',
    description: 'Invalid project scope',
    content: '# Bad',
    projects: ['missing-project-id']
  })
  assert(invalidScope.status === 400, `unknown project scope was accepted: ${invalidScope.status}`)

  const projectExtensions = await api('GET', `/api/chats/${chat.id}/extensions`)
  assert(
    projectExtensions.skills.some((skill) => skill.name === 'smoke-skill' && skill.enabled),
    'project chat is missing smoke-skill'
  )
  assert(
    !projectExtensions.skills.some((skill) => skill.name === 'scoped-skill'),
    'scoped skill leaked into the project chat'
  )
  assert(
    projectExtensions.mcpServers.some((server) => server.name === 'mockmcp' && server.enabled),
    'project chat is missing mockmcp'
  )
  assert(
    !projectExtensions.mcpServers.some((server) => server.name === 'scopedmcp'),
    'scoped MCP server leaked into the project chat'
  )
  assert(
    projectExtensions.lspServers.some((server) => server.name === 'mocklsp' && server.enabled),
    'project chat is missing mocklsp'
  )
  assert(
    !projectExtensions.lspServers.some((server) => server.name === 'scopedlsp'),
    'scoped language server leaked into the project chat'
  )

  const otherChat = await api('POST', `/api/projects/${otherProject.id}/chats`, { modelId: model.id })
  const otherExtensions = await api('GET', `/api/chats/${otherChat.id}/extensions`)
  assert(
    otherExtensions.skills.some((skill) => skill.name === 'scoped-skill' && skill.enabled),
    'scoped skill is missing from the second project chat'
  )
  assert(
    otherExtensions.skills.some((skill) => skill.name === 'smoke-skill' && skill.enabled),
    'all-project skill is missing from the second project chat'
  )
  assert(
    otherExtensions.mcpServers.some((server) => server.name === 'scopedmcp' && server.enabled),
    'scoped MCP server is missing from the second project chat'
  )
  assert(
    otherExtensions.lspServers.some((server) => server.name === 'scopedlsp' && server.enabled),
    'scoped language server is missing from the second project chat'
  )

  const toggleChat = await api('POST', `/api/projects/${project.id}/chats`, { modelId: model.id })
  const toggles = [
    ['skill', 'smoke-skill'],
    ['mcp', 'mockmcp'],
    ['lsp', 'mocklsp']
  ]
  const extensionsItem = (state, kind, name) =>
    (kind === 'skill' ? state.skills : kind === 'mcp' ? state.mcpServers : state.lspServers).find(
      (entry) => entry.name === name
    )
  for (const [kind, name] of toggles) {
    await api('PATCH', `/api/chats/${toggleChat.id}/extensions`, { kind, name, enabled: false })
  }
  const disabledState = await api('GET', `/api/chats/${toggleChat.id}/extensions`)
  for (const [kind, name] of toggles) {
    assert(
      extensionsItem(disabledState, kind, name)?.enabled === false,
      `${kind} ${name} was not disabled in the chat`
    )
  }
  const scopedToggle = await rawApi('PATCH', `/api/chats/${toggleChat.id}/extensions`, {
    kind: 'skill',
    name: 'scoped-skill',
    enabled: false
  })
  assert(scopedToggle.status === 404, `chat toggle accepted a project-scoped-out skill: ${scopedToggle.status}`)

  const disabledSkillRun = await sendMessage(toggleChat.id, 'use the skill for this task', model.id)
  const disabledSkillTool = disabledSkillRun.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'use_skill'
  )
  assert(disabledSkillTool, 'agent did not attempt use_skill while it was disabled', disabledSkillRun.text.slice(0, 1500))
  assert(
    disabledSkillTool.result.ok === false && disabledSkillTool.result.output.includes('disabled in this chat'),
    `disabled skill was not blocked: ${disabledSkillTool.result.output}`
  )

  const disabledMcpRun = await sendMessage(toggleChat.id, 'use mcp to echo', model.id)
  const disabledMcpTool = disabledMcpRun.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'mcp_mockmcp_echo'
  )
  assert(disabledMcpTool, 'agent did not attempt the MCP tool while it was disabled', disabledMcpRun.text.slice(0, 1500))
  assert(
    disabledMcpTool.result.ok === false && disabledMcpTool.result.output.includes('Unknown tool'),
    `disabled MCP tool was not blocked: ${disabledMcpTool.result.output}`
  )

  const disabledLspRun = await sendMessage(toggleChat.id, 'check diagnostics', model.id)
  const disabledLspTool = disabledLspRun.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'lsp_diagnostics'
  )
  assert(disabledLspTool, 'agent did not attempt lsp_diagnostics while it was disabled', disabledLspRun.text.slice(0, 1500))
  assert(
    disabledLspTool.result.ok === false && disabledLspTool.result.output.includes('disabled in this chat'),
    `disabled language server was not blocked: ${disabledLspTool.result.output}`
  )

  const disabledSystem =
    (lastProviderBody?.messages ?? []).find((message) => message.role === 'system')?.content ?? ''
  const disabledToolNames = (lastProviderBody?.tools ?? []).map((tool) => tool.function.name)
  assert(
    disabledSystem.includes('Chat tool selection for project') &&
      disabledSystem.includes('- smoke-skill: disabled in this chat') &&
      disabledSystem.includes('- mocklsp (') &&
      disabledSystem.includes('disabled in this chat'),
    'system prompt did not include the authoritative chat selection'
  )
  assert(!disabledSystem.includes('Smoke-test skill'), 'disabled skill leaked into the usable skills section')
  assert(!disabledSystem.includes('## Skills\n'), 'disabled-only skills section was still advertised')
  assert(
    !disabledSystem.includes('Use lsp_diagnostics after editing'),
    'unavailable/disabled language servers were still advertised as usable'
  )
  assert(
    disabledSystem.includes('- brokenlsp (') && disabledSystem.includes('enabled but unavailable'),
    'system prompt did not flag the missing language server binary'
  )
  assert(!disabledToolNames.includes('use_skill'), 'disabled skill tool was still exposed')
  assert(!disabledToolNames.includes('lsp_diagnostics'), 'unusable language server tool was still exposed')
  assert(
    disabledToolNames.includes('list_chat_extensions'),
    'list_chat_extensions tool is missing from the agent tools'
  )

  fs.writeFileSync(path.join(project.path, 'broken.zz'), 'const broken = true\n')
  const brokenLspRun = await sendMessage(toggleChat.id, 'check broken diagnostics', model.id)
  const brokenLspTool = brokenLspRun.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'lsp_diagnostics'
  )
  assert(brokenLspTool, 'agent did not attempt lsp_diagnostics for the missing binary')
  assert(
    brokenLspTool.result.ok === false &&
      brokenLspTool.result.output.includes('unavailable') &&
      brokenLspTool.result.output.includes('Command not found') &&
      !brokenLspTool.result.output.includes('ENOENT'),
    `missing language server was not reported as unavailable: ${brokenLspTool.result.output}`
  )

  const statusRun = await sendMessage(toggleChat.id, 'inspect extensions', model.id)
  const statusTool = statusRun.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'list_chat_extensions'
  )
  assert(statusTool, 'agent did not call list_chat_extensions', statusRun.text.slice(0, 1500))
  assert(
    statusTool.result.ok &&
      statusTool.result.output.includes('- smoke-skill: disabled in this chat') &&
      statusTool.result.output.includes('- mockmcp (stdio, 1 tool): disabled in this chat') &&
      statusTool.result.output.includes('- mocklsp (') &&
      statusTool.result.output.includes(': disabled in this chat') &&
      statusTool.result.output.includes('- brokenlsp (') &&
      statusTool.result.output.includes('enabled but unavailable') &&
      statusTool.result.output.includes('usable'),
    `list_chat_extensions did not report disabled/unavailable items: ${statusTool.result.output}`
  )
  assert(
    statusTool.result.output.includes(
      'Only project-enabled, chat-enabled and usable items are exposed as tools'
    ),
    'list_chat_extensions is missing its selection note'
  )

  for (const [kind, name] of toggles) {
    await api('PATCH', `/api/chats/${toggleChat.id}/extensions`, { kind, name, enabled: true })
  }
  const enabledState = await api('GET', `/api/chats/${toggleChat.id}/extensions`)
  for (const [kind, name] of toggles) {
    assert(
      extensionsItem(enabledState, kind, name)?.enabled === true,
      `${kind} ${name} was not re-enabled in the chat`
    )
  }
  console.log('PASS project scoping + per-chat extension toggles')

  const minecraft = await callExtension(
    path.join(repo, 'examples', 'extensions', 'minecraft'),
    'plugin_scaffold',
    { path: 'mc-plugin', name: 'SmokePlugin', mcVersion: '1.21.4' },
    project.path
  )
  assert(minecraft.isError !== true, `minecraft scaffold failed: ${minecraft.content}`)
  assert(fs.existsSync(path.join(project.path, 'mc-plugin', 'build.gradle')), 'minecraft build.gradle missing')
  assert(
    fs.existsSync(path.join(project.path, 'mc-plugin', 'src', 'main', 'resources', 'plugin.yml')),
    'minecraft plugin.yml missing'
  )

  const android = await callExtension(
    path.join(repo, 'examples', 'extensions', 'android'),
    'scaffold',
    { path: 'android-app', name: 'Smoke App', packageName: 'com.example.smoke' },
    project.path
  )
  assert(android.isError !== true, `android scaffold failed: ${android.content}`)
  const activity = path.join(
    project.path,
    'android-app',
    'app',
    'src',
    'main',
    'java',
    'com',
    'example',
    'smoke',
    'MainActivity.kt'
  )
  assert(fs.existsSync(activity), 'android MainActivity.kt missing')
  assert(fs.readFileSync(activity, 'utf8').includes('Text("count is $count")'), 'android scaffold interpolation is wrong')
  console.log('PASS minecraft + android scaffolds')

  const staticRes = await fetch(`http://127.0.0.1:${serverPort}/`)
  const html = await staticRes.text()
  assert(staticRes.ok && html.includes('id="root"'), 'web UI was not served')
  console.log('PASS static UI')

  cleanup()
  console.log('\nSMOKE PASS')
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error), error?.stack))
