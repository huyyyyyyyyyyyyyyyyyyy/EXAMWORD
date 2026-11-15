import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, GraduationCap, LockKeyhole, Mail, Presentation } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthLayout } from '../layouts/AuthLayout'
import { Button } from '../components/ui'
import { useAuth } from '../stores/AuthContext'
import { useSound } from '../stores/SoundContext'

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login } = useAuth()
  const { play } = useSound()
  const navigate = useNavigate()
  const location = useLocation()
  const destination = (location.state as { from?: string } | null)?.from

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setLoading(true)
    try {
      const user = await login(email, password)
      play('success')
      navigate(destination || (user.role === 'student' ? '/dashboard' : '/admin'), { replace: true })
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Đăng nhập không thành công.') } finally { setLoading(false) }
  }

  return <AuthLayout><motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
    <p className="mb-2 text-xs font-bold uppercase tracking-[1.5px] text-primary-500">Chào mừng trở lại</p><h2 className="text-[30px] font-extrabold tracking-[-1px]">Sẵn sàng bứt phá chưa?</h2><p className="mt-2 text-sm leading-6 text-muted">Đăng nhập để tiếp tục hành trình học tập của bạn.</p>
    <form onSubmit={submit} className="mt-8 space-y-5">
      <div><label htmlFor="email" className="field-label">Email</label><div className="relative"><Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A5A9BA]" /><input id="email" type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className="field pl-11" placeholder="ban@example.com" /></div></div>
      <div><div className="flex items-center justify-between"><label htmlFor="password" className="field-label">Mật khẩu</label><Link to="/forgot-password" className="mb-2 text-xs font-semibold text-primary-600 hover:text-primary-700">Quên mật khẩu?</Link></div><div className="relative"><LockKeyhole size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A5A9BA]" /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} className="field pl-11 pr-12" placeholder="Nhập mật khẩu" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted hover:text-ink" aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></div>
      {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} role="alert" className="rounded-xl bg-[#FDEFF3] px-4 py-3 text-xs font-medium leading-5 text-[#C85A75]">{error}</motion.p>}
      <Button type="submit" size="lg" loading={loading} className="w-full">Đăng nhập</Button>
    </form>
    <div className="my-6 flex items-center gap-3"><span className="h-px flex-1 bg-slate-100" /><span className="text-[10px] font-medium uppercase tracking-wide text-[#B0B3C2]">Tạo tài khoản mới</span><span className="h-px flex-1 bg-slate-100" /></div>
    <div className="grid grid-cols-2 gap-3"><Link to="/register?role=student" className="flex items-center gap-3 rounded-2xl border border-[#E6E3F5] p-4 transition hover:border-primary-400 hover:bg-primary-50"><span className="rounded-xl bg-primary-50 p-2 text-primary-600"><GraduationCap size={19} /></span><span><span className="block text-xs font-bold">Học sinh</span><span className="mt-1 block text-[10px] text-muted">Luyện đề & theo dõi tiến bộ</span></span></Link><Link to="/register?role=teacher" className="flex items-center gap-3 rounded-2xl border border-[#E6E3F5] p-4 transition hover:border-primary-400 hover:bg-primary-50"><span className="rounded-xl bg-[#E8F8F2] p-2 text-success"><Presentation size={19} /></span><span><span className="block text-xs font-bold">Giáo viên</span><span className="mt-1 block text-[10px] text-muted">Tạo lớp & quản lý đề thi</span></span></Link></div>
  </motion.div></AuthLayout>
}
