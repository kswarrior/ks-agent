import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastType = 'info' | 'error' | 'success'

interface Toast {
  id: number
  message: string
  type: ToastType
}

interface ToastCtx {
  toast: (message: string, type?: ToastType) => void
}

const Ctx = createContext<ToastCtx>({ toast: () => {} })

export function useToast() {
  return useContext(Ctx).toast
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) clearTimeout(timer)
    timers.current.delete(id)
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = nextId++
      setItems((prev) => [...prev.slice(-3), { id, message, type }])
      timers.current.set(id, setTimeout(() => dismiss(id), 3500))
    },
    [dismiss]
  )

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)}>
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
