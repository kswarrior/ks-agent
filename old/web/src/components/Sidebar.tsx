import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Chat, Project } from '../types'
import * as api from '../api'
import type { SemanticHit } from '../api'
import {
  IconChat,
  IconChevronDown,
  IconDots,
  IconFolder,
  IconGear,
  IconPencil,
  IconPlus,
  IconSearch,
  IconTrash
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
  const cbRef = useRef(onOutside)
  useEffect(() => { cbRef.current = onOutside }, [onOutside])
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) cbRef.current()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])
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
  // Semantic search (hybrid grep+TF-IDF) — server/src/store.ts:embeddings + server/src/agent.ts:semantic_search
  const [semanticEnabled, setSemanticEnabled] = useState(false)
  const [semanticQuery, setSemanticQuery] = useState('')
  const [semanticHits, setSemanticHits] = useState<SemanticHit[] | null>(null)
  const [semanticLoading, setSemanticLoading] = useState(false)
  const [semanticMeta, setSemanticMeta] = useState<{ embeddingCount: number; fallback: boolean } | null>(null)
  const semanticDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const projWrapRef = useClickOutside(() => setProjOpen(false))

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

  // Hybrid semantic search effect (debounced, hostile-input validated server-side)
  useEffect(() => {
    if (!semanticEnabled) {
      setSemanticHits(null)
      setSemanticMeta(null)
      return
    }
    const q = semanticQuery.trim()
    if (!q || q.length < 2) {
      setSemanticHits(null)
      setSemanticMeta(null)
      return
    }
    if (!props.activeProject) {
      setSemanticHits(null)
      return
    }
    if (semanticDebounceRef.current) clearTimeout(semanticDebounceRef.current)
    semanticDebounceRef.current = setTimeout(async () => {
      setSemanticLoading(true)
      try {
        const res = await api.semanticSearch(props.activeProject!.id, q, { limit: 12 })
        setSemanticHits(res.hits)
        setSemanticMeta({ embeddingCount: res.embeddingCount, fallback: res.fallback })
      } catch {
        setSemanticHits([])
        setSemanticMeta(null)
      } finally {
        setSemanticLoading(false)
      }
    }, 320)
    return () => {
      if (semanticDebounceRef.current) clearTimeout(semanticDebounceRef.current)
    }
  }, [semanticEnabled, semanticQuery, props.activeProject])

  return (
    <>
      <aside className={`sidebar${props.open ? ' open' : ''}`}>
        {/* Project selector */}
        <div className="sidebar-section proj-wrap" ref={projWrapRef}>
          <div className="section-label">Project</div>
          <button className="proj-btn" onClick={() => setProjOpen((v) => !v)}>
            <IconFolder size={16} />
            <span className="proj-name">{props.activeProject ? props.activeProject.name : 'Select project'}</span>
            <IconChevronDown size={15} />
          </button>

          {projOpen && (
            <div className="dropdown">
              <div className="dd-toolbar">
                <div className="search-box">
                  <IconSearch size={14} />
                  <input
                    className="search-input"
                    placeholder="Search projects…"
                    aria-label="Search projects"
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
                  aria-label="Search chats"
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
          {/* Code Search — Semantic hybrid (server/src/store.ts:embeddings) */}
          <div className="sidebar-section semantic-section" style={{ paddingTop: 8, borderTop: '1px solid var(--border)', marginTop: 12 }}>
            <div className="section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>
              <span>Code Search</span>
              <label className="semantic-toggle" title="Vector+hybrid search (20k vector+BM25+grep sqlite-vec/HNSW, FLOAT32[384/768] per CHUNK 400-600 tokens 100 overlap, OpenAI text-embedding-3-small / Ollama nomic-embed-text / local fallback, 0.5*vector+0.3*BM25+0.2*grep)">
                <input type="checkbox" checked={semanticEnabled} onChange={(e) => setSemanticEnabled(e.target.checked)} disabled={!props.activeProject} />
                <span>Semantic</span>
              </label>
            </div>
            <div className="search-box" style={{ marginTop: 4 }}>
              <IconSearch size={14} />
              <input
                className="search-input"
                placeholder={semanticEnabled ? 'Semantic: e.g. auth logic, payment…' : 'Enable Semantic to search codebase…'}
                aria-label="Semantic code search"
                value={semanticQuery}
                onChange={(e) => setSemanticQuery(e.target.value)}
                disabled={!props.activeProject || !semanticEnabled}
              />
              {semanticLoading && <span className="semantic-loading" aria-label="Searching">…</span>}
            </div>
            {semanticEnabled && props.activeProject && (
              <div className="semantic-results">
                {semanticQuery.trim().length >= 2 && semanticHits !== null && semanticHits.length === 0 && !semanticLoading && (
                  <div className="dd-empty">No hits — try grep query or broader terms</div>
                )}
                {semanticHits && semanticHits.length > 0 && (
                  <>
                    <div className="semantic-meta">
                      {semanticMeta?.fallback ? 'grep fallback (no embeddings yet — vector+BM25 pending)' : `vector+hybrid — ${semanticMeta?.embeddingCount ?? 0} chunks (vector 0.5 + BM25 0.3 + grep 0.2)`}
                      <button
                        className="btn btn-xs"
                        title="Rebuild semantic index for this project (stores TF-IDF vectors in SQLite)"
                        onClick={async () => {
                          if (!props.activeProject) return
                          try {
                            await api.rebuildSemanticIndex(props.activeProject.id)
                            const q = semanticQuery.trim()
                            if (q) {
                              const r = await api.semanticSearch(props.activeProject.id, q, { limit: 12 })
                              setSemanticHits(r.hits)
                              setSemanticMeta({ embeddingCount: r.embeddingCount, fallback: r.fallback })
                            }
                          } catch {}
                        }}
                        style={{ marginLeft: 6 }}
                      >
                        Index
                      </button>
                    </div>
                    <div className="semantic-list">
                      {semanticHits.map((hit, idx) => (
                        <div key={`${hit.path}:${idx}`} className="semantic-hit" title={hit.snippet ?? hit.path}>
                          <div className="semantic-hit-path" style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <span className="semantic-hit-score" style={{ minWidth:36, fontWeight:600 }}>{hit.score.toFixed(2)}</span>
                            <span className={`semantic-hit-source badge-${hit.source}`} style={{ fontSize:10, padding:'2px 6px', borderRadius:4, background: hit.source==='vector' ? '#2563eb' : hit.source==='hybrid' ? '#0ea5e9' : hit.source==='bm25' ? '#8b5cf6' : hit.source==='grep' ? '#64748b' : '#475569', color:'#fff', textTransform:'uppercase' }}>{hit.source==='vector' ? 'VECTOR' : hit.source==='hybrid' ? 'HYBRID' : hit.source.toUpperCase()}</span>
                            <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{hit.path}</span>
                          </div>
                          <div className="semantic-score-bar" style={{ height:4, background:'var(--border)', borderRadius:2, overflow:'hidden', margin:'4px 0' }}>
                            <div style={{ width: `${Math.max(5, Math.min(100, hit.score*100))}%`, height:'100%', background: hit.source==='vector' ? '#2563eb' : hit.source==='hybrid' ? 'linear-gradient(90deg,#2563eb,#0ea5e9)' : hit.source==='bm25' ? '#8b5cf6' : '#64748b', backgroundColor: hit.source==='vector' ? '#2563eb' : undefined }} />
                          </div>
                          {hit.snippet && <div className="semantic-hit-snippet" style={{ fontSize:12, color:'var(--text-dim)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{hit.snippet.slice(0, 140)}</div>}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {semanticEnabled && !semanticQuery.trim() && (
                  <div className="dd-empty" style={{ fontSize: 12 }}>
                    Vector+hybrid search — 20k vector+BM25+grep via sqlite-vec/HNSW, 384-d per CHUNK (500 tokens, 100 overlap), OpenAI/Ollama/local fallback, 5k indexed/20k scanned
                  </div>
                )}
              </div>
            )}
            {!props.activeProject && semanticEnabled && <div className="dd-empty">Select a project first</div>}
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


