import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  FileIcon,
  getFileMeta
} from '../icons'

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const KEYWORDS: Record<string, string[]> = {
  javascript: ['break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','await','async','static','get','set','of','from','as','implements','interface','package','private','protected','public','enum','type'],
  typescript: ['break','case','catch','class','const','continue','debugger','default','delete','do','else','export','extends','false','finally','for','function','if','import','in','instanceof','let','new','null','return','super','switch','this','throw','true','try','typeof','var','void','while','with','yield','await','async','static','get','set','of','from','as','implements','interface','package','private','protected','public','enum','type','namespace','module','declare','abstract','readonly','keyof','infer','unknown','any','never','string','number','boolean','bigint','symbol','is','asserts'],
  python: ['and','as','assert','break','class','continue','def','del','elif','else','except','False','finally','for','from','global','if','import','in','is','lambda','None','nonlocal','not','or','pass','raise','return','True','try','while','with','yield','async','await'],
  java: ['abstract','assert','boolean','break','byte','case','catch','char','class','const','continue','default','do','double','else','enum','extends','final','finally','float','for','goto','if','implements','import','instanceof','int','interface','long','native','new','package','private','protected','public','return','short','static','strictfp','super','switch','synchronized','this','throw','throws','transient','try','void','volatile','while','true','false','null','var','yield','record','sealed','permits'],
  go: ['break','case','chan','const','continue','default','defer','else','fallthrough','for','func','go','goto','if','import','interface','map','package','range','return','select','struct','switch','type','var','true','false','nil','iota','make','new','append','len','cap'],
  rust: ['as','break','const','continue','crate','else','enum','extern','false','fn','for','if','impl','in','let','loop','match','mod','move','mut','pub','ref','return','self','Self','static','struct','super','trait','true','type','unsafe','use','where','while','async','await','dyn','abstract','become','box','do','final','macro','override','priv','typeof','unsized','virtual','yield','try','union'],
  php: ['__halt_compiler','abstract','and','array','as','break','callable','case','catch','class','clone','const','continue','declare','default','die','do','echo','else','elseif','empty','enddeclare','endfor','endforeach','endif','endswitch','endwhile','eval','exit','extends','final','finally','for','foreach','function','global','goto','if','implements','include','include_once','instanceof','insteadof','interface','isset','list','namespace','new','or','print','private','protected','public','require','require_once','return','static','switch','throw','trait','try','unset','use','var','while','xor','yield','true','false','null'],
  ruby: ['alias','and','begin','break','case','class','def','defined','do','else','elsif','end','ensure','false','for','if','in','module','next','nil','not','or','redo','rescue','retry','return','self','super','then','true','undef','unless','until','when','while','yield','__ENCODING__','__LINE__','__FILE__'],
  shell: ['if','then','else','elif','fi','case','esac','for','while','until','do','done','in','function','select','time','coproc','declare','export','local','readonly'],
  yaml: ['true','false','null','yes','no','on','off'],
  css: [],
  json: ['true','false','null'],
  html: [],
  xml: [],
  sql: ['select','from','where','insert','into','values','update','set','delete','create','table','alter','drop','index','view','join','inner','left','right','outer','on','group','by','having','order','asc','desc','limit','offset','union','all','distinct','as','and','or','not','null','is','in','exists','between','like','case','when','then','else','end','primary','key','foreign','references','constraint','unique','check','default'],
  c: ['auto','break','case','char','const','continue','default','do','double','else','enum','extern','float','for','goto','if','inline','int','long','register','restrict','return','short','signed','sizeof','static','struct','switch','typedef','union','unsigned','void','volatile','while','_Bool','_Complex','_Imaginary','true','false','NULL'],
  cpp: ['alignas','alignof','and','and_eq','asm','auto','bitand','bitor','bool','break','case','catch','char','char8_t','char16_t','char32_t','class','compl','concept','const','consteval','constexpr','constinit','const_cast','continue','co_await','co_return','co_yield','decltype','default','delete','do','double','dynamic_cast','else','enum','explicit','export','extern','false','float','for','friend','goto','if','inline','int','long','mutable','namespace','new','noexcept','not','not_eq','nullptr','operator','or','or_eq','private','protected','public','register','reinterpret_cast','requires','return','short','signed','sizeof','static','static_assert','static_cast','struct','switch','template','this','thread_local','throw','true','try','typedef','typeid','typename','union','unsigned','using','virtual','void','volatile','wchar_t','while','xor','xor_eq'],
  csharp: ['abstract','as','base','bool','break','byte','case','catch','char','checked','class','const','continue','decimal','default','delegate','do','double','else','enum','event','explicit','extern','false','finally','fixed','float','for','foreach','goto','if','implicit','in','int','interface','internal','is','lock','long','namespace','new','null','object','operator','out','override','params','private','protected','public','readonly','ref','return','sbyte','sealed','short','sizeof','stackalloc','static','string','struct','switch','this','throw','true','try','typeof','uint','ulong','unchecked','unsafe','ushort','using','virtual','void','volatile','while','add','alias','ascending','async','await','by','descending','dynamic','equals','from','get','global','group','into','join','let','nameof','on','orderby','partial','remove','select','set','value','var','when','where','yield'],
  swift: ['class','deinit','enum','extension','func','import','init','inout','internal','let','operator','private','protocol','public','static','struct','subscript','typealias','var','break','case','continue','default','defer','do','else','fallthrough','for','guard','if','in','repeat','return','switch','where','while','as','Any','catch','false','is','nil','rethrows','super','self','Self','throw','throws','true','try','associativity','convenience','dynamic','didSet','final','get','infix','indirect','lazy','left','mutating','none','nonmutating','optional','override','postfix','precedence','prefix','Protocol','required','right','set','Type','unowned','weak','willSet'],
  kotlin: ['as','break','class','continue','do','else','false','for','fun','if','in','interface','is','null','object','package','return','super','this','throw','true','try','typealias','val','var','when','while','by','catch','constructor','delegate','dynamic','field','file','finally','get','import','init','param','property','receiver','set','setparam','where','actual','abstract','annotation','companion','const','crossinline','data','enum','expect','external','final','infix','inline','inner','internal','lateinit','noinline','open','operator','out','override','private','protected','public','reified','sealed','suspend','tailrec','vararg'],
  dart: ['abstract','as','assert','async','await','break','case','catch','class','const','continue','covariant','default','deferred','do','dynamic','else','enum','export','extends','extension','external','factory','false','final','finally','for','Function','get','hide','if','implements','import','in','interface','is','late','library','mixin','new','null','on','operator','part','required','rethrow','return','set','show','static','super','switch','sync','this','throw','true','try','typedef','var','void','while','with','yield'],
}

