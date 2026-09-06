import { useState, useEffect } from 'react'
import * as api from '../api'
import type { Project, Provider, ModelEntry } from '../types'
import { IconX, IconChevronRight, IconChevronLeft, IconCheck, IconSparkles, IconPlus } from '../icons'
import { useToast } from '../toast'

interface Props {
  open: boolean
  onClose: () => void
  projects: Project[]
  providers: Provider[]
  models: ModelEntry[]
  onProjectCreated: (p: Project) => void
  onProviderModelCreated: () => void
}

type Step = 0 | 1 | 2 | 3

const LS_DISMISSED = 'ks.onboarding.dismissed'

const PRESETS: { name: string; baseUrl: string; models: string[]; needsKey: boolean; hint: string }[] = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', models: ['gpt-4o-mini', 'gpt-4o'], needsKey: true, hint: 'Get key at platform.openai.com' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-reasoner'], needsKey: true, hint: 'Cheapest frontier — api.deepseek.com' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'], needsKey: true, hint: 'One key for 100+ models' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'], needsKey: true, hint: 'Fast inference — console.groq.com' },
  { name: 'Together', baseUrl: 'https://api.together.xyz/v1', models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'], needsKey: true, hint: 'together.ai' },
  { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', models: ['mistral-large-latest', 'mistral-small-latest'], needsKey: true, hint: 'console.mistral.ai' },
  { name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1', models: ['llama3.2', 'qwen2.5', 'mistral'], needsKey: false, hint: 'No key — runs offline on your machine' },
]

export function shouldAutoShowOnboarding(projects: Project[], providers: Provider[], models: ModelEntry[]): boolean {
  try {
    if (localStorage.getItem(LS_DISMISSED) === '1') return false
  } catch {}
  if (projects.length === 0) return true
  if (providers.length === 0) return true
  if (models.length === 0) return true
  return false
}

export function dismissOnboarding(): void {
  try { localStorage.setItem(LS_DISMISSED, '1') } catch {}
}

export function OnboardingWizard({ open, onClose, projects, providers, models, onProjectCreated, onProviderModelCreated }: Props) {
  const toast = useToast()
  const [step, setStep] = useState<Step>(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projName, setProjName] = useState('my-project')
  const [projPath, setProjPath] = useState('my-project')
  const [projMkdir, setProjMkdir] = useState(true)
  const [presetIdx, setPresetIdx] = useState<number>(1)
  const [apiKey, setApiKey] = useState('')
  const [modelId, setModelId] = useState(PRESETS[1].models[0])
  const [displayName, setDisplayName] = useState('')
  const preset = PRESETS[presetIdx]

  useEffect(() => {
    if (!open) return
    setError(null)
    setModelId(PRESETS[presetIdx].models[0])
  }, [open, presetIdx])

  useEffect(() => {
    if (!open) return
    if (projects.length === 0) setStep(0)
    else if (providers.length === 0 || models.length === 0) setStep(2)
    else setStep(0)
  }, [open, projects.length, providers.length, models.length])

  useEffect(() => {
    setModelId(PRESETS[presetIdx].models[0])
  }, [presetIdx])

  if (!open) return null

  const hasProject = projects.length > 0
  const hasProvider = providers.length > 0
  const hasModel = models.length > 0
  const allDone = hasProject && hasProvider && hasModel

  const resolvedPreview = (() => {
    const p = projPath.trim()
    if (!p) return ''
    if (p.startsWith('/') || p.startsWith('~/') || p === '~') return p
    if (p === 'project' || p.startsWith('project/')) return p
    return `project/${p.replace(/^\.\//, '')}`
  })()

  async function handleCreateProject() {
    setError(null)
    if (!projName.trim()) return setError('Project name is required')
    if (!projPath.trim()) return setError('Project path is required')
    setBusy(true)
    try {
      const project = await api.createProject({ name: projName.trim(), path: projPath.trim(), mkdir: projMkdir })
      toast(`Project "${project.name}" created`, 'success')
      onProjectCreated(project)
      setStep(2)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleCreateProviderModel() {
    setError(null)
    if (preset.needsKey && !apiKey.trim()) return setError('API key is required for ' + preset.name)
    if (!modelId.trim()) return setError('Model id is required')
    const keyToSend = apiKey.trim()
    if (preset.needsKey && !keyToSend) return setError('API key is required for ' + preset.name)
    setBusy(true)
    try {
      const provider = await api.createProvider({ name: preset.name, baseUrl: preset.baseUrl, apiKey: keyToSend })
      await api.createModel({
        providerId: provider.id,
        model: modelId.trim(),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
      })
      toast(`Provider + model ready — ${preset.name} · ${modelId.trim()}`, 'success')
      onProviderModelCreated()
      setStep(3)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function handleDismiss() {
    dismissOnboarding()
    onClose()
  }

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className="wizard" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Quick Setup wizard">
        <div className="wizard-head">
          <div className="wizard-brand">
            <span className="wizard-logo">KS</span>
            <span className="wizard-title">Quick Setup — 60 seconds to first chat</span>
          </div>
          <button className="icon-btn" aria-label="Close wizard" onClick={onClose}>
            <IconX size={18} />
          </button>
        </div>

        <div className="wizard-steps" aria-label="Progress">
          {(['Welcome', 'Project', 'Model', 'Done'] as const).map((label, idx) => {
            const active = idx === step
            const done = (idx === 1 && hasProject) || (idx === 2 && hasProvider && hasModel) || idx < step || (idx === 3 && allDone)
            return (
              <div key={label} className={`wiz-step${active ? ' active' : ''}${done ? ' done' : ''}`}>
                <span className="wiz-dot">{done ? <IconCheck size={12} /> : idx + 1}</span>
                <span className="wiz-label">{label}</span>
                {idx < 3 && <span className="wiz-line" />}
              </div>
            )
          })}
        </div>

        <div className="wizard-body">
          {error && <p className="field-error" style={{ marginBottom: 12 }}>{error}</p>}

          {step === 0 && (
            <div className="wiz-panel">
              <div className="wiz-hero">
                <div className="wiz-hero-icon"><IconSparkles size={28} /></div>
                <h2 className="wiz-hero-title">Install → first chat in 60 seconds</h2>
                <p className="wiz-hero-sub">KS Agent beats Cursor on onboarding: no IDE install, no login, just paste a key and chat — even from your phone.</p>
              </div>
              <div className="wiz-cards">
                <div className="wiz-card">
                  <span className="wiz-card-num">1</span>
                  <div className="wiz-card-body">
                    <strong>Project</strong>
                    <span>{hasProject ? '✓ Ready — ' + projects[0].name : 'Create your workspace folder'}</span>
                  </div>
                  {hasProject && <IconCheck size={16} style={{ color: '#22c55e' }} />}
                </div>
                <div className="wiz-card">
                  <span className="wiz-card-num">2</span>
                  <div className="wiz-card-body">
                    <strong>Provider + Model</strong>
                    <span>{hasProvider && hasModel ? `✓ ${providers[0].name} · ${models[0].model}` : 'Pick preset, paste key, choose model — one click'}</span>
                  </div>
                  {hasProvider && hasModel && <IconCheck size={16} style={{ color: '#22c55e' }} />}
                </div>
                <div className="wiz-card">
                  <span className="wiz-card-num">3</span>
                  <div className="wiz-card-body">
                    <strong>Chat</strong>
                    <span>Send your first message — streaming, plans, preview live</span>
                  </div>
                </div>
              </div>
              <div className="wizard-actions">
                <button className="btn" onClick={handleDismiss}>Skip</button>
                <button className="btn btn-primary" onClick={() => setStep(hasProject ? 2 : 1)}>
                  {allDone ? 'Open chat' : 'Start Quick Setup'} <IconChevronRight size={16} />
                </button>
              </div>
              <p className="hint" style={{ marginTop: 12, textAlign: 'center' }}>
                Takes ~30s with Ollama (no key) or ~60s with any API. You can also open <code>Settings → Quick Setup</code> anytime.
              </p>
            </div>
          )}

          {step === 1 && (
            <div className="wiz-panel">
              <h3 className="wiz-section-title">Create your first project</h3>
              <p className="hint" style={{ marginTop: 0, marginBottom: 14 }}>Your agent works strictly inside this folder. You can add more projects later.</p>

              {hasProject && (
                <div style={{ padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-dim)' }}>Existing projects: </span>
                  <strong>{projects.map(p => p.name).join(', ')}</strong>
                  <span style={{ color: 'var(--text-faint)', marginLeft: 8 }}>— you can skip or make another</span>
                </div>
              )}

              <label className="field-label">Name</label>
              <input className="input" placeholder="my-project" value={projName} onChange={(e) => setProjName(e.target.value)} />

              <label className="field-label">Path</label>
              <input
                className="input"
                placeholder="my-project  or  /my-project"
                value={projPath}
                onChange={(e) => setProjPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !busy && handleCreateProject()}
              />
              <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Relative: <code>my-project</code> → <code>project/my-project</code></div>
              {resolvedPreview && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>→ <code>{resolvedPreview}</code></div>}

              <label className="checkbox-row">
                <input type="checkbox" checked={projMkdir} onChange={(e) => setProjMkdir(e.target.checked)} />
                Create directory if it does not exist
              </label>

              <div className="wizard-actions">
                <button className="btn" onClick={() => setStep(0)} disabled={busy}>
                  <IconChevronLeft size={16} /> Back
                </button>
                <button className="btn" onClick={() => setStep(2)} disabled={busy}>
                  Skip
                </button>
                <button className="btn btn-primary" onClick={handleCreateProject} disabled={busy}>
                  {busy ? 'Creating…' : hasProject ? 'Create another' : 'Create project'} <IconPlus size={15} />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wiz-panel">
              <h3 className="wiz-section-title">Add provider + model — one step</h3>
              <p className="hint" style={{ marginTop: 0, marginBottom: 12 }}>Pick a preset, paste your key, choose a model. This creates both at once — beats Cursor’s multi-step flow.</p>

              {hasProvider && hasModel && (
                <div style={{ padding: '10px 12px', background: '#0a1a0a', border: '1px solid #1a3a1a', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                  <span style={{ color: '#86efac' }}>✓ Already configured: </span>
                  <strong style={{ color: '#dcfce7' }}>{providers[0].name} · {models[0].model}</strong>
                  <span style={{ color: '#6b7280', marginLeft: 8 }}>— add another or skip</span>
                </div>
              )}

              <div className="preset-grid" style={{ marginBottom: 14 }}>
                {PRESETS.map((pr, idx) => (
                  <button
                    key={pr.name}
                    type="button"
                    className={`preset-card${presetIdx === idx ? ' active' : ''}`}
                    onClick={() => setPresetIdx(idx)}
                    style={presetIdx === idx ? { borderColor: 'var(--primary)', background: 'var(--primary-bg)' } : undefined}
                  >
                    <span className="preset-name">{pr.name}{!pr.needsKey && <span style={{ fontWeight: 400, fontSize: 11, color: 'var(--text-faint)', marginLeft: 6 }}>no key</span>}</span>
                    <span className="preset-url">{pr.baseUrl}</span>
                    <span className="hint" style={{ marginTop: 2 }}>{pr.hint}</span>
                  </button>
                ))}
              </div>

              <label className="field-label">API key {preset.needsKey ? '' : <span style={{ fontWeight: 400 }}>(leave blank for Ollama)</span>}</label>
              <input
                className="input"
                type="password"
                placeholder={preset.needsKey ? 'sk-…' : 'ollama (no key needed)'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <p className="hint" style={{ marginTop: 4 }}>{preset.hint} — key stays server-side, never sent to client</p>

              <label className="field-label">Model id</label>
              <input
                className="input"
                placeholder={preset.models[0]}
                value={modelId}
                onChange={(e) => setModelId(e.target.value)}
                list="wiz-model-suggestions"
                onKeyDown={(e) => e.key === 'Enter' && !busy && handleCreateProviderModel()}
              />
              <datalist id="wiz-model-suggestions">
                {preset.models.map((m) => <option key={m} value={m} />)}
              </datalist>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {preset.models.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className="btn"
                    style={{ padding: '4px 8px', fontSize: 12, background: modelId === m ? 'var(--primary-bg)' : undefined, borderColor: modelId === m ? 'var(--primary-border)' : undefined, color: modelId === m ? 'var(--primary)' : undefined }}
                    onClick={() => setModelId(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <label className="field-label">Display name <span style={{ fontWeight: 400 }}>(optional)</span></label>
              <input className="input" placeholder="e.g. DeepSeek Chat (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />

              <div className="wizard-actions">
                <button className="btn" onClick={() => setStep(hasProject ? 0 : 1)} disabled={busy}>
                  <IconChevronLeft size={16} /> Back
                </button>
                {hasProvider && hasModel && (
                  <button className="btn" onClick={() => setStep(3)} disabled={busy}>
                    Skip
                  </button>
                )}
                <button className="btn btn-primary" onClick={handleCreateProviderModel} disabled={busy}>
                  {busy ? 'Creating…' : 'Create & Continue'} <IconChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="wiz-panel" style={{ textAlign: 'center' }}>
              <div className="wiz-hero-icon" style={{ margin: '0 auto 14px', background: '#dcfce7', borderColor: '#86efac', color: '#16a34a' }}>
                <IconCheck size={28} />
              </div>
              <h3 className="wiz-section-title" style={{ textAlign: 'center' }}>You’re ready!</h3>
              <p className="hint" style={{ textAlign: 'center', marginBottom: 16 }}>
                {hasProject && hasProvider && hasModel ? 'Project, provider, and model are configured. Pick the model in the composer and send your first message.' : 'Setup saved. You can add more in Settings anytime.'}
              </p>
              <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 8, alignItems: 'stretch', minWidth: 260, textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-faint)' }}>Project</span>
                  <strong>{projects[0]?.name ?? projName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-faint)' }}>Provider</span>
                  <strong>{providers[0]?.name ?? preset.name}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-faint)' }}>Model</span>
                  <strong style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{models[0]?.model ?? modelId}</strong>
                </div>
              </div>
              <div className="wizard-actions" style={{ justifyContent: 'center' }}>
                <button className="btn btn-primary" onClick={() => { dismissOnboarding(); onClose() }} style={{ padding: '10px 22px', fontSize: 15 }}>
                  Start chatting <IconChevronRight size={16} />
                </button>
              </div>
              <p className="hint" style={{ textAlign: 'center', marginTop: 10 }}>
                Tip: try <code>“build a todo app”</code> and watch plan → preview live.
              </p>
            </div>
          )}
        </div>

        <div className="wizard-foot">
          <span className="hint" style={{ margin: 0 }}>
            {step === 0 ? 'No signup — self-hosted, keys never leave your server' : step === 2 ? 'Keys are masked and stored server-side only' : ''}
          </span>
          <button className="btn" style={{ padding: '6px 10px', fontSize: 12 }} onClick={handleDismiss}>
            Don’t show again
          </button>
        </div>
      </div>
    </div>
  )
}
