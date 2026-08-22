import { useEffect, useState } from 'react';
import { api } from '../../api';

export function DatabaseSettingsView() {
  const [info, setInfo] = useState<{ tables: string[]; counts: Record<string, number> } | null>(null);

  const refresh = async () => {
    setInfo(await api.dbInfo());
  };

  useEffect(() => {
    refresh();
  }, []);

  const reset = async () => {
    if (!confirm('Delete all projects/chats/runs? Settings and providers will be kept.')) return;
    await api.dbReset('projects');
    await refresh();
  };

  return (
    <div className="section">
      <h2>Database</h2>
      <p className="muted small">
        SQLite persistence. Tables and row counts:
      </p>
      {info && (
        <div>
          {info.tables.map((t) => (
            <div key={t} className="row">
              <span className="label">{t}</span>
              <span className="mono small">{info.counts[t] ?? 0} rows</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
        <button className="ghost" onClick={refresh}>
          Refresh
        </button>
        <button className="danger" onClick={reset}>
          Reset projects/chats/runs
        </button>
      </div>
    </div>
  );
}
