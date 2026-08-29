import React, { useState, useRef, useEffect } from 'react';

interface ConsoleMessage {
  type: 'console' | 'status';
  data: string;
}

export function Console() {
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3000/api/console');
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as ConsoleMessage;
        if (msg.type === 'console') {
          setMessages(prev => [...prev, msg.data]);
          scrollToBottom();
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    return () => {
      ws.close();
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = () => {
    if (input.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  return (
    <div className="console-container">
      <div className="console-header">
        <h2>Server Console</h2>
        <div className={`console-status ${connected ? 'online' : 'offline'}`}>
          {connected ? 'Connected' : 'Disconnected'}
        </div>
      </div>

      <div className="console-output">
        {messages.length === 0 ? (
          <div className="console-placeholder">
            Type commands in the input below to interact with the server.
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i} className="console-line">
              <span className="console-prompt">&gt;</span>
              <span className="console-text">{msg}</span>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="console-input-area">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type command..."
          className="console-input"
        />
        <button onClick={handleSend} className="console-send">
          Send
        </button>
      </div>
    </div>
  );
}