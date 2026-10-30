import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'
import type { Backup, DirectoryListing, Project } from '../types'
import { ConfirmModal, Modal } from './Modal'

function ArchiveIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  )
}

function PlusIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function LinkIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function UploadIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function RefreshIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  )
}

function DownloadIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function TrashIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function RestoreIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}

function FolderIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v10z" />
    </svg>
  )
}

function ChatIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function formatSize(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatWhen(value: number): string {
  const date = new Date(value)
  const now = new Date()
  if (Number.isNaN(date.getTime())) return ''
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function projectSlug(name: string): string {
  return (
    name
      .trim()
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 50) || 'project'
  )
}

function suggestedName(project: Project): string {
  const stamp = new Date()
    .toISOString()
    .replace(/\.\d+Z$/, '')
    .replace('T', '-')
    .replace(/:/g, '-')
  return `${projectSlug(project.name)}-backup-${stamp}.zip`
}

function sourceLabel(backup: Backup): string {
  if (backup.source === 'uploaded') return 'Uploaded'
  if (backup.source === 'url') return 'From URL'
  return 'Created'
}

function FolderPicker({
  initialPath,
  onSelect,
  onClose
}: {
  initialPath: string
  onSelect: (path: string) => void
  onClose: () => void
}) {
  const [listing, setListing] = useState<DirectoryListing | null>(null)
  const [pathInput, setPathInput] = useState(initialPath)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async (target?: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listDirectories(target)
      setListing(data)
      setPathInput(data.path)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load(initialPath)
  }, [initialPath])

  return (
    <Modal title="Select backup folder" onClose={onClose}>
      {error && <div className="error-banner small">{error}</div>}
      <form
        className="folder-picker-path"
        onSubmit={(event) => {
          event.preventDefault()
          if (pathInput.trim()) void load(pathInput.trim())
        }}
      >
        <input
          value={pathInput}
          onChange={(event) => setPathInput(event.target.value)}
          placeholder="/path/to/folder"
          aria-label="Folder path"
          autoFocus
        />
        <button className="btn ghost" type="submit" disabled={loading}>
          Go
        </button>
      </form>

      {listing && (
        <>
          <div className="folder-picker-shortcuts">
            <button type="button" className="btn ghost small" onClick={() => void load(listing.home)}>
              Home
            </button>
            <button type="button" className="btn ghost small" onClick={() => void load(listing.projectsDir)}>
              KS projects
            </button>
            <button type="button" className="btn ghost small" onClick={() => void load(listing.root)}>
              App folder
            </button>
          </div>
          <div className="folder-picker-list">
            {listing.parent && (
              <button type="button" className="folder-picker-item parent" onClick={() => void load(listing.parent ?? undefined)}>
                <span aria-hidden="true">..</span>
                <span className="muted small">Parent folder</span>
              </button>
            )}
            {listing.directories.map((directory) => (
              <button
                type="button"
                className="folder-picker-item"
                key={directory.path}
                onClick={() => void load(directory.path)}
              >
                <span>{directory.name}</span>
              </button>
            ))}
            {listing.directories.length === 0 && <p className="empty-hint">No folders here.</p>}
          </div>
          {listing.truncated && <p className="muted small">Showing the first 500 folders.</p>}
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={!listing || loading}
          onClick={() => {
            if (listing) onSelect(listing.path)
          }}
        >
          {loading ? 'Loading…' : 'Select this folder'}
        </button>
      </div>
    </Modal>
  )
}

function LocationField({
  value,
  onChange,
  onBrowse
}: {
  value: string
  onChange: (value: string) => void
  onBrowse: () => void
}) {
  return (
    <label className="field">
      <span>Save to folder</span>
      <div className="backup-path-row">
        <input value={value} onChange={(event) => onChange(event.target.value)} aria-label="Backup folder" />
        <button type="button" className="btn ghost small" onClick={onBrowse}>
          <FolderIcon className="btn-icon" />
          Browse
        </button>
      </div>
      <small>Defaults to the project folder.</small>
    </label>
  )
}

function CreateBackupModal({
  project,
  onClose,
  onCreated
}: {
  project: Project
  onClose: () => void
  onCreated: (backup: Backup) => void
}) {
  const [location, setLocation] = useState(project.path)
  const [name, setName] = useState(() => suggestedName(project))
  const [includeChats, setIncludeChats] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!location.trim() || !name.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const backup = await api.createProjectBackup(project.id, {
        location: location.trim(),
        name: name.trim(),
        includeChats
      })
      onCreated(backup)
      onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal title="Create backup" onClose={onClose}>
        {error && <div className="error-banner small">{error}</div>}
        <form
          className="backup-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <LocationField value={location} onChange={setLocation} onBrowse={() => setPickerOpen(true)} />
          <label className="field">
            <span>File name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="project-backup.zip"
              aria-label="Backup file name"
            />
            <small>Saved as a .zip archive.</small>
          </label>
          <label className="backup-check">
            <input
              type="checkbox"
              checked={includeChats}
              onChange={(event) => setIncludeChats(event.target.checked)}
            />
            <span>
              <strong>Save chats</strong>
              <small>Include conversations, messages and summaries.</small>
            </span>
          </label>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy || !location.trim() || !name.trim()}>
              {busy ? 'Creating…' : 'Create backup'}
            </button>
          </div>
        </form>
      </Modal>
      {pickerOpen && (
        <FolderPicker
          initialPath={location}
          onClose={() => setPickerOpen(false)}
          onSelect={(path) => {
            setLocation(path)
            setPickerOpen(false)
          }}
        />
      )}
    </>
  )
}

