import { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { AgentSettings, ModelSettings, ModelDefinition } from '../types/api';

const ROLES: Array<{ key: keyof ModelSettings; label: string }> = [
  { key: 'planner', label: 'PLANNER' },
  { key: 'explorer', label: 'EXPLORER' },
  { key: 'coder', label: 'CODER' },
  { key: 'tester', label: 'TEST AGENT' },
  { key: 'reviewer', label: 'REVIEWER' },
  { key: 'fixer', label: 'FIXER' },
  { key: 'final_tester', label: 'FINAL TEST AGENT' }
];

const DEFAULT_MODELS: ModelSettings = {
  planner: '',
  explorer: '',
  coder: '',
  tester: '',
  reviewer: '',
  fixer: '',
  final_tester: ''
};

export function SettingsPage() {
  const [section, setSection] = useState('general');
  const [models, setModels] = useState<ModelDefinition[]>([]);
  const [modelSettings, setModelSettings] = useState<ModelSettings>(DEFAULT_MODELS);
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiConfigured, setApiConfigured] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [m, ms, as, apiStatus] = await Promise.all([
        api.getModels(),
        api.getModelSettings(),
        api.getAgentSettings(),
        api.getApiStatus()
      ]);
      setModels(m);
      setModelSettings({ ...DEFAULT_MODELS, ...ms });
      setAgentSettings(as);
      setApiConfigured(apiStatus.configured);
    } catch {
      // ignore
    }
  };

  const saveAgentSetting = async (key: keyof AgentSettings, value: boolean | number) => {
    if (!agentSettings) return;
    const updated = { ...agentSettings, [key]: value };
    setAgentSettings(updated);
    try {
      await api.updateAgentSettings(updated);
      setMessage('Agent settings saved');
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage(`Failed to save: ${(err as Error).message}`);
    }
  };

  const saveModelSetting = async (key: keyof ModelSettings, value: string) => {
    const updated = { ...modelSettings, [key]: value };
    setModelSettings(updated);
    try {
      await api.updateModelSettings({ [key]: value });
      setMessage('Model settings saved');
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage(`Failed to save: ${(err as Error).message}`);
    }
  };

  const saveApiKey = async () => {
    if (!apiKey.trim()) return;
    try {
      await api.setApiKey(apiKey.trim());
      setApiKey('');
      setApiConfigured(true);
      setMessage('API key configured');
      setTimeout(() => setMessage(null), 2000);
    } catch (err) {
      setMessage(`Failed: ${(err as Error).message}`);
    }
  };

  const testConnection = async () => {
    try {
      const result = await api.testApiConnection();
      setTestResult(result.ok ? '✓ ' + result.message : '✗ ' + result.message);
    } catch (err) {
      setTestResult('✗ ' + (err as Error).message);
    }
  };

  if (!agentSettings) {
    return <div className="settings-page">Loading settings...</div>;
  }

  const sections = [
    { id: 'general', label: 'General' },
    { id: 'models', label: 'Models' },
    { id: 'api', label: 'API' },
    { id: 'tools', label: 'Tools' },
    { id: 'agent', label: 'Agent' }
  ];

  return (
    <div className="settings-page">
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {sections.map(s => (
          <button
            key={s.id}
            className="btn btn-small"
            style={{
              background: section === s.id ? '#fff' : 'transparent',
              color: section === s.id ? '#000' : 'var(--text-muted)',
              border: '1px solid var(--border)'
            }}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {message && <div style={{ color: 'var(--green)', marginBottom: 12, fontSize: 13 }}>{message}</div>}

      {section === 'general' && (
        <div className="settings-section">
          <div className="settings-section-title">General</div>
          <div className="settings-grid">
            <div className="settings-row">
              <div>
                <label>Appearance</label>
                <div className="settings-hint">Dark theme (default)</div>
              </div>
              <span className="settings-select" style={{ minWidth: 240, padding: '6px 10px' }}>Dark</span>
            </div>
            <div className="settings-row">
              <div>
                <label>Language</label>
                <div className="settings-hint">Interface language</div>
              </div>
              <select className="settings-select" defaultValue="en">
                <option value="en">English</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {section === 'models' && (
        <div className="settings-section">
          <div className="settings-section-title">Model Settings</div>
          <div className="settings-hint" style={{ marginBottom: 16 }}>
            Select a model independently for every agent role.
          </div>
          <div className="settings-grid">
            {ROLES.map(role => (
              <div className="settings-row" key={role.key}>
                <label>{role.label}</label>
                <select
                  className="settings-select"
                  value={modelSettings[role.key]}
                  onChange={(e) => saveModelSetting(role.key, e.target.value)}
                >
                  {models.length === 0 && <option value="">No models available</option>}
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {section === 'api' && (
        <div className="settings-section">
          <div className="settings-section-title">API Settings</div>
          <div className="settings-grid">
            <div className="settings-row">
              <div>
                <label>NVIDIA API Key</label>
                <div className="settings-hint">
                  {apiConfigured ? 'Status: configured' : 'Status: not configured'}<br />
                  Stored securely on the backend. Never exposed to the browser.
                </div>
              </div>
              <input
                className="settings-input"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="nvapi-..."
                style={{ minWidth: 260 }}
              />
            </div>
            <div className="settings-row">
              <label>Environment</label>
              <span className="settings-select" style={{ minWidth: 240, padding: '6px 10px' }}>NVIDIA_API_KEY env var</span>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-small" onClick={saveApiKey}>Save Key</button>
              <button className="btn btn-small btn-secondary" onClick={testConnection}>Test Connection</button>
            </div>
            {testResult && (
              <div style={{ color: testResult.startsWith('✓') ? 'var(--green)' : 'var(--red)', fontSize: 13 }}>
                {testResult}
              </div>
            )}
          </div>
        </div>
      )}

      {section === 'tools' && (
        <div className="settings-section">
          <div className="settings-section-title">Tool Permissions</div>
          <div className="settings-grid">
            <div className="settings-row">
              <div>
                <label>Permission Mode</label>
                <div className="settings-hint">
                  Ask every time: prompt for all tool calls.
                  <br />
                  Dangerous only: prompt only for destructive operations.
                  <br />
                  Autonomous: run everything without prompts.
                </div>
              </div>
              <select
                className="settings-select"
                value={agentSettings.autonomousMode ? 'autonomous' : 'dangerous'}
                onChange={(e) => saveAgentSetting('autonomousMode', e.target.value === 'autonomous')}
              >
                <option value="dangerous">Ask for dangerous commands only</option>
                <option value="autonomous">Autonomous</option>
              </select>
            </div>
            <div className="settings-row">
              <div>
                <label>Require approval for shell</label>
                <div className="settings-hint">Prompt before executing shell commands</div>
              </div>
              <div
                className={`toggle ${agentSettings.requireApprovalForShell ? 'on' : ''}`}
                onClick={() => saveAgentSetting('requireApprovalForShell', !agentSettings.requireApprovalForShell)}
              />
            </div>
          </div>
        </div>
      )}

      {section === 'agent' && (
        <div className="settings-section">
          <div className="settings-section-title">Agent Settings</div>
          <div className="settings-grid">
            <div className="settings-row">
              <div>
                <label>Autonomous Mode</label>
                <div className="settings-hint">Run the full pipeline without stopping</div>
              </div>
              <div
                className={`toggle ${agentSettings.autonomousMode ? 'on' : ''}`}
                onClick={() => saveAgentSetting('autonomousMode', !agentSettings.autonomousMode)}
              />
            </div>
            <div className="settings-row">
              <div>
                <label>Maximum Fix Iterations</label>
                <div className="settings-hint">Limit automatic retry loops</div>
              </div>
              <input
                className="settings-input"
                type="number"
                min={1}
                max={20}
                value={agentSettings.maxFixIterations}
                onChange={(e) => saveAgentSetting('maxFixIterations', parseInt(e.target.value, 10))}
                style={{ minWidth: 240, width: 240 }}
              />
            </div>
            <div className="settings-row">
              <div>
                <label>Require Approval For Shell</label>
              </div>
              <div
                className={`toggle ${agentSettings.requireApprovalForShell ? 'on' : ''}`}
                onClick={() => saveAgentSetting('requireApprovalForShell', !agentSettings.requireApprovalForShell)}
              />
            </div>
            <div className="settings-row">
              <div>
                <label>Automatically Run Tests</label>
              </div>
              <div
                className={`toggle ${agentSettings.autoRunTests ? 'on' : ''}`}
                onClick={() => saveAgentSetting('autoRunTests', !agentSettings.autoRunTests)}
              />
            </div>
            <div className="settings-row">
              <div>
                <label>Review Before Completion</label>
              </div>
              <div
                className={`toggle ${agentSettings.reviewBeforeCompletion ? 'on' : ''}`}
                onClick={() => saveAgentSetting('reviewBeforeCompletion', !agentSettings.reviewBeforeCompletion)}
              />
            </div>
            <div className="settings-row">
              <div>
                <label>Maximum Agent Steps</label>
                <div className="settings-hint">Cap on total tool steps per run</div>
              </div>
              <input
                className="settings-input"
                type="number"
                min={10}
                max={500}
                value={agentSettings.maxAgentSteps}
                onChange={(e) => saveAgentSetting('maxAgentSteps', parseInt(e.target.value, 10))}
                style={{ minWidth: 240, width: 240 }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}