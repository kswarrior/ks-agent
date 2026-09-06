import { useState, useRef, useEffect } from 'react';
import type { ConsoleLog } from '../types';

interface ConsoleProps {
  logs?: ConsoleLog[];
  onSendCommand?: (command: string) => void;
}

export function Console({ logs = [], onSendCommand }: ConsoleProps) {
  const [input, setInput] = useState('');
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendCommand?.(input);
      setInput('');
    }
  };

  return (
    <div className="card">
      <h2>Console</h2>
      <div className="console" ref={consoleRef}>
        {logs.length === 0 ? (
          <div className="console-line">No logs available. Start the server to see output.</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className={`console-line ${log.level.toLowerCase()}`}>
              [{log.timestamp}] [{log.level}] {log.message}
            </div>
          ))
        )}
      </div>
      <form onSubmit={handleCommand} style={{ marginTop: '16px' }}>
        <input
          type="text"
          className="input"
          placeholder="Enter command..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
      </form>
    </div>
  );
}