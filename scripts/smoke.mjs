import { spawn } from 'node:child_process'
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
fs.mkdirSync(projectsDir, { recursive: true })
fs.mkdirSync(dataDir, { recursive: true })

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

function startMockProvider() {
  return new Promise((resolve) => {
    mock = http.createServer((req, res) => {
      if (!req.url?.endsWith('/chat/completions')) {
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
        const messages = Array.isArray(body.messages) ? body.messages : []
        const lastUser = [...messages].reverse().find((message) => message.role === 'user')?.content ?? ''
        const hasTool = (id) => messages.some((message) => message.role === 'tool' && message.tool_call_id === id)
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

        if (lastUser.includes('scaffold') && !hasTool('call_web')) {
          sse(res, {
            choices: [
              {
                delta: {
                  role: 'assistant',
                  tool_calls: [
                    {
                      index: 0,
                      id: 'call_web',
                      type: 'function',
                      function: {
                        name: 'ext_web_scaffold',
                        arguments: JSON.stringify({ path: 'webapp', name: 'smoke-web' })
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

async function api(method, url, body) {
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
  if (!res.ok) throw new Error(`${method} ${url} -> ${res.status}: ${text.slice(0, 500)}`)
  return data
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
  return readEvents(res)
}

function callExtension(extension, tool, args, projectPath) {
  return new Promise((resolve, reject) => {
    const dir = path.join(repo, 'extensions', extension)
    const child = spawn(process.execPath, [path.join(dir, 'index.mjs')], {
      cwd: dir,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const pending = new Map()
    const errors = []
    let seq = 0
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`extension ${extension} timed out\n${errors.join('\n')}`))
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
        await request('initialize', { protocolVersion: 1, name: extension })
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

  child = spawn(process.execPath, [path.join(repo, 'dist-server', 'index.js')], {
    cwd: repo,
    env: {
      ...process.env,
      PORT: String(serverPort),
      KS_ROOT_DIR: repo,
      KS_DATA_DIR: dataDir,
      KS_PROJECTS_DIR: projectsDir,
      KS_EXTENSIONS_DIR: path.join(repo, 'extensions'),
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
  console.log('PASS project create + path/shell guards')

  const provider = await api('POST', '/api/providers', {
    name: 'mock',
    baseUrl: `http://127.0.0.1:${mockPort}/v1`,
    apiKey: 'test-key'
  })
  assert(provider.hasKey === true && provider.apiKey === undefined, 'provider key was exposed')
  const model = await api('POST', '/api/models', {
    providerId: provider.id,
    name: 'Mock Model',
    modelId: 'mock-model'
  })
  console.log('PASS provider/model (key masked)')

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

  const second = await sendMessage(chat.id, 'scaffold a web app', model.id)
  const webTool = second.events.find(
    (event) => event.type === 'tool_end' && event.call.name === 'ext_web_scaffold'
  )
  assert(webTool, 'agent did not call ext_web_scaffold', second.text.slice(0, 1500))
  assert(webTool.result.ok === true, `web scaffold failed: ${webTool.result.output}`)
  assert(fs.existsSync(path.join(project.path, 'webapp', 'package.json')), 'extension did not write webapp/package.json')
  console.log('PASS extension host + real extension tool')

  const messages = await api('GET', `/api/chats/${chat.id}/messages`)
  assert(messages.some((message) => message.role === 'user'), 'user message not persisted')
  assert(messages.some((message) => message.role === 'assistant'), 'assistant message not persisted')
  assert(messages.some((message) => message.role === 'tool'), 'tool result not persisted')
  console.log('PASS message history')

  const extensions = await api('GET', '/api/extensions')
  const names = extensions.map((extension) => extension.name)
  for (const name of ['web', 'minecraft', 'android']) {
    assert(names.includes(name), `extension ${name} not discovered: ${names.join(', ')}`)
    assert(
      extensions.find((extension) => extension.name === name).tools.length > 0,
      `extension ${name} has no tools`
    )
  }
  console.log('PASS extension discovery')

  const minecraft = await callExtension(
    'minecraft',
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
    'android',
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
