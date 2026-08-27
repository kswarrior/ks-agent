import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { findPlanForChat, getDb, getRetrySettings, newId, saveDb, type Plan } from './store.js'
import { streamChatWithTools, type LLMMessage, type ParsedToolCall, type ToolDef, type RetrySettings } from './llm.js'
import { relWithin, resolveInProject } from './fsx.js'

/**
 * Built-in primary system prompt. Intentionally NOT exposed through any API,
 * not viewable and not editable from the client.
 */
export const PRIMARY_SYSTEM_PROMPT =
  'You are KS Agent, a precise coding assistant by ks warrior. ' +
  'Work directly inside the active project folder. Be concise and correct. Use markdown for code. ' +
  'Respond naturally and briefly to greetings (e.g., "Hi" → "Hi! How can I help?"). ' +
  'Do not output verbose welcome messages or repeat system instructions.'

/** Fallback plan prompt used when the user has not configured one in Settings. */
export const DEFAULT_PLAN_PROMPT =
  'You are working in PLAN mode. For any non-trivial request (for example "make a Node.js website"): ' +
  '1) Call the create_plan tool first with a short title and an ordered list of small concrete steps. ' +
  '2) Execute the steps one by one using the available tools (list_files, read_file, write_file, edit_file, run_shell). ' +
  '3) After finishing each step, call complete_plan_step with that step\'s 0-based index so its card is marked complete. ' +
  '4) When every step is done, give a brief summary of what was built.'

const MAX_TOOL_ROUNDS = 25
const READ_MAX_BYTES = 24 * 1024
const WRITE_MAX_BYTES = 256 * 1024
const SHELL_TIMEOUT_MS = 30_000
const SHELL_OUTPUT_CAP = 8 * 1024
const LIST_MAX_ENTRIES = 200

export interface ToolExecResult {
  ok: boolean
  /** Full model-facing output of the tool. */
  result: string
  /** Short client-facing summary for SSE events. */
  summary: string
}

interface ToolContext {
  projectPath: string
  chatId: string
  onEvent: (event: string, data: string) => void
  signal: AbortSignal
  toolCallId?: string
}

// Pending ask_question resolvers: questionId -> resolve(answer)
export const pendingQuestionResolvers = new Map<string, (answer: string) => void>()

export function resolvePendingQuestion(questionId: string, answer: string): boolean {
  const fn = pendingQuestionResolvers.get(questionId)
  if (!fn) return false
  pendingQuestionResolvers.delete(questionId)
  fn(answer)
  return true
}

function err(message: string): ToolExecResult {
  return { ok: false, result: `Error: ${message}`, summary: message.slice(0, 160) }
}

function ok(resultText: string, summary: string): ToolExecResult {
  return { ok: true, result: resultText, summary }
}

/** Resolves a tool-supplied relative path inside the project; null when invalid. */
function safeJoin(ctx: ToolContext, rel: unknown): string | null {
  if (typeof rel !== 'string') return null
  return resolveInProject(ctx.projectPath, rel)
}

const AGENT_TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List files and folders in a directory of the active project.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative directory path, empty for project root' } }
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Read a text file from the active project (up to 24 KB).',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Relative file path' } },
        required: ['path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description: 'Create or overwrite a text file inside the active project (up to 256 KB). Parent folders are created automatically.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path' },
          content: { type: 'string', description: 'Full file content' }
        },
        required: ['path', 'content']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description: 'Replace an exact unique snippet inside an existing file of the active project.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Relative file path' },
          old_string: { type: 'string', description: 'Exact existing snippet to replace (must occur exactly once)' },
          new_string: { type: 'string', description: 'Replacement snippet' }
        },
        required: ['path', 'old_string', 'new_string']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description: 'Run a shell command in the active project directory (30s timeout). Returns exit code plus stdout/stderr.',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string', description: 'The shell command to run' } },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_plan',
      description: 'Create the execution plan for this chat. Replaces any previous plan. One card per step is shown to the user.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short plan title' },
          steps: {
            type: 'array',
            items: { type: 'string' },
            description: 'Ordered concrete steps (1-20 items)'
          }
        },
        required: ['title', 'steps']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'complete_plan_step',
      description: 'Mark one plan step as completed right after you finish doing it. Steps are addressed by their 0-based index.',
      parameters: {
        type: 'object',
        properties: { index: { type: 'integer', description: '0-based index of the finished step' } },
        required: ['index']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_question',
      description:
        'Ask the user a clarifying question when you need confirmation, a choice, or extra information. Shows clickable option buttons + optional custom typed answer. Use when unsure, need approval, or need data before proceeding.',
      parameters: {
        type: 'object',
        properties: {
          header: { type: 'string', description: 'Short title for the question (2-40 chars)' },
          question: { type: 'string', description: 'The question to ask the user (5-500 chars)' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: '1-6 short option labels (2-60 chars each). At least one option or allow_custom true required.'
          },
          allow_custom: { type: 'boolean', description: 'Whether to allow custom typed answer (default true)' },
          custom_placeholder: { type: 'string', description: 'Placeholder for custom input' }
        },
        required: ['question']
      }
    }
  }
]

