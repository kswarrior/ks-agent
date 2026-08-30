import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import type { ModelEntry, Provider, RetrySettings } from '../types'
import { useDialogs } from '../dialogs'
import { useToast } from '../toast'
import { IconChevronLeft, IconPencil, IconPlus, IconTrash, IconX, IconRotate } from '../icons'

interface Props {
  open: boolean
  onClose: () => void
  onDataChanged: () => void
}

type Tab = 'providers' | 'models' | 'prompt' | 'retry'

const PROVIDER_PRESETS = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { name: 'Together', baseUrl: 'https://api.together.xyz/v1' },
  { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { name: 'NVIDIA', baseUrl: 'https://integrate.api.nvidia.com/v1' },
  { name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1' }
]

interface ProviderForm {
  editingId: string | null
  name: string
  baseUrl: string
  apiKey: string
}

export function SettingsModal({ open, onClose, onDataChanged }: Props) {
  const [tab, setTab] = useState<Tab>('providers')
  const [providers, setProviders] = useState<Provider[]>([])
  const [models, setModels] = useState<ModelEntry[]>([])
  const [providerForm, setProviderForm] = useState<ProviderForm | null>(null)
  const [providerPicker, setProviderPicker] = useState(false)
  const [showModelForm, setShowModelForm] = useState(false)
  const [modelForm, setModelForm] = useState({ providerId: '', model: '', displayName: '', maxTokens: '', systemPrompt: '' })
  const [modelEdit, setModelEdit] = useState<ModelEntry | null>(null)
  const [planPrompt, setPlanPrompt] = useState('')
  const [planDraft, setPlanDraft] = useState('')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [systemDraft, setSystemDraft] = useState('')
  const [retrySettings, setRetrySettings] = useState<RetrySettings | null>(null)
  const [retryDraft, setRetryDraft] = useState<RetrySettings | null>(null)
  // raw strings for editable inputs so typing is not blocked by immediate clamping/parsing
  const [maxRetriesInput, setMaxRetriesInput] = useState('')
  const [baseDelayInput, setBaseDelayInput] = useState('')
  const [maxDelayInput, setMaxDelayInput] = useState('')
  const [retryOnInput, setRetryOnInput] = useState('')
  const [stopOnInput, setStopOnInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const confirm = useDialogs().confirm
  const toast = useToast()
  const tabsRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ active: boolean; startX: number; startScrollLeft: number; moved: boolean } | null>(null)
  const dragMovedRef = useRef(false)

  function handleTabsWheel(e: React.WheelEvent<HTMLDivElement>) {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      const el = e.currentTarget
      if (el.scrollWidth > el.clientWidth) {
        e.preventDefault()
        el.scrollLeft += e.deltaY
      }
    }
  }

  function handleTabsPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollWidth <= el.clientWidth) return
    dragMovedRef.current = false
    dragRef.current = { active: true, startX: e.clientX, startScrollLeft: el.scrollLeft, moved: false }
    el.style.cursor = 'grabbing'
    el.style.userSelect = 'none'
  }

  function handleTabsPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    const el = e.currentTarget
    if (!drag?.active) return
    const dx = e.clientX - drag.startX
    if (Math.abs(dx) > 8) { drag.moved = true; dragMovedRef.current = true }
    if (drag.moved) el.scrollLeft = drag.startScrollLeft - dx
  }

  function handleTabsPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const el = e.currentTarget
    const drag = dragRef.current
    dragRef.current = null
    el.style.cursor = ''
    el.style.userSelect = ''
    if (drag?.moved) {
      e.preventDefault()
      e.stopPropagation()
      setTimeout(() => { dragMovedRef.current = false }, 350)
    } else {
      dragMovedRef.current = false
    }
  }

  useEffect(() => {
    if (open) {
      refresh()
      loadPlanPrompt()
      loadSystemPrompt()
      loadRetrySettings()
      setProviderForm(null)
      setProviderPicker(false)
      setShowModelForm(false)
      setModelEdit(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function refresh() {
    try {
      const [p, m] = await Promise.all([api.listProviders(), api.listModels()])
      setProviders(p)
      setModels(m)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function loadPlanPrompt() {
    try {
      const { planPrompt } = await api.getPlanPrompt()
      setPlanPrompt(planPrompt)
      setPlanDraft(planPrompt)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function loadSystemPrompt() {
    try {
      const { systemPrompt } = await api.getSystemPrompt()
      setSystemPrompt(systemPrompt)
      setSystemDraft(systemPrompt)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function submitSystemPrompt() {
    setError(null)
    try {
      const { systemPrompt } = await api.saveSystemPrompt(systemDraft.trim())
      setSystemPrompt(systemPrompt)
      setSystemDraft(systemPrompt)
      toast('System prompt saved', 'success')
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function loadRetrySettings() {
    try {
      const settings = await api.getRetrySettings()
      setRetrySettings(settings)
      setRetryDraft({ ...settings })
      setMaxRetriesInput(String(settings.maxRetries))
      setBaseDelayInput(String(settings.baseDelayMs))
      setMaxDelayInput(String(settings.maxDelayMs))
      setRetryOnInput(settings.retryOnStatusCodes.join(', '))
      setStopOnInput(settings.stopOnStatusCodes.join(', '))
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function submitPlanPrompt() {
    setError(null)
    try {
      const { planPrompt } = await api.savePlanPrompt(planDraft.trim())
      setPlanPrompt(planPrompt)
      setPlanDraft(planPrompt)
      toast('Plan prompt saved', 'success')
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function submitRetrySettings() {
    if (!retryDraft) return
    setError(null)
    // parse raw strings - allow user to have typed anything, clamp and validate here (maxRetries now up to 1000, not 10)
    const parsedMaxRetries = Math.max(0, Math.min(1000, parseInt(maxRetriesInput, 10) || 0))
    const parsedBaseDelay = Math.max(100, Math.min(60000, parseInt(baseDelayInput, 10) || 100))
    const parsedMaxDelay = Math.max(1000, Math.min(300000, parseInt(maxDelayInput, 10) || 1000))
    const parsedRetryOn = retryOnInput.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n >= 100 && n < 600)
    const parsedStopOn = stopOnInput.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n >= 100 && n < 600)
    const toSave: RetrySettings = {
      ...retryDraft,
      maxRetries: parsedMaxRetries,
      baseDelayMs: parsedBaseDelay,
      maxDelayMs: parsedMaxDelay,
      retryOnStatusCodes: parsedRetryOn,
      stopOnStatusCodes: parsedStopOn
    }
    try {
      const settings = await api.updateRetrySettings(toSave)
      setRetrySettings(settings)
      setRetryDraft({ ...settings })
      setMaxRetriesInput(String(settings.maxRetries))
      setBaseDelayInput(String(settings.baseDelayMs))
      setMaxDelayInput(String(settings.maxDelayMs))
      setRetryOnInput(settings.retryOnStatusCodes.join(', '))
      setStopOnInput(settings.stopOnStatusCodes.join(', '))
      toast('Retry settings saved', 'success')
    } catch (e: any) {
      setError(e.message)
    }
  }

  function resetRetryDefaults() {
    const defaults: RetrySettings = {
      enabled: true,
      maxRetries: 5,
      baseDelayMs: 1200,
      maxDelayMs: 30000,
      retryOnStatusCodes: [429, 500, 502, 503],
      stopOnStatusCodes: [400, 401, 403, 404],
      alwaysRetry: false
    }
    setRetryDraft(defaults)
    setMaxRetriesInput(String(defaults.maxRetries))
    setBaseDelayInput(String(defaults.baseDelayMs))
    setMaxDelayInput(String(defaults.maxDelayMs))
    setRetryOnInput(defaults.retryOnStatusCodes.join(', '))
    setStopOnInput(defaults.stopOnStatusCodes.join(', '))
  }

  if (!open) return null

  function chooseProvider(name: string, baseUrl: string) {
    setProviderForm({ editingId: null, name, baseUrl, apiKey: '' })
    setProviderPicker(false)
  }

  async function submitProvider() {
    if (!providerForm) return
    setError(null)
    if (!providerForm.name.trim()) return setError('Name is required')
    if (!/^https?:\/\/.+/.test(providerForm.baseUrl.trim())) return setError('Base URL must start with http(s)://')

    try {
      if (providerForm.editingId) {
        await api.updateProvider(providerForm.editingId, {
          name: providerForm.name.trim(),
          baseUrl: providerForm.baseUrl.trim(),
          ...(providerForm.apiKey.trim() ? { apiKey: providerForm.apiKey.trim() } : {})
        })
        toast('Provider updated', 'success')
      } else {
        await api.createProvider({
          name: providerForm.name.trim(),
          baseUrl: providerForm.baseUrl.trim(),
          apiKey: providerForm.apiKey.trim()
        })
        toast('Provider added', 'success')
      }
      setProviderForm(null)
      await refresh()
      onDataChanged()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function submitModel() {
    setError(null)
    if (!modelForm.providerId) return setError('Select a provider')
    if (!modelForm.model.trim()) return setError('Model id is required')
    try {
      const maxTokens = modelForm.maxTokens.trim() ? parseInt(modelForm.maxTokens.trim(), 10) : undefined
      if (modelForm.maxTokens.trim() && (isNaN(maxTokens!) || maxTokens! < 1)) return setError('Max tokens must be a positive number')
      await api.createModel({
        providerId: modelForm.providerId,
        model: modelForm.model.trim(),
        ...(modelForm.displayName.trim() ? { displayName: modelForm.displayName.trim() } : {}),
        ...(modelForm.systemPrompt.trim() ? { systemPrompt: modelForm.systemPrompt.trim() } : {}),
        ...(maxTokens ? { maxTokens } : {})
      })
      setModelForm({ providerId: '', model: '', displayName: '', maxTokens: '', systemPrompt: '' })
      setShowModelForm(false)
      toast('Model added', 'success')
      await refresh()
      onDataChanged()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function submitEditModel() {
    if (!modelEdit) return
    setError(null)
    try {
      const raw = modelEdit.maxTokens
      const parsed = raw != null && String(raw).trim() !== '' ? Number(raw) : undefined
      const maxTokensPayload = parsed != null && Number.isFinite(parsed) && parsed >= 1 ? { maxTokens: Math.floor(parsed) } : { maxTokens: 0 }
      await api.updateModel(modelEdit.id, {
        displayName: modelEdit.displayName?.trim() ?? '',
        ...maxTokensPayload,
        systemPrompt: modelEdit.systemPrompt?.trim() ?? ''
      })
      setModelEdit(null)
      await refresh()
      onDataChanged()
      toast('Model updated', 'success')
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function removeProvider(p: Provider) {
    const ok = await confirm({
      title: `Delete ${p.name}?`,
      message: 'All models registered under this provider will also be removed.',
      danger: true,
      confirmText: 'Delete'
    })
    if (!ok) return
    try {
      await api.deleteProvider(p.id)
      toast('Provider deleted', 'success')
      await refresh()
      onDataChanged()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function removeModel(m: ModelEntry) {
    const ok = await confirm({
      title: `Remove model?`,
      message: `${m.model} (${m.providerName})`,
      danger: true,
      confirmText: 'Remove'
    })
    if (!ok) return
    try {
      await api.deleteModel(m.id)
      await refresh()
      onDataChanged()
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  const grouped = models.reduce<Record<string, ModelEntry[]>>((acc, m) => {
    ;(acc[m.providerName] ??= []).push(m)
    return acc
  }, {})

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="modal-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">Settings</h3>
          <button className="icon-btn" aria-label="Close settings" onClick={onClose}>
            <IconX size={18} />
          </button>
        </div>

        <div
          ref={tabsRef}
          className="tabs"
          onWheel={handleTabsWheel}
          onPointerDown={handleTabsPointerDown}
          onPointerMove={handleTabsPointerMove}
          onPointerUp={handleTabsPointerUp}
          onPointerLeave={handleTabsPointerUp}
        >
          <button
            className={`tab${tab === 'providers' ? ' active' : ''}`}
            onClick={(e) => {
              if (dragMovedRef.current) { dragMovedRef.current = false; return }
              setTab('providers')
              setError(null)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
            }}
          >
            Providers
          </button>
          <button
            className={`tab${tab === 'models' ? ' active' : ''}`}
            onClick={(e) => {
              if (dragMovedRef.current) { dragMovedRef.current = false; return }
              setTab('models')
              setError(null)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
            }}
          >
            Models
          </button>
          <button
            className={`tab${tab === 'prompt' ? ' active' : ''}`}
            onClick={(e) => {
              if (dragMovedRef.current) { dragMovedRef.current = false; return }
              setTab('prompt')
              setError(null)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
            }}
          >
            Prompts
          </button>
          <button
            className={`tab${tab === 'retry' ? ' active' : ''}`}
            onClick={(e) => {
              if (dragMovedRef.current) { dragMovedRef.current = false; return }
              setTab('retry')
              setError(null)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
            }}
          >
            Retry
          </button>        </div>

        <div className="tab-body">
          {error && <p className="field-error" style={{ marginBottom: 10 }}>{error}</p>}

          {tab === 'providers' && providerPicker ? (
            <>
              <div className="list-head">
                <button
                  className="icon-btn"
                  aria-label="Back to providers"
                  onClick={() => { setProviderPicker(false); setError(null) }}
                >
                  <IconChevronLeft size={16} />
                </button>
                <h3>Add provider</h3>
              </div>
              <p className="hint" style={{ marginTop: -6, marginBottom: 12 }}>
                Pick a provider to start with its base URL pre-filled — you only need to enter your API key.
              </p>
              <div className="preset-grid">
                {PROVIDER_PRESETS.map((pr) => (
                  <button key={pr.name} type="button" className="preset-card" onClick={() => chooseProvider(pr.name, pr.baseUrl)}>
                    <span className="preset-name">{pr.name}</span>
                    <span className="preset-url">{pr.baseUrl}</span>
                  </button>
                ))}
                <button type="button" className="preset-card" onClick={() => chooseProvider('', '')}>
                  <span className="preset-name">Custom</span>
                  <span className="preset-url">Any OpenAI-compatible endpoint</span>
                </button>
              </div>
            </>
          ) : tab === 'providers' && providerForm ? (
            <>
              <div className="list-head">
                <button
                  className="icon-btn"
                  aria-label="Back to providers"
                  onClick={() => { setProviderForm(null); setError(null) }}
                >
                  <IconChevronLeft size={16} />
                </button>
                <h3>{providerForm.editingId ? 'Edit provider' : 'Create provider'}</h3>
              </div>
              <div className="inline-form" style={{ marginTop: 0 }}>
                <label className="field-label">Name</label>
                <input
                  className="input"
                  placeholder="e.g. OpenRouter"
                  value={providerForm.name}
                  onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                />
                <label className="field-label">Base URL</label>
                <input
                  className="input"
                  placeholder="https://api.openai.com/v1"
                  value={providerForm.baseUrl}
                  onChange={(e) => setProviderForm({ ...providerForm, baseUrl: e.target.value })}
                />
                <label className="field-label">API key {providerForm.editingId && <span style={{ fontWeight: 400 }}>(leave blank to keep current)</span>}</label>
                <input
                  className="input"
                  type="password"
                  placeholder="sk-…"
                  value={providerForm.apiKey}
                  onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                />
                <div className="dialog-actions">
                  <button className="btn" onClick={() => { setProviderForm(null); setError(null) }}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={submitProvider}>
                    {providerForm.editingId ? 'Save changes' : 'Create'}
                  </button>
                </div>
              </div>
            </>
          ) : tab === 'providers' ? (
            <>
              <div className="list-head">
                <h3>Providers ({providers.length})</h3>
                <button
                  className="btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => { setError(null); setProviderPicker(true) }}
                >
                  <IconPlus size={15} /> Add
                </button>
              </div>

              {providers.length === 0 && (
                <div className="empty" style={{ padding: '36px 12px' }}>
                  <h2>No providers yet</h2>
                  <p>Add an OpenAI-compatible provider (base URL + API key) to start.</p>
                </div>
              )}

              {providers.map((p) => (
                <div key={p.id} className="provider-card">
                  <div className="provider-top">
                    <span className="provider-name">{p.name}</span>
                    <button
                      className="icon-btn"
                      style={{ width: 30, height: 30 }}
                      aria-label={`Edit ${p.name}`}
                      onClick={() =>
                        setProviderForm({
                          editingId: p.id,
                          name: p.name,
                          baseUrl: p.baseUrl,
                          apiKey: ''
                        })
                      }
                    >
                      <IconPencil size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      style={{ width: 30, height: 30, color: '#ef4444' }}
                      aria-label={`Delete ${p.name}`}
                      onClick={() => removeProvider(p)}
                    >
                      <IconTrash size={15} />
                    </button>
                  </div>
                  <div className="provider-url">{p.baseUrl}</div>
                  <div className="provider-key">{p.keyPreview || 'no key set'}</div>
                </div>
              ))}
            </>
          ) : null}

          {tab === 'models' && modelEdit ? (
            <>
              <div className="list-head">
                <button
                  className="icon-btn"
                  aria-label="Back to models"
                  onClick={() => { setModelEdit(null); setError(null) }}
                >
                  <IconChevronLeft size={16} />
                </button>
                <h3>Edit model</h3>
              </div>
              <div className="inline-form" style={{ marginTop: 0 }}>
                <label className="field-label">Model id</label>
                <input className="input" value={modelEdit.model} disabled />
                <label className="field-label">Display name</label>
                <input
                  className="input"
                  placeholder="(optional)"
                  value={modelEdit.displayName ?? ''}
                  onChange={(e) => setModelEdit({ ...modelEdit, displayName: e.target.value })}
                />
                <label className="field-label">Max tokens (optional)</label>
                <input
                  className="input"
                  type="number"
                  placeholder="leave empty for provider default"
                  value={modelEdit.maxTokens ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.trim()
                    setModelEdit({ ...modelEdit, maxTokens: v ? parseInt(v, 10) : undefined })
                  }}
                />
                <label className="field-label">System prompt (optional)</label>
                <textarea
                  className="input"
                  rows={8}
                  placeholder="Custom system prompt for this model. Leave blank to use the global or built-in default. Useful for weaker models that need clearer instructions."
                  value={modelEdit.systemPrompt ?? ''}
                  onChange={(e) => setModelEdit({ ...modelEdit, systemPrompt: e.target.value })}
                />
                <p className="hint" style={{ marginTop: 4 }}>
                  A model-specific system prompt overrides the global setting and the built-in default.
                </p>
                <div className="dialog-actions">
                  <button className="btn" onClick={() => { setModelEdit(null); setError(null) }}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={submitEditModel}>
                    Save
                  </button>
                </div>
              </div>
            </>
          ) : tab === 'models' && showModelForm ? (
            <>
              <div className="list-head">
                <button
                  className="icon-btn"
                  aria-label="Back to models"
                  onClick={() => { setShowModelForm(false); setError(null) }}
                >
                  <IconChevronLeft size={16} />
                </button>
                <h3>Create model</h3>
              </div>
              <div className="inline-form" style={{ marginTop: 0 }}>
                <label className="field-label">Provider</label>
                <select
                  className="input"
                  value={modelForm.providerId}
                  onChange={(e) => setModelForm({ ...modelForm, providerId: e.target.value })}
                >
                  {providers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <label className="field-label">Model id</label>
                <input
                  className="input"
                  placeholder="minimax-ai/minimax-m3"
                  value={modelForm.model}
                  onChange={(e) => setModelForm({ ...modelForm, model: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && submitModel()}
                />
                <p className="hint">Use the provider's model identifier, e.g. minimax-ai/minimax-m3</p>
                <label className="field-label">Display name</label>
                <input
                  className="input"
                  placeholder="e.g. MiniMax M3 (optional)"
                  value={modelForm.displayName}
                  onChange={(e) => setModelForm({ ...modelForm, displayName: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && submitModel()}
                />
                <label className="field-label">Max tokens (optional)</label>
                <input
                  className="input"
                  type="number"
                  placeholder="e.g. 16384 (leave empty for provider default)"
                  value={modelForm.maxTokens}
                  onChange={(e) => setModelForm({ ...modelForm, maxTokens: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && submitModel()}
                />
                <p className="hint">Maximum tokens for AI responses. Higher values allow longer responses.</p>
                <label className="field-label">System prompt (optional)</label>
                <textarea
                  className="input"
                  rows={6}
                  placeholder="Custom system prompt for this model. Leave blank to use the global or built-in default. Useful for weaker models that need clearer instructions."
                  value={modelForm.systemPrompt}
                  onChange={(e) => setModelForm({ ...modelForm, systemPrompt: e.target.value })}
                />
                <p className="hint">A model-specific system prompt overrides the global setting and the built-in default.</p>
                <div className="dialog-actions">
                  <button className="btn" onClick={() => { setShowModelForm(false); setError(null) }}>
                    Cancel
                  </button>
                  <button className="btn btn-primary" onClick={submitModel}>
                    Add model
                  </button>
                </div>
              </div>
            </>
          ) : tab === 'models' ? (
            <>
              <div className="list-head">
                <h3>Models ({models.length})</h3>
                <button
                  className="btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  disabled={providers.length === 0}
                  title={providers.length === 0 ? 'Add a provider first' : undefined}
                  onClick={() => {
                    const pid = modelForm.providerId || providers[0]?.id || ''
                    if (pid && pid !== modelForm.providerId) setModelForm((f) => ({ ...f, providerId: pid }))
                    setShowModelForm(true)
                  }}
                >
                  <IconPlus size={15} /> Add
                </button>
              </div>

              {models.length === 0 && (
                <div className="empty" style={{ padding: '36px 12px' }}>
                  <h2>No models yet</h2>
                  <p>Add a model like <code>minimax-ai/minimax-m3</code> under one of your providers.</p>
                </div>
              )}

              {Object.entries(grouped).map(([providerName, entries]) => (
                <div key={providerName}>
                  <div className="group-label">{providerName}</div>
                  {entries.map((m) => (
                    <div key={m.id} className="model-row">
                      <span className="model-id">
                        {m.displayName || m.model}
                        {m.displayName && m.displayName !== m.model && (
                          <small style={{ color: 'var(--text-faint)', marginLeft: 6 }}>{m.model}</small>
                        )}
                        {m.maxTokens && (
                          <small style={{ color: 'var(--text-faint)', marginLeft: 6 }}>({m.maxTokens.toLocaleString()} tokens)</small>
                        )}
                        {m.systemPrompt && (
                          <small style={{ color: 'var(--text-faint)', marginLeft: 6 }}>(custom prompt)</small>
                        )}
                      </span>
                      <span style={{ display: 'inline-flex', gap: 4 }}>
                        <button
                          className="icon-btn"
                          style={{ width: 28, height: 28 }}
                          aria-label={`Edit ${m.model}`}
                          onClick={() => { setModelEdit({ ...m }); setError(null) }}
                        >
                          <IconPencil size={14} />
                        </button>
                        <button
                          className="icon-btn"
                          style={{ width: 28, height: 28, color: '#ef4444' }}
                          aria-label={`Remove ${m.model}`}
                          onClick={() => removeModel(m)}
                        >
                          <IconTrash size={14} />
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </>
          ) : null}

          {tab === 'prompt' && (
            <div className="inline-form" style={{ marginTop: 0 }}>
              <h4>System prompt (global)</h4>
              <p className="hint" style={{ marginTop: 2, marginBottom: 10 }}>
                The personality and behavior instructions sent to every model. Per-model prompts (set in the
                Models tab) override this. Leave blank to use KS Agent's built-in default — recommended for
                strong models. Weaker/small models (e.g. meta/muse-glimmer-30b) often work much better with a
                clearer, custom prompt imported here.
              </p>
              <textarea
                className="input"
                rows={10}
                placeholder="You are KS Agent, a precise coding assistant…"
                value={systemDraft}
                onChange={(e) => setSystemDraft(e.target.value)}
              />
              <div className="dialog-actions">
                <button
                  className="btn btn-primary"
                  onClick={submitSystemPrompt}
                  disabled={systemDraft.trim() === systemPrompt}
                >
                  Save
                </button>
              </div>

              <h4 style={{ marginTop: 24 }}>Plan prompt</h4>
              <p className="hint" style={{ marginTop: 2, marginBottom: 10 }}>
                Instructions for the agent when it plans and executes work (creating plan steps, using tools,
                marking them complete). Leave blank to use the built-in default.
              </p>
              <textarea
                className="input"
                rows={10}
                placeholder="You are working in PLAN mode…"
                value={planDraft}
                onChange={(e) => setPlanDraft(e.target.value)}
              />
              <div className="dialog-actions">
                <button
                  className="btn btn-primary"
                  onClick={submitPlanPrompt}
                  disabled={planDraft.trim() === planPrompt}
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {retryDraft && tab === 'retry' && (
            <div className="inline-form" style={{ marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4>Retry behavior</h4>
                <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={resetRetryDefaults}>
                  <IconRotate size={14} /> Reset to defaults
                </button>
              </div>
              <p className="hint" style={{ marginBottom: 16 }}>
                Configure how KS Agent handles temporary provider errors. When retry is enabled it will respect the delay below.
              </p>

              <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <input
                  type="checkbox"
                  checked={retryDraft.enabled}
                  onChange={(e) => setRetryDraft({ ...retryDraft!, enabled: e.target.checked })}
                />
                Enable automatic retries
              </label>

              <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <input
                  type="checkbox"
                  checked={!!retryDraft.alwaysRetry}
                  onChange={(e) => setRetryDraft({ ...retryDraft!, alwaysRetry: e.target.checked })}
                />
                Retry always — retry on any error (ignores retryOn codes, but 4xx stop codes still apply except for capacity/timeout)
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="field-label">Max retries</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="numeric"
                    placeholder="0-1000"
                    value={maxRetriesInput}
                    onChange={(e) => {
                      const raw = e.target.value
                      // allow typing: keep raw, only update draft if numeric or empty
                      setMaxRetriesInput(raw)
                      if (raw === '') {
                        setRetryDraft({ ...retryDraft!, maxRetries: 0 })
                      } else {
                        const n = parseInt(raw, 10)
                        if (!Number.isNaN(n)) setRetryDraft({ ...retryDraft!, maxRetries: Math.max(0, Math.min(1000, n)) })
                      }
                    }}
                    onBlur={() => {
                      const n = Math.max(0, Math.min(1000, parseInt(maxRetriesInput, 10) || 0))
                      setMaxRetriesInput(String(n))
                      setRetryDraft({ ...retryDraft!, maxRetries: n })
                    }}
                  />
                </div>
                <div>
                  <label className="field-label">Base delay (ms)</label>
                  <input
                    className="input"
                    type="text"
                    inputMode="numeric"
                    placeholder="100-60000"
                    value={baseDelayInput}
                    onChange={(e) => {
                      const raw = e.target.value
                      setBaseDelayInput(raw)
                      if (raw === '') {
                        // keep draft as-is while typing empty
                      } else {
                        const n = parseInt(raw, 10)
                        if (!Number.isNaN(n)) setRetryDraft({ ...retryDraft!, baseDelayMs: n })
                      }
                    }}
                    onBlur={() => {
                      const n = Math.max(100, Math.min(60000, parseInt(baseDelayInput, 10) || 100))
                      setBaseDelayInput(String(n))
                      setRetryDraft({ ...retryDraft!, baseDelayMs: n })
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="field-label">Max delay (ms)</label>
                <input
                  className="input"
                  type="text"
                  inputMode="numeric"
                  placeholder="1000-300000"
                  value={maxDelayInput}
                  onChange={(e) => {
                    const raw = e.target.value
                    setMaxDelayInput(raw)
                    if (raw === '') {
                    } else {
                      const n = parseInt(raw, 10)
                      if (!Number.isNaN(n)) setRetryDraft({ ...retryDraft!, maxDelayMs: n })
                    }
                  }}
                  onBlur={() => {
                    const n = Math.max(1000, Math.min(300000, parseInt(maxDelayInput, 10) || 1000))
                    setMaxDelayInput(String(n))
                    setRetryDraft({ ...retryDraft!, maxDelayMs: n })
                  }}
                />
                <p className="hint" style={{ marginTop: 4 }}>Delay between retries (exponential backoff, capped by max delay).</p>
              </div>

              {!retryDraft.alwaysRetry && (
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label">Retry on status codes (comma-separated)</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="e.g. 429, 503, 502"
                    value={retryOnInput}
                    onChange={(e) => {
                      const raw = e.target.value
                      setRetryOnInput(raw)
                      // update draft live but don't lose typing: parse what we can
                      const codes = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n >= 100 && n < 600)
                      setRetryDraft({ ...retryDraft!, retryOnStatusCodes: codes })
                    }}
                    onBlur={() => {
                      const codes = retryOnInput.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n >= 100 && n < 600)
                      setRetryOnInput(codes.join(', '))
                      setRetryDraft({ ...retryDraft!, retryOnStatusCodes: codes })
                    }}
                  />
                  <p className="hint" style={{ marginTop: 4 }}>
                    HTTP status codes that should trigger a retry (e.g., 429 Too Many Requests, 503 Service Unavailable). When “Retry always” is on, this is ignored.
                  </p>
                </div>
              )}

              {retryDraft.alwaysRetry && (
                <p className="hint" style={{ marginBottom: 16, color: 'var(--text-dim)' }}>
                  “Retry always” is on — the agent will retry on any error up to Max retries, using the delay above. RetryOn codes are ignored, but 4xx stop codes (400/401/403/404) still fail fast unless the error is a capacity/timeout.
                </p>
              )}

              <div className="dialog-actions">
                <button
                  className="btn btn-primary"
                  onClick={submitRetrySettings}
                  disabled={
                    !retrySettings ||
                    (retryDraft.enabled === retrySettings.enabled &&
                    !!retryDraft.alwaysRetry === !!retrySettings.alwaysRetry &&
                    retryDraft.maxRetries === retrySettings.maxRetries &&
                    retryDraft.baseDelayMs === retrySettings.baseDelayMs &&
                    retryDraft.maxDelayMs === retrySettings.maxDelayMs &&
                    JSON.stringify([...retryDraft.retryOnStatusCodes].sort((a,b)=>a-b)) === JSON.stringify([...retrySettings.retryOnStatusCodes].sort((a,b)=>a-b)) &&
                    JSON.stringify([...retryDraft.stopOnStatusCodes].sort((a,b)=>a-b)) === JSON.stringify([...retrySettings.stopOnStatusCodes].sort((a,b)=>a-b)))
                  }
                >
                  Save
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
