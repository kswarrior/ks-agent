import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import type { Skill, Project, FileEntry, MCPServer, MCPTransport } from '../types'
import { useDialogs } from '../dialogs'
import { useToast } from '../toast'
import {
  IconChevronLeft,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
  IconFolder,
  IconFile,
  IconMCP,
  IconLSP,
  IconPlug,
  IconSparkles
} from '../icons'

interface Props {
  open: boolean
  onClose: () => void
}

type Tab = 'mcp' | 'lsp' | 'plugins' | 'skills'

export function ExtensionsModal({ open, onClose }: Props) {
  const [tab, setTab] = useState<Tab>('mcp')
  const [error, setError] = useState<string | null>(null)

  // --- Skills state (migrated from SettingsModal) ---
  const [skills, setSkills] = useState<Skill[]>([])
  const [showSkillForm, setShowSkillForm] = useState(false)
  const [skillForm, setSkillForm] = useState({ name: '', note: '', mainFile: '', files: [] as string[], projectId: '' })
  const [skillEdit, setSkillEdit] = useState<Skill | null>(null)
  const [skillEditForm, setSkillEditForm] = useState({ name: '', note: '', mainFile: '', files: [] as string[], projectId: '' })
  const [skillFileBrowserOpen, setSkillFileBrowserOpen] = useState(false)
  const [skillFileBrowserProject, setSkillFileBrowserProject] = useState<string | null>(null)
  const [skillProjects, setSkillProjects] = useState<Project[]>([])
  const [skillPickerDir, setSkillPickerDir] = useState('')
  const [skillPickerEntries, setSkillPickerEntries] = useState<FileEntry[]>([])
  const [skillPickerLoading, setSkillPickerLoading] = useState(false)

  // --- MCP state ---
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([])
  const [mcpLoading, setMcpLoading] = useState(false)
  const [showMcpForm, setShowMcpForm] = useState(false)
  const [mcpForm, setMcpForm] = useState<{ name: string; transport: MCPTransport; command: string; args: string; url: string; envText: string; headersText: string; projectId: string; enabled: boolean }>({ name: '', transport: 'stdio', command: '', args: '', url: '', envText: '', headersText: '', projectId: '', enabled: true })
  const [mcpEdit, setMcpEdit] = useState<MCPServer | null>(null)
  const [mcpEditForm, setMcpEditForm] = useState<{ name: string; transport: MCPTransport; command: string; args: string; url: string; envText: string; headersText: string; projectId: string; enabled: boolean }>({ name: '', transport: 'stdio', command: '', args: '', url: '', envText: '', headersText: '', projectId: '', enabled: true })
  const [mcpActionLoading, setMcpActionLoading] = useState<string | null>(null)
  const [mcpExpanded, setMcpExpanded] = useState<Record<string, boolean>>({})
  const [mcpTestResult, setMcpTestResult] = useState<Record<string, { ok: boolean; error?: string; tools?: { name: string; description?: string }[] }>>({})
  const confirm = useDialogs().confirm
  const toast = useToast()
  const tabsRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ active: boolean; startX: number; startScrollLeft: number; moved: boolean } | null>(null)

  function handleTabsWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const el = e.currentTarget
      if (el.scrollWidth > el.clientWidth) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
  }
  function handleTabsPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth) return
    dragRef.current = { active: true, startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false }
    el.setPointerCapture(e.pointerId)
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'
  }
  function handleTabsPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const el = e.currentTarget
    if (!drag?.active) return
    const dx = e.clientX - drag.startX
    if (Math.abs(dx) > 2) drag.moved = true
    el.scrollLeft = drag.startScrollLeft - dx
  }
  function handleTabsPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const drag = dragRef.current
    dragRef.current = null
    el.style.cursor = ''
    el.style.userSelect = ''
    try { el.releasePointerCapture(e.pointerId) } catch {}
    if (drag?.moved) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  useEffect(() => {
    if (open) {
      loadSkills()
      loadMcpServers()
      setError(null)
      setShowSkillForm(false)
      setSkillFileBrowserOpen(false)
      setSkillEdit(null)
      setSkillPickerDir('')
      setSkillPickerEntries([])
      setShowMcpForm(false)
      setMcpEdit(null)
      setMcpExpanded({})
      setMcpTestResult({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open && tab === 'mcp') loadMcpServers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  async function loadSkills() {
    try {
      const list = await api.listSkills()
      setSkills(list)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function submitSkill() {
    setError(null)
    const name = skillForm.name.trim()
    const note = skillForm.note.trim()
    const mainFile = skillForm.mainFile.trim()
    if (!name) return setError('Skill name is required')
    if (name.length < 2 || name.length > 80) return setError('Skill name must be 2-80 characters')
    if (note.length > 500) return setError('Note must be ≤500 characters')
    if (!mainFile) return setError('Main file is required')
    if (!mainFile.endsWith('.md')) return setError('Main file must be .md')
    if (mainFile.length > 500) return setError('Main file path too long')
    try {
      const payload: { name: string; note: string; mainFile: string; files: string[]; projectId?: string } = { name, note, mainFile, files: [...new Set(skillForm.files.map((f) => f.trim()).filter(Boolean))] }
      if (skillForm.projectId.trim()) payload.projectId = skillForm.projectId.trim()
      else if (skillFileBrowserProject) payload.projectId = skillFileBrowserProject
      await api.createSkill(payload)
      toast('Skill added', 'success')
      setSkillForm({ name: '', note: '', mainFile: '', files: [], projectId: '' })
      setShowSkillForm(false)
      setSkillFileBrowserOpen(false)
      setSkillPickerDir('')
      await loadSkills()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function submitEditSkill() {
    if (!skillEdit) return
    setError(null)
    const name = skillEditForm.name.trim()
    const note = skillEditForm.note.trim()
    const mainFile = skillEditForm.mainFile.trim()
    if (!name) return setError('Skill name is required')
    if (name.length < 2 || name.length > 80) return setError('Skill name must be 2-80 characters')
    if (note.length > 500) return setError('Note must be ≤500 characters')
    if (!mainFile) return setError('Main file is required')
    if (!mainFile.endsWith('.md')) return setError('Main file must be .md')
    if (mainFile.length > 500) return setError('Main file path too long')
    try {
      const payload: Partial<{ name: string; note: string; mainFile: string; files: string[]; projectId: string }> = {
        name, note, mainFile, files: [...new Set(skillEditForm.files.map((f) => f.trim()).filter(Boolean))]
      }
      if (skillEditForm.projectId.trim()) payload.projectId = skillEditForm.projectId.trim()
      else payload.projectId = ''
      await api.updateSkill(skillEdit.id, payload as any)
      toast('Skill updated', 'success')
      setSkillEdit(null)
      await loadSkills()
    } catch (e: any) {
      setError(e.message)
    }
  }

  function startEditSkill(s: Skill) {
    setSkillEdit(s)
    setSkillEditForm({ name: s.name, note: s.note, mainFile: s.mainFile, files: [...s.files], projectId: s.projectId ?? '' })
    setShowSkillForm(false)
    setError(null)
    setSkillFileBrowserOpen(false)
    if (s.projectId) setSkillFileBrowserProject(s.projectId)
  }

  async function removeSkill(id: string) {
    const ok = await confirm({ title: 'Delete skill?', message: 'This skill will be permanently removed.', danger: true, confirmText: 'Delete' })
    if (!ok) return
    try {
      await api.deleteSkill(id)
      toast('Skill deleted', 'success')
      if (skillEdit?.id === id) setSkillEdit(null)
      await loadSkills()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function loadSkillProjects() {
    try {
      const list = await api.listProjects()
      setSkillProjects(list)
      if (list.length > 0 && !skillFileBrowserProject) setSkillFileBrowserProject(list[0].id)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function refreshSkillPicker() {
    if (!skillFileBrowserProject) {
      setSkillPickerEntries([])
      return
    }
    setSkillPickerLoading(true)
    try {
      const listing = await api.listFiles(skillFileBrowserProject, skillPickerDir)
      setSkillPickerEntries(listing.entries)
    } catch (e: any) {
      toast(e.message, 'error')
      setSkillPickerEntries([])
    } finally {
      setSkillPickerLoading(false)
    }
  }

  useEffect(() => {
    if (skillFileBrowserOpen && skillProjects.length === 0) {
      loadSkillProjects()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillFileBrowserOpen])

  useEffect(() => {
    if (skillFileBrowserOpen && skillFileBrowserProject) {
      refreshSkillPicker()
    }
    if (!skillFileBrowserOpen) {
      setSkillPickerEntries([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillFileBrowserProject, skillPickerDir, skillFileBrowserOpen])

  useEffect(() => {
    if (open && tab === 'skills' && skillProjects.length === 0) {
      loadSkillProjects()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab])

  if (!open) return null

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">Extensions</h3>
          <button className="icon-btn" aria-label="Close extensions" onClick={onClose}>
            <IconX size={18} />
          </button>
        </div>

        <div
          ref={tabsRef}
          className="tabs"
          onWheel={handleTabsWheel}
          onPointerDown={handleTabsPointerDown}
          onPointerMove={handleTabsPointerMove}
          onPointerUp={handleTabsPointerUp}
          onPointerLeave={handleTabsPointerUp}
        >
          <button
            className={`tab${tab === 'mcp' ? ' active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={(e) => {
              if (dragRef.current?.moved) return
              setTab('mcp')
              setError(null)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
            }}
          >
            <IconMCP size={14} /> MCP
          </button>
          <button
            className={`tab${tab === 'lsp' ? ' active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={(e) => {
              if (dragRef.current?.moved) return
              setTab('lsp')
              setError(null)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
            }}
          >
            <IconLSP size={14} /> LSP
          </button>
          <button
            className={`tab${tab === 'plugins' ? ' active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={(e) => {
              if (dragRef.current?.moved) return
              setTab('plugins')
              setError(null)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
            }}
          >
            <IconPlug size={14} /> Plugins
          </button>
          <button
            className={`tab${tab === 'skills' ? ' active' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={(e) => {
              if (dragRef.current?.moved) return
              setTab('skills')
              setError(null)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
            }}
          >
            <IconSparkles size={14} /> Skills
          </button>
        </div>

        <div className="tab-body">
          {error && <p className="field-error" style={{ marginBottom: 10 }}>{error}</p>}

          {tab === 'mcp' && (
            <div className="inline-form" style={{ marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconMCP size={16} /> MCP Servers</h4>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 99, padding: '3px 8px' }}>Coming soon</span>
              </div>
              <p className="hint" style={{ marginBottom: 16 }}>
                Model Context Protocol servers extend the agent with external tools and data sources. Connect MCP servers to give the agent access to databases, APIs, and custom tooling.
              </p>
              <div className="empty" style={{ padding: '32px 12px', border: '1px dashed var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
                  <IconMCP size={20} />
                </div>
                <h2>No MCP servers</h2>
                <p>MCP support is under development. Soon you&apos;ll be able to add servers here (stdio / SSE / WebSocket).</p>
              </div>
              <div style={{ marginTop: 16, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>What you&apos;ll be able to do</div>
                <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text-faint)', fontSize: 13, lineHeight: 1.6 }}>
                  <li>Add MCP servers via command, URL, or config</li>
                  <li>View server status and available tools</li>
                  <li>Enable/disable servers per project</li>
                </ul>
              </div>
            </div>
          )}

          {tab === 'lsp' && (
            <div className="inline-form" style={{ marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconLSP size={16} /> Language Servers</h4>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 99, padding: '3px 8px' }}>Coming soon</span>
              </div>
              <p className="hint" style={{ marginBottom: 16 }}>
                Language Server Protocol integrations provide smarter code intelligence — autocomplete, diagnostics, go-to-definition, and hover docs inside the agent&apos;s editor.
              </p>
              <div className="empty" style={{ padding: '32px 12px', border: '1px dashed var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
                  <IconLSP size={20} />
                </div>
                <h2>No language servers</h2>
                <p>LSP support is under development. You&apos;ll be able to configure servers per language here.</p>
              </div>
              <div style={{ marginTop: 16, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Planned languages</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['TypeScript', 'Python', 'Go', 'Rust', 'CSS', 'JSON'].map((lang) => (
                    <span key={lang} style={{ fontSize: 11, padding: '4px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 99, color: 'var(--text-faint)' }}>{lang}</span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === 'plugins' && (
            <div className="inline-form" style={{ marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconPlug size={16} /> Plugins</h4>
                <span style={{ fontSize: 11, color: 'var(--text-faint)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 99, padding: '3px 8px' }}>Coming soon</span>
              </div>
              <p className="hint" style={{ marginBottom: 16 }}>
                Plugins extend KS Agent with new commands and UI. Install from the marketplace or load local plugins during development.
              </p>
              <div className="empty" style={{ padding: '32px 12px', border: '1px dashed var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
                  <IconPlug size={20} />
                </div>
                <h2>No plugins installed</h2>
                <p>Plugin marketplace is under development. You&apos;ll be able to browse and install plugins here.</p>
              </div>
              <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
                <button className="btn" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>Browse marketplace</button>
                <button className="btn" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>Install from path</button>
              </div>
            </div>
          )}

          {tab === 'skills' && (
            <div className="inline-form" style={{ marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconSparkles size={16} /> Skills ({skills.length})</h4>
                <button className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { if (skillEdit) { setSkillEdit(null); setError(null) } else { setShowSkillForm(v => !v); setError(null); if (!showSkillForm && skillProjects.length === 0) loadSkillProjects() } }}>
                  <IconPlus size={15} /> {skillEdit ? 'Cancel edit' : showSkillForm ? 'Cancel' : 'Add'}
                </button>
              </div>
              <p className="hint" style={{ marginBottom: 16 }}>Skills are reusable instruction packs. Each skill has a name, a short note, a main .md file and an optional list of additional files. They are automatically injected into the agent&apos;s context on every message — no manual loading needed.</p>

              {skillEdit && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16, background: 'var(--surface)', borderLeft: '3px solid #519aba' }}>
                  <h4 style={{ marginBottom: 12 }}>Edit skill</h4>
                  <label className="field-label">Name</label>
                  <input className="input" placeholder="e.g. My Skill" value={skillEditForm.name} onChange={e => setSkillEditForm({ ...skillEditForm, name: e.target.value })} />
                  <label className="field-label">Note <span style={{ fontWeight: 400 }}>(short about skill)</span></label>
                  <input className="input" placeholder="Short description" value={skillEditForm.note} onChange={e => setSkillEditForm({ ...skillEditForm, note: e.target.value })} />
                  <label className="field-label">Source project <span style={{ fontWeight: 400 }}>(where files live)</span></label>
                  <select className="input" value={skillEditForm.projectId} onChange={e => setSkillEditForm({ ...skillEditForm, projectId: e.target.value })}>
                    <option value="">No specific project (use active chat project)</option>
                    {skillProjects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.path}</option>)}
                    {skillProjects.length === 0 && <option value="" disabled>No projects — create one first</option>}
                  </select>
                  <label className="field-label">Main file <span style={{ fontWeight: 400 }}>(must be .md)</span></label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input" placeholder="e.g. skill.md or path/to/skill.md" value={skillEditForm.mainFile} onChange={e => setSkillEditForm({ ...skillEditForm, mainFile: e.target.value })} style={{ flex: 1 }} />
                    <button className="btn" onClick={() => {
                      if (skillEditForm.projectId) setSkillFileBrowserProject(skillEditForm.projectId)
                      else if (!skillFileBrowserProject && skillProjects.length > 0) setSkillFileBrowserProject(skillProjects[0].id)
                      setSkillFileBrowserOpen(v => !v)
                      if (!skillFileBrowserOpen && skillProjects.length === 0) loadSkillProjects()
                    }} title="Browse files">{skillFileBrowserOpen ? 'Hide' : 'Browse'}</button>
                  </div>
                  {skillEditForm.mainFile && !skillEditForm.mainFile.endsWith('.md') && <p className="field-error">Main file must be .md</p>}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label className="field-label" style={{ margin: 0 }}>Files</label>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{skillEditForm.files.length}/20</span>
                    </div>
                    {skillEditForm.files.length === 0 ? (
                      <p className="hint">No files added yet. Use file browser below to pick files.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {skillEditForm.files.map((f, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
                            <IconFile size={14} style={{ flexShrink: 0, color: 'var(--text-faint)' }} />
                            <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f}</span>
                            <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setSkillEditForm({ ...skillEditForm, files: skillEditForm.files.filter((_, i) => i !== idx) })} aria-label="Remove file"><IconTrash size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {skillFileBrowserOpen && (
                    <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)' }}>
                      <div style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <IconFolder size={14} style={{ color: 'var(--text-faint)' }} />
                        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Project</span>
                        <select className="input" style={{ flex: 1, minWidth: 140, height: 30, padding: '4px 8px', fontSize: 13 }} value={skillFileBrowserProject ?? ''} onChange={e => { setSkillFileBrowserProject(e.target.value); setSkillPickerDir('') }}>
                          {skillProjects.length === 0 && <option value="">No projects</option>}
                          {skillProjects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.path}</option>)}
                        </select>
                        <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={refreshSkillPicker}>Refresh</button>
                      </div>
                      <div style={{ padding: 8 }}>
                        <div className="fp-path" style={{ marginBottom: 6 }}>{skillPickerDir === '' ? '/' : skillPickerDir}</div>
                        {skillPickerLoading ? (
                          <div className="hint" style={{ padding: 12 }}>Loading…</div>
                        ) : (
                          <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {skillPickerDir !== '' && (
                              <button className="fp-row" style={{ justifyContent: 'flex-start' }} onClick={() => setSkillPickerDir(d => d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '')}>
                                <IconChevronLeft size={14} /> <span>..</span>
                              </button>
                            )}
                            {skillPickerEntries.length === 0 && <div className="hint" style={{ padding: 8 }}>No files</div>}
                            {skillPickerEntries.map(ent => {
                              const rel = skillPickerDir ? `${skillPickerDir}/${ent.name}` : ent.name
                              const isDir = ent.type === 'dir'
                              return (
                                <div key={ent.name} className="fp-row" style={{ cursor: isDir ? 'pointer' : 'default' }} onClick={() => { if (isDir) { setSkillPickerDir(rel) } }}>
                                  {isDir ? <IconFolder size={14} style={{ color: '#dcad3c' }} /> : <IconFile size={14} style={{ color: ent.name.endsWith('.md') ? '#519aba' : 'var(--text-faint)' }} />}
                                  <span className="fp-name" title={rel}>{ent.name}</span>
                                  {ent.type === 'file' && (
                                    <span style={{ display: 'inline-flex', gap: 4 }}>
                                      {ent.name.endsWith('.md') && <button className="btn" style={{ padding: '2px 6px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setSkillEditForm({ ...skillEditForm, mainFile: rel, projectId: skillFileBrowserProject ?? skillEditForm.projectId }); toast('Main file set', 'success') }}>Set main</button>}
                                      <button className="btn" style={{ padding: '2px 6px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); if (!skillEditForm.files.includes(rel)) { setSkillEditForm({ ...skillEditForm, files: [...skillEditForm.files, rel], projectId: skillFileBrowserProject ?? skillEditForm.projectId }); toast('Added', 'success') } else toast('Already added', 'error') }}>Add</button>
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="dialog-actions" style={{ marginTop: 16 }}>
                    <button className="btn" onClick={() => { setSkillEdit(null); setSkillFileBrowserOpen(false); setError(null) }}>Cancel</button>
                    <button className="btn btn-primary" onClick={submitEditSkill}>Save</button>
                  </div>
                </div>
              )}

              {showSkillForm && !skillEdit && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16, background: 'var(--surface)' }}>
                  <label className="field-label">Name</label>
                  <input className="input" placeholder="e.g. My Skill" value={skillForm.name} onChange={e => setSkillForm({ ...skillForm, name: e.target.value })} />

                  <label className="field-label">Note <span style={{ fontWeight: 400 }}>(short about skill)</span></label>
                  <input className="input" placeholder="Short description" value={skillForm.note} onChange={e => setSkillForm({ ...skillForm, note: e.target.value })} />

                  <label className="field-label">Source project <span style={{ fontWeight: 400 }}>(where files live)</span></label>
                  <select className="input" value={skillForm.projectId} onChange={e => setSkillForm({ ...skillForm, projectId: e.target.value })}>
                    <option value="">No specific project (use active chat project)</option>
                    {skillProjects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.path}</option>)}
                  </select>
                  <p className="hint" style={{ marginTop: 4 }}>Pick the project that contains the main file and additional files below.</p>

                  <label className="field-label">Main file <span style={{ fontWeight: 400 }}>(must be .md)</span></label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input" placeholder="e.g. skill.md or path/to/skill.md" value={skillForm.mainFile} onChange={e => setSkillForm({ ...skillForm, mainFile: e.target.value })} style={{ flex: 1 }} />
                    <button className="btn" onClick={() => {
                      const pid = skillForm.projectId || skillFileBrowserProject || skillProjects[0]?.id
                      if (pid) setSkillFileBrowserProject(pid)
                      setSkillFileBrowserOpen(v => !v)
                      if (!skillFileBrowserOpen && skillProjects.length === 0) loadSkillProjects()
                    }} title="Browse files">{skillFileBrowserOpen ? 'Hide' : 'Browse'}</button>
                  </div>
                  {skillForm.mainFile && !skillForm.mainFile.endsWith('.md') && <p className="field-error">Main file must be .md</p>}

                  <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <label className="field-label" style={{ margin: 0 }}>Files</label>
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{skillForm.files.length}/20</span>
                    </div>

                    {skillForm.files.length === 0 ? (
                      <p className="hint">No files added yet. Use “Browse” above to pick files from the selected project.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {skillForm.files.map((f, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
                            <IconFile size={14} style={{ flexShrink: 0, color: 'var(--text-faint)' }} />
                            <span style={{ flex: 1, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f}</span>
                            <button className="icon-btn" style={{ width: 26, height: 26 }} onClick={() => setSkillForm({ ...skillForm, files: skillForm.files.filter((_, i) => i !== idx) })} aria-label="Remove file"><IconTrash size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}

                    {skillFileBrowserOpen && (
                      <div style={{ marginTop: 12, border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: 'var(--surface-2)' }}>
                        <div style={{ padding: 8, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <IconFolder size={14} style={{ color: 'var(--text-faint)' }} />
                          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Project</span>
                          <select className="input" style={{ flex: 1, minWidth: 140, height: 30, padding: '4px 8px', fontSize: 13 }} value={skillFileBrowserProject ?? ''} onChange={e => { setSkillFileBrowserProject(e.target.value); setSkillPickerDir('') }}>
                            {skillProjects.length === 0 && <option value="">No projects</option>}
                            {skillProjects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.path}</option>)}
                          </select>
                          <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={refreshSkillPicker}>Refresh</button>
                        </div>

                        <div style={{ padding: 8 }}>
                          <div className="fp-path" style={{ marginBottom: 6 }}>{skillPickerDir === '' ? '/' : skillPickerDir}</div>
                          {skillPickerLoading ? (
                            <div className="hint" style={{ padding: 12 }}>Loading…</div>
                          ) : (
                            <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                              {skillPickerDir !== '' && (
                                <button className="fp-row" style={{ justifyContent: 'flex-start' }} onClick={() => setSkillPickerDir(d => d.includes('/') ? d.slice(0, d.lastIndexOf('/')) : '')}>
                                  <IconChevronLeft size={14} /> <span>..</span>
                                </button>
                              )}
                              {skillPickerEntries.length === 0 && <div className="hint" style={{ padding: 8 }}>No files</div>}
                              {skillPickerEntries.map(ent => {
                                const rel = skillPickerDir ? `${skillPickerDir}/${ent.name}` : ent.name
                                const isDir = ent.type === 'dir'
                                return (
                                  <div key={ent.name} className="fp-row" style={{ cursor: isDir ? 'pointer' : 'default' }} onClick={() => { if (isDir) { setSkillPickerDir(rel) } }}>
                                    {isDir ? <IconFolder size={14} style={{ color: '#dcad3c' }} /> : <IconFile size={14} style={{ color: ent.name.endsWith('.md') ? '#519aba' : 'var(--text-faint)' }} />}
                                    <span className="fp-name" title={rel}>{ent.name}</span>
                                    {ent.type === 'file' && (
                                      <span style={{ display: 'inline-flex', gap: 4 }}>
                                        {ent.name.endsWith('.md') && <button className="btn" style={{ padding: '2px 6px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); setSkillForm({ ...skillForm, mainFile: rel, projectId: skillFileBrowserProject ?? skillForm.projectId }); toast('Main file set', 'success') }}>Set main</button>}
                                        <button className="btn" style={{ padding: '2px 6px', fontSize: 11 }} onClick={(e) => { e.stopPropagation(); if (!skillForm.files.includes(rel)) { setSkillForm({ ...skillForm, files: [...skillForm.files, rel], projectId: skillFileBrowserProject ?? skillForm.projectId }); toast('Added', 'success') } else toast('Already added', 'error') }}>Add</button>
                                      </span>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                          <p className="hint" style={{ marginTop: 8 }}>Click a folder to enter, “..” to go up, “Set main” for the .md main file, “Add” to append to the files list.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="dialog-actions" style={{ marginTop: 16 }}>
                    <button className="btn" onClick={() => { setShowSkillForm(false); setSkillFileBrowserOpen(false); setSkillForm({ name: '', note: '', mainFile: '', files: [], projectId: '' }); setSkillPickerDir(''); setError(null) }}>Cancel</button>
                    <button className="btn btn-primary" onClick={submitSkill}>Add skill</button>
                  </div>
                </div>
              )}

              {skills.length === 0 ? (
                <div className="empty" style={{ padding: '24px 12px' }}>
                  <h2>No skills yet</h2>
                  <p>Create a skill with a name, note, main .md file and optional additional files. Skills are injected into every agent run.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {skills.map(s => {
                    const projName = s.projectId ? skillProjects.find(p => p.id === s.projectId)?.name ?? s.projectId.slice(0, 8) : null
                    return (
                    <div key={s.id} className="provider-card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, flex: 1 }}>{s.name}</span>
                        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => startEditSkill(s)} aria-label={`Edit ${s.name}`}><IconPencil size={14} /></button>
                        <button className="icon-btn" style={{ width: 28, height: 28, color: '#ef4444' }} onClick={() => removeSkill(s.id)} aria-label={`Delete ${s.name}`}><IconTrash size={14} /></button>
                      </div>
                      {s.note && <div style={{ color: 'var(--text-dim)', fontSize: 13 }}>{s.note}</div>}
                      {projName && <div style={{ fontSize: 11, color: 'var(--text-faint)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconFolder size={12} /> Project: {projName}</div>}
                      <div style={{ fontSize: 12, color: 'var(--text-faint)', fontFamily: 'ui-monospace, monospace' }}>Main: {s.mainFile}</div>
                      {s.files.length > 0 && (
                        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                          <div style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)', marginBottom: 4 }}>Files ({s.files.length})</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {s.files.map((f, i) => <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconFile size={12} /> {f}</span>)}
                          </div>
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{new Date(s.createdAt).toLocaleString()}{s.updatedAt && s.updatedAt !== s.createdAt ? ` · updated ${new Date(s.updatedAt).toLocaleString()}` : ''}</div>
                    </div>
                  )})}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
