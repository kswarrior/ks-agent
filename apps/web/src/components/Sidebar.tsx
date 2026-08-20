import { useState } from 'react';
import { Project } from '../types/api';
import { useAppState } from '../hooks/useAppState';

interface SidebarProps {
  appState: ReturnType<typeof useAppState>;
}

export function Sidebar({ appState }: SidebarProps) {
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectRoot, setNewProjectRoot] = useState('');
  const [confirmProject, setConfirmProject] = useState<Project | null>(null);
  const [confirmChat, setConfirmChat] = useState<{ id: string; title: string; projectId: string } | null>(null);

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !newProjectRoot.trim()) return;
    await appState.createProject(newProjectName.trim(), newProjectRoot.trim());
    setNewProjectName('');
    setNewProjectRoot('');
    setShowNewProject(false);
  };

  const handleNewChat = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const chatId = await appState.createChat(projectId, 'New chat');
    await appState.selectChat(chatId);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <button className="btn btn-small" style={{ width: '100%' }} onClick={() => setShowNewProject(true)}>
          + New Project
        </button>
      </div>

      <div className="sidebar-section-title">Projects</div>

      {appState.projects.length === 0 && (
        <div className="empty-state" style={{ padding: '24px 12px', fontSize: 12 }}>
          No projects yet. Create one to begin.
        </div>
      )}

      {appState.projects.map((project) => (
        <div
          key={project.id}
          className={`project-item ${appState.selectedProjectId === project.id ? 'active' : ''}`}
          onClick={() => appState.selectProject(project.id)}
        >
          <span className="project-name">
            <span>{project.name}</span>
            <span className="project-actions">
              <button className="icon-btn" title="Open directory" onClick={(e) => { e.stopPropagation(); }}>
                f
              </button>
              <button className="icon-btn" title="Delete project" onClick={(e) => { e.stopPropagation(); setConfirmProject(project); }}>
                x
              </button>
            </span>
          </span>

          <button
            className="add-chat-btn"
            onClick={(e) => handleNewChat(project.id, e)}
          >
            + New Chat
          </button>

          {project.chats && project.chats.map((chat) => (
            <div
              key={chat.id}
              className={`chat-item ${appState.selectedChatId === chat.id ? 'active' : ''}`}
              onClick={() => appState.selectChat(chat.id)}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.title}</span>
              <button
                className="icon-btn danger"
                title="Delete chat"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmChat({ id: chat.id, title: chat.title, projectId: project.id });
                }}
              >
                x
              </button>
            </div>
          ))}
        </div>
      ))}

      {/* New project modal */}
      {showNewProject && (
        <div className="modal-overlay" onClick={() => setShowNewProject(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New Project</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Project Name</label>
                <input
                  className="settings-input"
                  style={{ width: '100%' }}
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="My React App"
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Root Directory</label>
                <input
                  className="settings-input"
                  style={{ width: '100%' }}
                  value={newProjectRoot}
                  onChange={(e) => setNewProjectRoot(e.target.value)}
                  placeholder="/path/to/project"
                />
                <div className="settings-hint">The agent will operate in this directory.</div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="button-secondary" onClick={() => setShowNewProject(false)}>Cancel</button>
              <button className="button-primary" onClick={handleCreateProject} disabled={!newProjectName || !newProjectRoot}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete project */}
      {confirmProject && (
        <div className="modal-overlay" onClick={() => setConfirmProject(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete project?</h3>
            <p style={{ color: 'var(--text-muted)' }}>This will permanently delete "{confirmProject.name}" and all its chats.</p>
            <div className="modal-actions">
              <button className="button-secondary" onClick={() => setConfirmProject(null)}>Cancel</button>
              <button
                className="button-primary"
                style={{ background: 'var(--red)', color: '#000' }}
                onClick={() => {
                  appState.deleteProject(confirmProject.id);
                  setConfirmProject(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete chat */}
      {confirmChat && (
        <div className="modal-overlay" onClick={() => setConfirmChat(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete chat?</h3>
            <p style={{ color: 'var(--text-muted)' }}>This will permanently delete "{confirmChat.title}".</p>
            <div className="modal-actions">
              <button className="button-secondary" onClick={() => setConfirmChat(null)}>Cancel</button>
              <button
                className="button-primary"
                style={{ background: 'var(--red)', color: '#000' }}
                onClick={() => {
                  appState.deleteChat(confirmChat.id);
                  setConfirmChat(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}