import express, { Request, Response } from 'express';
import { DB } from '@ks-agent/database';
import { EventBus, AgentWorkflow } from '@ks-agent/agent';
import {
  AgentRunsRepo,
  AgentStepsRepo,
  ChatsRepo,
  MessagesRepo,
  ModelsRepo,
  ProjectsRepo,
  ProvidersRepo,
  ToolCallsRepo,
  loadAppSettings,
  saveAppSettings,
} from '@ks-agent/database';
import { ToolApprovalRequest } from '@ks-agent/types';
import { logger, randomId } from '@ks-agent/shared';
import { ServerEvent } from '@ks-agent/types';

interface ApprovalWaiter {
  resolve: (v: boolean) => void;
  req: ToolApprovalRequest;
}

interface Deps {
  db: DB;
  workflow: AgentWorkflow;
  eventBus: EventBus;
  approvalWaiters: Map<string, ApprovalWaiter>;
}

const MASKED_KEY = '********';

/** Mask an API key before it leaves the backend. */
function maskProvider<T extends { api_key?: string | null }>(p: T): T {
  return { ...p, api_key: p.api_key ? MASKED_KEY : '' };
}

/**
 * Resolve the API key for an upsert. The frontend only ever sees masked keys,
 * so a masked value means "keep the existing key". Empty string clears it.
 */
function resolveApiKey(incoming: unknown, existing?: { api_key?: string | null }): string | undefined {
  if (typeof incoming !== 'string') return existing?.api_key ?? '';
  if (incoming === MASKED_KEY) return existing?.api_key ?? '';
  return incoming;
}

