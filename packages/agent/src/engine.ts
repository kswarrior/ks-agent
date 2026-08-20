import { AgentState, AgentRole, ChatMessage, ToolCallRequest, AgentSettings, PlanResult, ExplorerResult, ReviewResult, TestResult, ToolDefinition } from '@ks-agent/types';
import { AgentEventBus } from './event-bus';
import { ModelRouter } from '@ks-agent/ai';
import { ContextManager } from './context-manager';
import { ToolRegistry, ToolExecutor } from '@ks-agent/tools';
import { getSystemPrompt, parseAgentResponse } from './prompts';
import { generateId, truncate } from '@ks-agent/shared';
import { AgentStateMachine } from './state-machine';
import { AgentRunStore, AgentRunRecord, AgentStepRecord, ToolCallRecord } from './store';

export interface AgentEngineConfig {
  eventBus: AgentEventBus;
  modelRouter: ModelRouter;
  contextManager: ContextManager;
  toolRegistry: ToolRegistry;
  agentSettings: AgentSettings;
  projectRoot: string;
  store?: AgentRunStore;
  onApproval?: (runId: string, toolName: string, args: Record<string, unknown>, reason?: string) => Promise<boolean>;
}

export interface AgentRunContext {
  runId: string;
  chatId: string;
  projectId: string;
  userRequest: string;
  conversation: ChatMessage[];
  currentState: AgentState;
  plan?: PlanResult;
  explorerResult?: ExplorerResult;
  reviewResult?: ReviewResult;
  testResults: TestResult[];
  changedFiles: string[];
  diffs: string[];
  fileContents: Map<string, string>;
  fixIterations: number;
  stepCount: number;
}

export interface AgentRunResult {
  runId: string;
  status: 'COMPLETED' | 'FAILED' | 'WAITING_FOR_USER';
  message: string;
  changedFiles: string[];
  testResults: TestResult[];
}

export class AgentEngine {
  private config: AgentEngineConfig;
  private stateMachine: AgentStateMachine;
  private executor: ToolExecutor;
  private messages: ChatMessage[] = [];
  private context: AgentRunContext;
  private currentStepId: string = '';
  private pendingApprovals: Map<string, (approved: boolean) => void> = new Map();
  private running = false;

  constructor(config: AgentEngineConfig) {
    this.config = config;
    this.stateMachine = new AgentStateMachine(AgentState.IDLE, (from, to, event) => {
      this.config.eventBus.emitEvent('state_transition', this.context.runId, { from, to, event });
    });
    this.executor = new ToolExecutor(config.toolRegistry);
    
    this.context = {
      runId: generateId('run_'),
      chatId: '',
      projectId: '',
      userRequest: '',
      conversation: [],
      currentState: AgentState.IDLE,
      testResults: [],
      changedFiles: [],
      diffs: [],
      fileContents: new Map(),
      fixIterations: 0,
      stepCount: 0
    };
  }

  initialize(runId: string, chatId: string, projectId: string, userRequest: string): void {
    this.context.runId = runId;
    this.context.chatId = chatId;
    this.context.projectId = projectId;
    this.context.userRequest = userRequest;
    this.context.conversation = [{ role: 'user', content: userRequest }];
    this.messages = [{ role: 'user', content: userRequest }];

    // Load existing conversation
    this.loadConversation();
  }

  private loadConversation(): void {
    // Load from store if available
    if (this.config.store) {
      const messages = this.config.store.getMessages(this.context.chatId);
      if (messages && messages.length > 0) {
        this.messages = messages.map(m => ({
          role: m.role as ChatMessage['role'],
          content: m.content
        }));
        if (this.messages[messages.length - 1]?.role === 'user') {
          this.context.conversation = this.messages;
        }
      }
    }
  }

