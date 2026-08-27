import { useState, useEffect, useRef } from 'react'
import { IconX, IconRefreshCw, IconExternalLink, IconMonitor } from '../icons'
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [iframeKey, setIframeKey] = useState(0)

  const defaultUrl = 'http://localhost:3000'

  useEffect(() => {
    if (open && !url) {
      setUrl(defaultUrl)
    }
  }, [open, url])

  const loadUrl = async (targetUrl: string) => {
    setLoading(true)
    setError(null)
    try {
      if (activeProject) {
        const res = await api.startPreview(activeProject.id)
        if (res.url) {
          setUrl(res.url)
          return
        }
      }
      setUrl(targetUrl || defaultUrl)
    } catch {
      setUrl(targetUrl || defaultUrl)
    } finally {
      setLoading(false)
    }
  }

  const handleReload = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src
    }
  }

  const handleOpenExternal = () => {
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(e.target.value)
  }

  const handleUrlSubmit = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      loadUrl(e.currentTarget.value)
    }
  }

  if (!open) return null

  return (
    <>
      <aside className="psb open">
        <div className="psb-header">
          <div className="psb-title">Preview</div>
          <div className="psb-actions">
            <button className="icon-btn" aria-label="Refresh" onClick={() => handleReload()} disabled={loading}>
              <IconRefreshCw size={16} className={loading ? 'spin' : ''} />
            </button>
            <button className="icon-btn" aria-label="Open in new tab" onClick={handleOpenExternal}>
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
            placeholder="Enter URL (e.g. http://localhost:3000)"
            value={url}
            onChange={handleUrlChange}
            onKeyDown={handleUrlSubmit}
            disabled={loading}
          />
          {loading && <span className="psb-loading">Loading…</span>}
        </div>
        {error && <div className="psb-error">{error}</div>}
        <div className="psb-body">
          <iframe
            ref={iframeRef}
            key={iframeKey}
            className="psb-iframe"
            src={url}
            title="Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-popups-to-escape-sandbox"
            onLoad={() => setError(null)}
            onError={() => setError('Failed to load preview')}
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