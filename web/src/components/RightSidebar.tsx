import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as api from '../api'
import type { FileContent, FileEntry, FileListing, Project } from '../types'
import { TerminalTabs } from './TerminalTabs'

type RightTab = 'files' | 'terminal' | 'activity'

const TABS: Array<{ id: RightTab; label: string; soon?: boolean }> = [
  { id: 'files', label: 'Files' },
  { id: 'terminal', label: 'Terminal' },
  { id: 'activity', label: 'Activity', soon: true }
]

function joinRel(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

function parentOf(dir: string): string {
  const index = dir.lastIndexOf('/')
  return index === -1 ? '' : dir.slice(0, index)
}

function baseName(file: string): string {
  const parts = file.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? file
}

function formatSize(size?: number): string {
  if (typeof size !== 'number') return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </svg>
  )
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M6 2h8l4 4v16H6Z" />
      <path d="M14 2v4h4" />
    </svg>
  )
}

export function RightSidebar({ project, onClose }: { project: Project; onClose: () => void }) {
  const [tab, setTab] = useState<RightTab>('files')
  const active = TABS.find((entry) => entry.id === tab) ?? TABS[0]

  return (
    <aside className="right-sidebar" aria-label="Right sidebar">
      <div className="right-sidebar-head">
        <div className="right-sidebar-tabs" role="tablist" aria-label="Right sidebar sections">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              className={`settings-tab ${tab === entry.id ? 'active' : ''}`}
              onClick={() => setTab(entry.id)}
              role="tab"
              aria-selected={tab === entry.id}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close right sidebar" title="Close">
          ×
        </button>
      </div>
      <div className="right-sidebar-body">
        {tab === 'files' ? (
          <FilesPanel project={project} />
        ) : tab === 'terminal' ? (
          <XTermTerminal projectId={project.id} />
        ) : (
          <div className="right-sidebar-soon">
            <strong>{active.label}</strong>
            <p>Coming soon</p>
          </div>
        )}
      </div>
    </aside>
  )
}

