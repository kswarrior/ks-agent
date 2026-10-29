import { useEffect, useState } from 'react'
import {
  createModel,
  createProvider,
  deleteModel,
  deleteProvider,
  getRetrySettings,
  resetRetrySettings,
  updateModelContext,
  updateRetrySettings
} from '../api'
import type { ModelEntry, ProviderPublic, RetrySettings } from '../types'
import { Modal } from './Modal'
import { SelectMenu } from './SelectMenu'

type SettingsTab = 'providers' | 'models' | 'retry'
type SettingsView = 'list' | 'provider-picker' | 'add-provider' | 'add-model'

const RETRY_STATUS_CODES = [408, 409, 425, 429]

function parseStatusCodes(value: string): { codes: number[]; invalid: string[] } {
  const parts = value.split(/[\s,]+/).filter(Boolean)
  const codes: number[] = []
  const invalid: string[] = []
  for (const part of parts) {
    const code = Number(part)
    if (Number.isInteger(code) && code >= 400 && code <= 599) {
      if (!codes.includes(code)) codes.push(code)
    } else {
      invalid.push(part)
    }
  }
  codes.sort((a, b) => a - b)
  return { codes, invalid }
}

type ProviderPreset = {
  id: string
  name: string
  baseUrl: string
  hint: string
  mark: string
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    hint: 'GPT and o-series models',
    mark: 'AI'
  },
  {
    id: 'google',
    name: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    hint: 'Gemini via the OpenAI-compatible API',
    mark: 'G'
  },
  {
    id: 'nvidia',
    name: 'NVIDIA NIM',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    hint: 'Nemotron and hosted NIM models',
    mark: 'N'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    hint: 'DeepSeek Chat and Reasoner',
    mark: 'DS'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    hint: 'Hundreds of models with one key',
    mark: 'OR'
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    hint: 'Very fast inference',
    mark: 'GQ'
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    baseUrl: 'https://api.mistral.ai/v1',
    hint: 'Mistral and Codestral models',
    mark: 'M'
  },
  {
    id: 'xai',
    name: 'xAI',
    baseUrl: 'https://api.x.ai/v1',
    hint: 'Grok models',
    mark: 'X'
  },
  {
    id: 'together',
    name: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    hint: 'Open models at scale',
    mark: 'T'
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    hint: 'Fast open-model inference',
    mark: 'F'
  },
  {
    id: 'cerebras',
    name: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    hint: 'Ultra-fast inference',
    mark: 'C'
  },
  {
    id: 'moonshot',
    name: 'Moonshot (Kimi)',
    baseUrl: 'https://api.moonshot.ai/v1',
    hint: 'Kimi models',
    mark: 'K'
  },
  {
    id: 'ollama',
    name: 'Ollama',
    baseUrl: 'http://localhost:11434/v1',
    hint: 'Local models · no key needed',
    mark: 'OL'
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    baseUrl: 'http://localhost:1234/v1',
    hint: 'Local models · no key needed',
    mark: 'LM'
  },
  {
    id: 'custom',
    name: 'Custom',
    baseUrl: '',
    hint: 'Any OpenAI-compatible endpoint',
    mark: '+'
  }
]

const CUSTOM_PRESET = PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1]
const DEFAULT_CONTEXT_WINDOW = 128_000

