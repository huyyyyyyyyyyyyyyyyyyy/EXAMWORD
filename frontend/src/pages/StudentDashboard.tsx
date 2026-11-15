import { Link } from 'react-router-dom'
import { ArrowRight, Award, BookCheck, ChevronRight, Flame, LineChart, Sparkles, Star, Target, TrendingUp, Trophy, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAuth } from '../stores/AuthContext'
import { useAsync } from '../hooks/useAsync'
import type { StudentDashboard as DashboardData } from '../types'
import { ErrorState, PageLoader, EmptyState, Badge } from '../components/ui'
import { Mascot } from '../components/Mascot'
import { StarBuddy } from '../components/Characters'
import { RecommendationCard } from '../components/ExamCard'
import { formatDate, getSubjectMeta } from '../utils'

const statConfig = [
  { key: 'completedExams', label: 'Đề đã hoàn thành', icon: BookCheck, color: '#8171E8', bg: '#EEEAFE', suffix: '' },
  { key: 'averageScore', label: 'Điểm trung bình', icon: Target, color: '#67A9ED', bg: '#E9F3FE', suffix: '%' },
  { key: 'highestScore', label: 'Điểm cao nhất', icon: Trophy, color: '#E9A543', bg: '#FFF3E3', suffix: '%' },
  { key: 'totalXp', label: 'Điểm kinh nghiệm', icon: Zap, color: '#47B78F', bg: '#E7F8F2', suffix: ' XP' },
] as const

