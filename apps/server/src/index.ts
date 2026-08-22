import 'dotenv/config';
import * as path from 'path';
import * as fs from 'fs';
import express from 'express';
import cors from 'cors';
import { openDatabase } from '@ks-agent/database';
import { logger, randomId } from '@ks-agent/shared';
import {
  AgentRunsRepo,
  AgentStepsRepo,
  AppSettingsRepo,
  ChatsRepo,
  MessagesRepo,
  ModelsRepo,
  ProjectsRepo,
  ProvidersRepo,
  ToolCallsRepo,
  defaultAppSettings,
  loadAppSettings,
  saveAppSettings,
} from '@ks-agent/database';
import { EventBus } from '@ks-agent/agent';
import { AgentWorkflow } from '@ks-agent/agent';
import { registerRoutes } from './routes';
import { ProviderSettings, ToolApprovalRequest } from '@ks-agent/types';

// Ensure NVIDIA default provider exists
function ensureDefaultProviders(db: any) {
  const list = ProvidersRepo.list(db);
  const hasNvidia = list.some((p) => p.type === 'nvidia');
  const ts = new Date().toISOString();
  if (!hasNvidia) {
    ProvidersRepo.upsert(db, {
      id: 'prov_nvidia_default',
      name: 'NVIDIA',
      type: 'nvidia',
      base_url: 'https://integrate.api.nvidia.com/v1',
      api_key: process.env.NVIDIA_API_KEY ?? '',
      model_id: 'nvidia/llama-3.1-nemotron-70b-instruct',
      model_name: 'Nemotron',
      chat_endpoint: '',
      streaming: true,
      auth_header: 'Authorization',
      custom_headers: '',
      temperature: 0.2,
      max_tokens: 4096,
      context_limit: 32000,
      timeout: 120,
      builtin: true,
      enabled: true,
    } as ProviderSettings);
  }
  const hasOpenAI = list.some((p) => p.type === 'openai-compatible');
  if (!hasNvidia && !hasOpenAI) {
    ProvidersRepo.upsert(db, {
      id: 'prov_openai_default',
      name: 'OpenAI Compatible',
      type: 'openai-compatible',
      base_url: 'https://api.openai.com/v1',
      api_key: '',
      model_id: 'gpt-4o-mini',
      model_name: 'GPT-4o mini',
      chat_endpoint: '',
      streaming: true,
      auth_header: 'Authorization',
      custom_headers: '',
      temperature: 0.2,
      max_tokens: 4096,
      context_limit: 32000,
      timeout: 120,
      builtin: true,
      enabled: true,
    } as ProviderSettings);
  }
}

function ensureDefaultModels(db: any) {
  const list = ModelsRepo.list(db);
  const roles = ['planner', 'explorer', 'coder', 'tester', 'reviewer', 'fixer', 'finalTester'];
  const defaults: Record<string, { provider: string; model: string }> = {
    planner: { provider: 'prov_nvidia_default', model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
    explorer: { provider: 'prov_nvidia_default', model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
    coder: { provider: 'prov_nvidia_default', model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
    tester: { provider: 'prov_nvidia_default', model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
    reviewer: { provider: 'prov_nvidia_default', model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
    fixer: { provider: 'prov_nvidia_default', model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
    finalTester: { provider: 'prov_nvidia_default', model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
  };
  const ts = new Date().toISOString();
  for (const role of roles) {
    if (!list.find((m: any) => m.role === role)) {
      ModelsRepo.upsert(db, {
        role: role as any,
        provider_id: defaults[role].provider,
        model_id: defaults[role].model,
        temperature: 0.2,
        max_tokens: 4096,
        updated_at: ts,
      });
    }
  }
}

function ensureAppSettings(db: any) {
  if (!AppSettingsRepo.get(db, 'app_settings')) {
    saveAppSettings(db, defaultAppSettings());
  }
}

async function main() {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? '0.0.0.0';
  const dbPath = process.env.DATABASE_PATH ?? path.resolve(process.cwd(), 'data/ks-agent.db');

  const db = openDatabase({ path: dbPath });
  ensureAppSettings(db);
  ensureDefaultProviders(db);
  ensureDefaultModels(db);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  // Static web UI
  const webDist = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
  }
  const webPublic = path.resolve(__dirname, '../../web/public');
  if (fs.existsSync(webPublic)) {
    app.use(express.static(webPublic));
  }

  const eventBus = new EventBus();
  const approvalWaiters = new Map<string, { resolve: (v: boolean) => void; req: ToolApprovalRequest }>();

  const workflow = new AgentWorkflow({
    db,
    eventBus,
    requestApproval: async (runId, toolName, args) => {
      const id = randomId('apr');
      const req: ToolApprovalRequest = {
        id,
        tool_call_id: id,
        agent_run_id: runId,
        tool_name: toolName,
        arguments: args,
        created_at: new Date().toISOString(),
      };
      eventBus.emit({ type: 'approval.required', approval: req });
      return new Promise<boolean>((resolve) => {
        approvalWaiters.set(id, { resolve, req });
        setTimeout(() => {
          if (approvalWaiters.has(id)) {
            approvalWaiters.delete(id);
            resolve(false);
          }
        }, 1000 * 60 * 5);
      });
    },
  });

  registerRoutes(app, { db, workflow, eventBus, approvalWaiters });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const indexPath = path.join(webDist, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res
        .status(200)
        .send(
          `<html><body style="font-family:system-ui;background:#000;color:#fff;padding:24px"><h1>KS AGENT API</h1><p>The web UI has not been built yet. Run <code>npm --workspace apps/web run build</code> or use <code>/api</code> endpoints.</p></body></html>`,
        );
    }
  });

  app.listen(port, host, () => {
    logger.info(`KS AGENT server listening at http://${host}:${port}`, undefined, 'server');
  });
}

main().catch((e) => {
  console.error('Fatal startup error', e);
  process.exit(1);
});
