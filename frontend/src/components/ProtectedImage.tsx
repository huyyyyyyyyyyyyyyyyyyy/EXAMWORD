import { useEffect, useState } from 'react'
import { ImageOff, Loader2 } from 'lucide-react'
import { api } from '../services/api'

export function ProtectedImage({ path, alt, className = '' }: { path: string; alt: string; className?: string }) {
  const [source, setSource] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    setSource(''); setError(false)
    if (/^(https?:|blob:|data:)/.test(path)) { setSource(path); return () => { active = false } }
    api<{ url: string }>(path).then(result => { if (active) setSource(result.url) }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [path])
  if (error) return <div className="flex min-h-32 items-center justify-center gap-2 rounded-2xl bg-slate-50 p-5 text-xs text-muted"><ImageOff size={18} />Không thể tải hình minh họa.</div>
  if (!source) return <div className="flex min-h-32 items-center justify-center gap-2 rounded-2xl bg-slate-50 p-5 text-xs text-muted"><Loader2 size={18} className="animate-spin" />Đang tải hình minh họa...</div>
  return <img src={source} alt={alt} width={1200} height={800} loading="lazy" decoding="async" className={`h-auto w-full object-contain ${className}`} />
}
