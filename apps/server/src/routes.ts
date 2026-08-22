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
import { randomId } from '@ks-agent/shared';
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
  app.post('/api/projects', (req, res) => {
    const { name, root_directory } = req.body ?? {};
    if (!name || !root_directory) {
      return res.status(400).json({ error: 'name and root_directory required' });
    }
    const p = ProjectsRepo.create(db, String(name), String(root_directory));
    res.json(p);
  });
  app.put('/api/projects/:id', (req, res) => {
    const { name, root_directory, settings } = req.body ?? {};
    ProjectsRepo.update(db, req.params.id, {
      name: name ? String(name) : undefined,
      root_directory: root_directory ? String(root_directory) : undefined,
      settings: settings ?? undefined,
    });
    res.json(ProjectsRepo.get(db, req.params.id));
  });
  app.delete('/api/projects/:id', (req, res) => {
    ProjectsRepo.delete(db, req.params.id);
    res.json({ ok: true });
  });

  // === Chats ===
  app.get('/api/projects/:projectId/chats', (req, res) => {
    res.json(ChatsRepo.listByProject(db, req.params.projectId));
  });
  app.post('/api/projects/:projectId/chats', (req, res) => {
    const title = String(req.body?.title ?? 'New chat');
    const chat = ChatsRepo.create(db, req.params.projectId, title);
    res.json(chat);
  });
  app.put('/api/chats/:id', (req, res) => {
    if (req.body?.title) ChatsRepo.rename(db, req.params.id, String(req.body.title));
    res.json(ChatsRepo.get(db, req.params.id));
  });
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
  app.post('/api/chats/:chatId/runs', async (req, res) => {
    const prompt = String(req.body?.prompt ?? '').trim();
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const runId = await workflow.startRun(req.params.chatId, prompt);
    res.json({ runId });
  });
  app.post('/api/runs/:runId/cancel', (req, res) => {
    workflow.cancel(req.params.runId);
    res.json({ ok: true });
  });
  app.post('/api/runs/:runId/resume', async (req, res) => {
    await workflow.resume(req.params.runId);
    res.json({ ok: true });
  });
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
  app.get('/api/providers', (_req, res) => {
    const list = ProvidersRepo.list(db).map((p) => ({ ...p, api_key: p.api_key ? '********' : '' }));
    res.json(list);
  });
  app.get('/api/providers/:id/full', (req, res) => {
    res.json(ProvidersRepo.get(db, req.params.id));
  });
  app.post('/api/providers', (req, res) => {
    const p = req.body ?? {};
    const saved = ProvidersRepo.upsert(db, {
      id: p.id,
      name: String(p.name ?? 'Custom'),
      type: p.type ?? 'openai-compatible',
      base_url: String(p.base_url ?? ''),
      api_key: p.api_key ?? '',
      model_id: String(p.model_id ?? ''),
      model_name: String(p.model_name ?? p.model_id ?? 'Model'),
      chat_endpoint: p.chat_endpoint ?? '',
      streaming: p.streaming !== false,
      auth_header: p.auth_header ?? 'Authorization',
      custom_headers: p.custom_headers ?? '',
      temperature: Number(p.temperature ?? 0.2),
      max_tokens: Number(p.max_tokens ?? 4096),
      context_limit: Number(p.context_limit ?? 32000),
      timeout: Number(p.timeout ?? 120),
      builtin: false,
      enabled: p.enabled !== false,
    });
    const safe = { ...saved, api_key: saved.api_key ? '********' : '' };
    res.json(safe);
  });
  app.put('/api/providers/:id', (req, res) => {
    const p = req.body ?? {};
    const saved = ProvidersRepo.upsert(db, {
      ...p,
      id: req.params.id,
      builtin: p.builtin === true,
    });
    res.json({ ...saved, api_key: saved.api_key ? '********' : '' });
  });
  app.delete('/api/providers/:id', (req, res) => {
    ProvidersRepo.delete(db, req.params.id);
    res.json({ ok: true });
  });
  app.post('/api/providers/:id/test', async (req, res) => {
    const p = ProvidersRepo.get(db, req.params.id);
    if (!p) return res.status(404).json({ error: 'not found' });
    const { buildProvider } = await import('@ks-agent/ai');
    const provider = buildProvider(p);
    const result = await provider.testConnection(p);
    res.json(result);
  });
  app.post('/api/providers/test', async (req, res) => {
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
  });

  // === Models ===
  app.get('/api/models', (_req, res) => {
    res.json(ModelsRepo.list(db));
  });
  app.post('/api/models', (req, res) => {
    const m = req.body;
    ModelsRepo.upsert(db, m);
    res.json(ModelsRepo.get(db, m.role));
  });

  // === App Settings ===
  app.get('/api/settings', (_req, res) => {
    res.json(loadAppSettings(db));
  });
  app.put('/api/settings', (req, res) => {
    const cur = loadAppSettings(db);
    const next = { ...cur, ...req.body };
    saveAppSettings(db, next);
    res.json(next);
  });

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
  app.post('/api/database/reset', (req, res) => {
    const scope = String(req.body?.scope ?? 'all');
    if (scope === 'all' || scope === 'projects') {
      db.prepare(`DELETE FROM tool_calls`).run();
      db.prepare(`DELETE FROM agent_steps`).run();
      db.prepare(`DELETE FROM agent_runs`).run();
      db.prepare(`DELETE FROM messages`).run();
      db.prepare(`DELETE FROM chats`).run();
      db.prepare(`DELETE FROM projects`).run();
    }
    res.json({ ok: true });
  });
}
