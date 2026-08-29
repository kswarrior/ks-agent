import { useState, useEffect, useRef, useCallback } from 'react'
import { IconClear, IconLock, IconUnlock, IconCopy, IconTerminal, IconSend } from './Icons'
import { serverApi, createConsoleWebSocket } from '../api'

export function Console({ serverRunning }: { serverRunning: boolean }) {
  const [lines, setLines] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [connected, setConnected] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [showInput, setShowInput] = useState(true)
  
  const consoleRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const bufferRef = useRef<string[]>([])

  const scrollToBottom = useCallback(() => {
    if (consoleRef.current && autoScroll) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [autoScroll])

  useEffect(() => {
    serverApi.getConsole().then(({ buffer }) => {
      bufferRef.current = buffer
      setLines(buffer)
      setTimeout(scrollToBottom, 0)
    })
  }, [scrollToBottom])

  useEffect(() => {
    const ws = createConsoleWebSocket((msg) => {
      if (msg.type === 'console' && typeof msg.data === 'string') {
        bufferRef.current.push(msg.data)
        if (bufferRef.current.length > 1000) bufferRef.current.shift()
        setLines([...bufferRef.current])
        setTimeout(scrollToBottom, 0)
      } else if (msg.type === 'buffer' && Array.isArray(msg.data)) {
        bufferRef.current = msg.data
        setLines(msg.data)
        setTimeout(scrollToBottom, 0)
      }
    })
    
    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    
    wsRef.current = ws
    return () => ws.close()
  }, [scrollToBottom])

  const handleSendCommand = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !serverRunning) return
    
    await serverApi.sendCommand(input)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendCommand(e as any)
    }
  }

  const clearConsole = () => {
    bufferRef.current = []
    setLines([])
  }

  const copyConsole = async () => {
    await navigator.clipboard.writeText(bufferRef.current.join('\n'))
  }

  return (
    <div className="console-container">
      <div className="console-header">
        <div className="console-title">
          <IconTerminal size={20} />
          <h2>Server Console</h2>
        </div>
        <div className="console-status">
          <span className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            {connected ? 'Live' : 'Disconnected'}
          </span>
          <label className="toggle-input">
            <input 
              type="checkbox" 
              checked={showInput} 
              onChange={(e) => setShowInput(e.target.checked)} 
            />
            <span>Input</span>
          </label>
          <label className="toggle-autoscroll" title="Auto-scroll">
            <input 
              type="checkbox" 
              checked={autoScroll} 
              onChange={(e) => setAutoScroll(e.target.checked)} 
            />
            <IconLock size={14} />
            <IconUnlock size={14} />
          </label>
        </div>
      </div>

      <div 
        className="console-output" 
        ref={consoleRef}
        onScroll={(e) => {
          const target = e.currentTarget
          const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50
          if (atBottom) setAutoScroll(true)
          else if (!atBottom && target.scrollTop > 100) setAutoScroll(false)
        }}
      >
        {lines.map((line, i) => (
          <div key={i} className="console-line" data-line={i}>
            <span className="console-timestamp">{extractTimestamp(line)}</span>
            <span className="console-message">{formatMessage(line)}</span>
          </div>
        ))}
        {lines.length === 0 && (
          <div className="console-empty">
            <IconTerminal size={48} />
            <p>No console output yet</p>
            <span>Start the server to see output</span>
          </div>
        )}
      </div>

      {showInput && (
        <form className="console-input-form" onSubmit={handleSendCommand}>
          <label className="input-wrapper">
            <span className="input-prompt">></span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={serverRunning ? 'Enter command...' : 'Server is not running'}
              disabled={!serverRunning}
              autoComplete="off"
              spellCheck={false}
            />
          </label>
          <button 
            type="submit" 
            className="btn-send" 
            disabled={!input.trim() || !serverRunning}
            title="Send command"
          >
            <IconSend size={16} />
          </button>
        </form>
      )}

      <div className="console-toolbar">
        <button className="toolbar-btn" onClick={clearConsole} title="Clear console">
          <IconClear size={16} />
        </button>
        <button className="toolbar-btn" onClick={copyConsole} title="Copy all">
          <IconCopy size={16} />
        </button>
        <div className="toolbar-spacer"></div>
        <span className="line-count">{lines.length} lines</span>
      </div>

      <style jsx>{`
        .console-container {
          display: flex;
          flex-direction: column;
          height: 100%;
          background: #0d1117;
        }
        .console-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }
        .console-title {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .console-title h2 {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary);
        }
        .console-status {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .connection-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 500;
        }
        .connection-status.connected {
          color: var(--accent-green);
        }
        .connection-status.disconnected {
          color: var(--accent-red);
        }
        .status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
        .connection-status.connected .status-dot {
          box-shadow: 0 0 6px var(--accent-green);
        }
        .toggle-input, .toggle-autoscroll {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary);
          cursor: pointer;
        }
        .toggle-input input, .toggle-autoscroll input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }
        .toggle-autoscroll {
          position: relative;
        }
        .toggle-autoscroll input:checked + .lock-icon {
          display: none;
        }
        .toggle-autoscroll input:not(:checked) + .lock-icon + .unlock-icon {
          display: none;
        }
        .lock-icon, .unlock-icon {
          display: flex;
          color: var(--text-secondary);
        }
        .toggle-autoscroll input:checked ~ .unlock-icon {
          display: flex;
          color: var(--accent-green);
        }
        .console-output {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 12px;
          line-height: 1.6;
        }
        .console-line {
          display: flex;
          gap: 10px;
          padding: 2px 0;
          border-radius: 2px;
          transition: background var(--transition);
        }
        .console-line:hover {
          background: rgba(255,255,255,0.02);
        }
        .console-timestamp {
          color: var(--text-muted);
          font-size: 11px;
          white-space: nowrap;
          flex-shrink: 0;
          user-select: none;
        }
        .console-message {
          color: var(--text-primary);
          word-break: break-word;
          white-space: pre-wrap;
        }
        .console-message.error { color: var(--accent-red); }
        .console-message.warn { color: var(--accent-yellow); }
        .console-message.info { color: var(--accent-primary); }
        .console-message.success { color: var(--accent-green); }
        .console-message.command { color: var(--accent-purple); }
        .console-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          min-height: 200px;
          color: var(--text-muted);
          text-align: center;
          gap: 12px;
        }
        .console-empty p { font-size: 14px; color: var(--text-secondary); }
        .console-empty span { font-size: 12px; }
        .console-input-form {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-top: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }
        .input-wrapper {
          flex: 1;
          position: relative;
          display: flex;
          align-items: center;
        }
        .input-prompt {
          color: var(--accent-green);
          font-weight: 600;
          margin-right: 10px;
          user-select: none;
        }
        .input-wrapper input {
          flex: 1;
          background: var(--bg-primary);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          padding: 10px 12px;
          color: var(--text-primary);
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
        }
        .input-wrapper input:focus {
          border-color: var(--accent-primary);
          box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.15);
        }
        .input-wrapper input:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .btn-send {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          background: var(--accent-primary);
          color: #0d1117;
          transition: all var(--transition);
        }
        .btn-send:hover:not(:disabled) {
          background: var(--accent-hover);
        }
        .btn-send:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .console-toolbar {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          border-top: 1px solid var(--border-color);
          background: var(--bg-secondary);
        }
        .toolbar-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          color: var(--text-secondary);
          transition: all var(--transition);
        }
        .toolbar-btn:hover {
          background: var(--bg-hover);
          color: var(--text-primary);
        }
        .toolbar-spacer { flex: 1; }
        .line-count {
          font-size: 11px;
          color: var(--text-muted);
          font-family: 'JetBrains Mono', monospace;
        }
      `}</style>
    </div>
  )
}

function extractTimestamp(line: string): string {
  const match = line.match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]/)
  if (match) {
    const date = new Date(match[1])
    return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
  return ''
}

function formatMessage(line: string): string {
  const msg = line.replace(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]\s*/, '')
  
  if (msg.startsWith('> ')) return `<span class="command">${msg}</span>`
  if (/ERROR|Error|error|Exception|FAIL|Failed|Caused by/.test(msg)) return `<span class="error">${msg}</span>`
  if (/WARN|Warn|warn/.test(msg)) return `<span class="warn">${msg}</span>`
  if (/INFO|Info|info|Starting|Started|Loaded|Done/.test(msg)) return `<span class="info">${msg}</span>`
  if (/SUCCESS|Success|success|Done|Complete/.test(msg)) return `<span class="success">${msg}</span>`
  
  return msg
}