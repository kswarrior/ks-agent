import os from 'node:os'
import { config } from './config.js'
import { insertMessage, listChatDisabled, listMessages } from './db.js'
import { extensions } from './extensions.js'
import { streamCompletion, type LLMMessage, type StreamResult } from './llm.js'
import { lsp } from './lsp.js'
import { mcp } from './mcp.js'
import { skills } from './skills.js'
import { BUILTIN_TOOL_NAMES, builtinToolDefs, executeBuiltinTool } from './tools.js'
import type { AgentEvent, Chat, Message, ModelEntry, Project, Provider, ToolCall, ToolResult } from './types.js'

export interface RunAgentOptions {
  chat: Chat
  project: Project
  provider: Provider
  model: ModelEntry
  signal: AbortSignal
  onEvent: (event: AgentEvent) => void | Promise<void>
}

const PRIMARY_SYSTEM_PROMPT = `You are KS Agent, a precise coding agent working inside one project directory.

## Scope
- The project root is the ONLY writable workspace. Every path is relative to it.
- Never read or write outside the project. Never run commands that escape it.
- Prefer the provided tools over guessing. Read a file before editing it.

## Workflow
1. Understand the request and inspect the project (tree, find_files, glob, grep, read_file).
2. For multi-step or unclear work, use update_plan to track 3-6 high-level phases such as explore, reproduce, fix, test and verify. You may explore first and write the plan once you understand the problem, or write it immediately for a clear task. Do not turn individual tool calls into plan steps. Update the done flags as phases finish.
3. Make focused edits. Preserve existing style and conventions. Use apply_patch for multi-hunk changes, append_file for additions, and copy_file/create_dir for structure.
4. Run builds/tests with run_shell and fix real failures. Use lsp_diagnostics on edited source files when a language server is configured.
5. Use the native git_* tools for status, diff, log, branches and commits instead of shell git.
6. Finish with a short summary of what changed and how it was verified.

## Rules
- Do not invent file contents or paths. Verify with tools.
- Do not overwrite unrelated work. Do not delete without checking references.
- Keep tool output small: use offset/limit, include filters, and max_results.
- If a command or edit fails, read the error, fix the cause, and retry.
- Skills are reusable instruction sets. Call use_skill before work that matches
  an installed skill and follow its workflow.
- Extension tools are named ext_<extension>_<tool>. They run in isolated child
  processes and receive the project path. Use them for stack-specific work
  (web, Minecraft, Android, ...).
- MCP tools are named mcp_<server>_<tool> and come from configured MCP servers.
  Prefer them for integrations they provide.
- LSP diagnostics come from lsp_diagnostics. Treat reported errors as real
  failures and fix them before finishing.`

type DisabledExtensions = ReturnType<typeof listChatDisabled>

function systemMessage(project: Project, disabled: DisabledExtensions): LLMMessage {
  const extra = [
    skills.promptSection(project.id, disabled.skill),
    mcp.promptSection(project.id, disabled.mcp),
    lsp.promptSection(project.id, disabled.lsp)
  ]
    .filter(Boolean)
    .join('\n\n')
  return {
    role: 'system',
    content: `${PRIMARY_SYSTEM_PROMPT}

## Environment
- Project: ${project.name}
- Root: ${project.path}
- Platform: ${os.platform()} ${os.release()}
- Date: ${new Date().toISOString()}
- Shell: ${process.env.SHELL || '/bin/bash'}${extra ? `\n\n${extra}` : ''}`
  }
}

function messageToLLM(message: Message): LLMMessage {
  const out: LLMMessage = { role: message.role, content: message.content }
  if (message.role === 'assistant' && message.toolCalls?.length) out.tool_calls = message.toolCalls
  if (message.role === 'tool' && message.toolCallId) out.tool_call_id = message.toolCallId
  return out
}

function trimHistory(system: LLMMessage, history: Message[]): LLMMessage[] {
  const mapped = history.map(messageToLLM)
  let start = 0
  const charCount = () => mapped.slice(start).reduce((sum, msg) => sum + msg.content.length + 64, 0)
  while (
    mapped.length - start > config.maxHistoryMessages ||
    charCount() > config.maxContextChars
  ) {
    start++
    while (start < mapped.length && mapped[start].role === 'tool') start++
  }
  return [system, ...mapped.slice(start)]
}

function isRetryableProviderError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'AbortError') return false
  if (error.name === 'TimeoutError') return true
  const match = /Provider error (\d{3})/.exec(error.message)
  if (match) {
    const status = Number(match[1])
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500
  }
  return /fetch failed|network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up|UND_ERR/i.test(
    error.message
  )
}