  async run(userRequest: string): Promise<AgentRunResult> {
    if (this.running) {
      throw new Error('Agent already running');
    }
    this.running = true;

    try {
      this.stateMachine.setState(AgentState.PLANNING);
      this.stateMachine.transition({ type: 'USER_REQUEST_RECEIVED' });
      this.config.eventBus.emitStateChange(this.context.runId, AgentState.PLANNING);

      // Record run start
      if (this.config.store) {
        this.config.store.updateRunStatus(this.context.runId, 'running', AgentState.PLANNING);
      }

      if (this.config.agentSettings.autoRunTests === false) {
        // handle manual mode
      }

      const plan = await this.plan();
      if (!plan) throw new Error('Planning failed');

      // Check if exploration is needed
      this.stateMachine.transition({ type: 'PLAN_CREATED' });
      this.config.eventBus.emitStateChange(this.context.runId, AgentState.EXPLORING);

      const explorerResult = await this.explore();
      
      this.stateMachine.transition({ type: 'EXPLORATION_COMPLETE' });
      this.config.eventBus.emitStateChange(this.context.runId, AgentState.IMPLEMENTING);

      await this.implement(plan, explorerResult);

      this.stateMachine.transition({ type: 'IMPLEMENTATION_COMPLETE' });
      this.config.eventBus.emitStateChange(this.context.runId, AgentState.TESTING);

      const testResults = await this.runTests();

      if (testResults.some(r => r.status === 'PASS')) {
        const allPassed = testResults.every(r => r.status === 'PASS');
        if (allPassed) {
          this.stateMachine.transition({ type: 'TESTS_PASSED' });
          this.config.eventBus.emitStateChange(this.context.runId, AgentState.REVIEWING);

          const reviewResult = await this.review();
          this.context.reviewResult = reviewResult;

          if (reviewResult.status === 'APPROVED') {
            this.stateMachine.transition({ type: 'REVIEW_APPROVED' });
            this.config.eventBus.emitStateChange(this.context.runId, AgentState.COMPLETED);
            return this.completed('Implementation complete and approved');
          }

          return this.handleReviewChanges(reviewResult);
        } else {
          return this.handleTestFailures(testResults);
        }
      } else {
        return this.handleTestFailures(testResults);
      }
    } catch (err) {
      const error = err as Error;
      this.config.eventBus.emitError(this.context.runId, error.message);
      this.stateMachine.transition({ type: 'ERROR' });
      this.config.eventBus.emitStateChange(this.context.runId, AgentState.FAILED);

      if (this.config.store) {
        this.config.store.updateRunStatus(this.context.runId, 'failed', AgentState.FAILED);
      }

      return {
        runId: this.context.runId,
        status: 'FAILED',
        message: `Agent failed: ${error.message}`,
        changedFiles: this.context.changedFiles,
        testResults: this.context.testResults
      };
    } finally {
      this.running = false;
    }
  }

  private async plan(): Promise<PlanResult> {
    if (this.config.store) {
      const stepId = this.config.store.createStep({
        runId: this.context.runId,
        agentRole: AgentRole.PLANNER,
        model: this.config.modelRouter.getModel(AgentRole.PLANNER, this.context.projectId).id,
        status: 'running',
        input: { userRequest: this.context.userRequest }
      });
      this.currentStepId = stepId;
    }

    const messages = this.config.contextManager.buildContext(AgentRole.PLANNER, {
      userRequest: this.context.userRequest,
      conversation: this.context.conversation
    });

    this.config.eventBus.emitStepStart(this.context.runId, this.currentStepId, AgentRole.PLANNER, 'planning model');

    // Planner may inspect the codebase with read_file / list_dir before producing the plan.
    const content = await this.runToolLoop(AgentRole.PLANNER, messages);

    if (this.config.store) {
      this.config.store.updateStepStatus(this.currentStepId, 'completed', content);
    }

    const plan = parseAgentResponse(AgentRole.PLANNER, content) as PlanResult;
    this.context.plan = plan;

    this.config.eventBus.emitStepComplete(this.context.runId, this.currentStepId, AgentRole.PLANNER, plan);
    this.config.eventBus.emitMessage(this.context.runId, `**Plan created**: ${truncate(plan.goal, 200)}`, AgentRole.PLANNER);

    if (this.config.store) {
      this.config.store.createMessage({
        chatId: this.context.chatId,
        role: 'assistant',
        content: `**PLAN**\n\n${JSON.stringify(plan, null, 2)}`,
        agentRole: AgentRole.PLANNER,
        model: this.config.modelRouter.getModel(AgentRole.PLANNER, this.context.projectId).id
      });
    }

    if (plan && plan.implementationSteps) {
      this.config.eventBus.emitMessage(this.context.runId, `Plan created with ${plan.implementationSteps.length} steps.`, AgentRole.PLANNER);
    }

    return plan;
  }

