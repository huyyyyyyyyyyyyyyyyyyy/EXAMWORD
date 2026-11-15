import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { isMuted, playSound, setMuted } from '../lib/sound'
import type { SoundName } from '../lib/sound'

interface SoundContextValue {
  muted: boolean
  play: (name: SoundName) => void
  toggle: () => void
}
const SoundContext = createContext<SoundContextValue | null>(null)
const STORAGE_KEY = 'examworld_muted'

export function SoundProvider({ children }: { children: ReactNode }) {
  const [muted, setMutedState] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === '1' } catch { return false }
  })

  useEffect(() => { setMuted(muted) }, [muted])

  const play = useCallback((name: SoundName) => { if (!isMuted()) playSound(name) }, [])
  const toggle = useCallback(() => {
    setMutedState(prev => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      setMuted(next)
      if (!next) playSound('toggle')
      return next
    })
  }, [])

  const value = useMemo(() => ({ muted, play, toggle }), [muted, play, toggle])
  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>
}

export function useSound() {
  const ctx = useContext(SoundContext)
  if (!ctx) throw new Error('useSound must be used inside SoundProvider')
  return ctx
}

export function SoundToggle({ className = '' }: { className?: string }) {
  const { muted, toggle } = useSound()
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={muted}
      aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
      title={muted ? 'Âm thanh đang tắt — bấm để bật' : 'Âm thanh đang bật — bấm để tắt'}
      className={`icon-button relative ${muted ? 'text-muted' : 'text-primary-600'} ${className}`}
    >
      {muted ? <VolumeX size={19} /> : <Volume2 size={19} />}
      <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-white ${muted ? 'bg-slate-300' : 'bg-success'}`} />
    </button>
  )
}