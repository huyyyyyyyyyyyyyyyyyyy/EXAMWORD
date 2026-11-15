import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, Mail, ShieldCheck } from 'lucide-react'
import { motion } from 'framer-motion'
import { AuthLayout } from '../layouts/AuthLayout'
import { Button } from '../components/ui'
import { api, jsonBody } from '../services/api'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const request = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError('')
    try { const result = await api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: jsonBody({ email }) }); setMessage(result.message) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Không thể gửi yêu cầu.') } finally { setLoading(false) }
  }
  return <AuthLayout mode="forgot"><motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}><span className="mb-6 inline-flex rounded-2xl bg-primary-50 p-3 text-primary-600"><KeyRound size={25} /></span><h2 className="text-[30px] font-extrabold tracking-[-1px]">Khôi phục mật khẩu</h2><p className="mt-2 text-sm leading-6 text-muted">Gửi yêu cầu hỗ trợ cho tài khoản đã đăng ký. Giáo viên hoặc quản trị viên sẽ xác minh trước khi đặt lại mật khẩu.</p>{message && <div className="mt-6 rounded-2xl bg-[#E8F8F2] p-4 text-xs leading-5 text-[#248D69]">{message}</div>}<form onSubmit={request} className="mt-7 space-y-4"><div><label htmlFor="reset-email" className="field-label">Email</label><div className="relative"><Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" /><input id="reset-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} className="field pl-11" placeholder="ban@example.com" /></div></div><Button type="submit" loading={loading} className="w-full">Gửi yêu cầu hỗ trợ</Button></form><div className="mt-5 flex gap-3 rounded-2xl bg-primary-50 p-4 text-[11px] leading-5 text-primary-700"><ShieldCheck size={18} className="shrink-0" /><p>ExamWorld không hiển thị mã khôi phục công khai. Yêu cầu xác minh này giúp bảo vệ quyền sở hữu tài khoản của bạn.</p></div>{error && <p role="alert" className="mt-4 rounded-xl bg-[#FDEFF3] px-4 py-3 text-xs text-[#C85A75]">{error}</p>}<p className="mt-6 text-center text-xs text-muted"><Link to="/login" className="font-bold text-primary-600">Quay lại đăng nhập</Link></p></motion.div></AuthLayout>
}
