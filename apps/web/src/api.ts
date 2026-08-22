import {
  AgentRun,
  AgentStep,
  AppSettings,
  ApprovalRequest,
  Chat,
  Message,
  ModelSettings,
  Project,
  ProviderSettings,
  ToolCall,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  health: () => request<{ ok: boolean }>('/api/health'),

  // Projects
  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (name: string, root_directory: string) =>
    request<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name, root_directory }) }),
  updateProject: (id: string, fields: Partial<Project>) =>
    request<Project>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(fields) }),
  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),

  // Chats
  listChats: (projectId: string) =>
    request<Chat[]>(`/api/projects/${projectId}/chats`),
  createChat: (projectId: string, title: string) =>
    request<Chat>(`/api/projects/${projectId}/chats`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),
  renameChat: (id: string, title: string) =>
    request<Chat>(`/api/chats/${id}`, { method: 'PUT', body: JSON.stringify({ title }) }),
  deleteChat: (id: string) =>
    request<{ ok: boolean }>(`/api/chats/${id}`, { method: 'DELETE' }),

  // Messages
  listMessages: (chatId: string) =>
    request<Message[]>(`/api/chats/${chatId}/messages`),

  // Runs
  listRuns: (chatId: string) => request<AgentRun[]>(`/api/chats/${chatId}/runs`),
  startRun: (chatId: string, prompt: string) =>
    request<{ runId: string }>(`/api/chats/${chatId}/runs`, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    }),
  cancelRun: (runId: string) =>
    request<{ ok: boolean }>(`/api/runs/${runId}/cancel`, { method: 'POST' }),
  resumeRun: (runId: string) =>
    request<{ ok: boolean }>(`/api/runs/${runId}/resume`, { method: 'POST' }),
  getRun: (runId: string) => request<AgentRun>(`/api/runs/${runId}`),
  listSteps: (runId: string) => request<AgentStep[]>(`/api/runs/${runId}/steps`),
  listToolCalls: (runId: string) =>
    request<ToolCall[]>(`/api/runs/${runId}/tool_calls`),

  // Approvals
  listApprovals: () => request<ApprovalRequest[]>(`/api/approvals`),
  decideApproval: (id: string, approved: boolean) =>
    request<{ ok: boolean }>(`/api/approvals/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ approved }),
    }),

  // Providers
  listProviders: () => request<ProviderSettings[]>(`/api/providers`),
  saveProvider: (p: Partial<ProviderSettings>) =>
    request<ProviderSettings>(`/api/providers`, {
      method: 'POST',
      body: JSON.stringify(p),
    }),
  updateProvider: (id: string, p: Partial<ProviderSettings>) =>
    request<ProviderSettings>(`/api/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(p),
    }),
  deleteProvider: (id: string) =>
    request<{ ok: boolean }>(`/api/providers/${id}`, { method: 'DELETE' }),
  testProvider: (id: string) =>
    request<{ ok: boolean; error?: string }>(`/api/providers/${id}/test`, {
      method: 'POST',
    }),
  testProviderDraft: (p: Partial<ProviderSettings>) =>
    request<{ ok: boolean; error?: string }>(`/api/providers/test`, {
      method: 'POST',
      body: JSON.stringify(p),
    }),

  // Models
  listModels: () => request<ModelSettings[]>(`/api/models`),
  saveModel: (m: ModelSettings) =>
    request<ModelSettings>(`/api/models`, {
      method: 'POST',
      body: JSON.stringify(m),
    }),

  // Settings
  getSettings: () => request<AppSettings>(`/api/settings`),
  saveSettings: (s: AppSettings) =>
    request<AppSettings>(`/api/settings`, {
      method: 'PUT',
      body: JSON.stringify(s),
    }),

  // Database
  dbInfo: () => request<{ tables: string[]; counts: Record<string, number> }>(`/api/database/info`),
  dbReset: (scope: 'all' | 'projects') =>
    request<{ ok: boolean }>(`/api/database/reset`, {
      method: 'POST',
      body: JSON.stringify({ scope }),
    }),
};
