import { useState } from 'react';
import { Message } from '../types/api';

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === 'user';
  const agentRole = message.agent_role;

  return (
    <div className={`message ${isUser ? 'message-user' : 'message-assistant'}`}>
      {!isUser && (
        <div className="message-role-label">
          {agentRole ? agentRole.replace('_', ' ') : 'KS Agent'}
          {message.model && <span className="message-model"> · {message.model}</span>}
        </div>
      )}
      <div className="message-bubble">
        <RichContent content={message.content} />
      </div>
    </div>
  );
}

function RichContent({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  // Simple markdown-lite rendering
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} onClick={() => setExpanded(!expanded)} title="Click to expand/collapse">
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} style={{ margin: '10px 0 4px', fontSize: 13 }}>{line.slice(4)}</h4>);
      continue;
    }
    if (line.startsWith('## ')) {
      elements.push(<h3 key={i} style={{ margin: '12px 0 4px', fontSize: 14 }}>{line.slice(3)}</h3>);
      continue;
    }
    if (line.startsWith('# ')) {
      elements.push(<h2 key={i} style={{ margin: '12px 0 4px', fontSize: 15 }}>{line.slice(2)}</h2>);
      continue;
    }

    // List items
    if (/^\s*[-*•] /.test(line)) {
      elements.push(
        <div key={i} style={{ paddingLeft: 12 }}>
          • {renderInline(line.replace(/^\s*[-*•] /, ''))}
        </div>
      );
      continue;
    }

    // Inline code blocks
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      elements.push(
        <div key={i} className="tool-call" style={{ margin: '6px 0' }}>
          <div className="tool-call-body">{line.trim()}</div>
        </div>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: 6 }} />);
      continue;
    }

    // Treat lines starting with $ as shell command display
    if (line.startsWith('$ ')) {
      elements.push(
        <div key={i} style={{ fontFamily: 'var(--font-mono)', color: 'var(--blue)', fontSize: 12, background: 'var(--bg-panel-2)', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
          {line}
        </div>
      );
      continue;
    }

    elements.push(<p key={i}>{renderInline(line)}</p>);
  }

  // Flush remaining code block
  if (inCodeBlock && codeLines.length > 0) {
    elements.push(<pre key="code-final"><code>{codeLines.join('\n')}</code></pre>);
  }

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith('**')) {
      parts.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts;
}