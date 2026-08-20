import { useState } from 'react';

interface ChatInputProps {
  onSend: (message: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSend = async () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    setValue('');
    await onSend(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Shift+Enter = newline (default behavior)
  };

  return (
    <div className="chat-input-area">
      <div className="input-context">
        <span>Enter to send · Shift+Enter for newline</span>
      </div>
      <div className="chat-input-wrap">
        <textarea
          className="chat-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe the change you want... e.g. Add authentication to this application"
          rows={1}
        />
        <button className="send-btn" onClick={handleSend} disabled={disabled || !value.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}