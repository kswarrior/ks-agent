import type { Chat, Project } from '../types'

export function Sidebar({
  projects,
  activeProjectId,
  chats,
  activeChatId,
  open,
  onClose,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onSelectChat,
  onCreateChat,
  onRenameChat,
  onDeleteChat,
  onOpenSettings,
  onOpenExtensions
}: {
  projects: Project[]
  activeProjectId: string | null
  chats: Chat[]
  activeChatId: string | null
  open: boolean
  onClose: () => void
  onSelectProject: (project: Project) => void
  onCreateProject: () => void
  onDeleteProject: (project: Project) => void
  onSelectChat: (chat: Chat) => void
  onCreateChat: () => void
  onRenameChat: (chat: Chat) => void
  onDeleteChat: (chat: Chat) => void
  onOpenSettings: () => void
  onOpenExtensions: () => void
}) {
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null

  return (
    <>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">KS</div>
          <div>
            <strong>KS Agent</strong>
            <span>extension-first coding agent</span>
          </div>
          <button className="icon-btn mobile-only" onClick={onClose} aria-label="Close sidebar">
            ×
          </button>
        </div>

        <div className="sidebar-section">
          <div className="section-title">
            <span>Project</span>
            <span className="section-actions">
              <button className="icon-btn" onClick={onCreateProject} title="New project">
                +
              </button>
              <button
                className="icon-btn"
                onClick={() => activeProject && onDeleteProject(activeProject)}
                title="Remove project"
                disabled={!activeProject}
              >
                ×
              </button>
            </span>
          </div>
          <select
            className="project-select sidebar-project-select"
            value={activeProjectId ?? ''}
            onChange={(event) => {
              const next = projects.find((project) => project.id === event.target.value)
              if (next) onSelectProject(next)
            }}
            disabled={projects.length === 0}
            aria-label="Project"
          >
            {projects.length === 0 && <option value="">No projects yet</option>}
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        <div className="sidebar-section grow">
          <div className="section-title">
            <span>Chats</span>
            <button className="icon-btn" onClick={onCreateChat} title="New chat" disabled={!activeProject}>
              +
            </button>
          </div>
          <div className="chat-list">
            {!activeProject && <p className="empty-hint">Select a project.</p>}
            {activeProject && chats.length === 0 && <p className="empty-hint">No chats in this project.</p>}
            {chats.map((chat) => (
              <div
                key={chat.id}
                className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
                onClick={() => onSelectChat(chat)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectChat(chat)
                }}
              >
                <span className="chat-title">{chat.title || 'New chat'}</span>
                <span className="chat-actions">
                  <button
                    className="icon-btn tiny"
                    title="Rename chat"
                    onClick={(event) => {
                      event.stopPropagation()
                      onRenameChat(chat)
                    }}
                  >
                    ✎
                  </button>
                  <button
                    className="icon-btn tiny"
                    title="Delete chat"
                    onClick={(event) => {
                      event.stopPropagation()
                      onDeleteChat(chat)
                    }}
                  >
                    ×
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar-foot">
          <button className="side-btn" onClick={onOpenExtensions}>
            <span className="dot" /> Extensions
          </button>
          <button className="side-btn" onClick={onOpenSettings}>
            <span className="dot" /> Settings
          </button>
          <div className="side-note">local-first · sqlite · extensions</div>
        </div>
      </aside>
      {open && <div className="sidebar-scrim mobile-only" onClick={onClose} />}
    </>
  )
}