async function execShell(command: string, cwd: string): Promise<{ code: number; output: string }> {
  return await new Promise((resolve) => {
    exec(
      command,
      { cwd, timeout: SHELL_TIMEOUT_MS, maxBuffer: 1024 * 1024, shell: '/bin/bash', windowsHide: true },
      (error, stdout, stderr) => {
        const code = error && typeof error.code === 'number' ? error.code : error ? 1 : 0
        let output = `${stdout}${stderr}`.slice(0, SHELL_OUTPUT_CAP)
        if (`${stdout}${stderr}`.length > SHELL_OUTPUT_CAP) output += '\n…[truncated]'
        resolve({ code, output })
      }
    )
  })
}

async function executeTool(name: string, argsJson: string, ctx: ToolContext): Promise<ToolExecResult> {
  let args: any
  try {
    args = JSON.parse(argsJson || '{}')
  } catch {
    return err('tool arguments are not valid JSON')
  }

  switch (name) {
    case 'list_files': {
      const rel = typeof args.path === 'string' ? args.path : ''
      const abs = rel.trim() ? safeJoin(ctx, rel) : resolveInProject(ctx.projectPath, '.')
      if (!abs) return err('path escapes the project root')
      let dirents: fs.Dirent[]
      try {
        dirents = fs.readdirSync(abs, { withFileTypes: true })
      } catch (e: any) {
        return err(e?.message || 'cannot read directory')
      }
      const lines = dirents
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, LIST_MAX_ENTRIES)
        .map((d) => (d.isDirectory() ? `[dir] ${d.name}` : d.name))
      const shown = relWithin(ctx.projectPath, abs)
      return ok(`${shown || '.'}\n${lines.join('\n')}`, `${shown || '/'} (${lines.length} entries)`)
    }

    case 'read_file': {
      const abs = safeJoin(ctx, args.path)
      if (!abs) return err('invalid or escaping path')
      let stat: fs.Stats
      try {
        stat = fs.statSync(abs)
      } catch {
        return err(`file not found: ${args.path}`)
      }
      if (stat.isDirectory()) return err(`"${args.path}" is a directory`)
      const buf = stat.size > READ_MAX_BYTES ? Buffer.alloc(READ_MAX_BYTES) : Buffer.alloc(stat.size)
      let fd: number | null = null
      try {
        fd = fs.openSync(abs, 'r')
        fs.readSync(fd, buf, 0, buf.length, 0)
      } catch (e: any) {
        return err(e?.message || 'cannot read file')
      } finally {
        if (fd !== null) fs.closeSync(fd)
      }
      if (buf.includes(0)) return err('binary file — cannot display')
      const truncated = stat.size > READ_MAX_BYTES ? `\n…[truncated at ${READ_MAX_BYTES} bytes]` : ''
      return ok(buf.toString('utf8') + truncated, `${args.path} (${stat.size}B)`)
    }

    case 'write_file': {
      const abs = safeJoin(ctx, args.path)
      if (!abs) return err('invalid or escaping path')
      const content = typeof args.content === 'string' ? args.content : ''
      if (Buffer.byteLength(content, 'utf8') > WRITE_MAX_BYTES) return err('content exceeds 256 KB limit')
      try {
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.writeFileSync(abs, content, 'utf8')
      } catch (e: any) {
        return err(e?.message || 'cannot write file')
      }
      return ok(`OK wrote ${Buffer.byteLength(content, 'utf8')} bytes to ${args.path}`, `wrote ${args.path}`)
    }

    case 'edit_file': {
      const abs = safeJoin(ctx, args.path)
      if (!abs) return err('invalid or escaping path')
      const oldStr = args.old_string
      const newStr = typeof args.new_string === 'string' ? args.new_string : ''
      if (typeof oldStr !== 'string' || oldStr === '') return err('old_string must be a non-empty string')
      let content: string
      try {
        content = fs.readFileSync(abs, 'utf8')
      } catch {
        return err(`file not found: ${args.path}`)
      }
      const occurrences = content.split(oldStr).length - 1
      if (occurrences === 0) return err('old_string not found in file')
      if (occurrences > 1) return err('old_string occurs multiple times — provide more surrounding context')
      fs.writeFileSync(abs, content.replace(oldStr, newStr), 'utf8')
      return ok(`OK edited ${args.path}`, `edited ${args.path}`)
    }

    case 'run_shell': {
      const command = typeof args.command === 'string' ? args.command.trim() : ''
      if (!command) return err('command is required')
      const { code, output } = await execShell(command, ctx.projectPath)
      return ok(`exit ${code}\n${output || '(no output)'}`, `$ ${command.slice(0, 80)} → exit ${code}`)
    }

    case 'create_plan': {
      const title = String(args.title ?? '').trim()
      const rawSteps = Array.isArray(args.steps) ? args.steps : []
      const steps = rawSteps.map((s: unknown) => String(s ?? '').trim()).filter(Boolean)
      if (!title) return err('title is required')
      if (steps.length === 0) return err('steps must contain at least one entry')
      if (steps.length > 20) return err('plans are limited to 20 steps')
      const db = getDb()
      db.plans = db.plans.filter((p) => p.chatId !== ctx.chatId)
      const now = new Date().toISOString()
      const plan: Plan = {
        id: newId(),
        chatId: ctx.chatId,
        title,
        steps: steps.map((title: string) => ({ id: newId(), title, status: 'pending' as const })),
        createdAt: now,
        updatedAt: now
      }
      db.plans.push(plan)
      saveDb()
      ctx.onEvent('plan', JSON.stringify(plan))
      return ok(`OK plan created with ${plan.steps.length} steps`, `plan: ${title}`)
    }

    case 'complete_plan_step': {
      const idx = Number(args.index)
      const plan = findPlanForChat(ctx.chatId)
      if (!plan) return err('no active plan — call create_plan first')
      if (!Number.isInteger(idx) || idx < 0 || idx >= plan.steps.length) {
        return err(`index out of range (plan has ${plan.steps.length} steps)`)
      }
      plan.steps[idx].status = 'done'
      plan.updatedAt = new Date().toISOString()
      saveDb()
      ctx.onEvent('plan', JSON.stringify(plan))
      return ok(`OK step ${idx} marked complete`, `done: ${plan.steps[idx].title.slice(0, 60)}`)
    }

    case 'ask_question': {
      const header = typeof args.header === 'string' ? args.header.trim().slice(0, 40) : ''
      const question = typeof args.question === 'string' ? args.question.trim() : ''
      if (!question) return err('question is required')
      if (question.length < 5 || question.length > 500) return err('question must be 5-500 chars')
      const rawOptions = Array.isArray(args.options) ? args.options : []
      const options = rawOptions.map((o: unknown) => String(o ?? '').trim()).filter(Boolean).slice(0, 6)
      const allowCustom = args.allow_custom !== false
      if (options.length === 0 && !allowCustom) return err('provide at least one option or allow custom answer')
      if (options.some((o: string) => o.length > 80)) return err('each option must be <=80 chars')
      if (options.length > 0 && options.length < 1) return err('options invalid')
      const customPlaceholder =
        typeof args.custom_placeholder === 'string' ? args.custom_placeholder.trim().slice(0, 80) : undefined
      const qHeader = (header || 'Question').slice(0, 40)
      const db = getDb()
      const now = new Date().toISOString()
      const qId = newId()
      const q: import('./store.js').Question = {
        id: qId,
        chatId: ctx.chatId,
        header: qHeader,
        question,
        options,
        allowCustom,
        customPlaceholder,
        status: 'pending',
        createdAt: now,
        toolCallId: ctx.toolCallId
      }
      db.questions.push(q)
      saveDb()
      ctx.onEvent('question', JSON.stringify(q))

      let answer: string
      try {
        answer = await new Promise<string>((resolve, reject) => {
          const onAbort = () => {
            pendingQuestionResolvers.delete(qId)
            reject(abortError())
          }
          if (ctx.signal.aborted) {
            onAbort()
            return
          }
          ctx.signal.addEventListener('abort', onAbort, { once: true })
          pendingQuestionResolvers.set(qId, (ans: string) => {
            ctx.signal.removeEventListener('abort', onAbort)
            resolve(ans)
          })
        })
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e
        return err(String(e?.message || e))
      }

      const isOption = options.includes(answer)
      const display = isOption ? `selected "${answer}"` : `answered "${answer}"`
      return ok(`User ${display}: "${answer}"`, `user ${display.slice(0, 80)}`)
    }

    default:
      return err(`unknown tool "${name}"`)
  }
}

