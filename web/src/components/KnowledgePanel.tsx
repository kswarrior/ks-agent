import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createGlobalKnowledge,
  createProjectKnowledge,
  deleteKnowledge,
  generateProjectKnowledge,
  listGlobalKnowledge,
  listProjectKnowledge,
  updateKnowledge
} from '../api'
import type { KnowledgeEntry, ModelEntry } from '../types'
import { ConfirmModal } from './Modal'

type KnowledgeScope = 'global' | 'project'

interface EditorState {
  scope: KnowledgeScope
  id?: string
  title: string
  content: string
  enabled: boolean
}

function preview(content: string): string {
  const text = content.replace(/\s+/g, ' ').trim()
  return text.length > 260 ? `${text.slice(0, 260)}…` : text
}

function KnowledgeCard({
  entry,
  busy,
  onEdit,
  onToggle,
  onDelete
}: {
  entry: KnowledgeEntry
  busy: boolean
  onEdit: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  return (
    <div className={`extension-card knowledge-card ${entry.enabled ? '' : 'disabled'}`}>
      <div className="extension-head">
        <div>
          <strong>{entry.title}</strong>
          <span className="muted small"> {entry.source === 'generated' ? 'generated' : 'manual'}</span>
        </div>
        <span className={`status ${entry.enabled ? 'ready' : 'disabled'}`}>
          {entry.enabled ? 'enabled' : 'disabled'}
        </span>
      </div>
      <p className="knowledge-preview">{preview(entry.content)}</p>
      <div className="muted small">Updated {new Date(entry.updatedAt).toLocaleString()}</div>
      <div className="extension-card-actions">
        <button className="btn ghost small" onClick={onEdit} disabled={busy}>
          Edit
        </button>
        <button className="btn ghost small" onClick={onToggle} disabled={busy}>
          {entry.enabled ? 'Disable' : 'Enable'}
        </button>
        <button className="btn ghost small danger" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
    </div>
  )
}

export function KnowledgePanel({
  projectId,
  models
}: {
  projectId: string | null
  models: ModelEntry[]
}) {
  const [globalEntries, setGlobalEntries] = useState<KnowledgeEntry[]>([])
  const [projectEntries, setProjectEntries] = useState<KnowledgeEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [busyLabel, setBusyLabel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeEntry | null>(null)
  const [modelId, setModelId] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [global, project] = await Promise.all([
        listGlobalKnowledge(),
        projectId ? listProjectKnowledge(projectId) : Promise.resolve([])
      ])
      setGlobalEntries(global)
      setProjectEntries(project)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setEditor(null)
    setNotice(null)
  }, [projectId])

  const defaultModel = useMemo(() => {
    if (models.some((model) => model.id === modelId)) return modelId
    return models[0]?.id ?? ''
  }, [models, modelId])

  const save = async () => {
    if (!editor) return
    if (!editor.title.trim() || !editor.content.trim()) {
      setError('Title and content are required.')
      return
    }
    if (editor.scope === 'project' && !projectId) {
      setError('Select a project first.')
      return
    }
    setBusyLabel('save')
    setError(null)
    setNotice(null)
    try {
      if (editor.id) {
        await updateKnowledge(editor.id, {
          title: editor.title,
          content: editor.content,
          enabled: editor.enabled
        })
        setNotice('Knowledge entry updated.')
      } else if (editor.scope === 'global') {
        await createGlobalKnowledge({
          title: editor.title,
          content: editor.content,
          enabled: editor.enabled
        })
        setNotice('User knowledge added.')
      } else if (projectId) {
        await createProjectKnowledge(projectId, {
          title: editor.title,
          content: editor.content,
          enabled: editor.enabled
        })
        setNotice('Project knowledge added.')
      }
      setEditor(null)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusyLabel(null)
    }
  }

  const toggle = async (entry: KnowledgeEntry) => {
    setBusyLabel(entry.id)
    setError(null)
    setNotice(null)
    try {
      await updateKnowledge(entry.id, { enabled: !entry.enabled })
      if (entry.scope === 'global') {
        setGlobalEntries((current) =>
          current.map((item) => (item.id === entry.id ? { ...item, enabled: !entry.enabled } : item))
        )
      } else {
        setProjectEntries((current) =>
          current.map((item) => (item.id === entry.id ? { ...item, enabled: !entry.enabled } : item))
        )
      }
      setNotice(`${entry.title} ${entry.enabled ? 'disabled' : 'enabled'}.`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusyLabel(null)
    }
  }

  const remove = async () => {
    if (!confirmDelete) return
    setBusyLabel(confirmDelete.id)
    setError(null)
    setNotice(null)
    try {
      await deleteKnowledge(confirmDelete.id)
      setConfirmDelete(null)
      await load()
      setNotice('Knowledge entry deleted.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusyLabel(null)
    }
  }

  const generate = async () => {
    if (!projectId) return
    setBusyLabel('generate')
    setError(null)
    setNotice(null)
    try {
      const entry = await generateProjectKnowledge(projectId, defaultModel || undefined)
      await load()
      setNotice('Project summary ready.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusyLabel(null)
    }
  }

  const startAdd = (scope: KnowledgeScope) => {
    setEditor({ scope, title: '', content: '', enabled: true })
    setError(null)
    setNotice(null)
  }

  const startEdit = (entry: KnowledgeEntry) => {
    setEditor({
      scope: entry.scope,
      id: entry.id,
      title: entry.title,
      content: entry.content,
      enabled: entry.enabled
    })
    setError(null)
    setNotice(null)
  }

  const sections: Array<{ scope: KnowledgeScope; title: string; hint: string; entries: KnowledgeEntry[] }> = [
    {
      scope: 'global',
      title: 'User knowledge',
      hint: 'Applies to every project. Use it for preferences, conventions and personal context.',
      entries: globalEntries
    },
    {
      scope: 'project',
      title: 'Project knowledge',
      hint: 'Specific to the active project. Generated summaries and manual notes live here.',
      entries: projectEntries
    }
  ]

  return (
    <div className="knowledge-panel">
      {loading && <div className="muted small">Loading knowledge…</div>}
      {error && <div className="error-banner small">{error}</div>}
      {notice && <div className="extension-notice">{notice}</div>}

      {sections.map((section) => (
        <section className="knowledge-section" key={section.scope}>
          <div className="knowledge-section-head">
            <div>
              <strong>{section.title}</strong>
              <p className="muted small">{section.hint}</p>
            </div>
            <button
              className="btn ghost small"
              onClick={() => startAdd(section.scope)}
              disabled={busyLabel !== null || (section.scope === 'project' && !projectId)}
            >
              Add knowledge
            </button>
          </div>

          {section.scope === 'project' && (
            <div className="knowledge-generate">
              <div>
                <strong>Generate project summary</strong>
                <p className="muted small">
                  Scans the project tree and key files. Select a model for an AI-written summary, or scan without one.
                </p>
              </div>
              <div className="knowledge-generate-actions">
                <select
                  value={defaultModel}
                  onChange={(event) => setModelId(event.target.value)}
                  disabled={busyLabel !== null || !projectId}
                >
                  <option value="">Scan only (no model)</option>
                  {models.map((model) => (
                    <option value={model.id} key={model.id}>
                      {model.name || model.modelId}
                    </option>
                  ))}
                </select>
                <button
                  className="btn primary small"
                  onClick={() => void generate()}
                  disabled={busyLabel !== null || !projectId}
                >
                  {busyLabel === 'generate' ? 'Generating…' : 'Generate summary'}
                </button>
              </div>
            </div>
          )}

          {section.scope === 'project' && !projectId ? (
            <p className="empty-hint">Select a project to manage project knowledge.</p>
          ) : section.entries.length === 0 ? (
            <p className="empty-hint">
              {section.scope === 'global'
                ? 'No user knowledge yet. Add preferences or context that should follow you across projects.'
                : 'No project knowledge yet. Generate a summary or add a note.'}
            </p>
          ) : (
            <div className="extension-grid">
              {section.entries.map((entry) => (
                <KnowledgeCard
                  key={entry.id}
                  entry={entry}
                  busy={busyLabel !== null}
                  onEdit={() => startEdit(entry)}
                  onToggle={() => void toggle(entry)}
                  onDelete={() => setConfirmDelete(entry)}
                />
              ))}
            </div>
          )}

          {editor?.scope === section.scope && (
            <form
              className="settings-form knowledge-editor"
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <div className="extension-head">
                <strong>{editor.id ? 'Edit knowledge' : `Add ${section.scope} knowledge`}</strong>
                <span className="muted small">{editor.scope === 'global' ? 'All projects' : 'This project'}</span>
              </div>
              <label className="field">
                <span>Title</span>
                <input
                  value={editor.title}
                  onChange={(event) => setEditor({ ...editor, title: event.target.value })}
                  placeholder="Release conventions"
                  autoFocus
                />
              </label>
              <label className="field">
                <span>Content</span>
                <textarea
                  rows={10}
                  value={editor.content}
                  onChange={(event) => setEditor({ ...editor, content: event.target.value })}
                  placeholder="Facts, preferences, commands and conventions the agent should remember…"
                />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={editor.enabled}
                  onChange={(event) => setEditor({ ...editor, enabled: event.target.checked })}
                />
                <span>Enabled for chats</span>
              </label>
              <div className="settings-form-actions">
                <button type="button" className="btn ghost" onClick={() => setEditor(null)} disabled={busyLabel !== null}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn primary"
                  disabled={busyLabel !== null || !editor.title.trim() || !editor.content.trim()}
                >
                  {busyLabel === 'save' ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </section>
      ))}

      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${confirmDelete.title}"?`}
          message="This permanently removes the knowledge entry. It will stop being injected into chats."
          confirmLabel="Delete"
          onConfirm={() => void remove()}
          onClose={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
