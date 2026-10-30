import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export function XTermTerminal({
  projectId,
  terminalId,
  active
}: {
  projectId: string
  terminalId: string
  active: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!active) return
    const frame = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        // ignore
      }
      termRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [active])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: {
        background: '#000000',
        foreground: '#e8e8e8',
        cursor: '#e8e8e8',
        cursorAccent: '#000000',
        selectionBackground: '#3a3a3a',
        selectionForeground: '#ffffff',
        black: '#000000',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#e8e8e8',
        brightBlack: '#6b6b6b',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff'
      },
      allowTransparency: false,
      scrollback: 8000,
      convertEol: true,
      cursorStyle: 'block',
      disableStdin: false
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(element)
    termRef.current = term
    fitRef.current = fit
    requestAnimationFrame(() => {
      try {
        fit.fit()
      } catch {
        // ignore
      }
    })

    const focus = () => term.focus()
    element.addEventListener('click', focus)
    term.focus()

    const isMac =
      navigator.platform.toUpperCase().includes('MAC') || navigator.userAgent.toUpperCase().includes('MAC')

    async function copyToClipboard(text: string): Promise<void> {
      if (!text) return
      try {
        await navigator.clipboard.writeText(text)
        return
      } catch {
        // fall through
      }
      try {
        const textarea = document.createElement('textarea')
        textarea.value = text
        textarea.style.position = 'fixed'
        textarea.style.left = '-9999px'
        textarea.style.top = '-9999px'
        document.body.appendChild(textarea)
        textarea.focus()
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
      } catch {
        // ignore
      }
    }

    async function pasteFromClipboard(): Promise<void> {
      let text: string | null = null
      try {
        text = await navigator.clipboard.readText()
      } catch {
        text = null
      }
      if (text) {
        const current = wsRef.current
        if (current && current.readyState === WebSocket.OPEN) {
          try {
            current.send(text)
          } catch {
            // ignore
          }
        }
      } else {
        term.write('\r\n\x1b[33m[clipboard read failed — allow clipboard permission or use Ctrl+Shift+V]\x1b[0m\r\n')
      }
    }

    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const code = event.code
      const ctrl = event.ctrlKey
      const meta = event.metaKey
      const shift = event.shiftKey
      const alt = event.altKey
      const ctrlOrCmd = isMac ? meta : ctrl

      if (ctrl && shift && (key === 'c' || code === 'KeyC') && !alt && !meta) {
        if (term.hasSelection()) void copyToClipboard(term.getSelection())
        return false
      }
      if (ctrl && !shift && !alt && !meta && event.key === 'Insert') {
        if (term.hasSelection()) void copyToClipboard(term.getSelection())
        return false
      }
      if (ctrlOrCmd && !shift && !alt && (key === 'c' || code === 'KeyC')) {
        if (term.hasSelection()) {
          void copyToClipboard(term.getSelection())
          return false
        }
        return true
      }
      if (ctrl && shift && (key === 'v' || code === 'KeyV') && !alt && !meta) {
        event.preventDefault()
        void pasteFromClipboard()
        return false
      }
      if (shift && !ctrl && !meta && !alt && event.key === 'Insert') {
        event.preventDefault()
        void pasteFromClipboard()
        return false
      }
      if (ctrlOrCmd && !shift && !alt && (key === 'v' || code === 'KeyV')) {
        event.preventDefault()
        void pasteFromClipboard()
        return false
      }
      return true
    })

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      if (term.hasSelection()) void copyToClipboard(term.getSelection())
      else void pasteFromClipboard()
      term.focus()
    }
    const onAuxClick = (event: MouseEvent) => {
      if (event.button === 1) {
        event.preventDefault()
        void pasteFromClipboard()
        term.focus()
      }
    }
    element.addEventListener('contextmenu', onContextMenu)
    element.addEventListener('auxclick', onAuxClick)

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${protocol}//${location.host}/api/projects/${encodeURIComponent(projectId)}/terminal?terminal=${encodeURIComponent(terminalId)}&cols=${term.cols}&rows=${term.rows}`
    let closedByUs = false
    let reconnectTimer: number | null = null
    let resizeObserver: ResizeObserver | null = null
    let lastCols = 0
    let lastRows = 0

    const sendSize = (force = false) => {
      const current = wsRef.current
      if (!current || current.readyState !== WebSocket.OPEN) return
      const cols = term.cols
      const rows = term.rows
      if (!force && cols === lastCols && rows === lastRows) return
      lastCols = cols
      lastRows = rows
      try {
        current.send(JSON.stringify({ type: 'resize', cols, rows }))
      } catch {
        // ignore
      }
    }

    const connect = () => {
      setError(null)
      const ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        sendSize(true)
        term.focus()
      }
      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        if (!closedByUs) {
          term.write('\r\n\x1b[90m[disconnected — reconnecting...]\x1b[0m\r\n')
          reconnectTimer = window.setTimeout(connect, 1200)
        }
      }
      ws.onerror = () => setError('Connection error')
      ws.onmessage = (event) => {
        if (typeof event.data === 'string') {
          term.write(event.data)
        } else if (event.data instanceof ArrayBuffer) {
          term.write(new TextDecoder().decode(event.data))
        } else if (event.data instanceof Blob) {
          void event.data.text().then((text) => term.write(text))
        }
      }
    }

    connect()

    const dataDispose = term.onData((data) => {
      const current = wsRef.current
      if (current && current.readyState === WebSocket.OPEN) {
        try {
          current.send(data)
        } catch {
          // ignore
        }
      }
    })

    const sendResize = () => {
      try {
        fit.fit()
      } catch {
        // ignore
      }
      sendSize()
    }

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => requestAnimationFrame(sendResize))
      resizeObserver.observe(element)
    }
    window.addEventListener('resize', sendResize)

    const resizeDispose = term.onResize(() => sendSize())

    return () => {
      closedByUs = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      element.removeEventListener('click', focus)
      element.removeEventListener('contextmenu', onContextMenu)
      element.removeEventListener('auxclick', onAuxClick)
      window.removeEventListener('resize', sendResize)
      resizeObserver?.disconnect()
      dataDispose.dispose()
      resizeDispose.dispose()
      try {
        wsRef.current?.close()
      } catch {
        // ignore
      }
      wsRef.current = null
      termRef.current = null
      fitRef.current = null
      try {
        term.dispose()
      } catch {
        // ignore
      }
    }
  }, [projectId, terminalId])

  return (
    <div className="terminal-panel">
      {!connected && !error && <div className="terminal-status">connecting…</div>}
      {error && <div className="terminal-status error">{error}</div>}
      <div className="terminal-host" ref={containerRef} />
    </div>
  )
}
