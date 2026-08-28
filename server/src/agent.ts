import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { findPlanForChat, getDb, getRetrySettings, newId, saveDb, type Plan, type Question, type Activity } from './store.js'
import { streamChatWithTools, type LLMMessage, type ParsedToolCall, type ToolDef, type RetrySettings } from './llm.js'
import { relWithin, resolveInProject } from './fsx.js'

/**
 * Built-in primary system prompt. Intentionally NOT exposed through any API,
 * not viewable and not editable from the client.
 */
export const PRIMARY_SYSTEM_PROMPT =
'You are KS Agent, a precise autonomous coding agent by KS Warrior. ' +
'Work directly in the active project and use tools for all real work. ' +
'Be concise, practical, and never claim success without tool evidence. ' +

'FLOW for make/build/create/fix/implement/refactor/debug: ' +
'1) Understand — exactly one short natural sentence (10-20 words). ' +
'2) Explore — immediately use list_files/read_file; never skip inspection. ' +
'3) Planning — for non-trivial tasks call create_plan with 3-10 concrete steps. ' +
'4) Execute — work step-by-step and call complete_plan_step after each finished step. ' +
'5) Verify — run relevant tests/build/lint/typecheck/runtime checks. ' +
'6) Recover — diagnose failures, fix them, and verify again. ' +
'7) Finish — only when the task is actually complete. ' +

'NEVER STOP EARLY: do not stop after understanding, exploring, planning, or editing. ' +
'Continue until the requested work is complete and verified. ' +

'REPO RULES: inspect before changing; follow existing architecture and patterns; make minimal targeted changes; preserve unrelated user changes; avoid unnecessary rewrites/dependencies/refactors. ' +
'Do not guess project structure, framework, package manager, database, or entry points. ' +

'ERROR RULE: inspect real command errors, fix the root cause, and retry meaningful verification. Never hide useful errors or blindly repeat failures. ' +

'SECURITY/GIT: never expose secrets; do not weaken security; do not reset, force-push, destroy, or discard user work unless explicitly required. ' +

'QUESTIONS: when required information/choice/confirmation is genuinely missing, ONLY use ask_question; never ask in plain chat. ' +
'Dangerous-command approval is handled automatically by the tool. ' +

'PREVIEW: if the task builds, runs, or modifies a website, web app, frontend, or any service that is previewable on a port (e.g. Vite, Next.js, React, Vue, static server on 3000/5173/8000/8080) and the service is actually running and reachable after verification, you MUST call the open_preview tool with the exact port number after the final task is complete. The preview is saved per chat like the plan and stays active for that chat — one live preview per chat. Only call it once at the very end when a previewable service is truly running; do not call it for non-previewable tasks. ' +

'GREETING: answer greetings briefly without explore/plan. ' +
'FINAL: briefly state changes and verified results; mention limitations only when real.';

