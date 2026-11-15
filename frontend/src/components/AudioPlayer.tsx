import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, Pause, Play, Volume2 } from 'lucide-react'
import { resolveAudioUrl } from '../services/api'

export function AudioPlayer({ path }: { path: string }) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [source, setSource] = useState('')
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [volume, setVolume] = useState(1)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    resolveAudioUrl(path).then(result => { if (active) setSource(result) }).catch(reason => { if (active) setError(reason.message) })
    return () => { active = false }
  }, [path])
  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) void audio.play(); else audio.pause()
  }
  const format = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`
  return <div className="rounded-2xl border border-[#DED8FA] bg-primary-50 p-4">
    {error ? <p className="flex items-center gap-2 text-xs text-danger"><AlertCircle size={16} />{error}</p> : <><audio ref={audioRef} src={source} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} onTimeUpdate={event => setCurrent(event.currentTarget.currentTime)} onLoadedMetadata={event => setDuration(event.currentTarget.duration)} /><div className="flex items-center gap-3"><button onClick={toggle} disabled={!source} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-500 text-white shadow-button transition hover:bg-primary-600 disabled:opacity-50" aria-label={playing ? 'Tạm dừng' : 'Phát audio'}>{!source ? <Loader2 size={17} className="animate-spin" /> : playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} className="ml-0.5" fill="currentColor" />}</button><div className="min-w-0 flex-1"><input type="range" min={0} max={duration || 0} step={0.1} value={current} onChange={event => { const time = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = time; setCurrent(time) }} className="h-1.5 w-full accent-primary-500" aria-label="Vị trí audio" /><div className="mt-1 flex justify-between text-[9px] font-medium text-primary-700"><span>{format(current)}</span><span>{format(duration)}</span></div></div><Volume2 size={17} className="hidden text-primary-600 sm:block" /><input type="range" min={0} max={1} step={0.1} value={volume} onChange={event => { const value = Number(event.target.value); setVolume(value); if (audioRef.current) audioRef.current.volume = value }} className="hidden w-16 accent-primary-500 sm:block" aria-label="Âm lượng" /></div></>}
  </div>
}
