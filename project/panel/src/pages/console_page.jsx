import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { addConsoleLog, clearConsole, setServerStatus } from '../store/types'
import { apiFetch } from '../api'
import { useWebSocket } from '../api'

export function ConsolePage() {
  const dispatch = useDispatch()
  const { serverStatus } = useSelector((s) => s)
  const { connected, logs } = useWebSocket()
  const [input, setInput] = useState('')

  // Initialize console logs from server
  useEffect(() => {
    ;(async () => {
      try {
        const initial = await apiFetch('/server/console/logs')
        initial.logs.forEach((line) => dispatch(addConsoleLog(line)))
      } catch {}
    })()
  }, [dispatch])

  // WebSocket auto-sync of new console lines
  useEffect(() => {
    if (!connected) return
    // logs already driven by useWebSocket onmessage
  }, [connected])

  const sendCommand = async (e) => {
    e.preventDefault()
    const cmd = input.trim()
    if (!cmd) return
    setInput('')
    try {
      await apiFetch('/server/send-command', {
        method: 'POST',
        body: JSON.stringify({ command: cmd }),
      })
      dispatch(addConsoleLog(`> ${cmd}`))
    } catch (err) {
      dispatch(addConsoleLog(`[Error: ${err.message}]`))
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      sendCommand(e)
    }
  }

  return (
    <div className="console-page">
      <h1>Console</h1>

      <div className="console-controls">
        <form onSubmit={handleKeyDown} className="console-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a command (e.g. say hello)…"
            disabled={!serverStatus.running}
            autoFocus
          />
          <button type="submit" disabled={!serverStatus.running} className="btn btn-primary">
            Send
          </button>
        </form>
      </div>

      <div className="console-log" role="log" aria-live="polite" aria-atomic="true">
        {logs.map((line, idx) => (
          <div key={idx} className="log-line">
            {line}
          </div>
        ))}
      </div>

      <button
        onClick={clearConsole}
        className="btn"
        disabled={!serverStatus.running}
        title="Clear console"
      >
        Clear
      </button>
    </div>
  )
}