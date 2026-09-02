import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  terminalId: string
  projectPath?: string
}

export function XTermTerminal({ terminalId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

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
      disableStdin: false,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    // small delay to ensure container has size
    requestAnimationFrame(() => {
      try { fit.fit() } catch {}
    })
    termRef.current = term
    fitRef.current = fit

    // focus on click
    const focus = () => term.focus()
    el.addEventListener('click', focus)
    term.focus()

    // --- clipboard helpers: support both modern and fallback ---
    const isMac = navigator.platform.toUpperCase().includes('MAC') || navigator.userAgent.toUpperCase().includes('MAC')

    async function copyToClipboard(text: string): Promise<void> {
      if (!text) return
      try {
        await navigator.clipboard.writeText(text)
        return
      } catch {}
      // fallback via hidden textarea + execCommand
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.left = '-9999px'
        ta.style.top = '-9999px'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {}
    }

    async function pasteFromClipboard(): Promise<void> {
      let text: string | null = null
      try {
        text = await navigator.clipboard.readText()
      } catch {
        text = null
      }
      if (text) {
        const cur = wsRef.current
        if (cur && cur.readyState === WebSocket.OPEN) {
          try { cur.send(text) } catch {}
        }
      } else {
        // fallback: try to trigger browser paste permission prompt or noop
        // no reliable fallback without user gesture, so just warn
        term.write('\r\n\x1b[33m[clipboard read failed — allow clipboard permission or use Ctrl+Shift+V]\x1b[0m\r\n')
      }
    }



    // Custom key handler: make Ctrl+C / Ctrl+V act as copy/paste when possible,
    // but still support SIGINT (Ctrl+C without selection) and control codes.
    // - Ctrl+C (or Cmd+C on Mac): copy if selection exists, else send \x03 (SIGINT)
    // - Ctrl+Shift+C: always copy if selection (Linux standard)
    // - Ctrl+Insert: copy
    // - Ctrl+V (or Cmd+V), Ctrl+Shift+V, Shift+Insert: paste from clipboard
    term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
      const key = ev.key.toLowerCase()
      const code = ev.code
      const ctrl = ev.ctrlKey
      const meta = ev.metaKey
      const shift = ev.shiftKey
      const alt = ev.altKey
      const ctrlOrCmd = isMac ? meta : ctrl

      // --- Copy: Ctrl+Shift+C (always copy, never SIGINT) ---
      if (ctrl && shift && (key === 'c' || code === 'KeyC') && !alt && !meta) {
        if (term.hasSelection()) {
          copyToClipboard(term.getSelection())
        }
        return false
      }
      // --- Copy: Ctrl+Insert ---
      if (ctrl && !shift && !alt && !meta && ev.key === 'Insert') {
        if (term.hasSelection()) copyToClipboard(term.getSelection())
        return false
      }
      // --- Copy: Ctrl+C / Cmd+C ---
      // if selection exists -> copy, else allow xterm to send \x03
      if (ctrlOrCmd && !shift && !alt && (key === 'c' || code === 'KeyC')) {
        if (term.hasSelection()) {
          copyToClipboard(term.getSelection())
          return false
        }
        // no selection -> let xterm send SIGINT (0x03) via onData
        return true
      }

      // --- Paste: Ctrl+Shift+V (Linux) ---
      if (ctrl && shift && (key === 'v' || code === 'KeyV') && !alt && !meta) {
        ev.preventDefault()
        pasteFromClipboard()
        return false
      }
      // --- Paste: Shift+Insert ---
      if (shift && !ctrl && !meta && !alt && ev.key === 'Insert') {
        ev.preventDefault()
        pasteFromClipboard()
        return false
      }
      // --- Paste: Ctrl+V / Cmd+V ---
      // handle both Ctrl+V and Cmd+V (Mac)
      if (ctrlOrCmd && !shift && !alt && (key === 'v' || code === 'KeyV')) {
        ev.preventDefault()
        pasteFromClipboard()
        return false
      }

      return true
    })

    // Right-click: copy if selection, else paste (common terminal behavior)
    // Middle-click also pastes on Linux.
    const onContextMenu = (e: MouseEvent) => {
      // only handle when terminal is focused / under cursor
      // prevent native menu and do terminal copy/paste
      e.preventDefault()
      if (term.hasSelection()) {
        copyToClipboard(term.getSelection())
      } else {
        pasteFromClipboard()
      }
      term.focus()
    }
    const onAuxClick = (e: MouseEvent) => {
      if (e.button === 1) {
        // middle button - paste
        e.preventDefault()
        pasteFromClipboard()
        term.focus()
      }
    }
    el.addEventListener('contextmenu', onContextMenu)
    el.addEventListener('auxclick', onAuxClick)

    // Build WS URL — use same host, upgrades via vite proxy in dev
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    // include initial size
    const cols = term.cols
    const rows = term.rows
    const wsUrl = `${proto}//${location.host}/api/terminals/${terminalId}/pty?cols=${cols}&rows=${rows}`
    let ws: WebSocket
    let closedByUs = false
    let reconnectTimer: number | null = null
    let resizeObserver: ResizeObserver | null = null

    function connect() {
      setError(null)
      ws = new WebSocket(wsUrl)
      ws.binaryType = 'arraybuffer'
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
        // send current size
        try {
          ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        } catch {}
        term.focus()
      }
      ws.onclose = () => {
        setConnected(false)
        wsRef.current = null
        if (!closedByUs) {
          // attempt reconnect after 1s
          term.write('\r\n\x1b[90m[disconnected — reconnecting...]\x1b[0m\r\n')
          reconnectTimer = window.setTimeout(connect, 1200)
        }
      }
      ws.onerror = () => {
        setError('Connection error')
      }
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          term.write(ev.data)
        } else if (ev.data instanceof ArrayBuffer) {
          const text = new TextDecoder().decode(ev.data)
          term.write(text)
        } else if (ev.data instanceof Blob) {
          ev.data.text().then((t) => term.write(t))
        }
      }
    }

    connect()

    // terminal -> ws
    const dataDispose = term.onData((data) => {
      const cur = wsRef.current
      if (cur && cur.readyState === WebSocket.OPEN) {
        try { cur.send(data) } catch {}
      }
    })

    // resize handling
    const sendResize = () => {
      try { fit.fit() } catch {}
      const cur = wsRef.current
      if (cur && cur.readyState === WebSocket.OPEN) {
        try {
          cur.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
        } catch {}
      }
    }

    // observe container resize
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        // debounce a bit
        requestAnimationFrame(sendResize)
      })
      resizeObserver.observe(el)
    }
    window.addEventListener('resize', sendResize)

    // also handle terminal resize explicitly
    const resizeDispose = (term as any).onResize
      ? term.onResize(({ cols: c, rows: r }: { cols: number; rows: number }) => {
          const cur = wsRef.current
          if (cur && cur.readyState === WebSocket.OPEN) {
            try { cur.send(JSON.stringify({ type: 'resize', cols: c, rows: r })) } catch {}
          }
        })
      : { dispose: () => {} }

    return () => {
      closedByUs = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      el.removeEventListener('click', focus)
      el.removeEventListener('contextmenu', onContextMenu)
      el.removeEventListener('auxclick', onAuxClick)
      window.removeEventListener('resize', sendResize)
      if (resizeObserver) {
        try { resizeObserver.disconnect() } catch {}
      }
      try { dataDispose.dispose() } catch {}
      try { resizeDispose.dispose() } catch {}
      try { wsRef.current?.close() } catch {}
      wsRef.current = null
      try { term.dispose() } catch {}
      termRef.current = null
      fitRef.current = null
    }
  }, [terminalId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: '#000' }}>
      {!connected && !error && (
        <div style={{ fontSize: 11, color: '#6b6b6b', padding: '4px 8px', background: '#0a0a0a', borderBottom: '1px solid #1a1a1a', fontFamily: 'ui-monospace, monospace' }}>
          connecting…
        </div>
      )}
      {error && (
        <div style={{ fontSize: 11, color: '#ef4444', padding: '4px 8px', background: '#140a0a', borderBottom: '1px solid #2a1a1a' }}>
          {error}
        </div>
      )}
      <div
        ref={containerRef}
        style={{ flex: 1, minHeight: 0, padding: '6px 0 6px 6px', background: '#000' }}
      />
    </div>
  )
}
