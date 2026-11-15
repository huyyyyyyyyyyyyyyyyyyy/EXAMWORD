import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Sparkles, Star } from 'lucide-react'
import { motion } from 'framer-motion'
import { Logo } from '../components/Logo'
import { Mascot } from '../components/Mascot'
import { ChatBird, StarBuddy } from '../components/Characters'

export function AuthLayout({ children, mode = 'login' }: { children: ReactNode; mode?: 'login' | 'register' | 'forgot' }) {
  return <div className="grid min-h-screen bg-white lg:grid-cols-[1.02fr_1fr]">
    <section className="relative hidden overflow-hidden bg-[#F0EDFF] p-12 lg:flex lg:flex-col">
      <div className="soft-grid absolute inset-0 opacity-50" />
      <div className="absolute -left-28 -top-24 h-80 w-80 rounded-full bg-[#DCD4FF] blur-2xl" />
      <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-[#DDF5F7] blur-2xl" />
      <div className="relative z-10"><Logo /></div>
      <div className="relative z-10 mx-auto flex w-full max-w-[540px] flex-1 flex-col justify-center py-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: .1 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-white bg-white/60 px-3.5 py-2 text-[11px] font-bold text-primary-700 backdrop-blur"><Sparkles size={14} />HỌC THÔNG MINH, TIẾN BỘ MỖI NGÀY</span>
          <h1 className="mt-6 text-balance text-[40px] font-extrabold leading-[1.25] tracking-[-1.5px] text-[#302A55]">Biến mỗi thử thách<br />thành <span className="relative text-primary-600">một chiến thắng.<svg className="absolute -bottom-2 left-0 w-full" viewBox="0 0 260 12" fill="none"><path d="M3 8c70-7 155-7 254-2" stroke="#FFBE69" strokeWidth="5" strokeLinecap="round" /></svg></span></h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-[#77728F]">Luyện đề, khám phá điểm mạnh và chinh phục mục tiêu cùng Orbi — bạn đồng hành luôn tin vào bạn.</p>
        </motion.div>
        <div className="relative mt-3 flex h-[285px] items-center justify-center">
          <Mascot mood="happy" size={270} className="relative z-10" />
          <motion.div animate={{ y: [0, -10, 0], rotate: [3, -3, 3] }} transition={{ duration: 5, repeat: Infinity }} className="absolute right-2 top-0 z-0"><StarBuddy size={92} /></motion.div>
          <motion.div animate={{ y: [0, 9, 0], rotate: [-3, 2, -3] }} transition={{ duration: 4.6, repeat: Infinity, delay: .6 }} className="absolute bottom-2 left-2 z-0"><ChatBird size={88} /></motion.div>
          <motion.div animate={{ y: [0, -8, 0], rotate: [-2, 1, -2] }} transition={{ duration: 4, repeat: Infinity }} className="absolute left-0 top-10 rounded-2xl border border-white bg-white/85 p-3.5 shadow-lift backdrop-blur"><div className="flex items-center gap-2.5"><span className="rounded-xl bg-[#E8F8F2] p-2 text-success"><CheckCircle2 size={20} /></span><div><p className="text-xs font-bold">Tiến bộ rõ ràng</p><p className="mt-1 text-[10px] text-muted">Phân tích sau mỗi bài</p></div></div></motion.div>
          <motion.div animate={{ y: [0, 8, 0], rotate: [2, -1, 2] }} transition={{ duration: 4.5, repeat: Infinity }} className="absolute bottom-10 right-0 rounded-2xl border border-white bg-white/85 p-3.5 shadow-lift backdrop-blur"><div className="flex items-center gap-2.5"><span className="rounded-xl bg-[#FFF4E5] p-2 text-warning"><Star size={20} fill="currentColor" /></span><div><p className="text-xs font-bold">Học mà như chơi</p><p className="mt-1 text-[10px] text-muted">XP, huy hiệu & chuỗi ngày</p></div></div></motion.div>
        </div>
      </div>
      <p className="relative z-10 text-[11px] text-[#918BA8]">© 2026 EXAM WORLD · Học đúng điều mình cần.</p>
    </section>
    <section className="relative flex min-h-screen flex-col px-5 py-6 sm:px-10 lg:px-16 xl:px-24">
      <div className="flex items-center justify-between"><div className="lg:hidden"><Logo /></div><Link to="/login" className={`ml-auto inline-flex items-center gap-2 text-xs font-semibold text-muted transition hover:text-primary-600 ${mode === 'login' ? 'invisible' : ''}`}><ArrowLeft size={16} />Quay lại đăng nhập</Link></div>
      <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-10">{children}</div>
      <p className="text-center text-[10px] leading-5 text-[#B0B3C2]">Bằng việc tiếp tục, bạn đồng ý với Điều khoản sử dụng và Chính sách bảo mật.</p>
    </section>
  </div>
}
