import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import * as api from '../api'
import type { FileEntry } from '../types'
import { useDialogs } from '../dialogs'
import { useToast } from '../toast'
import {
  IconChevronLeft,
  IconDots,
  IconDownload,
  IconFile,
  IconFolder,
  IconPencil,
  IconSearch,
  IconTrash,
  IconUpload,
  IconX
} from '../icons'

interface FilesPaneProps {
  projectId: string | null
}

interface MenuPos {
  top: number
  left: number
}

type SubPage = { kind: 'create'; tab: 'file' | 'folder' } | { kind: 'upload'; tab: 'local' | 'url' }

function joinRel(dir: string, name: string) {
  return dir ? `${dir}/${name}` : name
}

function parentOf(dir: string) {
  const idx = dir.lastIndexOf('/')
  return idx === -1 ? '' : dir.slice(0, idx)
}

export function FilesPane({ projectId }: FilesPaneProps) {
  const toast = useToast()
  const { confirm, prompt } = useDialogs()

  const [dir, setDir] = useState('')
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const [roomMenu, setRoomMenu] = useState<MenuPos | null>(null)
  const [rowMenu, setRowMenu] = useState<{ entry: FileEntry; pos: MenuPos } | null>(null)
  const [subPage, setSubPage] = useState<SubPage | null>(null)
  const [newName, setNewName] = useState('')
  const [urlValue, setUrlValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDir('')
    setSelected(null)
    setQuery('')
    setSubPage(null)
    setEntries([])
  }, [projectId])

  const refresh = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const listing = await api.listFiles(projectId, dir)
      setEntries(listing.entries)
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, dir])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!roomMenu && !rowMenu) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (!t || !t.closest('[data-fp-menu]')) {
        setRoomMenu(null)
        setRowMenu(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setRoomMenu(null)
        setRowMenu(null)
      }
    }
    const dismiss = () => {
      setRoomMenu(null)
      setRowMenu(null)
    }
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
  }, [roomMenu, rowMenu])

  function placeMenu(rect: DOMRect, height: number): MenuPos {
    const width = 150
    return {
      top: Math.min(rect.bottom + 6, window.innerHeight - height - 8),
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8))
    }
  }

  function toggleRoom(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (roomMenu) {
      setRoomMenu(null)
      return
    }
    setRowMenu(null)
    setRoomMenu(placeMenu(e.currentTarget.getBoundingClientRect(), 110))
  }

  function toggleRowMenu(e: React.MouseEvent<HTMLSpanElement>, entry: FileEntry) {
    e.stopPropagation()
    if (rowMenu?.entry.name === entry.name) {
      setRowMenu(null)
      return
    }
    setRoomMenu(null)
    setRowMenu({ entry, pos: placeMenu(e.currentTarget.getBoundingClientRect(), 96) })
  }

  function openDir(name: string) {
    setDir(joinRel(dir, name))
    setSelected(null)
    setQuery('')
    setSubPage(null)
  }

  async function loadFileContent(relPath: string) {
    if (!projectId) return
    setEditLoading(true)
    try {
      const res = await api.readFileContent(projectId, relPath)
      setEditContent(res.content)
    } catch (e: any) {
      toast(e.message, 'error')
      setEditContent('')
    } finally {
      setEditLoading(false)
    }
  }

  async function saveFileContent(relPath: string) {
    if (!projectId) return
    setEditSaving(true)
    try {
      await api.saveFileContent(projectId, relPath, editContent)
      toast('File saved', 'success')
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setEditSaving(false)
    }
  }

  async function doRename(entry: FileEntry) {
    if (!projectId) return
    const name = await prompt({ title: `Rename ${entry.type}`, label: 'Name', value: entry.name })
    if (!name || name === entry.name) return
    try {
      await api.renameFileEntry(projectId, joinRel(dir, entry.name), name)
      setSelected((prev) => (prev === joinRel(dir, entry.name) ? joinRel(dir, name) : prev))
      await refresh()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function doDelete(entry: FileEntry) {
    if (!projectId) return
    const ok = await confirm({
      title: `Delete "${entry.name}"?`,
      message:
        entry.type === 'dir'
          ? 'The folder and everything inside it will be permanently removed.'
          : 'This file will be permanently removed.',
      danger: true,
      confirmText: 'Delete'
    })
    if (!ok) return
    try {
      await api.deleteFileEntry(projectId, joinRel(dir, entry.name))
      setSelected((prev) => (prev === joinRel(dir, entry.name) ? null : prev))
      toast('Deleted', 'success')
      await refresh()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  function triggerDownload() {
    if (!projectId || !selected) {
      toast('Select a file first', 'error')
      return
    }
    const entry = entries.find((en) => joinRel(dir, en.name) === selected)
    if (!entry || entry.type !== 'file') {
      toast('Select a file (not a folder) to download', 'error')
      return
    }
    const a = document.createElement('a')
    a.href = api.downloadUrl(projectId, selected)
    a.download = entry.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  function openCreate() {
    setNewName('')
    setSubPage({ kind: 'create', tab: 'file' })
  }

  function openUpload(tab: 'local' | 'url') {
    setUrlValue('')
    setSubPage({ kind: 'upload', tab })
  }

  async function submitCreate() {
    if (!projectId || !subPage || subPage.kind !== 'create' || busy) return
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    try {
      await api.createFileEntry(projectId, subPage.tab, joinRel(dir, name))
      toast(`${subPage.tab === 'folder' ? 'Folder' : 'File'} created`, 'success')
      setSubPage(null)
      await refresh()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  async function pickLocal(files: FileList | null) {
    if (!projectId || !files || files.length === 0 || busy) return
    setBusy(true)
    try {
      await api.uploadLocalFiles(projectId, dir, Array.from(files))
      toast(files.length > 1 ? `Uploaded ${files.length} files` : 'File uploaded', 'success')
      setSubPage(null)
      await refresh()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function submitUrl() {
    if (!projectId || busy) return
    const url = urlValue.trim()
    if (!/^https?:\/\/.+/.test(url)) {
      toast('Enter a valid http(s) URL', 'error')
      return
    }
    setBusy(true)
    try {
      const res = await api.uploadFromUrl(projectId, { url, path: dir })
      toast(`Uploaded ${res.name}`, 'success')
      setSubPage(null)
      await refresh()
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const filtered = entries.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
  const selIsFile =
    !!selected && entries.some((e) => e.type === 'file' && joinRel(dir, e.name) === selected)

  if (!projectId) {
    return <div className="dd-empty">Select a project to browse its files</div>
  }

  return (
    <div className="fp">
      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => pickLocal(e.target.files)} />
      {subPage?.kind === 'create' && (
        <>
          <div className="fp-subhead">
            <button className="icon-btn" aria-label="Back to files" onClick={() => setSubPage(null)}>
              <IconChevronLeft size={17} />
            </button>
            <span>Create</span>
          </div>
          <div className="tabs fp-tabs">
            <button
              className={`tab${subPage.tab === 'file' ? ' active' : ''}`}
              onClick={() => setSubPage({ kind: 'create', tab: 'file' })}
            >
              File
            </button>
            <button
              className={`tab${subPage.tab === 'folder' ? ' active' : ''}`}
              onClick={() => setSubPage({ kind: 'create', tab: 'folder' })}
            >
              Folder
            </button>
          </div>
          <label className="field-label">{subPage.tab === 'file' ? 'File name' : 'Folder name'}</label>
          <input
            className="input"
            placeholder={subPage.tab === 'file' ? 'notes.md' : 'components'}
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitCreate()
            }}
          />
          <button className="btn btn-primary fp-submit" disabled={busy || !newName.trim()} onClick={submitCreate}>
            Create {subPage.tab}
          </button>
        </>
      )}

      {subPage?.kind === 'upload' && (
        <>
          <div className="fp-subhead">
            <button className="icon-btn" aria-label="Back to files" onClick={() => setSubPage(null)}>
              <IconChevronLeft size={17} />
            </button>
            <span>Upload</span>
          </div>
          <div className="tabs fp-tabs">
            <button
              className={`tab${subPage.tab === 'local' ? ' active' : ''}`}
              onClick={() => setSubPage({ kind: 'upload', tab: 'local' })}
            >
              Local
            </button>
            <button
              className={`tab${subPage.tab === 'url' ? ' active' : ''}`}
              onClick={() => setSubPage({ kind: 'upload', tab: 'url' })}
            >
              URL
            </button>
          </div>
          {subPage.tab === 'local' && (
            <>
              <button className="btn btn-primary fp-submit" disabled={busy} onClick={() => fileInputRef.current?.click()}>
                <IconUpload size={15} style={{ marginRight: 6 }} />
                Choose files
              </button>
              <p className="fp-hint">Files are uploaded into the current folder.</p>
            </>
          )}
          {subPage.tab === 'url' && (
            <>
              <label className="field-label">File URL</label>
              <input
                className="input"
                placeholder="https://example.com/file.zip"
                autoFocus
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitUrl()
                }}
              />
              <button className="btn btn-primary fp-submit" disabled={busy || !urlValue.trim()} onClick={submitUrl}>
                <IconDownload size={15} style={{ marginRight: 6 }} />
                Fetch file
              </button>
              <p className="fp-hint">The server downloads the file into the current folder.</p>
            </>
          )}
        </>
      )}

      {!subPage && selected && (
        <div className="fp-edit">
          <div className="fp-subhead fp-edit-head">
            <button className="icon-btn" aria-label="Back to files" onClick={() => { setSelected(null); setEditContent(''); }}>
              <IconChevronLeft size={17} />
            </button>
            <span className="fp-edit-title" title={selected}>{selected}</span>
            <div className="fp-editor-actions">
              <button className="btn" disabled={editLoading || editSaving} onClick={() => { setSelected(null); setEditContent(''); }}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={editLoading || editSaving} onClick={() => saveFileContent(selected)}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <textarea
            className="fp-editor-textarea fp-edit-area"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            disabled={editLoading}
            placeholder={editLoading ? 'Loading…' : 'Start typing…'}
            spellCheck={false}
            autoFocus
          />
        </div>
      )}

      {!subPage && !selected && (
        <>
          <div className="fp-path" title={dir === '' ? '/' : dir}>
            {dir === '' ? '/' : dir}
          </div>
          <div className="fp-toolbar">
            <div className="search-box">
              <IconSearch size={14} />
              <input
                className="search-input"
                placeholder="Search files…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <button className="plus-btn" title="File actions" aria-label="File actions" data-fp-menu="room" onClick={toggleRoom}>
              <IconDots size={16} />
            </button>
          </div>

          <div className="fp-list">
            {loading ? (
              <div className="fp-skel" aria-label="Loading files">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="fp-skel-row">
                    <span className="fp-skel-icon" style={{ animationDelay: `${i * 70}ms` }} />
                    <span
                      className="fp-skel-bar"
                      style={{ width: `${52 + ((i * 17) % 34)}%`, animationDelay: `${i * 70}ms` }}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {dir !== '' && (
                  <div
                    className="fp-row"
                    role="button"
                    onClick={() => {
                      setDir(parentOf(dir))
                      setSelected(null)
                      setQuery('')
                    }}
                  >
                    <IconChevronLeft size={15} />
                    <span className="fp-name">..</span>
                  </div>
                )}
                {filtered.length === 0 && (
                  <div className="dd-empty">{entries.length === 0 ? 'No files yet' : 'No matches'}</div>
                )}
                {filtered.map((entry) => {
                  const rel = joinRel(dir, entry.name)
                  return (
                    <div
                      key={entry.name}
                      className={`fp-row${selected === rel ? ' active' : ''}${rowMenu?.entry.name === entry.name ? ' menu-open' : ''}`}
                      role="button"
                      onClick={() => {
                        if (entry.type === 'dir') {
                          openDir(entry.name)
                        } else {
                          setSelected(rel)
                          loadFileContent(rel)
                        }
                      }}
                    >
                      {entry.type === 'dir' ? <IconFolder size={15} /> : <IconFile size={15} />}
                      <span className="fp-name">{entry.name}</span>
                      <span
                        className="icon-btn row-menu"
                        role="button"
                        aria-label={`${entry.type} options`}
                        data-fp-menu="trigger"
                        style={{ width: 26, height: 26 }}
                        onClick={(e) => toggleRowMenu(e, entry)}
                      >
                        <IconDots size={15} />
                      </span>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </>
      )}

      {roomMenu &&
        createPortal(
          <div
            className="menu-pop menu-pop-fixed"
            data-fp-menu="popover"
            style={{ top: roomMenu.top, left: roomMenu.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={{ opacity: selIsFile ? 1 : 0.6 }}
              onClick={() => {
                setRoomMenu(null)
                triggerDownload()
              }}
            >
              <IconDownload size={15} /> Download
            </button>
            <button
              onClick={() => {
                setRoomMenu(null)
                openCreate()
              }}
            >
              <IconFile size={15} /> Create…
            </button>
            <button
              onClick={() => {
                setRoomMenu(null)
                openUpload('local')
              }}
            >
              <IconUpload size={15} /> Upload…
            </button>
          </div>,
          document.body
        )}

      {rowMenu &&
        createPortal(
          <div
            className="menu-pop menu-pop-fixed"
            data-fp-menu="popover"
            style={{ top: rowMenu.pos.top, left: rowMenu.pos.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => {
                const entry = rowMenu.entry
                setRowMenu(null)
                doRename(entry)
              }}
            >
              <IconPencil size={15} /> Rename
            </button>
            <button
              className="danger"
              onClick={() => {
                const entry = rowMenu.entry
                setRowMenu(null)
                doDelete(entry)
              }}
            >
              <IconTrash size={15} /> Delete
            </button>
          </div>,
          document.body
        )}
    </div>
  )
}
