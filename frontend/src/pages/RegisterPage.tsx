import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Eye, EyeOff, GraduationCap, LockKeyhole, Mail, Presentation, UserRound } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthLayout } from '../layouts/AuthLayout'
import { Button } from '../components/ui'
import { useAuth } from '../stores/AuthContext'
import { useSound } from '../stores/SoundContext'

export function RegisterPage() {
  const [searchParams] = useSearchParams()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [role, setRole] = useState<'student' | 'teacher'>(searchParams.get('role') === 'teacher' ? 'teacher' : 'student')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const { play } = useSound()
  const navigate = useNavigate()
  const update = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    if (form.password.length < 8) { setError('Mật khẩu cần có ít nhất 8 ký tự.'); return }
    setLoading(true)
    try { const user = await register(form.name, form.email, form.password, role); play('success'); navigate(user.role === 'student' ? '/dashboard' : '/admin') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể tạo tài khoản.') } finally { setLoading(false) }
  }
  const roles = [
    { value: 'student' as const, label: 'Học sinh', hint: 'Luyện đề & theo dõi tiến bộ', icon: GraduationCap },
    { value: 'teacher' as const, label: 'Giáo viên', hint: 'Tạo lớp, đăng đề & quản lý học sinh', icon: Presentation },
  ]
  return <AuthLayout mode="register"><motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}><p className="mb-2 text-xs font-bold uppercase tracking-[1.5px] text-primary-500">Bắt đầu hành trình</p><h2 className="text-[30px] font-extrabold tracking-[-1px]">Tạo tài khoản của bạn</h2><p className="mt-2 text-sm leading-6 text-muted">Một không gian học tập mới, dành riêng cho bạn.</p><form onSubmit={submit} className="mt-8 space-y-5"><div><span className="field-label">Bạn là</span><div className="grid grid-cols-2 gap-3">{roles.map(item => <button type="button" key={item.value} onClick={() => { setRole(item.value); play('toggle') }} aria-pressed={role === item.value} className={`flex items-start gap-2.5 rounded-2xl border p-3 text-left transition ${role === item.value ? 'border-primary-400 bg-primary-50 shadow-[0_0_0_3px_rgba(129,113,232,.08)]' : 'border-[#E6E3F5] bg-white hover:border-primary-200'}`}><span className={`rounded-xl p-2 ${role === item.value ? 'bg-primary-500 text-white' : 'bg-[#F3F3F8] text-muted'}`}><item.icon size={18} /></span><span><span className="block text-xs font-bold">{item.label}</span><span className="mt-0.5 block text-[9px] leading-4 text-muted">{item.hint}</span></span></button>)}</div></div><div><label htmlFor="name" className="field-label">Họ và tên</label><div className="relative"><UserRound size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A5A9BA]" /><input id="name" required minLength={2} value={form.name} onChange={event => update('name', event.target.value)} className="field pl-11" placeholder="Nguyễn Minh Anh" /></div></div><div><label htmlFor="email" className="field-label">Email</label><div className="relative"><Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A5A9BA]" /><input id="email" type="email" autoComplete="email" required value={form.email} onChange={event => update('email', event.target.value)} className="field pl-11" placeholder="ban@example.com" /></div></div><div><label htmlFor="password" className="field-label">Mật khẩu</label><div className="relative"><LockKeyhole size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#A5A9BA]" /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} value={form.password} onChange={event => update('password', event.target.value)} className="field pl-11 pr-12" placeholder="Tối thiểu 8 ký tự" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-muted" aria-label="Hiện hoặc ẩn mật khẩu">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div><p className="mt-2 text-[10px] text-muted">Nên kết hợp chữ hoa, chữ thường, số và ký tự đặc biệt.</p></div>{error && <p role="alert" className="rounded-xl bg-[#FDEFF3] px-4 py-3 text-xs text-[#C85A75]">{error}</p>}<Button type="submit" size="lg" loading={loading} className="w-full">Tạo tài khoản {role === 'teacher' ? 'giáo viên' : 'học sinh'}</Button></form><p className="mt-7 text-center text-xs text-muted">Đã có tài khoản? <Link to="/login" className="font-bold text-primary-600">Đăng nhập ngay</Link></p></motion.div></AuthLayout>
}
