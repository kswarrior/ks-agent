import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from '../api'
import type { PreviewStatus, Project } from '../types'

interface Geometry {
  x: number
  y: number
  width: number
  height: number
}

const STORAGE_KEY = 'ks-preview-window-v1'
const MIN_WIDTH = 380
const MIN_HEIGHT = 320
const VIEWPORT_MARGIN = 8

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function clampGeometry(geometry: Geometry): Geometry {
  const maxWidth = Math.max(MIN_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2)
  const maxHeight = Math.max(MIN_HEIGHT, window.innerHeight - VIEWPORT_MARGIN * 2)
  const width = clamp(geometry.width, MIN_WIDTH, maxWidth)
  const height = clamp(geometry.height, MIN_HEIGHT, maxHeight)
  return {
    width,
    height,
    x: clamp(geometry.x, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, window.innerWidth - width - VIEWPORT_MARGIN)),
    y: clamp(geometry.y, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN))
  }
}

function defaultGeometry(): Geometry {
  const width = Math.min(980, Math.max(MIN_WIDTH, window.innerWidth - 48))
  const height = Math.min(680, Math.max(MIN_HEIGHT, window.innerHeight - 48))
  return clampGeometry({
    width,
    height,
    x: Math.round((window.innerWidth - width) / 2),
    y: Math.round((window.innerHeight - height) / 2)
  })
}

function loadGeometry(): Geometry {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultGeometry()
    const parsed = JSON.parse(raw) as Partial<Geometry>
    if (
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.width !== 'number' ||
      typeof parsed.height !== 'number'
    ) {
      return defaultGeometry()
    }
    return clampGeometry(parsed as Geometry)
  } catch {
    return defaultGeometry()
  }
}

