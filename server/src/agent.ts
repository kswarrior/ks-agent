import os from 'node:os'
import { config } from './config.js'
import { insertMessage, listChatDisabled, listMessages } from './db.js'
import { describeFailure } from './errors.js'
import { extensions } from './extensions.js'
import { streamCompletion, type LLMMessage, type StreamResult } from './llm.js'
import {
  getRetrySettings,
  isRetryableProviderError,
  retryDelayMs
} from './retry.js'
import { lsp } from './lsp.js'
import { mcp } from './mcp.js'
import { isProjectEnabled } from './scope.js'
import { skills } from './skills.js'
import { BUILTIN_TOOL_NAMES, builtinToolDefs, executeBuiltinTool } from './tools.js'
import type { AgentEvent, Chat, Message, ModelEntry, Project, Provider, ToolCall, ToolDef, ToolResult } from './types.js'

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
  failures and fix them before finishing.
- The "Chat tool selection" block in the environment is authoritative for this
  chat. Answer questions about which skills, MCP servers or language servers
  are available, enabled, disabled or usable from that block. Call
  list_chat_extensions if you need a mid-run refresh, and never guess counts or
  repeat an earlier answer.`

type DisabledExtensions = ReturnType<typeof listChatDisabled>

function systemMessage(project: Project, disabled: DisabledExtensions): LLMMessage {
  const extra = [
    skills.promptSection(project.id, disabled.skill),
    mcp.promptSection(project.id, disabled.mcp),
    lsp.promptSection(project.id, disabled.lsp)
  ]
    .filter(Boolean)
    .join('\n\n')
  const selection = chatExtensionsStatus(project, disabled).output
  return {
    role: 'system',
    content: `${PRIMARY_SYSTEM_PROMPT}

## Environment
- Project: ${project.name}
- Root: ${project.path}
- Platform: ${os.platform()} ${os.release()}
- Date: ${new Date().toISOString()}
- Shell: ${process.env.SHELL || '/bin/bash'}${extra ? `\n\n${extra}` : ''}

