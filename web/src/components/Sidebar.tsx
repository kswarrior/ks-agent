import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  onRenameProject: (project: Project) => void
  onDeleteProject: (project: Project) => void
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

interface MenuState {
  kind: 'chat' | 'project'
  id: string
  top: number
  left: number
}

export function Sidebar(props: SidebarProps) {
  const [projOpen, setProjOpen] = useState(false)
  const [projQuery, setProjQuery] = useState('')
  const [chatQuery, setChatQuery] = useState('')
  const [menuFor, setMenuFor] = useState<MenuState | null>(null)

  const ddRef = useClickOutside(() => setProjOpen(false))

  useEffect(() => {
    if (!menuFor) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (!t || !t.closest('[data-row-menu]')) setMenuFor(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuFor(null)
    }
    const dismiss = () => setMenuFor(null)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [menuFor])

  function toggleMenu(e: React.MouseEvent<HTMLSpanElement>, kind: MenuState['kind'], id: string) {
    e.stopPropagation()
    if (menuFor?.kind === kind && menuFor.id === id) {
      setMenuFor(null)
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    const width = 150
    const height = 96
    setMenuFor({
      kind,
      id,
      top: Math.min(rect.bottom + 6, window.innerHeight - height - 8),
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    })
  }

  const menuChat = menuFor?.kind === 'chat' ? props.chats.find((c) => c.id === menuFor.id) ?? null : null
  const menuProject =
    menuFor?.kind === 'project' ? props.projects.find((p) => p.id === menuFor.id) ?? null : null

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
                  <div
                    key={p.id}
                    className={`dd-item${props.activeProject?.id === p.id ? ' active' : ''}${menuFor?.kind === 'project' && menuFor.id === p.id ? ' menu-open' : ''}`}
                    onClick={() => {
                      props.onSelectProject(p.id)
                      setProjOpen(false)
                      setProjQuery('')
                    }}
                  >
                    <IconFolder size={15} />
                    <span>{p.name}</span>
                    <span
                      className="icon-btn row-menu"
                      role="button"
                      aria-label="Project options"
                      data-row-menu="trigger"
                      style={{ width: 28, height: 28 }}
                      onClick={(e) => toggleMenu(e, 'project', p.id)}
                    >
                      <IconDots size={16} />
                    </span>
                  </div>
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
                  className={`chat-row${props.activeChatId === chat.id ? ' active' : ''}${menuFor?.id === chat.id ? ' menu-open' : ''}`}
                  onClick={() => props.onSelectChat(chat.id)}
                >
                  <IconChat size={15} />
                  {chat.seq != null && <span className="chat-num">#{chat.seq}</span>}
                  <span className="chat-title" title={`#${chat.seq ?? ''} ${chat.title}`.trim()}>{chat.title}</span>
                  <span
                    className="icon-btn row-menu"
                    role="button"
                    aria-label="Chat options"
                    data-row-menu="trigger"
                    style={{ width: 28, height: 28 }}
                    onClick={(e) => toggleMenu(e, 'chat', chat.id)}
                  >
                    <IconDots size={16} />
                  </span>
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
      {menuFor && menuProject &&
        createPortal(
          <div
            className="menu-pop menu-pop-fixed"
            data-row-menu="popover"
            style={{ top: menuFor.top, left: menuFor.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setMenuFor(null)
                props.onRenameProject(menuProject)
              }}
            >
              <IconPencil size={15} /> Rename
            </button>
            <button
              className="danger"
              onClick={() => {
                setMenuFor(null)
                props.onDeleteProject(menuProject)
              }}
            >
              <IconTrash size={15} /> Delete
            </button>
          </div>,
          document.body
        )}
      {menuFor && menuChat &&
        createPortal(
          <div
            className="menu-pop menu-pop-fixed"
            data-row-menu="popover"
            style={{ top: menuFor.top, left: menuFor.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                setMenuFor(null)
                props.onRenameChat(menuChat)
              }}
            >
              <IconPencil size={15} /> Rename
            </button>
            <button
              className="danger"
              onClick={() => {
                setMenuFor(null)
                props.onDeleteChat(menuChat)
              }}
            >
              <IconTrash size={15} /> Delete
            </button>
          </div>,
          document.body
        )}
    </>
  )
}

export { IconX }
