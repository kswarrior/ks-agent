import { AppSettings } from '../../types';

interface Props {
  draft: AppSettings;
  update: (s: AppSettings) => Promise<void>;
}

const TOOLS = [
  'enable_write_file',
  'enable_edit_file',
  'enable_shell',
  'enable_read_file',
  'enable_list_files',
  'enable_search_code',
] as const;

export function ToolsSettingsView({ draft, update }: Props) {
  const t = draft.tools;
  const set = (patch: Partial<AppSettings['tools']>) =>
    update({ ...draft, tools: { ...t, ...patch } });
  return (
    <div className="section">
      <h2>Tools</h2>
      <p className="muted small">Disable tools to prevent the agent from using them.</p>
      {TOOLS.map((name) => (
        <div className="row" key={name}>
          <span className="label">{name.replace('enable_', '')}</span>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={t[name]}
              onChange={(e) => set({ [name]: e.target.checked } as any)}
            />
            {t[name] ? 'enabled' : 'disabled'}
          </label>
        </div>
      ))}
    </div>
  );
}
