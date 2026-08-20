import { useState, useEffect, useRef, useCallback } from 'react';
import { ChatInput } from './ChatInput';
import { MessageItem } from './MessageItem';
import { useAppState } from '../hooks/useAppState';
import { WSEvent } from '../types/api';
import { api } from '../utils/api';

interface ChatPanelProps {
  appState: ReturnType<typeof useAppState>;
  runId: string | null;
  onSend: (message: string) => Promise<void>;
  events?: WSEvent[];
}

export function ChatPanel({ appState, runId, onSend, events }: ChatPanelProps) {
  const [liveEvents, setLiveEvents] = useState<WSEvent[]>([]);
  const [pendingApproval, setPendingApproval] = useState<{
    requestId: string;
    toolName: string;
    args: Record<string, unknown>;
    reason?: string;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef<string | null>(null);

  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);

  // Watch for approval requests for the current run
  useEffect(() => {
    if (!events || events.length === 0 || !runIdRef.current) return;
    const latest = events[events.length - 1];
    if (latest.type === 'approval_request' && latest.runId === runIdRef.current) {
      const data = latest.data || {};
      if (data.requestId) {
        setPendingApproval({
          requestId: data.requestId,
          toolName: data.toolName,
          args: data.args || {},
          reason: data.reason
        });
      }
    }
    if (latest.type === 'run_complete' || latest.type === 'run_error') {
      if (appState.selectedChatId) {
        appState.loadMessages(appState.selectedChatId);
      }
    }
  }, [events]);

  // Auto-refresh messages when new message events arrive
  useEffect(() => {
    if (!events || events.length === 0 || !appState.selectedChatId) return;
    const latest = events[events.length - 1];
    if (latest.type === 'message' && latest.runId === runIdRef.current) {
      const t = setTimeout(() => appState.loadMessages(appState.selectedChatId!), 300);
      return () => clearTimeout(t);
    }
  }, [events]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [appState.messages.length, liveEvents.length]);

  // Poll run state while running
  useEffect(() => {
    if (!runId) return;
    const timer = setInterval(async () => {
      try {
        const state = await api.getRunState(runId);
        if (!state.running) {
          // Run finished, reload messages
          if (appState.selectedChatId) {
            appState.loadMessages(appState.selectedChatId);
          }
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [runId]);

  const handleApprove = async () => {
    if (pendingApproval && runIdRef.current) {
      await api.approveRun(runIdRef.current, pendingApproval.requestId);
      setPendingApproval(null);
    }
  };

  const handleDeny = async () => {
    if (pendingApproval && runIdRef.current) {
      await api.denyRun(runIdRef.current, pendingApproval.requestId);
      setPendingApproval(null);
    }
  };

  // Check events for approval requests and new messages
  useEffect(() => {
    return undefined;
  }, []);

  const projectName = appState.projects.find(p => p.id === appState.selectedProjectId)?.name || '';

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div>
          <div className="chat-title">
            {appState.chats.find(c => c.id === appState.selectedChatId)?.title || 'Chat'}
          </div>
          <div className="chat-meta">Project: {projectName}</div>
        </div>
        {appState.loading && <span className="status-chip connected">● running</span>}
      </div>

      <div className="message-list">
        {appState.messages.length === 0 && (
          <div className="empty-state">
            Send a message to start the agent workflow:
            <br />
            <br />
            e.g. "Add authentication to this application"
          </div>
        )}

        {appState.messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} />
        ))}

        {pendingApproval && (
          <div className="message">
            <div className="tool-call" style={{ borderColor: 'var(--yellow)' }}>
              <div className="tool-call-header">
                <span className="tool-name">Approval required</span>
                <span className="tool-status running">waiting</span>
              </div>
              <div className="tool-call-body">
                The agent wants to run: {pendingApproval.toolName}
                {pendingApproval.reason ? `\nReason: ${pendingApproval.reason}` : ''}
                {"\n\n"}{JSON.stringify(pendingApproval.args, null, 2)}
              </div>
              <div style={{ display: 'flex', gap: 8, padding: 10 }}>
                <button className="btn btn-small" style={{ background: '#fff' }} onClick={handleApprove}>Allow</button>
                <button className="btn btn-small btn-secondary" onClick={handleDeny}>Deny</button>
              </div>
            </div>
          </div>
        )}

        {appState.loading && (
          <div className="message message-assistant">
            <div className="message-role-label">KS Agent</div>
            <div className="message-bubble">
              <span className="status-chip connected">● Working...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput onSend={onSend} disabled={appState.loading} />

      {appState.error && (
        <div style={{ padding: '0 18px 10px' }}>
          <span style={{ color: 'var(--red)', fontSize: 12 }}>Error: {appState.error}</span>
          <button className="btn btn-small btn-secondary" style={{ marginLeft: 8 }} onClick={() => appState.setError(null)}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}