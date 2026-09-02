import { useState, useEffect, useRef, useCallback } from 'react'
import { IconX, IconRefreshCw, IconExternalLink, IconMonitor, IconPlay, IconMaximize, IconMinimize, IconGear, IconTrash } from '../icons'
import { useToast } from '../toast'
import * as api from '../api'

import type { Preview } from '../types'

interface PreviewSidebarProps {
  open: boolean
  onClose: () => void
  activeProject: { id: string; path: string } | null
  activeChatId?: string | null
  chatPreview?: Preview | null
  onPreviewUpdate?: (preview: Preview | null) => void
}

export function PreviewSidebar({ open, onClose, activeProject, activeChatId = null, chatPreview = null, onPreviewUpdate }: PreviewSidebarProps) {
  const toast = useToast()
  const [url, setUrl] = useState<string>('')
  const [directUrl, setDirectUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<boolean | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showPortSettings, setShowPortSettings] = useState(false)
  const [portInput, setPortInput] = useState('')
  const [portError, setPortError] = useState<string | null>(null)
  const [savingPort, setSavingPort] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeKey, setIframeKey] = useState(0)
  const prevProjectIdRef = useRef<string | null>(null)
  const prevChatIdRef = useRef<string | null>(null)
  // VS Code-like resizable width
  const [psbWidth, setPsbWidth] = useState<number>(() => {
    try {
      const v = localStorage.getItem('ks.psb.width')
      const n = v ? parseInt(v, 10) : 480
      return Number.isFinite(n) && n >= 320 && n <= 900 ? n : 480
    } catch { return 480 }
  })
  const psbResizingRef = useRef<{ startX: number; startW: number } | null>(null)
  const [isPsbResizing, setIsPsbResizing] = useState(false)

  function handlePsbResizeStart(e: React.MouseEvent) {
    if (isFullscreen) return
    e.preventDefault()
    psbResizingRef.current = { startX: e.clientX, startW: psbWidth }
    setIsPsbResizing(true)
  }

  function handlePsbResizeDoubleClick() {
    const def = 480
    setPsbWidth(def)
    try { localStorage.setItem('ks.psb.width', String(def)) } catch {}
  }

  useEffect(() => {
    if (!isPsbResizing) return
    function onMove(e: MouseEvent) {
      const r = psbResizingRef.current
      if (!r) return
      const dx = r.startX - e.clientX
      const next = Math.max(320, Math.min(900, r.startW + dx))
      const maxVw = Math.floor(window.innerWidth * 0.7)
      const clamped = Math.min(next, maxVw)
      setPsbWidth(clamped)
    }
    function onUp() {
      setIsPsbResizing(false)
      psbResizingRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isPsbResizing])

  useEffect(() => {
    if (isPsbResizing) return
    try { localStorage.setItem('ks.psb.width', String(psbWidth)) } catch {}
  }, [psbWidth, isPsbResizing])

  const getDefaultProxiedUrl = useCallback(() => {
    if (chatPreview && activeChatId) return api.chatPreviewProxyUrl(activeChatId)
    if (activeProject) return api.previewProxyUrl(activeProject.id)
    const hostname = window.location.hostname || 'localhost'
    const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
    return `${proto}//${hostname}:3000`
  }, [activeProject, activeChatId, chatPreview])

  const getDefaultDirectUrl = useCallback(() => {
    const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
    if (chatPreview) {
      const hostname = window.location.hostname || 'localhost'
      return `${proto}//${hostname}:${chatPreview.port}`
    }
    const hostname = window.location.hostname || 'localhost'
    return `${proto}//${hostname}:3000`
  }, [chatPreview])

  const applyChatPreview = useCallback(() => {
    if (!activeChatId || !chatPreview) return false
    const hostname = window.location.hostname || 'localhost'
    const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
    const proxied = api.chatPreviewProxyUrl(activeChatId)
    const direct = `${proto}//${hostname}:${chatPreview.port}`
    setUrl(proxied)
    setDirectUrl(direct)
    setRunning(true)
    setError(null)
    setIframeKey((k) => k + 1)
    return true
  }, [activeChatId, chatPreview])

  const loadPreview = useCallback(async (opts?: { forceStart?: boolean }) => {
    // If chat has an AI-driven preview, prefer it (per-chat like plan)
    if (chatPreview && activeChatId) {
      applyChatPreview()
      return
    }
    if (!activeProject) {
      setUrl(getDefaultDirectUrl())
      setDirectUrl(getDefaultDirectUrl())
      setRunning(false)
      setError('Select a project to preview')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await api.startPreview(activeProject.id)
      // Prefer proxied URL for iframe (same-origin, avoids CORS/mixed-content/port exposure)
      const proxied = res.proxiedUrl || api.previewProxyUrl(activeProject.id)
      // directUrl for "open in new tab"
      const hostname = window.location.hostname || 'localhost'
      const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
      const direct = res.url?.replace('127.0.0.1', hostname).replace('localhost', hostname) || `${proto}//${hostname}:${res.port}`
      setUrl(proxied)
      setDirectUrl(direct)
      setRunning(res.running)
      if (!res.running) {
        setError(res.message || res.error || `Preview not reachable on port ${res.port}. Run "npm run dev" in project.`)
      } else {
        setError(null)
      }
      setIframeKey((k) => k + 1)
    } catch (e: any) {
      const msg = e?.message || 'Failed to start preview'
      setError(msg)
      setRunning(false)
      // fallback to proxied url so iframe shows proxy error nicely
      setUrl(api.previewProxyUrl(activeProject.id))
      setDirectUrl(getDefaultDirectUrl())
      toast(msg, 'error')
    } finally {
      setLoading(false)
    }
  }, [activeProject, getDefaultDirectUrl, toast, chatPreview, activeChatId, applyChatPreview])

  // Auto-load when sidebar opens, or project/chat changes while open — chat preview takes precedence (active per chat)
  useEffect(() => {
    if (!open) return
    // chat preview is active per chat like plan — when it exists, show it immediately
    if (chatPreview && activeChatId) {
      // if already showing correct chat preview, don't reload unnecessarily unless chat changed
      if (prevChatIdRef.current !== activeChatId || !url.includes('/api/chats/')) {
        applyChatPreview()
        prevChatIdRef.current = activeChatId
        prevProjectIdRef.current = activeProject?.id ?? null
      }
      return
    }
    const pid = activeProject?.id ?? null
    const cid = activeChatId ?? null
    const shouldReload = pid !== prevProjectIdRef.current || cid !== prevChatIdRef.current || !url
    prevProjectIdRef.current = pid
    prevChatIdRef.current = cid
    if (shouldReload) {
      loadPreview()
    }
  }, [open, activeProject?.id, activeChatId, chatPreview, loadPreview, url, applyChatPreview])

  // Also reload when activeProject changes while already open (without chat preview)
  useEffect(() => {
    if (!open) return
    if (chatPreview && activeChatId) return // chat preview already handled above
    if (activeProject && prevProjectIdRef.current !== activeProject.id) {
      prevProjectIdRef.current = activeProject.id
      loadPreview()
    }
  }, [activeProject, open, loadPreview, chatPreview, activeChatId])

  // When chatPreview arrives/updates for the active chat while panel is open, switch to it
  useEffect(() => {
    if (!open) return
    if (chatPreview && activeChatId) {
      applyChatPreview()
      prevChatIdRef.current = activeChatId
    }
  }, [chatPreview, activeChatId, open, applyChatPreview])

  // Sync port input with current chat preview
  useEffect(() => {
    if (chatPreview) setPortInput(String(chatPreview.port))
    else if (!showPortSettings) setPortInput('')
  }, [chatPreview?.port]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSavePort = async () => {
    const raw = portInput.trim()
    const portNum = Number(raw)
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setPortError('Port must be an integer 1-65535')
      return
    }
    setPortError(null)
    // If activeChatId exists, persist per chat like AI (open_preview) via API
    if (activeChatId) {
      setSavingPort(true)
      try {
        const preview = await api.setChatPreview(activeChatId, portNum)
        onPreviewUpdate?.(preview)
        const hostname = window.location.hostname || 'localhost'
        const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
        const proxied = api.chatPreviewProxyUrl(activeChatId)
        const direct = `${proto}//${hostname}:${portNum}`
        setUrl(proxied)
        setDirectUrl(direct)
        setRunning(true)
        setError(null)
        setIframeKey((k) => k + 1)
        setShowPortSettings(false)
        toast(`Preview port set to :${portNum}`, 'success')
      } catch (e: any) {
        setPortError(e?.message || 'Failed to set port')
      } finally {
        setSavingPort(false)
      }
      return
    }
    // No active chat: manual port without persistence — load direct URL (project or standalone)
    if (!portNum) return
    const hostname = window.location.hostname || 'localhost'
    const proto = window.location.protocol === 'https:' ? 'https:' : 'http:'
    const direct = `${proto}//${hostname}:${portNum}`
    setUrl(direct)
    setDirectUrl(direct)
    setRunning(null)
    setError(null)
    setIframeKey((k) => k + 1)
    setShowPortSettings(false)
    toast(`Preview set to :${portNum}`, 'success')
  }

  const handleClearPort = async () => {
    if (!activeChatId || !chatPreview) return
    setSavingPort(true)
    try {
      await api.deleteChatPreview(activeChatId)
      onPreviewUpdate?.(null)
      setPortInput('')
      setShowPortSettings(false)
      // fallback to project preview or empty
      if (activeProject) {
        loadPreview()
      } else {
        setUrl(getDefaultDirectUrl())
        setDirectUrl(getDefaultDirectUrl())
        setRunning(false)
      }
      toast('Preview port cleared', 'success')
    } catch (e: any) {
      setPortError(e?.message || 'Failed to clear port')
    } finally {
      setSavingPort(false)
    }
  }

  const handleReload = () => {
    if (chatPreview && activeChatId) {
      applyChatPreview()
      return
    }
    if (!activeProject) {
      setIframeKey((k) => k + 1)
      return
    }
    // Re-check status and force iframe remount
    loadPreview()
  }

  const handleOpenExternal = () => {
    // chat preview takes precedence — open the per-chat proxied URL
    if (chatPreview && activeChatId) {
      const target = `${window.location.origin}${api.chatPreviewProxyUrl(activeChatId)}`
      window.open(target, '_blank', 'noopener,noreferrer')
      return
    }
    let target = url
    // Prefer proxied URL (same-origin) as requested: /api/projects/:id/preview/proxy/
    if (activeProject) {
      const proxied = api.previewProxyUrl(activeProject.id)
      // If current url is the proxied one (or empty), use absolute proxied URL
      if (!target || target.includes('/api/projects/') || target === proxied) {
        target = `${window.location.origin}${proxied}`
      } else if (target.startsWith('/')) {
        // relative custom proxy path — make absolute
        target = `${window.location.origin}${target}`
      }
      // If user typed a full http://...:3000 custom URL, respect it
      // otherwise we already set proxied
    } else if (!target) {
      target = directUrl
    }
    if (target) {
      window.open(target, '_blank', 'noopener,noreferrer')
    }
  }

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value)
    setError(null)
  }

  const handleUrlSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const val = e.currentTarget.value.trim()
      if (!val) return
      // User typed custom URL — use it directly, not proxied
      setUrl(val)
      setDirectUrl(val)
      setRunning(null)
      setError(null)
      setIframeKey((k) => k + 1)
    }
  }

  const handleUseProxied = () => {
    if (chatPreview && activeChatId) {
      setUrl(api.chatPreviewProxyUrl(activeChatId))
      setError(null)
      setIframeKey((k) => k + 1)
      return
    }
    if (activeProject) {
      setUrl(api.previewProxyUrl(activeProject.id))
      setError(null)
      setIframeKey((k) => k + 1)
    }
  }

  if (!open) return null

  // iframe src: use url if it's a valid proxied path or absolute URL, otherwise fall back
  const isValidUrl = (u: string) => u.startsWith('/') || u.startsWith('http://') || u.startsWith('https://')
  const iframeSrc = (url && isValidUrl(url)) ? url : getDefaultProxiedUrl()

  return (
    <>
      <aside className={`psb open${isFullscreen ? ' fullscreen' : ''}${isPsbResizing ? ' resizing' : ''}`} style={!isFullscreen ? { width: psbWidth } as any : undefined}>
        <div className="psb-resizer" onMouseDown={handlePsbResizeStart} onDoubleClick={handlePsbResizeDoubleClick} title="Drag to resize — double-click to reset" aria-hidden />
        <div className="psb-header">
          <div className="psb-title">
            {chatPreview && activeChatId ? `Preview :${chatPreview.port}${running === false ? ' — stopped' : running ? ' — running' : ''}` : `Preview${running === false ? ' — stopped' : running ? ' — running' : ''}`}
            {chatPreview && activeChatId ? <span style={{ fontWeight: 400, color: 'var(--text-faint)', marginLeft: 6, fontSize: 11 }}>chat</span> : null}
          </div>
          <div className="psb-actions">
            <button className="icon-btn" aria-label="Preview settings" onClick={() => setShowPortSettings((v) => !v)} title={showPortSettings ? 'Close port settings' : 'Preview settings — set port manually (like AI open_preview)'} style={{ color: showPortSettings ? 'var(--primary)' : undefined, background: showPortSettings ? 'var(--primary-bg)' : undefined, borderColor: showPortSettings ? 'var(--primary-border)' : undefined }}>
              <IconGear size={16} />
            </button>
            <button className="icon-btn" aria-label="Fullscreen" onClick={() => setIsFullscreen((v) => !v)} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen (100% width)'}>
              {isFullscreen ? <IconMinimize size={16} /> : <IconMaximize size={16} />}
            </button>
            <button className="icon-btn" aria-label="Refresh" onClick={handleReload} disabled={loading} title="Reload preview">
              <IconRefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
            <button className="icon-btn" aria-label="Open in new tab" onClick={handleOpenExternal} title="Open in new tab">
              <IconExternalLink size={16} />
            </button>
            <button className="icon-btn psb-close" aria-label="Close preview" onClick={onClose}>
              <IconX size={16} />
            </button>
          </div>
        </div>
        {showPortSettings && (
          <div style={{ padding: '12px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <IconGear size={13} /> Manual Port
              </span>
              <button className="icon-btn" aria-label="Close port settings" onClick={() => setShowPortSettings(false)} style={{ width: 28, height: 28 }}>
                <IconX size={14} />
              </button>
            </div>
            {!activeChatId && (
              <p className="hint" style={{ margin: 0, lineHeight: 1.5 }}>
                No active chat. Port will load directly in preview without saving per chat. For persistent per-chat preview like AI, open a chat first.
              </p>
            )}
            {activeChatId && (
              <p className="hint" style={{ margin: 0, lineHeight: 1.5 }}>
                Same as AI <code>open_preview</code> — sets preview port for this chat (saved per chat like plan). Range 1-65535.
              </p>
            )}
            <div>
              <label className="field-label" style={{ marginTop: 0, marginBottom: 6 }}>Port number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  className="input"
                  type="number"
                  inputMode="numeric"
                  placeholder={chatPreview ? String(chatPreview.port) : 'e.g. 3000, 5173, 8080'}
                  value={portInput}
                  onChange={(e) => { setPortInput(e.target.value); setPortError(null) }}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSavePort() }}
                  style={{ flex: 1 }}
                  min={1}
                  max={65535}
                />
                <button
                  className="btn btn-primary"
                  onClick={handleSavePort}
                  disabled={savingPort || !portInput.trim()}
                  style={{ whiteSpace: 'nowrap', padding: '8px 14px' }}
                >
                  {savingPort ? 'Saving…' : chatPreview ? 'Update' : 'Set Port'}
                </button>
              </div>
              {portError && <p className="field-error" style={{ marginTop: 6 }}>{portError}</p>}
              {chatPreview && activeChatId && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    Current: <code style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: '1px 5px', borderRadius: 4 }}>: {chatPreview.port}</code> {activeChatId ? '(chat)' : ''}
                  </span>
                  <button
                    className="btn"
                    style={{ padding: '4px 8px', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--danger)', borderColor: 'var(--danger-border)' }}
                    onClick={handleClearPort}
                    disabled={savingPort}
                    title="Clear saved port for this chat"
                  >
                    <IconTrash size={12} /> Clear
                  </button>
                </div>
              )}
              <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {[3000, 5173, 8000, 8080].map((p) => (
                  <button
                    key={p}
                    type="button"
                    className="btn"
                    style={{ padding: '4px 8px', fontSize: 12, background: portInput.trim() === String(p) ? 'var(--primary-bg)' : undefined, borderColor: portInput.trim() === String(p) ? 'var(--primary-border)' : undefined, color: portInput.trim() === String(p) ? 'var(--primary)' : undefined }}
                    onClick={() => { setPortInput(String(p)); setPortError(null) }}
                  >
                    :{p}
                  </button>
                ))}
                <span style={{ fontSize: 11, color: 'var(--text-faint)', alignSelf: 'center', marginLeft: 2 }}>quick picks</span>
              </div>
            </div>
          </div>
        )}
        {loading && <div className="psb-loading" style={{ display: 'block', padding: '6px 12px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>Loading…</div>}
        {error && (
          <div className="psb-error" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ flex: 1 }}>{error}</span>
            {activeProject && (
              <button className="btn" style={{ padding: '6px 10px', fontSize: 12, background: '#1a1a1a', borderColor: '#333' }} onClick={() => loadPreview()}>
                <IconPlay size={12} style={{ marginRight: 4 }} /> Retry
              </button>
            )}
          </div>
        )}
        <div className="psb-body">
          <iframe
            ref={iframeRef}
            key={iframeKey}
            className="psb-iframe"
            src={iframeSrc}
            title="Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
            onLoad={() => {
              // Only clear error if we were showing "not reachable" but now loaded
              // Keep error if iframe returned proxy JSON error (detected via content?)
              setError((prev) => (prev && running ? null : prev))
            }}
            onError={() => setError('Failed to load preview — dev server may not be running')}
          />
        </div>
      </aside>
      <div className="scrim psb-scrim show" onClick={onClose} />
    </>
  )
}

export function PreviewSidebarTrigger({ activeProject }: { activeProject: { id: string; path: string } | null }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className="icon-btn psb-toggle"
        aria-label="Toggle preview"
        onClick={() => setOpen(!open)}
      >
        <IconMonitor size={20} />
      </button>
      <PreviewSidebar open={open} onClose={() => setOpen(false)} activeProject={activeProject} />
    </>
  )
}