function previewHostUrl(proxyPort: number): string {
  const hostname = window.location.hostname || 'localhost'
  const host = hostname.includes(':') && !hostname.startsWith('[') ? `[${hostname}]` : hostname
  const protocol = window.location.protocol === 'https:' ? 'http:' : window.location.protocol
  return `${protocol}//${host}:${proxyPort}/`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function PreviewWindow({
  project,
  chatId,
  modelId,
  streaming,
  autoStart,
  focusSeq,
  onClose,
  onSend
}: {
  project: Project
  chatId: string | null
  modelId: string
  streaming: boolean
  autoStart: boolean
  focusSeq: number
  onClose: () => void
  onSend: (content: string) => void
}) {
  const [status, setStatus] = useState<PreviewStatus | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [pollError, setPollError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [command, setCommand] = useState('')
  const [port, setPort] = useState('')
  const [geometry, setGeometry] = useState<Geometry>(loadGeometry)
  const [minimized, setMinimized] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [tab, setTab] = useState<'web' | 'android'>('web')
  const [iframeKey, setIframeKey] = useState(0)
  const [showLogs, setShowLogs] = useState(false)
  const commandTouched = useRef(false)
  const portTouched = useRef(false)
  const autoStarted = useRef(false)
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null)
  const resizeState = useRef<{ pointerId: number; startX: number; startY: number; width: number; height: number } | null>(
    null
  )
  const wasStreaming = useRef(streaming)

  const loadStatus = useCallback(async () => {
    try {
      const next = await api.getProjectPreview(project.id)
      setStatus(next)
      setPollError(null)
    } catch (error) {
      setPollError(errorMessage(error))
    }
  }, [project.id])

  useEffect(() => {
    let cancelled = false
    const tick = () => {
      if (!cancelled) void loadStatus()
    }
    tick()
    const timer = window.setInterval(tick, 1500)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [loadStatus])

  useEffect(() => {
    if (!status) return
    if (!commandTouched.current) setCommand(status.detected.command)
    if (!portTouched.current) setPort(String(status.detected.port))
  }, [status])

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(geometry))
    } catch {
      // ignore storage failures
    }
  }, [geometry])

  useEffect(() => {
    const onResize = () => setGeometry((current) => clampGeometry(current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (wasStreaming.current && !streaming && status?.status === 'running') {
      setIframeKey((key) => key + 1)
    }
    wasStreaming.current = streaming
  }, [streaming, status?.status])

  useEffect(() => {
    if (focusSeq > 0) {
      setMinimized(false)
      autoStarted.current = false
    }
  }, [focusSeq])

  const start = useCallback(
    async (override?: { command?: string; port?: number }) => {
      if (busy) return
      setBusy(true)
      setRequestError(null)
      try {
        const next = await api.startProjectPreview(project.id, {
          command: override?.command ?? (command.trim() || undefined),
          port: override?.port ?? (port.trim() ? Number(port) : undefined),
          cwd: status?.detected.cwd || undefined
        })
        setStatus(next)
        setIframeKey((key) => key + 1)
      } catch (error) {
        setRequestError(errorMessage(error))
      } finally {
        setBusy(false)
      }
    },
    [busy, command, port, project.id, status?.detected.cwd]
  )

  useEffect(() => {
    if (!autoStart || autoStarted.current || !status) return
    autoStarted.current = true
    if (status.status !== 'stopped' || !status.detected.command) return
    void start({ command: status.detected.command, port: status.detected.port })
  }, [autoStart, start, status])

  const stop = async () => {
    if (busy) return
    setBusy(true)
    setRequestError(null)
    try {
      setStatus(await api.stopProjectPreview(project.id))
    } catch (error) {
      setRequestError(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (maximized) return
    if ((event.target as HTMLElement).closest('button')) return
    event.preventDefault()
    dragState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: geometry.x,
      y: geometry.y
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragState.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    setGeometry((current) => clampGeometry({ ...current, x: drag.x + dx, y: drag.y + dy }))
  }

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragState.current?.pointerId !== event.pointerId) return
    dragState.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // capture was already released
    }
  }

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (maximized) return
    event.preventDefault()
    resizeState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: geometry.width,
      height: geometry.height
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeState.current
    if (!resize || resize.pointerId !== event.pointerId) return
    const dx = event.clientX - resize.startX
    const dy = event.clientY - resize.startY
    setGeometry((current) =>
      clampGeometry({ ...current, width: resize.width + dx, height: resize.height + dy })
    )
  }

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizeState.current?.pointerId !== event.pointerId) return
    resizeState.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // capture was already released
    }
  }

  const previewUrl = status?.proxyPort ? previewHostUrl(status.proxyPort) : null
  const externalUrl = previewUrl || status?.url || null
  const tone =
    status?.status === 'running'
      ? 'ok'
      : status?.status === 'starting'
        ? 'starting'
        : status?.status === 'error'
          ? 'error'
          : 'idle'
  const statusLabel =
    status?.status === 'running'
      ? `localhost:${status.port}`
      : status?.status === 'starting'
        ? 'Starting…'
        : status?.status === 'error'
          ? 'Needs attention'
          : 'Stopped'
  const visibleError = requestError || pollError || status?.error || null

  const askAiToStart = () => {
    if (!chatId || !modelId || streaming) return
    onSend(
      'Start the web app for a live preview. Use the preview_app tool so the preview window shows it. Detect the dev command, folder and port first if needed.'
    )
  }

  const submitPrompt = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || !chatId || !modelId || streaming) return
    setDraft('')
    onSend(content)
  }

  if (minimized) {
    return (
      <div className="preview-mini" role="dialog" aria-label="Minimized app preview">
        <span className={`preview-dot ${tone}`} aria-hidden="true" />
        <button className="preview-mini-label" onClick={() => setMinimized(false)} title="Restore preview">
          <strong>{project.name}</strong>
          <span>{statusLabel}</span>
        </button>
        <button
          className="preview-mini-btn"
          onClick={() => setMinimized(false)}
          title="Restore"
          aria-label="Restore preview"
        >
          □
        </button>
        <button className="preview-mini-btn close" onClick={onClose} title="Close" aria-label="Close preview">
          ×
        </button>
      </div>
    )
  }

  return (
    <section
      className={`preview-window${maximized ? ' maximized' : ''}`}
      style={
        maximized
          ? undefined
          : { left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height }
      }
      role="dialog"
      aria-label={`${project.name} app preview`}
    >
      <div
        className="preview-titlebar"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) return
          setMaximized((value) => !value)
        }}
      >
        <div className="preview-title">
          <span className={`preview-dot ${tone}`} aria-hidden="true" />
          <span className="preview-title-name">{project.name}</span>
          <span className="preview-title-sub">Live preview</span>
        </div>
        <div className="preview-window-actions">
          <button
            className="preview-window-btn"
            onClick={() => window.open(externalUrl ?? '', '_blank', 'noopener,noreferrer')}
            disabled={!externalUrl}
            title="Open in a new tab"
            aria-label="Open preview in a new tab"
          >
            ↗
          </button>
          <button
            className="preview-window-btn"
            onClick={() => setIframeKey((key) => key + 1)}
            disabled={!previewUrl}
            title="Reload preview"
            aria-label="Reload preview"
          >
            ⟳
          </button>
          <button
            className="preview-window-btn"
            onClick={() => setMinimized(true)}
            title="Minimize"
            aria-label="Minimize preview"
          >
            –
          </button>
          <button
            className="preview-window-btn"
            onClick={() => setMaximized((value) => !value)}
            title={maximized ? 'Restore window' : 'Maximize'}
            aria-label={maximized ? 'Restore window' : 'Maximize preview'}
          >
            {maximized ? '❐' : '□'}
          </button>
          <button
            className="preview-window-btn close"
            onClick={onClose}
            title="Close"
            aria-label="Close preview"
          >
            ×
          </button>
        </div>
      </div>

      <div className="preview-tabs" role="tablist" aria-label="Preview platform">
        <button
          className={`settings-tab ${tab === 'web' ? 'active' : ''}`}
          onClick={() => setTab('web')}
          role="tab"
          aria-selected={tab === 'web'}
        >
          Web
        </button>
        <button
          className={`settings-tab ${tab === 'android' ? 'active' : ''}`}
          onClick={() => setTab('android')}
          role="tab"
          aria-selected={tab === 'android'}
        >
          Android
        </button>
      </div>

      {tab === 'web' ? (
        <>
          <div className="preview-statusbar">
            <span className={`preview-dot ${tone}`} aria-hidden="true" />
            <span className="preview-status-label">{statusLabel}</span>
            {status?.framework && <span className="preview-badge">{status.framework}</span>}
            {status?.status === 'running' && !status.owned && <span className="preview-badge">external</span>}
            <span className="preview-status-spacer" />
            <button className="preview-link-btn" onClick={() => setShowLogs((value) => !value)}>
              {showLogs ? 'Hide logs' : 'Logs'}
            </button>
            {status?.status === 'running' || status?.status === 'starting' ? (
              <button className="preview-link-btn danger" onClick={() => void stop()} disabled={busy}>
                {status.owned ? 'Stop' : 'Detach'}
              </button>
            ) : (
              <button
                className="preview-link-btn"
                onClick={() => void start()}
                disabled={busy || !command.trim()}
              >
                {busy ? 'Starting…' : 'Start'}
              </button>
            )}
          </div>

          {visibleError && <div className="preview-error">{visibleError}</div>}

          <div className="preview-view">
            {status?.status === 'running' && previewUrl ? (
              <iframe
                key={`${previewUrl}:${iframeKey}`}
                className="preview-frame"
                src={previewUrl}
                title={`${project.name} app preview`}
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            ) : (
              <div className="preview-setup">
                {status?.status === 'starting' ? (
                  <div className="preview-starting">
                    <span className="preview-spinner" aria-hidden="true" />
                    <strong>Starting {status.framework || 'app'}…</strong>
                    <p>{status.command}</p>
                    <span>
                      Waiting for port {status.port}. The preview appears automatically when the server is ready.
                    </span>
                  </div>
                ) : (
                  <>
                    <div className="preview-setup-title">
                      <strong>{status?.detected.framework || 'Web app'} preview</strong>
                      <span>Folder: {status?.detected.cwd || '.'}</span>
                    </div>
                    <div className="preview-fields">
                      <label className="preview-field">
                        <span>Command</span>
                        <input
                          value={command}
                          onChange={(event) => {
                            commandTouched.current = true
                            setCommand(event.target.value)
                          }}
                          placeholder="npm run dev"
                          spellCheck={false}
                        />
                      </label>
                      <label className="preview-field preview-field-port">
                        <span>Port</span>
                        <input
                          value={port}
                          onChange={(event) => {
                            portTouched.current = true
                            setPort(event.target.value)
                          }}
                          inputMode="numeric"
                          aria-label="Preview port"
                        />
                      </label>
                    </div>
                    <div className="preview-setup-actions">
                      <button
                        className="btn primary"
                        onClick={() => void start()}
                        disabled={busy || !command.trim()}
                      >
                        {busy ? 'Starting…' : 'Start preview'}
                      </button>
                      <button
                        className="btn ghost"
                        onClick={askAiToStart}
                        disabled={!chatId || !modelId || streaming}
                        title={
                          !chatId
                            ? 'Select a chat first'
                            : !modelId
                              ? 'Add a model in Settings first'
                              : 'Send a prompt asking the AI to start the app'
                        }
                      >
                        Ask AI to start
                      </button>
                    </div>
                    {status?.detected.note && <p className="preview-note">{status.detected.note}</p>}
                  </>
                )}
              </div>
            )}
          </div>

          {showLogs && (
            <pre className="preview-logs" aria-label="Preview logs">
              {status?.output.trim() || 'No output yet.'}
            </pre>
          )}

          <form className="preview-prompt" onSubmit={submitPrompt}>
            <div className="preview-prompt-head">
              <span>Ask AI</span>
              {streaming ? (
                <span className="preview-prompt-live">
                  <span className="preview-dot starting" aria-hidden="true" />
                  Working…
                </span>
              ) : (
                <span className="preview-prompt-hint">Changes update the preview live</span>
              )}
            </div>
            <div className="preview-prompt-row">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  !chatId
                    ? 'Select a chat to send prompts'
                    : !modelId
                      ? 'Add a model in Settings first'
                      : 'Describe a change and watch the preview update…'
                }
                disabled={!chatId || !modelId || streaming}
                aria-label="Prompt the AI about this preview"
              />
              <button
                className="btn primary small"
                type="submit"
                disabled={!draft.trim() || !chatId || !modelId || streaming}
              >
                Send
              </button>
            </div>
          </form>
        </>
      ) : (
        <div className="preview-soon">
          <svg
            className="preview-soon-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="7" y="2" width="10" height="20" rx="2.5" />
            <path d="M11 18h2" />
          </svg>
          <strong>Android preview</strong>
          <p>Coming soon</p>
        </div>
      )}

      {!maximized && (
        <div
          className="preview-resize"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          role="presentation"
          title="Resize preview"
        />
      )}
    </section>
  )
}
