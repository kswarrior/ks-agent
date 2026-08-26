import { useEffect, useState } from 'react'
import * as api from '../api'
import type { ModelEntry, Provider } from '../types'
import { useDialogs } from '../dialogs'
import { useToast } from '../toast'
import { IconPencil, IconPlus, IconTrash, IconX } from '../icons'

interface Props {
  open: boolean
  onClose: () => void
  onDataChanged: () => void
}

type Tab = 'providers' | 'models'

interface ProviderForm {
  editingId: string | null
  name: string
  baseUrl: string
  apiKey: string
}

const emptyProviderForm: ProviderForm = { editingId: null, name: '', baseUrl: '', apiKey: '' }

export function SettingsModal({ open, onClose, onDataChanged }: Props) {
  const [tab, setTab] = useState<Tab>('providers')
  const [providers, setProviders] = useState<Provider[]>([])
  const [models, setModels] = useState<ModelEntry[]>([])
  const [providerForm, setProviderForm] = useState<ProviderForm | null>(null)
  const [showModelForm, setShowModelForm] = useState(false)
  const [modelForm, setModelForm] = useState({ providerId: '', model: '' })
  const [error, setError] = useState<string | null>(null)
  const confirm = useDialogs().confirm
  const toast = useToast()

  useEffect(() => {
    if (open) {
      refresh()
      setProviderForm(null)
      setShowModelForm(false)
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

  if (!open) return null

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
      await api.createModel({ providerId: modelForm.providerId, model: modelForm.model.trim() })
      setModelForm({ providerId: '', model: '' })
      setShowModelForm(false)
      toast('Model added', 'success')
      await refresh()
      onDataChanged()
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

        <div className="tabs">
          <button className={`tab${tab === 'providers' ? ' active' : ''}`} onClick={() => { setTab('providers'); setError(null) }}>
            Providers
          </button>
          <button className={`tab${tab === 'models' ? ' active' : ''}`} onClick={() => { setTab('models'); setError(null) }}>
            Models
          </button>
        </div>

        <div className="tab-body">
          {error && <p className="field-error" style={{ marginBottom: 10 }}>{error}</p>}

          {tab === 'providers' && (
            <>
              <div className="list-head">
                <h3>Providers ({providers.length})</h3>
                <button
                  className="btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => setProviderForm(emptyProviderForm)}
                >
                  <IconPlus size={15} /> Add
                </button>
              </div>

              {providers.length === 0 && !providerForm && (
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

              {providerForm && (
                <div className="inline-form">
                  <h4>{providerForm.editingId ? 'Edit provider' : 'New provider'}</h4>
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
              )}
            </>
          )}

          {tab === 'models' && (
            <>
              <div className="list-head">
                <h3>Models ({models.length})</h3>
                <button
                  className="btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  disabled={providers.length === 0}
                  title={providers.length === 0 ? 'Add a provider first' : undefined}
                  onClick={() => {
                    setShowModelForm(true)
                    if (!modelForm.providerId && providers[0]) setModelForm((f) => ({ ...f, providerId: providers[0].id }))
                  }}
                >
                  <IconPlus size={15} /> Add
                </button>
              </div>

              {models.length === 0 && !showModelForm && (
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
                      <span className="model-id">{m.model}</span>
                      <button
                        className="icon-btn"
                        style={{ width: 28, height: 28, color: '#ef4444' }}
                        aria-label={`Remove ${m.model}`}
                        onClick={() => removeModel(m)}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}

              {showModelForm && (
                <div className="inline-form">
                  <h4>New model</h4>
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
                  <div className="dialog-actions">
                    <button className="btn" onClick={() => { setShowModelForm(false); setError(null) }}>
                      Cancel
                    </button>
                    <button className="btn btn-primary" onClick={submitModel}>
                      Add model
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
