import { Project, Chat, Message, AgentRun, AgentSettings, ModelSettings, ModelDefinition } from '../types/api';

const API_BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {})
    },
    ...options
  });

  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || data.message || message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return res.json();
}

export const api = {
  getProjects: () => request<Project[]>('/projects'),

  createProject: (name: string, rootDirectory: string) =>
    request<{ id: string }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, rootDirectory })
    }),

  updateProject: (id: string, updates: { name?: string; rootDirectory?: string }) =>
    request<{ ok: boolean }>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates)
    }),

  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  getChats: (projectId: string) => request<Chat[]>(`/projects/${projectId}/chats`),

  createChat: (projectId: string, title: string) =>
    request<{ id: string }>(`/projects/${projectId}/chats`, {
      method: 'POST',
      body: JSON.stringify({ title })
    }),

  updateChat: (chatId: string, title: string) =>
    request<{ ok: boolean }>(`/chats/${chatId}`, {
      method: 'PUT',
      body: JSON.stringify({ title })
    }),

  deleteChat: (chatId: string) =>
    request<{ ok: boolean }>(`/chats/${chatId}`, { method: 'DELETE' }),

  getMessages: (chatId: string) => request<Message[]>(`/chats/${chatId}/messages`),

  startRun: (chatId: string, projectId: string, message: string) =>
    request<{ runId: string }>(`/chats/${chatId}/run`, {
      method: 'POST',
      body: JSON.stringify({ projectId, message })
    }),

  getRun: (runId: string) => request<AgentRun>(`/runs/${runId}`),
  getRunState: (runId: string) => request<{ state: string; running: boolean }>(`/runs/${runId}/state`),

  approveRun: (runId: string, requestId: string) =>
    request<{ ok: boolean }>(`/runs/${runId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ requestId })
    }),

  denyRun: (runId: string, requestId: string) =>
    request<{ ok: boolean }>(`/runs/${runId}/deny`, {
      method: 'POST',
      body: JSON.stringify({ requestId })
    }),

  getRunsForChat: (chatId: string) => request<AgentRun[]>(`/chats/${chatId}/runs`),

  getAgentSettings: () => request<AgentSettings>('/settings/agent'),
  updateAgentSettings: (settings: Partial<AgentSettings>) =>
    request<AgentSettings>('/settings/agent', {
      method: 'PUT',
      body: JSON.stringify(settings)
    }),

  getModelSettings: () => request<ModelSettings>('/settings/models'),
  updateModelSettings: (settings: Partial<ModelSettings>) =>
    request<ModelSettings>('/settings/models', {
      method: 'PUT',
      body: JSON.stringify(settings)
    }),

  getApiStatus: () => request<{ configured: boolean }>('/settings/api'),
  setApiKey: (apiKey: string) =>
    request<{ configured: boolean }>('/settings/api', {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    }),
  testApiConnection: () => request<{ ok: boolean; message: string }>('/settings/api/test', { method: 'POST' }),

  getModels: () => request<ModelDefinition[]>('/models'),

  getProjectFiles: (projectId: string) => request<any[]>('/projects/' + projectId + '/files')
};