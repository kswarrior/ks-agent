import { useEffect, useState } from 'react'
import {
  createLspServer,
  createMcpServer,
  createSkill,
  getLspServer,
  getMcpServer,
  getSkill,
  installLspServer,
  installMcpServer,
  updateLspServer,
  updateMcpServer,
  updateSkill
} from '../api'
import type { LspServerDetail, McpServerDetail, Project, SkillDetail } from '../types'

type FormProps = {
  projects: Project[]
  onDone: () => Promise<void>
  onCancel: () => void
  onError?: (message: string) => void
}

const LSP_PRESETS = [
  {
    label: 'TypeScript',
    name: 'typescript',
    command: 'typescript-language-server',
    args: '--stdio',
    extensions: '.ts, .tsx, .js, .jsx, .mjs, .cjs',
    languageId: 'typescript',
    installCommand: 'npm i -g typescript-language-server typescript'
  },
  {
    label: 'Python',
    name: 'python',
    command: 'pyright-langserver',
    args: '--stdio',
    extensions: '.py, .pyi',
    languageId: 'python',
    installCommand: 'pip install pyright'
  },
  {
    label: 'Go',
    name: 'go',
    command: 'gopls',
    args: '',
    extensions: '.go',
    languageId: 'go',
    installCommand: 'go install golang.org/x/tools/gopls@latest'
  },
  {
    label: 'Rust',
    name: 'rust',
    command: 'rust-analyzer',
    args: '',
    extensions: '.rs',
    languageId: 'rust',
    installCommand: 'rustup component add rust-analyzer'
  }
] as const

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function parsePairs(value: string, separator: '=' | ':'): Record<string, string> {
  const pairs: Record<string, string> = {}
  for (const line of splitLines(value)) {
    const index = line.indexOf(separator)
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const item = line.slice(index + 1).trim()
    if (key) pairs[key] = item
  }
  return pairs
}

function formatPairs(pairs: Record<string, string>, separator: '=' | ':'): string {
  return Object.entries(pairs)
    .map(([key, value]) => `${key}${separator}${value}`)
    .join('\n')
}

function FormActions({
  busy,
  disabled,
  label,
  onCancel
}: {
  busy: boolean
  disabled: boolean
  label: string
  onCancel: () => void
}) {
  return (
    <div className="settings-form-actions">
      <button type="button" className="btn ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </button>
      <button className="btn primary" type="submit" disabled={busy || disabled}>
        {busy ? 'Saving…' : label}
      </button>
    </div>
  )
}

function FormHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="extension-form-head">
      <strong>{title}</strong>
      <span className="muted small">{hint}</span>
    </div>
  )
}

function ProjectScopeField({
  projects,
  value,
  onChange
}: {
  projects: Project[]
  value: string[]
  onChange: (projects: string[]) => void
}) {
  const toggle = (id: string) => {
    if (value.length === 0) {
      onChange([id])
      return
    }
    onChange(value.includes(id) ? value.filter((projectId) => projectId !== id) : [...value, id])
  }

  return (
    <div className="field">
      <span>Projects</span>
      <div className="scope-options">
        <label className="check-row">
          <input
            type="checkbox"
            checked={value.length === 0}
            onChange={() => onChange([])}
          />
          <span>All projects</span>
        </label>
        {projects.map((project) => (
          <label className="check-row" key={project.id}>
            <input
              type="checkbox"
              checked={value.includes(project.id)}
              onChange={() => toggle(project.id)}
            />
            <span>{project.name}</span>
          </label>
        ))}
      </div>
      <span className="muted small">Leave All projects selected to enable it everywhere.</span>
    </div>
  )
}

export function AddSkillForm({ projects, onDone, onCancel }: FormProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await createSkill({ name, description, content, projects: projectIds, overwrite })
      await onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="settings-form extension-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <FormHeader
        title="Add skill"
        hint="Saved as .ks-agent/skills/<name>/SKILL.md and available immediately."
      />
      {error && <div className="error-banner small">{error}</div>}
      <label className="field">
        <span>Name</span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="release-checklist"
          autoFocus
        />
      </label>
      <label className="field">
        <span>Description</span>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What this skill helps the agent do"
        />
      </label>
      <ProjectScopeField projects={projects} value={projectIds} onChange={setProjectIds} />
      <label className="field">
        <span>Instructions</span>
        <textarea
          rows={7}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Step-by-step instructions the agent should follow…"
        />
      </label>
      <label className="check-row">
        <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
        <span>Overwrite if this skill already exists</span>
      </label>
      <FormActions
        busy={busy}
        disabled={!name.trim() || !description.trim() || !content.trim()}
        label="Add skill"
        onCancel={onCancel}
      />
    </form>
  )
}

