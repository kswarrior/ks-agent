import { AppSettings } from '../../types';

interface Props {
  draft: AppSettings;
  update: (s: AppSettings) => Promise<void>;
}

export function APISettingsView({ draft, update }: Props) {
  const a = draft.api;
  const set = (patch: Partial<AppSettings['api']>) =>
    update({ ...draft, api: { ...a, ...patch } });
  return (
    <div className="section">
      <h2>API</h2>
      <div className="row">
        <span className="label">Host</span>
        <input value={a.host} onChange={(e) => set({ host: e.target.value })} />
      </div>
      <div className="row">
        <span className="label">Port</span>
        <input
          type="number"
          value={a.port}
          onChange={(e) => set({ port: Number(e.target.value) })}
        />
      </div>
      <div className="row">
        <span className="label">CORS origins</span>
        <input value={a.cors_origins} onChange={(e) => set({ cors_origins: e.target.value })} />
      </div>
      <p className="muted small">
        Restart the server after changing host or port.
      </p>
    </div>
  );
}
