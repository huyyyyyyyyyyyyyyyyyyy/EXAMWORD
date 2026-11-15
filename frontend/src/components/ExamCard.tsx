import { useState } from 'react'
import { ArrowUpRight, BookOpen, Clock3, MessageCircle, Play, RotateCcw, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import type { Exam } from '../types'
import { friendlyError, getSubjectMeta } from '../utils'
import { api, jsonBody } from '../services/api'
import type { Attempt } from '../types'
import { useToast } from '../stores/ToastContext'
import { Badge, Button } from './ui'

const difficultyLabel = { easy: 'Cơ bản', medium: 'Trung bình', hard: 'Nâng cao' }

export function ExamCard({ exam, compact = false }: { exam: Exam; compact?: boolean }) {
  const meta = getSubjectMeta(exam.subject)
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)
  const start = async () => {
    if (exam.mode === 'test') { navigate(`/exams/${exam.id}`); return }
    setLoading(true)
    try {
      const attempt = await api<Attempt>('/attempts/start', { method: 'POST', body: jsonBody({ examId: exam.id }) })
      navigate(`/exam/${attempt.id}`)
    } catch (error) {
      showToast(friendlyError(error, 'Không thể bắt đầu bài thi.'), 'error')
    } finally { setLoading(false) }
  }
  return <motion.article whileHover={{ y: -4 }} transition={{ duration: .2 }} className={`card group relative flex flex-col overflow-hidden ${compact ? 'p-5' : 'p-6'}`}>
    <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-[70px] opacity-60 transition group-hover:scale-110" style={{ background: meta.soft }} />
    <div className="relative flex items-start justify-between">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-extrabold" style={{ color: meta.color, background: meta.soft }}>{meta.short}</span>
      <div className="flex flex-col items-end gap-1.5"><Badge tone={exam.difficulty === 'easy' ? 'green' : exam.difficulty === 'hard' ? 'pink' : 'orange'}>{difficultyLabel[exam.difficulty]}</Badge><Badge tone={exam.mode === 'test' ? 'purple' : 'blue'}>{exam.mode === 'test' ? 'Kiểm tra' : 'Luyện tập'}</Badge></div>
    </div>
    <div className="mt-5 flex-1">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-[1px]" style={{ color: meta.color }}>{exam.subject} · {exam.grade}</p>
      <h3 className="line-clamp-2 text-[16px] font-bold leading-6 tracking-[-.2px] text-ink"><Link to={`/exams/${exam.id}`} className="transition hover:text-primary-600">{exam.title}</Link></h3>
      {!compact && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{exam.description}</p>}
    </div>
    <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-100 pt-4 text-[11px] font-medium text-muted">
      <span className="flex items-center gap-1.5"><BookOpen size={14} />{exam.questionCount} câu</span><span className="flex items-center gap-1.5"><Clock3 size={14} />{exam.durationMinutes} phút</span>{exam.maxAttempts > 0 && <span className="flex items-center gap-1.5"><RotateCcw size={14} />{exam.maxAttempts} lượt</span>}{exam.visibility === 'public' && <Link to={`/exams/${exam.id}`} className="flex items-center gap-1.5 transition hover:text-primary-600"><MessageCircle size={14} />{exam.commentCount ?? 0}</Link>}<span className="ml-auto font-semibold text-ink">{exam.totalPoints} điểm</span>
    </div>
    <Button onClick={start} loading={loading} variant="secondary" className="mt-4 w-full group-hover:bg-primary-500 group-hover:text-white">{exam.mode === 'test' ? 'Xem đề & quy định' : 'Vào làm bài'} <Play size={15} fill="currentColor" /></Button>
  </motion.article>
}

export function RecommendationCard({ exam }: { exam: Exam }) {
  const meta = getSubjectMeta(exam.subject)
  return <Link to={`/exams/${exam.id}`} className="flex items-center gap-4 rounded-2xl border border-slate-100 p-4 transition hover:border-primary-200 hover:bg-primary-50/30"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-extrabold" style={{ color: meta.color, background: meta.soft }}>{meta.short}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{exam.title}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-muted"><Sparkles size={12} />{exam.subject} · {exam.questionCount} câu hỏi</p></div><ArrowUpRight size={18} className="text-muted" /></Link>
}
