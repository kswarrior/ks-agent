import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import type { Skill, Project, FileEntry, MCPServer, MCPTransport, LSPServer, LSPTransport } from '../types'
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

  // --- LSP state ---
  const [lspServers, setLspServers] = useState<LSPServer[]>([])
  const [lspLoading, setLspLoading] = useState(false)
  const [showLspForm, setShowLspForm] = useState(false)
  const [lspForm, setLspForm] = useState<{ name: string; language: string; transport: LSPTransport; command: string; args: string; url: string; envText: string; headersText: string; projectId: string; enabled: boolean }>({ name: '', language: 'typescript', transport: 'stdio', command: '', args: '', url: '', envText: '', headersText: '', projectId: '', enabled: true })
  const [lspEdit, setLspEdit] = useState<LSPServer | null>(null)
  const [lspEditForm, setLspEditForm] = useState<{ name: string; language: string; transport: LSPTransport; command: string; args: string; url: string; envText: string; headersText: string; projectId: string; enabled: boolean }>({ name: '', language: 'typescript', transport: 'stdio', command: '', args: '', url: '', envText: '', headersText: '', projectId: '', enabled: true })
  const [lspActionLoading, setLspActionLoading] = useState<string | null>(null)
  const [lspExpanded, setLspExpanded] = useState<Record<string, boolean>>({})
  const [lspTestResult, setLspTestResult] = useState<Record<string, { ok: boolean; error?: string; capabilities?: Record<string, unknown> }>>({})
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
      loadLspServers()
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
      setShowLspForm(false)
      setLspEdit(null)
      setLspExpanded({})
      setLspTestResult({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open && tab === 'mcp') {
      loadMcpServers()
      if (skillProjects.length === 0) loadSkillProjects()
    }
    if (open && tab === 'lsp') {
      loadLspServers()
      if (skillProjects.length === 0) loadSkillProjects()
    }
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

  // ---- MCP helpers ----
  function parseEnvText(text: string): Record<string, string> | undefined {
    const out: Record<string, string> = {}
    const lines = text.split('\n')
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq === -1) continue
      const k = line.slice(0, eq).trim()
      const v = line.slice(eq + 1).trim()
      if (!k) continue
      if (!/^[A-Z_][A-Z0-9_]*$/i.test(k)) continue
      out[k] = v
    }
    return Object.keys(out).length ? out : undefined
  }
  function parseHeadersText(text: string): Record<string, string> | undefined {
    const out: Record<string, string> = {}
    const lines = text.split('\n')
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const colon = line.indexOf(':')
      if (colon === -1) continue
      const k = line.slice(0, colon).trim()
      const v = line.slice(colon + 1).trim()
      if (!k || !v) continue
      out[k] = v
    }
    return Object.keys(out).length ? out : undefined
  }
  function stringifyEnv(env?: Record<string, string> | null): string {
    if (!env) return ''
    return Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n')
  }
  function stringifyHeaders(h?: Record<string, string> | null): string {
    if (!h) return ''
    return Object.entries(h).map(([k, v]) => `${k}: ${v}`).join('\n')
  }
  async function loadMcpServers() {
    setMcpLoading(true)
    try {
      const list = await api.listMcpServers()
      setMcpServers(list)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setMcpLoading(false)
    }
  }
  async function submitMcp() {
    setError(null)
    const name = mcpForm.name.trim()
    const transport = mcpForm.transport
    if (!name) return setError('MCP server name is required')
    if (name.length < 2 || name.length > 80) return setError('MCP name must be 2-80 characters')
    if (transport === 'stdio') {
      if (!mcpForm.command.trim()) return setError('Command is required for stdio transport')
    } else {
      if (!mcpForm.url.trim()) return setError('URL is required for ' + transport + ' transport')
      try { new URL(mcpForm.url.trim()) } catch { return setError('Invalid URL') }
    }
    const args = mcpForm.args.trim() ? mcpForm.args.split(',').map((s) => s.trim()).filter(Boolean) : undefined
    const env = parseEnvText(mcpForm.envText)
    const headers = parseHeadersText(mcpForm.headersText)
    try {
      await api.createMcpServer({
        name,
        transport,
        command: mcpForm.command.trim() || undefined,
        args,
        url: mcpForm.url.trim() || undefined,
        env,
        headers,
        projectId: mcpForm.projectId.trim() || undefined,
        enabled: mcpForm.enabled
      })
      toast('MCP server added', 'success')
      setShowMcpForm(false)
      setMcpForm({ name: '', transport: 'stdio', command: '', args: '', url: '', envText: '', headersText: '', projectId: '', enabled: true })
      await loadMcpServers()
    } catch (e: any) {
      setError(e.message)
    }
  }
  async function submitEditMcp() {
    if (!mcpEdit) return
    setError(null)
    const name = mcpEditForm.name.trim()
    const transport = mcpEditForm.transport
    if (!name) return setError('MCP server name is required')
    if (transport === 'stdio') {
      if (!mcpEditForm.command.trim()) return setError('Command is required for stdio transport')
    } else {
      if (!mcpEditForm.url.trim()) return setError('URL is required for ' + transport + ' transport')
      try { new URL(mcpEditForm.url.trim()) } catch { return setError('Invalid URL') }
    }
    const args = mcpEditForm.args.trim() ? mcpEditForm.args.split(',').map((s) => s.trim()).filter(Boolean) : []
    const env = parseEnvText(mcpEditForm.envText)
    const headers = parseHeadersText(mcpEditForm.headersText)
    try {
      await api.updateMcpServer(mcpEdit.id, {
        name,
        transport,
        command: mcpEditForm.command.trim() || undefined,
        args,
        url: mcpEditForm.url.trim() || undefined,
        env,
        headers,
        projectId: mcpEditForm.projectId.trim() || undefined,
        enabled: mcpEditForm.enabled
      })
      toast('MCP server updated', 'success')
      setMcpEdit(null)
      await loadMcpServers()
    } catch (e: any) {
      setError(e.message)
    }
  }
  function startEditMcp(s: MCPServer) {
    setMcpEdit(s)
    setMcpEditForm({
      name: s.name,
      transport: s.transport as MCPTransport,
      command: (s.command as string) ?? '',
      args: (s.args ?? []).join(', '),
      url: (s.url as string) ?? '',
      envText: stringifyEnv(s.env as any),
      headersText: stringifyHeaders(s.headers as any),
      projectId: (s.projectId as string) ?? '',
      enabled: s.enabled
    })
    setShowMcpForm(false)
    setError(null)
  }
  async function removeMcp(id: string, name: string) {
    const ok = await confirm({ title: 'Delete MCP server?', message: `Remove "${name}"? Tools will no longer be available to the agent.`, danger: true, confirmText: 'Delete' })
    if (!ok) return
    try {
      await api.deleteMcpServer(id)
      toast('MCP server deleted', 'success')
      if (mcpEdit?.id === id) setMcpEdit(null)
      await loadMcpServers()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  async function testMcp(id: string) {
    setMcpActionLoading(`test:${id}`)
    try {
      const res = await api.testMcpServer(id)
      setMcpTestResult((prev) => ({ ...prev, [id]: res }))
      if (res.ok) toast(`Connected — ${res.tools.length} tool(s) found`, 'success')
      else toast(res.error ?? 'Test failed', 'error')
      await loadMcpServers()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setMcpActionLoading(null)
    }
  }
  async function refreshMcp(id: string) {
    setMcpActionLoading(`refresh:${id}`)
    try {
      await api.refreshMcpServer(id)
      toast('Refreshed', 'success')
      await loadMcpServers()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setMcpActionLoading(null)
    }
  }
  async function toggleMcpEnabled(s: MCPServer) {
    try {
      await api.updateMcpServer(s.id, { enabled: !s.enabled })
      await loadMcpServers()
      toast(s.enabled ? 'Disabled' : 'Enabled', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  // ---- LSP helpers ----
  const LSP_LANGUAGES = ['typescript','javascript','python','go','rust','css','json','html','yaml','bash','markdown','java','c','cpp','csharp','php','ruby','swift','kotlin','dart','toml','xml','sql','graphql','dockerfile'] as const
  async function loadLspServers() {
    setLspLoading(true)
    try {
      const list = await api.listLspServers()
      setLspServers(list)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLspLoading(false)
    }
  }
  async function submitLsp() {
    setError(null)
    const name = lspForm.name.trim()
    const language = lspForm.language.trim().toLowerCase()
    const command = lspForm.command.trim()
    if (!name) return setError('LSP server name is required')
    if (name.length < 2 || name.length > 80) return setError('LSP name must be 2-80 characters')
    if (!language) return setError('Language is required')
    if (!/^[a-z][a-z0-9_-]*$/.test(language)) return setError('Invalid language id')
    if (!command) return setError('Command is required')
    const args = lspForm.args.trim() ? lspForm.args.split(',').map((s) => s.trim()).filter(Boolean) : undefined
    const env = parseEnvText(lspForm.envText)
    try {
      await api.createLspServer({
        name,
        language,
        command,
        args,
        env,
        projectId: lspForm.projectId.trim() || undefined,
        enabled: lspForm.enabled
      })
      toast('LSP server added', 'success')
      setShowLspForm(false)
      setLspForm({ name: '', language: 'typescript', command: '', args: '', envText: '', projectId: '', enabled: true })
      await loadLspServers()
    } catch (e: any) {
      setError(e.message)
    }
  }
  async function submitEditLsp() {
    if (!lspEdit) return
    setError(null)
    const name = lspEditForm.name.trim()
    const language = lspEditForm.language.trim().toLowerCase()
    const command = lspEditForm.command.trim()
    if (!name) return setError('LSP server name is required')
    if (!language) return setError('Language is required')
    if (!/^[a-z][a-z0-9_-]*$/.test(language)) return setError('Invalid language id')
    if (!command) return setError('Command is required')
    const args = lspEditForm.args.trim() ? lspEditForm.args.split(',').map((s) => s.trim()).filter(Boolean) : []
    const env = parseEnvText(lspEditForm.envText)
    try {
      await api.updateLspServer(lspEdit.id, {
        name,
        language,
        command,
        args,
        env,
        projectId: lspEditForm.projectId.trim() || undefined,
        enabled: lspEditForm.enabled
      })
      toast('LSP server updated', 'success')
      setLspEdit(null)
      await loadLspServers()
    } catch (e: any) {
      setError(e.message)
    }
  }
  function startEditLsp(s: LSPServer) {
    setLspEdit(s)
    setLspEditForm({
      name: s.name,
      language: s.language,
      command: s.command,
      args: (s.args ?? []).join(', '),
      envText: stringifyEnv(s.env as any),
      projectId: (s.projectId as string) ?? '',
      enabled: s.enabled
    })
    setShowLspForm(false)
    setError(null)
  }
  async function removeLsp(id: string, name: string) {
    const ok = await confirm({ title: 'Delete LSP server?', message: `Remove "${name}"? Language intelligence will be disabled.`, danger: true, confirmText: 'Delete' })
    if (!ok) return
    try {
      await api.deleteLspServer(id)
      toast('LSP server deleted', 'success')
      if (lspEdit?.id === id) setLspEdit(null)
      await loadLspServers()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }
  async function testLsp(id: string) {
    setLspActionLoading(`test:${id}`)
    try {
      const res = await api.testLspServer(id)
      setLspTestResult((prev) => ({ ...prev, [id]: res as any }))
      if (res.ok) toast('Connected — LSP initialize succeeded', 'success')
      else toast(res.error ?? 'Test failed', 'error')
      await loadLspServers()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLspActionLoading(null)
    }
  }
  async function refreshLsp(id: string) {
    setLspActionLoading(`refresh:${id}`)
    try {
      await api.refreshLspServer(id)
      toast('Refreshed', 'success')
      await loadLspServers()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLspActionLoading(null)
    }
  }
  async function toggleLspEnabled(s: LSPServer) {
    try {
      await api.updateLspServer(s.id, { enabled: !s.enabled })
      await loadLspServers()
      toast(s.enabled ? 'Disabled' : 'Enabled', 'success')
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
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconMCP size={16} /> MCP Servers ({mcpServers.length})</h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={loadMcpServers} disabled={mcpLoading}>{mcpLoading ? 'Loading…' : 'Refresh'}</button>
                  <button className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { if (mcpEdit) { setMcpEdit(null); setError(null) } else { setShowMcpForm(v => !v); setError(null); if (!showMcpForm && skillProjects.length === 0) loadSkillProjects() } }}>
                    <IconPlus size={15} /> {mcpEdit ? 'Cancel edit' : showMcpForm ? 'Cancel' : 'Add'}
                  </button>
                </div>
              </div>
              <p className="hint" style={{ marginBottom: 16 }}>
                MCP servers extend the agent with external tools. Tools are auto-discovered via MCP (stdio / SSE / HTTP / WebSocket) and injected into the agent. Scope per project or global.
              </p>

              {mcpEdit && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16, background: 'var(--surface)', borderLeft: '3px solid #519aba' }}>
                  <h4 style={{ marginBottom: 12 }}>Edit MCP server</h4>
                  <label className="field-label">Name</label>
                  <input className="input" placeholder="e.g. filesystem, brave-search" value={mcpEditForm.name} onChange={e => setMcpEditForm({ ...mcpEditForm, name: e.target.value })} />
                  <label className="field-label">Transport</label>
                  <select className="input" value={mcpEditForm.transport} onChange={e => setMcpEditForm({ ...mcpEditForm, transport: e.target.value as MCPTransport })}>
                    <option value="stdio">stdio — local command</option>
                    <option value="sse">sse — Server-Sent Events</option>
                    <option value="http">http — Streamable HTTP</option>
                    <option value="websocket">websocket</option>
                  </select>
                  {mcpEditForm.transport === 'stdio' ? (
                    <>
                      <label className="field-label">Command</label>
                      <input className="input" placeholder="e.g. npx -y @modelcontextprotocol/server-filesystem /tmp" value={mcpEditForm.command} onChange={e => setMcpEditForm({ ...mcpEditForm, command: e.target.value })} />
                      <label className="field-label">Args <span style={{ fontWeight: 400 }}>(comma separated)</span></label>
                      <input className="input" placeholder="e.g. --port, 3000" value={mcpEditForm.args} onChange={e => setMcpEditForm({ ...mcpEditForm, args: e.target.value })} />
                      <label className="field-label">Env <span style={{ fontWeight: 400 }}>(KEY=VALUE per line)</span></label>
                      <textarea className="input" placeholder="API_KEY=xxx
HOME=/tmp" value={mcpEditForm.envText} onChange={e => setMcpEditForm({ ...mcpEditForm, envText: e.target.value })} rows={3} style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
                    </>
                  ) : (
                    <>
                      <label className="field-label">URL</label>
                      <input className="input" placeholder="https://example.com/mcp or http://localhost:3000/sse" value={mcpEditForm.url} onChange={e => setMcpEditForm({ ...mcpEditForm, url: e.target.value })} />
                      <label className="field-label">Headers <span style={{ fontWeight: 400 }}>(Key: Value per line)</span></label>
                      <textarea className="input" placeholder="Authorization: Bearer xxx
X-Custom: value" value={mcpEditForm.headersText} onChange={e => setMcpEditForm({ ...mcpEditForm, headersText: e.target.value })} rows={3} style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
                    </>
                  )}
                  <label className="field-label">Scope project <span style={{ fontWeight: 400 }}>(leave empty for global)</span></label>
                  <select className="input" value={mcpEditForm.projectId} onChange={e => setMcpEditForm({ ...mcpEditForm, projectId: e.target.value })}>
                    <option value="">Global (all projects)</option>
                    {skillProjects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.path}</option>)}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={mcpEditForm.enabled} onChange={e => setMcpEditForm({ ...mcpEditForm, enabled: e.target.checked })} /> Enabled
                  </label>
                  <div className="dialog-actions" style={{ marginTop: 16 }}>
                    <button className="btn" onClick={() => { setMcpEdit(null); setError(null) }}>Cancel</button>
                    <button className="btn btn-primary" onClick={submitEditMcp}>Save</button>
                  </div>
                </div>
              )}

              {showMcpForm && !mcpEdit && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16, background: 'var(--surface)' }}>
                  <label className="field-label">Name</label>
                  <input className="input" placeholder="e.g. filesystem, fetch, brave-search" value={mcpForm.name} onChange={e => setMcpForm({ ...mcpForm, name: e.target.value })} />
                  <label className="field-label">Transport</label>
                  <select className="input" value={mcpForm.transport} onChange={e => setMcpForm({ ...mcpForm, transport: e.target.value as MCPTransport })}>
                    <option value="stdio">stdio — local command</option>
                    <option value="sse">sse — Server-Sent Events</option>
                    <option value="http">http — Streamable HTTP</option>
                    <option value="websocket">websocket</option>
                  </select>
                  {mcpForm.transport === 'stdio' ? (
                    <>
                      <label className="field-label">Command</label>
                      <input className="input" placeholder="e.g. npx or /usr/local/bin/mcp-server" value={mcpForm.command} onChange={e => setMcpForm({ ...mcpForm, command: e.target.value })} />
                      <label className="field-label">Args <span style={{ fontWeight: 400 }}>(comma separated)</span></label>
                      <input className="input" placeholder="e.g. -y, @modelcontextprotocol/server-filesystem, /tmp" value={mcpForm.args} onChange={e => setMcpForm({ ...mcpForm, args: e.target.value })} />
                      <label className="field-label">Env <span style={{ fontWeight: 400 }}>(KEY=VALUE per line)</span></label>
                      <textarea className="input" placeholder="BRAVE_API_KEY=xxx
HOME=/tmp" value={mcpForm.envText} onChange={e => setMcpForm({ ...mcpForm, envText: e.target.value })} rows={3} style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
                    </>
                  ) : (
                    <>
                      <label className="field-label">URL</label>
                      <input className="input" placeholder="https://example.com/mcp" value={mcpForm.url} onChange={e => setMcpForm({ ...mcpForm, url: e.target.value })} />
                      <label className="field-label">Headers <span style={{ fontWeight: 400 }}>(Key: Value per line)</span></label>
                      <textarea className="input" placeholder="Authorization: Bearer token
X-Api-Key: xxx" value={mcpForm.headersText} onChange={e => setMcpForm({ ...mcpForm, headersText: e.target.value })} rows={3} style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
                    </>
                  )}
                  <label className="field-label">Scope project <span style={{ fontWeight: 400 }}>(leave empty for global)</span></label>
                  <select className="input" value={mcpForm.projectId} onChange={e => setMcpForm({ ...mcpForm, projectId: e.target.value })}>
                    <option value="">Global (all projects)</option>
                    {skillProjects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.path}</option>)}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={mcpForm.enabled} onChange={e => setMcpForm({ ...mcpForm, enabled: e.target.checked })} /> Enabled
                  </label>
                  <div className="dialog-actions" style={{ marginTop: 16 }}>
                    <button className="btn" onClick={() => { setShowMcpForm(false); setMcpForm({ name: '', transport: 'stdio', command: '', args: '', url: '', envText: '', headersText: '', projectId: '', enabled: true }); setError(null) }}>Cancel</button>
                    <button className="btn btn-primary" onClick={submitMcp}>Add server</button>
                  </div>
                </div>
              )}

              {mcpLoading ? (
                <div className="hint" style={{ padding: 12 }}>Loading…</div>
              ) : mcpServers.length === 0 ? (
                <div className="empty" style={{ padding: '24px 12px', border: '1px dashed var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
                    <IconMCP size={20} />
                  </div>
                  <h2>No MCP servers</h2>
                  <p>Add a server via stdio command or HTTP/SSE URL. Tools will be auto-discovered.</p>
                  <p className="hint" style={{ fontSize: 12 }}>Example stdio: <code>npx -y @modelcontextprotocol/server-filesystem /tmp</code></p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {mcpServers.map(s => {
                    const isExpanded = !!mcpExpanded[s.id]
                    const testRes = mcpTestResult[s.id]
                    const statusColor = s.connecting ? '#f59e0b' : s.connected ? '#22c55e' : s.error ? '#ef4444' : '#6b7280'
                    const statusLabel = s.connecting ? 'Connecting' : s.connected ? `Connected • ${s.tools.length} tool(s)` : s.error ? 'Error' : s.enabled ? 'Disconnected' : 'Disabled'
                    const scopeName = s.projectId ? skillProjects.find(p => p.id === s.projectId)?.name ?? s.projectId.slice(0, 8) : 'Global'
                    return (
                      <div key={s.id} className="provider-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `3px solid ${statusColor}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 99, background: statusColor, flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                          <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 99, color: 'var(--text-faint)' }}>{s.transport}</span>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }} title="Enabled">
                            <input type="checkbox" checked={s.enabled} onChange={() => toggleMcpEnabled(s)} />
                          </label>
                          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => startEditMcp(s)} aria-label={`Edit ${s.name}`}><IconPencil size={14} /></button>
                          <button className="icon-btn" style={{ width: 28, height: 28, color: '#ef4444' }} onClick={() => removeMcp(s.id, s.name)} aria-label={`Delete ${s.name}`}><IconTrash size={14} /></button>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span>{statusLabel}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconFolder size={12} /> {scopeName}</span>
                        </div>
                        {s.transport === 'stdio' ? (
                          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                            {s.command} {(s.args ?? []).join(' ')}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{s.url}</div>
                        )}
                        {s.error && <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 8px', wordBreak: 'break-word' }}>{s.error}</div>}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} disabled={mcpActionLoading === `test:${s.id}`} onClick={() => testMcp(s.id)}>{mcpActionLoading === `test:${s.id}` ? 'Testing…' : 'Test'}</button>
                          <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} disabled={mcpActionLoading === `refresh:${s.id}` || !s.enabled} onClick={() => refreshMcp(s.id)}>{mcpActionLoading === `refresh:${s.id}` ? 'Refreshing…' : 'Refresh tools'}</button>
                          <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setMcpExpanded(prev => ({ ...prev, [s.id]: !prev[s.id] }))}>{isExpanded ? 'Hide tools' : `Tools (${s.tools.length})`}</button>
                        </div>
                        {testRes && (
                          <div style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, background: testRes.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${testRes.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: testRes.ok ? '#16a34a' : '#ef4444' }}>
                            {testRes.ok ? `Test OK — ${testRes.tools?.length ?? 0} tool(s)` : `Test failed: ${testRes.error}`}
                          </div>
                        )}
                        {isExpanded && (
                          <div style={{ marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                            {s.tools.length === 0 ? (
                              <p className="hint" style={{ fontSize: 12 }}>{s.connected ? 'No tools discovered — server returned empty tools/list' : 'Not connected — test or refresh to discover tools'}</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {s.tools.map((t, idx) => (
                                  <div key={idx} style={{ padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12, color: 'var(--text)' }}>{t.name}</span>
                                      <span style={{ fontSize: 10, color: 'var(--text-faint)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 99, padding: '1px 6px' }}>mcp_{s.name}_{t.name}</span>
                                    </div>
                                    {t.description && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>{t.description}</div>}
                                    {t.inputSchema && <details style={{ marginTop: 6 }}><summary style={{ fontSize: 11, color: 'var(--text-faint)', cursor: 'pointer' }}>inputSchema</summary><pre style={{ margin: '6px 0 0', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 8, maxHeight: 160, overflow: 'auto' }}>{JSON.stringify(t.inputSchema, null, 2)}</pre></details>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{new Date(s.createdAt).toLocaleString()}{s.updatedAt && s.updatedAt !== s.createdAt ? ` · updated ${new Date(s.updatedAt).toLocaleString()}` : ''}</div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ marginTop: 16, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>How MCP works</div>
                <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--text-faint)', fontSize: 13, lineHeight: 1.6 }}>
                  <li>Tools are discovered via <code>initialize</code> + <code>tools/list</code> (MCP JSON-RPC 2.0)</li>
                  <li>Agent sees tools as <code>mcp_&lt;server&gt;_&lt;tool&gt;</code> and calls them via <code>tools/call</code></li>
                  <li>Stdio servers run as child processes; HTTP/SSE servers are called via fetch</li>
                </ul>
              </div>
            </div>
          )}

          {tab === 'lsp' && (
            <div className="inline-form" style={{ marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><IconLSP size={16} /> Language Servers ({lspServers.length})</h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn" style={{ fontSize: 12, padding: '4px 10px' }} onClick={loadLspServers} disabled={lspLoading}>{lspLoading ? 'Loading…' : 'Refresh'}</button>
                  <button className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => { if (lspEdit) { setLspEdit(null); setError(null) } else { setShowLspForm(v => !v); setError(null); if (!showLspForm && skillProjects.length === 0) loadSkillProjects() } }}>
                    <IconPlus size={15} /> {lspEdit ? 'Cancel edit' : showLspForm ? 'Cancel' : 'Add'}
                  </button>
                </div>
              </div>
              <p className="hint" style={{ marginBottom: 16 }}>
                Language Server Protocol integrations provide smarter code intelligence — autocomplete, diagnostics, go-to-definition, and hover docs. Each server runs as a stdio child process and is auto-started per project or globally.
              </p>

              {lspEdit && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16, background: 'var(--surface)', borderLeft: '3px solid #519aba' }}>
                  <h4 style={{ marginBottom: 12 }}>Edit language server</h4>
                  <label className="field-label">Name</label>
                  <input className="input" placeholder="e.g. tsserver, pyright, gopls" value={lspEditForm.name} onChange={e => setLspEditForm({ ...lspEditForm, name: e.target.value })} />
                  <label className="field-label">Language</label>
                  <select className="input" value={lspEditForm.language} onChange={e => setLspEditForm({ ...lspEditForm, language: e.target.value })}>
                    {LSP_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                    {!LSP_LANGUAGES.includes(lspEditForm.language as any) && <option value={lspEditForm.language}>{lspEditForm.language} (custom)</option>}
                  </select>
                  <input className="input" style={{ marginTop: 6 }} placeholder="custom language id (e.g. vue, svelte)" value={LSP_LANGUAGES.includes(lspEditForm.language as any) ? '' : lspEditForm.language} onChange={e => setLspEditForm({ ...lspEditForm, language: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} disabled={LSP_LANGUAGES.includes(lspEditForm.language as any)} />
                  <label className="field-label">Transport</label>
                  <select className="input" value={lspEditForm.transport} onChange={e => setLspEditForm({ ...lspEditForm, transport: e.target.value as LSPTransport })}>
                    <option value="stdio">stdio — local command</option>
                    <option value="tcp">tcp — TCP socket</option>
                    <option value="socket">socket — Unix/TCP socket URL</option>
                    <option value="websocket">websocket</option>
                    <option value="http">http — Streamable HTTP</option>
                    <option value="sse">sse — Server-Sent Events</option>
                  </select>
                  {lspEditForm.transport === 'stdio' ? (
                    <>
                      <label className="field-label">Command <span style={{ fontWeight: 400 }}>(executable)</span></label>
                      <input className="input" placeholder="e.g. typescript-language-server, pyright-langserver, gopls, rust-analyzer" value={lspEditForm.command} onChange={e => setLspEditForm({ ...lspEditForm, command: e.target.value })} />
                      <label className="field-label">Args <span style={{ fontWeight: 400 }}>(comma separated)</span></label>
                      <input className="input" placeholder="e.g. --stdio or --stdio, --log-level, info" value={lspEditForm.args} onChange={e => setLspEditForm({ ...lspEditForm, args: e.target.value })} />
                      <label className="field-label">Env <span style={{ fontWeight: 400 }}>(KEY=VALUE per line)</span></label>
                      <textarea className="input" placeholder="NODE_ENV=production&#10;PYTHONPATH=/usr/local/lib" value={lspEditForm.envText} onChange={e => setLspEditForm({ ...lspEditForm, envText: e.target.value })} rows={3} style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
                    </>
                  ) : (
                    <>
                      <label className="field-label">URL</label>
                      <input className="input" placeholder="e.g. tcp://127.0.0.1:6008 or http://localhost:3000/lsp" value={lspEditForm.url} onChange={e => setLspEditForm({ ...lspEditForm, url: e.target.value })} />
                      <label className="field-label">Headers <span style={{ fontWeight: 400 }}>(Key: Value per line, for http/tcp auth)</span></label>
                      <textarea className="input" placeholder="Authorization: Bearer xxx&#10;X-Custom: value" value={lspEditForm.headersText} onChange={e => setLspEditForm({ ...lspEditForm, headersText: e.target.value })} rows={3} style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
                    </>
                  )}
                  <label className="field-label">Scope project <span style={{ fontWeight: 400 }}>(leave empty for global)</span></label>
                  <select className="input" value={lspEditForm.projectId} onChange={e => setLspEditForm({ ...lspEditForm, projectId: e.target.value })}>
                    <option value="">Global (all projects)</option>
                    {skillProjects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.path}</option>)}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={lspEditForm.enabled} onChange={e => setLspEditForm({ ...lspEditForm, enabled: e.target.checked })} /> Enabled
                  </label>
                  <div className="dialog-actions" style={{ marginTop: 16 }}>
                    <button className="btn" onClick={() => { setLspEdit(null); setError(null) }}>Cancel</button>
                    <button className="btn btn-primary" onClick={submitEditLsp}>Save</button>
                  </div>
                </div>
              )}

              {showLspForm && !lspEdit && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 16, background: 'var(--surface)' }}>
                  <label className="field-label">Name</label>
                  <input className="input" placeholder="e.g. typescript, pyright, gopls, rust-analyzer" value={lspForm.name} onChange={e => setLspForm({ ...lspForm, name: e.target.value })} />
                  <label className="field-label">Language</label>
                  <select className="input" value={lspForm.language} onChange={e => setLspForm({ ...lspForm, language: e.target.value })}>
                    {LSP_LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <label className="field-label">Transport</label>
                  <select className="input" value={lspForm.transport} onChange={e => setLspForm({ ...lspForm, transport: e.target.value as LSPTransport })}>
                    <option value="stdio">stdio — local command</option>
                    <option value="tcp">tcp — TCP socket</option>
                    <option value="socket">socket — Unix/TCP socket URL</option>
                    <option value="websocket">websocket</option>
                    <option value="http">http — Streamable HTTP</option>
                    <option value="sse">sse — Server-Sent Events</option>
                  </select>
                  {lspForm.transport === 'stdio' ? (
                    <>
                      <label className="field-label">Command <span style={{ fontWeight: 400 }}>(executable)</span></label>
                      <input className="input" placeholder="e.g. typescript-language-server --stdio" value={lspForm.command} onChange={e => setLspForm({ ...lspForm, command: e.target.value })} />
                      <label className="field-label">Args <span style={{ fontWeight: 400 }}>(comma separated)</span></label>
                      <input className="input" placeholder="e.g. --stdio or leave empty" value={lspForm.args} onChange={e => setLspForm({ ...lspForm, args: e.target.value })} />
                      <label className="field-label">Env <span style={{ fontWeight: 400 }}>(KEY=VALUE per line)</span></label>
                      <textarea className="input" placeholder="NODE_ENV=production&#10;PYTHONPATH=/usr/local/lib" value={lspForm.envText} onChange={e => setLspForm({ ...lspForm, envText: e.target.value })} rows={3} style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
                    </>
                  ) : (
                    <>
                      <label className="field-label">URL</label>
                      <input className="input" placeholder="e.g. tcp://127.0.0.1:6008 or http://localhost:3000/lsp" value={lspForm.url} onChange={e => setLspForm({ ...lspForm, url: e.target.value })} />
                      <label className="field-label">Headers <span style={{ fontWeight: 400 }}>(Key: Value per line)</span></label>
                      <textarea className="input" placeholder="Authorization: Bearer xxx&#10;X-Custom: value" value={lspForm.headersText} onChange={e => setLspForm({ ...lspForm, headersText: e.target.value })} rows={3} style={{ resize: 'vertical', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} />
                    </>
                  )}
                  <label className="field-label">Scope project <span style={{ fontWeight: 400 }}>(leave empty for global)</span></label>
                  <select className="input" value={lspForm.projectId} onChange={e => setLspForm({ ...lspForm, projectId: e.target.value })}>
                    <option value="">Global (all projects)</option>
                    {skillProjects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.path}</option>)}
                  </select>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={lspForm.enabled} onChange={e => setLspForm({ ...lspForm, enabled: e.target.checked })} /> Enabled
                  </label>
                  <div className="dialog-actions" style={{ marginTop: 16 }}>
                    <button className="btn" onClick={() => { setShowLspForm(false); setLspForm({ name: '', language: 'typescript', transport: 'stdio', command: '', args: '', url: '', envText: '', headersText: '', projectId: '', enabled: true }); setError(null) }}>Cancel</button>
                    <button className="btn btn-primary" onClick={submitLsp}>Add server</button>
                  </div>
                </div>
              )}

              {lspLoading ? (
                <div className="hint" style={{ padding: 12 }}>Loading…</div>
              ) : lspServers.length === 0 ? (
                <div className="empty" style={{ padding: '24px 12px', border: '1px dashed var(--border)', borderRadius: 10, background: 'var(--surface)' }}>
                  <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-faint)' }}>
                    <IconLSP size={20} />
                  </div>
                  <h2>No language servers</h2>
                  <p>Configure LSP servers per language. Each server runs via stdio and provides diagnostics, completion, hover and go-to-definition.</p>
                  <p className="hint" style={{ fontSize: 12 }}>Example: <code>typescript-language-server --stdio</code> · <code>pyright-langserver --stdio</code> · <code>gopls</code> · <code>rust-analyzer</code></p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {lspServers.map(s => {
                    const isExpanded = !!lspExpanded[s.id]
                    const testRes = lspTestResult[s.id]
                    const statusColor = s.connecting ? '#f59e0b' : s.connected ? '#22c55e' : s.error ? '#ef4444' : '#6b7280'
                    const statusLabel = s.connecting ? 'Connecting' : s.connected ? 'Connected' : s.error ? 'Error' : s.enabled ? 'Disconnected' : 'Disabled'
                    const scopeName = s.projectId ? skillProjects.find(p => p.id === s.projectId)?.name ?? s.projectId.slice(0, 8) : 'Global'
                    const caps = s.capabilities as any
                    return (
                      <div key={s.id} className="provider-card" style={{ display: 'flex', flexDirection: 'column', gap: 8, borderLeft: `3px solid ${statusColor}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 99, background: statusColor, flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ fontWeight: 600, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                          <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 99, color: 'var(--text-faint)', textTransform: 'lowercase' }}>{s.language}</span>
                          <span style={{ fontSize: 11, padding: '2px 6px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 99, color: 'var(--text-faint)' }}>{s.transport}</span>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }} title="Enabled">
                            <input type="checkbox" checked={s.enabled} onChange={() => toggleLspEnabled(s)} />
                          </label>
                          <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => startEditLsp(s)} aria-label={`Edit ${s.name}`}><IconPencil size={14} /></button>
                          <button className="icon-btn" style={{ width: 28, height: 28, color: '#ef4444' }} onClick={() => removeLsp(s.id, s.name)} aria-label={`Delete ${s.name}`}><IconTrash size={14} /></button>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-faint)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                          <span>{statusLabel}</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconFolder size={12} /> {scopeName}</span>
                        </div>
                        {s.transport === 'stdio' ? (
                          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>
                            {s.command} {(s.args ?? []).join(' ')}
                          </div>
                        ) : (
                          <div style={{ fontSize: 12, color: 'var(--text-dim)', fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{s.url}</div>
                        )}
                        {s.error && <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 8px', wordBreak: 'break-word' }}>{s.error}</div>}
                        {s.connected && caps && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {caps.completionProvider !== undefined && <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 99, color: '#16a34a' }}>completion</span>}
                            {caps.hoverProvider && <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 99, color: '#2563eb' }}>hover</span>}
                            {caps.definitionProvider && <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(168,85,247,0.1)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 99, color: '#7c3aed' }}>definition</span>}
                            {caps.referencesProvider && <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 99, color: '#d97706' }}>references</span>}
                            {caps.documentSymbolProvider && <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 99, color: '#4f46e5' }}>symbols</span>}
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} disabled={lspActionLoading === `test:${s.id}`} onClick={() => testLsp(s.id)}>{lspActionLoading === `test:${s.id}` ? 'Testing…' : 'Test'}</button>
                          <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} disabled={lspActionLoading === `refresh:${s.id}` || !s.enabled} onClick={() => refreshLsp(s.id)}>{lspActionLoading === `refresh:${s.id}` ? 'Refreshing…' : 'Restart'}</button>
                          <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setLspExpanded(prev => ({ ...prev, [s.id]: !prev[s.id] }))}>{isExpanded ? 'Hide details' : 'Details'}</button>
                        </div>
                        {testRes && (
                          <div style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, background: testRes.ok ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)', border: `1px solid ${testRes.ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, color: testRes.ok ? '#16a34a' : '#ef4444' }}>
                            {testRes.ok ? 'Test OK — initialize succeeded' : `Test failed: ${testRes.error}`}
                          </div>
                        )}
                        {isExpanded && (
                          <div style={{ marginTop: 4, borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {s.capabilities ? (
                              <div>
                                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Capabilities</div>
                                <pre style={{ margin: 0, fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, padding: 8, maxHeight: 200, overflow: 'auto' }}>{JSON.stringify(s.capabilities, null, 2)}</pre>
                              </div>
                            ) : (
                              <p className="hint" style={{ fontSize: 12 }}>{s.connected ? 'No capabilities reported' : 'Not connected — test or restart to fetch capabilities'}</p>
                            )}
                            <div style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'ui-monospace, monospace' }}>
                              ID: {s.id.slice(0, 8)} · {s.language} · {s.command}
                            </div>
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{new Date(s.createdAt).toLocaleString()}{s.updatedAt && s.updatedAt !== s.createdAt ? ` · updated ${new Date(s.updatedAt).toLocaleString()}` : ''}</div>
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ marginTop: 16, padding: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Supported languages</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {['TypeScript', 'Python', 'Go', 'Rust', 'CSS', 'JSON', 'HTML', 'YAML', 'Bash'].map((lang) => (
                    <span key={lang} style={{ fontSize: 11, padding: '4px 8px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 99, color: 'var(--text-faint)' }}>{lang}</span>
                  ))}
                </div>
                <p className="hint" style={{ marginTop: 8, fontSize: 12 }}>Tip: install a server (e.g. <code>npm i -g typescript-language-server</code>, <code>pip install pyright</code>, <code>go install golang.org/x/tools/gopls@latest</code>) then add it here. Use <code>--stdio</code> where required.</p>
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
