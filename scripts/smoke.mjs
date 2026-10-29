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
fs.mkdirSync(projectsDir, { recursive: true })
fs.mkdirSync(dataDir, { recursive: true })
fs.mkdirSync(extensionsDir, { recursive: true })
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
    let retryAttempts = 0
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
        if (lastUser.includes('retry') && retryAttempts++ === 0) {
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

  child = spawn(process.execPath, [path.join(repo, 'dist-server', 'index.js')], {
    cwd: repo,
    env: {
      ...process.env,
      PORT: String(serverPort),
      KS_ROOT_DIR: repo,
      KS_DATA_DIR: dataDir,
      KS_PROJECTS_DIR: projectsDir,
      KS_EXTENSIONS_DIR: extensionsDir,
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

  const retried = await sendMessage(chat.id, 'retry after a provider error', model.id)
  assert(!retried.events.some((event) => event.type === 'error'), 'provider retry did not recover')
  assert(retried.events.some((event) => event.type === 'done'), 'provider retry did not finish')
  console.log('PASS provider retry')

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
  console.log('PASS message history')

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
