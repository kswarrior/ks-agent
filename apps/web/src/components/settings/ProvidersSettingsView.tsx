import { useState } from 'react';
import { api } from '../../api';
import { ProviderSettings } from '../../types';

interface Props {
  providers: ProviderSettings[];
  onProvidersChange: () => Promise<void>;
}

const PROVIDER_TYPES = [
  'openai-compatible',
  'openai',
  'nvidia',
  'anthropic',
  'google',
  'custom',
];

const EMPTY: Partial<ProviderSettings> = {
  name: '',
  type: 'openai-compatible',
  base_url: '',
  api_key: '',
  model_id: '',
  model_name: '',
  chat_endpoint: '',
  streaming: true,
  auth_header: 'Authorization',
  custom_headers: '',
  temperature: 0.2,
  max_tokens: 4096,
  context_limit: 32000,
  timeout: 120,
  enabled: true,
};

export function ProvidersSettingsView({ providers, onProvidersChange }: Props) {
  const [editing, setEditing] = useState<Partial<ProviderSettings> | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const save = async () => {
    if (!editing) return;
    if (!editing.name || !editing.base_url || !editing.model_id) {
      alert('Name, base URL, and model ID are required.');
      return;
    }
    if (editing.id) {
      await api.updateProvider(editing.id, editing);
    } else {
      await api.saveProvider(editing);
    }
    await onProvidersChange();
    setEditing(null);
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this provider?')) return;
    await api.deleteProvider(id);
    await onProvidersChange();
  };

  const test = async (p: ProviderSettings) => {
    setTestResult(null);
    const r = await api.testProvider(p.id);
    setTestResult(r);
  };

  return (
    <div className="section">
      <h2>Providers</h2>
      <button onClick={() => setEditing({ ...EMPTY })}>+ Add Provider</button>
      <div style={{ marginTop: 12 }}>
        {providers.length === 0 && <div className="empty">No providers configured.</div>}
        {providers.map((p) => (
          <div
            key={p.id}
            style={{
              border: '1px solid var(--border)',
              padding: 10,
              borderRadius: 'var(--radius)',
              marginBottom: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{p.name}</strong>{' '}
                <span className="muted small">{p.type}</span>{' '}
                <span className="muted small mono">{p.model_id}</span>{' '}
                {p.builtin && <span className="badge">builtin</span>}{' '}
                {!p.enabled && <span className="badge danger">disabled</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="ghost" onClick={() => test(p)}>
                  Test
                </button>
                <button className="ghost" onClick={() => setEditing({ ...p })}>
                  Edit
                </button>
                {!p.builtin && (
                  <button className="danger" onClick={() => remove(p.id)}>
                    Delete
                  </button>
                )}
              </div>
            </div>
            <div className="muted small mono" style={{ marginTop: 4 }}>
              {p.base_url}
            </div>
          </div>
        ))}
      </div>
      {testResult && (
        <div
          style={{
            padding: 8,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            marginTop: 10,
          }}
        >
          {testResult.ok ? (
            <span className="badge ok">Connection OK</span>
          ) : (
            <span className="badge danger">Failed: {testResult.error ?? 'Unknown error'}</span>
          )}
        </div>
      )}
      {editing && (
        <div className="modal-backdrop" onClick={() => setEditing(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editing.id ? 'Edit provider' : 'Add provider'}</h3>
            <div className="row">
              <span className="label">Name</span>
              <input
                value={editing.name ?? ''}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div className="row">
              <span className="label">Type</span>
              <select
                value={editing.type ?? 'openai-compatible'}
                onChange={(e) => setEditing({ ...editing, type: e.target.value as any })}
              >
                {PROVIDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <span className="label">Base URL</span>
              <input
                value={editing.base_url ?? ''}
                onChange={(e) => setEditing({ ...editing, base_url: e.target.value })}
                placeholder="https://integrate.api.nvidia.com/v1"
              />
            </div>
            <div className="row">
              <span className="label">API Key</span>
              <input
                type="password"
                value={editing.api_key ?? ''}
                onChange={(e) => setEditing({ ...editing, api_key: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <div className="row">
              <span className="label">Model ID</span>
              <input
                value={editing.model_id ?? ''}
                onChange={(e) =>
                  setEditing({ ...editing, model_id: e.target.value, model_name: editing.model_name || e.target.value })
                }
              />
            </div>
            <div className="row">
              <span className="label">Model Name</span>
              <input
                value={editing.model_name ?? ''}
                onChange={(e) => setEditing({ ...editing, model_name: e.target.value })}
              />
            </div>
            <div className="row">
              <span className="label">Chat endpoint (optional)</span>
              <input
                value={editing.chat_endpoint ?? ''}
                onChange={(e) => setEditing({ ...editing, chat_endpoint: e.target.value })}
              />
            </div>
            <div className="row">
              <span className="label">Auth header</span>
              <input
                value={editing.auth_header ?? 'Authorization'}
                onChange={(e) => setEditing({ ...editing, auth_header: e.target.value })}
              />
            </div>
            <div className="row">
              <span className="label">Custom headers (JSON)</span>
              <input
                value={editing.custom_headers ?? ''}
                onChange={(e) => setEditing({ ...editing, custom_headers: e.target.value })}
              />
            </div>
            <div className="row">
              <span className="label">Streaming</span>
              <select
                value={editing.streaming ? 'yes' : 'no'}
                onChange={(e) => setEditing({ ...editing, streaming: e.target.value === 'yes' })}
              >
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </div>
            <div className="row">
              <span className="label">Temperature</span>
              <input
                type="number"
                step="0.1"
                min={0}
                max={2}
                value={editing.temperature ?? 0.2}
                onChange={(e) => setEditing({ ...editing, temperature: Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <span className="label">Max tokens</span>
              <input
                type="number"
                value={editing.max_tokens ?? 4096}
                onChange={(e) => setEditing({ ...editing, max_tokens: Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <span className="label">Context limit</span>
              <input
                type="number"
                value={editing.context_limit ?? 32000}
                onChange={(e) => setEditing({ ...editing, context_limit: Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <span className="label">Timeout (s)</span>
              <input
                type="number"
                value={editing.timeout ?? 120}
                onChange={(e) => setEditing({ ...editing, timeout: Number(e.target.value) })}
              />
            </div>
            <div className="row">
              <span className="label">Enabled</span>
              <select
                value={editing.enabled ? 'yes' : 'no'}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.value === 'yes' })}
              >
                <option value="yes">yes</option>
                <option value="no">no</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <button
                onClick={async () => {
                  setTestResult(null);
                  const r = await api.testProviderDraft(editing);
                  setTestResult(r);
                }}
              >
                Test
              </button>
              <button onClick={save}>Save</button>
              <button className="ghost" onClick={() => setEditing(null)}>
                Cancel
              </button>
            </div>
            {testResult && (
              <div style={{ marginTop: 8 }}>
                {testResult.ok ? (
                  <span className="badge ok">Connection OK</span>
                ) : (
                  <span className="badge danger">Failed: {testResult.error ?? 'Unknown error'}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