export const DEFAULT_PLAN_PROMPT =
'Work in PLAN mode: Understand → Explore → Plan → Execute → Verify → Finish. ' +
'Understand = one 10-20 word sentence. Then ALWAYS inspect with list_files/read_file. ' +
'For non-trivial tasks call create_plan with 3-10 concrete steps. ' +
'Execute one step at a time and call complete_plan_step after each step. ' +
'Run relevant verification. On failure, diagnose, fix, and verify again. ' +
'Do not stop early or claim success without evidence. ' +
'Preserve existing code, user changes, architecture, security, and unrelated files. ' +
'Use ask_question for required choices/info; never ask questions in plain chat. ' +
'Preview rule: if the final result is a previewable website/service on a port and it is running after verification, call open_preview with the port — saved per chat like plan. ' +
'For greetings, reply briefly with no workflow.';

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
      description: 'Run a shell command in the active project directory (30s timeout). Returns exit code plus stdout/stderr. IMPORTANT: Dangerous commands (rm -rf, sudo, etc.) will automatically trigger a confirmation prompt to the user before execution — you do NOT need to call ask_question for these; the tool handles it. For commands that need user input, use ask_question first to get the answer, then run_shell with the resolved command.',
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
      name: 'open_preview',
      description: 'Open a live preview for a web app/service running on a port. Call ONCE after the final task is complete and verified, ONLY if the project has a previewable website/service (e.g. Vite dev server, Next.js, static site) that is actually running on the given port. Provide the port number where the preview is reachable. The preview is saved per chat like the plan and stays active for that chat.',
      parameters: {
        type: 'object',
        properties: { port: { type: 'integer', description: 'Port number where the previewable service is listening (1-65535)', minimum: 1, maximum: 65535 } },
        required: ['port']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'ask_question',
      description:
        'MANDATORY tool for any clarification — this is the ONLY way to ask the user anything. NEVER write questions/options in your chat reply text; you MUST call this tool instead. It renders an interactive card in the UI with clickable option buttons + optional custom typed input, and PAUSES execution until the user answers. Use it whenever you need confirmation, a choice, or extra info — at ANY stage (Understand, Explore, Planning, Executing). Do not assume or invent. Do not duplicate the question in your text output when you call this tool; just call the tool. Example: header="Choose Framework", question="Which framework should I use for the dashboard?", options=["React","Vue","Plain HTML"], allow_custom=true, custom_placeholder="Or type custom...". The tool blocks until answered and returns the user selection.',
      parameters: {
        type: 'object',
        properties: {
          header: { type: 'string', description: 'Short card title (2-40 chars), e.g., "Choose Framework" or "Confirm Deploy"' },
          question: { type: 'string', description: 'Full question text to show in the card (5-500 chars). Be specific and concise.' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: '1-6 short clickable option labels (2-60 chars each). Provide meaningful choices like ["Yes, proceed","No, cancel"] or ["Postgres","MySQL","SQLite"]. At least one option or allow_custom=true required.'
          },
          allow_custom: { type: 'boolean', description: 'Whether to allow a custom typed answer in addition to options (default true). Set false for strict choice.' },
          custom_placeholder: { type: 'string', description: 'Placeholder for custom input, e.g., "Type custom framework..."' }
        },
        required: ['question']
      }
    }
  }
]

/**
 * Detects whether a shell command is dangerous/destructive and should require
 * user approval before execution. Returns null if safe, or a description of
 * why it's dangerous.
 */
