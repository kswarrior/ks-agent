import type { Chat, Project } from '../types'
import { Logo } from './Logo'
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
          <Logo className="brand-mark" />
          <div>
            <strong>KS Agent</strong>
            <span>coding agent by KS Warrior</span>
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
            <svg className="side-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.706 1.087.706 1.704s-.235 1.233-.706 1.704l-1.611 1.611a.98.98 0 0 1-.837.276c-.47-.07-.802-.48-.968-.925a2.501 2.501 0 1 0-3.214 3.214c.446.166.855.497.925.968a.979.979 0 0 1-.276.837l-1.61 1.61a2.404 2.404 0 0 1-1.705.707 2.402 2.402 0 0 1-1.704-.706l-1.568-1.568a1.026 1.026 0 0 0-.877-.29c-.493.074-.84.504-1.02.968a2.5 2.5 0 1 1-3.237-3.237c.464-.18.894-.527.967-1.02a1.026 1.026 0 0 0-.289-.877L1.85 12.56c-.47-.47-.706-1.087-.706-1.704s.235-1.233.706-1.704l1.61-1.611a.98.98 0 0 1 .837-.276c.47.07.802.48.968.925a2.501 2.501 0 1 0 3.214-3.214c-.446-.166-.855-.497-.925-.968a.979.979 0 0 1 .276-.837l1.61-1.61a2.404 2.404 0 0 1 1.705-.707 2.402 2.402 0 0 1 1.704.706l1.568 1.568c.23.23.556.338.877.29.493-.074.84-.504 1.02-.968a2.5 2.5 0 1 1 3.237 3.237c-.464.18-.894.527-.967 1.02Z" />
            </svg>
            Extensions
          </button>
          <button className="side-btn" onClick={onOpenSettings}>
            <svg className="side-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Settings
          </button>
        </div>
      </aside>
      {open && <div className="sidebar-scrim mobile-only" onClick={onClose} />}
    </>
  )
}
