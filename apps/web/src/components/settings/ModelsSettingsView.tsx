import { useEffect, useRef, useState } from 'react';
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

const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_TOKENS = 4096;

export function ModelsSettingsView({ draft, providers, models, onModelChange }: Props) {
  // Local draft rows so typing is smooth; persisted debounced.
  const [localRows, setLocalRows] = useState<Record<string, ModelSettings>>({});
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    return () => {
      Object.values(timers.current).forEach(clearTimeout);
    };
  }, []);

  const rowFor = (roleId: string): ModelSettings | undefined =>
    localRows[roleId] ?? models.find((x) => x.role === roleId);

  const scheduleSave = (next: ModelSettings) => {
    setLocalRows((prev) => ({ ...prev, [next.role]: next }));
    clearTimeout(timers.current[next.role]);
    timers.current[next.role] = setTimeout(async () => {
      await onModelChange(next);
      setLocalRows((prev) => {
        if (prev[next.role]?.updated_at !== next.updated_at) return prev;
        const { [next.role]: _drop, ...rest } = prev;
        return rest;
      });
    }, 500);
  };

  const setField = (roleId: string, patch: Partial<ModelSettings>) => {
    const current = rowFor(roleId);
    if (!current) return;
    scheduleSave({ ...current, ...patch });
  };

  const assignProvider = async (roleId: string, providerId: string) => {
    const provider = providers.find((p) => p.id === providerId);
    if (!provider) return;
    const current = rowFor(roleId);
    const next: ModelSettings = {
      role: roleId as any,
      provider_id: provider.id,
      model_id: provider.model_id,
      temperature: current?.temperature ?? DEFAULT_TEMPERATURE,
      max_tokens: current?.max_tokens ?? DEFAULT_MAX_TOKENS,
      updated_at: new Date().toISOString(),
    };
    // Provider switches persist immediately (select, not keystrokes).
    await onModelChange(next);
    setLocalRows((prev) => ({ ...prev, [roleId]: next }));
  };

  return (
    <div className="section">
      <h2>Models</h2>
      <p className="muted small">Assign any configured provider/model to each agent role.</p>
      {ROLES.map((r) => {
        const m = rowFor(r.id);
        return (
          <div key={r.id} style={{ marginBottom: 12, border: '1px solid var(--border)', padding: 10, borderRadius: 'var(--radius)' }}>
            <div style={{ marginBottom: 6 }}>
              <strong>{r.label}</strong>
            </div>
            <div className="row">
              <span className="label">Provider</span>
              <select
                value={m?.provider_id ?? ''}
                onChange={(e) => assignProvider(r.id, e.target.value)}
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
                disabled={!m}
                placeholder={m ? '' : 'Select a provider first'}
                onChange={(e) => setField(r.id, { model_id: e.target.value })}
              />
            </div>
            <div className="row">
              <span className="label">Temperature</span>
              <input
                type="number"
                step="0.1"
                min={0}
                max={2}
                disabled={!m}
                value={m?.temperature ?? DEFAULT_TEMPERATURE}
                onChange={(e) => setField(r.id, { temperature: Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <span className="label">Max tokens</span>
              <input
                type="number"
                disabled={!m}
                value={m?.max_tokens ?? DEFAULT_MAX_TOKENS}
                onChange={(e) => setField(r.id, { max_tokens: Number(e.target.value) })}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
