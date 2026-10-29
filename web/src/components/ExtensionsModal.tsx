import { useState } from 'react'
import { reloadExtensions, reloadLspServers, reloadMcpServers, reloadSkills } from '../api'
import type { ExtensionInfo, LspServerInfo, McpServerInfo, SkillInfo } from '../types'
import { Modal } from './Modal'

type ExtensionTab = 'extensions' | 'skills' | 'mcp' | 'lsp'

const TABS: { id: ExtensionTab; label: string }[] = [
  { id: 'extensions', label: 'Extensions' },
  { id: 'skills', label: 'Skills' },
  { id: 'mcp', label: 'MCP' },
  { id: 'lsp', label: 'LSP' }
]

const TAB_EMPTY: Record<Exclude<ExtensionTab, 'extensions'>, { title: string; body: string }> = {
  skills: {
    title: 'No skills found',
    body: 'Add a folder with a SKILL.md (name + description frontmatter) under skills/ or .opencode/skills.'
  },
  mcp: {
    title: 'No MCP servers configured',
    body: 'Add stdio or HTTP MCP servers to mcp.json, then reload to load their tools.'
  },
  lsp: {
    title: 'No language servers configured',
    body: 'Add language servers to lsp.json to get lsp_diagnostics errors and warnings for source files.'
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

export function ExtensionsModal({
  extensions,
  skills,
  mcpServers,
  lspServers,
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
  onClose: () => void
  onRefreshExtensions: () => Promise<void>
  onRefreshSkills: () => Promise<void>
  onRefreshMcp: () => Promise<void>
  onRefreshLsp: () => Promise<void>
}) {
  const [tab, setTab] = useState<ExtensionTab>('extensions')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = async () => {
    setBusy(true)
    setError(null)
    try {
      if (tab === 'extensions') {
        await reloadExtensions()
        await onRefreshExtensions()
      } else if (tab === 'skills') {
        await reloadSkills()
        await onRefreshSkills()
      } else if (tab === 'mcp') {
        await reloadMcpServers()
        await onRefreshMcp()
      } else {
        await reloadLspServers()
        await onRefreshLsp()
      }
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
          <button className="btn primary" onClick={() => void reload()} disabled={busy}>
            {busy ? 'Reloading…' : TAB_BUTTON[tab]}
          </button>
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

      {tab === 'skills' && (
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
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'mcp' && (
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
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'lsp' && (
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
                  {server.extensions.length > 0 && (
                    <div className="chips">
                      {server.extensions.map((extension) => (
                        <span className="chip" key={extension}>
                          {extension}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