function UrlBackupModal({
  project,
  onClose,
  onAdded
}: {
  project: Project
  onClose: () => void
  onAdded: (backup: Backup) => void
}) {
  const [url, setUrl] = useState('')
  const [location, setLocation] = useState(project.path)
  const [name, setName] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!url.trim() || !location.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const backup = await api.addProjectBackupFromUrl(project.id, {
        url: url.trim(),
        location: location.trim(),
        name: name.trim() || undefined
      })
      onAdded(backup)
      onClose()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Modal title="Add backup from URL" onClose={onClose}>
        {error && <div className="error-banner small">{error}</div>}
        <form
          className="backup-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label className="field">
            <span>Backup URL</span>
            <input
              autoFocus
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/project-backup.zip"
              aria-label="Backup URL"
            />
          </label>
          <LocationField value={location} onChange={setLocation} onBrowse={() => setPickerOpen(true)} />
          <label className="field">
            <span>File name (optional)</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Automatic from URL"
              aria-label="Backup file name"
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={busy || !url.trim() || !location.trim()}>
              {busy ? 'Downloading…' : 'Add backup'}
            </button>
          </div>
        </form>
      </Modal>
      {pickerOpen && (
        <FolderPicker
          initialPath={location}
          onClose={() => setPickerOpen(false)}
          onSelect={(path) => {
            setLocation(path)
            setPickerOpen(false)
          }}
        />
      )}
    </>
  )
}