function waitForRetry(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function parseArguments(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : { value: parsed }
  } catch {
    return { __parse_error: raw }
  }
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  project: Project,
  signal: AbortSignal
): Promise<ToolResult> {
  if (args.__parse_error) {
    return { ok: false, output: `Could not parse tool arguments as JSON: ${String(args.__parse_error).slice(0, 500)}` }
  }
  if (BUILTIN_TOOL_NAMES.has(name)) {
    return executeBuiltinTool(name, args, { projectPath: project.path, signal })
  }
  if (name === 'use_skill') {
    return skills.call(name, args)
  }
  if (mcp.findTool(name)) {
    return mcp.callTool(name, args)
  }
  if (name === 'lsp_diagnostics') {
    return lsp.callTool(name, args, project.path)
  }
  if (extensions.findTool(name)) {
    return extensions.callTool(name, args, project.path)
  }
  return { ok: false, output: `Unknown tool: ${name}` }
}

export async function runAgent(options: RunAgentOptions): Promise<void> {
  const { chat, project, provider, model, signal, onEvent } = options
  const emit = async (event: AgentEvent) => {
    await onEvent(event)
  }

  await mcp.ready()
  const system = systemMessage(project)
  let history = listMessages(chat.id)
  let messages = trimHistory(system, history)
  let partial = ''

  await extensions.runHook('agent.start', project.path, { chatId: chat.id })

  try {
    for (let step = 1; step <= config.maxSteps; step++) {
      if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
      await emit({ type: 'step', step, maxSteps: config.maxSteps })
      await emit({ type: 'assistant_start', step })
      partial = ''

      const tools = [
        ...builtinToolDefs,
        ...skills.toolDefs(),
        ...mcp.toolDefs(),
        ...lsp.toolDefs(),
        ...extensions.toolDefs()
      ]
      let result: StreamResult | null = null
      for (let attempt = 0; ; attempt++) {
        let outputStarted = false
        partial = ''
        try {
          result = await streamCompletion({
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            model: model.modelId,
            messages,
            tools,
            signal,
            callbacks: {
              onContent: (text) => {
                outputStarted = true
                partial += text
                void emit({ type: 'token', text }).catch(() => {})
              },
              onReasoning: (text) => {
                outputStarted = true
                void emit({ type: 'reasoning', text }).catch(() => {})
              }
            }
          })
          break
        } catch (error) {
          if (
            signal.aborted ||
            outputStarted ||
            attempt >= config.providerRetries ||
            !isRetryableProviderError(error)
          ) {
            throw error
          }
          const delay = Math.min(config.providerRetryDelayMs * 2 ** attempt, 10_000)
          console.warn(
            `[agent] provider error, retrying in ${delay}ms (${attempt + 1}/${config.providerRetries}):`,
            error instanceof Error ? error.message : String(error)
          )
          await waitForRetry(delay, signal)
        }
      }
      if (!result) throw new Error('Provider returned no result')

      if (result.toolCalls.length) {
        const toolCalls: ToolCall[] = result.toolCalls.map((call, index) => ({
          id: call.id || `call_${step}_${index}`,
          type: 'function',
          function: { name: call.name, arguments: call.arguments || '{}' }
        }))
        const assistant = insertMessage({
          chatId: chat.id,
          role: 'assistant',
          content: result.content,
          toolCalls
        })
        messages.push({
          role: 'assistant',
          content: result.content,
          tool_calls: toolCalls
        })

        for (const call of toolCalls) {
          const args = parseArguments(call.function.arguments)
          await emit({
            type: 'tool_start',
            call: { id: call.id, name: call.function.name, arguments: call.function.arguments }
          })
          const started = Date.now()
          const toolResult = await executeTool(call.function.name, args, project, signal)
          insertMessage({
            chatId: chat.id,
            role: 'tool',
            content: toolResult.output,
            toolCallId: call.id
          })
          messages.push({
            role: 'tool',
            content: toolResult.output,
            tool_call_id: call.id
          })
          await emit({
            type: 'tool_end',
            call: { id: call.id, name: call.function.name, arguments: call.function.arguments },
            result: { ok: toolResult.ok, output: toolResult.output },
            durationMs: Date.now() - started
          })
        }

        history = listMessages(chat.id)
        messages = trimHistory(system, history)
        void assistant
        continue
      }

      const finalMessage = insertMessage({
        chatId: chat.id,
        role: 'assistant',
        content: result.content
      })
      await emit({ type: 'done', message: finalMessage })
      return
    }

    const notice =
      `Stopped after ${config.maxSteps} steps without finishing. ` +
      'The task may be incomplete; continue with a narrower instruction.'
    const finalMessage = insertMessage({ chatId: chat.id, role: 'assistant', content: notice })
    await emit({ type: 'done', message: finalMessage, maxStepsReached: true })
  } catch (error) {
    const isAbort = signal.aborted || (error instanceof Error && error.name === 'AbortError')
    if (isAbort) {
      if (partial.trim()) {
        insertMessage({ chatId: chat.id, role: 'assistant', content: partial })
      }
      await emit({ type: 'done', aborted: true })
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    await emit({ type: 'error', error: message })
  } finally {
    await extensions.runHook('agent.finish', project.path, { chatId: chat.id })
  }
}
