import type { Chat, Project } from '../types'
import { SelectMenu } from './SelectMenu'

export function Sidebar({
  projects,
  activeProjectId,
  chats,
  activeChatId,
  projectsLoading,
  chatsLoading,
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
  projectsLoading: boolean
  chatsLoading: boolean
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
          {projectsLoading ? (
            <div className="skeleton skeleton-select" aria-hidden="true" />
          ) : (
            <SelectMenu
              className="sidebar-project-select"
              value={activeProjectId ?? ''}
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              onChange={(id) => {
                const next = projects.find((project) => project.id === id)
                if (next) onSelectProject(next)
              }}
              placeholder="No projects yet"
              disabled={projects.length === 0}
              ariaLabel="Project"
            />
          )}
        </div>

        <div className="sidebar-section grow">
          <div className="section-title">
            <span>Chats</span>
            <button className="icon-btn" onClick={onCreateChat} title="New chat" disabled={!activeProject}>
              +
            </button>
          </div>
          <div className="chat-list">
            {(projectsLoading || (activeProject && chatsLoading)) && (
              <div className="skeleton-list" role="status" aria-label="Loading chats" aria-busy="true">
                {[0, 1, 2, 3].map((index) => (
                  <div className="skeleton skeleton-row" key={index} />
                ))}
              </div>
            )}
            {!projectsLoading && !chatsLoading && !activeProject && (
              <p className="empty-hint">Select a project.</p>
            )}
            {!projectsLoading && !chatsLoading && activeProject && chats.length === 0 && (
              <p className="empty-hint">No chats in this project.</p>
            )}
            {!chatsLoading && chats.map((chat) => (
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
