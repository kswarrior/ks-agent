import {
  AgentRole,
  AgentRun,
  AgentState,
  AgentStep,
  AppSettings,
  ChatRequest,
  ChatRequestMessage,
  Message,
  ModelSettings,
  ProviderSettings,
  ServerEvent,
  ToolCall,
  ToolName,
} from '@ks-agent/types';
import { DB, getDatabase } from '@ks-agent/database';
import {
  AgentRunsRepo,
  AgentStepsRepo,
  AppSettingsRepo,
  MessagesRepo,
  ModelsRepo,
  ProvidersRepo,
  ToolCallsRepo,
  loadAppSettings,
} from '@ks-agent/database';
import { EventBus } from './event-bus';
import { buildProvider } from '@ks-agent/ai';
import { executeTool, toolsAsOpenAITools, getToolDefinitions } from '@ks-agent/tools';
import {
  SYSTEM_CODER,
  SYSTEM_EXPLORER,
  SYSTEM_FINAL_TESTER,
  SYSTEM_FIXER,
  SYSTEM_PLANNER,
  SYSTEM_REVIEWER,
  SYSTEM_TESTER,
} from './prompts';
import { extractJson } from './json-parser';
import { logger, randomId } from '@ks-agent/shared';

export interface WorkflowDeps {
  db: DB;
  eventBus: EventBus;
  requestApproval?: (
    runId: string,
    toolName: ToolName,
    args: any,
  ) => Promise<boolean>;
}

export class AgentWorkflow {
  private running = new Set<string>();
  private abortControllers = new Map<string, AbortController>();

  constructor(private deps: WorkflowDeps) {}

  isRunning(runId: string) {
    return this.running.has(runId);
  }

  cancel(runId: string) {
    if (!this.running.has(runId) && !this.abortControllers.has(runId)) return;
    const ctrl = this.abortControllers.get(runId);
    if (ctrl) ctrl.abort();
    this.running.delete(runId);
    const db = this.deps.db;
    AgentRunsRepo.update(db, runId, { status: 'cancelled', finished_at: new Date().toISOString() });
    this.emit({ type: 'agent_run.failed', runId, error: 'Cancelled by user' });
  }

  async startRun(chatId: string, userMessage: string): Promise<string> {
    return this.start(chatId, userMessage);
  }

  private emit(event: ServerEvent) {
    this.deps.eventBus.emit(event);
  }

  async start(chatId: string, userMessage: string): Promise<string> {
    // Public entry point (also exposed via startRun)
    const db = this.deps.db;
    const settings = loadAppSettings(db);
    const run = AgentRunsRepo.create(db, chatId, userMessage, settings.agent.max_fix_iterations);
    const userMsg = MessagesRepo.create(db, chatId, 'user', userMessage);
    AgentRunsRepo.update(db, run.id, { message_id: userMsg.id });
    this.runWorkflow(run.id).catch((err) => {
      logger.error('Workflow crashed', { error: err?.message, runId: run.id }, 'workflow');
      AgentRunsRepo.update(db, run.id, { status: 'failed', state: 'FAILED', finished_at: new Date().toISOString() });
      this.emit({ type: 'agent_run.failed', runId: run.id, error: err?.message ?? String(err) });
    });
    return run.id;
  }

