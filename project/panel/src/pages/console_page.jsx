import { useEffect, useRef, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { addConsoleLog, clearConsole } from '../types.js'
import { apiFetch, openWebSocket } from '../api.jsx'

export function ConsolePage() {
  const dispatch = useDispatch()
  const logs = useSelector((s) => s.consoleLogs)
  const serverStatus = useSelector((s) => s.serverStatus)
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)
  const logRef = useRef(null)

  // Initialize console logs from server
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const initial = await apiFetch('/server/console/logs')
        if (cancelled) return
        dispatch(clearConsole())
        ;(initial.logs || []).forEach((line) => dispatch(addConsoleLog(line)))
      } catch (e) {
        console.warn('Failed to load logs', e)
      }
    })()

    wsRef.current = openWebSocket({
      onOpen: () => setConnected(true),
      onClose: () => setConnected(false),
      onMessage: (data) => {
        if (data.type === 'log' || data.type === 'system') {
          dispatch(addConsoleLog(data.line))
        } else if (data.type === 'log-buffer') {
          dispatch(clearConsole())
          ;(data.lines || []).forEach((line) => dispatch(addConsoleLog(line)))
        }
      },
    })

    return () => {
      cancelled = true
      if (wsRef.current) try { wsRef.current.close() } catch {}
    }
  }, [dispatch])

  // Auto-scroll on new log
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [logs])

  const sendCommand = async (e) => {
    e?.preventDefault()
    const cmd = input.trim()
    if (!cmd) return
    setInput('')
    dispatch(addConsoleLog(`> ${cmd}`))
    // Send via WS if connected, otherwise via REST
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'console-input', line: cmd }))
    } else {
      try {
        await apiFetch('/server/send-command', {
          method: 'POST',
          body: { command: cmd },
        })
      } catch (err) {
        dispatch(addConsoleLog(`[Error: ${err.message}]`))
      }
    }
  }

  const handleClear = () => dispatch(clearConsole())

  return (
    <div className="page console-page">
      <header className="page-header">
        <h1>Console</h1>
        <p className="subtitle">
          Live server logs {connected && <span className="badge badge-ok">● connected</span>}
        </p>
      </header>

      <div className="console-controls">
        <form onSubmit={sendCommand} className="console-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command (e.g. say hello, list, op Player)…"
            disabled={!serverStatus?.running}
            autoFocus
          />
          <button type="submit" disabled={!serverStatus?.running} className="btn btn-primary">
            Send
          </button>
          <button type="button" onClick={handleClear} className="btn">Clear</button>
        </form>
      </div>

      <div className="console-log" ref={logRef} role="log" aria-live="polite">
        {logs.length === 0 ? (
          <div className="muted console-empty">No logs yet</div>
        ) : (
          logs.map((line, idx) => (
            <div key={idx} className="log-line">{line}</div>
          ))
        )}
      </div>
    </div>
  )
}