function highlightCode(code: string, lang: string): string {
  if (!code) return ''
  // Escape FIRST - this is the key to XSS prevention
  let working = escapeHtml(code)
  const placeholders: string[] = []
  const store = (s: string, cls: string) => {
    const token = `__HL_${placeholders.length}__`
    placeholders.push(`<span class="${cls}">${s}</span>`)
    return token
  }
  // Protect strings and comments by replacing with placeholders
  working = working.replace(/`(?:\\.|[^`\\])*`/g, m => store(m, 'hl-string'))
  working = working.replace(/"(?:\\.|[^"\\])*"/g, m => store(m, 'hl-string'))
  working = working.replace(/'(?:\\.|[^'\\])*'/g, m => store(m, 'hl-string'))
  working = working.replace(/\/\/.*$/gm, m => store(m, 'hl-comment'))
  if (['python','shell','yaml','toml','dockerfile','makefile','ruby'].includes(lang)) {
    working = working.replace(/#.*$/gm, m => store(m, 'hl-comment'))
  }
  working = working.replace(/\/\*[\s\S]*?\*\//g, m => store(m, 'hl-comment'))
  working = working.replace(/<!--[\s\S]*?-->/g, m => store(m, 'hl-comment'))
  // Now add syntax highlighting on the ALREADY ESCAPED content
  const kws = KEYWORDS[lang]
  if (kws && kws.length) {
    const pat = new RegExp(`\\b(${kws.join('|')})\\b`, 'g')
    working = working.replace(pat, '<span class="hl-keyword">$1</span>')
  }
  working = working.replace(/\\b(\\d+(\\.\\d+)?)\\b/g, '<span class="hl-number">$1</span>')
  working = working.replace(/\\b([A-Za-z_]\\w*)\\s*(?=\()/g, '<span class="hl-function">$1</span>')
  if (lang === 'html' || lang === 'xml') {
    working = working.replace(/(<\\/?)([\w-]+)/g, '$1<span class="hl-tag">$2</span>')
    working = working.replace(/\\b([\w-:]+)(=)/g, '<span class="hl-attr">$1</span>$2')
  }
  if (lang === 'css' || lang === 'scss' || lang === 'less') {
    working = working.replace(/^(\\s*)([\w-]+)(\\s*:)/gm, '$1<span class="hl-attr">$2</span>$3')
  }
  // Restore protected strings/comments
  placeholders.forEach((html, i) => {
    const token = `__HL_${i}__`
    working = working.split(token).join(html)
  })
  return working
}

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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)

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

  function triggerArchiveDownload() {
    if (!projectId) {
      toast('No project selected', 'error')
      return
    }
    const a = document.createElement('a')
    a.href = api.archiveUrl(projectId)
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

  // editor meta for colour + language + highlight
  const selectedMeta = selected ? getFileMeta(selected.split('/').pop() ?? selected) : null
  const selectedColor = selectedMeta?.color ?? 'var(--border)'
  const selectedLanguage = selectedMeta?.language ?? 'plaintext'
  const SelectedIcon = selectedMeta?.Icon ?? IconFile
  const highlightedHtml = useMemo(() => {
    if (!selected || editLoading) return ''
    return highlightCode(editContent, selectedLanguage)
  }, [editContent, selectedLanguage, selected, editLoading])

  function syncScroll() {
    if (textareaRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = textareaRef.current.scrollTop
      highlightRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }

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
          <div className="fp-subhead fp-edit-head" style={{ borderLeft: `3px solid ${selectedColor}`, paddingLeft: 8, borderRadius: 6 }}>
            <button className="icon-btn" aria-label="Back to files" onClick={() => { setSelected(null); setEditContent(''); }}>
              <IconChevronLeft size={17} />
            </button>
            <span style={{ display: 'inline-flex', alignItems: 'center', color: selectedColor }}><SelectedIcon size={15} /></span>
            <span className="fp-edit-title" title={selected}>{selected}</span>
            <span className="fp-lang-badge" style={{ background: selectedColor, color: selectedColor === '#f7df1e' || selectedColor === '#ecd53f' ? '#000' : '#fff', borderColor: selectedColor }}>{selectedMeta?.label ?? 'FILE'}</span>
            <div className="fp-editor-actions">
              <button className="btn" disabled={editLoading || editSaving} onClick={() => { setSelected(null); setEditContent(''); }}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={editLoading || editSaving} onClick={() => saveFileContent(selected)}>
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
          <div className="fp-editor-wrap" style={{ borderColor: selectedColor }}>
            <div className="fp-editor-container">
              <pre ref={highlightRef} className="fp-highlight" aria-hidden="true"><code dangerouslySetInnerHTML={{ __html: highlightedHtml + '<br>' }} /></pre>
              <textarea
                ref={textareaRef}
                className="fp-editor-textarea fp-edit-area fp-editor-textarea--highlighted"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onScroll={syncScroll}
                disabled={editLoading}
                placeholder={editLoading ? 'Loading…' : 'Start typing…'}
                spellCheck={false}
                autoFocus
              />
            </div>
          </div>
          <div className="fp-editor-footer" style={{ borderLeft: `3px solid ${selectedColor}`, paddingLeft: 8 }}>
            <span className="fp-editor-lang" style={{ color: selectedColor }}>{selectedLanguage}</span>
            <span className="fp-editor-hint">{editLoading ? 'Loading…' : `${editContent.split('\n').length} lines • ${editContent.length} chars`}</span>
          </div>
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
                      {entry.type === 'dir' ? <IconFolder size={15} style={{ color: '#dcad3c' }} /> : <FileIcon name={entry.name} size={15} />}
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
                triggerArchiveDownload()
              }}
            >
              <IconDownload size={15} /> Download ZIP
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
            {rowMenu.entry.type === 'file' && (
              <button
                onClick={() => {
                  const entry = rowMenu.entry
                  const rel = joinRel(dir, entry.name)
                  setRowMenu(null)
                  if (!projectId) return
                  const a = document.createElement('a')
                  a.href = api.downloadUrl(projectId, rel)
                  a.download = entry.name
                  document.body.appendChild(a)
                  a.click()
                  a.remove()
                }}
              >
                <IconDownload size={15} /> Download
              </button>
            )}
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
