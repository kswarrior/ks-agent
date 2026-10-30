import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as api from '../api'
import type { FileContent, FileEntry, FileListing, Project } from '../types'
import { FileEditor } from './FileEditor'
import { TerminalTabs } from './TerminalTabs'

function FolderIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v10z" />
    </svg>
  )
}

function FileIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}

function CodeIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  )
}

function ImageIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function AudioIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function VideoIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  )
}

function ArchiveIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="21 8 21 21 3 21 3 8" />
      <rect x="1" y="3" width="22" height="5" />
      <line x1="10" y1="12" x2="14" y2="12" />
    </svg>
  )
}

function ConfigIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function LockIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function DockerIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6.29V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
      <path d="M4 11h16" />
      <path d="M4 16h16" />
      <path d="M10 4v2" />
      <path d="M14 4v2" />
    </svg>
  )
}

function PackageIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
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

function UploadIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
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

function CaretDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function ChevronLeftIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
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

function EditIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
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

function CopyIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  )
}

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  )
}

function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}

function XIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function GlobeIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  )
}

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

function getFileIcon(name: string): React.ReactElement {
  const lower = name.toLowerCase()
  if (lower === 'dockerfile') return <DockerIcon className="files-row-icon" />
  if (lower === 'makefile') return <ConfigIcon className="files-row-icon" />
  if (lower === 'package.json' || lower === 'package-lock.json') return <PackageIcon className="files-row-icon" />
  if (lower.startsWith('.env')) return <LockIcon className="files-row-icon" />
  const extension = lower.includes('.') ? lower.split('.').pop() ?? '' : ''
  switch (extension) {
    case 'md': case 'markdown': case 'txt': case 'log': return <FileIcon className="files-row-icon" />
    case 'pdf': return <FileIcon className="files-row-icon" />
    case 'js': case 'mjs': case 'cjs': case 'jsx': case 'ts': case 'tsx': return <CodeIcon className="files-row-icon" />
    case 'json': return <ConfigIcon className="files-row-icon" />
    case 'html': case 'htm': return <GlobeIcon className="files-row-icon" />
    case 'css': case 'scss': case 'less': return <CodeIcon className="files-row-icon" />
    case 'py': case 'java': case 'go': case 'rs': return <CodeIcon className="files-row-icon" />
    case 'sh': case 'bash': case 'zsh': return <CodeIcon className="files-row-icon" />
    case 'yml': case 'yaml': case 'toml': case 'ini': return <ConfigIcon className="files-row-icon" />
    case 'png': case 'jpg': case 'jpeg': case 'gif': case 'svg': case 'webp': case 'ico': return <ImageIcon className="files-row-icon" />
    case 'mp3': case 'wav': case 'ogg': return <AudioIcon className="files-row-icon" />
    case 'mp4': case 'mov': case 'webm': return <VideoIcon className="files-row-icon" />
    case 'zip': case 'gz': case 'tar': case 'rar': case '7z': return <ArchiveIcon className="files-row-icon" />
    case 'lock': return <LockIcon className="files-row-icon" />
    default: return <FileIcon className="files-row-icon" />
  }
}

export function RightSidebar({ project, onClose }: { project: Project; onClose: () => void }) {
  const [tab, setTab] = useState<RightTab>('files')
  const [terminalOpened, setTerminalOpened] = useState(false)
  const active = TABS.find((entry) => entry.id === tab) ?? TABS[0]

  return (
    <aside className="right-sidebar" aria-label="Right sidebar">
      <div className="right-sidebar-head">
        <div className="right-sidebar-tabs" role="tablist" aria-label="Right sidebar sections">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              className={`settings-tab ${tab === entry.id ? 'active' : ''}`}
              onClick={() => {
                setTab(entry.id)
                if (entry.id === 'terminal') setTerminalOpened(true)
              }}
              role="tab"
              aria-selected={tab === entry.id}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <button className="icon-btn mobile-only" onClick={onClose} aria-label="Close right sidebar" title="Close">
          <XIcon className="icon-btn-icon" />
        </button>
      </div>
      <div className="right-sidebar-body">
        {tab === 'files' ? (
          <FilesPanel project={project} />
        ) : tab === 'activity' ? (
          <div className="right-sidebar-soon">
            <strong>{active.label}</strong>
            <p>Coming soon</p>
          </div>
        ) : null}
        {terminalOpened && (
          <TerminalTabs key={project.id} projectId={project.id} active={tab === 'terminal'} />
        )}
      </div>
    </aside>
  )
}

