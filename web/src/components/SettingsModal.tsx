import { useEffect, useState } from 'react'
import {
  createModel,
  createProvider,
  deleteModel,
  deleteProvider
} from '../api'
import type { ModelEntry, ProviderPublic } from '../types'
import { Modal } from './Modal'

type SettingsTab = 'providers' | 'models'
type SettingsView = 'list' | 'add-provider' | 'add-model'

export function SettingsModal({
  providers,
  models,
  onClose,
  onRefresh
}: {
  providers: ProviderPublic[]
  models: ModelEntry[]
  onClose: () => void
  onRefresh: () => Promise<void>
}) {
  const [tab, setTab] = useState<SettingsTab>('providers')
  const [view, setView] = useState<SettingsView>('list')
  const [providerName, setProviderName] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '')
  const [modelName, setModelName] = useState('')
  const [modelId, setModelId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!providers.some((provider) => provider.id === providerId)) {
      setProviderId(providers[0]?.id ?? '')
    }
  }, [providerId, providers])

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await task()
      await onRefresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setBusy(false)
    }
  }

  const openTab = (next: SettingsTab) => {
    setTab(next)
    setView('list')
    setError(null)
  }

  const back = () => {
    setView('list')
    setError(null)
  }

  const addProvider = (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault()
        void run(async () => {
          await createProvider({ name: providerName, baseUrl, apiKey })
          setProviderName('')
          setApiKey('')
          setView('list')
        })
      }}
    >
      <p className="muted">
        Any OpenAI-compatible endpoint works. For Ollama use <code>http://localhost:11434/v1</code> and leave the key
        empty. Keys stay in SQLite on the server and are never returned to the browser.
      </p>
      <label className="field">
        <span>Name</span>
        <input
          value={providerName}
          onChange={(event) => setProviderName(event.target.value)}
          placeholder="OpenAI"
          autoFocus
        />
      </label>
      <label className="field">
        <span>Base URL</span>
        <input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </label>
      <label className="field">
        <span>API key (optional)</span>
        <input
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="sk-…"
          type="password"
          autoComplete="off"
        />
      </label>
      <div className="settings-form-actions">
        <button type="button" className="btn ghost" onClick={back}>
          Cancel
        </button>
        <button className="btn primary" type="submit" disabled={busy || !providerName.trim()}>
          Add provider
        </button>
      </div>
    </form>
  )

  const addModel = (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault()
        void run(async () => {
          await createModel({ providerId, name: modelName, modelId })
          setModelName('')
          setModelId('')
          setView('list')
        })
      }}
    >
      <p className="muted">Models are grouped under a provider. Add a provider first if the list is empty.</p>
      <label className="field">
        <span>Provider</span>
        <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
          {providers.length === 0 && <option value="">Add a provider first</option>}
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span>Label</span>
        <input
          value={modelName}
          onChange={(event) => setModelName(event.target.value)}
          placeholder="DeepSeek Chat"
          autoFocus
        />
      </label>
      <label className="field">
        <span>Model id</span>
        <input
          value={modelId}
          onChange={(event) => setModelId(event.target.value)}
          placeholder="deepseek-chat"
        />
      </label>
      <div className="settings-form-actions">
        <button type="button" className="btn ghost" onClick={back}>
          Cancel
        </button>
        <button
          className="btn primary"
          type="submit"
          disabled={busy || !providerId || !modelName.trim() || !modelId.trim()}
        >
          Add model
        </button>
      </div>
    </form>
  )

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="settings-tabs" role="tablist" aria-label="Settings">
        <button
          className={`settings-tab ${tab === 'providers' ? 'active' : ''}`}
          onClick={() => openTab('providers')}
          role="tab"
          aria-selected={tab === 'providers'}
        >
          Providers
        </button>
        <button
          className={`settings-tab ${tab === 'models' ? 'active' : ''}`}
          onClick={() => openTab('models')}
          role="tab"
          aria-selected={tab === 'models'}
        >
          Models
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {view !== 'list' ? (
        <>
          <div className="settings-subhead">
            <button className="icon-btn" onClick={back} aria-label="Back">
              ←
            </button>
            <h3>{view === 'add-provider' ? 'Add provider' : 'Add model'}</h3>
          </div>
          {view === 'add-provider' ? addProvider : addModel}
        </>
      ) : tab === 'providers' ? (
        <>
          <div className="settings-toolbar">
            <h3>Providers</h3>
            <button className="btn primary small" onClick={() => setView('add-provider')}>
              + Add
            </button>
          </div>
          <div className="settings-cards">
            {providers.map((provider) => (
              <div className="settings-card" key={provider.id}>
                <div className="settings-card-main">
                  <strong>{provider.name}</strong>
                  <span className="muted small">
                    {provider.baseUrl} · {provider.hasKey ? 'key saved' : 'no key'}
                  </span>
                </div>
                <button
                  className="btn ghost small"
                  disabled={busy}
                  onClick={() => run(() => deleteProvider(provider.id))}
                >
                  Delete
                </button>
              </div>
            ))}
            {providers.length === 0 && <p className="empty-hint">No providers yet.</p>}
          </div>
        </>
      ) : (
        <>
          <div className="settings-toolbar">
            <h3>Models</h3>
            <button className="btn primary small" onClick={() => setView('add-model')}>
              + Add
            </button>
          </div>
          <div className="settings-cards">
            {models.map((model) => (
              <div className="settings-card" key={model.id}>
                <div className="settings-card-main">
                  <strong>{model.name}</strong>
                  <span className="muted small">
                    {model.modelId} · {model.providerName ?? 'provider'}
                  </span>
                </div>
                <button className="btn ghost small" disabled={busy} onClick={() => run(() => deleteModel(model.id))}>
                  Delete
                </button>
              </div>
            ))}
            {models.length === 0 && <p className="empty-hint">No models yet.</p>}
          </div>
        </>
      )}
    </Modal>
  )
}
