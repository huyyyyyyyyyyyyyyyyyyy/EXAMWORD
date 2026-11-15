import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { AlertCircle, Headphones, Loader2, Pause, Play, RotateCcw, Volume2 } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { resolveAudioUrl } from '../services/api'
import { useSound } from '../stores/SoundContext'
import { WhaleListener } from './Characters'

type Phase = 'loading' | 'countdown' | 'playing' | 'paused' | 'ended' | 'blocked' | 'error'

const format = (seconds: number) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}` : '0:00'

/* 18 thanh equalizer chạy hoàn toàn bằng CSS transform (nhẹ, GPU-friendly).
   Peak/thời gian/độ trễ tính một lần — không có vòng animation JS mỗi khung hình. */
const EQ_BARS = Array.from({ length: 18 }, (_, index) => ({
  '--lp-peak': (0.4 + ((index * 7) % 13) / 20).toFixed(2),
  '--lp-duration': `${(0.55 + (index % 5) * 0.14).toFixed(2)}s`,
  '--lp-delay': `${(-(index * 0.09) % 0.7).toFixed(2)}s`,
}) as CSSProperties)

export function ListeningPlayer({ path, title = 'Phần nghe hiểu' }: { path: string; title?: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const { play } = useSound()
  const reduceMotion = useReducedMotion()
  const [phase, setPhase] = useState<Phase>('loading')
  const [source, setSource] = useState('')
  const [error, setError] = useState('')
  const [count, setCount] = useState(3)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [listens, setListens] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const startedRef = useRef(false)

  useEffect(() => {
    let active = true
    setPhase('loading'); setSource(''); setError(''); startedRef.current = false; setListens(0); setCurrent(0); setDuration(0)
    resolveAudioUrl(path)
      .then(url => { if (active) setSource(url) })
      .catch(reason => { if (active) { setError(reason instanceof Error ? reason.message : 'Không thể tải âm thanh.'); setPhase('error') } })
    return () => { active = false }
  }, [path, reloadKey])

  const beginCountdown = useCallback(() => {
    if (startedRef.current) return
    startedRef.current = true
    setCount(3)
    setPhase('countdown')
  }, [])

  const startPlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const fromStart = audio.currentTime < 0.25
    audio.play()
      .then(() => { setPhase('playing'); if (fromStart) setListens(n => n + 1) })
      .catch((reason: unknown) => {
        const name = reason instanceof DOMException ? reason.name : ''
        if (name === 'AbortError') return
        if (name === 'NotAllowedError' || name === 'SecurityError') { setPhase('blocked'); return }
        setError('Không thể phát âm thanh. Hãy thử tải lại.')
        setPhase('error')
      })
  }, [])

  useEffect(() => {
    if (phase !== 'countdown') return
    play('tick')
    if (count <= 1) {
      const timer = window.setTimeout(() => { play('go'); startPlayback() }, 900)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => setCount(value => value - 1), 900)
    return () => window.clearTimeout(timer)
  }, [phase, count, play, startPlayback])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (phase === 'blocked' || phase === 'ended' || audio.paused) {
      if (phase === 'ended') { audio.currentTime = 0; setCurrent(0) }
      startPlayback()
    } else { audio.pause(); setPhase('paused') }
  }

  const replay = () => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0; setCurrent(0)
    startedRef.current = true
    setCount(3); setPhase('countdown')
  }

  const seek = (time: number) => { if (audioRef.current) audioRef.current.currentTime = time; setCurrent(time) }
  const counting = phase === 'countdown'

  return (
    <div className="relative overflow-hidden rounded-3xl border border-[#BEE9F0] bg-gradient-to-br from-[#EAF9FC] via-[#F3FBFD] to-[#EEF6FF] p-5 shadow-soft">
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#73D8E6]/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-[#8171E8]/10 blur-2xl" />
      <audio
        ref={audioRef} src={source} preload="auto"
        onLoadedMetadata={event => { setDuration(event.currentTarget.duration); beginCountdown() }}
        onPlay={() => setPhase('playing')}
        onPause={() => setPhase(prev => (prev === 'playing' ? 'paused' : prev))}
        onEnded={() => setPhase('ended')}
        onTimeUpdate={event => setCurrent(event.currentTarget.currentTime)}
        onError={() => { if (source) { setError('Không thể tải âm thanh bài nghe.'); setPhase('error') } }}
      />
      <div className="relative flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5FC9DC] to-[#3AA8BE] text-white shadow-button"><Headphones size={20} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[1.3px] text-[#2C8FA3]">Listening · Tự động phát</p>
          <p className="truncate text-sm font-bold text-ink">{title}</p>
        </div>
        <div className="hidden shrink-0 sm:block"><WhaleListener size={72} /></div>
      </div>

      <div className="relative mt-4">
        {phase === 'error' ? (
          <div className="flex flex-col items-start gap-3 rounded-2xl bg-white/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2 text-xs font-medium text-danger"><AlertCircle size={16} className="shrink-0" />{error || 'Không thể tải âm thanh.'}</p>
            <button type="button" onClick={() => setReloadKey(key => key + 1)} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#DFF4F8] px-3.5 py-2 text-[11px] font-bold text-[#2C8FA3] transition hover:bg-[#CDEDF4]"><RotateCcw size={13} />Thử lại</button>
          </div>
        ) : phase === 'loading' ? (
          <div className="flex items-center justify-center gap-2 rounded-2xl bg-white/60 p-6 text-xs font-medium text-[#2C8FA3]"><Loader2 size={16} className="animate-spin" />Đang tải âm thanh bài nghe...</div>
        ) : (
          <div className="rounded-2xl bg-white/70 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <button type="button" onClick={toggle} disabled={counting} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#5FC9DC] to-[#3AA8BE] text-white shadow-button transition hover:brightness-105 active:scale-95 disabled:opacity-60" aria-label={phase === 'playing' ? 'Tạm dừng bài nghe' : 'Phát bài nghe'}>
                {phase === 'playing' ? <Pause size={20} fill="currentColor" /> : <Play size={20} className="ml-0.5" fill="currentColor" />}
              </button>
              <div className="min-w-0 flex-1">
                <div className={`lp-equalizer${phase === 'playing' ? ' is-playing' : ''}`} aria-hidden="true">
                  {EQ_BARS.map((style, index) => <span key={index} className="lp-bar" style={style} />)}
                </div>
                <input type="range" min={0} max={duration || 0} step={0.1} value={current} onChange={event => seek(Number(event.target.value))} className="mt-1 h-1.5 w-full accent-[#3AA8BE]" aria-label="Vị trí bài nghe" aria-valuetext={`${format(current)} trên ${format(duration)}`} />
                <div className="mt-1 flex justify-between text-[10px] font-semibold text-[#2C8FA3]"><span>{format(current)}</span><span>{format(duration)}</span></div>
              </div>
              <div className="hidden items-center gap-2 sm:flex">
                <Volume2 size={16} className="text-[#2C8FA3]" />
                <input type="range" min={0} max={1} step={0.05} value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); if (audioRef.current) audioRef.current.volume = value }} className="w-16 accent-[#3AA8BE]" aria-label="Âm lượng" />
              </div>
              <button type="button" onClick={replay} disabled={counting} className="icon-button shrink-0 text-[#2C8FA3] hover:bg-[#DFF4F8]" aria-label="Nghe lại từ đầu" title="Nghe lại"><RotateCcw size={18} /></button>
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-[#D7EFF4] pt-3 text-[10px] font-medium text-[#5A97A6]">
              <span>{phase === 'blocked' ? 'Trình duyệt chặn tự phát — bấm nút phát để nghe.' : phase === 'ended' ? 'Đã phát xong. Bấm nghe lại để ôn tập.' : 'Âm thanh tự phát khi vào phần nghe.'}</span>
              {listens > 0 && <span className="rounded-full bg-[#DFF4F8] px-2 py-0.5 font-bold text-[#2C8FA3]">Đã nghe {listens} lần</span>}
            </div>
          </div>
        )}

        <AnimatePresence>
          {counting && (
            <motion.div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-[#252944]/95 to-[#3A3F6B]/95 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-label="Đếm ngược trước khi phát bài nghe">
              <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[2px] text-[#73D8E6]"><Headphones size={15} />Chuẩn bị nghe</p>
              <div className="relative flex h-28 w-28 items-center justify-center">
                <span className="lp-countdown-ring" aria-hidden="true" />
                <AnimatePresence mode="popLayout">
                  <motion.span key={count} className="text-6xl font-extrabold text-white" initial={reduceMotion ? { opacity: 0 } : { scale: .4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={reduceMotion ? { opacity: 0 } : { scale: 1.6, opacity: 0 }} transition={{ duration: reduceMotion ? 0 : .35, ease: 'easeOut' }}>{count}</motion.span>
                </AnimatePresence>
              </div>
              <p className="mt-3 text-xs font-medium text-white/70">Đeo tai nghe và tập trung nhé...</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {phase === 'blocked' && (
            <motion.button type="button" onClick={startPlayback} className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl bg-[#252944]/90 text-white backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-label="Bấm để bắt đầu nghe">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#5FC9DC] shadow-button"><Play size={24} className="ml-1" fill="currentColor" /></span>
              <span className="text-sm font-bold">Bấm để bắt đầu nghe</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}