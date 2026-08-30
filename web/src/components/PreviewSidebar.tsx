import { useState, useEffect, useRef, useCallback } from 'react'
import { IconX, IconRefreshCw, IconExternalLink, IconMonitor, IconPlay, IconMaximize, IconMinimize } from '../icons'
import { useToast } from '../toast'
import * as api from '../api'

import type { Preview } from '../types'

interface PreviewSidebarProps {
  open: boolean
  onClose: () => void
  activeProject: { id: string; path: string } | null
  activeChatId?: string | null
  chatPreview?: Preview | null
}

export function PreviewSidebar({ open, onClose, activeProject, activeChatId = null, chatPreview = null }: PreviewSidebarProps) {
  const toast = useToast()
  const [url, setUrl] = useState<string>('')
  const [directUrl, setDirectUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<boolean | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeKey, setIframeKey] = useState(0)
  const prevProjectIdRef = useRef<string | null>(null)
  const prevChatIdRef = useRef<string | null>(null)

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
      <aside className={`psb open${isFullscreen ? ' fullscreen' : ''}`}>
        <div className="psb-header">
          <div className="psb-title">
            {chatPreview && activeChatId ? `Preview :${chatPreview.port}${running === false ? ' — stopped' : running ? ' — running' : ''}` : `Preview${running === false ? ' — stopped' : running ? ' — running' : ''}`}
            {chatPreview && activeChatId ? <span style={{ fontWeight: 400, color: 'var(--text-faint)', marginLeft: 6, fontSize: 11 }}>chat</span> : null}
          </div>
          <div className="psb-actions">
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
