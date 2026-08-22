import { AppSettings } from '../../types';

interface Props {
  draft: AppSettings;
  update: (s: AppSettings) => Promise<void>;
}

export function GeneralSettingsView({ draft, update }: Props) {
  const g = draft.general;
  const set = (patch: Partial<AppSettings['general']>) =>
    update({ ...draft, general: { ...g, ...patch } });
  return (
    <div className="section">
      <h2>General</h2>
      <div className="row">
        <span className="label">Workspace root</span>
        <input value={g.workspace_root} onChange={(e) => set({ workspace_root: e.target.value })} />
      </div>
      <div className="row">
        <span className="label">Default shell</span>
        <input value={g.default_shell} onChange={(e) => set({ default_shell: e.target.value })} />
      </div>
      <div className="row">
        <span className="label">Shell timeout (ms)</span>
        <input
          type="number"
          value={g.shell_timeout}
          onChange={(e) => set({ shell_timeout: Number(e.target.value) })}
        />
      </div>
      <div className="row">
        <span className="label">Log level</span>
        <select value={g.log_level} onChange={(e) => set({ log_level: e.target.value })}>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </div>
    </div>
  );
}
