import { AppContext } from './AppContext';
import { AgentEngine, ContextManager } from '@ks-agent/agent';
import { createToolsRegistry } from '@ks-agent/tools';
import { AgentState } from '@ks-agent/types';
import { generateId } from '@ks-agent/shared';
import { AgentRunManager } from './AgentRunManager';

export class AgentRunService {
  private appContext: AppContext;
  private runManager: AgentRunManager;

  constructor(appContext: AppContext) {
    this.appContext = appContext;
    this.runManager = new AgentRunManager(appContext);
  }

  async startRun(chatId: string, projectId: string, userRequest: string): Promise<{ runId: string }> {
    const project = this.appContext.db.getProject(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const projectRoot = (project as any).root_directory as string;
    const runId = generateId('run_');

    // Create chat if it doesn't exist
    const chat = this.appContext.db.getChat(chatId);
    if (!chat) {
      this.appContext.db.createChat(projectId, userRequest.slice(0, 60));
    }

    // Save user message
    this.appContext.db.addMessage({
      chatId,
      role: 'user',
      content: userRequest
    });

    // Create agent run record
    this.appContext.db.createAgentRun({
      id: runId,
      chatId,
      projectId,
      status: 'running',
      currentState: AgentState.PLANNING,
      input: userRequest
    });

    // Start the run asynchronously
    this.runManager.startRun(runId, chatId, projectId, projectRoot, userRequest);

    return { runId };
  }

  getRunStatus(runId: string) {
    return this.appContext.db.getAgentRun(runId);
  }

  getRunState(runId: string) {
    const run = this.runManager.getRun(runId);
    return {
      state: run?.engine?.getState?.() || AgentState.IDLE,
      running: run?.status === 'running' || false
    };
  }

  approve(runId: string, requestId: string): void {
    this.runManager.approve(runId, requestId);
  }

  deny(runId: string, requestId: string): void {
    this.runManager.deny(runId, requestId);
  }

  getRunsForChat(chatId: string) {
    return this.appContext.db.getAgentRunsByChat(chatId);
  }
}