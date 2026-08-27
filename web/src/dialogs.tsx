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
  checkboxLabel?: string
  checkboxWarning?: string
  checkboxInitialChecked?: boolean
}

export type ConfirmResult = {
  confirmed: boolean
  checked: boolean
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
  resolve: (value: boolean | ConfirmResult) => void
}

interface PendingPrompt extends PromptOptions {
  resolve: (value: string | null) => void
}

interface DialogsCtx {
  confirm: {
    (opts: ConfirmOptions & { checkboxLabel: string }): Promise<ConfirmResult>
    (opts: ConfirmOptions): Promise<boolean>
  }
  prompt: (opts: PromptOptions) => Promise<string | null>
}

const Ctx = createContext<DialogsCtx>({
  confirm: async () => false as unknown as boolean,
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
  const [confirmChecked, setConfirmChecked] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<any> => {
    return new Promise<boolean | ConfirmResult>((resolve) => {
      setConfirmChecked(!!opts.checkboxInitialChecked)
      setConfirmState({ ...opts, resolve: resolve as (v: boolean | ConfirmResult) => void })
    })
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
        if (confirmState) {
          const hasCheckbox = !!confirmState.checkboxLabel
          if (hasCheckbox) {
            ;(confirmState.resolve as (v: ConfirmResult) => void)({ confirmed: false, checked: confirmChecked })
          } else {
            ;(confirmState.resolve as (v: boolean) => void)(false)
          }
          setConfirmState(null)
          setConfirmChecked(false)
        }
        promptState?.resolve(null)
        setPromptState(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmState, promptState, confirmChecked])

  const closeConfirm = (ok: boolean) => {
    if (!confirmState) return
    const hasCheckbox = !!confirmState.checkboxLabel
    if (hasCheckbox) {
      ;(confirmState.resolve as (v: ConfirmResult) => void)({ confirmed: ok, checked: confirmChecked })
    } else {
      ;(confirmState.resolve as (v: boolean) => void)(ok)
    }
    setConfirmState(null)
    setConfirmChecked(false)
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
            {confirmState.checkboxLabel && (
              <label className="checkbox-row" style={{ marginTop: 14 }}>
                <input
                  type="checkbox"
                  checked={confirmChecked}
                  onChange={(e) => setConfirmChecked(e.target.checked)}
                />
                <span>{confirmState.checkboxLabel}</span>
              </label>
            )}
            {confirmState.checkboxLabel && confirmChecked && confirmState.checkboxWarning && (
              <div className="dialog-warning">
                <span className="dialog-warning-icon">⚠️</span>
                <span>{confirmState.checkboxWarning}</span>
              </div>
            )}
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
