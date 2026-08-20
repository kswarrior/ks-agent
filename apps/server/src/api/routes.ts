import { Router, Request, Response } from 'express';
import { AppContext } from '../services/AppContext';
import { ProjectService } from '../services/ProjectService';
import { AgentRunService } from '../services/AgentRunService';
import { generateId } from '@ks-agent/shared';

export function createApiRouter(appContext: AppContext): Router {
  const router = Router();
  const projectService = new ProjectService(appContext);
  const runService = new AgentRunService(appContext);

  // Health check
  router.get('/health', (_req: Request, res: Response) => {
    res.json({ ok: true, name: 'KS AGENT', timestamp: new Date().toISOString() });
  });

  // ============ PROJECTS ============

  router.get('/projects', (_req: Request, res: Response) => {
    try {
      const projects = projectService.getAllProjects();
      
      // Add chat counts
      const enriched = projects.map((p: any) => ({
        ...p,
        settings: JSON.parse(p.settings || '{}'),
        chats: projectService.getChats(p.id)
      }));

      res.json(enriched);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/projects', (req: Request, res: Response) => {
    try {
      const { name, rootDirectory, settings } = req.body || {};
      if (!name || !rootDirectory) {
        return res.status(400).json({ error: 'name and rootDirectory are required' });
      }
      const id = projectService.createProject(name, rootDirectory, settings || {});
      res.status(201).json({ id, name, rootDirectory });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/projects/:projectId', (req: Request, res: Response) => {
    try {
      const project = projectService.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ error: 'Project not found' });
      
      const parsed = {
        ...project,
        settings: typeof (project as any).settings === 'string' ? JSON.parse((project as any).settings) : (project as any).settings
      };
      res.json(parsed);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.put('/projects/:projectId', (req: Request, res: Response) => {
    try {
      const { name, rootDirectory, settings } = req.body || {};
      projectService.updateProject(req.params.projectId, { name, rootDirectory, settings });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.delete('/projects/:projectId', (req: Request, res: Response) => {
    try {
      projectService.deleteProject(req.params.projectId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ============ CHATS ============

  router.get('/projects/:projectId/chats', (req: Request, res: Response) => {
    try {
      const chats = projectService.getChats(req.params.projectId);
      res.json(chats);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/projects/:projectId/chats', (req: Request, res: Response) => {
    try {
      const { title } = req.body || {};
      const id = projectService.createChat(req.params.projectId, title || 'New chat');
      res.status(201).json({ id, title: title || 'New chat' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/chats/:chatId', (req: Request, res: Response) => {
    try {
      const chat = projectService.getChat(req.params.chatId);
      if (!chat) return res.status(404).json({ error: 'Chat not found' });
      res.json(chat);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.put('/chats/:chatId', (req: Request, res: Response) => {
    try {
      const { title, status } = req.body || {};
      projectService.updateChat(req.params.chatId, { title, status });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.delete('/chats/:chatId', (req: Request, res: Response) => {
    try {
      projectService.deleteChat(req.params.chatId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ============ MESSAGES ============

  router.get('/chats/:chatId/messages', (req: Request, res: Response) => {
    try {
      const messages = projectService.getMessages(req.params.chatId);
      const parsed = messages.map((m: any) => ({
        ...m,
        metadata: m.metadata ? JSON.parse(m.metadata) : {}
      }));
      res.json(parsed);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ============ AGENT RUNS ============

  router.post('/chats/:chatId/run', async (req: Request, res: Response) => {
    try {
      const { message, projectId } = req.body || {};
      if (!projectId) return res.status(400).json({ error: 'projectId is required' });
      if (!message || !message.trim()) return res.status(400).json({ error: 'message is required' });

      const result = await runService.startRun(req.params.chatId, projectId, message);
      res.status(202).json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/runs/:runId', (req: Request, res: Response) => {
    try {
      const run = runService.getRunStatus(req.params.runId);
      if (!run) return res.status(404).json({ error: 'Run not found' });
      
      const parsed = {
        ...run,
        metadata: typeof (run as any).metadata === 'string' ? JSON.parse((run as any).metadata) : (run as any).metadata
      };
      res.json(parsed);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/runs/:runId/state', (req: Request, res: Response) => {
    try {
      res.json(runService.getRunState(req.params.runId));
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/runs/:runId/approve', (req: Request, res: Response) => {
    try {
      const { requestId } = req.body || {};
      runService.approve(req.params.runId, requestId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/runs/:runId/deny', (req: Request, res: Response) => {
    try {
      const { requestId } = req.body || {};
      runService.deny(req.params.runId, requestId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/chats/:chatId/runs', (req: Request, res: Response) => {
    try {
      const runs = runService.getRunsForChat(req.params.chatId);
      res.json(runs);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ============ SETTINGS ============

  router.get('/settings/agent', (_req: Request, res: Response) => {
    try {
      res.json(appContext.getAgentSettings());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.put('/settings/agent', (req: Request, res: Response) => {
    try {
      const settings = appContext.updateAgentSettings(req.body || {});
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/settings/models', (_req: Request, res: Response) => {
    try {
      res.json(appContext.getModelSettings());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.put('/settings/models', (req: Request, res: Response) => {
    try {
      const settings = appContext.updateModelSettings(req.body || {});
      res.json(settings);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.get('/settings/api', (_req: Request, res: Response) => {
    try {
      res.json({ configured: appContext.getApiKey() !== null && appContext.getApiKey() !== '' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/settings/api', (req: Request, res: Response) => {
    try {
      const { apiKey } = req.body || {};
      if (apiKey) {
        appContext.setApiKey(apiKey);
      }
      res.json({ configured: true });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  router.post('/settings/api/test', async (_req: Request, res: Response) => {
    try {
      const result = await appContext.testConnection();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ============ MODELS ============

  router.get('/models', (_req: Request, res: Response) => {
    try {
      res.json(appContext.modelRegistry.getModels());
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ============ FILE SYSTEM (read-only project inspection) ============

  router.get('/projects/:projectId/files', async (req: Request, res: Response) => {
    try {
      const project = appContext.db.getProject(req.params.projectId);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      const projectRoot = (project as any).root_directory;
      const { readdir, stat } = await import('fs/promises');
      const { join, relative, resolve } = await import('path');
      const root = resolve(projectRoot);

      const walk = async (dir: string, depth: number): Promise<any[]> => {
        if (depth > 5) return [];
        let entries: any[] = [];
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return [];
        }
        const result: any[] = [];
        for (const entry of entries) {
          if (['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)) continue;
          const fullPath = join(dir, entry.name);
          const rel = relative(root, fullPath);
          if (entry.isDirectory()) {
            const children = await walk(fullPath, depth + 1);
            result.push({ name: entry.name, path: rel, type: 'directory', children });
          } else {
            result.push({ name: entry.name, path: rel, type: 'file' });
          }
        }
        return result;
      };

      const tree = await walk(root, 0);
      res.json(tree);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return router;
}