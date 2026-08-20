import { DatabaseService } from '@ks-agent/database';
import { ModelRegistry, ModelRouter, BUILTIN_MODELS } from '@ks-agent/ai';
import { AgentEventBus, AgentEngine, ContextManager, SqliteAgentRunStore } from '@ks-agent/agent';
import { createToolsRegistry, ToolRegistry } from '@ks-agent/tools';
import { AgentSettings, AgentRole, ModelSettings } from '@ks-agent/types';
import config, { getDatabasePath } from '../config';

export interface AppContextOptions {
  db?: DatabaseService;
  projectRoot?: string;
  onApproval?: (runId: string, toolName: string, args: Record<string, unknown>, reason?: string) => Promise<boolean>;
}

export class AppContext {
  db: DatabaseService;
  eventBus: AgentEventBus;
  modelRegistry: ModelRegistry;
  modelRouter: ModelRouter;
  toolRegistry: ToolRegistry;
  private store: SqliteAgentRunStore;
  private agentSettings: AgentSettings;
  private modelSettings: ModelSettings;
  private apiKey: string | null;
  private onApproval?: (runId: string, toolName: string, args: Record<string, unknown>, reason?: string) => Promise<boolean>;

  constructor(options: AppContextOptions = {}) {
    this.db = options.db || new DatabaseService({ path: getDatabasePath() });
    this.eventBus = new AgentEventBus();
    this.modelRegistry = new ModelRegistry();
    this.modelRegistry.registerModels(BUILTIN_MODELS);
    
    this.apiKey = config.nvidiaApiKey;
    this.modelRouter = new ModelRouter(this.modelRegistry, () => this.apiKey);
    
    this.store = new SqliteAgentRunStore(this.db);
    
    this.agentSettings = this.loadAgentSettings();
    this.modelSettings = this.loadModelSettings();
    this.onApproval = options.onApproval;
    
    this.toolRegistry = new ToolRegistry();
  }

  getAgentSettings(): AgentSettings {
    return { ...this.agentSettings };
  }

  updateAgentSettings(settings: Partial<AgentSettings>): AgentSettings {
    this.agentSettings = { ...this.agentSettings, ...settings };
    
    const mappings: Record<string, keyof AgentSettings> = {
      'autonomousMode': 'autonomousMode',
      'maxFixIterations': 'maxFixIterations',
      'requireApprovalForShell': 'requireApprovalForShell',
      'autoRunTests': 'autoRunTests',
      'reviewBeforeCompletion': 'reviewBeforeCompletion',
      'maxAgentSteps': 'maxAgentSteps'
    };

    for (const key of Object.keys(settings) as Array<keyof AgentSettings>) {
      this.db.setAppSetting(key, String(settings[key]));
    }

    return { ...this.agentSettings };
  }

  getModelSettings(): ModelSettings {
    return { ...this.modelSettings };
  }

  updateModelSettings(settings: Partial<ModelSettings>): ModelSettings {
    this.modelSettings = { ...this.modelSettings, ...settings };
    
    for (const role of Object.values(AgentRole)) {
      const roleSettings = settings[role as keyof ModelSettings];
      if (roleSettings) {
        this.db.setModelSetting({
          role,
          modelId: roleSettings,
          projectId: undefined
        });
      }
    }

    return { ...this.modelSettings };
  }

  setApiKey(key: string): void {
    this.apiKey = key;
    // Store a masked version? We never store the full key in DB to be safe.
    this.db.setAppSetting('nvidia_api_key_configured', key ? 'true' : 'false');
  }

  getApiKey(): string | null {
    return this.apiKey;
  }

  testConnection(): Promise<{ ok: boolean; message: string }> {
    if (!this.apiKey) {
      return Promise.resolve({ ok: false, message: 'NVIDIA_API_KEY not configured' });
    }
    return this.modelRouter.testConnection();
  }

  createAgentEngine(projectRoot: string, chatId: string, projectId: string): { engine: AgentEngine; runId: string } {
    const engine = new AgentEngine({
      eventBus: this.eventBus,
      modelRouter: this.modelRouter,
      contextManager: new ContextManager(),
      toolRegistry: this.toolRegistry,
      agentSettings: this.agentSettings,
      projectRoot,
      store: this.store,
      onApproval: this.onApproval
    });

    if (this.modelSettings && Object.keys(this.modelSettings).length > 0) {
      // Store model settings are read in the router
    }

    return { engine, runId: '' };
  }

  getStore(): SqliteAgentRunStore {
    return this.store;
  }

  private loadAgentSettings(): AgentSettings {
    return {
      autonomousMode: this.db.getAppSetting('autonomousMode') === 'true',
      maxFixIterations: parseInt(this.db.getAppSetting('maxFixIterations') || '5', 10),
      requireApprovalForShell: this.db.getAppSetting('requireApprovalForShell') !== 'false',
      autoRunTests: this.db.getAppSetting('autoRunTests') !== 'false',
      reviewBeforeCompletion: this.db.getAppSetting('reviewBeforeCompletion') !== 'false',
      maxAgentSteps: parseInt(this.db.getAppSetting('maxAgentSteps') || '100', 10)
    };
  }

  private loadModelSettings(): ModelSettings {
    const defaults: ModelSettings = {
      [AgentRole.PLANNER]: 'nemotron-3-ultra',
      [AgentRole.EXPLORER]: 'nemotron-3.5-lightning-30b',
      [AgentRole.CODER]: 'step-3-7-flash',
      [AgentRole.TESTER]: 'nemotron-3.5-lightning-30b',
      [AgentRole.REVIEWER]: 'nemotron-3-ultra',
      [AgentRole.FIXER]: 'step-3-7-flash',
      [AgentRole.FINAL_TESTER]: 'nemotron-3.5-lightning-30b'
    };

    try {
      const stored = this.db.getModelSettings();
      for (const setting of stored as Array<{ role: string; model_id: string }>) {
        if (setting.role in defaults) {
          (defaults as unknown as Record<string, string>)[setting.role] = setting.model_id;
        }
      }
    } catch {
      // ignore
    }

    return defaults;
  }
}