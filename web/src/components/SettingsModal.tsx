import { useEffect, useRef, useState } from 'react'
import * as api from '../api'
import type { ModelEntry, Provider, RetrySettings, ThemeSettings } from '../types'
import { useDialogs } from '../dialogs'
import { useToast } from '../toast'
import { IconChevronLeft, IconPencil, IconPlus, IconTrash, IconX, IconRotate } from '../icons'
import { applyTheme, DEFAULT_THEME } from '../theme'

interface Props {
  open: boolean
  onClose: () => void
  onDataChanged: () => void
}

type Tab = 'providers' | 'models' | 'prompt' | 'retry' | 'theme' | 'github'

const THEME_PRESETS: { name: string; primary: string; danger?: string; background?: string }[] = [
  { name: 'Blue', primary: '#2563eb' },
  { name: 'Emerald', primary: '#059669' },
  { name: 'Violet', primary: '#7c3aed' },
  { name: 'Rose', primary: '#e11d48' },
  { name: 'Amber', primary: '#d97706' },
  { name: 'Cyan', primary: '#0891b2' },
  { name: 'Slate', primary: '#475569' },
  { name: 'Teal', primary: '#0d9488' }
]

const PROVIDER_PRESETS = [
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1' },
  { name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1' },
  { name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1' },
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1' },
  { name: 'Together', baseUrl: 'https://api.together.xyz/v1' },
  { name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1' },
  { name: 'NVIDIA', baseUrl: 'https://integrate.api.nvidia.com/v1' },
  { name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1' },
  { name: 'LM Studio (local)', baseUrl: 'http://localhost:1234/v1' },
  { name: 'vLLM (local)', baseUrl: 'http://localhost:8000/v1' }
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
  const [autoDelayInput, setAutoDelayInput] = useState('')
  const [autoMaxInput, setAutoMaxInput] = useState('')
  const [themeSettings, setThemeSettings] = useState<ThemeSettings | null>(null)
  const [themeDraft, setThemeDraft] = useState<ThemeSettings | null>(null)
  const [themePrimaryInput, setThemePrimaryInput] = useState('')
  const [themeDangerInput, setThemeDangerInput] = useState('')
  const [themeBgInput, setThemeBgInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  // GitHub PAT + polling state — store.ts:214 kv "githubToken" + github_tokens, index.ts:236 masked, store.ts:277 chmod 600
  const [githubTokenInput, setGithubTokenInput] = useState('')
  const [githubMasked, setGithubMasked] = useState('')
  const [githubHasToken, setGithubHasToken] = useState(false)
  const [githubProjectId, setGithubProjectId] = useState('')
  const [githubBusy, setGithubBusy] = useState(false)
  const [githubTestResult, setGithubTestResult] = useState<string | null>(null)
  const [githubPoll, setGithubPoll] = useState<import('../types').GithubPollSettings | null>(null)
  const [githubPollDraft, setGithubPollDraft] = useState<import('../types').GithubPollSettings | null>(null)
  const [githubPollProjectId, setGithubPollProjectId] = useState('')
  const [githubRate, setGithubRate] = useState<import('../types').GithubRateLimit | null>(null)
  const [githubPollBusy, setGithubPollBusy] = useState(false)
  const [githubCustomMs, setGithubCustomMs] = useState('')
  const [githubCronInput, setGithubCronInput] = useState('')
  const [githubProjects, setGithubProjects] = useState<import('../types').Project[]>([])
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
      loadThemeSettings()
      loadGithubSettings()
      loadGithubProjects()
      setProviderForm(null)
      setProviderPicker(false)
      setShowModelForm(false)
      setModelEdit(null)
      setError(null)
      setGithubTestResult(null)
      setTab('providers')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Live panel: GET /api/projects/:id/github/rate-limit → {remaining, resetAt, effectiveIntervalMs, nextPollAt, etagHitRate} polled every 10s
  useEffect(() => {
    if (!open || !githubPollProjectId) return
    let alive = true
    const tick = async () => {
      try {
        const rate = await api.getGithubRateLimit(githubPollProjectId)
        if (alive) setGithubRate(rate)
      } catch {}
    }
    tick()
    const iv = setInterval(tick, 10000)
    return () => { alive = false; clearInterval(iv) }
  }, [open, githubPollProjectId])

  // chromium focused/blur pauses — notify backend when window focus changes if pollOnFocusOnly/pauseOnWindowBlur
  useEffect(() => {
    if (!open || !githubPollProjectId) return
    const onFocus = () => { api.setGithubFocus(githubPollProjectId, document.hasFocus(), document.hasFocus()).catch(()=>{}) }
    const onBlur = () => { api.setGithubFocus(githubPollProjectId, document.hasFocus(), document.hasFocus()).catch(()=>{}) }
    const onVis = () => { api.setGithubFocus(githubPollProjectId, !document.hidden, document.hasFocus()).catch(()=>{}) }
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    document.addEventListener('visibilitychange', onVis)
    // initial
    api.setGithubFocus(githubPollProjectId, !document.hidden, document.hasFocus()).catch(()=>{})
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [open, githubPollProjectId])

  useEffect(() => { if (open) loadGithubSettings(githubProjectId || undefined) }, [githubProjectId])
  useEffect(() => {
    if (!open) return
    const pid = githubPollProjectId || undefined
    api.getGithubPollSettings(pid).then(p=>{
      setGithubPoll(p)
      setGithubPollDraft({ ...p })
      setGithubCustomMs(String(p.intervalMs))
      setGithubCronInput(p.cronExpr || '')
    }).catch(()=>{})
    if (pid) api.getGithubRateLimit(pid).then(setGithubRate).catch(()=>{})
  }, [githubPollProjectId])

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
      // migrate defaults for new fields (old DBs)
      const merged: RetrySettings = {
        autoContinueEnabled: false,
        autoContinueDelayMs: 1500,
        autoContinueMaxAttempts: 5,
        autoContinueOnPlanIncomplete: true,
        ...settings,
      }
      setRetrySettings(merged)
      setRetryDraft({ ...merged })
      setMaxRetriesInput(String(merged.maxRetries))
      setBaseDelayInput(String(merged.baseDelayMs))
      setMaxDelayInput(String(merged.maxDelayMs))
      setRetryOnInput(merged.retryOnStatusCodes.join(', '))
      setStopOnInput(merged.stopOnStatusCodes.join(', '))
      setAutoDelayInput(String(merged.autoContinueDelayMs ?? 1500))
      setAutoMaxInput(String(merged.autoContinueMaxAttempts ?? 5))
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function loadThemeSettings() {
    try {
      const t = await api.getThemeSettings()
      setThemeSettings(t)
      setThemeDraft({ ...t })
      setThemePrimaryInput(t.primary)
      setThemeDangerInput(t.danger)
      setThemeBgInput(t.background)
      applyTheme(t)
    } catch (e: any) {
      toast(e.message, 'error')
    }
  }

  async function submitThemeSettings() {
    if (!themeDraft) return
    setError(null)
    const primary = themePrimaryInput.trim().toLowerCase()
    const danger = themeDangerInput.trim().toLowerCase()
    const background = themeBgInput.trim().toLowerCase()
    if (!/^#[0-9a-f]{6}$/.test(primary)) return setError('Primary must be hex like #2563eb')
    if (!/^#[0-9a-f]{6}$/.test(danger)) return setError('Danger must be hex like #dc2626')
    if (!/^#[0-9a-f]{6}$/.test(background)) return setError('Background must be hex like #ffffff')
    const toSave: ThemeSettings = {
      primary,
      danger,
      background,
      radius: themeDraft.radius
    }
    try {
      const saved = await api.updateThemeSettings(toSave)
      setThemeSettings(saved)
      setThemeDraft({ ...saved })
      setThemePrimaryInput(saved.primary)
      setThemeDangerInput(saved.danger)
      setThemeBgInput(saved.background)
      applyTheme(saved)
      toast('Theme saved', 'success')
    } catch (e: any) {
      setError(e.message)
    }
  }

  function resetThemeDefaults() {
    const d = { ...DEFAULT_THEME }
    setThemeDraft(d)
    setThemePrimaryInput(d.primary)
    setThemeDangerInput(d.danger)
    setThemeBgInput(d.background)
    applyTheme(d)
  }

  async function loadGithubSettings(projectId?: string) {
    try {
      const info = await api.getGithubSettings(projectId || undefined)
      setGithubMasked(info.masked || info.keyPreview || '')
      setGithubHasToken(!!info.hasToken)
      // also load poll settings
      const poll = await api.getGithubPollSettings(projectId || undefined)
      setGithubPoll(poll)
      setGithubPollDraft({ ...poll })
      setGithubCustomMs(String(poll.intervalMs))
      setGithubCronInput(poll.cronExpr || '')
      // load rate limit if project selected
      if (projectId) {
        try {
          const rate = await api.getGithubRateLimit(projectId)
          setGithubRate(rate)
        } catch {}
      } else {
        setGithubRate(null)
      }
    } catch (e:any) { toast(e.message, 'error') }
  }

  async function loadGithubProjects() {
    try {
      const ps = await api.listProjects()
      setGithubProjects(ps)
    } catch {}
  }

  async function submitGithubToken() {
    if (!githubTokenInput.trim()) return setError('GitHub token is required')
    setGithubBusy(true)
    setError(null)
    setGithubTestResult(null)
    try {
      const res = await api.saveGithubToken(githubTokenInput.trim(), githubProjectId || undefined)
      setGithubMasked(res.masked || res.keyPreview || '')
      setGithubHasToken(true)
      setGithubTokenInput('')
      toast('GitHub token saved', 'success')
      await loadGithubSettings(githubProjectId || undefined)
    } catch (e:any) { setError(e.message) } finally { setGithubBusy(false) }
  }

  async function testGithubToken() {
    setGithubBusy(true)
    setError(null)
    try {
      const toTest = githubTokenInput.trim() || undefined
      const res = await api.testGithubToken(toTest, githubProjectId || undefined)
      if (res.ok) {
        setGithubTestResult(`OK: ${res.user || 'authenticated'} remaining ${res.remaining ?? '?'}`)
        toast('GitHub token valid', 'success')
      } else {
        setGithubTestResult(`Failed: ${res.error || 'invalid'}`)
        setError(res.error || 'Test failed')
      }
    } catch (e:any) { setError(e.message); setGithubTestResult(`Error: ${e.message}`) } finally { setGithubBusy(false) }
  }

  async function submitGithubPoll() {
    if (!githubPollDraft) return
    setGithubPollBusy(true)
    setError(null)
    try {
      // validate intervalMs 5000-300000 already clamped
      const patch: any = {
        enabled: githubPollDraft.enabled,
        mode: githubPollDraft.mode,
        intervalMs: githubPollDraft.intervalMs,
        cronExpr: githubPollDraft.cronExpr,
        endpoints: githubPollDraft.endpoints,
        perEndpointInterval: githubPollDraft.perEndpointInterval,
        pollOnFocusOnly: githubPollDraft.pollOnFocusOnly,
        pauseOnWindowBlur: githubPollDraft.pauseOnWindowBlur,
        useEtag: githubPollDraft.useEtag,
        respectRateLimit: githubPollDraft.respectRateLimit,
        smartEventOnly: githubPollDraft.smartEventOnly,
        jitterMs: githubPollDraft.jitterMs,
        maxRetries: githubPollDraft.maxRetries,
        webhookUrl: (githubPollDraft as any).webhookUrl || null,
        projectId: githubPollProjectId || undefined
      }
      const updated = await api.updateGithubPollSettings(patch)
      setGithubPoll(updated)
      setGithubPollDraft({ ...updated })
      setGithubCustomMs(String(updated.intervalMs))
      setGithubCronInput(updated.cronExpr || '')
      toast('Poll settings saved', 'success')
      // refresh rate to show effectiveIntervalMs
      if (githubPollProjectId) {
        try { const rate = await api.getGithubRateLimit(githubPollProjectId); setGithubRate(rate) } catch {}
      }
    } catch (e:any) { setError(e.message) } finally { setGithubPollBusy(false) }
  }

  async function pollNowGithub() {
    if (!githubPollProjectId) return setError('Select a project for Poll now')
    try {
      await api.pollGithubNow(githubPollProjectId)
      toast('Polled now', 'success')
      try { const rate = await api.getGithubRateLimit(githubPollProjectId); setGithubRate(rate) } catch {}
    } catch (e:any) {
      if (String(e.message).includes('debounced')) toast('Poll debounced (5s)', 'error')
      else setError(e.message)
    }
  }

  async function pauseGithubPolling() {
    if (!githubPollDraft) return
    const nextEnabled = !githubPollDraft.enabled
    try {
      const updated = await api.updateGithubPollSettings({ enabled: nextEnabled, projectId: githubPollProjectId || undefined } as any)
      setGithubPoll(updated)
      setGithubPollDraft({ ...updated })
      toast(nextEnabled ? 'Polling resumed' : 'Polling paused', 'success')
    } catch (e:any) { setError(e.message) }
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
    const parsedAutoDelay = Math.max(300, Math.min(30000, parseInt(autoDelayInput, 10) || 1500))
    const parsedAutoMax = Math.max(0, Math.min(20, parseInt(autoMaxInput, 10) || 0))
    const parsedRetryOn = retryOnInput.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n >= 100 && n < 600)
    const parsedStopOn = stopOnInput.split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isInteger(n) && n >= 100 && n < 600)
    const toSave: RetrySettings = {
      ...retryDraft,
      maxRetries: parsedMaxRetries,
      baseDelayMs: parsedBaseDelay,
      maxDelayMs: parsedMaxDelay,
      autoContinueDelayMs: parsedAutoDelay,
      autoContinueMaxAttempts: parsedAutoMax,
      retryOnStatusCodes: parsedRetryOn,
      stopOnStatusCodes: parsedStopOn
    }
    try {
      const settings = await api.updateRetrySettings(toSave)
      const merged: RetrySettings = {
        autoContinueEnabled: false,
        autoContinueDelayMs: 1500,
        autoContinueMaxAttempts: 5,
        autoContinueOnPlanIncomplete: true,
        ...settings,
      }
      setRetrySettings(merged)
      setRetryDraft({ ...merged })
      setMaxRetriesInput(String(merged.maxRetries))
      setBaseDelayInput(String(merged.baseDelayMs))
      setMaxDelayInput(String(merged.maxDelayMs))
      setRetryOnInput(merged.retryOnStatusCodes.join(', '))
      setStopOnInput(merged.stopOnStatusCodes.join(', '))
      setAutoDelayInput(String(merged.autoContinueDelayMs ?? 1500))
      setAutoMaxInput(String(merged.autoContinueMaxAttempts ?? 5))
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
      alwaysRetry: false,
      autoContinueEnabled: false,
      autoContinueDelayMs: 1500,
      autoContinueMaxAttempts: 5,
      autoContinueOnPlanIncomplete: true
    }
    setRetryDraft(defaults)
    setMaxRetriesInput(String(defaults.maxRetries))
    setBaseDelayInput(String(defaults.baseDelayMs))
    setMaxDelayInput(String(defaults.maxDelayMs))
    setRetryOnInput(defaults.retryOnStatusCodes.join(', '))
    setStopOnInput(defaults.stopOnStatusCodes.join(', '))
    setAutoDelayInput(String(defaults.autoContinueDelayMs ?? 1500))
    setAutoMaxInput(String(defaults.autoContinueMaxAttempts ?? 5))
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
      // FIX: clearing the field should delete maxTokens (send null), not send 0 which fails validation.
      // Invalid numbers (<1 or NaN) should still be sent to trigger backend validation error.
      let maxTokensPayload: Record<string, unknown>
      if (parsed === undefined) {
        maxTokensPayload = { maxTokens: null }
      } else if (Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1) {
        maxTokensPayload = { maxTokens: Math.floor(parsed) }
      } else {
        maxTokensPayload = { maxTokens: parsed as unknown as number }
      }
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

  function handleClose() {
    // revert live preview if user closed without saving
    if (themeDraft && themeSettings) {
      const isDirty =
        themeDraft.primary !== themeSettings.primary ||
        themeDraft.danger !== themeSettings.danger ||
        themeDraft.background !== themeSettings.background ||
        themeDraft.radius !== themeSettings.radius
      if (isDirty) applyTheme(themeSettings)
    }
    onClose()
  }

  return (
    <div className="overlay" onMouseDown={handleClose}>
      <div className="modal-lg" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3 className="modal-title">Settings</h3>
          <button className="icon-btn" aria-label="Close settings" onClick={handleClose}>
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
          </button>
          <button
            className={`tab${tab === 'theme' ? ' active' : ''}`}
            onClick={(e) => {
              if (dragMovedRef.current) { dragMovedRef.current = false; return }
              setTab('theme')
              setError(null)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
            }}
          >
            Theme
          </button>
          <button
            className={`tab${tab === 'github' ? ' active' : ''}`}
            onClick={(e) => {
              if (dragMovedRef.current) { dragMovedRef.current = false; return }
              setTab('github')
              setError(null)
              loadGithubSettings(githubProjectId || undefined)
              loadGithubProjects()
              e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
            }}
          >
            GitHub
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
                Pick a provider to start with its base URL pre-filled. For local Ollama / LM Studio, no key needed — fully offline/air-gapped after install.
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
                <label className="field-label">API key {providerForm.editingId ? <span style={{ fontWeight: 400 }}>(leave blank to keep current)</span> : <span style={{ fontWeight: 400 }}>(leave blank for local Ollama / LM Studio — air-gapped)</span>}</label>
                <input
                  className="input"
                  type="password"
                  placeholder={providerForm.baseUrl.includes('localhost') || providerForm.baseUrl.includes('127.0.0.1') ? 'no key needed (local) — leave blank' : 'sk-… (leave blank for local Ollama/LM Studio)'}
                  value={providerForm.apiKey}
                  onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                />
                {(providerForm.baseUrl.includes('localhost') || providerForm.baseUrl.includes('127.0.0.1') || /ollama|lm studio/i.test(providerForm.name)) && <p className="hint" style={{ marginTop: 4 }}>Local endpoint — no internet required after model pull. Fully air-gapped, runs on LAN.</p>}
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

              <div style={{ borderTop: '1px solid var(--border)', margin: '18px 0 16px' }} />

              <h4 style={{ marginBottom: 6 }}>Auto-continue</h4>
              <p className="hint" style={{ marginBottom: 12 }}>
                Automatically resume when AI stops but the plan is not complete, or when AI finishes without marking plan steps as done. After auto-start AI will recheck and call tools to complete remaining steps.
              </p>

              <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <input
                  type="checkbox"
                  checked={!!retryDraft.autoContinueEnabled}
                  onChange={(e) => setRetryDraft({ ...retryDraft!, autoContinueEnabled: e.target.checked })}
                />
                Auto-start when AI stops &amp; plan not complete
              </label>

              <label className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, opacity: retryDraft.autoContinueEnabled ? 1 : 0.6 }}>
                <input
                  type="checkbox"
                  disabled={!retryDraft.autoContinueEnabled}
                  checked={retryDraft.autoContinueEnabled ? !!retryDraft.autoContinueOnPlanIncomplete : !!retryDraft.autoContinueOnPlanIncomplete}
                  onChange={(e) => setRetryDraft({ ...retryDraft!, autoContinueOnPlanIncomplete: e.target.checked })}
                />
                Also auto-start when AI says done but didn't call tool for complete steps (recheck &amp; call complete_plan_step)
              </label>

              {retryDraft.autoContinueEnabled && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  <div>
                    <label className="field-label">Auto delay (ms)</label>
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      placeholder="300-30000"
                      value={autoDelayInput}
                      onChange={(e) => {
                        const raw = e.target.value
                        setAutoDelayInput(raw)
                        if (raw === '') {
                        } else {
                          const n = parseInt(raw, 10)
                          if (!Number.isNaN(n)) setRetryDraft({ ...retryDraft!, autoContinueDelayMs: n })
                        }
                      }}
                      onBlur={() => {
                        const n = Math.max(300, Math.min(30000, parseInt(autoDelayInput, 10) || 1500))
                        setAutoDelayInput(String(n))
                        setRetryDraft({ ...retryDraft!, autoContinueDelayMs: n })
                      }}
                    />
                    <p className="hint" style={{ marginTop: 4 }}>Wait before auto-resume. 1500ms recommended.</p>
                  </div>
                  <div>
                    <label className="field-label">Max auto attempts</label>
                    <input
                      className="input"
                      type="text"
                      inputMode="numeric"
                      placeholder="0-20"
                      value={autoMaxInput}
                      onChange={(e) => {
                        const raw = e.target.value
                        setAutoMaxInput(raw)
                        if (raw === '') {
                          setRetryDraft({ ...retryDraft!, autoContinueMaxAttempts: 0 })
                        } else {
                          const n = parseInt(raw, 10)
                          if (!Number.isNaN(n)) setRetryDraft({ ...retryDraft!, autoContinueMaxAttempts: Math.max(0, Math.min(20, n)) })
                        }
                      }}
                      onBlur={() => {
                        const n = Math.max(0, Math.min(20, parseInt(autoMaxInput, 10) || 0))
                        setAutoMaxInput(String(n))
                        setRetryDraft({ ...retryDraft!, autoContinueMaxAttempts: n })
                      }}
                    />
                    <p className="hint" style={{ marginTop: 4 }}>0 = unlimited until plan done (capped at 20). 5 recommended.</p>
                  </div>
                </div>
              )}

              <div className="dialog-actions">
                <button
                  className="btn btn-primary"
                  onClick={submitRetrySettings}
                  disabled={
                    !retrySettings ||
                    (retryDraft.enabled === retrySettings.enabled &&
                    !!retryDraft.alwaysRetry === !!retrySettings.alwaysRetry &&
                    !!retryDraft.autoContinueEnabled === !!retrySettings.autoContinueEnabled &&
                    !!retryDraft.autoContinueOnPlanIncomplete === !!(retrySettings.autoContinueOnPlanIncomplete ?? true) &&
                    (retryDraft.autoContinueDelayMs ?? 1500) === (retrySettings.autoContinueDelayMs ?? 1500) &&
                    (retryDraft.autoContinueMaxAttempts ?? 5) === (retrySettings.autoContinueMaxAttempts ?? 5) &&
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

          {themeDraft && tab === 'theme' && (
            <div className="inline-form" style={{ marginTop: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h4>Theme & Colors</h4>
                <button className="btn" style={{ padding: '4px 10px', fontSize: 12 }} onClick={resetThemeDefaults}>
                  <IconRotate size={14} /> Reset to defaults
                </button>
              </div>
              <p className="hint" style={{ marginBottom: 16 }}>
                White theme with blue buttons is the default. Pick a preset or use the color pickers below. Changes preview live and are saved to the server.
              </p>

              <div className="group-label">Presets</div>
              <div className="preset-grid" style={{ marginBottom: 16 }}>
                {THEME_PRESETS.map((pr) => {
                  const isActive = themeDraft.primary.toLowerCase() === pr.primary.toLowerCase()
                  return (
                    <button
                      key={pr.name}
                      type="button"
                      className="preset-card"
                      style={{ borderColor: isActive ? pr.primary : undefined, boxShadow: isActive ? `0 0 0 2px ${pr.primary}22` : undefined, background: isActive ? `${pr.primary}08` : undefined }}
                      onClick={() => {
                        const next = { ...themeDraft, primary: pr.primary.toLowerCase() }
                        setThemeDraft(next)
                        setThemePrimaryInput(next.primary)
                        applyTheme(next)
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 16, height: 16, borderRadius: 99, background: pr.primary, border: '1px solid rgba(0,0,0,0.08)', flexShrink: 0 }} />
                        <span className="preset-name">{pr.name}</span>
                      </span>
                      <span className="preset-url">{pr.primary}</span>
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div>
                  <label className="field-label">Primary (buttons, active)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={themePrimaryInput}
                      onChange={(e) => {
                        const v = e.target.value
                        setThemePrimaryInput(v)
                        const next = { ...themeDraft, primary: v.toLowerCase() }
                        setThemeDraft(next)
                        applyTheme(next)
                      }}
                      style={{ width: 42, height: 36, padding: 2, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
                    />
                    <input
                      className="input"
                      value={themePrimaryInput}
                      onChange={(e) => {
                        const v = e.target.value
                        setThemePrimaryInput(v)
                        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                          const next = { ...themeDraft, primary: v.toLowerCase() }
                          setThemeDraft(next)
                          applyTheme(next)
                        }
                      }}
                      placeholder="#2563eb"
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
                <div>
                  <label className="field-label">Danger (delete)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={themeDangerInput}
                      onChange={(e) => {
                        const v = e.target.value
                        setThemeDangerInput(v)
                        const next = { ...themeDraft, danger: v.toLowerCase() }
                        setThemeDraft(next)
                        applyTheme(next)
                      }}
                      style={{ width: 42, height: 36, padding: 2, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
                    />
                    <input
                      className="input"
                      value={themeDangerInput}
                      onChange={(e) => {
                        const v = e.target.value
                        setThemeDangerInput(v)
                        if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                          const next = { ...themeDraft, danger: v.toLowerCase() }
                          setThemeDraft(next)
                          applyTheme(next)
                        }
                      }}
                      placeholder="#dc2626"
                      style={{ flex: 1 }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="field-label">Background</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={themeBgInput}
                    onChange={(e) => {
                      const v = e.target.value
                      setThemeBgInput(v)
                      const next = { ...themeDraft, background: v.toLowerCase() }
                      setThemeDraft(next)
                      applyTheme(next)
                    }}
                    style={{ width: 42, height: 36, padding: 2, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
                  />
                  <input
                    className="input"
                    value={themeBgInput}
                    onChange={(e) => {
                      const v = e.target.value
                      setThemeBgInput(v)
                      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                        const next = { ...themeDraft, background: v.toLowerCase() }
                        setThemeDraft(next)
                        applyTheme(next)
                      }
                    }}
                    placeholder="#ffffff"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn"
                    style={{ whiteSpace: 'nowrap' }}
                    onClick={() => {
                      const next = { ...themeDraft, background: '#ffffff' }
                      setThemeDraft(next)
                      setThemeBgInput('#ffffff')
                      applyTheme(next)
                    }}
                  >
                    White
                  </button>
                </div>
                <p className="hint" style={{ marginTop: 4 }}>White (#ffffff) is recommended. Custom backgrounds still keep text readable.</p>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label className="field-label">Corner radius: {themeDraft.radius}px</label>
                <input
                  type="range"
                  min={6}
                  max={16}
                  step={1}
                  value={themeDraft.radius}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    const next = { ...themeDraft, radius: n }
                    setThemeDraft(next)
                    applyTheme(next)
                  }}
                  style={{ width: '100%' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-faint)' }}>
                  <span>Sharp (6)</span><span>Rounded (16)</span>
                </div>
              </div>

              <div style={{ padding: 14, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-faint)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Preview</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="btn btn-primary">Primary</button>
                  <button className="btn">Secondary</button>
                  <button className="btn btn-danger">Danger</button>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--primary-bg)', border: '1px solid var(--primary-border)', borderRadius: 8, color: 'var(--primary)', fontSize: 13, fontWeight: 600 }}>Active</span>
                </div>
              </div>

              <div className="dialog-actions">
                <button
                  className="btn btn-primary"
                  onClick={submitThemeSettings}
                  disabled={
                    !themeSettings ||
                    (themeDraft.primary === themeSettings.primary &&
                      themeDraft.danger === themeSettings.danger &&
                      themeDraft.background === themeSettings.background &&
                      themeDraft.radius === themeSettings.radius)
                  }
                >
                  Save theme
                </button>
              </div>
            </div>
          )}

          {tab === 'github' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* GitHub Token section — password input + Test/Save + masked display */}
              <div style={{ padding: '12px 14px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>GitHub Token (PAT)</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 10 }}>
                  Stored like Provider.apiKey — server-side only, masked <code>••••xxxx</code>, chmod 600, WAL busy_timeout 10000. Env <code>GITHUB_TOKEN||GH_TOKEN</code> overrides. Format <code>ghp_</code>/<code>gho_</code>/<code>ghs_</code>/<code>ghr_</code>/<code>github_pat_</code> 20-120 chars.
                </div>
                <label className="field-label">Project override (optional)</label>
                <select className="input" value={githubProjectId} onChange={(e)=>setGithubProjectId(e.target.value)}>
                  <option value="">Global (all projects)</option>
                  {githubProjects.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <p className="hint">Per-project token overrides global, like mcpServers projectId. Leave blank for global.</p>
                <label className="field-label">GitHub PAT</label>
                <input className="input" type="password" placeholder="ghp_... or github_pat_..." value={githubTokenInput} onChange={(e)=>setGithubTokenInput(e.target.value)} />
                <p className="hint">Regex ^(gh[opsr]_|github_pat_) 20-120 chars. Never logged.</p>
                <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                  <button className="btn" onClick={testGithubToken} disabled={githubBusy}>{githubBusy ? 'Testing…' : 'Test'}</button>
                  <button className="btn btn-primary" onClick={submitGithubToken} disabled={githubBusy || !githubTokenInput.trim()}>{githubBusy ? 'Saving…' : 'Save'}</button>
                  {githubHasToken && <span style={{ fontSize:12.5, color:'var(--text-dim)', alignSelf:'center' }}>Saved: {githubMasked || '••••'}</span>}
                </div>
                {githubTestResult && <p className="hint" style={{ marginTop:6, color: githubTestResult.startsWith('OK') ? '#16a34a' : 'var(--danger)' }}>{githubTestResult}</p>}
                {githubHasToken && <p className="hint" style={{ marginTop:6 }}>Masked display: {githubMasked} — token never returned to client.</p>}
                <p className="hint" style={{ marginTop:6 }}>Test uses <code>api.github.com/user</code> Bearer 60s timeout (llm.ts:125 pattern).</p>
              </div>

              {/* Fully customizable polling card */}
              {githubPollDraft && (
                <div style={{ padding:'12px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10 }}>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:8 }}>Polling — fully customizable, rate-limit safe</div>
                  <div style={{ fontSize:12, color:'var(--text-faint)', marginBottom:10 }}>GitHub 5000/hr auth, 60/hr unauth, 900 points/min. ETag 304 saves quota. Respect X-RateLimit-Reset/Retry-After. Jitter 0-5s. Throttle to 60s when Remaining&lt;100.</div>

                  <label className="field-label">Project for polling override</label>
                  <select className="input" value={githubPollProjectId} onChange={(e)=>setGithubPollProjectId(e.target.value)}>
                    <option value="">Global</option>
                    {githubProjects.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <p className="hint">Per-project override like mcpServers. Global min/max clamp 5s-300s.</p>

                  <label className="field-label">Mode</label>
                  <select className="input" value={githubPollDraft.mode} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, mode: e.target.value as any })}>
                    <option value="interval">Interval</option>
                    <option value="cron">Cron</option>
                    <option value="event">Event-driven</option>
                    <option value="manual">Manual only</option>
                  </select>

                  {githubPollDraft.mode === 'interval' && (
                    <>
                      <label className="field-label">Interval (ms) — any custom value 5000-300000</label>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <input className="input" style={{ flex:1 }} type="number" min={5000} max={300000} value={githubCustomMs} onChange={(e)=>{
                          const v = e.target.value
                          setGithubCustomMs(v)
                          const n = Number(v)
                          if (Number.isFinite(n) && Math.round(n)>=5000 && Math.round(n)<=300000) setGithubPollDraft({ ...githubPollDraft, intervalMs: Math.round(n) })
                        }} placeholder="25000" />
                        <span style={{ fontSize:12, color:'var(--text-faint)' }}>ms</span>
                      </div>
                      <input type="range" min={5000} max={300000} step={1000} value={githubPollDraft.intervalMs} onChange={(e)=>{
                        const n = Number(e.target.value)
                        setGithubPollDraft({ ...githubPollDraft, intervalMs: n })
                        setGithubCustomMs(String(n))
                      }} style={{ width:'100%', marginTop:8 }} />
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                        {[5000,15000,25000,60000,120000,300000].map(v=> (
                          <button key={v} type="button" className="btn" style={{ padding:'4px 8px', fontSize:12, background: githubPollDraft.intervalMs===v ? 'var(--primary-bg)' : undefined, borderColor: githubPollDraft.intervalMs===v ? 'var(--primary-border)' : undefined, color: githubPollDraft.intervalMs===v ? 'var(--primary)' : undefined }} onClick={()=>{ setGithubPollDraft({ ...githubPollDraft, intervalMs: v }); setGithubCustomMs(String(v)) }}>{v/1000}s</button>
                        ))}
                      </div>
                      <p className="hint" style={{ marginTop:6 }}>Presets [5s,15s,25s,60s,120s,300s] + custom any ms (type 25000). Effective: {(githubPollDraft.intervalMs/1000).toFixed(1)}s (clamped 5s-300s)</p>
                    </>
                  )}

                  {githubPollDraft.mode === 'cron' && (
                    <>
                      <label className="field-label">Cron expression</label>
                      <input className="input" placeholder="*/25 * * * * *  (every 25s)" value={githubCronInput} onChange={(e)=>{
                        const v = e.target.value
                        setGithubCronInput(v)
                        setGithubPollDraft({ ...githubPollDraft, cronExpr: v || null })
                      }} />
                      <p className="hint">Helper "every 25s" or "*/25 * * * * *". Validated via cron parser if mode=cron.</p>
                    </>
                  )}

                  <div style={{ marginTop:12, padding:'10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8 }}>
                    <div style={{ fontWeight:600, fontSize:12.5, marginBottom:6 }}>Per-endpoint overrides</div>
                    <label style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                      <input type="checkbox" checked={githubPollDraft.endpoints.diff} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, endpoints:{ ...githubPollDraft.endpoints, diff:e.target.checked } })} /> Diff every{' '}
                      <input className="input" style={{ width:90, padding:'4px 6px' }} type="number" value={githubPollDraft.perEndpointInterval.diffMs} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, perEndpointInterval:{ ...githubPollDraft.perEndpointInterval, diffMs: Math.max(5000, Math.min(300000, Number(e.target.value)||5000)) } })} />ms
                    </label>
                    <label style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                      <input type="checkbox" checked={githubPollDraft.endpoints.pr} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, endpoints:{ ...githubPollDraft.endpoints, pr:e.target.checked } })} /> PR every{' '}
                      <input className="input" style={{ width:90, padding:'4px 6px' }} type="number" value={githubPollDraft.perEndpointInterval.prMs} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, perEndpointInterval:{ ...githubPollDraft.perEndpointInterval, prMs: Math.max(5000, Math.min(300000, Number(e.target.value)||60000)) } })} />ms
                    </label>
                    <label style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                      <input type="checkbox" checked={githubPollDraft.endpoints.commits} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, endpoints:{ ...githubPollDraft.endpoints, commits:e.target.checked } })} /> Commits every{' '}
                      <input className="input" style={{ width:90, padding:'4px 6px' }} type="number" value={(githubPollDraft.perEndpointInterval as any).commitsMs || 30000} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, perEndpointInterval:{ ...githubPollDraft.perEndpointInterval, commitsMs: Math.max(5000, Math.min(300000, Number(e.target.value)||30000)) } as any })} />ms
                    </label>
                    <label style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <input type="checkbox" checked={githubPollDraft.endpoints.actions} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, endpoints:{ ...githubPollDraft.endpoints, actions:e.target.checked } })} /> Actions (900 points/min)
                    </label>
                  </div>

                  <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:6 }}>
                    <label style={{ display:'flex', alignItems:'center', gap:8 }}><input type="checkbox" checked={githubPollDraft.enabled} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, enabled:e.target.checked })} /> Auto poll</label>
                    <label style={{ display:'flex', alignItems:'center', gap:8 }}><input type="checkbox" checked={githubPollDraft.pollOnFocusOnly} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, pollOnFocusOnly:e.target.checked })} /> Only when tab focused</label>
                    <label style={{ display:'flex', alignItems:'center', gap:8 }}><input type="checkbox" checked={githubPollDraft.pauseOnWindowBlur} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, pauseOnWindowBlur:e.target.checked })} /> Pause when window blurred</label>
                    <label style={{ display:'flex', alignItems:'center', gap:8 }}><input type="checkbox" checked={githubPollDraft.useEtag} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, useEtag:e.target.checked })} /> Use ETag (ON) — 304 saves quota counts ~1</label>
                    <label style={{ display:'flex', alignItems:'center', gap:8 }}><input type="checkbox" checked={githubPollDraft.respectRateLimit} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, respectRateLimit:e.target.checked })} /> Respect X-RateLimit-Reset/Retry-After (ON)</label>
                    <label style={{ display:'flex', alignItems:'center', gap:8 }}><input type="checkbox" checked={githubPollDraft.smartEventOnly} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, smartEventOnly:e.target.checked })} /> Smart event-only (poll only after git push/plan step)</label>
                    <label style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input type="checkbox" checked={githubPollDraft.jitterMs>0} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, jitterMs: e.target.checked ? 1000 : 0 })} /> Add jitter 0-5s{' '}
                      <input type="range" min={0} max={5000} step={100} value={githubPollDraft.jitterMs} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, jitterMs: Number(e.target.value) })} style={{ flex:1 }} />
                      <span style={{ fontSize:12, color:'var(--text-faint)', minWidth:40 }}>{githubPollDraft.jitterMs}ms</span>
                    </label>
                  </div>

                  <p className="hint" style={{ marginTop:8 }}>Global min/max clamp display: "Effective: {(githubPollDraft.intervalMs/1000)}s (clamped 5s-300s)" — effectiveIntervalMs = max(5000, min(300000, intervalMs + jitter)) throttled to 60s when Remaining&lt;100.</p>

                  <label className="field-label">Webhook URL (alternative to polling)</label>
                  <input className="input" placeholder="https://example.com/webhook" value={(githubPollDraft as any).webhookUrl || ''} onChange={(e)=> setGithubPollDraft({ ...githubPollDraft, webhookUrl: e.target.value || null } as any)} />
                  <p className="hint">Input webhookUrl → disables polling, shows setup curl, verifies X-Hub-Signature-256. When set, polling paused.</p>
                  {(githubPollDraft as any).webhookUrl && <p className="hint" style={{ color:'var(--primary)' }}>Polling disabled — webhook mode. Setup: <code>curl -X POST {(githubPollDraft as any).webhookUrl} -H "X-Hub-Signature-256: sha256=..."</code></p>}

                  <div className="dialog-actions">
                    <button className="btn btn-primary" onClick={submitGithubPoll} disabled={githubPollBusy}>{githubPollBusy ? 'Saving…' : 'Save polling'}</button>
                  </div>

                  {/* Live panel: GET /api/projects/:id/github/rate-limit → {remaining, resetAt, effectiveIntervalMs, nextPollAt, etagHitRate} polled every 10s, [Pause] [Poll now] (debounced 5s) */}
                  <div style={{ marginTop:12, padding:'10px', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8 }}>
                    <div style={{ fontWeight:600, fontSize:12.5, marginBottom:6 }}>Live panel — rate limit (polled every 10s)</div>
                    <label className="field-label">Select project for live data</label>
                    <select className="input" value={githubPollProjectId} onChange={(e)=>setGithubPollProjectId(e.target.value)}>
                      <option value="">— select project —</option>
                      {githubProjects.map(p=> <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    {githubPollProjectId && githubRate ? (
                      <div style={{ fontSize:12.5, lineHeight:1.6, marginTop:8 }}>
                        <div>Remaining: <strong>{githubRate.remaining}</strong> / {githubRate.limit} — resetAt: {githubRate.resetAt ? new Date(githubRate.resetAt).toLocaleTimeString() : '—'}</div>
                        <div>Effective: {(githubRate.effectiveIntervalMs/1000).toFixed(1)}s — Next poll: {githubRate.nextPollAt ? new Date(githubRate.nextPollAt).toLocaleTimeString() : 'paused/manual'}</div>
                        <div>ETag hit rate: {(githubRate.etagHitRate*100).toFixed(1)}% — Mode: {githubRate.mode} {githubRate.throttled && <span style={{ color:'var(--danger)', fontWeight:700 }}>(throttled to 60s)</span>}</div>
                        <div style={{ display:'flex', gap:8, marginTop:8 }}>
                          <button className="btn" onClick={pauseGithubPolling}>{githubPollDraft.enabled ? 'Pause' : 'Resume'}</button>
                          <button className="btn btn-primary" onClick={pollNowGithub}>Poll now</button>
                          <span className="hint" style={{ alignSelf:'center' }}>debounced 5s</span>
                        </div>
                        {githubRate.throttled && <p className="hint" style={{ color:'var(--danger)' }}>throttled to 60s — Remaining&lt;100</p>}
                      </div>
                    ) : githubPollProjectId ? <p className="hint">Loading rate limit…</p> : <p className="hint">Select project to see live rate-limit panel ( Remaining, resetAt, effectiveIntervalMs, nextPollAt, etagHitRate ).</p>}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
