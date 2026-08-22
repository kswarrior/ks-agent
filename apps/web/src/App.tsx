import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import { useEventStream } from './useEventStream';
import { Sidebar } from './components/Sidebar';
import { ChatPanel } from './components/ChatPanel';
import { ActivityPanel } from './components/ActivityPanel';
import { SettingsPage } from './components/SettingsPage';
import { AppSettings, ApprovalRequest, Chat, Project, ProviderSettings } from './types';

export function App() {
  const { connected, events } = useEventStream();
  const [view, setView] = useState<'workspace' | 'settings'>('workspace');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [chats, setChats] = useState<Record<string, Chat[]>>({});
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [providers, setProviders] = useState<ProviderSettings[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);

  const refreshProjects = useCallback(async () => {
    const list = await api.listProjects();
    setProjects(list);
    if (!selectedProjectId && list.length) setSelectedProjectId(list[0].id);
  }, [selectedProjectId]);

  const refreshChats = useCallback(async (projectId: string) => {
    const list = await api.listChats(projectId);
    setChats((prev) => ({ ...prev, [projectId]: list }));
    return list;
  }, []);

  const refreshProviders = useCallback(async () => {
    setProviders(await api.listProviders());
  }, []);

  const refreshApprovals = useCallback(async () => {
    setApprovals(await api.listApprovals());
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const s = await api.getSettings();
        setSettings(s);
      } catch (e) {
        console.error(e);
      }
      await refreshProjects();
      await refreshProviders();
      await refreshApprovals();
    })();
  }, [refreshProjects, refreshProviders, refreshApprovals]);

  // Refresh approvals on relevant events
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;
    if (last.type === 'approval.required') {
      refreshApprovals();
    }
  }, [events, refreshApprovals]);

  // React to settings changes for theming
  useEffect(() => {
    if (!settings) return;
    const root = document.documentElement;
    const a = settings.appearance;
    root.style.setProperty('--radius', `${a.border_radius}px`);
    root.style.setProperty('--primary', a.primary_color);
    root.style.setProperty('--text', a.text_color);
    root.style.setProperty('--muted', a.muted_color);
    root.style.setProperty('--border', a.border_color);
    root.style.setProperty('--overlay-opacity', String(a.overlay_opacity));
    if (a.background_type === 'image') {
      root.style.setProperty('--bg-image', `url('${a.background_image_url}')`);
      root.style.setProperty('--bg-color', a.background_color);
    } else {
      root.style.setProperty('--bg-image', 'none');
      root.style.setProperty('--bg-color', a.background_color);
    }
  }, [settings]);

  // React to events
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;
    if (last.type === 'agent_run.started') {
      setActiveRunId(last.runId);
    }
    if (last.type === 'agent_run.completed' || last.type === 'agent_run.failed') {
      setActiveRunId(null);
    }
  }, [events]);

  useEffect(() => {
    if (selectedProjectId) {
      refreshChats(selectedProjectId).then((list) => {
        if (list.length && !selectedChatId) setSelectedChatId(list[0].id);
      });
    }
  }, [selectedProjectId, refreshChats, selectedChatId]);

  const createProject = async (name: string, root_directory: string) => {
    const p = await api.createProject(name, root_directory);
    await refreshProjects();
    setSelectedProjectId(p.id);
    setSelectedChatId(null);
  };
  const updateProject = async (id: string, fields: Partial<Project>) => {
    await api.updateProject(id, fields);
    await refreshProjects();
  };
  const deleteProject = async (id: string) => {
    if (!confirm('Delete this project and all its chats?')) return;
    await api.deleteProject(id);
    setSelectedProjectId(null);
    setSelectedChatId(null);
    await refreshProjects();
  };

  const createChat = async (projectId: string) => {
    const c = await api.createChat(projectId, 'New chat');
    await refreshChats(projectId);
    setSelectedChatId(c.id);
  };
  const renameChat = async (id: string, title: string) => {
    await api.renameChat(id, title);
    if (selectedProjectId) await refreshChats(selectedProjectId);
  };
  const deleteChat = async (id: string) => {
    if (!confirm('Delete this chat?')) return;
    await api.deleteChat(id);
    if (selectedProjectId) {
      const list = await refreshChats(selectedProjectId);
      setSelectedChatId(list[0]?.id ?? null);
    }
  };

  const handleApprove = async (id: string, approved: boolean) => {
    await api.decideApproval(id, approved);
    await refreshApprovals();
  };

  const activeProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const activeChat = useMemo(() => {
    if (!activeProject || !selectedChatId) return null;
    return (chats[activeProject.id] ?? []).find((c) => c.id === selectedChatId) ?? null;
  }, [activeProject, chats, selectedChatId]);

  return (
    <div className="app">
      <div className="titlebar">
        <div className="brand">
          <span className="brand-mark">KS</span>
          <span>KS AGENT</span>
          <span className={`status-pill`}>
            <span className={`dot ${connected ? 'green' : 'red'}`} />
            {connected ? 'live' : 'offline'}
          </span>
        </div>
        <nav>
          <button
            className={view === 'workspace' ? 'active' : ''}
            onClick={() => setView('workspace')}
          >
            Workspace
          </button>
          <button
            className={view === 'settings' ? 'active' : ''}
            onClick={() => setView('settings')}
          >
            Settings
          </button>
        </nav>
      </div>
      {view === 'settings' ? (
        <SettingsPage
          settings={settings}
          providers={providers}
          onSettingsChange={async (s) => {
            await api.saveSettings(s);
            setSettings(s);
          }}
          onProvidersChange={async () => {
            await refreshProviders();
          }}
        />
      ) : (
        <div className="layout">
          <Sidebar
            projects={projects}
            chats={chats}
            selectedProjectId={selectedProjectId}
            selectedChatId={selectedChatId}
            onSelectProject={setSelectedProjectId}
            onSelectChat={setSelectedChatId}
            onCreateProject={createProject}
            onUpdateProject={updateProject}
            onDeleteProject={deleteProject}
            onCreateChat={createChat}
            onRenameChat={renameChat}
            onDeleteChat={deleteChat}
          />
          <ChatPanel
            project={activeProject}
            chat={activeChat}
            activeRunId={activeRunId}
            events={events}
            onRunStarted={(id) => setActiveRunId(id)}
            onRunFinished={() => setActiveRunId(null)}
          />
          <ActivityPanel
            project={activeProject}
            chat={activeChat}
            activeRunId={activeRunId}
            events={events}
            approvals={approvals}
            onApprove={handleApprove}
          />
        </div>
      )}
    </div>
  );
}
