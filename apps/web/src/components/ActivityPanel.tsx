import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { AgentRun, AgentStep, ApprovalRequest, Chat, Project, ToolCall } from '../types';

interface Props {
  project: Project | null;
  chat: Chat | null;
  activeRunId: string | null;
  events: any[];
  approvals: ApprovalRequest[];
  onApprove: (id: string, approved: boolean) => Promise<void>;
}

type Tab = 'timeline' | 'tools' | 'tests' | 'review' | 'plan' | 'shell';

export function ActivityPanel(p: Props) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [tools, setTools] = useState<ToolCall[]>([]);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [tab, setTab] = useState<Tab>('timeline');

  // refresh when run changes
  useEffect(() => {
    if (!p.activeRunId) {
      setSteps([]);
      setTools([]);
      setRun(null);
      return;
    }
    api.getRun(p.activeRunId).then(setRun).catch(console.error);
    api.listSteps(p.activeRunId).then(setSteps).catch(console.error);
    api.listToolCalls(p.activeRunId).then(setTools).catch(console.error);
  }, [p.activeRunId]);

  // refresh on events
  useEffect(() => {
    if (!p.activeRunId) return;
    const last = p.events[p.events.length - 1];
    if (!last || (last.runId && last.runId !== p.activeRunId)) return;
    if (last.type === 'agent_step.started' || last.type === 'agent_step.completed' || last.type === 'agent_step.details') {
      api.listSteps(p.activeRunId).then(setSteps).catch(console.error);
    }
    if (last.type === 'tool_call.started' || last.type === 'tool_call.completed') {
      api.listToolCalls(p.activeRunId).then(setTools).catch(console.error);
    }
    if (last.type === 'agent_run.state' || last.type === 'agent_run.completed' || last.type === 'agent_run.failed') {
      api.getRun(p.activeRunId).then(setRun).catch(console.error);
    }
  }, [p.events, p.activeRunId]);

  const shellOutput = useMemo(() => {
    return tools
      .filter((t) => t.tool_name === 'shell')
      .map((t) => {
        try {
          const args = JSON.parse(t.arguments);
          return `$ ${args.command}\n${t.result ?? ''}`;
        } catch {
          return t.result ?? '';
        }
      })
      .join('\n\n');
  }, [tools]);

  const diffs = useMemo(() => {
    return tools
      .filter((t) => t.tool_name === 'write_file' || t.tool_name === 'edit_file')
      .map((t) => {
        try {
          const args = JSON.parse(t.arguments);
          const path = args.path ?? '?';
          const r = t.result ?? '';
          const diff = r.includes('\n\n') ? r.split('\n\n').slice(1).join('\n\n') : '';
          return { path, diff };
        } catch {
          return { path: '?', diff: '' };
        }
      });
  }, [tools]);

  return (
    <aside className="panel activity-panel">
      <div className="panel-header">
        <span>Activity</span>
        {run && <span className="badge">{run.state}</span>}
      </div>
      <div className="tabs">
        <button className={tab === 'timeline' ? 'active' : ''} onClick={() => setTab('timeline')}>
          Timeline
        </button>
        <button className={tab === 'tools' ? 'active' : ''} onClick={() => setTab('tools')}>
          Tools
        </button>
        <button className={tab === 'shell' ? 'active' : ''} onClick={() => setTab('shell')}>
          Shell
        </button>
        <button className={tab === 'tests' ? 'active' : ''} onClick={() => setTab('tests')}>
          Tests
        </button>
        <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>
          Review
        </button>
        <button className={tab === 'plan' ? 'active' : ''} onClick={() => setTab('plan')}>
          Plan
        </button>
      </div>
      <div className="panel-body">
        {p.approvals.length > 0 && (
          <div className="activity-section">
            <h3>Approvals</h3>
            {p.approvals.map((a) => (
              <div key={a.id} className="tool-card">
                <div className="head">
                  <span className="name">{a.tool_name}</span>
                  <span className="status">pending</span>
                </div>
                <div className="body">
                  <pre className="mono">{JSON.stringify(a.arguments, null, 2)}</pre>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={() => p.onApprove(a.id, true)}>Approve</button>
                    <button className="danger" onClick={() => p.onApprove(a.id, false)}>
                      Deny
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === 'timeline' && (
          <div className="activity-section">
            <h3>Agent timeline</h3>
            <div className="timeline">
              {steps.length === 0 && <div className="empty">No activity yet.</div>}
              {steps.map((s) => (
                <div key={s.id} className={`item ${s.status}`}>
                  <div className="title">
                    <span className="badge">{s.role}</span> {s.title}
                  </div>
                  {s.details && <div className="details">{s.details}</div>}
                  {s.status === 'running' && <div className="details"><span className="spinner" />running</div>}
                </div>
              ))}
            </div>
            {diffs.length > 0 && (
              <>
                <h3 style={{ marginTop: 14 }}>Diffs</h3>
                {diffs.map((d, i) => (
                  <div key={i} style={{ marginBottom: 8 }}>
                    <div className="muted small mono">{d.path}</div>
                    <pre className="diff">{renderDiff(d.diff)}</pre>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
        {tab === 'tools' && (
          <div className="activity-section">
            <h3>Tool calls</h3>
            {tools.length === 0 && <div className="empty">No tools invoked yet.</div>}
            {tools.map((t) => <ToolCard key={t.id} t={t} />)}
          </div>
        )}
        {tab === 'shell' && (
          <div className="activity-section">
            <h3>Shell output</h3>
            <pre className="shell-output">{shellOutput || '(none)'}</pre>
          </div>
        )}
        {tab === 'tests' && (
          <div className="activity-section">
            <h3>Tests</h3>
            <pre className="shell-output">{extractSection(tools, 'tester') || '(no tester output yet)'}</pre>
          </div>
        )}
        {tab === 'review' && (
          <div className="activity-section">
            <h3>Review</h3>
            <pre className="shell-output">{run?.review ?? '(no review yet)'}</pre>
          </div>
        )}
        {tab === 'plan' && (
          <div className="activity-section">
            <h3>Plan</h3>
            <pre className="shell-output">{run?.plan ?? '(no plan yet)'}</pre>
          </div>
        )}
      </div>
    </aside>
  );
}

function ToolCard({ t }: { t: ToolCall }) {
  const [open, setOpen] = useState(false);
  let args: any = {};
  try { args = JSON.parse(t.arguments); } catch {}
  return (
    <div className="tool-card">
      <div className="head" onClick={() => setOpen((v) => !v)}>
        <span>
          <span className="name">{t.tool_name}</span>{' '}
          <span className="muted small mono">
            {args?.path ? ` ${args.path}` : args?.command ? ` ${String(args.command).slice(0, 60)}` : ''}
          </span>
        </span>
        <span className="status">
          {t.status}
          {t.duration_ms ? ` · ${t.duration_ms}ms` : ''}
        </span>
      </div>
      {open && (
        <div className="body">
          <div className="muted small">Arguments</div>
          <pre className="mono">{JSON.stringify(args, null, 2)}</pre>
          {t.error && (
            <>
              <div className="muted small" style={{ color: 'var(--danger)' }}>Error</div>
              <pre className="mono">{t.error}</pre>
            </>
          )}
          {t.result && (
            <>
              <div className="muted small">Result</div>
              <pre className="mono">{t.result}</pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function extractSection(tools: ToolCall[], role: string): string | null {
  const matches = tools.filter((t) => {
    try {
      // We can't know step role directly, but tester calls often use shell.
      return t.tool_name === 'shell';
    } catch {
      return false;
    }
  });
  if (matches.length === 0) return null;
  return matches.map((t) => t.result).join('\n\n');
}

function renderDiff(raw: string): React.ReactNode {
  const lines = raw.split(/\r?\n/);
  return lines.map((line, i) => {
    let cls = 'context';
    if (line.startsWith('+')) cls = 'add';
    else if (line.startsWith('-')) cls = 'remove';
    return (
      <div key={i} className={`line ${cls}`}>
        {line}
      </div>
    );
  });
}