export function StudentDashboard() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync<DashboardData>('/dashboard/student')
  if (loading) return <PageLoader />
  if (error || !data) return <ErrorState message={error || 'Không có dữ liệu.'} onRetry={reload} />
  const firstName = user?.name.split(' ').slice(-1)[0] || 'bạn'
  const maxActivity = Math.max(...data.weeklyActivity.map(item => item.count), 1)
  const xpInLevel = data.stats.totalXp % 500
  const today = new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
    <section className="relative overflow-hidden rounded-[28px] border border-white bg-gradient-to-r from-[#ECE8FF] via-[#F0EDFF] to-[#E9F7FA] px-6 py-6 sm:px-8 lg:min-h-[196px] lg:px-10">
      <div className="soft-grid absolute inset-0 opacity-40" /><div className="absolute -right-12 -top-20 h-64 w-64 rounded-full bg-white/35 blur-xl" />
      <div className="relative z-10 max-w-xl"><p className="mb-2 text-[11px] font-semibold capitalize text-[#8D86A8]">{today}</p><h2 className="text-[25px] font-extrabold tracking-[-.8px] text-[#332D54] sm:text-[29px]">Chào {firstName}, hôm nay học gì nhỉ? <span className="inline-block text-primary-500">✦</span></h2><p className="mt-2 text-xs leading-6 text-[#7D7696] sm:text-[13px]">Một chút nỗ lực mỗi ngày tạo nên hành trình lớn. Orbi luôn ở đây cùng bạn!</p><Link to="/exams" className="mt-5 inline-flex items-center gap-2 rounded-2xl bg-primary-500 px-5 py-3 text-xs font-bold text-white shadow-button transition hover:bg-primary-600">Khám phá đề thi <ArrowRight size={16} /></Link></div>
      <div className="absolute -bottom-5 right-8 hidden md:block"><Mascot size={185} mood="encouraging" /></div>
      <motion.div animate={{ y: [0, -8, 0], rotate: [-4, 4, -4] }} transition={{ duration: 4.2, repeat: Infinity }} className="absolute right-6 top-3 hidden lg:block"><StarBuddy size={78} /></motion.div>
      <div className="absolute right-[210px] top-8 hidden items-center gap-2 rounded-2xl border border-white/80 bg-white/70 px-3.5 py-2.5 shadow-soft backdrop-blur xl:flex"><span className="rounded-xl bg-[#FFF1DE] p-2 text-warning"><Flame size={17} fill="currentColor" /></span><div><p className="text-sm font-extrabold">{data.stats.streak} ngày</p><p className="text-[9px] text-muted">Chuỗi học tập</p></div></div>
    </section>

    <section aria-label="Thống kê học tập" className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
      {statConfig.map((item, index) => <motion.div key={item.key} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .06 }} className="card p-4 sm:p-5"><div className="flex items-start justify-between gap-2"><span className="rounded-2xl p-2.5" style={{ color: item.color, background: item.bg }}><item.icon size={20} /></span>{index === 1 && <Badge tone="green"><TrendingUp size={11} />Tích lũy</Badge>}</div><p className="mt-4 text-[22px] font-extrabold tracking-[-.6px] sm:text-[26px]">{data.stats[item.key]}<span className="ml-1 text-xs font-semibold text-muted">{item.suffix}</span></p><p className="mt-1 text-[10px] font-medium text-muted sm:text-[11px]">{item.label}</p></motion.div>)}
    </section>

    <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
      <section className="card p-5 sm:p-6">
        <div className="flex items-start justify-between"><div><h3 className="text-[15px] font-bold">Nhịp độ học tập</h3><p className="mt-1 text-[11px] text-muted">Số bài bạn hoàn thành trong 7 ngày qua</p></div><span className="rounded-xl bg-[#F6F5FB] p-2 text-primary-500"><LineChart size={19} /></span></div>
        <div className="mt-7 flex h-[170px] items-end gap-2 sm:gap-4" role="img" aria-label="Biểu đồ hoạt động 7 ngày">
          {data.weeklyActivity.map((item, index) => <div key={item.day} className="flex h-full flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-bold text-primary-600">{item.count || ''}</span><motion.div initial={{ height: 0 }} animate={{ height: `${Math.max(item.count / maxActivity * 115, 7)}px` }} transition={{ delay: .2 + index * .05, type: 'spring' }} className={`w-full max-w-9 rounded-t-xl ${index === data.weeklyActivity.length - 1 ? 'bg-gradient-to-t from-primary-500 to-[#AA9CF3]' : item.count ? 'bg-[#D8D0FC]' : 'bg-[#F0EFF6]'}`} /><span className="text-[9px] font-medium text-muted sm:text-[10px]">{item.label}</span></div>)}
        </div>
      </section>
      <section className="card p-5 sm:p-6"><div className="flex items-start justify-between"><div><h3 className="text-[15px] font-bold">Kỹ năng của bạn</h3><p className="mt-1 text-[11px] text-muted">Độ chính xác theo môn học</p></div><Link to="/history" className="text-[11px] font-semibold text-primary-600">Chi tiết</Link></div><div className="mt-6 space-y-5">{data.skillProgress.length ? data.skillProgress.slice(0, 4).map(skill => { const meta = getSubjectMeta(skill.subject); return <div key={skill.subject}><div className="mb-2 flex items-center justify-between text-xs"><span className="flex items-center gap-2 font-semibold"><span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />{skill.subject}</span><span className="font-bold" style={{ color: meta.color }}>{skill.percentage}%</span></div><div className="h-2 overflow-hidden rounded-full bg-[#F0F0F6]"><motion.div initial={{ width: 0 }} animate={{ width: `${skill.percentage}%` }} transition={{ duration: .8 }} className="h-full rounded-full" style={{ background: meta.color }} /></div></div> }) : <p className="py-8 text-center text-xs text-muted">Hoàn thành bài đầu tiên để xem phân tích kỹ năng.</p>}</div></section>
    </div>

    <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]">
      <section className="card overflow-hidden"><div className="flex items-center justify-between px-5 py-5 sm:px-6"><div><h3 className="text-[15px] font-bold">Bài làm gần đây</h3><p className="mt-1 text-[11px] text-muted">Theo dõi kết quả và xem hướng dẫn giải</p></div><Link to="/history" className="flex items-center gap-1 text-[11px] font-semibold text-primary-600">Xem tất cả <ChevronRight size={14} /></Link></div>{data.recentAttempts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[580px] text-left"><thead><tr className="border-y border-[#F0F0F5] bg-[#FAFAFD] text-[9px] font-bold uppercase tracking-[1px] text-muted"><th className="px-6 py-3">Đề thi</th><th className="px-4 py-3">Ngày làm</th><th className="px-4 py-3">Kết quả</th><th className="px-6 py-3 text-right">Thao tác</th></tr></thead><tbody>{data.recentAttempts.slice(0, 4).map(attempt => { const meta = getSubjectMeta(attempt.subject); return <tr key={attempt.id} className="border-b border-[#F4F4F8] last:border-0"><td className="px-6 py-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl text-[9px] font-extrabold" style={{ color: meta.color, background: meta.soft }}>{meta.short}</span><div><Link to={`/results/${attempt.id}`} className="line-clamp-1 max-w-[230px] text-xs font-bold hover:text-primary-600">{attempt.examTitle}</Link><p className="mt-1 text-[10px] text-muted">{attempt.subject}</p></div></div></td><td className="px-4 py-4 text-[10px] text-muted">{formatDate(attempt.submittedAt)}</td><td className="px-4 py-4"><span className={`text-sm font-extrabold ${attempt.percentage >= 80 ? 'text-success' : attempt.percentage >= 50 ? 'text-primary-600' : 'text-danger'}`}>{attempt.percentage}%</span></td><td className="px-6 py-4 text-right"><Link to={`/results/${attempt.id}`} className="text-[10px] font-bold text-primary-600 hover:underline">Xem lại</Link></td></tr>})}</tbody></table></div> : <EmptyState title="Bài làm đầu tiên đang chờ bạn" description="Chọn một đề thi phù hợp và bắt đầu chinh phục mục tiêu." action={<Link to="/exams" className="text-xs font-bold text-primary-600">Mở kho đề thi</Link>} />}</section>
      <div className="space-y-6"><section className="card p-5 sm:p-6"><div className="flex items-center justify-between"><div><h3 className="text-[15px] font-bold">Gợi ý cho bạn</h3><p className="mt-1 text-[11px] text-muted">Lựa chọn dựa trên tiến độ</p></div><Sparkles size={19} className="text-warning" /></div><div className="mt-4 space-y-2">{data.recommendedExams.slice(0, 2).map(exam => <Link to="/exams" key={exam.id}><RecommendationCard exam={exam} /></Link>)}{!data.recommendedExams.length && <p className="py-6 text-center text-xs text-muted">Chưa có đề thi phù hợp.</p>}</div></section><section className="relative overflow-hidden rounded-3xl bg-[#30294F] p-5 text-white"><div className="absolute -right-8 -top-8 h-28 w-28 rounded-full bg-primary-400/20 blur-xl" /><div className="flex items-center gap-4"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10"><Award size={24} className="text-[#FFD48A]" /></span><div><p className="text-[10px] text-white/60">CẤP ĐỘ HIỆN TẠI</p><p className="mt-1 text-lg font-extrabold">Level {data.stats.level} · Nhà chinh phục</p></div></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#A99AF3] to-cyan" style={{ width: `${xpInLevel / 5}%` }} /></div><p className="mt-2 flex items-center gap-1.5 text-[10px] text-white/60"><Star size={11} />{500 - xpInLevel} XP nữa để lên cấp tiếp theo</p></section></div>
    </div>
  </motion.div>
}