function FilesPanel({ project }: { project: Project }) {
  const [dir, setDir] = useState('')
  const [listing, setListing] = useState<FileListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [openFile, setOpenFile] = useState<FileContent | null>(null)
  const [draft, setDraft] = useState('')
  const [fileLoading, setFileLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [createKind, setCreateKind] = useState<'file' | 'folder' | null>(null)
  const [newName, setNewName] = useState('')
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await api.listProjectFiles(project.id, dir)
      setListing(next)
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [project.id, dir])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setDir('')
    setListing(null)
    setQuery('')
    setError(null)
    setNotice(null)
    setOpenFile(null)
    setDraft('')
    setCreateKind(null)
    setRenaming(false)
    setConfirmDelete(false)
  }, [project.id])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 2000)
    return () => clearTimeout(timer)
  }, [notice])

  const entries = listing?.entries ?? []
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return entries
    return entries.filter((entry) => entry.name.toLowerCase().includes(term))
  }, [entries, query])

  const loadFile = async (path: string) => {
    setFileLoading(true)
    setError(null)
    setConfirmDelete(false)
    setRenaming(false)
    try {
      const next = await api.readProjectFile(project.id, path)
      setOpenFile(next)
      setDraft(next.content)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setFileLoading(false)
    }
  }

  const save = async () => {
    if (!openFile || openFile.binary) return
    setSaving(true)
    try {
      await api.writeProjectFile(project.id, openFile.path, draft)
      setOpenFile({ ...openFile, content: draft, size: new Blob([draft]).size })
      setNotice('Saved')
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  const submitCreate = async () => {
    const name = newName.trim()
    if (!createKind || !name) return
    setBusy(true)
    try {
      const path = joinRel(dir, name)
      await api.createFileEntry(project.id, createKind, path)
      setCreateKind(null)
      setNewName('')
      setError(null)
      await load()
      if (createKind === 'file') await loadFile(path)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const submitRename = async () => {
    if (!openFile) return
    const name = renameValue.trim()
    if (!name) return
    setBusy(true)
    try {
      const to = joinRel(parentOf(openFile.path), name)
      await api.renameFileEntry(project.id, openFile.path, to)
      setRenaming(false)
      setError(null)
      await load()
      await loadFile(to)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!openFile) return
    setBusy(true)
    try {
      await api.deleteFileEntry(project.id, openFile.path)
      setConfirmDelete(false)
      setOpenFile(null)
      setDraft('')
      setError(null)
      await load()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const upload = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setBusy(true)
    try {
      await api.uploadProjectFiles(project.id, dir, Array.from(files))
      setError(null)
      await load()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const download = () => {
    if (!openFile) return
    const link = document.createElement('a')
    link.href = api.projectFileDownloadUrl(project.id, openFile.path)
    link.download = baseName(openFile.path)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const crumbs = dir ? dir.split('/') : []

  if (openFile || fileLoading) {
    return (
      <div className="files-panel">
        <div className="files-file-head">
          <button
            className="icon-btn"
            onClick={() => {
              setOpenFile(null)
              setDraft('')
              setRenaming(false)
              setConfirmDelete(false)
            }}
            aria-label="Back to files"
            title="Back to files"
          >
            ←
          </button>
          <span className="files-file-name" title={openFile?.path}>
            {openFile?.path ?? 'Opening…'}
          </span>
        </div>

        {error && <div className="error-banner small">{error}</div>}

        {fileLoading && !openFile ? (
          <div className="files-empty">Loading…</div>
        ) : openFile ? (
          <>
            {renaming ? (
              <div className="files-inline-form">
                <input
                  className="input"
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitRename()
                    if (event.key === 'Escape') setRenaming(false)
                  }}
                  aria-label="New name"
                />
                <button className="btn primary small" onClick={() => void submitRename()} disabled={busy}>
                  Rename
                </button>
                <button className="btn ghost small" onClick={() => setRenaming(false)} disabled={busy}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="files-file-actions">
                {!openFile.binary && (
                  <button
                    className="btn primary small"
                    onClick={() => void save()}
                    disabled={saving || draft === openFile.content}
                  >
                    {saving ? 'Saving…' : 'Save'}
                  </button>
                )}
                <button className="btn ghost small" onClick={download}>
                  Download
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => {
                    setRenameValue(baseName(openFile.path))
                    setRenaming(true)
                  }}
                >
                  Rename
                </button>
                <button className="btn danger small" onClick={() => setConfirmDelete(true)}>
                  Delete
                </button>
              </div>
            )}

            {confirmDelete && (
              <div className="files-confirm">
                <span>Delete {baseName(openFile.path)}?</span>
                <button className="btn danger small" onClick={() => void remove()} disabled={busy}>
                  Delete
                </button>
                <button className="btn ghost small" onClick={() => setConfirmDelete(false)} disabled={busy}>
                  Cancel
                </button>
              </div>
            )}

            {openFile.binary ? (
              <div className="files-empty">Binary file — preview not available.</div>
            ) : (
              <textarea
                className="files-editor"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck={false}
                aria-label={`Edit ${openFile.path}`}
              />
            )}

            <div className="files-meta">
              {formatSize(openFile.size)}
              {notice ? ` · ${notice}` : ''}
            </div>
          </>
        ) : null}
      </div>
    )
  }

  return (
    <div className="files-panel">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        hidden
        onChange={(event) => void upload(event.target.files)}
      />
      <div className="files-toolbar">
        <button
          className="icon-btn"
          onClick={() => setDir(parentOf(dir))}
          disabled={!dir}
          aria-label="Up one level"
          title="Up one level"
        >
          ↑
        </button>
        <div className="files-breadcrumb">
          <button onClick={() => setDir('')}>Project</button>
          {crumbs.map((crumb, index) => (
            <Fragment key={`${crumb}-${index}`}>
              <span className="crumb-sep">/</span>
              <button onClick={() => setDir(crumbs.slice(0, index + 1).join('/'))}>{crumb}</button>
            </Fragment>
          ))}
        </div>
        <button className="icon-btn" onClick={() => void load()} aria-label="Refresh files" title="Refresh">
          ⟳
        </button>
      </div>

      <div className="files-actions">
        <button
          className="btn ghost small"
          onClick={() => {
            setCreateKind('file')
            setNewName('')
          }}
          disabled={busy}
        >
          New file
        </button>
        <button
          className="btn ghost small"
          onClick={() => {
            setCreateKind('folder')
            setNewName('')
          }}
          disabled={busy}
        >
          New folder
        </button>
        <button className="btn ghost small" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          Upload
        </button>
      </div>

      {createKind && (
        <div className="files-inline-form">
          <input
            className="input"
            autoFocus
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={createKind === 'folder' ? 'folder-name' : 'file-name.txt'}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submitCreate()
              if (event.key === 'Escape') setCreateKind(null)
            }}
            aria-label={createKind === 'folder' ? 'New folder name' : 'New file name'}
          />
          <button className="btn primary small" onClick={() => void submitCreate()} disabled={busy || !newName.trim()}>
            Create
          </button>
          <button className="btn ghost small" onClick={() => setCreateKind(null)} disabled={busy}>
            Cancel
          </button>
        </div>
      )}

      <input
        className="input files-search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter files"
        aria-label="Filter files"
      />

      {error && <div className="error-banner small">{error}</div>}
      {notice && <div className="files-notice">{notice}</div>}

      {loading ? (
        <div className="files-empty">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="files-empty">{query.trim() ? 'No matching files' : 'This folder is empty'}</div>
      ) : (
        <div className="files-list">
          {filtered.map((entry: FileEntry) => (
            <button
              key={`${entry.type}-${entry.name}`}
              className="files-row"
              onClick={() => {
                const path = joinRel(dir, entry.name)
                if (entry.type === 'dir') setDir(path)
                else void loadFile(path)
              }}
              title={joinRel(dir, entry.name)}
            >
              <span className="files-row-icon">{entry.type === 'dir' ? <FolderIcon /> : <FileIcon />}</span>
              <span className="files-row-name">{entry.name}</span>
              {entry.type === 'file' && <span className="files-row-size">{formatSize(entry.size)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