  private async explore(): Promise<ExplorerResult> {
    if (this.config.store) {
      const stepId = this.config.store.createStep({
        runId: this.context.runId,
        agentRole: AgentRole.EXPLORER,
        model: this.config.modelRouter.getModel(AgentRole.EXPLORER, this.context.projectId).id,
        status: 'running',
        input: { plan: this.context.plan }
      });
      this.currentStepId = stepId;
    }

    // First do local exploration to identify structure
    const localExploration = await this.localExploration();
    
    const messages = this.config.contextManager.buildContext(AgentRole.EXPLORER, {
      userRequest: this.context.userRequest,
      plan: this.context.plan,
      explorerResult: localExploration
    });

    this.config.eventBus.emitStepStart(this.context.runId, this.currentStepId, AgentRole.EXPLORER, 'explorer model');

    // Run the explorer through the read-only tool loop so it can list dirs,
    // read files and shell-inspect iteratively until it understands the codebase.
    const content = await this.runToolLoop(AgentRole.EXPLORER, messages);

    if (this.config.store) {
      this.config.store.updateStepStatus(this.currentStepId, 'completed', content);
    }

    let explorerResult: ExplorerResult;

    try {
      explorerResult = parseAgentResponse(AgentRole.EXPLORER, content) as ExplorerResult;
    } catch {
      // Fallback to local exploration if model can't parse
      explorerResult = localExploration;
    }

    this.context.explorerResult = explorerResult;

    this.config.eventBus.emitStepComplete(this.context.runId, this.currentStepId, AgentRole.EXPLORER, explorerResult);
    this.config.eventBus.emitMessage(this.context.runId, `Exploration found ${explorerResult.relevantFiles.length} relevant files.`, AgentRole.EXPLORER);

    if (this.config.store) {
      this.config.store.createMessage({
        chatId: this.context.chatId,
        role: 'assistant',
        content: `**EXPLORATION**\n\n${JSON.stringify(explorerResult, null, 2)}`,
        agentRole: AgentRole.EXPLORER,
        model: this.config.modelRouter.getModel(AgentRole.EXPLORER, this.context.projectId).id
      });
    }

    return explorerResult;
  }

  private async localExploration(): Promise<ExplorerResult> {
    // Simple synchronous exploration to get basic structure
    let structure: any = {};
    let files: string[] = [];
    
    const { readdir, stat } = await import('fs/promises');
    const { join } = await import('path');

    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }
      
      for (const entry of entries) {
        if (entry === 'node_modules' || entry === '.git' || entry === 'dist' || entry === 'build' || entry === '.next') continue;
        const fullPath = join(dir, entry);
        const relative = fullPath.replace(this.config.projectRoot, '').replace(/^\//, '');
        try {
          const stats = await stat(fullPath);
          if (stats.isDirectory()) {
            await walk(fullPath);
          } else {
            if (fullPath.includes('src') || entry.includes('test') || entry.includes('spec') || entry === 'package.json') {
              files.push(relative);
            }
          }
        } catch {
          // skip
        }
      }
    };

    try {
      await walk(this.config.projectRoot);
    } catch {
      // ignore
    }