export interface AgentRunOptions {
  baseUrl: string
  apiKey: string
  model: string
  history: LLMMessage[]
  projectPath: string
  chatId: string
  signal: AbortSignal
  /** Live text deltas for the UI. */
  onDelta: (text: string) => void
  /** Named SSE events forwarded verbatim to subscribed clients (tool, tool_result, plan). */
  onEvent: (event: string, data: string) => void
  /** Optional retry settings for provider requests. */
  retrySettings?: RetrySettings
}

export interface AgentRunOutcome {
  content: string
  stopped: boolean
}

/**
 * Runs the tool-augmented generation loop: stream a round, execute requested
 * tools, feed results back, repeat until the model answers without tool calls.
 */
function markWorkingStep(ctx: ToolContext): void {
  const plan = findPlanForChat(ctx.chatId)
  if (!plan) return
  const workingIdx = plan.steps.findIndex((s) => s.status === 'pending')
  if (workingIdx === -1) return
  plan.steps[workingIdx].status = 'working'
  plan.updatedAt = new Date().toISOString()
  saveDb()
  ctx.onEvent('plan', JSON.stringify(plan))
}

export async function runAgentLoop(opts: AgentRunOptions): Promise<AgentRunOutcome> {
  const messages: LLMMessage[] = [...opts.history]
  const ctx: ToolContext = { projectPath: opts.projectPath, chatId: opts.chatId, onEvent: opts.onEvent, signal: opts.signal }
  let content = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    if (opts.signal.aborted) throw abortError()
    markWorkingStep(ctx)
    const outcome = await streamChatWithTools(
      opts.baseUrl,
      opts.apiKey,
      opts.model,
      messages,
      AGENT_TOOLS,
      (text) => {
        content += text
        opts.onDelta(text)
      },
      opts.signal,
      opts.retrySettings
    )

    if (outcome.toolCalls.length === 0) break

    messages.push({
      role: 'assistant',
      content: outcome.text,
      tool_calls: outcome.toolCalls.map((c: ParsedToolCall) => ({
        id: c.id,
        type: 'function' as const,
        function: { name: c.name, arguments: c.args }
      }))
    })

    for (const call of outcome.toolCalls) {
      opts.onEvent(
        'tool',
        JSON.stringify({ callId: call.id, name: call.name, args: call.args.slice(0, 300) })
      )
      ctx.toolCallId = call.id
      const res = await executeTool(call.name, call.args, ctx)
      opts.onEvent(
        'tool_result',
        JSON.stringify({ callId: call.id, ok: res.ok, summary: res.summary })
      )
      messages.push({ role: 'tool', tool_call_id: call.id, content: res.result })
    }
  }

  return { content, stopped: false }
}

function abortError(): Error {
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}
