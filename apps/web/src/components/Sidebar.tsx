import { useState } from 'react';
import { Chat, Project } from '../types';

interface Props {
  projects: Project[];
  chats: Record<string, Chat[]>;
  selectedProjectId: string | null;
  selectedChatId: string | null;
  onSelectProject: (id: string) => void;
  onSelectChat: (id: string) => void;
  onCreateProject: (name: string, root_directory: string) => Promise<void>;
  onUpdateProject: (id: string, fields: Partial<Project>) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
  onCreateChat: (projectId: string) => Promise<void>;
  onRenameChat: (id: string, title: string) => Promise<void>;
  onDeleteChat: (id: string) => Promise<void>;
}

export function Sidebar(p: Props) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRoot, setNewRoot] = useState('');
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [editProjectId, setEditProjectId] = useState<string | null>(null);

  const submitNew = async () => {
    if (!newName.trim() || !newRoot.trim()) return;
    await p.onCreateProject(newName.trim(), newRoot.trim());
    setNewName('');
    setNewRoot('');
    setShowNew(false);
  };

  const startRenameChat = (c: Chat) => {
    setRenameId(c.id);
    setRenameValue(c.title);
  };

  const commitRenameChat = async () => {
    if (renameId && renameValue.trim()) {
      await p.onRenameChat(renameId, renameValue.trim());
    }
    setRenameId(null);
    setRenameValue('');
  };

  return (
    <aside className="panel">
      <div className="panel-header">
        <span>Projects</span>
        <button className="ghost" onClick={() => setShowNew((v) => !v)}>
          + New
        </button>
      </div>
      <div className="panel-body compact">
        {showNew && (
          <div className="section" style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <input
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              style={{ marginBottom: 6 }}
            />
            <input
              placeholder="Project root directory (absolute)"
              value={newRoot}
              onChange={(e) => setNewRoot(e.target.value)}
              style={{ marginBottom: 6 }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={submitNew}>Create</button>
              <button className="ghost" onClick={() => setShowNew(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {p.projects.length === 0 && (
          <div className="empty">
            No projects yet.
            <br />
            Create one to start using KS AGENT.
          </div>
        )}
        {p.projects.map((proj) => (
          <div key={proj.id}>
            <div
              className={`sidebar-item ${p.selectedProjectId === proj.id ? 'selected' : ''}`}
              onClick={() => p.onSelectProject(proj.id)}
              onDoubleClick={() => {
                setEditProjectId(proj.id);
              }}
            >
              <span className="name">{proj.name}</span>
              <span className="meta">{p.chats[proj.id]?.length ?? 0}</span>
            </div>
            {p.selectedProjectId === proj.id && (
              <div style={{ paddingLeft: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 6px',
                  }}
                >
                  <span className="muted small">Chats</span>
                  <button className="ghost small" onClick={() => p.onCreateChat(proj.id)}>
                    + Chat
                  </button>
                </div>
                {(p.chats[proj.id] ?? []).map((c) => (
                  <div
                    key={c.id}
                    className={`sidebar-item ${p.selectedChatId === c.id ? 'selected' : ''}`}
                    onClick={() => p.onSelectChat(c.id)}
                    onDoubleClick={() => startRenameChat(c)}
                  >
                    {renameId === c.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRenameChat}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitRenameChat();
                          if (e.key === 'Escape') setRenameId(null);
                        }}
                      />
                    ) : (
                      <>
                        <span className="name">{c.title}</span>
                        <button
                          className="ghost small"
                          onClick={(e) => {
                            e.stopPropagation();
                            p.onDeleteChat(c.id);
                          }}
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                ))}
                {editProjectId === proj.id && (
                  <div className="section" style={{ padding: 8 }}>
                    <input
                      defaultValue={proj.name}
                      onBlur={(e) => {
                        p.onUpdateProject(proj.id, { name: e.target.value });
                        setEditProjectId(null);
                      }}
                      autoFocus
                      style={{ marginBottom: 6 }}
                    />
                    <input
                      defaultValue={proj.root_directory}
                      onBlur={(e) => {
                        p.onUpdateProject(proj.id, { root_directory: e.target.value });
                      }}
                      style={{ marginBottom: 6 }}
                    />
                    <button className="danger" onClick={() => p.onDeleteProject(proj.id)}>
                      Delete project
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}