/** Wrap route handlers so rejections reach the error middleware. */
function asyncHandler(
  fn: (req: Request, res: Response) => any,
): (req: Request, res: Response, next: express.NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

export function registerRoutes(app: express.Express, deps: Deps) {
  const { db, workflow, eventBus, approvalWaiters } = deps;

  // === SSE event stream ===
  app.get('/api/events', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();
    const off = eventBus.on((evt: ServerEvent) => {
      try {
        res.write(`data: ${JSON.stringify(evt)}\n\n`);
      } catch (_e) {
        // ignore
      }
    });
    const ping = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch (_e) {}
    }, 15000);
    req.on('close', () => {
      off();
      clearInterval(ping);
    });
  });

  // === Health ===
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // === Projects ===
  app.get('/api/projects', (_req, res) => {
    res.json(ProjectsRepo.list(db));
  });
  app.post('/api/projects', asyncHandler((req, res) => {
    const { name, root_directory } = req.body ?? {};
    if (!isNonEmptyString(name) || !isNonEmptyString(root_directory)) {
      return res.status(400).json({ error: 'name and root_directory required' });
    }
    const p = ProjectsRepo.create(db, name.trim(), root_directory.trim());
    res.json(p);
  }));
  app.put('/api/projects/:id', asyncHandler((req, res) => {
    const existing = ProjectsRepo.get(db, req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const { name, root_directory, settings } = req.body ?? {};
    ProjectsRepo.update(db, req.params.id, {
      name: isNonEmptyString(name) ? name.trim() : undefined,
      root_directory: isNonEmptyString(root_directory) ? root_directory.trim() : undefined,
      settings: settings ?? undefined,
    });
    res.json(ProjectsRepo.get(db, req.params.id));
  }));
  app.delete('/api/projects/:id', (req, res) => {
    ProjectsRepo.delete(db, req.params.id);
    res.json({ ok: true });
  });

  // === Chats ===
  app.get('/api/projects/:projectId/chats', (req, res) => {
    res.json(ChatsRepo.listByProject(db, req.params.projectId));
  });
  app.post('/api/projects/:projectId/chats', asyncHandler((req, res) => {
    const project = ProjectsRepo.get(db, req.params.projectId);
    if (!project) return res.status(404).json({ error: 'project not found' });
    const title = isNonEmptyString(req.body?.title) ? req.body.title.trim() : 'New chat';
    const chat = ChatsRepo.create(db, req.params.projectId, title);
    res.json(chat);
  }));
  app.put('/api/chats/:id', asyncHandler((req, res) => {
    const existing = ChatsRepo.get(db, req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    if (isNonEmptyString(req.body?.title)) ChatsRepo.rename(db, req.params.id, req.body.title.trim());
    res.json(ChatsRepo.get(db, req.params.id));
  }));
  app.delete('/api/chats/:id', (req, res) => {
    ChatsRepo.delete(db, req.params.id);
    res.json({ ok: true });
  });

  // === Messages ===
  app.get('/api/chats/:chatId/messages', (req, res) => {
    res.json(MessagesRepo.listByChat(db, req.params.chatId));
  });

  // === Runs ===
  app.get('/api/chats/:chatId/runs', (req, res) => {
    res.json(AgentRunsRepo.listByChat(db, req.params.chatId));
  });
  app.post('/api/chats/:chatId/runs', asyncHandler(async (req, res) => {
    const prompt = String(req.body?.prompt ?? '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const chat = ChatsRepo.get(db, req.params.chatId);
    if (!chat) return res.status(404).json({ error: 'chat not found' });
    const runId = await workflow.startRun(req.params.chatId, prompt);
    res.json({ runId });
  }));
  app.post('/api/runs/:runId/cancel', asyncHandler((req, res) => {
    const run = AgentRunsRepo.get(db, req.params.runId);
    if (!run) return res.status(404).json({ error: 'not found' });
    workflow.cancel(req.params.runId);
    res.json({ ok: true });
  }));
  app.post('/api/runs/:runId/resume', asyncHandler(async (req, res) => {
    await workflow.resume(req.params.runId);
    res.json({ ok: true });
  }));
  app.get('/api/runs/:runId', (req, res) => {
    const run = AgentRunsRepo.get(db, req.params.runId);
    if (!run) return res.status(404).json({ error: 'not found' });
    res.json(run);
  });
  app.get('/api/runs/:runId/steps', (req, res) => {
    res.json(AgentStepsRepo.listByRun(db, req.params.runId));
  });
  app.get('/api/runs/:runId/tool_calls', (req, res) => {
    res.json(ToolCallsRepo.listByRun(db, req.params.runId));
  });

  // === Approvals ===
  app.get('/api/approvals', (_req, res) => {
    // Drop waiters whose run is no longer active so stale dialogs disappear.
    for (const [id, w] of Array.from(approvalWaiters.entries())) {
      if (!workflow.isRunning(w.req.agent_run_id)) {
        approvalWaiters.delete(id);
        w.resolve(false);
      }
    }
    res.json(Array.from(approvalWaiters.values()).map((w) => w.req));
  });
  app.post('/api/approvals/:id/decision', (req, res) => {
    const approved = !!req.body?.approved;
    const w = approvalWaiters.get(req.params.id);
    if (!w) return res.status(404).json({ error: 'no pending approval' });
    approvalWaiters.delete(req.params.id);
    w.resolve(approved);
    res.json({ ok: true });
  });

  // === Providers ===
  // API keys never leave the backend in plain text: list/save responses are
  // always masked, and a masked value sent back means "keep existing key".
  app.get('/api/providers', (_req, res) => {
    res.json(ProvidersRepo.list(db).map(maskProvider));
  });
  app.post('/api/providers', asyncHandler((req, res) => {
    const p = req.body ?? {};
    if (!isNonEmptyString(p.name) || !isNonEmptyString(p.base_url) || !isNonEmptyString(p.model_id)) {
      return res.status(400).json({ error: 'name, base_url and model_id are required' });
    }
    if (p.id && !ProvidersRepo.get(db, p.id)) {
      return res.status(404).json({ error: 'provider not found' });
    }
    const existing = p.id ? ProvidersRepo.get(db, p.id) : undefined;
    const saved = ProvidersRepo.upsert(db, {
      id: p.id,
      name: String(p.name).trim(),
      type: p.type ?? 'openai-compatible',
      base_url: String(p.base_url).trim(),
      api_key: resolveApiKey(p.api_key, existing),
      model_id: String(p.model_id).trim(),
      model_name: String(p.model_name ?? p.model_id ?? 'Model').trim(),
      chat_endpoint: p.chat_endpoint ?? '',
      streaming: p.streaming !== false,
      auth_header: p.auth_header ?? 'Authorization',
      custom_headers: p.custom_headers ?? '',
      temperature: Number(p.temperature ?? 0.2),
      max_tokens: Number(p.max_tokens ?? 4096),
      context_limit: Number(p.context_limit ?? 32000),
      timeout: Number(p.timeout ?? 120),
      builtin: existing?.builtin === true,
      enabled: p.enabled !== false,
    });
    res.json(maskProvider(saved));
  }));
  app.put('/api/providers/:id', asyncHandler((req, res) => {
    const existing = ProvidersRepo.get(db, req.params.id);
    if (!existing) return res.status(404).json({ error: 'not found' });
    const p = req.body ?? {};
    const saved = ProvidersRepo.upsert(db, {
      id: req.params.id,
      name: isNonEmptyString(p.name) ? String(p.name).trim() : existing.name,
      type: p.type ?? existing.type,
      base_url: isNonEmptyString(p.base_url) ? String(p.base_url).trim() : existing.base_url,
      api_key: resolveApiKey(p.api_key, existing),
      model_id: isNonEmptyString(p.model_id) ? String(p.model_id).trim() : existing.model_id,
      model_name: isNonEmptyString(p.model_name) ? String(p.model_name).trim() : existing.model_name,
      chat_endpoint: p.chat_endpoint ?? existing.chat_endpoint ?? '',
      streaming: p.streaming === undefined ? existing.streaming : p.streaming !== false,
      auth_header: p.auth_header ?? existing.auth_header ?? 'Authorization',
      custom_headers: p.custom_headers ?? existing.custom_headers ?? '',
      temperature: Number(p.temperature ?? existing.temperature),
      max_tokens: Number(p.max_tokens ?? existing.max_tokens),
      context_limit: Number(p.context_limit ?? existing.context_limit),
      timeout: Number(p.timeout ?? existing.timeout),
      builtin: existing.builtin,
      enabled: p.enabled === undefined ? existing.enabled : p.enabled !== false,
    });
    res.json(maskProvider(saved));
  }));
  app.delete('/api/providers/:id', (req, res) => {
    ProvidersRepo.delete(db, req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/providers/:id/test', asyncHandler(async (req, res) => {
    const p = ProvidersRepo.get(db, req.params.id);
    if (!p) return res.status(404).json({ error: 'not found' });
    const { buildProvider } = await import('@ks-agent/ai');
    const provider = buildProvider(p);
    const result = await provider.testConnection(p);
    res.json(result);
  }));
  app.post('/api/providers/test', asyncHandler(async (req, res) => {
    const p = req.body ?? {};
    const tmp = {
      id: 'tmp',
      name: 'tmp',
      type: p.type ?? 'openai-compatible',
      base_url: String(p.base_url ?? ''),
      api_key: p.api_key ?? '',
      model_id: String(p.model_id ?? ''),
      model_name: String(p.model_name ?? p.model_id ?? 'Model'),
      chat_endpoint: p.chat_endpoint ?? '',
      streaming: true,
      auth_header: p.auth_header ?? 'Authorization',
      custom_headers: p.custom_headers ?? '',
      temperature: 0.2,
      max_tokens: 16,
      context_limit: 8000,
      timeout: 30,
      builtin: false,
      enabled: true,
      created_at: '',
      updated_at: '',
    } as any;
    const { buildProvider } = await import('@ks-agent/ai');
    const provider = buildProvider(tmp);
    const result = await provider.testConnection(tmp);
    res.json(result);
  }));

  // === Models ===
  app.get('/api/models', (_req, res) => {
    res.json(ModelsRepo.list(db));
  });
  app.post('/api/models', asyncHandler((req, res) => {
    const m = req.body ?? {};
    if (!isNonEmptyString(m.role) || !isNonEmptyString(m.provider_id)) {
      return res.status(400).json({ error: 'role and provider_id are required' });
    }
    if (!ProvidersRepo.get(db, m.provider_id)) {
      return res.status(400).json({ error: 'provider not found' });
    }
    ModelsRepo.upsert(db, {
      role: m.role,
      provider_id: m.provider_id,
      model_id: String(m.model_id ?? ''),
      temperature: Number(m.temperature ?? 0.2),
      max_tokens: Number(m.max_tokens ?? 4096),
      updated_at: new Date().toISOString(),
    });
    res.json(ModelsRepo.get(db, m.role));
  }));

  // === App Settings ===
  app.get('/api/settings', (_req, res) => {
    res.json(loadAppSettings(db));
  });
  app.put('/api/settings', asyncHandler((req, res) => {
    const cur = loadAppSettings(db);
    // Deep-merge so partial section updates don't wipe sibling fields.
    const next: Record<string, any> = { ...cur };
    for (const [key, value] of Object.entries(req.body ?? {})) {
      const prev = (cur as any)[key];
      next[key] =
        value && typeof value === 'object' && !Array.isArray(value) && prev && typeof prev === 'object'
          ? { ...prev, ...value }
          : value;
    }
    saveAppSettings(db, next as ReturnType<typeof loadAppSettings>);
    res.json(next);
  }));

  // === Database utility ===
  app.get('/api/database/info', (_req, res) => {
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[];
    const counts: Record<string, number> = {};
    for (const r of row) {
      try {
        const c = db.prepare(`SELECT COUNT(*) as c FROM ${r.name}`).get() as any;
        counts[r.name] = c.c;
      } catch {
        // ignore
      }
    }
    res.json({ tables: row.map((r) => r.name), counts });
  });
  app.post('/api/database/reset', asyncHandler((req, res) => {
    const scope = String(req.body?.scope ?? 'all');
    if (scope === 'all' || scope === 'projects') {
      const tx = db.transaction(() => {
        db.prepare(`DELETE FROM tool_calls`).run();
        db.prepare(`DELETE FROM agent_steps`).run();
        db.prepare(`DELETE FROM agent_runs`).run();
        db.prepare(`DELETE FROM messages`).run();
        db.prepare(`DELETE FROM chats`).run();
        db.prepare(`DELETE FROM projects`).run();
      });
      tx();
    }
    res.json({ ok: true });
  }));

  // === Error handler (JSON, logged) — must be registered last ===
  app.use((err: any, _req: Request, res: Response, _next: express.NextFunction) => {
    logger.error('API error', { error: err?.message ?? String(err), stack: err?.stack }, 'api');
    if (res.headersSent) return;
    res.status(err?.status ?? 500).json({ error: err?.message ?? 'Internal server error' });
  });
}
