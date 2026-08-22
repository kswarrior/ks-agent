import { useEffect, useState } from 'react';
import { api } from '../api';
import { AppSettings, ModelSettings, ProviderSettings } from '../types';
import { GeneralSettingsView } from './settings/GeneralSettingsView';
import { ModelsSettingsView } from './settings/ModelsSettingsView';
import { ProvidersSettingsView } from './settings/ProvidersSettingsView';
import { APISettingsView } from './settings/APISettingsView';
import { ToolsSettingsView } from './settings/ToolsSettingsView';
import { AgentSettingsView } from './settings/AgentSettingsView';
import { AppearanceSettingsView } from './settings/AppearanceSettingsView';
import { DatabaseSettingsView } from './settings/DatabaseSettingsView';

interface Props {
  settings: AppSettings | null;
  providers: ProviderSettings[];
  onSettingsChange: (s: AppSettings) => Promise<void>;
  onProvidersChange: () => Promise<void>;
}

const TABS = [
  'General',
  'Models',
  'Providers',
  'API',
  'Tools',
  'Agent',
  'Appearance',
  'Database',
] as const;

type Tab = (typeof TABS)[number];

export function SettingsPage(p: Props) {
  const [tab, setTab] = useState<Tab>('General');
  const [models, setModels] = useState<ModelSettings[]>([]);
  const [draft, setDraft] = useState<AppSettings | null>(p.settings);

  useEffect(() => {
    setDraft(p.settings);
  }, [p.settings]);

  useEffect(() => {
    api.listModels().then(setModels).catch(console.error);
  }, []);

  if (!draft) return <div className="empty">Loading…</div>;

  const update = async (next: AppSettings) => {
    setDraft(next);
    await p.onSettingsChange(next);
  };

  return (
    <div className="layout" style={{ gridTemplateColumns: '220px 1fr' }}>
      <aside className="panel">
        <div className="panel-header">
          <span>Settings</span>
        </div>
        <div className="panel-body compact">
          {TABS.map((t) => (
            <div
              key={t}
              className={`sidebar-item ${tab === t ? 'selected' : ''}`}
              onClick={() => setTab(t)}
            >
              <span className="name">{t}</span>
            </div>
          ))}
        </div>
      </aside>
      <section className="center" style={{ borderRight: 'none' }}>
        <div className="panel-body scroll" style={{ padding: 20 }}>
          {tab === 'General' && <GeneralSettingsView draft={draft} update={update} />}
          {tab === 'Models' && (
            <ModelsSettingsView
              draft={draft}
              providers={p.providers}
              models={models}
              onModelChange={async (m) => {
                await api.saveModel(m);
                setModels(await api.listModels());
              }}
            />
          )}
          {tab === 'Providers' && (
            <ProvidersSettingsView
              providers={p.providers}
              onProvidersChange={p.onProvidersChange}
            />
          )}
          {tab === 'API' && <APISettingsView draft={draft} update={update} />}
          {tab === 'Tools' && <ToolsSettingsView draft={draft} update={update} />}
          {tab === 'Agent' && <AgentSettingsView draft={draft} update={update} />}
          {tab === 'Appearance' && <AppearanceSettingsView draft={draft} update={update} />}
          {tab === 'Database' && <DatabaseSettingsView />}
        </div>
      </section>
    </div>
  );
}
