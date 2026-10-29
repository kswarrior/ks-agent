import { useState } from 'react'
import {
  deleteLspServer,
  deleteMcpServer,
  deleteSkill,
  reloadExtensions,
  reloadLspServers,
  reloadMcpServers,
  reloadSkills
} from '../api'
import { copyText } from '../clipboard'
import type { ExtensionInfo, LspServerInfo, McpServerInfo, Project, SkillInfo } from '../types'
import { AddLspForm, AddMcpForm, AddSkillForm } from './ConfigForms'
import { ConfirmModal, Modal } from './Modal'

type ExtensionTab = 'extensions' | 'skills' | 'mcp' | 'lsp'
type ExtensionView = 'list' | 'add'

const TABS: { id: ExtensionTab; label: string }[] = [
  { id: 'extensions', label: 'Extensions' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
  { id: 'lsp', label: 'LSP' }
]

const TAB_EMPTY: Record<Exclude<ExtensionTab, 'extensions'>, { title: string; body: string }> = {
  skills: {
    title: 'No skills found',
    body: 'Add a folder with a SKILL.md (name + description frontmatter) under .ks-agent/skills/, skills/ or .opencode/skills.'
  },
  mcp: {
    title: 'No MCP servers configured',
    body: 'Add stdio, Streamable HTTP or legacy SSE servers to .ks-agent/mcp.json, then reload to load their tools.'
  },
  lsp: {
    title: 'No language servers configured',
    body: 'Add language servers to .ks-agent/lsp.json to get lsp_diagnostics errors and warnings for source files.'
  }
}

const TAB_HINT: Record<ExtensionTab, string> = {
  extensions: 'Each extension runs in its own process and receives only the active project path.',
  skills: 'Skills are reusable instructions the agent loads on demand with use_skill.',
  mcp: 'MCP tools are exposed to the agent as mcp_<server>_<tool>.',
  lsp: 'Language servers are started on demand for the file being checked.'
}

const TAB_BUTTON: Record<ExtensionTab, string> = {
  extensions: 'Reload extensions',
  skills: 'Reload skills',
  mcp: 'Reload MCP servers',
  lsp: 'Reload language servers'
}

const ADD_BUTTON: Record<Exclude<ExtensionTab, 'extensions'>, string> = {
  skills: 'Add skill',
  mcp: 'Add MCP server',
  lsp: 'Add language server'
}

function scopeLabel(projectIds: string[], projects: Project[]): string {
  if (projectIds.length === 0) return 'All projects'
  return projectIds.map((id) => projects.find((project) => project.id === id)?.name ?? id).join(', ')
}

function InstallCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await copyText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  return (
    <div className="lsp-install">
      <span className="muted small">Install command</span>
      <div className="lsp-install-row">
        <code title={command}>{command}</code>
        <button type="button" className="btn ghost small" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}

export function ExtensionsModal({
  extensions,
  skills,
  mcpServers,
  lspServers,
  projects,
  onClose,
  onRefreshExtensions,
  onRefreshSkills,
  onRefreshMcp,
  onRefreshLsp
}: {
  extensions: ExtensionInfo[]
  skills: SkillInfo[]
  mcpServers: McpServerInfo[]
  lspServers: LspServerInfo[]
  projects: Project[]
  onClose: () => void
  onRefreshExtensions: () => Promise<void>
  onRefreshSkills: () => Promise<void>
  onRefreshMcp: () => Promise<void>
  onRefreshLsp: () => Promise<void>
}) {
  const [tab, setTab] = useState<ExtensionTab>('extensions')
  const [view, setView] = useState<ExtensionView>('list')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ kind: Exclude<ExtensionTab, 'extensions'>; name: string } | null>(
    null
  )

  const refreshTab = async (target: ExtensionTab) => {
    if (target === 'extensions') await onRefreshExtensions()
    else if (target === 'skills') await onRefreshSkills()
    else if (target === 'mcp') await onRefreshMcp()
    else await onRefreshLsp()
  }

  const reload = async () => {
    setBusy(true)
    setError(null)
    try {
      if (tab === 'extensions') await reloadExtensions()
      else if (tab === 'skills') await reloadSkills()
      else if (tab === 'mcp') await reloadMcpServers()
      else await reloadLspServers()
      await refreshTab(tab)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!confirmDelete) return
    setBusy(true)
    setError(null)
    try {
      if (confirmDelete.kind === 'skills') await deleteSkill(confirmDelete.name)
      else if (confirmDelete.kind === 'mcp') await deleteMcpServer(confirmDelete.name)
      else await deleteLspServer(confirmDelete.name)
      await refreshTab(confirmDelete.kind)
      setConfirmDelete(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Extensions"
      onClose={onClose}
      wide
      fullHeight
      footer={
        <>
          <span className="muted small">{TAB_HINT[tab]}</span>
          {tab !== 'extensions' && view === 'list' && (
            <button
              className="btn ghost"
              onClick={() => {
                setView('add')
                setError(null)
              }}
              disabled={busy}
            >
              {ADD_BUTTON[tab]}
            </button>
          )}
          {view === 'list' && (
            <button className="btn primary" onClick={() => void reload()} disabled={busy}>
              {busy ? 'Working…' : TAB_BUTTON[tab]}
            </button>
          )}
        </>
      }
    >
      <div className="settings-tabs" role="tablist" aria-label="Extensions">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            className={`settings-tab ${tab === entry.id ? 'active' : ''}`}
            onClick={() => {
              setTab(entry.id)
              setView('list')
              setError(null)
            }}
            role="tab"
            aria-selected={tab === entry.id}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {tab === 'extensions' && (
        <>
          {extensions.length === 0 && (
            <p className="empty-hint">
              No extensions found. Add a folder under <code>extensions/</code> with an <code>extension.json</code>.
            </p>
          )}
          <div className="extension-grid">
            {extensions.map((extension) => (
              <div className="extension-card" key={extension.name}>
                <div className="extension-head">
                  <div>
                    <strong>{extension.name}</strong>
                    <span className="muted small"> v{extension.version}</span>
                  </div>
                  <span className={`status ${extension.status}`}>{extension.status}</span>
                </div>
                <p className="muted">{extension.description || 'No description.'}</p>
                {extension.error && <div className="error-banner small">{extension.error}</div>}
                {extension.tools.length > 0 && (
                  <div className="chips">
                    {extension.tools.map((tool) => (
                      <span className="chip" key={tool.name} title={tool.description}>
                        {tool.name}
                      </span>
                    ))}
                  </div>
                )}
                {extension.hooks.length > 0 && (
                  <div className="muted small">hooks: {extension.hooks.join(', ')}</div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'skills' &&
        (view === 'add' ? (
          <AddSkillForm
            projects={projects}
            onDone={async () => {
              await onRefreshSkills()
              setView('list')
            }}
            onCancel={() => setView('list')}
          />
        ) : (
          <>
            {skills.length === 0 ? (
              <div className="extension-tab-empty">
                <strong>{TAB_EMPTY.skills.title}</strong>
                <p className="muted">{TAB_EMPTY.skills.body}</p>
              </div>
            ) : (
              <div className="extension-grid">
                {skills.map((skill) => (
                  <div className="extension-card" key={skill.name}>
                    <div className="extension-head">
                      <strong>{skill.name}</strong>
                      <span className="status ready">skill</span>
                    </div>
                    <p className="muted">{skill.description || 'No description.'}</p>
                    <div className="muted small" title={skill.path}>
                      {skill.path}
                    </div>
                    <div className="muted small">Projects: {scopeLabel(skill.projects, projects)}</div>
                    <div className="extension-card-actions">
                      {skill.writable ? (
                        <button
                          className="btn ghost small"
                          onClick={() => setConfirmDelete({ kind: 'skills', name: skill.name })}
                          disabled={busy}
                        >
                          Delete
                        </button>
                      ) : (
                        <span className="muted small">Read-only (override it to edit)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ))}

      {tab === 'mcp' &&
        (view === 'add' ? (
          <AddMcpForm
            projects={projects}
            onDone={async () => {
              await onRefreshMcp()
              setView('list')
            }}
            onCancel={() => setView('list')}
          />
        ) : (
          <>
            {mcpServers.length === 0 ? (
              <div className="extension-tab-empty">
                <strong>{TAB_EMPTY.mcp.title}</strong>
                <p className="muted">{TAB_EMPTY.mcp.body}</p>
              </div>
            ) : (
              <div className="extension-grid">
                {mcpServers.map((server) => (
                  <div className="extension-card" key={server.name}>
                    <div className="extension-head">
                      <div>
                        <strong>{server.name}</strong>
                        <span className="muted small"> {server.transport}</span>
                      </div>
                      <span className={`status ${server.status}`}>{server.status}</span>
                    </div>
                    {server.error && <div className="error-banner small">{server.error}</div>}
                    <div className="muted small">
                      {server.tools.length} tool{server.tools.length === 1 ? '' : 's'}
                    </div>
                    {server.tools.length > 0 && (
                      <div className="chips">
                        {server.tools.map((tool) => (
                          <span className="chip" key={tool.name} title={tool.description}>
                            {tool.name}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="muted small">Projects: {scopeLabel(server.projects, projects)}</div>
                    <div className="extension-card-actions">
                      <button
                        className="btn ghost small"
                        onClick={() => setConfirmDelete({ kind: 'mcp', name: server.name })}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ))}

      {tab === 'lsp' &&
        (view === 'add' ? (
          <AddLspForm
            projects={projects}
            onDone={async () => {
              await onRefreshLsp()
              setView('list')
            }}
            onCancel={() => setView('list')}
          />
        ) : (
          <>
            {lspServers.length === 0 ? (
              <div className="extension-tab-empty">
                <strong>{TAB_EMPTY.lsp.title}</strong>
                <p className="muted">{TAB_EMPTY.lsp.body}</p>
              </div>
            ) : (
              <div className="extension-grid">
                {lspServers.map((server) => (
                  <div className="extension-card" key={server.name}>
                    <div className="extension-head">
                      <div>
                        <strong>{server.name}</strong>
                        <span className="muted small"> {server.languageId}</span>
                      </div>
                      <span className={`status ${server.status}`}>{server.status}</span>
                    </div>
                    {server.error && <div className="error-banner small">{server.error}</div>}
                    <code className="muted small">{server.command}</code>
                    {server.installCommand && <InstallCommand command={server.installCommand} />}
                    {server.extensions.length > 0 && (
                      <div className="chips">
                        {server.extensions.map((extension) => (
                          <span className="chip" key={extension}>
                            {extension}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="muted small">Projects: {scopeLabel(server.projects, projects)}</div>
                    <div className="extension-card-actions">
                      <button
                        className="btn ghost small"
                        onClick={() => setConfirmDelete({ kind: 'lsp', name: server.name })}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ))}

      {confirmDelete && (
        <ConfirmModal
          title={`Remove ${confirmDelete.name}?`}
          message={
            confirmDelete.kind === 'skills'
              ? `This permanently deletes the skill "${confirmDelete.name}" and its folder.`
              : confirmDelete.kind === 'mcp'
                ? `This removes "${confirmDelete.name}" from the MCP config and stops its tools.`
                : `This removes "${confirmDelete.name}" from the LSP config.`
          }
          confirmLabel="Delete"
          onConfirm={() => void remove()}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </Modal>
  )
}
