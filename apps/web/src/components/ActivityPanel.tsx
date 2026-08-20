import { WSEvent } from '../types/api';

interface ActivityPanelProps {
  events: WSEvent[];
}

const STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  planning: 'Planning',
  exploring: 'Exploring codebase',
  implementing: 'Implementing',
  testing: 'Running tests',
  reviewing: 'Reviewing',
  fixing: 'Fixing',
  retesting: 'Re-testing',
  completed: 'Completed',
  failed: 'Failed',
  waiting_for_user: 'Waiting for user'
};

const ROLE_LABELS: Record<string, string> = {
  planner: 'Nemotron 3 Ultra',
  explorer: 'Nemotron 3.5 Lightning',
  coder: 'Step 3.7 Flash',
  tester: 'Nemotron 3.5 Lightning',
  reviewer: 'Nemotron 3 Ultra',
  fixer: 'Step 3.7 Flash',
  final_tester: 'Nemotron 3.5 Lightning'
};

export function ActivityPanel({ events }: ActivityPanelProps) {
  const reversed = [...events].reverse();

  return (
    <div className="activity-panel">
      <div className="activity-header">Agent Activity</div>
      <div className="activity-list">
        {reversed.length === 0 && (
          <div className="empty-state" style={{ padding: 20, fontSize: 12 }}>
            Live agent activity will appear here as runs execute.
          </div>
        )}

        {reversed.map((event, idx) => (
          <ActivityItem key={idx} event={event} />
        ))}
      </div>
    </div>
  );
}

function ActivityItem({ event }: { event: WSEvent }) {
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const data = event.data || {};

  let className = 'activity-item';
  let content: React.ReactNode;

  switch (event.type) {
    case 'state_change':
      className += ' activity-item state-' + String(data?.state || '');
      content = (
        <>
          <span className="step-label">{STATE_LABELS[String(data?.state)] || String(data?.state)}</span>
          {data?.state === 'completed' && <span className="step-role">✓ Done</span>}
          {data?.state === 'failed' && <span className="step-role">✗ Failed</span>}
        </>
      );
      break;

    case 'step_start':
      className += '';
      content = (
        <>
          <span className="step-label">{STATE_LABELS[String(data?.role)] || String(data?.role)}</span>
          <span className="step-role">{ROLE_LABELS[String(data?.role)] || String(data?.role)}</span>
        </>
      );
      break;

    case 'step_complete':
      className += '';
      content = (
        <>
          <span className="step-label">✓ {STATE_LABELS[String(data?.role)] || String(data?.role)} complete</span>
          <span className="step-role">{ROLE_LABELS[String(data?.role)] || String(data?.role)}</span>
        </>
      );
      break;

    case 'tool_call':
      className += ' tool';
      content = (
        <>
          <span>{String(data?.toolName)}</span>
          <span className="step-role">{summarizeArgs(data?.args)}</span>
        </>
      );
      break;

    case 'tool_result':
      className += ' tool-result';
      content = (
        <span>
          {data?.result?.success ? '✓' : '✗'} {String(data?.toolName)} ({Math.round(Number(data?.result?.duration) || 0)}ms)
        </span>
      );
      break;

    case 'message':
      content = <span className="step-label">{truncate(String(data?.content || ''), 80)}</span>;
      break;

    case 'approval_request':
      className += '';
      content = (
        <>
          <span className="step-label" style={{ color: 'var(--yellow)' }}>⚠ Approval requested</span>
          <span className="step-role">{String(data?.toolName)}</span>
        </>
      );
      break;

    case 'error':
      className += ' error';
      content = <span>{String(data?.message || 'Error')}</span>;
      break;

    case 'run_complete':
      className += ' state-completed';
      content = (
        <>
          <span className="step-label">{String(data?.status || 'Run complete')}</span>
          {data?.changedFiles?.length > 0 && (
            <span className="step-role">{data.changedFiles.length} files changed</span>
          )}
        </>
      );
      break;

    default:
      content = <span className="step-label">{event.type}</span>;
  }

  return (
    <div className={className}>
      <span className="activity-timestamp">{time}</span>
      {content}
    </div>
  );
}

function summarizeArgs(args: any): string {
  if (!args) return '';
  const command = args.command;
  if (command) return command.length > 60 ? command.slice(0, 60) + '...' : command;
  const path = args.path;
  if (path) return String(path);
  return '...';
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len) + '...';
}