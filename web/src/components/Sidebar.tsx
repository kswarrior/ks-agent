import { useEffect, useRef, useState } from 'react'
import type { Chat, Project } from '../types'
import {
  IconChat,
  IconChevronDown,
  IconDots,
  IconFolder,
  IconGear,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX
} from '../icons'

interface SidebarProps {
  open: boolean
  projects: Project[]
  activeProject: Project | null
  chats: Chat[]
  activeChatId: string | null
  onSelectProject: (id: string) => void
  onSelectChat: (id: string) => void
  onNewChat: () => void
  onRenameChat: (chat: Chat) => void
  onDeleteChat: (chat: Chat) => void
  onAddProject: () => void
  onOpenSettings: () => void
  onCloseMobile: () => void
}

function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])
  return ref
}

export function Sidebar(props: SidebarProps) {
  const [projOpen, setProjOpen] = useState(false)
  const [projQuery, setProjQuery] = useState('')
  const [chatQuery, setChatQuery] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)

  const ddRef = useClickOutside(() => setProjOpen(false))
  const menuRef = useClickOutside(() => setMenuFor(null))

  const filteredProjects = props.projects.filter((p) =>
    p.name.toLowerCase().includes(projQuery.trim().toLowerCase())
  )
  const filteredChats = props.chats.filter((c) =>
    c.title.toLowerCase().includes(chatQuery.trim().toLowerCase())
  )

  return (
    <>
      <aside className={`sidebar${props.open ? ' open' : ''}`}>
        {/* Project selector */}
        <div className="sidebar-section proj-wrap">
          <div className="section-label">Project</div>
          <button className="proj-btn" onClick={() => setProjOpen((v) => !v)}>
            <IconFolder size={16} />
            <span className="proj-name">{props.activeProject ? props.activeProject.name : 'Select project'}</span>
            <IconChevronDown size={15} />
          </button>

          {projOpen && (
            <div className="dropdown" ref={ddRef}>
              <div className="dd-toolbar">
                <div className="search-box">
                  <IconSearch size={14} />
                  <input
                    className="search-input"
                    placeholder="Search projects…"
                    value={projQuery}
                    onChange={(e) => setProjQuery(e.target.value)}
                  />
                </div>
                <button className="plus-btn" title="Add project" aria-label="Add project" onClick={props.onAddProject}>
                  <IconPlus size={16} />
                </button>
              </div>
              <div className="dd-list">
                {filteredProjects.length === 0 && (
                  <div className="dd-empty">{props.projects.length === 0 ? 'No projects yet — add one' : 'No matches'}</div>
                )}
                {filteredProjects.map((p) => (
                  <button
                    key={p.id}
                    className={`dd-item${props.activeProject?.id === p.id ? ' active' : ''}`}
                    onClick={() => {
                      props.onSelectProject(p.id)
                      setProjOpen(false)
                      setProjQuery('')
                    }}
                  >
                    <IconFolder size={15} />
                    <span>{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chats */}
        <div className="sidebar-body">
          <div className="chat-list" style={{ marginTop: 12 }}>
            <div className="section-label" style={{ marginBottom: 8 }}>
              Chats
            </div>
            <div className="dd-toolbar" style={{ padding: 0, borderBottom: 'none' }}>
              <div className="search-box">
                <IconSearch size={14} />
                <input
                  className="search-input"
                  placeholder="Search chats…"
                  value={chatQuery}
                  onChange={(e) => setChatQuery(e.target.value)}
                />
              </div>
              <button
                className="plus-btn"
                title="New chat"
                aria-label="New chat"
                disabled={!props.activeProject}
                style={{ opacity: props.activeProject ? 1 : 0.4 }}
                onClick={props.onNewChat}
              >
                <IconPlus size={16} />
              </button>
            </div>

            <div className="chat-scroll">
              {!props.activeProject && <div className="dd-empty">Select a project to see its chats</div>}
              {props.activeProject && filteredChats.length === 0 && (
                <div className="dd-empty">{props.chats.length === 0 ? 'No chats yet — press +' : 'No matches'}</div>
              )}
              {filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  className={`chat-row${props.activeChatId === chat.id ? ' active' : ''}${menuFor === chat.id ? ' menu-open' : ''}`}
                  onClick={() => props.onSelectChat(chat.id)}
                >
                  <IconChat size={15} />
                  <span className="chat-title">{chat.title}</span>
                  <span
                    className="icon-btn row-menu"
                    role="button"
                    aria-label="Chat options"
                    style={{ width: 28, height: 28 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMenuFor(menuFor === chat.id ? null : chat.id)
                    }}
                  >
                    <IconDots size={16} />
                  </span>
                  {menuFor === chat.id && (
                    <div className="menu-pop" ref={menuRef} onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => {
                          setMenuFor(null)
                          props.onRenameChat(chat)
                        }}
                      >
                        <IconPencil size={15} /> Rename
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          setMenuFor(null)
                          props.onDeleteChat(chat)
                        }}
                      >
                        <IconTrash size={15} /> Delete
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sidebar-footer">
          <button className="settings-btn" onClick={props.onOpenSettings}>
            <IconGear size={17} />
            Settings
          </button>
        </div>
      </aside>
      <div className={`scrim${props.open ? ' show' : ''}`} onClick={props.onCloseMobile} />
    </>
  )
}

export { IconX }
