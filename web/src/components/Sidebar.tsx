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
            <span>Projects</span>
            <button className="icon-btn" onClick={onCreateProject} title="New project">
              +
            </button>
          </div>
          <div className="project-list">
            {projects.length === 0 && <p className="empty-hint">No projects yet. Create one to start.</p>}
            {projects.map((project) => (
              <div
                key={project.id}
                className={`project-item ${project.id === activeProjectId ? 'active' : ''}`}
                onClick={() => onSelectProject(project)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') onSelectProject(project)
                }}
              >
                <div className="project-name">{project.name}</div>
                <button
                  className="icon-btn tiny"
                  title="Remove project"
                  onClick={(event) => {
                    event.stopPropagation()
                    onDeleteProject(project)
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
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