${selection}`
  }
}

const CHAT_EXTENSIONS_TOOL: ToolDef = {
  type: 'function',
  function: {
    name: 'list_chat_extensions',
    description:
      'List configured skills, MCP servers and language servers with their project scope and whether they are enabled in this chat. Use this whenever the user asks what is available, enabled or disabled.',
    parameters: { type: 'object', properties: {} }
  }
}

function chatExtensionState(
  projects: string[],
  name: string,
  projectId: string,
  disabled: Set<string>
): 'project' | 'chat' | 'enabled' {
  if (!isProjectEnabled(projects, projectId)) return 'project'
  return disabled.has(name) ? 'chat' : 'enabled'
}

function chatExtensionsStatus(project: Project, disabled: DisabledExtensions): ToolResult {
  const skillItems = skills.list()
  const mcpItems = mcp.list()
  const lspItems = lsp.list()
  const isEnabled = (item: { name: string; projects: string[] }, set: Set<string>) =>
    chatExtensionState(item.projects, item.name, project.id, set) === 'enabled'
  const enabledCount = (items: Array<{ name: string; projects: string[] }>, set: Set<string>) =>
    items.filter((item) => isEnabled(item, set)).length
  const skillUsable = skillItems.filter((item) => isEnabled(item, disabled.skill)).length
  const mcpUsable = mcpItems.filter(
    (server) => isEnabled(server, disabled.mcp) && server.status === 'ready'
  ).length
  const lspUsable = lspItems.filter(
    (server) => isEnabled(server, disabled.lsp) && server.status !== 'error'
  ).length

  const lines = [`Chat tool selection for project "${project.name}" (authoritative for this chat):`]

  lines.push(
    `Skills (${skillItems.length} configured, ${enabledCount(skillItems, disabled.skill)} enabled, ${skillUsable} usable):`
  )
  if (skillItems.length === 0) lines.push('- none')
  for (const skill of skillItems.sort((a, b) => a.name.localeCompare(b.name))) {
    const state = chatExtensionState(skill.projects, skill.name, project.id, disabled.skill)
    if (state === 'project') lines.push(`- ${skill.name}: not enabled for this project`)
    else if (state === 'chat') lines.push(`- ${skill.name}: disabled in this chat`)
    else lines.push(`- ${skill.name}: enabled`)
  }

  lines.push(
    `MCP servers (${mcpItems.length} configured, ${enabledCount(mcpItems, disabled.mcp)} enabled, ${mcpUsable} usable):`
  )
  if (mcpItems.length === 0) lines.push('- none')
  for (const server of mcpItems.sort((a, b) => a.name.localeCompare(b.name))) {
    const state = chatExtensionState(server.projects, server.name, project.id, disabled.mcp)
    const detail = `${server.transport}, ${server.tools.length} tool${server.tools.length === 1 ? '' : 's'}`
    if (state === 'project') lines.push(`- ${server.name} (${detail}): not enabled for this project`)
    else if (state === 'chat') lines.push(`- ${server.name} (${detail}): disabled in this chat`)
    else if (server.status === 'error') {
      lines.push(`- ${server.name} (${detail}): enabled but unavailable: ${server.error ?? 'failed to start'}`)
    } else {
      lines.push(
        `- ${server.name} (${detail}): enabled${server.status === 'ready' ? ' (running)' : ' (not running)'}`
      )
    }
  }

  lines.push(
    `Language servers (${lspItems.length} configured, ${enabledCount(lspItems, disabled.lsp)} enabled, ${lspUsable} usable):`
  )
  if (lspItems.length === 0) lines.push('- none')
  for (const server of lspItems.sort((a, b) => a.name.localeCompare(b.name))) {
    const state = chatExtensionState(server.projects, server.name, project.id, disabled.lsp)
    const detail = `${server.command}${server.extensions.length ? `; ${server.extensions.join(', ')}` : ''}`
    if (state === 'project') lines.push(`- ${server.name} (${detail}): not enabled for this project`)
    else if (state === 'chat') lines.push(`- ${server.name} (${detail}): disabled in this chat`)
    else if (server.status === 'error') {
      lines.push(`- ${server.name} (${detail}): enabled but unavailable: ${server.error ?? 'failed to start'}`)
    } else {
      lines.push(
        `- ${server.name} (${detail}): enabled${
          server.status === 'ready'
            ? ' (running)'
            : server.status === 'starting'
              ? ' (starting)'
              : ' (not running)'
        }`
      )
    }
  }

  const count = (value: number, singular: string, plural = `${singular}s`) =>
    `${value} ${value === 1 ? singular : plural}`
  lines.push(
    `Usable now: ${count(skillUsable, 'skill')}, ${count(
      mcpUsable,
      'MCP server'
    )}, ${count(lspUsable, 'language server')}.`
  )
  lines.push(
    'Only project-enabled, chat-enabled and usable items are exposed as tools; disabled or unavailable items cannot be called.'
  )
  return { ok: true, output: lines.join('\n') }
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
  signal: AbortSignal,
  disabled: DisabledExtensions
): Promise<ToolResult> {
  if (args.__parse_error) {
    return { ok: false, output: `Could not parse tool arguments as JSON: ${String(args.__parse_error).slice(0, 500)}` }
  }
  if (name === 'list_chat_extensions') return chatExtensionsStatus(project, disabled)
  if (BUILTIN_TOOL_NAMES.has(name)) {
    return executeBuiltinTool(name, args, { projectPath: project.path, signal })
  }
  if (name === 'use_skill') {
    return skills.call(name, args, project.id, disabled.skill)
  }
  if (mcp.findTool(name, project.id, disabled.mcp)) {
    return mcp.callTool(name, args, project.id, disabled.mcp)
  }
  if (name === 'lsp_diagnostics') {
    return lsp.callTool(name, args, project.path, project.id, disabled.lsp)
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

  const disabled = listChatDisabled(chat.id)
  await mcp.ready(project.id, disabled.mcp)
  const system = systemMessage(project, disabled)
  let history = listMessages(chat.id)
  let messages = trimHistory(system, history)
  let partial = ''
  let providerAttempts = 0
  const retrySettings = getRetrySettings()
  const runStartedAt = Date.now()

  await extensions.runHook('agent.start', project.path, { chatId: chat.id })

  try {
    for (let step = 1; step <= config.maxSteps; step++) {
      if (signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
      await emit({ type: 'step', step, maxSteps: config.maxSteps })
      await emit({ type: 'assistant_start', step })
      partial = ''
      const stepStartedAt = Date.now()

      const tools = [
        CHAT_EXTENSIONS_TOOL,
        ...builtinToolDefs,
        ...skills.toolDefs(project.id, disabled.skill),
        ...mcp.toolDefs(project.id, disabled.mcp),
        ...lsp.toolDefs(project.id, disabled.lsp),
        ...extensions.toolDefs()
      ]
      let result: StreamResult | null = null
      for (let attempt = 0; ; attempt++) {
        providerAttempts = attempt + 1
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
          const allowed =
            retrySettings.enabled &&
            !signal.aborted &&
            !outputStarted &&
            isRetryableProviderError(error, retrySettings) &&
            (retrySettings.unlimited || attempt < retrySettings.maxRetries)
          if (!allowed) throw error

          const delay = retryDelayMs(error, attempt, retrySettings)
          const failure = describeFailure(error, { attempts: providerAttempts, retryable: true })
          const maxAttempts = retrySettings.unlimited ? null : retrySettings.maxRetries
          await emit({
            type: 'retry',
            attempt: providerAttempts,
            maxAttempts,
            unlimited: retrySettings.unlimited,
            delayMs: delay,
            nextAt: Date.now() + delay,
            ...failure
          })
          console.warn(
            `[agent] ${failure.error}; retrying in ${delay}ms (${
              retrySettings.unlimited ? `${providerAttempts}/∞` : `${providerAttempts}/${maxAttempts}`
            })`
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
          toolCalls,
          modelId: model.id,
          durationMs: Date.now() - stepStartedAt
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
          const toolResult = await executeTool(call.function.name, args, project, signal, disabled)
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
        content: result.content,
        modelId: model.id,
        durationMs: Date.now() - runStartedAt
      })
      await emit({ type: 'done', message: finalMessage })
      return
    }

    const notice =
      `Stopped after ${config.maxSteps} steps without finishing. ` +
      'The task may be incomplete; continue with a narrower instruction.'
    const finalMessage = insertMessage({
      chatId: chat.id,
      role: 'assistant',
      content: notice,
      modelId: model.id,
      durationMs: Date.now() - runStartedAt
    })
    await emit({ type: 'done', message: finalMessage, maxStepsReached: true })
  } catch (error) {
    const isAbort = signal.aborted || (error instanceof Error && error.name === 'AbortError')
    if (isAbort) {
      if (partial.trim()) {
        insertMessage({
          chatId: chat.id,
          role: 'assistant',
          content: partial,
          modelId: model.id,
          durationMs: Date.now() - runStartedAt
        })
      }
      await emit({ type: 'done', aborted: true })
      return
    }
    const failure = describeFailure(error, {
      attempts: providerAttempts || undefined,
      retryable: isRetryableProviderError(error, retrySettings)
    })
    await emit({ type: 'error', ...failure })
  } finally {
    await extensions.runHook('agent.finish', project.path, { chatId: chat.id })
  }
}