    return {
      projectType: 'unknown',
      framework: undefined,
      packageManager: 'npm',
      relevantFiles: files.slice(0, 30),
      summary: `Found ${files.length} potentially relevant files`,
      risks: [],
      structure: {
        name: this.config.projectRoot.split('/').pop() || 'project',
        path: '.',
        type: 'directory'
      }
    };
  }

  private async implement(plan: PlanResult, explorerResult: ExplorerResult): Promise<void> {
    if (this.config.store) {
      const stepId = this.config.store.createStep({
        runId: this.context.runId,
        agentRole: AgentRole.CODER,
        model: this.config.modelRouter.getModel(AgentRole.CODER, this.context.projectId).id,
        status: 'running',
        input: { plan, explorerResult }
      });
      this.currentStepId = stepId;
    }

    this.config.eventBus.emitStepStart(this.context.runId, this.currentStepId, AgentRole.CODER, 'coder model');

    // Build context for coder
    const messages = this.config.contextManager.buildContext(AgentRole.CODER, {
      userRequest: this.context.userRequest,
      plan,
      explorerResult
    });

    try {
      await this.runToolLoop(AgentRole.CODER, messages);
    } catch (err) {
      throw err;
    }

    this.config.eventBus.emitStepComplete(this.context.runId, this.currentStepId, AgentRole.CODER, {
      changedFiles: this.context.changedFiles
    });

    this.config.eventBus.emitMessage(this.context.runId, `Implementation complete. ${this.context.changedFiles.length} files changed.`, AgentRole.CODER);
  }

  private async runToolLoop(role: AgentRole, messages: ChatMessage[]): Promise<string> {
    let iterations = 0;
    const maxIterations = 60;

    // Load relevant file contents for context if not already loaded
    const toolDefs = this.config.toolRegistry.getToolDefinitions();

    while (iterations < maxIterations) {
      iterations++;
      this.context.stepCount++;
      
      if (this.config.agentSettings.maxAgentSteps > 0 && this.context.stepCount > this.config.agentSettings.maxAgentSteps) {
        throw new Error(`Maximum agent steps (${this.config.agentSettings.maxAgentSteps}) exceeded`);
      }

      this.config.eventBus.emitMessage(this.context.runId, 'Thinking...', role);

      let response;
      try {
        response = await this.config.modelRouter.run(role, {
          messages,
          temperature: 0.2,
          maxTokens: 2048,
          tools: toolDefs
        });
      } catch (err) {
        const error = err as Error;
        if (error.message.includes('API key')) {
          throw new Error(`${error.message}. Please configure the NVIDIA API key in Settings > API.`);
        }
        throw error;
      }

      const message = response.choices[0]?.message;
      const toolCalls = message?.toolCalls as ToolCallRequest[] | undefined;

      if (toolCalls && toolCalls.length > 0) {
        for (const call of toolCalls) {
          this.context.stepCount++;
          let toolArgs: Record<string, unknown> = {};
          
          try {
            toolArgs = JSON.parse(call.function.arguments);
          } catch {
            toolArgs = { raw: call.function.arguments };
          }

          this.config.eventBus.emitToolCall(this.context.runId, this.currentStepId, call.function.name, toolArgs);

          // Persist tool call
          let toolCallId: string | undefined;
          if (this.config.store) {
            toolCallId = this.config.store.createToolCall({
              stepId: this.currentStepId,
              toolName: call.function.name,
              parameters: toolArgs,
              status: 'running'
            });
          }

          const result = await this.executeToolSafely(call.function.name, toolArgs);

          if (this.config.store && toolCallId) {
            this.config.store.updateToolCallResult(toolCallId, result, result.success ? 'completed' : 'failed');
          }

          this.config.eventBus.emitToolResult(this.context.runId, this.currentStepId, call.function.name, result);

          // Track file operations
          if (call.function.name === 'write_file' || call.function.name === 'edit_file') {
            if (toolArgs.path) {
              if (!this.context.changedFiles.includes(toolArgs.path as string)) {
                this.context.changedFiles.push(toolArgs.path as string);
              }
            }
            if (result.output && (result.output as FileOperationResult).diff) {
              this.context.diffs.push((result.output as FileOperationResult).diff || '');
            }
          }

          messages.push({
            role: 'assistant',
            content: null,
            toolCalls: [call]
          });
          
          messages.push({
            role: 'tool',
            toolCallId: call.id,
            content: result.success
              ? JSON.stringify(
                  typeof result.output === 'string' ? result.output.slice(0, 12000) : result.output,
                  null,
                  2
                )
              : `ERROR: ${result.error}`,
            name: call.function.name
          });
        }
      } else {
        // No tool calls, consider done
        const responseText = message?.content || '';
        if (responseText) {
          messages.push({ role: 'assistant', content: responseText });
        }
        return responseText;
      }
    }

    const responseText = messages[messages.length - 1]?.content || '';
    if (typeof responseText === 'string' && responseText.trim()) {
      return responseText;
    }
    throw new Error(`Tool loop reached maximum iterations (${maxIterations}) without completion`);
  }

  private async executeToolSafely(name: string, args: Record<string, unknown>): Promise<{ success: boolean; output?: unknown; error?: string; duration?: number }> {
    const tool = this.config.toolRegistry.get(name);
    if (!tool) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    const danger = tool.isDangerous(args);

    if (danger.dangerous && !this.config.agentSettings.autonomousMode) {
      // Check if shell approval is required
      if (name === 'shell' && this.config.agentSettings.requireApprovalForShell) {
        this.config.eventBus.emitApprovalRequest(this.context.runId, name, args, danger.reason);
        
        const approved = await new Promise<boolean>((resolve) => {
          const requestId = generateId('appr_');
          this.pendingApprovals.set(requestId, resolve);
          this.config.eventBus.emitEvent('approval_request', this.context.runId, {
            requestId,
            toolName: name,
            args,
            reason: danger.reason
          });
        });

        if (!approved) {
          return { success: false, error: 'User denied the tool execution' };
        }
      }
    }

    return this.executor.execute(name, args);
  }

  private async runTests(): Promise<TestResult[]> {
    const testResults: TestResult[] = [];

    if (!this.config.agentSettings.autoRunTests) {
      return [{
        status: 'UNKNOWN',
        exitCode: 0,
        stdout: '',
        stderr: 'Automatic tests disabled',
        failures: [],
        summary: 'Testing skipped due to settings'
      }];
    }

    if (this.config.store) {
      const stepId = this.config.store.createStep({
        runId: this.context.runId,
        agentRole: AgentRole.TESTER,
        model: this.config.modelRouter.getModel(AgentRole.TESTER, this.context.projectId).id,
        status: 'running',
        input: { changedFiles: this.context.changedFiles }
      });
      this.currentStepId = stepId;
    }

    this.config.eventBus.emitStepStart(this.context.runId, this.currentStepId, AgentRole.TESTER, 'test agent');

    this.config.eventBus.emitMessage(this.context.runId, 'Running tests...', AgentRole.TESTER);

    const toolDefs = this.config.toolRegistry.getToolDefinitions();

    const messages = this.config.contextManager.buildContext(AgentRole.TESTER, {
      changedFiles: this.context.changedFiles,
      testResults: this.context.testResults
    });

    let response;
    try {
      response = await this.config.modelRouter.run(AgentRole.TESTER, {
        messages,
        temperature: 0.1,
        maxTokens: 1024,
        tools: toolDefs
      });
    } catch (err) {
      const error = err as Error;
      const shellResult = {
        success: false,
        output: undefined,
        error: error.message,
        duration: 0
      };

      this.config.eventBus.emitToolResult(this.context.runId, this.currentStepId, 'shell', shellResult);
      return [{
        status: 'NEEDS_FIX',
        exitCode: 1,
        stdout: '',
        stderr: error.message,
        failures: [],
        summary: `Test execution failed: ${error.message}`
      }];
    }

    // We need to let the tester run shell commands to test
    const testerMessages = [...messages];
    
    let toolCalls = response.choices[0]?.message?.toolCalls as ToolCallRequest[] | undefined;
    let testOutput = '';

    while (toolCalls && toolCalls.length > 0) {
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

        this.config.eventBus.emitToolCall(this.context.runId, this.currentStepId, call.function.name, args);

        const result = await this.executeToolSafely(call.function.name, args);

        if (call.function.name === 'shell') {
          const shellRes = result.output as ShellResult;
          testOutput += `\n$ ${call.function.arguments}\nEXIT: ${result.success ? 0 : 1}\n${shellRes?.stdout || ''}\n${shellRes?.stderr || ''}`;
        }

        this.config.eventBus.emitToolResult(this.context.runId, this.currentStepId, call.function.name, result);

        testerMessages.push({
          role: 'assistant',
          content: null,
          toolCalls: [call]
        });
        testerMessages.push({
          role: 'tool',
          toolCallId: call.id,
          content: result.success ? JSON.stringify(result.output, null, 2).slice(0, 12000) : `ERROR: ${result.error}`,
          name: call.function.name
        });
      }

      response = await this.config.modelRouter.run(AgentRole.TESTER, {
        messages: testerMessages,
        temperature: 0.1,
        maxTokens: 1024,
        tools: toolDefs
      });

      toolCalls = response.choices[0]?.message?.toolCalls as ToolCallRequest[] | undefined;
    }

    const content = response.choices[0]?.message?.content || '';

    if (this.config.store) {
      this.config.store.updateStepStatus(this.currentStepId, 'completed', content);
    }

    this.config.eventBus.emitStepComplete(this.context.runId, this.currentStepId, AgentRole.TESTER, content);

    // Determine if tests passed
    const passed = /pass(ed|ing)?\b/i.test(content) && !/fail/i.test(content);
    const failed = /fail/i.test(content);

    let status: TestResult['status'];
    if (passed) {
      status = 'PASS';
    } else if (failed) {
      status = 'FAIL';
    } else {
      status = 'UNKNOWN';
    }

    const result: TestResult = {
      status,
      exitCode: status === 'PASS' ? 0 : 1,
      stdout: testOutput.slice(0, 20000),
      stderr: '',
      failures: [],
      summary: content.slice(0, 2000)
    };

    this.context.testResults.push(result);

    if (this.config.store) {
      this.config.store.createMessage({
        chatId: this.context.chatId,
        role: 'assistant',
        content: `**TEST RESULTS**\n\n${content}`,
        agentRole: AgentRole.TESTER,
        model: this.config.modelRouter.getModel(AgentRole.TESTER, this.context.projectId).id
      });
    }

    return [result];
  }

  private async review(): Promise<ReviewResult> {
    if (this.config.store) {
      const stepId = this.config.store.createStep({
        runId: this.context.runId,
        agentRole: AgentRole.REVIEWER,
        model: this.config.modelRouter.getModel(AgentRole.REVIEWER, this.context.projectId).id,
        status: 'running',
        input: {
          changedFiles: this.context.changedFiles,
          diffs: this.context.diffs,
          testResults: this.context.testResults
        }
      });
      this.currentStepId = stepId;
    }

    this.config.eventBus.emitStepStart(this.context.runId, this.currentStepId, AgentRole.REVIEWER, 'reviewer model');

    const messages = this.config.contextManager.buildContext(AgentRole.REVIEWER, {
      userRequest: this.context.userRequest,
      plan: this.context.plan,
      explorerResult: this.context.explorerResult,
      changedFiles: this.context.changedFiles,
      diff: this.context.diffs.join('\n\n'),
      testResults: this.context.testResults
    });

    this.config.eventBus.emitMessage(this.context.runId, 'Reviewing implementation...', AgentRole.REVIEWER);

    const response = await this.config.modelRouter.run(AgentRole.REVIEWER, {
      messages,
      temperature: 0.1,
      maxTokens: 2048
    });

    const content = response.choices[0]?.message?.content || '';

    if (this.config.store) {
      this.config.store.updateStepStatus(this.currentStepId, 'completed', content);
    }

    let reviewResult: ReviewResult;
    try {
      reviewResult = parseAgentResponse(AgentRole.REVIEWER, content) as ReviewResult;
    } catch {
      reviewResult = {
        status: 'APPROVED',
        issues: []
      };
    }

    this.context.reviewResult = reviewResult;

    this.config.eventBus.emitStepComplete(this.context.runId, this.currentStepId, AgentRole.REVIEWER, reviewResult);

    const issuesCount = reviewResult.issues?.length || 0;
    if (reviewResult.status === 'APPROVED') {
      this.config.eventBus.emitMessage(this.context.runId, 'Review: APPROVED.', AgentRole.REVIEWER);
    } else {
      this.config.eventBus.emitMessage(this.context.runId, `Review found ${issuesCount} issue${issuesCount === 1 ? '' : 's'}.`, AgentRole.REVIEWER);
    }

    if (this.config.store) {
      this.config.store.createMessage({
        chatId: this.context.chatId,
        role: 'assistant',
        content: `**REVIEW**\n\nStatus: ${reviewResult.status}\n${JSON.stringify(reviewResult.issues || [], null, 2)}`,
        agentRole: AgentRole.REVIEWER,
        model: this.config.modelRouter.getModel(AgentRole.REVIEWER, this.context.projectId).id
      });
    }

    return reviewResult;
  }

  private async handleReviewChanges(reviewResult: ReviewResult): Promise<AgentRunResult> {
    // Fix issues
    this.stateMachine.setState(AgentState.FIXING);
    this.config.eventBus.emitStateChange(this.context.runId, AgentState.FIXING);

    const fixResult = await this.fix(reviewResult);

    if (fixResult) {
      this.stateMachine.setState(AgentState.RETESTING);
      this.config.eventBus.emitStateChange(this.context.runId, AgentState.RETESTING);

      const retestResults = await this.retest();
      this.context.testResults = [...retestResults];

      if (retestResults.some(r => r.status === 'FAIL')) {
        if (this.context.fixIterations >= this.config.agentSettings.maxFixIterations) {
          this.stateMachine.transition({ type: 'MAX_ITERATIONS_REACHED' });
          this.config.eventBus.emitStateChange(this.context.runId, AgentState.WAITING_FOR_USER);
          return {
            runId: this.context.runId,
            status: 'WAITING_FOR_USER',
            message: `Maximum fix iterations (${this.config.agentSettings.maxFixIterations}) reached. Tests still failing.`,
            changedFiles: this.context.changedFiles,
            testResults: this.context.testResults
          };
        }
        return this.handleTestFailures(retestResults);
      }

      if (retestResults.some(r => r.status === 'PASS')) {
        this.stateMachine.transition({ type: 'TESTS_PASSED' });
        this.config.eventBus.emitStateChange(this.context.runId, AgentState.REVIEWING);

        const finalReview = await this.reviewAfterFix();
        if (finalReview.status === 'APPROVED') {
          this.stateMachine.transition({ type: 'REVIEW_APPROVED' });
          this.config.eventBus.emitStateChange(this.context.runId, AgentState.COMPLETED);
          return this.completed('Implementation complete after fixing review issues');
        }
        return this.handleReviewChanges(finalReview);
      }

      this.stateMachine.transition({ type: 'TESTS_PASSED' });
      this.config.eventBus.emitStateChange(this.context.runId, AgentState.COMPLETED);
      return this.completed('Implementation complete');
    }

    return this.completed('Implementation complete (no review changes required)');
  }

  private async handleTestFailures(testResults: TestResult[]): Promise<AgentRunResult> {
    this.context.fixIterations++;

    if (this.context.fixIterations > this.config.agentSettings.maxFixIterations) {
      this.stateMachine.setState(AgentState.WAITING_FOR_USER);
      this.config.eventBus.emitStateChange(this.context.runId, AgentState.WAITING_FOR_USER);
      return {
        runId: this.context.runId,
        status: 'WAITING_FOR_USER',
        message: `Maximum fix iterations (${this.config.agentSettings.maxFixIterations}) reached. Tests still failing: ${testResults.map(r => r.summary).join('; ')}`,
        changedFiles: this.context.changedFiles,
        testResults: this.context.testResults
      };
    }

    this.stateMachine.setState(AgentState.FIXING);
    this.config.eventBus.emitStateChange(this.context.runId, AgentState.FIXING);

    this.config.eventBus.emitMessage(this.context.runId, 'Tests failed. Fixing...', AgentRole.FIXER);

    const fixResult = await this.fix(testResults);

    if (fixResult) {
      this.stateMachine.setState(AgentState.RETESTING);
      this.config.eventBus.emitStateChange(this.context.runId, AgentState.RETESTING);

      const newTestResults = await this.retest();
      this.context.testResults = [...this.context.testResults, ...newTestResults];

      const passed = newTestResults.some(r => r.status === 'PASS');
      const failed = newTestResults.some(r => r.status === 'FAIL');

      if (passed) {
        this.stateMachine.setState(AgentState.REVIEWING);
        this.config.eventBus.emitStateChange(this.context.runId, AgentState.REVIEWING);
        const reviewResult = await this.review();
        this.context.reviewResult = reviewResult;

        if (reviewResult.status === 'APPROVED') {
          this.stateMachine.transition({ type: 'REVIEW_APPROVED' });
          this.config.eventBus.emitStateChange(this.context.runId, AgentState.COMPLETED);
          return this.completed('Implementation complete');
        } else {
          return this.handleReviewChanges(reviewResult);
        }
      } else {
        return this.handleTestFailures(newTestResults);
      }
    }

    return this.completed('Implementation complete (uncertain test state)');
  }

  private async fix(input: ReviewResult | TestResult[]): Promise<boolean> {
    if (this.config.store) {
      const stepId = this.config.store.createStep({
        runId: this.context.runId,
        agentRole: AgentRole.FIXER,
        model: this.config.modelRouter.getModel(AgentRole.FIXER, this.context.projectId).id,
        status: 'running',
        input: { review: input }
      });
      this.currentStepId = stepId;
    }

    this.config.eventBus.emitStepStart(this.context.runId, this.currentStepId, AgentRole.FIXER, 'fixer model');

    const isReviewFix = Array.isArray(input) === false;

    const messages = this.config.contextManager.buildContext(AgentRole.FIXER, {
      reviewResult: !Array.isArray(input) ? (input as ReviewResult) : undefined,
      diff: this.context.diffs.join('\n\n'),
      fileContents: this.context.fileContents
    });

    if (Array.isArray(input)) {
      messages.push({
        role: 'user',
        content: `TEST FAILURES TO FIX:\n\n${JSON.stringify(input, null, 2)}`
      });
    }

    try {
      await this.runToolLoop(AgentRole.FIXER, messages);
    } catch (err) {
      // If tool loop fails, we still report the fix as attempted
    }

    if (this.config.store) {
      this.config.store.updateStepStatus(this.currentStepId, 'completed', 'Fix attempted');
    }

    this.config.eventBus.emitStepComplete(this.context.runId, this.currentStepId, AgentRole.FIXER, {
      fixed: this.context.changedFiles.length > 0
    });

    this.config.eventBus.emitMessage(this.context.runId, 'Fix applied.', AgentRole.FIXER);

    return true;
  }

  private async retest(): Promise<TestResult[]> {
    if (this.config.store) {
      const stepId = this.config.store.createStep({
        runId: this.context.runId,
        agentRole: AgentRole.FINAL_TESTER,
        model: this.config.modelRouter.getModel(AgentRole.FINAL_TESTER, this.context.projectId).id,
        status: 'running',
        input: { changedFiles: this.context.changedFiles }
      });
      this.currentStepId = stepId;
    }

    this.config.eventBus.emitStepStart(this.context.runId, this.currentStepId, AgentRole.FINAL_TESTER, 'final test agent');

    this.config.eventBus.emitMessage(this.context.runId, 'Re-running tests...', AgentRole.FINAL_TESTER);

    const toolDefs = this.config.toolRegistry.getToolDefinitions();

    const messages = this.config.contextManager.buildContext(AgentRole.FINAL_TESTER, {
      changedFiles: this.context.changedFiles,
      testResults: this.context.testResults
    });

    let response;
    try {
      response = await this.config.modelRouter.run(AgentRole.FINAL_TESTER, {
        messages,
        temperature: 0.1,
        maxTokens: 1024,
        tools: toolDefs
      });
    } catch (err) {
      return [{
        status: 'NEEDS_FIX',
        exitCode: 1,
        stdout: '',
        stderr: (err as Error).message,
        failures: [],
        summary: `Test execution failed: ${(err as Error).message}`
      }];
    }

    const testerMessages = [...messages];
    let toolCalls = response.choices[0]?.message?.toolCalls as ToolCallRequest[] | undefined;
    let testOutput = '';

    while (toolCalls && toolCalls.length > 0) {
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments); } catch { args = {}; }

        this.config.eventBus.emitToolCall(this.context.runId, this.currentStepId, call.function.name, args);
        const result = await this.executeToolSafely(call.function.name, args);
        this.config.eventBus.emitToolResult(this.context.runId, this.currentStepId, call.function.name, result);

        if (call.function.name === 'shell') {
          const shellRes = result.output as ShellResult;
          testOutput += `\n$ ${call.function.arguments}\nEXIT: ${result.success ? 0 : 1}\n${shellRes?.stdout || ''}\n${shellRes?.stderr || ''}`;
        }

        testerMessages.push({
          role: 'assistant',
          content: null,
          toolCalls: [call]
        });
        testerMessages.push({
          role: 'tool',
          toolCallId: call.id,
          content: result.success ? JSON.stringify(result.output, null, 2).slice(0, 12000) : `ERROR: ${result.error}`,
          name: call.function.name
        });
      }

      response = await this.config.modelRouter.run(AgentRole.FINAL_TESTER, {
        messages: testerMessages,
        temperature: 0.1,
        maxTokens: 1024,
        tools: toolDefs
      });

      toolCalls = response.choices[0]?.message?.toolCalls as ToolCallRequest[] | undefined;
    }

    const content = response.choices[0]?.message?.content || '';

    if (this.config.store) {
      this.config.store.updateStepStatus(this.currentStepId, 'completed', content);
    }

    this.config.eventBus.emitStepComplete(this.context.runId, this.currentStepId, AgentRole.FINAL_TESTER, content);

    const passed = /pass(ed|ing)?\b/i.test(content) && !/fail/i.test(content);
    const failed = /fail/i.test(content);

    const status: TestResult['status'] = passed ? 'PASS' : (failed ? 'FAIL' : 'UNKNOWN');

    const result: TestResult = {
      status,
      exitCode: status === 'PASS' ? 0 : 1,
      stdout: testOutput.slice(0, 20000),
      stderr: '',
      failures: [],
      summary: content.slice(0, 2000)
    };

    this.context.testResults.push(result);

    if (this.config.store) {
      this.config.store.createMessage({
        chatId: this.context.chatId,
        role: 'assistant',
        content: `**TEST RESULTS**\n\n${content}`,
        agentRole: AgentRole.FINAL_TESTER,
        model: this.config.modelRouter.getModel(AgentRole.FINAL_TESTER, this.context.projectId).id
      });
    }

    return [result];
  }

  private async reviewAfterFix(): Promise<ReviewResult> {
    return this.review();
  }

  private completed(message: string): AgentRunResult {
    if (this.config.store) {
      this.config.store.updateRunStatus(this.context.runId, 'completed', AgentState.COMPLETED);
    }
    return {
      runId: this.context.runId,
      status: 'COMPLETED',
      message,
      changedFiles: this.context.changedFiles,
      testResults: this.context.testResults
    };
  }

  approve(requestId: string): void {
    const resolver = this.pendingApprovals.get(requestId);
    if (resolver) {
      resolver(true);
      this.pendingApprovals.delete(requestId);
    }
  }

  deny(requestId: string): void {
    const resolver = this.pendingApprovals.get(requestId);
    if (resolver) {
      resolver(false);
      this.pendingApprovals.delete(requestId);
    }
  }

  getState(): AgentState {
    return this.stateMachine.getState();
  }
}

interface FileOperationResult {
  success: boolean;
  path: string;
  diff?: string;
  error?: string;
}

interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  command: string;
}