import { AppSettings, ModelSettings, ProviderSettings } from '../../types';

interface Props {
  draft: AppSettings;
  providers: ProviderSettings[];
  models: ModelSettings[];
  onModelChange: (m: ModelSettings) => Promise<void>;
}

const ROLES = [
  { id: 'planner', label: 'Planner' },
  { id: 'explorer', label: 'Explorer' },
  { id: 'coder', label: 'Coder' },
  { id: 'tester', label: 'Test Agent' },
  { id: 'reviewer', label: 'Reviewer' },
  { id: 'fixer', label: 'Fixer' },
  { id: 'finalTester', label: 'Final Tester' },
];

export function ModelsSettingsView({ draft, providers, models, onModelChange }: Props) {
  return (
    <div className="section">
      <h2>Models</h2>
      <p className="muted small">Assign any configured provider/model to each agent role.</p>
      {ROLES.map((r) => {
        const m = models.find((x) => x.role === r.id);
        return (
          <div key={r.id} style={{ marginBottom: 12, border: '1px solid var(--border)', padding: 10, borderRadius: 'var(--radius)' }}>
            <div style={{ marginBottom: 6 }}>
              <strong>{r.label}</strong>
            </div>
            <div className="row">
              <span className="label">Provider</span>
              <select
                value={m?.provider_id ?? ''}
                onChange={async (e) => {
                  const provider = providers.find((p) => p.id === e.target.value);
                  if (!m || !provider) return;
                  await onModelChange({
                    ...m,
                    provider_id: provider.id,
                    model_id: provider.model_id,
                  });
                }}
              >
                <option value="">Select provider</option>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <span className="label">Model ID</span>
              <input
                value={m?.model_id ?? ''}
                onChange={(e) => {
                  if (!m) return;
                  onModelChange({ ...m, model_id: e.target.value });
                }}
              />
            </div>
            <div className="row">
              <span className="label">Temperature</span>
              <input
                type="number"
                step="0.1"
                min={0}
                max={2}
                value={m?.temperature ?? 0.2}
                onChange={(e) => {
                  if (!m) return;
                  onModelChange({ ...m, temperature: Number(e.target.value) });
                }}
              />
            </div>
            <div className="row">
              <span className="label">Max tokens</span>
              <input
                type="number"
                value={m?.max_tokens ?? 4096}
                onChange={(e) => {
                  if (!m) return;
                  onModelChange({ ...m, max_tokens: Number(e.target.value) });
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
