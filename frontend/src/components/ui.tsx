import { AlertCircle, ArrowRight, Check, Inbox, Loader2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'
import { useEffect } from 'react'
import { Mascot } from './Mascot'
import { useSound } from '../stores/SoundContext'

export function Button({ children, variant = 'primary', size = 'md', loading = false, className = '', disabled, onClick, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success'; size?: 'sm' | 'md' | 'lg'; loading?: boolean }) {
  const { play } = useSound()
  const variants = {
    primary: 'bg-primary-500 text-white shadow-button hover:bg-primary-600',
    secondary: 'bg-primary-50 text-primary-700 hover:bg-primary-100',
    outline: 'border border-[#DDD9F3] bg-white text-ink hover:border-primary-400 hover:text-primary-600',
    ghost: 'text-slate-500 hover:bg-slate-100 hover:text-ink',
    danger: 'bg-danger text-white hover:bg-[#E56980]',
    success: 'bg-success text-white hover:bg-[#36B688]',
  }
  const sizes = { sm: 'min-h-9 px-3.5 py-2 text-xs rounded-xl', md: 'min-h-11 px-5 py-2.5 text-sm rounded-2xl', lg: 'min-h-[52px] px-6 py-3.5 text-sm rounded-2xl' }
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => { if (!disabled && !loading) play('tap'); onClick?.(event) }
  return <motion.button whileTap={{ scale: disabled || loading ? 1 : .97 }} className={`inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-50 disabled:shadow-none ${variants[variant]} ${sizes[size]} ${className}`} disabled={disabled || loading} onClick={handleClick} {...(props as object)}>{loading && <Loader2 size={17} className="animate-spin" />}{children}</motion.button>
}

export function Badge({ children, tone = 'purple', className = '' }: { children: ReactNode; tone?: 'purple' | 'green' | 'orange' | 'blue' | 'pink' | 'gray'; className?: string }) {
  const tones = { purple: 'bg-primary-50 text-primary-700', green: 'bg-[#E8F8F2] text-[#248D69]', orange: 'bg-[#FFF3E4] text-[#B77A2C]', blue: 'bg-[#EAF3FD] text-[#4482C0]', pink: 'bg-[#FDEFF3] text-[#C85A75]', gray: 'bg-slate-100 text-slate-500' }
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone]} ${className}`}>{children}</span>
}

export function PageLoader({ label = 'Đang chuẩn bị không gian học tập...' }: { label?: string }) {
  return <div className="flex min-h-[50vh] flex-col items-center justify-center gap-5"><div className="relative"><div className="absolute inset-0 animate-pulse-soft rounded-full bg-primary-100" /><Mascot size={105} mood="thinking" className="relative" /></div><div className="flex items-center gap-2 text-sm font-medium text-muted"><Loader2 size={17} className="animate-spin text-primary-500" />{label}</div></div>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="card flex min-h-[280px] flex-col items-center justify-center p-8 text-center"><span className="mb-4 rounded-2xl bg-[#FDEFF3] p-3 text-danger"><AlertCircle /></span><h2 className="text-lg font-bold">Chưa thể tải nội dung</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted">{message}</p>{onRetry && <Button variant="outline" className="mt-5" onClick={onRetry}>Thử lại</Button>}</div>
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-col items-center justify-center px-5 py-12 text-center"><div className="mb-2 rounded-full bg-primary-50 p-3 text-primary-400"><Inbox size={28} /></div><h3 className="font-bold text-ink">{title}</h3><p className="mt-2 max-w-sm text-sm leading-6 text-muted">{description}</p>{action && <div className="mt-5">{action}</div>}</div>
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = '' }
  }, [open, onClose])
  return <AnimatePresence>{open && <motion.div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#252944]/35 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}><motion.div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl" initial={{ opacity: 0, y: 20, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: .97 }}><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Đóng"><X size={20} /></button></div><div className="mt-4 text-sm leading-6 text-slate-500">{children}</div>{footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}</motion.div></motion.div>}</AnimatePresence>
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const initials = (name || '?').trim().split(/\s+/).filter(Boolean).map(part => part[0]).slice(-2).join('').toUpperCase() || '?'
  const sizes = { sm: 'h-8 w-8 text-[10px]', md: 'h-10 w-10 text-xs', lg: 'h-16 w-16 text-lg' }
  return <span className={`inline-flex shrink-0 items-center justify-center rounded-full border-[3px] border-white bg-gradient-to-br from-[#B6A9F8] to-[#7A68DD] font-bold text-white shadow-sm ${sizes[size]}`}>{initials}</span>
}

export function SuccessCheck() {
  return <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#E5F8F1] text-success"><Check size={32} strokeWidth={3} /></motion.span>
}

export function TextLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return <button onClick={onClick} className="group inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 hover:text-primary-700">{children}<ArrowRight size={16} className="transition group-hover:translate-x-1" /></button>
}
