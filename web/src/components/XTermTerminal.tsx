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