  async resume(runId: string): Promise<void> {
    const db = this.deps.db;
    const run = AgentRunsRepo.get(db, runId);
    if (!run) throw new Error('Run not found');
    if (this.running.has(runId)) return; // already running
    if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      return;
    }
    this.runWorkflow(runId).catch((err) => {
      logger.error('Resumed workflow crashed', { error: err?.message, runId }, 'workflow');
      AgentRunsRepo.update(db, runId, { status: 'failed', state: 'FAILED', finished_at: new Date().toISOString() });
      this.emit({ type: 'agent_run.failed', runId, error: err?.message ?? String(err) });
    });
  }

  private async runWorkflow(runId: string) {
    if (this.running.has(runId)) return;
    this.running.add(runId);
    const db = this.deps.db;
    const ctrl = new AbortController();
    this.abortControllers.set(runId, ctrl);
    try {
      const run = AgentRunsRepo.get(db, runId);
      if (!run) throw new Error('Run not found');
      const settings = loadAppSettings(db);
      const project = this.getProjectForChat(run.chat_id);
      if (!project) throw new Error('Project not found for chat');

      this.emit({
        type: 'agent_run.started',
        runId,
        chatId: run.chat_id,
        state: 'PLANNING',
      });

      const recentMessages = MessagesRepo.listByChat(db, run.chat_id);
      const userPrompt = run.prompt;
      const history = recentMessages
        .filter((m) => !run.message_id || m.id !== run.message_id)
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-6);

      const chatMessages = history.map((m) => ({
        role: m.role as ChatRequestMessage['role'],
        content: m.content,
      }));

      // === PLANNER ===
      this.transition(runId, 'PLANNING');
      const plannerStep = this.beginStep(runId, 'planner', 'PLANNING', 'Planning the implementation');
      const planResult = await this.runPlanner({
        runId,
        userPrompt,
        chatMessages,
        settings,
        signal: ctrl.signal,
      });
      const planJson = extractJson<{ plan: string }>(planResult) ?? { plan: planResult };
      AgentRunsRepo.update(db, runId, { plan: planJson.plan });
      this.endStep(plannerStep.id, `Plan created (${planJson.plan.length} chars)`);

      // === EXPLORER ===
      this.transition(runId, 'EXPLORING');
      const explorerStep = this.beginStep(runId, 'explorer', 'EXPLORING', 'Exploring project');
      const explorerOut = await this.runExplorer({
        runId,
        userPrompt,
        plan: planJson.plan,
        rootDir: project.root_directory,
        settings,
        stepId: explorerStep.id,
        signal: ctrl.signal,
      });
      this.endStep(explorerStep.id, `Exploration complete`);

      // === CODER ===
      this.transition(runId, 'IMPLEMENTING');
      const coderStep = this.beginStep(runId, 'coder', 'IMPLEMENTING', 'Implementing changes');
      const coderOut = await this.runCoder({
        runId,
        userPrompt,
        plan: planJson.plan,
        explorerSummary: explorerOut,
        rootDir: project.root_directory,
        settings,
        stepId: coderStep.id,
        signal: ctrl.signal,
      });
      this.endStep(coderStep.id, 'Implementation phase finished');
      const changesDigest = this.buildChangesDigest(db, runId, coderStep.id);
      let fixIteration = 0;
      let reviewApproved = false;
      let testsPassed = false;
      let lastReview = '';
      let lastTester: any = null;

      const gatesEnabled =
        settings.agent.automatic_tests || settings.agent.review_before_completion;
      // Tests gate is only meaningful when automatic tests are on.
      const testsOk = () => (!settings.agent.automatic_tests ? true : testsPassed);

      while (fixIteration <= run.max_fix_iterations && gatesEnabled) {
        if (fixIteration > 0) {
          this.transition(runId, 'FIXING');
          const fixerStep = this.beginStep(runId, 'fixer', 'FIXING', `Fixing issues (iteration ${fixIteration})`);
          await this.runFixer({
            runId,
            userPrompt,
            plan: planJson.plan,
            review: lastReview,
            testerResult: lastTester,
            changesDigest,
            rootDir: project.root_directory,
            settings,
            stepId: fixerStep.id,
            signal: ctrl.signal,
          });
          this.endStep(fixerStep.id, 'Fixes applied');
        }

        if (settings.agent.automatic_tests) {
          // First pass is TESTING; after a fix cycle it is RETESTING.
          this.transition(runId, fixIteration > 0 ? 'RETESTING' : 'TESTING');
          const testerStep = this.beginStep(
            runId,
            'tester',
            fixIteration > 0 ? 'RETESTING' : 'TESTING',
            fixIteration > 0 ? 'Re-running tests after fixes' : 'Running tests',
          );
          const testerOut = await this.runTester({
            runId,
            userPrompt,
            plan: planJson.plan,
            changesDigest,
            rootDir: project.root_directory,
            settings,
            stepId: testerStep.id,
            signal: ctrl.signal,
          });
          lastTester = testerOut;
          testsPassed = testerOut.passed;
          this.endStep(
            testerStep.id,
            testsPassed ? 'Tests passed' : `Tests failed (${testerOut.failures?.length ?? 0} failures)`,
          );
        }

        if (settings.agent.review_before_completion) {
          this.transition(runId, 'REVIEWING');
          const reviewerStep = this.beginStep(runId, 'reviewer', 'REVIEWING', 'Reviewing changes');
          const reviewerOut = await this.runReviewer({
            runId,
            userPrompt,
            plan: planJson.plan,
            testerResult: lastTester,
            changesDigest,
            rootDir: project.root_directory,
            settings,
            stepId: reviewerStep.id,
            signal: ctrl.signal,
          });
          lastReview = JSON.stringify(reviewerOut, null, 2);
          AgentRunsRepo.update(db, runId, { review: lastReview });
          reviewApproved = !!reviewerOut.approved && testsOk();
          this.endStep(
            reviewerStep.id,
            reviewApproved ? 'Approved' : `Issues found (${reviewerOut.issues?.length ?? 0})`,
          );
          if (reviewApproved) break;
        } else if (testsPassed || !settings.agent.automatic_tests) {
          break;
        }

        fixIteration += 1;
        AgentRunsRepo.update(db, runId, { fix_iteration: fixIteration });
        if (fixIteration >= run.max_fix_iterations) break;
      }

      // === FINAL TESTER ===
      if (gatesEnabled && settings.agent.automatic_tests && settings.agent.review_before_completion && reviewApproved) {
        this.transition(runId, 'RETESTING');
        const finalStep = this.beginStep(runId, 'finalTester', 'RETESTING', 'Final verification');
        const finalResult = await this.runFinalTester({
          runId,
          userPrompt,
          rootDir: project.root_directory,
          settings,
          stepId: finalStep.id,
          signal: ctrl.signal,
        });
        this.endStep(finalStep.id, finalResult.passed ? 'Final tests passed' : 'Final tests failed');
        if (!finalResult.passed) {
          this.transition(runId, 'FAILED');
          AgentRunsRepo.update(db, runId, { status: 'failed', finished_at: new Date().toISOString() });
          this.emit({ type: 'agent_run.failed', runId, error: 'Final tests failed' });
          return;
        }
      }

      if (gatesEnabled && !(testsPassed || reviewApproved)) {
        this.transition(runId, 'FAILED');
        AgentRunsRepo.update(db, runId, { status: 'failed', finished_at: new Date().toISOString() });
        this.emit({ type: 'agent_run.failed', runId, error: 'Could not pass tests / review within iteration limit' });
        return;
      }

      // === DONE ===
      this.transition(runId, 'COMPLETED');
      AgentRunsRepo.update(db, runId, { status: 'completed', finished_at: new Date().toISOString() });
      const summary = await this.summarizeRun(runId);
      const assistantMsg = MessagesRepo.create(db, run.chat_id, 'assistant', summary, runId);
      this.emit({ type: 'message.final', runId, messageId: assistantMsg.id, content: summary });
      this.emit({ type: 'agent_run.completed', runId, state: 'COMPLETED' });
    } catch (e: any) {
      if (e?.name === 'AbortError' || /aborted/i.test(e?.message ?? '')) {
        AgentRunsRepo.update(db, runId, { status: 'cancelled', finished_at: new Date().toISOString() });
        this.emit({ type: 'agent_run.failed', runId, error: 'Cancelled' });
      } else {
        logger.error('Workflow error', { error: e?.message, runId }, 'workflow');
        AgentRunsRepo.update(db, runId, { status: 'failed', state: 'FAILED', finished_at: new Date().toISOString() });
        this.emit({ type: 'agent_run.failed', runId, error: e?.message ?? String(e) });
      }
    } finally {
      this.running.delete(runId);
      this.abortControllers.delete(runId);
    }
  }

  private transition(runId: string, state: AgentState) {
    const db = this.deps.db;
    AgentRunsRepo.update(db, runId, { state });
    this.emit({ type: 'agent_run.state', runId, state });
  }

  private beginStep(runId: string, role: AgentRole, state: AgentState, title: string): AgentStep {
    const db = this.deps.db;
    const step = AgentStepsRepo.create(db, runId, role, state, title);
    this.emit({ type: 'agent_step.started', runId, stepId: step.id, role, title });
    return step;
  }

  private endStep(stepId: string, details: string) {
    const db = this.deps.db;
    AgentStepsRepo.updateDetails(db, stepId, details);
    AgentStepsRepo.finish(db, stepId, 'completed');
    // Find runId by step id
    const row = db.prepare(`SELECT agent_run_id FROM agent_steps WHERE id = ?`).get(stepId) as
      | { agent_run_id: string }
      | undefined;
    if (row) {
      this.emit({ type: 'agent_step.details', runId: row.agent_run_id, stepId, details });
      this.emit({ type: 'agent_step.completed', runId: row.agent_run_id, stepId, status: 'completed' });
    }
  }

  /**
   * Role-specific change digest (plan §8): summarizes what the Coder actually
   * did — file diffs and command results — for the Tester/Reviewer/Fixer.
   */
  private buildChangesDigest(db: DB, runId: string, coderStepId?: string): string {
    const tools = ToolCallsRepo.listByRun(db, runId).filter(
      (t) => !coderStepId || t.agent_step_id === coderStepId,
    );
    if (!tools.length) return '(no tool calls recorded)';
    const parts: string[] = [];
    for (const t of tools) {
      let args: any = {};
      try {
        args = JSON.parse(t.arguments);
      } catch {
        // ignore
      }
      const failed = t.status === 'failed' || !!t.error;
      if (t.tool_name === 'shell') {
        parts.push(`${failed ? 'FAILED ' : ''}$ ${args?.command ?? '?'}\n${(t.result ?? t.error ?? '').slice(0, 2000)}`);
      } else {
        // write/edit results embed a unified diff after a blank line.
        const result = t.result ?? '';
        const diffStart = result.indexOf('\n--- a/');
        const diff = diffStart !== -1 ? result.slice(diffStart + 1) : '';
        parts.push(`${t.tool_name}: ${args?.path ?? ''}${failed ? ' (FAILED)' : ''}${diff ? `\n${diff.slice(0, 4000)}` : ''}`);
      }
    }
    return parts.join('\n\n').slice(0, 20000);
  }

  private getProjectForChat(chatId: string) {
    const db = this.deps.db;
    const row = db
      .prepare(
        `SELECT p.* FROM projects p JOIN chats c ON c.project_id = p.id WHERE c.id = ?`,
      )
      .get(chatId) as any;
    return row;
  }

  private async summarizeRun(runId: string): Promise<string> {
    const db = this.deps.db;
    const run = AgentRunsRepo.get(db, runId);
    const steps = AgentStepsRepo.listByRun(db, runId);
    const tools = ToolCallsRepo.listByRun(db, runId);
    const lines: string[] = [];
    lines.push(`### Run complete\n`);
    lines.push(`**Iterations:** ${run?.fix_iteration ?? 0}`);
    lines.push(`**Steps:** ${steps.length}`);
    lines.push(`**Tool calls:** ${tools.length}`);
    if (run?.plan) {
      lines.push(`\n**Plan summary:**\n${run.plan.slice(0, 1500)}`);
    }
    if (run?.review) {
      lines.push(`\n**Review:**\n${run.review.slice(0, 1500)}`);
    }
    const filesChanged = new Set<string>();
    for (const t of tools) {
      try {
        const args = JSON.parse(t.arguments);
        if (args?.path) filesChanged.add(args.path);
      } catch {
        // ignore
      }
    }
    if (filesChanged.size) {
      lines.push(`\n**Files touched:**\n${Array.from(filesChanged).map((f) => `- \`${f}\``).join('\n')}`);
    }
    return lines.join('\n');
  }

  // ============ ROLE RUNNERS ============

  private async runPlanner(args: {
    runId: string;
    userPrompt: string;
    chatMessages: ChatRequestMessage[];
    settings: AppSettings;
    signal: AbortSignal;
  }): Promise<string> {
    const messages: ChatRequestMessage[] = [
      { role: 'system', content: SYSTEM_PLANNER },
      ...args.chatMessages,
      {
        role: 'user',
        content: `User request:\n${args.userPrompt}\n\nProduce a JSON plan.`,
      },
    ];
    return this.simpleCompletion('planner', messages, args.settings, args.signal, args.runId);
  }

  private async runExplorer(args: {
    runId: string;
    userPrompt: string;
    plan: string;
    rootDir: string;
    settings: AppSettings;
    stepId: string;
    signal: AbortSignal;
  }): Promise<string> {
    const messages: ChatRequestMessage[] = [
      { role: 'system', content: SYSTEM_EXPLORER },
      {
        role: 'user',
        content: `Plan:\n${args.plan}\n\nUser request: ${args.userPrompt}`,
      },
    ];
    return this.toolLoop('explorer', messages, args.rootDir, args.settings, args.runId, args.stepId, args.signal, 8);
  }

  private async runCoder(args: {
    runId: string;
    userPrompt: string;
    plan: string;
    explorerSummary: string;
    rootDir: string;
    settings: AppSettings;
    stepId: string;
    signal: AbortSignal;
  }): Promise<string> {
    const messages: ChatRequestMessage[] = [
      { role: 'system', content: SYSTEM_CODER },
      {
        role: 'user',
        content: `Plan:\n${args.plan}\n\nExplorer summary:\n${args.explorerSummary}\n\nUser request: ${args.userPrompt}\n\nImplement it now. Use tools. Finish with a JSON summary.`,
      },
    ];
    return this.toolLoop('coder', messages, args.rootDir, args.settings, args.runId, args.stepId, args.signal, args.settings.agent.max_agent_steps);
  }

  private async runTester(args: {
    runId: string;
    userPrompt: string;
    plan: string;
    changesDigest: string;
    rootDir: string;
    settings: AppSettings;
    stepId: string;
    signal: AbortSignal;
  }): Promise<{ passed: boolean; failures: string[]; commands: any[]; logs: string }> {
    const messages: ChatRequestMessage[] = [
      { role: 'system', content: SYSTEM_TESTER },
      {
        role: 'user',
        content: `Plan:\n${args.plan}\n\nChanges made by the Coder (diffs + command results):\n${args.changesDigest}\n\nUser request: ${args.userPrompt}\n\nRun the tests now. Use shell. End with a JSON result.`,
      },
    ];
    const out = await this.toolLoop('tester', messages, args.rootDir, args.settings, args.runId, args.stepId, args.signal, 10);
    const parsed = extractJson<any>(out) ?? {};
    return {
      passed: !!parsed.passed,
      failures: parsed.failures ?? [],
      commands: parsed.commands ?? [],
      logs: parsed.logs ?? out,
    };
  }

  private async runReviewer(args: {
    runId: string;
    userPrompt: string;
    plan: string;
    testerResult: any;
    changesDigest: string;
    rootDir: string;
    settings: AppSettings;
    stepId: string;
    signal: AbortSignal;
  }): Promise<{ approved: boolean; issues: any[]; summary: string }> {
    const messages: ChatRequestMessage[] = [
      { role: 'system', content: SYSTEM_REVIEWER },
      {
        role: 'user',
        content: `User requirements: ${args.userPrompt}\n\nPlan:\n${args.plan}\n\nDiff of changes:\n${args.changesDigest}\n\nTester result:\n${JSON.stringify(args.testerResult ?? {}, null, 2)}\n\nReview now using read_file/list_files/search_code if needed. End with a JSON verdict.`,
      },
    ];
    const out = await this.toolLoop('reviewer', messages, args.rootDir, args.settings, args.runId, args.stepId, args.signal, 8);
    const parsed = extractJson<any>(out) ?? { approved: false, issues: [], summary: out };
    return {
      approved: !!parsed.approved,
      issues: parsed.issues ?? [],
      summary: parsed.summary ?? '',
    };
  }

  private async runFixer(args: {
    runId: string;
    userPrompt: string;
    plan: string;
    review: string;
    testerResult: any;
    changesDigest: string;
    rootDir: string;
    settings: AppSettings;
    stepId: string;
    signal: AbortSignal;
  }): Promise<string> {
    const messages: ChatRequestMessage[] = [
      { role: 'system', content: SYSTEM_FIXER },
      {
        role: 'user',
        content: `Plan:\n${args.plan}\n\nReview issues:\n${args.review}\n\nTester failures:\n${JSON.stringify(args.testerResult ?? {}, null, 2)}\n\nCurrent diff of changes:\n${args.changesDigest}\n\nFix now. End with JSON.`,
      },
    ];
    return this.toolLoop('fixer', messages, args.rootDir, args.settings, args.runId, args.stepId, args.signal, args.settings.agent.max_agent_steps);
  }

  private async runFinalTester(args: {
    runId: string;
    userPrompt: string;
    rootDir: string;
    settings: AppSettings;
    stepId: string;
    signal: AbortSignal;
  }): Promise<{ passed: boolean; commands: any[]; summary: string }> {
    const messages: ChatRequestMessage[] = [
      { role: 'system', content: SYSTEM_FINAL_TESTER },
      { role: 'user', content: 'Run the full test suite / build and report JSON.' },
    ];
    const out = await this.toolLoop('finalTester', messages, args.rootDir, args.settings, args.runId, args.stepId, args.signal, 10);
    const parsed = extractJson<any>(out) ?? { passed: false, commands: [], summary: out };
    return {
      passed: !!parsed.passed,
      commands: parsed.commands ?? [],
      summary: parsed.summary ?? '',
    };
  }

  // ============ CORE COMPLETION ============

  /** Emit a message.delta, throttled so fast streams don't flood SSE. */
  private makeDeltaEmitter(runId: string) {
    let pending = '';
    let lastFlush = 0;
    const flush = (force: boolean) => {
      if (!pending) return;
      const now = Date.now();
      if (!force && now - lastFlush < 80) return;
      this.emit({
        type: 'message.delta',
        runId,
        messageId: 'live',
        delta: pending,
      });
      pending = '';
      lastFlush = now;
    };
    return {
      add(delta: string) {
        if (!delta) return;
        pending += delta;
        flush(false);
      },
      done() {
        flush(true);
      },
    };
  }

  private async simpleCompletion(
    role: AgentRole,
    messages: ChatRequestMessage[],
    settings: AppSettings,
    signal: AbortSignal,
    runId: string,
  ): Promise<string> {
    const provider = this.resolveProvider(role, settings);
    if (!provider) throw new Error(`No provider configured for role ${role}`);
    const req: ChatRequest = {
      model: provider.model.model_id,
      messages,
      temperature: provider.model.temperature,
      max_tokens: provider.model.max_tokens,
      stream: true,
      signal,
    };
    const emitter = this.makeDeltaEmitter(runId);
    let fullText = '';
    try {
      for await (const chunk of provider.provider.stream(req, provider.settings)) {
        if (signal.aborted) throw new Error('aborted');
        if (chunk.delta) {
          fullText += chunk.delta;
          emitter.add(chunk.delta);
        }
      }
      emitter.done();
    } catch (e: any) {
      emitter.done();
      if (signal.aborted) throw new Error('aborted');
      logger.warn(`Streaming failed, falling back to non-stream: ${e?.message}`, undefined, 'workflow');
      const res = await provider.provider.chat({ ...req, stream: false }, provider.settings);
      fullText = res.content ?? '';
    }
    return fullText;
  }

  private async toolLoop(
    role: AgentRole,
    messages: ChatRequestMessage[],
    rootDir: string,
    settings: AppSettings,
    runId: string,
    stepId: string,
    signal: AbortSignal,
    maxSteps: number,
  ): Promise<string> {
    const provider = this.resolveProvider(role, settings);
    if (!provider) throw new Error(`No provider configured for role ${role}`);
    const tools = toolsAsOpenAITools();
    const knownTools = new Set<string>(getToolDefinitions().map((t) => t.name as string));
    let currentMessages = [...messages];
    let totalSteps = 0;
    while (totalSteps < maxSteps) {
      if (signal.aborted) throw new Error('aborted');
      totalSteps += 1;
      let fullText = '';
      const req: ChatRequest = {
        model: provider.model.model_id,
        messages: currentMessages,
        temperature: provider.model.temperature,
        max_tokens: provider.model.max_tokens,
        stream: true,
        tools,
        signal,
      };
      const emitter = this.makeDeltaEmitter(runId);
      try {
        for await (const chunk of provider.provider.stream(req, provider.settings)) {
          if (signal.aborted) throw new Error('aborted');
          if (chunk.delta) {
            fullText += chunk.delta;
            emitter.add(chunk.delta);
          }
        }
        emitter.done();
      } catch (e: any) {
        emitter.done();
        if (signal.aborted) throw new Error('aborted');
        logger.warn(`Streaming failed, falling back to non-stream: ${e?.message}`, undefined, 'workflow');
        const res = await provider.provider.chat({ ...req, stream: false }, provider.settings);
        fullText = res.content ?? '';
      }
      currentMessages = [...currentMessages, { role: 'assistant', content: fullText }];
      const calls = this.parseToolCalls(fullText, knownTools);
      if (!calls.length) return fullText;
      const results: string[] = [];
      for (const call of calls) {
        if (!knownTools.has(call.name)) {
          results.push(
            `<tool_result name="${call.name}" error="true">\nUnknown tool "${call.name}". Available tools: ${Array.from(knownTools).join(', ')}\n</tool_result>`,
          );
          continue;
        }
        const tc = ToolCallsRepo.create(this.deps.db, runId, stepId, call.name as ToolName, call.arguments, undefined);
        this.emit({ type: 'tool_call.started', runId, toolCall: tc });
        ToolCallsRepo.setStatus(this.deps.db, tc.id, 'running');
        try {
          const exec = await executeTool(
            {
              rootDir,
              agentRunId: runId,
              settings,
              onToolUpdate: (partial) => {
                Object.assign(tc, partial);
              },
              onOutput: (_toolCallId, chunk) => {
                this.emit({
                  type: 'tool_call.output',
                  runId,
                  toolCallId: tc.id,
                  chunk,
                });
              },
              requestApproval: async (toolName, args) => {
                if (!this.deps.requestApproval) return true;
                // Surface the waiting state to the UI while paused.
                ToolCallsRepo.setStatus(this.deps.db, tc.id, 'awaiting_approval');
                const updatedPending = ToolCallsRepo.get(this.deps.db, tc.id)!;
                this.emit({ type: 'tool_call.completed', runId, toolCall: updatedPending });
                const prevState = AgentRunsRepo.get(this.deps.db, runId)?.state ?? 'IMPLEMENTING';
                this.transition(runId, 'WAITING_FOR_USER');
                try {
                  // Race the approval against run cancellation so Cancel
                  // resolves immediately instead of waiting for the timeout.
                  const ok = await new Promise<boolean>((resolve) => {
                    const onAbort = () => resolve(false);
                    signal.addEventListener('abort', onAbort, { once: true });
                    this.deps
                      .requestApproval!(runId, toolName, args)
                      .then(
                        (v) => {
                          signal.removeEventListener('abort', onAbort);
                          resolve(v);
                        },
                        () => {
                          signal.removeEventListener('abort', onAbort);
                          resolve(false);
                        },
                      );
                  });
                  ToolCallsRepo.setApproved(this.deps.db, tc.id, ok);
                  if (!signal.aborted && ok) {
                    ToolCallsRepo.setStatus(this.deps.db, tc.id, 'running');
                    const updatedResumed = ToolCallsRepo.get(this.deps.db, tc.id)!;
                    this.emit({ type: 'tool_call.completed', runId, toolCall: updatedResumed });
                  }
                  return ok;
                } finally {
                  if (!signal.aborted) this.transition(runId, prevState as AgentState);
                }
              },
            },
            { toolName: call.name as ToolName, args: call.arguments },
          );
          ToolCallsRepo.setStatus(this.deps.db, tc.id, 'completed', {
            result: exec.raw,
            duration_ms: Date.now() - new Date(tc.started_at).getTime(),
          });
          const updated = ToolCallsRepo.get(this.deps.db, tc.id)!;
          this.emit({ type: 'tool_call.completed', runId, toolCall: updated });
          results.push(`<tool_result name="${call.name}">\n${exec.raw}\n</tool_result>`);
        } catch (e: any) {
          const message = e?.message ?? String(e);
          const denied = /denied/i.test(message);
          const aborted = signal.aborted || /abort/i.test(message);
          ToolCallsRepo.setStatus(
            this.deps.db,
            tc.id,
            aborted ? 'cancelled' : denied ? 'denied' : 'failed',
            { error: message },
          );
          const updated = ToolCallsRepo.get(this.deps.db, tc.id)!;
          this.emit({ type: 'tool_call.completed', runId, toolCall: updated });
          results.push(`<tool_result name="${call.name}" error="true">\n${message}\n</tool_result>`);
          if (aborted) {
            throw new Error('aborted');
          }
          if (denied) {
            currentMessages = [
              ...currentMessages,
              { role: 'user', content: results.join('\n\n') },
            ];
            return currentMessages[currentMessages.length - 1]?.content ?? '';
          }
        }
      }
      currentMessages = [
        ...currentMessages,
        { role: 'user', content: results.join('\n\n') },
      ];
    }
    return currentMessages[currentMessages.length - 1]?.content ?? '';
  }

  private resolveProvider(role: AgentRole, settings: AppSettings): {
    provider: ReturnType<typeof buildProvider>;
    settings: ProviderSettings;
    model: ModelSettings;
  } | null {
    const db = this.deps.db;
    const model = ModelsRepo.get(db, role);
    if (!model) {
      logger.warn(`No model configured for role ${role}`);
      return null;
    }
    const ps = ProvidersRepo.get(db, model.provider_id);
    if (!ps) {
      logger.warn(`Provider ${model.provider_id} not found for role ${role}`);
      return null;
    }
    if (!ps.enabled) {
      logger.warn(`Provider ${ps.name} is disabled`);
      return null;
    }
    return {
      provider: buildProvider(ps),
      settings: ps,
      model,
    };
  }

  private parseToolCalls(text: string, knownTools?: Set<string>): { name: ToolName; arguments: any }[] {
    const calls: { name: ToolName; arguments: any }[] = [];
    const push = (name: unknown, args: any) => {
      if (typeof name !== 'string' || !name) return;
      if (knownTools && !knownTools.has(name)) return; // ignore hallucinated tools
      if (calls.some((c) => c.name === name && JSON.stringify(c.arguments) === JSON.stringify(args))) return;
      calls.push({ name: name as ToolName, arguments: args ?? {} });
    };
    // OpenAI-compatible tool call style embedded in a JSON object.
    const json = extractJson<any>(text);
    if (json && Array.isArray((json as any).tool_calls)) {
      for (const c of (json as any).tool_calls) {
        const fn = c.function ?? {};
        let args: any = {};
        if (typeof fn.arguments === 'string') {
          try {
            args = JSON.parse(fn.arguments);
          } catch {
            args = {};
          }
        } else if (fn.arguments && typeof fn.arguments === 'object') {
          args = fn.arguments;
        }
        push(fn.name, args);
      }
    }
    // Fallback: ```tool / ```json fenced blocks. Capture the FULL fence body
    // and let extractJson balance braces — the previous lazy \{...\} regex
    // truncated nested objects (e.g. write_file content with braces).
    const fenceRe = /```(?:tool|json)?\s*\n?([\s\S]*?)```/g;
    let m: RegExpExecArray | null;
    while ((m = fenceRe.exec(text)) !== null) {
      const parsed = extractJson<any>(m[1]);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') continue;
      if ('tool_calls' in parsed) continue; // already handled above
      // A direct tool block: { "name": "write_file", "arguments": {...} }
      if (typeof (parsed as any).name === 'string' && knownTools?.has((parsed as any).name)) {
        push((parsed as any).name, (parsed as any).arguments);
      }
    }
    return calls;
  }
}