export function BackupPanel({
  project,
  onRestored
}: {
  project: Project
  onRestored?: () => void
}) {
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [urlOpen, setUrlOpen] = useState(false)
  const [restoreTarget, setRestoreTarget] = useState<Backup | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Backup | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setBackups(await api.listProjectBackups(project.id))
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [project.id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setBackups([])
    setError(null)
    setNotice(null)
    setCreateOpen(false)
    setUrlOpen(false)
    setRestoreTarget(null)
    setDeleteTarget(null)
  }, [project.id])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 3000)
    return () => clearTimeout(timer)
  }, [notice])

  const added = (backup: Backup) => {
    setBackups((current) => [backup, ...current.filter((item) => item.id !== backup.id)])
    setNotice(`Saved ${backup.name}`)
    setError(null)
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      added(await api.uploadProjectBackup(project.id, file, project.path))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const restore = async (backup: Backup) => {
    setBusy(true)
    setError(null)
    try {
      const result = await api.restoreProjectBackup(project.id, backup.id)
      const parts = [`${result.files} file${result.files === 1 ? '' : 's'}`]
      if (result.chats > 0) parts.push(`${result.chats} chat${result.chats === 1 ? '' : 's'}`)
      setNotice(`Restored ${parts.join(' and ')}`)
      onRestored?.()
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (backup: Backup) => {
    setBusy(true)
    setError(null)
    try {
      await api.deleteProjectBackup(project.id, backup.id)
      setBackups((current) => current.filter((item) => item.id !== backup.id))
      setNotice(`Deleted ${backup.name}`)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="backup-panel">
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(event) => void upload(event.target.files?.[0])}
      />
      <div className="backup-toolbar">
        <button className="btn primary small" onClick={() => setCreateOpen(true)} disabled={busy}>
          <PlusIcon className="btn-icon" />
          Create
        </button>
        <button className="btn ghost small" onClick={() => setUrlOpen(true)} disabled={busy}>
          <LinkIcon className="btn-icon" />
          From URL
        </button>
        <button
          className="btn ghost small"
          onClick={() => fileInputRef.current?.click()}
          disabled={busy}
        >
          <UploadIcon className="btn-icon" />
          Upload
        </button>
        <button className="icon-btn" onClick={() => void load()} aria-label="Refresh backups" title="Refresh">
          <RefreshIcon className="icon-btn-icon" />
        </button>
      </div>

      {error && <div className="error-banner small">{error}</div>}
      {notice && <div className="files-notice">{notice}</div>}

      {loading ? (
        <div className="files-empty">Loading backups…</div>
      ) : backups.length === 0 ? (
        <div className="backup-empty">
          <ArchiveIcon className="backup-empty-icon" />
          <strong>No backups yet</strong>
          <p>Create a .zip backup of this project, upload one, or add one from a URL.</p>
        </div>
      ) : (
        <div className="backup-list">
          {backups.map((backup) => (
            <div key={backup.id} className="backup-row-wrap">
              <div className="backup-row">
                <span className="backup-row-icon" aria-hidden="true">
                  <ArchiveIcon className="files-row-icon" />
                </span>
                <div className="backup-row-main">
                  <span className="backup-row-name" title={backup.path}>
                    {backup.name}
                  </span>
                  <span className="backup-row-meta">
                    {formatSize(backup.size)} · {formatWhen(backup.createdAt)} · {sourceLabel(backup)}
                    {backup.includesChats ? ' · chats' : ''}
                    {!backup.exists ? ' · missing' : ''}
                  </span>
                </div>
                <div className="backup-row-actions">
                  <button
                    className="backup-icon-btn"
                    onClick={() => setRestoreTarget(backup)}
                    disabled={busy || !backup.exists}
                    aria-label={`Restore ${backup.name}`}
                    title="Restore"
                  >
                    <RestoreIcon className="backup-action-icon" />
                  </button>
                  <button
                    className="backup-icon-btn"
                    onClick={() => {
                      const link = document.createElement('a')
                      link.href = api.projectBackupDownloadUrl(project.id, backup.id)
                      link.download = backup.name
                      document.body.appendChild(link)
                      link.click()
                      link.remove()
                    }}
                    disabled={busy || !backup.exists}
                    aria-label={`Download ${backup.name}`}
                    title="Download"
                  >
                    <DownloadIcon className="backup-action-icon" />
                  </button>
                  <button
                    className="backup-icon-btn danger"
                    onClick={() => setDeleteTarget(backup)}
                    disabled={busy}
                    aria-label={`Delete ${backup.name}`}
                    title="Delete"
                  >
                    <TrashIcon className="backup-action-icon" />
                  </button>
                </div>
              </div>
              {backup.includesChats && (
                <span className="backup-chat-badge">
                  <ChatIcon className="backup-chat-badge-icon" />
                  chats
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {createOpen && (
        <CreateBackupModal project={project} onClose={() => setCreateOpen(false)} onCreated={added} />
      )}
      {urlOpen && (
        <UrlBackupModal project={project} onClose={() => setUrlOpen(false)} onAdded={added} />
      )}
      {restoreTarget && (
        <ConfirmModal
          title="Restore backup"
          message={`Restore "${restoreTarget.name}" into ${project.name}? Existing files with the same names will be overwritten.${
            restoreTarget.includesChats
              ? ' Saved chats will be added as new conversations.'
              : ''
          }`}
          confirmLabel="Restore"
          onConfirm={() => void restore(restoreTarget)}
          onClose={() => setRestoreTarget(null)}
        />
      )}
      {deleteTarget && (
        <ConfirmModal
          title="Delete backup"
          message={`Delete "${deleteTarget.name}"? The .zip file will also be removed from disk.`}
          confirmLabel="Delete"
          onConfirm={() => void remove(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
