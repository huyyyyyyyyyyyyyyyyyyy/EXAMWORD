import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import { useSound } from './SoundContext'

type ToastTone = 'success' | 'error' | 'info'
interface ToastItem { id: number; message: string; tone: ToastTone }
const ToastContext = createContext<{ showToast: (message: string, tone?: ToastTone) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const counter = useRef(0)
  const { play } = useSound()
  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = ++counter.current
    play(tone === 'success' ? 'success' : tone === 'error' ? 'error' : 'toggle')
    setToasts(items => [...items.slice(-3), { id, message, tone }])
    window.setTimeout(() => setToasts(items => items.filter(item => item.id !== id)), 4000)
  }, [play])
  const value = useMemo(() => ({ showToast }), [showToast])
  return <ToastContext.Provider value={value}>{children}<div className="pointer-events-none fixed right-4 top-4 z-[200] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2"><AnimatePresence>{toasts.map(toast => <motion.div key={toast.id} initial={{ opacity: 0, x: 30, scale: .96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 20 }} className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-white bg-white p-4 shadow-lift"><span className={toast.tone === 'success' ? 'text-success' : toast.tone === 'error' ? 'text-danger' : 'text-blue'}>{toast.tone === 'success' ? <CheckCircle2 size={21} /> : toast.tone === 'error' ? <AlertCircle size={21} /> : <Info size={21} />}</span><p className="flex-1 text-sm font-medium leading-5">{toast.message}</p><button className="text-muted hover:text-ink" onClick={() => setToasts(items => items.filter(item => item.id !== toast.id))} aria-label="Đóng thông báo"><X size={17} /></button></motion.div>)}</AnimatePresence></div></ToastContext.Provider>
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