function isDangerousCommand(command: string): string | null {
  const c = command.trim()

  // Full wildcard rm
  if (/rm\s+(-[a-zA-Z]*\s+)?\*\s*$/.test(c) || /rm\s+(-[a-zA-Z]*\s+)?\/\*\s*$/.test(c)) {
    return 'Deletes ALL files in the current directory'
  }
  // rm -rf / or rm -rf ~ (system-wide destructive)
  if (/rm\s+(-[a-zA-Z]*\s+)*(\/|~)\s*($|;|&&|\|\|)/.test(c)) {
    return 'Deletes an entire system path (root or home)'
  }
  // rm -rf with root-absolute paths (recursive delete of system paths)
  if (/rm\s+-[a-zA-Z]*r/.test(c) && /\s+\/\w/.test(c)) {
    return 'Recursive delete with root-absolute paths'
  }
  // sudo commands
  if (/^sudo\s/.test(c) || /;\s*sudo\s/.test(c) || /&&\s*sudo\s/.test(c) || /\|\|\s*sudo\s/.test(c)) {
    return 'Runs a command as root (sudo)'
  }
  // dd (disk destroyer)
  if (/\bdd\s+/.test(c)) {
    return 'Direct disk write (dd)'
  }
  // Format commands
  if (/\bmkfs\b/.test(c) || /\bformat\b/.test(c)) {
    return 'Formats a filesystem'
  }
  // System halt/power
  if (/\b(shutdown|reboot|halt|poweroff|init\s+[06])\b/.test(c)) {
    return 'Shuts down or reboots the system'
  }
  // mv to system dirs (silent overwrite possible)
  if (/\bmv\s+.*\s+\/(etc|bin|sbin|lib|usr|boot|root|var)\b/.test(c)) {
    return 'Moves files into a critical system directory'
  }
  // chmod/chown recursively on system paths
  if (/\b(chmod|chown)\s+.*\s+\/(etc|bin|sbin|lib|usr|boot|root|var)\b/.test(c)) {
    return 'Changes permissions/ownership on system directories'
  }
  // kill -9 all / killall
  if (/\bkill\s+-9?\s+-1\b/.test(c) || /\bkillall\b/.test(c)) {
    return 'Force-kills processes system-wide'
  }
  // git push --force
  if (/\bgit\s+push\s+.*--force\b/.test(c) || /\bgit\s+push\s+.*-f\b/.test(c)) {
    return 'Force-pushes to git (can overwrite remote history)'
  }
  // Package manager install/update system packages
  if (/\b(apt|apt-get|yum|dnf|pacman|apk)\s+(install|remove|purge|upgrade|dist-upgrade)\b/.test(c)) {
    return 'Modifies system packages'
  }
  return null
}

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
      const danger = isDangerousCommand(command)
      if (danger) {
        // Force approval before executing any dangerous command.
        const header = '⚠ Danger'
        const question = `${danger}.\n\nCommand: \`${command}\`\n\nAllow this command to run?`
        const options = ['Yes, run it', 'No, cancel']
        const db = getDb()
        const now = new Date().toISOString()
        const qId = newId()
        const q: Question = {
          id: qId,
          chatId: ctx.chatId,
          header,
          question,
          options,
          allowCustom: false,
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

        // If denied, refuse execution. The AI sees this error and must not retry.
        if (!options.includes(answer)) {
          q.status = 'answered'
          q.answer = answer
          q.selectedOption = null
          q.answeredAt = new Date().toISOString()
          saveDb()
          ctx.onEvent('question', JSON.stringify(q))
          return err(`User DENIED this dangerous command. You must NOT attempt to run this command again. Continue with an alternative approach or stop.`)
        }

        q.status = 'answered'
        q.answer = answer
        q.selectedOption = answer
        q.answeredAt = new Date().toISOString()
        saveDb()
        ctx.onEvent('question', JSON.stringify(q))
      }

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
      const step = plan.steps[idx]
      if (step.status === 'done') {
        return ok(`OK step ${idx} already complete`, `done: ${step.title.slice(0, 60)}`)
      }
      // Enforce sequential completion: all previous steps must be done
      for (let i = 0; i < idx; i++) {
        if (plan.steps[i].status !== 'done') {
          return err(`cannot complete step ${idx} before step ${i} is done — complete steps sequentially`)
        }
      }
      step.status = 'done'
      plan.updatedAt = new Date().toISOString()
      saveDb()
      ctx.onEvent('plan', JSON.stringify(plan))
      return ok(`OK step ${idx} marked complete`, `done: ${step.title.slice(0, 60)}`)
    }

    case 'open_preview': {
      const rawPort = args.port
      const port = typeof rawPort === 'string' ? Number(rawPort) : Number(rawPort)
      if (!Number.isInteger(port) || port < 1 || port > 65535) return err('port must be an integer 1-65535')
      const db = getDb()
      // Replace any existing preview for this chat — one active preview per chat like plan
      db.previews = (db.previews || []).filter((p) => p.chatId !== ctx.chatId)
      const now = new Date().toISOString()
      const preview = { id: newId(), chatId: ctx.chatId, port, createdAt: now, updatedAt: now }
      db.previews.push(preview)
      saveDb()
      ctx.onEvent('preview', JSON.stringify(preview))
      return ok(`OK preview set to port ${port}`, `preview :${port}`)
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
      const q: Question = {
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
  /** Maximum tokens for LLM response (optional). */
  maxTokens?: number
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
  // Only promote pending -> working if no step is currently working
  if (plan.steps.some((s) => s.status === 'working')) return
  const pendingIdx = plan.steps.findIndex((s) => s.status === 'pending')
  if (pendingIdx === -1) return
  plan.steps[pendingIdx].status = 'working'
  plan.updatedAt = new Date().toISOString()
  saveDb()
  ctx.onEvent('plan', JSON.stringify(plan))
}

function revertWorkingSteps(ctx: ToolContext): void {
  const plan = findPlanForChat(ctx.chatId)
  if (!plan) return
  let changed = false
  for (const s of plan.steps) {
    if (s.status === 'working') {
      s.status = 'pending'
      changed = true
    }
  }
  if (changed) {
    plan.updatedAt = new Date().toISOString()
    saveDb()
    ctx.onEvent('plan', JSON.stringify(plan))
  }
}

export async function runAgentLoop(opts: AgentRunOptions): Promise<AgentRunOutcome> {
  const messages: LLMMessage[] = [...opts.history]
  const ctx: ToolContext = { projectPath: opts.projectPath, chatId: opts.chatId, onEvent: opts.onEvent, signal: opts.signal }
  let content = ''

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (opts.signal.aborted) throw abortError()
      markWorkingStep(ctx)

    let roundText = ''
    let outcome: Awaited<ReturnType<typeof streamChatWithTools>> | null = null
    let attempt = 0
    const maxAttempts = opts.retrySettings?.enabled === false ? 0 : (opts.retrySettings?.maxRetries ?? 5)
    while (true) {
      roundText = ''
      try {
        outcome = await streamChatWithTools(
          opts.baseUrl,
          opts.apiKey,
          opts.model,
          messages,
          AGENT_TOOLS,
          (text) => {
            roundText += text
            content += text
            opts.onDelta(text)
          },
          opts.signal,
          opts.retrySettings,
          opts.maxTokens
        )
        break
      } catch (e: any) {
        if (e?.name === 'AbortError') throw e
        const msg = String(e?.message || e)
        // if we already streamed some text for this round, don't retry (would duplicate)
        if (roundText.length > 0) throw e
        const isRetryableStatus = !!opts.retrySettings?.alwaysRetry || (opts.retrySettings?.retryOnStatusCodes ?? [429, 502, 503]).some((code) => msg.includes(String(code)))
        const isStopStatus = !opts.retrySettings?.alwaysRetry && (opts.retrySettings?.stopOnStatusCodes ?? [400, 401, 403, 404]).some((code) => msg.includes(` ${code}`) || msg.includes(`:${code}`) || msg.includes(`status\":${code}`))
        const shouldRetry = (opts.retrySettings?.enabled ?? true) && isRetryableStatus && !isStopStatus && attempt < maxAttempts
        if (!shouldRetry) throw e
        // respect Retry-After if present in msg
        let delay = Math.min((opts.retrySettings?.baseDelayMs ?? 1200) * Math.pow(2, attempt) + Math.random() * 800, opts.retrySettings?.maxDelayMs ?? 30000)
        const m = msg.match(/retry-after[^0-9]*(\d+)/i)
        if (m) {
          const secs = Number(m[1])
          if (!Number.isNaN(secs) && secs >= 0 && secs < 300) delay = Math.max(delay, secs * 1000)
        }
        await new Promise<void>((resolve, reject) => {
          const t = setTimeout(resolve, delay)
          opts.signal.addEventListener('abort', () => { clearTimeout(t); reject(abortError()) }, { once: true })
        })
        attempt++
        // clear any partial roundText that was already counted (already handled)
        roundText = ''
        continue
      }
    }
    if (!outcome) break

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
      // Persist activity for this tool call (per chat, like plan) so it survives refresh
      let parsedArgs: Record<string, unknown> = {}
      try { parsedArgs = JSON.parse(call.args || '{}') } catch {}
      // truncate large content fields to avoid DB bloat but keep full for small args
      const storedArgs: Record<string, unknown> = { ...parsedArgs }
      if (typeof storedArgs.content === 'string' && (storedArgs.content as string).length > 8000) {
        storedArgs.content = (storedArgs.content as string).slice(0, 8000) + '\n…[truncated for storage]'
      }
      const activity: Activity = {
        id: call.id,
        chatId: ctx.chatId,
        toolType: call.name as Activity['toolType'],
        toolCallId: call.id,
        args: storedArgs,
        summary: '',
        timestamp: new Date().toISOString(),
      }
      try {
        getDb().activities.push(activity)
        saveDb()
      } catch {}
      opts.onEvent(
        'tool',
        JSON.stringify({ callId: call.id, name: call.name, args: call.args.slice(0, 300) })
      )
      ctx.toolCallId = call.id
      const res = await executeTool(call.name, call.args, ctx)
      // Update persisted activity with result
      try {
        const act = getDb().activities.find((a) => a.toolCallId === call.id)
        if (act) {
          act.summary = res.summary
          act.result = res.result
          act.ok = res.ok
          saveDb()
        }
      } catch {}
      opts.onEvent(
        'tool_result',
        JSON.stringify({ callId: call.id, ok: res.ok, summary: res.summary, result: res.result })
      )
      messages.push({ role: 'tool', tool_call_id: call.id, content: res.result })
    }
  }
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      revertWorkingSteps(ctx)
      throw e
    }
    throw e
  }

  // Agent finished — revert any lingering 'working' back to 'pending'
  // so incomplete steps are not falsely shown as complete or still executing.
  // Steps only become 'done' via explicit complete_plan_step calls.
  revertWorkingSteps(ctx)

  return { content, stopped: false }
}

function abortError(): Error {
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}