function CreateMenu({
  projectId,
  dir,
  busy,
  createKind,
  setCreateKind,
  setNewName,
  load
}: {
  projectId: string
  dir: string
  busy: boolean
  createKind: 'file' | 'folder' | null
  setCreateKind: (kind: 'file' | 'folder' | null) => void
  setNewName: (name: string) => void
  load: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [placement, setPlacement] = useState<'down' | 'up'>('down')
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const position = () => {
    const next = triggerRef.current?.getBoundingClientRect()
    if (!next) return
    setRect(next)
    const spaceBelow = window.innerHeight - next.bottom
    setPlacement(spaceBelow < 160 && next.top > spaceBelow ? 'up' : 'down')
  }

  useEffect(() => {
    if (!menuOpen) return
    position()
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !document.querySelector('.files-create-popup')?.contains(target)) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [menuOpen])

  const handleNewFile = () => {
    setCreateKind('file')
    setNewName('')
    setMenuOpen(false)
  }

  const handleNewFolder = () => {
    setCreateKind('folder')
    setNewName('')
    setMenuOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`files-action-btn ${menuOpen ? 'open' : ''}`}
        onClick={() => {
          if (!menuOpen) position()
          setMenuOpen(!menuOpen)
        }}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="New file or folder"
        title="New file or folder"
      >
        <PlusIcon className="files-action-btn-icon" />
        <span className="files-action-btn-label">New</span>
        <CaretDownIcon className="files-action-btn-caret" aria-hidden="true" />
      </button>
      {menuOpen && rect && createPortal(
        <div
          className={`files-create-popup ${placement}`}
          style={{
            left: rect.left,
            minWidth: 160,
            ...(placement === 'up'
              ? { bottom: window.innerHeight - rect.top + 6 }
              : { top: rect.bottom + 6 })
          }}
          role="menu"
          aria-label="Create new"
        >
          <button className="files-action-item" role="menuitem" onClick={handleNewFile} disabled={busy}>
            <FileIcon className="files-action-icon" /> New file
          </button>
          <button className="files-action-item" role="menuitem" onClick={handleNewFolder} disabled={busy}>
            <FolderIcon className="files-action-icon" /> New folder
          </button>
        </div>,
        document.body
      )}
    </>
  )
}