function ModelContextEditor({
  model,
  disabled,
  onSave
}: {
  model: ModelEntry
  disabled: boolean
  onSave: (contextWindow: number) => Promise<void>
}) {
  const [value, setValue] = useState(String(model.contextWindow))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(String(model.contextWindow))
  }, [model.contextWindow])

  const save = async () => {
    const next = Math.round(Number(value))
    if (!Number.isFinite(next) || next < 1_000 || next > 10_000_000 || next === model.contextWindow) {
      setValue(String(model.contextWindow))
      return
    }
    setSaving(true)
    try {
      await onSave(next)
    } catch {
      setValue(String(model.contextWindow))
    } finally {
      setSaving(false)
    }
  }

  return (
    <label className="model-context" title="Maximum context window in tokens">
      <span className="muted small">Context window</span>
      <input
        type="number"
        min={1_000}
        max={10_000_000}
        step={1_000}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        disabled={disabled || saving}
      />
    </label>
  )
}

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
  const [selectedPresetId, setSelectedPresetId] = useState('custom')
  const [providerName, setProviderName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [providerId, setProviderId] = useState(providers[0]?.id ?? '')
  const [modelName, setModelName] = useState('')
  const [modelId, setModelId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [retrySettings, setRetrySettings] = useState<RetrySettings | null>(null)
  const [retryDraft, setRetryDraft] = useState<RetrySettings | null>(null)
  const [retryCodes, setRetryCodes] = useState('')
  const [retryLoading, setRetryLoading] = useState(true)
  const [retrySaving, setRetrySaving] = useState(false)
  const [retrySaved, setRetrySaved] = useState(false)

  const selectedPreset = PROVIDER_PRESETS.find((preset) => preset.id === selectedPresetId) ?? CUSTOM_PRESET
  const isLocalEndpoint = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::|\/|$)/i.test(baseUrl)

  useEffect(() => {
    if (!providers.some((provider) => provider.id === providerId)) {
      setProviderId(providers[0]?.id ?? '')
    }
  }, [providerId, providers])

  useEffect(() => {
    let cancelled = false
    setRetryLoading(true)
    void getRetrySettings()
      .then((settings) => {
        if (cancelled) return
        setRetrySettings(settings)
        setRetryDraft(settings)
        setRetryCodes(settings.retryOnStatusCodes.join(', '))
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : String(caught))
      })
      .finally(() => {
        if (!cancelled) setRetryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

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
    setError(null)
    if (view === 'add-provider') {
      setView('provider-picker')
      return
    }
    setView('list')
  }

  const cancel = () => {
    setView('list')
    setError(null)
  }

  const chooseProvider = (preset: ProviderPreset) => {
    setSelectedPresetId(preset.id)
    setProviderName(preset.id === 'custom' ? '' : preset.name)
    setBaseUrl(preset.baseUrl)
    setApiKey('')
    setError(null)
    setView('add-provider')
  }

  const updateRetry = <K extends keyof RetrySettings>(key: K, value: RetrySettings[K]) => {
    setRetrySaved(false)
    setRetryDraft((current) => (current ? { ...current, [key]: value } : current))
  }

  const parsedCodes = parseStatusCodes(retryCodes)

  const toggleStatusCode = (code: number) => {
    const next = parsedCodes.codes.includes(code)
      ? parsedCodes.codes.filter((entry) => entry !== code)
      : [...parsedCodes.codes, code]
    next.sort((a, b) => a - b)
    setRetrySaved(false)
    setRetryCodes(next.join(', '))
  }

  const retryDirty =
    Boolean(retryDraft && retrySettings) &&
    JSON.stringify({ ...retryDraft, retryOnStatusCodes: parsedCodes.codes }) !==
      JSON.stringify(retrySettings)

  const saveRetry = async () => {
    if (!retryDraft) return
    if (parsedCodes.invalid.length) {
      setError(`Invalid HTTP status code: ${parsedCodes.invalid.join(', ')}. Use 400–599.`)
      return
    }
    if (retryDraft.baseDelayMs < 100 || retryDraft.baseDelayMs > 120_000) {
      setError('Initial delay must be between 100 and 120000 ms.')
      return
    }
    if (retryDraft.maxDelayMs < retryDraft.baseDelayMs || retryDraft.maxDelayMs > 600_000) {
      setError('Max delay must be at least the initial delay and at most 600000 ms.')
      return
    }
    if (retryDraft.maxRetries < 0 || retryDraft.maxRetries > 100) {
      setError('Retries must be between 0 and 100, or use unlimited.')
      return
    }
    if (retryDraft.multiplier < 1 || retryDraft.multiplier > 10) {
      setError('Backoff multiplier must be between 1 and 10.')
      return
    }
    setRetrySaving(true)
    setError(null)
    setRetrySaved(false)
    try {
      const saved = await updateRetrySettings({ ...retryDraft, retryOnStatusCodes: parsedCodes.codes })
      setRetrySettings(saved)
      setRetryDraft(saved)
      setRetryCodes(saved.retryOnStatusCodes.join(', '))
      setRetrySaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRetrySaving(false)
    }
  }

  const resetRetry = async () => {
    setRetrySaving(true)
    setError(null)
    setRetrySaved(false)
    try {
      const saved = await resetRetrySettings()
      setRetrySettings(saved)
      setRetryDraft(saved)
      setRetryCodes(saved.retryOnStatusCodes.join(', '))
      setRetrySaved(true)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setRetrySaving(false)
    }
  }

  const addProvider = (
    <form
      className="settings-form"
      onSubmit={(event) => {
        event.preventDefault()
        void run(async () => {
          await createProvider({ name: providerName, baseUrl, apiKey })
          setProviderName('')
          setBaseUrl('')
          setApiKey('')
          setView('list')
        })
      }}
    >
      <p className="muted">
        {isLocalEndpoint
          ? 'Local endpoints usually need no API key. Keys stay in SQLite on the server and are never returned to the browser.'
          : 'Any OpenAI-compatible endpoint works. Keys stay in SQLite on the server and are never returned to the browser.'}
      </p>
      <label className="field">
        <span>Name</span>
        <input
          value={providerName}
          onChange={(event) => setProviderName(event.target.value)}
          placeholder={selectedPreset.id === 'custom' ? 'My provider' : selectedPreset.name}
          autoFocus={selectedPreset.id === 'custom'}
        />
      </label>
      <label className="field">
        <span>Base URL</span>
        <input
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
          placeholder={selectedPreset.baseUrl || 'https://api.example.com/v1'}
        />
      </label>
      <label className="field">
        <span>API key (optional)</span>
        <input
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={isLocalEndpoint ? 'No key needed for local endpoints' : 'sk-…'}
          type="password"
          autoComplete="off"
          autoFocus={selectedPreset.id !== 'custom'}
        />
      </label>
      <div className="settings-form-actions">
        <button type="button" className="btn ghost" onClick={cancel}>
          Cancel
        </button>
        <button
          className="btn primary"
          type="submit"
          disabled={busy || !providerName.trim() || !/^https?:\/\//i.test(baseUrl.trim())}
        >
          Add provider
        </button>
      </div>
    </form>
  )

  const providerPicker = (
    <>
      <p className="muted">Pick a provider to prefill its API endpoint, or choose Custom for any OpenAI-compatible API.</p>
      <div className="provider-preset-grid">
        {PROVIDER_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={`provider-preset ${preset.id === 'custom' ? 'custom' : ''}`}
            onClick={() => chooseProvider(preset)}
          >
            <span className="provider-preset-mark" aria-hidden="true">
              {preset.mark}
            </span>
            <span className="provider-preset-text">
              <strong>{preset.name}</strong>
              <span>{preset.hint}</span>
              <code>{preset.baseUrl || 'Custom endpoint'}</code>
            </span>
          </button>
        ))}
      </div>
    </>
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
        <SelectMenu
          value={providerId}
          options={providers.map((provider) => ({ value: provider.id, label: provider.name }))}
          onChange={setProviderId}
          placeholder={providers.length === 0 ? 'Add a provider first' : 'Select provider'}
          disabled={providers.length === 0}
          ariaLabel="Provider"
        />
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

  const retryPanel = !retryDraft ? (
    <p className="empty-hint">{retryLoading ? 'Loading retry settings…' : 'Retry settings are unavailable.'}</p>
  ) : (
    <>
      <div className="settings-toolbar">
        <h3>Retry</h3>
        {retrySaved && <span className="settings-saved">Saved</span>}
      </div>
      <div className="settings-card retry-master">
        <div className="settings-card-main">
          <strong>Automatic retry</strong>
          <span className="muted small">
            Retry provider requests after transient failures such as rate limits, server errors and network
            timeouts.
          </span>
        </div>
        <label className="switch">
          <input
            type="checkbox"
            checked={retryDraft.enabled}
            onChange={(event) => updateRetry('enabled', event.target.checked)}
            aria-label="Enable automatic retry"
          />
          <span className="switch-track" aria-hidden="true" />
        </label>
      </div>

      <fieldset className="retry-fields" disabled={!retryDraft.enabled}>
        <div className="settings-section">
          <div className="settings-section-head">
            <h4>Attempts</h4>
            <div className="segmented" role="group" aria-label="Retry limit">
              <button
                type="button"
                className={!retryDraft.unlimited ? 'active' : ''}
                onClick={() => updateRetry('unlimited', false)}
              >
                Limited
              </button>
              <button
                type="button"
                className={retryDraft.unlimited ? 'active' : ''}
                onClick={() => updateRetry('unlimited', true)}
              >
                Unlimited
              </button>
            </div>
          </div>
          <label className="field">
            <span>Retries after the first attempt</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={retryDraft.maxRetries}
              disabled={retryDraft.unlimited}
              onChange={(event) => updateRetry('maxRetries', Number(event.target.value))}
            />
          </label>
          <p className="muted small">
            {retryDraft.unlimited
              ? 'Keeps retrying until the request succeeds, you stop the run, or the error is not retryable.'
              : `Up to ${retryDraft.maxRetries + 1} total attempt${retryDraft.maxRetries === 0 ? '' : 's'} (the first try plus ${retryDraft.maxRetries} retr${retryDraft.maxRetries === 1 ? 'y' : 'ies'}).`}
          </p>
        </div>

        <div className="settings-section">
          <h4>Backoff</h4>
          <div className="settings-inline-grid">
            <label className="field">
              <span>Initial delay (ms)</span>
              <input
                type="number"
                min={100}
                max={120000}
                step={100}
                value={retryDraft.baseDelayMs}
                onChange={(event) => updateRetry('baseDelayMs', Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Max delay (ms)</span>
              <input
                type="number"
                min={100}
                max={600000}
                step={100}
                value={retryDraft.maxDelayMs}
                onChange={(event) => updateRetry('maxDelayMs', Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Backoff multiplier</span>
              <input
                type="number"
                min={1}
                max={10}
                step={0.1}
                value={retryDraft.multiplier}
                onChange={(event) => updateRetry('multiplier', Number(event.target.value))}
              />
            </label>
          </div>
          <div className="settings-checks">
            <label className="check-row">
              <input
                type="checkbox"
                checked={retryDraft.jitter}
                onChange={(event) => updateRetry('jitter', event.target.checked)}
              />
              Add random jitter (75–100% of the delay)
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={retryDraft.honorRetryAfter}
                onChange={(event) => updateRetry('honorRetryAfter', event.target.checked)}
              />
              Honor the Retry-After response header
            </label>
          </div>
        </div>

        <div className="settings-section">
          <h4>Retry when</h4>
          <div className="settings-checks">
            <label className="check-row">
              <input
                type="checkbox"
                checked={retryDraft.retryOnNetwork}
                onChange={(event) => updateRetry('retryOnNetwork', event.target.checked)}
              />
              Network errors and timeouts
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={retryDraft.retryOnServerErrors}
                onChange={(event) => updateRetry('retryOnServerErrors', event.target.checked)}
              />
              Server errors (5xx)
            </label>
          </div>
          <div className="settings-field">
            <span className="field-label">Additional HTTP status codes</span>
            <div className="code-chips">
              {RETRY_STATUS_CODES.map((code) => (
                <button
                  type="button"
                  key={code}
                  className={`code-chip ${parsedCodes.codes.includes(code) ? 'active' : ''}`}
                  onClick={() => toggleStatusCode(code)}
                  aria-pressed={parsedCodes.codes.includes(code)}
                >
                  {code}
                </button>
              ))}
            </div>
            <input
              value={retryCodes}
              onChange={(event) => {
                setRetrySaved(false)
                setRetryCodes(event.target.value)
              }}
              placeholder="e.g. 429, 503"
              aria-label="Retry status codes"
            />
            <p className={`muted small ${parsedCodes.invalid.length ? 'field-error' : ''}`}>
              {parsedCodes.invalid.length
                ? `Invalid code${parsedCodes.invalid.length === 1 ? '' : 's'}: ${parsedCodes.invalid.join(', ')}`
                : 'Comma-separated status codes between 400 and 599. 429 is the usual rate-limit code.'}
            </p>
          </div>
        </div>
      </fieldset>

      <div className="settings-form-actions">
        <button type="button" className="btn ghost" onClick={() => void resetRetry()} disabled={retrySaving}>
          Reset defaults
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => void saveRetry()}
          disabled={retrySaving || !retryDirty || parsedCodes.invalid.length > 0}
        >
          {retrySaving ? 'Saving…' : 'Save retry settings'}
        </button>
      </div>
    </>
  )

  return (
    <Modal title="Settings" onClose={onClose} wide fullHeight>
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
        <button
          className={`settings-tab ${tab === 'retry' ? 'active' : ''}`}
          onClick={() => openTab('retry')}
          role="tab"
          aria-selected={tab === 'retry'}
        >
          Retry
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {view !== 'list' ? (
        <>
          <div className="settings-subhead">
            <button className="icon-btn" onClick={back} aria-label="Back">
              ←
            </button>
            <h3>
              {view === 'provider-picker'
                ? 'Add provider'
                : view === 'add-provider'
                  ? selectedPreset.id === 'custom'
                    ? 'Custom provider'
                    : `Add ${selectedPreset.name}`
                  : 'Add model'}
            </h3>
          </div>
          {view === 'provider-picker' ? providerPicker : view === 'add-provider' ? addProvider : addModel}
        </>
      ) : tab === 'providers' ? (
        <>
          <div className="settings-toolbar">
            <h3>Providers</h3>
            <button className="btn primary small" onClick={() => setView('provider-picker')}>
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
      ) : tab === 'retry' ? (
        retryPanel
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
