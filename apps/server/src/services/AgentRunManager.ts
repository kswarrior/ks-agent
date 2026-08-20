import { AppContext } from './AppContext';
import { AgentEngine, ContextManager } from '@ks-agent/agent';
import { createToolsRegistry } from '@ks-agent/tools';
import { AgentState } from '@ks-agent/types';
import { generateId } from '@ks-agent/shared';

export interface AgentRunOutcome {
  runId: string;
  status: 'COMPLETED' | 'FAILED' | 'WAITING_FOR_USER';
  message: string;
  changedFiles: string[];
  testResults: unknown[];
}

interface ManagedRun {
  engine: AgentEngine;
  status: 'running' | 'completed' | 'failed' | 'waiting';
  pendingApprovals: Map<string, (approved: boolean) => void>;
}

export class AgentRunManager {
  private appContext: AppContext;
  private runs: Map<string, ManagedRun> = new Map();

  constructor(appContext: AppContext) {
    this.appContext = appContext;
  }

  startRun(runId: string, chatId: string, projectId: string, projectRoot: string, userRequest: string): void {
    const toolRegistry = createToolsRegistry({ projectRoot });
    this.appContext.toolRegistry = toolRegistry;

    const engine = new AgentEngine({
      eventBus: this.appContext.eventBus,
      modelRouter: this.appContext.modelRouter,
      contextManager: new ContextManager(),
      toolRegistry,
      agentSettings: this.appContext.getAgentSettings(),
      projectRoot,
      store: this.appContext.getStore() as any,
      onApproval: async (rid, toolName, args, reason) => {
        return new Promise<boolean>((resolve) => {
          const approvalId = generateId('appr_');
          this.runs.get(runId)?.pendingApprovals.set(approvalId, resolve);
          this.appContext.eventBus.emitEvent('approval_request', runId, {
            requestId: approvalId,
            toolName,
            args,
            reason
          });
          this.appContext.db.updateAgentRun(runId, {
            status: 'waiting_approval',
            currentState: AgentState.WAITING_FOR_USER
          });
        });
      }
    });

    engine.initialize(runId, chatId, projectId, userRequest);

    this.runs.set(runId, {
      engine,
      status: 'running',
      pendingApprovals: new Map()
    });

    engine.run(userRequest).then((result) => {
      const run = this.runs.get(runId);
      if (run) {
        if (result.status === 'COMPLETED') {
          run.status = 'completed';
        } else if (result.status === 'FAILED') {
          run.status = 'failed';
        } else {
          run.status = 'waiting';
        }
      }
      this.appContext.eventBus.emitEvent('run_complete', runId, result);
    }).catch((err) => {
      const run = this.runs.get(runId);
      if (run) run.status = 'failed';
      this.appContext.db.updateAgentRun(runId, {
        status: 'failed',
        currentState: AgentState.FAILED
      });
      this.appContext.eventBus.emitEvent('run_error', runId, { message: (err as Error).message });
    });
  }

  getRun(runId: string): ManagedRun | undefined {
    return this.runs.get(runId);
  }

  approve(runId: string, requestId: string): void {
    const run = this.runs.get(runId);
    if (run) {
      this.appContext.db.updateAgentRun(runId, {
        status: 'running',
        currentState: AgentState.EXPLORING
      });
      const resolver = run.pendingApprovals.get(requestId);
      if (resolver) {
        resolver(true);
        run.pendingApprovals.delete(requestId);
      }
    }
  }

  deny(runId: string, requestId: string): void {
    const run = this.runs.get(runId);
    if (run) {
      this.appContext.db.updateAgentRun(runId, {
        status: 'running',
        currentState: AgentState.EXPLORING
      });
      const resolver = run.pendingApprovals.get(requestId);
      if (resolver) {
        resolver(false);
        run.pendingApprovals.delete(requestId);
      }
    }
  }
}