function UploadMenu({
  projectId,
  dir,
  busy,
  setBusy,
  fileInputRef,
  load
}: {
  projectId: string
  dir: string
  busy: boolean
  setBusy: (busy: boolean) => void
  fileInputRef: React.RefObject<HTMLInputElement | null>
  load: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [placement, setPlacement] = useState<'down' | 'up'>('down')
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [urlUpload, setUrlUpload] = useState<{ url: string; name: string } | null>(null)

  const position = () => {
    const next = triggerRef.current?.getBoundingClientRect()
    if (!next) return
    setRect(next)
    const spaceBelow = window.innerHeight - next.bottom
    setPlacement(spaceBelow < 160 && next.top > spaceBelow ? 'up' : 'down')
  }

  useEffect(() => {
    if (!menuOpen) return
    position()
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (!triggerRef.current?.contains(target) && !document.querySelector('.files-upload-popup')?.contains(target)) {
        setMenuOpen(false)
        setUrlUpload(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setUrlUpload(null)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [menuOpen])

  const handleUpload = () => {
    fileInputRef.current?.click()
    setMenuOpen(false)
  }

  const handleUploadUrl = () => {
    setUrlUpload({ url: '', name: '' })
    setMenuOpen(false)
  }

  const submitUrlUpload = async () => {
    if (!urlUpload || !urlUpload.url.trim() || !urlUpload.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch(urlUpload.url)
      if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
      const blob = await res.blob()
      const file = new File([blob], urlUpload.name, { type: blob.type })
      const form = new FormData()
      form.append('path', dir)
      form.append('file', file)
      await fetch(`/api/projects/${projectId}/files/upload`, { method: 'POST', body: form })
      setUrlUpload(null)
      await load()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  if (urlUpload) {
    return (
      <div className="files-url-upload">
        <input
          className="input"
          autoFocus
          placeholder="https://example.com/file.txt"
          value={urlUpload.url}
          onChange={(e) => setUrlUpload({ ...urlUpload, url: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') void submitUrlUpload(); if (e.key === 'Escape') setUrlUpload(null) }}
        />
        <input
          className="input"
          placeholder="file-name.txt"
          value={urlUpload.name}
          onChange={(e) => setUrlUpload({ ...urlUpload, name: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') void submitUrlUpload(); if (e.key === 'Escape') setUrlUpload(null) }}
        />
        <div className="files-inline-form">
          <button className="btn primary small" onClick={() => void submitUrlUpload()} disabled={busy || !urlUpload.url.trim() || !urlUpload.name.trim()}>
            Add
          </button>
          <button className="btn ghost small" onClick={() => setUrlUpload(null)} disabled={busy}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`files-action-btn ${menuOpen ? 'open' : ''}`}
        onClick={() => {
          if (!menuOpen) position()
          setMenuOpen(!menuOpen)
        }}
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Upload file or from URL"
        title="Upload file or from URL"
      >
        <UploadIcon className="files-action-btn-icon" />
        <span className="files-action-btn-label">Upload</span>
        <CaretDownIcon className="files-action-btn-caret" aria-hidden="true" />
      </button>
      {menuOpen && rect && createPortal(
        <div
          className={`files-upload-popup ${placement}`}
          style={{
            left: rect.left,
            minWidth: 160,
            ...(placement === 'up'
              ? { bottom: window.innerHeight - rect.top + 6 }
              : { top: rect.bottom + 6 })
          }}
          role="menu"
          aria-label="Upload"
        >
          <button className="files-action-item" role="menuitem" onClick={handleUpload} disabled={busy}>
            <UploadIcon className="files-action-icon" /> Upload file
          </button>
          <button className="files-action-item" role="menuitem" onClick={handleUploadUrl} disabled={busy}>
            <LinkIcon className="files-action-icon" /> Upload from URL
          </button>
        </div>,
        document.body
      )}
    </>
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
            <ChevronLeftIcon className="icon-btn-icon" />
          </button>
          {openFile && (
            <span className="files-file-icon" aria-hidden="true">
              {getFileIcon(baseName(openFile.path))}
            </span>
          )}
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
                <button className="btn ghost small" onClick={download} title="Download">
                  <DownloadIcon className="btn-icon" />
                </button>
                <button
                  className="btn ghost small"
                  onClick={() => {
                    setRenameValue(baseName(openFile.path))
                    setRenaming(true)
                  }}
                  title="Rename"
                >
                  <EditIcon className="btn-icon" />
                </button>
                <button className="btn danger small" onClick={() => setConfirmDelete(true)} title="Delete">
                  <TrashIcon className="btn-icon" />
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
              <FileEditor key={openFile.path} path={openFile.path} value={draft} onChange={setDraft} />
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
          <ChevronLeftIcon className="icon-btn-icon" />
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
          <RefreshIcon className="icon-btn-icon" />
        </button>
      </div>

      <div className="files-actions">
        <CreateMenu
          projectId={project.id}
          dir={dir}
          busy={busy}
          createKind={createKind}
          setCreateKind={setCreateKind}
          setNewName={setNewName}
          load={load}
        />
        <UploadMenu
          projectId={project.id}
          dir={dir}
          busy={busy}
          setBusy={setBusy}
          fileInputRef={fileInputRef}
          load={load}
        />
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
        <div className="files-skeleton" aria-busy="true" aria-label="Loading files">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="files-skeleton-row">
              <span className="files-skeleton-icon" aria-hidden="true" />
              <span className="files-skeleton-name" aria-hidden="true" />
              <span className="files-skeleton-size" aria-hidden="true" />
            </div>
          ))}
        </div>
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
              <span className="files-row-icon" aria-hidden="true">
                {entry.type === 'dir' ? <FolderIcon className="files-row-icon" /> : getFileIcon(entry.name)}
              </span>
              <span className="files-row-name">{entry.name}</span>
              {entry.type === 'file' && <span className="files-row-size">{formatSize(entry.size)}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
