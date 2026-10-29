import { useEffect, useState } from 'react'
import {
  createModel,
  createProvider,
  deleteModel,
  deleteProvider
} from '../api'
import type { ModelEntry, ProviderPublic } from '../types'
import { Modal } from './Modal'

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
  const [providerName, setProviderName] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '')
  const [modelName, setModelName] = useState('')
  const [modelId, setModelId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!providerId && providers[0]) setProviderId(providers[0].id)
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

  return (
    <Modal title="Settings" onClose={onClose} wide>
      {error && <div className="error-banner">{error}</div>}

      <section className="settings-section">
        <h3>Providers</h3>
        <p className="muted">
          Any OpenAI-compatible endpoint works. For Ollama use <code>http://localhost:11434/v1</code> and leave
          the key empty. Keys stay in SQLite on the server and are never returned to the browser.
        </p>
        <div className="list">
          {providers.map((provider) => (
            <div className="list-row" key={provider.id}>
              <div>
                <strong>{provider.name}</strong>
                <div className="muted small">
                  {provider.baseUrl} · {provider.hasKey ? 'key saved' : 'no key'}
                </div>
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
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              await createProvider({ name: providerName, baseUrl, apiKey })
              setProviderName('')
              setApiKey('')
            })
          }}
        >
          <label className="field">
            <span>Name</span>
            <input value={providerName} onChange={(event) => setProviderName(event.target.value)} placeholder="OpenAI" />
          </label>
          <label className="field">
            <span>Base URL</span>
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.openai.com/v1" />
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
          <button className="btn primary" type="submit" disabled={busy || !providerName.trim()}>
            Add provider
          </button>
        </form>
      </section>

      <section className="settings-section">
        <h3>Models</h3>
        <div className="list">
          {models.map((model) => (
            <div className="list-row" key={model.id}>
              <div>
                <strong>{model.name}</strong>
                <div className="muted small">
                  {model.modelId} · {model.providerName ?? 'provider'}
                </div>
              </div>
              <button className="btn ghost small" disabled={busy} onClick={() => run(() => deleteModel(model.id))}>
                Delete
              </button>
            </div>
          ))}
          {models.length === 0 && <p className="empty-hint">No models yet.</p>}
        </div>
        <form
          className="inline-form"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              await createModel({ providerId, name: modelName, modelId })
              setModelName('')
              setModelId('')
            })
          }}
        >
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
            <input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="DeepSeek Chat" />
          </label>
          <label className="field">
            <span>Model id</span>
            <input value={modelId} onChange={(event) => setModelId(event.target.value)} placeholder="deepseek-chat" />
          </label>
          <button
            className="btn primary"
            type="submit"
            disabled={busy || !providerId || !modelName.trim() || !modelId.trim()}
          >
            Add model
          </button>
        </form>
      </section>
    </Modal>
  )
}
