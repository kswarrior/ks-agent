import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { Chat, Message, Project } from '../types';

interface Props {
  project: Project | null;
  chat: Chat | null;
  activeRunId: string | null;
  events: any[];
  onRunStarted: (runId: string) => void;
  onRunFinished: () => void;
}

export function ChatPanel(p: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!p.chat) {
      setMessages([]);
      return;
    }
    api.listMessages(p.chat.id).then(setMessages).catch(console.error);
  }, [p.chat?.id]);

  // Apply streaming deltas
  useEffect(() => {
    const last = p.events[p.events.length - 1];
    if (!last) return;
    if (last.type === 'message.delta' && last.runId === p.activeRunId) {
      setStreamingMessage((cur) => (cur ?? '') + last.delta);
    }
    if (last.type === 'message.final' && last.runId === p.activeRunId) {
      setStreamingMessage(null);
      if (p.chat) api.listMessages(p.chat.id).then(setMessages).catch(console.error);
    }
    if (last.type === 'agent_run.completed' || last.type === 'agent_run.failed') {
      setBusy(false);
      setStreamingMessage(null);
      p.onRunFinished();
      if (p.chat) api.listMessages(p.chat.id).then(setMessages).catch(console.error);
    }
    if (last.type === 'agent_run.started' && last.runId === p.activeRunId) {
      setBusy(true);
      setStreamingMessage('');
    }
  }, [p.events, p.activeRunId, p.chat, p.onRunFinished]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, streamingMessage]);

  const submit = async () => {
    if (!p.chat || !input.trim() || busy) return;
    const text = input.trim();
    setInput('');
    setBusy(true);
    const tempUserMsg: Message = {
      id: 'temp',
      chat_id: p.chat.id,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUserMsg]);
    try {
      const { runId } = await api.startRun(p.chat.id, text);
      p.onRunStarted(runId);
    } catch (e: any) {
      setBusy(false);
      alert(`Failed to start run: ${e.message}`);
    }
  };

  if (!p.project || !p.chat) {
    return (
      <section className="center">
        <div className="empty">Select a project and chat, or create one to begin.</div>
      </section>
    );
  }

  return (
    <section className="center">
      <div className="panel-header">
        <span>{p.project.name} · {p.chat.title}</span>
        {busy && (
          <span className="status-pill">
            <span className="spinner" />
            Agent running
          </span>
        )}
      </div>
      <div className="messages" ref={scrollRef}>
        {messages.map((m) => (
          <div key={m.id} className={`message ${m.role}`}>
            <div className="role">{m.role}</div>
            <div>{m.content}</div>
          </div>
        ))}
        {streamingMessage !== null && (
          <div className="message assistant">
            <div className="role">assistant (streaming)</div>
            <div>{streamingMessage || <span className="spinner" />}</div>
          </div>
        )}
      </div>
      <div className="composer">
        <textarea
          placeholder={`Ask KS AGENT to modify ${p.project.name}…`}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={submit} disabled={busy || !input.trim()}>
            Send
          </button>
          {p.activeRunId && (
            <button className="ghost" onClick={() => api.cancelRun(p.activeRunId!)}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
