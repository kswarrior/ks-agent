import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react'

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  danger?: boolean
}

export interface PromptOptions {
  title: string
  label?: string
  value?: string
  placeholder?: string
  confirmText?: string
  validate?: (value: string) => string | null
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

interface PendingPrompt extends PromptOptions {
  resolve: (value: string | null) => void
}

interface DialogsCtx {
  confirm: (opts: ConfirmOptions) => Promise<boolean>
  prompt: (opts: PromptOptions) => Promise<string | null>
}

const Ctx = createContext<DialogsCtx>({
  confirm: async () => false,
  prompt: async () => null
})

export function useDialogs() {
  return useContext(Ctx)
}

export function DialogsProvider({ children }: { children: ReactNode }) {
  const [confirmState, setConfirmState] = useState<PendingConfirm | null>(null)
  const [promptState, setPromptState] = useState<PendingPrompt | null>(null)
  const [promptValue, setPromptValue] = useState('')
  const [promptError, setPromptError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve }))
  }, [])

  const prompt = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      setPromptValue(opts.value ?? '')
      setPromptError(null)
      setPromptState({ ...opts, resolve })
    })
  }, [])

  useEffect(() => {
    if (promptState) setTimeout(() => inputRef.current?.focus(), 30)
  }, [promptState])

  useEffect(() => {
    if (!confirmState && !promptState) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        confirmState?.resolve(false)
        setConfirmState(null)
        promptState?.resolve(null)
        setPromptState(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmState, promptState])

  const closeConfirm = (ok: boolean) => {
    confirmState?.resolve(ok)
    setConfirmState(null)
  }

  const closePrompt = (value: string | null) => {
    promptState?.resolve(value)
    setPromptState(null)
  }

  const submitPrompt = () => {
    if (!promptState) return
    const value = promptValue.trim()
    const err = promptState.validate?.(value) ?? (value ? null : 'This field is required')
    if (err) {
      setPromptError(err)
      return
    }
    promptState.resolve(value)
    setPromptState(null)
  }

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}

      {confirmState && (
        <div className="overlay" onMouseDown={() => closeConfirm(false)}>
          <div className="dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="dialog-title">{confirmState.title}</h3>
            {confirmState.message && <p className="dialog-message">{confirmState.message}</p>}
            <div className="dialog-actions">
              <button className="btn" onClick={() => closeConfirm(false)}>
                Cancel
              </button>
              <button
                className={`btn ${confirmState.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => closeConfirm(true)}
                autoFocus
              >
                {confirmState.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptState && (
        <div className="overlay" onMouseDown={() => closePrompt(null)}>
          <div className="dialog" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
            <h3 className="dialog-title">{promptState.title}</h3>
            {promptState.label && <label className="field-label">{promptState.label}</label>}
            <input
              ref={inputRef}
              className="input"
              value={promptValue}
              placeholder={promptState.placeholder}
              onChange={(e) => {
                setPromptValue(e.target.value)
                setPromptError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitPrompt()
              }}
            />
            {promptError && <p className="field-error">{promptError}</p>}
            <div className="dialog-actions">
              <button className="btn" onClick={() => closePrompt(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submitPrompt}>
                {promptState.confirmText || 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}