export function AddMcpForm({ projects, onDone, onCancel, onError }: FormProps) {
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [env, setEnv] = useState('')
  const [cwd, setCwd] = useState('')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState('')
  const [installCommand, setInstallCommand] = useState('')
  const [autoInstall, setAutoInstall] = useState(false)
  const [backgroundInstall, setBackgroundInstall] = useState(true)
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const serverName = name.trim().toLowerCase()
      await createMcpServer({
        name,
        transport,
        projects: projectIds,
        installCommand: installCommand.trim() || undefined,
        ...(transport === 'stdio'
          ? { command, args: splitLines(args), env: parsePairs(env, '='), cwd: cwd.trim() || undefined }
          : { url, headers: parsePairs(headers, ':') })
      })
      if (autoInstall && installCommand.trim()) {
        try {
          await installMcpServer(serverName, backgroundInstall)
        } catch (caught) {
          await onDone()
          onError?.(caught instanceof Error ? caught.message : String(caught))
          return
        }
      }
      await onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="settings-form extension-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <FormHeader
        title="Add MCP server"
        hint="Saved to .ks-agent/mcp.json. The server starts immediately and its tools become available."
      />
      {error && <div className="error-banner small">{error}</div>}
      <div className="form-row">
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="filesystem"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Transport</span>
          <select value={transport} onChange={(event) => setTransport(event.target.value as 'stdio' | 'http' | 'sse')}>
            <option value="stdio">stdio</option>
            <option value="http">Streamable HTTP</option>
            <option value="sse">Legacy SSE</option>
          </select>
        </label>
      </div>
      {transport === 'stdio' ? (
        <>
          <label className="field">
            <span>Command</span>
            <input
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              placeholder="npx"
            />
          </label>
          <label className="field">
            <span>Arguments (one per line)</span>
            <textarea
              rows={3}
              value={args}
              onChange={(event) => setArgs(event.target.value)}
              placeholder={'-y\n@modelcontextprotocol/server-filesystem\n/path/to/folder'}
            />
          </label>
          <label className="field">
            <span>Environment (KEY=value, one per line, optional)</span>
            <textarea
              rows={2}
              value={env}
              onChange={(event) => setEnv(event.target.value)}
              placeholder="API_KEY=..."
            />
          </label>
          <label className="field">
            <span>Working directory (optional)</span>
            <input
              value={cwd}
              onChange={(event) => setCwd(event.target.value)}
              placeholder="Defaults to the KS Agent folder"
            />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span>URL</span>
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/mcp"
            />
          </label>
          <label className="field">
            <span>Headers (Name: value, one per line, optional)</span>
            <textarea
              rows={2}
              value={headers}
              onChange={(event) => setHeaders(event.target.value)}
              placeholder="Authorization: Bearer ..."
            />
          </label>
        </>
      )}
      <label className="field">
        <span>Install command (optional)</span>
        <input
          value={installCommand}
          onChange={(event) => setInstallCommand(event.target.value)}
          placeholder="npx -y @modelcontextprotocol/server-filesystem --help"
        />
        <small className="muted">Shown on the server card. Run it on the host when the server is missing.</small>
      </label>
      <ProjectScopeField projects={projects} value={projectIds} onChange={setProjectIds} />
      <label className="check-row">
        <input
          type="checkbox"
          checked={autoInstall}
          onChange={(event) => setAutoInstall(event.target.checked)}
          disabled={!installCommand.trim() || busy}
        />
        <span>Install automatically after adding</span>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={backgroundInstall}
          onChange={(event) => setBackgroundInstall(event.target.checked)}
          disabled={!installCommand.trim() || !autoInstall || busy}
        />
        <span>Run the automatic install in the background</span>
      </label>
      {!installCommand.trim() && (
        <span className="muted small">Add an install command to enable automatic installation.</span>
      )}
      <FormActions
        busy={busy}
        disabled={!name.trim() || (transport === 'stdio' ? !command.trim() : !/^https?:\/\//i.test(url.trim()))}
        label="Add MCP server"
        onCancel={onCancel}
      />
    </form>
  )
}

export function AddLspForm({ projects, onDone, onCancel, onError }: FormProps) {
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [extensions, setExtensions] = useState('')
  const [languageId, setLanguageId] = useState('')
  const [installCommand, setInstallCommand] = useState('')
  const [autoInstall, setAutoInstall] = useState(false)
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const applyPreset = (preset: (typeof LSP_PRESETS)[number]) => {
    setName(preset.name)
    setCommand(preset.command)
    setArgs(preset.args)
    setExtensions(preset.extensions)
    setLanguageId(preset.languageId)
    setInstallCommand(preset.installCommand)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await createLspServer({
        name,
        command,
        args: splitLines(args),
        extensions: extensions
          .split(/[\s,]+/)
          .map((item) => item.trim())
          .filter(Boolean),
        languageId: languageId.trim() || undefined,
        installCommand: installCommand.trim() || undefined,
        projects: projectIds
      })
      if (autoInstall && installCommand.trim()) {
        try {
          await installLspServer(name.trim())
        } catch (caught) {
          await onDone()
          onError?.(caught instanceof Error ? caught.message : String(caught))
          return
        }
      }
      await onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="settings-form extension-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <FormHeader
        title="Add language server"
        hint="Saved to .ks-agent/lsp.json. Servers start on demand when the agent checks a matching file."
      />
      {error && <div className="error-banner small">{error}</div>}
      <div className="lsp-presets">
        <span className="muted small">Common servers — click one to fill the form and show its install command.</span>
        <div className="lsp-preset-grid">
          {LSP_PRESETS.map((preset) => (
            <button
              key={preset.name}
              type="button"
              className="lsp-preset"
              onClick={() => applyPreset(preset)}
              disabled={busy}
            >
              <strong>{preset.label}</strong>
              <code>{preset.installCommand}</code>
            </button>
          ))}
        </div>
      </div>
      <div className="form-row">
        <label className="field">
          <span>Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="typescript"
            autoFocus
          />
        </label>
        <label className="field">
          <span>Language id (optional)</span>
          <input
            value={languageId}
            onChange={(event) => setLanguageId(event.target.value)}
            placeholder="typescript"
          />
        </label>
      </div>
      <label className="field">
        <span>Command</span>
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder="typescript-language-server"
        />
      </label>
      <label className="field">
        <span>Arguments (one per line)</span>
        <textarea
          rows={2}
          value={args}
          onChange={(event) => setArgs(event.target.value)}
          placeholder="--stdio"
        />
      </label>
      <label className="field">
        <span>Extensions (comma separated)</span>
        <input
          value={extensions}
          onChange={(event) => setExtensions(event.target.value)}
          placeholder=".ts, .tsx, .js, .jsx"
        />
      </label>
      <label className="field">
        <span>Install command (optional)</span>
        <input
          value={installCommand}
          onChange={(event) => setInstallCommand(event.target.value)}
          placeholder="npm i -g typescript-language-server typescript"
        />
        <small className="muted">Shown on the server card. Run it on the host if the command is missing.</small>
      </label>
      <ProjectScopeField projects={projects} value={projectIds} onChange={setProjectIds} />
      <label className="check-row">
        <input
          type="checkbox"
          checked={autoInstall}
          onChange={(event) => setAutoInstall(event.target.checked)}
          disabled={!installCommand.trim() || busy}
        />
        <span>Install automatically after adding</span>
      </label>
      {!installCommand.trim() && (
        <span className="muted small">Add an install command to enable automatic installation.</span>
      )}
      <FormActions
        busy={busy}
        disabled={!name.trim() || !command.trim() || !extensions.trim()}
        label="Add language server"
        onCancel={onCancel}
      />
    </form>
  )
}

export function EditSkillForm({ projects, name, onDone, onCancel }: FormProps & { name: string }) {
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [nextName, setNextName] = useState(name)
  const [description, setDescription] = useState('')
  const [content, setContent] = useState('')
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getSkill(name)
      .then((skill) => {
        if (cancelled) return
        setDetail(skill)
        setNextName(skill.name)
        setDescription(skill.description)
        setContent(skill.content)
        setProjectIds(skill.projects)
        setError(null)
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const submit = async () => {
    if (!detail) return
    setBusy(true)
    setError(null)
    try {
      await updateSkill(detail.name, {
        name: nextName,
        description,
        content,
        projects: projectIds
      })
      await onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="muted small">Loading skill…</p>
  if (!detail) return <div className="error-banner small">{error || 'Skill not found.'}</div>

  return (
    <form
      className="settings-form extension-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <FormHeader
        title={`Edit ${detail.name}`}
        hint="Saving rewrites SKILL.md. Renaming moves the skill folder safely."
      />
      {error && <div className="error-banner small">{error}</div>}
      <label className="field">
        <span>Name</span>
        <input value={nextName} onChange={(event) => setNextName(event.target.value)} autoFocus />
        <small className="muted">Changing the name renames the skill folder and frontmatter.</small>
      </label>
      <label className="field">
        <span>Description</span>
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <ProjectScopeField projects={projects} value={projectIds} onChange={setProjectIds} />
      <label className="field">
        <span>Instructions</span>
        <textarea rows={8} value={content} onChange={(event) => setContent(event.target.value)} />
      </label>
      <FormActions
        busy={busy}
        disabled={!nextName.trim() || !description.trim() || !content.trim()}
        label="Save skill"
        onCancel={onCancel}
      />
    </form>
  )
}

export function EditMcpForm({ projects, name, onDone, onCancel, onError }: FormProps & { name: string }) {
  const [detail, setDetail] = useState<McpServerDetail | null>(null)
  const [transport, setTransport] = useState<'stdio' | 'http' | 'sse'>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [env, setEnv] = useState('')
  const [cwd, setCwd] = useState('')
  const [url, setUrl] = useState('')
  const [headers, setHeaders] = useState('')
  const [installCommand, setInstallCommand] = useState('')
  const [autoInstall, setAutoInstall] = useState(false)
  const [backgroundInstall, setBackgroundInstall] = useState(true)
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getMcpServer(name)
      .then((server) => {
        if (cancelled) return
        setDetail(server)
        setTransport(server.transport)
        setCommand(server.command ?? '')
        setArgs(server.args.join('\n'))
        setEnv(formatPairs(server.env, '='))
        setCwd(server.cwd ?? '')
        setUrl(server.url ?? '')
        setHeaders(formatPairs(server.headers, ':'))
        setInstallCommand(server.installCommand ?? '')
        setProjectIds(server.projects)
        setError(null)
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const submit = async () => {
    if (!detail) return
    setBusy(true)
    setError(null)
    try {
      await updateMcpServer(detail.name, {
        transport,
        installCommand: installCommand.trim(),
        projects: projectIds,
        ...(transport === 'stdio'
          ? { command, args: splitLines(args), env: parsePairs(env, '='), cwd: cwd.trim() }
          : { command: '', args: [], env: {}, cwd: '', url, headers: parsePairs(headers, ':') })
      })
      if (autoInstall && installCommand.trim()) {
        try {
          await installMcpServer(detail.name, backgroundInstall)
        } catch (caught) {
          await onDone()
          onError?.(caught instanceof Error ? caught.message : String(caught))
          return
        }
      }
      await onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="muted small">Loading MCP server…</p>
  if (!detail) return <div className="error-banner small">{error || 'MCP server not found.'}</div>

  return (
    <form
      className="settings-form extension-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <FormHeader
        title={`Edit ${detail.name}`}
        hint="Saving rewrites .ks-agent/mcp.json and restarts the server."
      />
      {error && <div className="error-banner small">{error}</div>}
      <div className="form-row">
        <label className="field">
          <span>Name</span>
          <input value={detail.name} readOnly />
        </label>
        <label className="field">
          <span>Transport</span>
          <select value={transport} onChange={(event) => setTransport(event.target.value as 'stdio' | 'http' | 'sse')}>
            <option value="stdio">stdio</option>
            <option value="http">Streamable HTTP</option>
            <option value="sse">Legacy SSE</option>
          </select>
        </label>
      </div>
      {transport === 'stdio' ? (
        <>
          <label className="field">
            <span>Command</span>
            <input value={command} onChange={(event) => setCommand(event.target.value)} />
          </label>
          <label className="field">
            <span>Arguments (one per line)</span>
            <textarea rows={3} value={args} onChange={(event) => setArgs(event.target.value)} />
          </label>
          <label className="field">
            <span>Environment (KEY=value, one per line, optional)</span>
            <textarea rows={2} value={env} onChange={(event) => setEnv(event.target.value)} />
          </label>
          <label className="field">
            <span>Working directory (optional)</span>
            <input value={cwd} onChange={(event) => setCwd(event.target.value)} placeholder="Defaults to the KS Agent folder" />
          </label>
        </>
      ) : (
        <>
          <label className="field">
            <span>URL</span>
            <input value={url} onChange={(event) => setUrl(event.target.value)} />
          </label>
          <label className="field">
            <span>Headers (Name: value, one per line, optional)</span>
            <textarea rows={2} value={headers} onChange={(event) => setHeaders(event.target.value)} />
          </label>
        </>
      )}
      <label className="field">
        <span>Install command (optional)</span>
        <input
          value={installCommand}
          onChange={(event) => setInstallCommand(event.target.value)}
          placeholder="npx -y @modelcontextprotocol/server-filesystem --help"
        />
        <small className="muted">Leave blank to remove the install command.</small>
      </label>
      <ProjectScopeField projects={projects} value={projectIds} onChange={setProjectIds} />
      <label className="check-row">
        <input
          type="checkbox"
          checked={autoInstall}
          onChange={(event) => setAutoInstall(event.target.checked)}
          disabled={!installCommand.trim() || busy}
        />
        <span>Run the install command after saving</span>
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={backgroundInstall}
          onChange={(event) => setBackgroundInstall(event.target.checked)}
          disabled={!installCommand.trim() || !autoInstall || busy}
        />
        <span>Run that install in the background</span>
      </label>
      <FormActions
        busy={busy}
        disabled={transport === 'stdio' ? !command.trim() : !/^https?:\/\//i.test(url.trim())}
        label="Save MCP server"
        onCancel={onCancel}
      />
    </form>
  )
}

export function EditLspForm({ projects, name, onDone, onCancel, onError }: FormProps & { name: string }) {
  const [detail, setDetail] = useState<LspServerDetail | null>(null)
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [extensions, setExtensions] = useState('')
  const [languageId, setLanguageId] = useState('')
  const [installCommand, setInstallCommand] = useState('')
  const [env, setEnv] = useState('')
  const [autoInstall, setAutoInstall] = useState(false)
  const [projectIds, setProjectIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void getLspServer(name)
      .then((server) => {
        if (cancelled) return
        setDetail(server)
        setCommand(server.command)
        setArgs(server.args.join('\n'))
        setExtensions(server.extensions.join(', '))
        setLanguageId(server.languageId)
        setInstallCommand(server.installCommand ?? '')
        setEnv(formatPairs(server.env, '='))
        setProjectIds(server.projects)
        setError(null)
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [name])

  const submit = async () => {
    if (!detail) return
    setBusy(true)
    setError(null)
    try {
      await updateLspServer(detail.name, {
        command,
        args: splitLines(args),
        extensions: extensions
          .split(/[\s,]+/)
          .map((item) => item.trim())
          .filter(Boolean),
        languageId: languageId.trim() || undefined,
        installCommand: installCommand.trim(),
        env: parsePairs(env, '='),
        projects: projectIds
      })
      if (autoInstall && installCommand.trim()) {
        try {
          await installLspServer(detail.name)
        } catch (caught) {
          await onDone()
          onError?.(caught instanceof Error ? caught.message : String(caught))
          return
        }
      }
      await onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="muted small">Loading language server…</p>
  if (!detail) return <div className="error-banner small">{error || 'Language server not found.'}</div>

  return (
    <form
      className="settings-form extension-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <FormHeader
        title={`Edit ${detail.name}`}
        hint="Saving rewrites .ks-agent/lsp.json. Running servers restart on demand."
      />
      {error && <div className="error-banner small">{error}</div>}
      <div className="form-row">
        <label className="field">
          <span>Name</span>
          <input value={detail.name} readOnly />
        </label>
        <label className="field">
          <span>Language id</span>
          <input value={languageId} onChange={(event) => setLanguageId(event.target.value)} />
        </label>
      </div>
      <label className="field">
        <span>Command</span>
        <input value={command} onChange={(event) => setCommand(event.target.value)} />
      </label>
      <label className="field">
        <span>Arguments (one per line)</span>
        <textarea rows={2} value={args} onChange={(event) => setArgs(event.target.value)} />
      </label>
      <label className="field">
        <span>Extensions (comma separated)</span>
        <input value={extensions} onChange={(event) => setExtensions(event.target.value)} />
      </label>
      <label className="field">
        <span>Environment (KEY=value, one per line, optional)</span>
        <textarea rows={2} value={env} onChange={(event) => setEnv(event.target.value)} />
      </label>
      <label className="field">
        <span>Install command (optional)</span>
        <input
          value={installCommand}
          onChange={(event) => setInstallCommand(event.target.value)}
          placeholder="npm i -g typescript-language-server typescript"
        />
        <small className="muted">Leave blank to remove the install command.</small>
      </label>
      <ProjectScopeField projects={projects} value={projectIds} onChange={setProjectIds} />
      <label className="check-row">
        <input
          type="checkbox"
          checked={autoInstall}
          onChange={(event) => setAutoInstall(event.target.checked)}
          disabled={!installCommand.trim() || busy}
        />
        <span>Run the install command after saving</span>
      </label>
      <FormActions
        busy={busy}
        disabled={!command.trim() || !extensions.trim()}
        label="Save language server"
        onCancel={onCancel}
      />
    </form>
  )
}
