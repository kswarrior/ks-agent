import { useState, useEffect, useRef, useCallback } from 'react'
import { IconX, IconRefreshCw, IconExternalLink, IconMonitor, IconPlay } from '../icons'
import { useToast } from '../toast'
import * as api from '../api'

interface PreviewSidebarProps {
  open: boolean
  onClose: () => void
  activeProject: { id: string; path: string } | null
}

export function PreviewSidebar({ open, onClose, activeProject }: PreviewSidebarProps) {
  const toast = useToast()
  const [url, setUrl] = useState<string>('')
  const [directUrl, setDirectUrl] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState<boolean | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeKey, setIframeKey] = useState(0)
  const prevProjectIdRef = useRef<string | null>(null)

  const getDefaultProxiedUrl = useCallback(() => {
    if (activeProject) return api.previewProxyUrl(activeProject.id)
    const hostname = window.location.hostname || 'localhost'
    return `http://${hostname}:3000`
  }, [activeProject])

  const getDefaultDirectUrl = useCallback(() => {
    const hostname = window.location.hostname || 'localhost'
    return `http://${hostname}:3000`
  }, [])

  const loadPreview = useCallback(async (opts?: { forceStart?: boolean }) => {
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
      const direct = res.url?.replace('127.0.0.1', hostname).replace('localhost', hostname) || `http://${hostname}:${res.port}`
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
  }, [activeProject, getDefaultDirectUrl, toast])

  // Auto-load when sidebar opens or project changes while open
  useEffect(() => {
    if (!open) return
    const pid = activeProject?.id ?? null
    const shouldReload = pid !== prevProjectIdRef.current || !url
    prevProjectIdRef.current = pid
    if (shouldReload) {
      loadPreview()
    }
  }, [open, activeProject?.id, loadPreview, url])

  // Also reload when activeProject changes while already open
  useEffect(() => {
    if (!open) return
    if (activeProject && prevProjectIdRef.current !== activeProject.id) {
      prevProjectIdRef.current = activeProject.id
      loadPreview()
    }
  }, [activeProject, open, loadPreview])

  const handleReload = () => {
    if (!activeProject) {
      setIframeKey((k) => k + 1)
      return
    }
    // Re-check status and force iframe remount
    loadPreview()
  }

  const handleOpenExternal = () => {
    const target = directUrl || url
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
    if (activeProject) {
      setUrl(api.previewProxyUrl(activeProject.id))
      setError(null)
      setIframeKey((k) => k + 1)
    }
  }

  if (!open) return null

  // iframe src: if it looks like a proxied path, keep as is; otherwise use url
  const iframeSrc = url || getDefaultProxiedUrl()

  return (
    <>
      <aside className="psb open">
        <div className="psb-header">
          <div className="psb-title">Preview{running === false ? ' — stopped' : running ? ' — running' : ''}</div>
          <div className="psb-actions">
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
        <div className="psb-toolbar">
          <label htmlFor="psb-url" className="visually-hidden">Preview URL</label>
          <IconMonitor size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
          <input
            id="psb-url"
            type="text"
            className="psb-url-input"
            placeholder={activeProject ? 'Preview via proxy (Enter for custom URL)' : 'Enter URL (e.g. http://localhost:3000)'}
            value={url}
            onChange={handleUrlChange}
            onKeyDown={handleUrlSubmit}
            disabled={loading}
          />
          {loading && <span className="psb-loading">Loading…</span>}
          {!loading && activeProject && url && !url.includes('/api/projects/') && (
            <button className="btn" style={{ padding: '6px 10px', fontSize: 12, whiteSpace: 'nowrap' }} onClick={handleUseProxied} title="Switch back to proxied preview">
              Use proxy
            </button>
          )}
        </div>
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
