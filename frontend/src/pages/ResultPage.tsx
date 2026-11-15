import { useMemo, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { AlertCircle, ArrowLeft, BookOpenCheck, Check, CheckCircle2, ChevronDown, Clock3, Download, Lightbulb, RefreshCw, ShieldAlert, Target, X, XCircle } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useAsync } from '../hooks/useAsync'
import type { ExamResult, ResultAnswer } from '../types'
import { Badge, Button, ErrorState, PageLoader } from '../components/ui'
import { Mascot } from '../components/Mascot'
import { StarBuddy } from '../components/Characters'
import { api, jsonBody } from '../services/api'
import type { Attempt } from '../types'
import { formatDuration, friendlyError } from '../utils'
import { useToast } from '../stores/ToastContext'

function answerText(value: string | string[] | null, answer: ResultAnswer) {
  if (value === null || value === '') return 'Chưa trả lời'
  const values = Array.isArray(value) ? value : [value]
  if (!values.length || !values[0]) return 'Chưa trả lời'
  return values.map(item => {
    const option = answer.question.options?.find(option => option.id === item)
    return option ? `${option.label}. ${option.text}` : item
  }).join(' · ')
}

export function ResultPage() {
  const { attemptId } = useParams()
  const { data, loading, error, reload } = useAsync<ExamResult>(attemptId ? `/results/${attemptId}` : null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'correct' | 'wrong'>('all')
  const [retrying, setRetrying] = useState(false)
  const navigate = useNavigate()
  const { showToast } = useToast()
  const weakTopics = useMemo(() => {
    if (!data) return []
    const counts = data.answers.filter(answer => answer.isCorrect === false).reduce<Record<string, number>>((result, answer) => { const topic = answer.question.topic || data.exam.subject; result[topic] = (result[topic] || 0) + 1; return result }, {})
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [data])
  if (loading) return <PageLoader label="Đang tổng hợp kết quả của bạn..." />
  if (error || !data) return <ErrorState message={error || 'Không tìm thấy kết quả.'} onRetry={reload} />
  const { attempt, exam } = data
  const percentage = attempt.maxScore ? Math.round(attempt.score / attempt.maxScore * 100) : 0
  const filtered = data.answers.filter(answer => filter === 'all' || (filter === 'correct' ? answer.isCorrect === true : answer.isCorrect === false))
  const retry = async () => {
    setRetrying(true)
    try { const next = await api<Attempt>('/attempts/start', { method: 'POST', body: jsonBody({ examId: exam.id }) }); navigate(`/exam/${next.id}`) } catch (reason) { showToast(friendlyError(reason, 'Không thể tạo lượt thi mới.'), 'error') } finally { setRetrying(false) }
  }
  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-6xl space-y-6">
    <Link to="/history" className="no-print inline-flex items-center gap-2 text-xs font-semibold text-muted hover:text-primary-600"><ArrowLeft size={16} />Quay lại lịch sử</Link>
    <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#30294F] via-[#493D78] to-[#6956B6] p-6 text-white sm:p-9">
      <div className="soft-grid absolute inset-0 opacity-20" /><div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan/10 blur-2xl" />
      {percentage >= 80 && <motion.div animate={{ y: [0, -9, 0], rotate: [-5, 5, -5] }} transition={{ duration: 3.8, repeat: Infinity }} className="absolute right-4 top-3 hidden xl:block"><StarBuddy size={84} /></motion.div>}
      <div className="relative grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]"><div><Badge tone={percentage >= 80 ? 'green' : 'orange'} className="mb-4">{percentage >= 80 ? 'Xuất sắc' : percentage >= 50 ? 'Hoàn thành' : 'Cố gắng thêm nhé'}</Badge><h1 className="text-[26px] font-extrabold leading-tight tracking-[-.7px]">{percentage >= 80 ? 'Tuyệt vời, bạn đã làm rất tốt!' : 'Mỗi lỗi sai là một cơ hội tiến bộ!'}</h1><p className="mt-3 max-w-md text-xs leading-6 text-white/65">{exam.title}</p><div className="no-print mt-6 flex flex-wrap gap-3"><Button variant="secondary" onClick={() => window.print()}><Download size={16} />Xuất PDF</Button><Button onClick={retry} loading={retrying} disabled={exam.maxAttempts === 1} className="bg-white text-primary-700 shadow-none hover:bg-primary-50"><RefreshCw size={16} />{exam.maxAttempts === 1 ? 'Đề chỉ cho phép 1 lượt' : 'Làm lại đề'}</Button></div></div><div className="relative mx-auto flex h-40 w-40 items-center justify-center"><svg className="absolute inset-0 -rotate-90" viewBox="0 0 160 160"><circle cx="80" cy="80" r="67" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="11" /><motion.circle cx="80" cy="80" r="67" fill="none" stroke="#73D8E6" strokeWidth="11" strokeLinecap="round" strokeDasharray={421} initial={{ strokeDashoffset: 421 }} animate={{ strokeDashoffset: 421 - 421 * percentage / 100 }} transition={{ duration: 1.2 }} /></svg><div className="text-center"><p className="text-[38px] font-extrabold tracking-[-2px]">{percentage}<span className="text-xl text-cyan">%</span></p><p className="text-[10px] text-white/60">{attempt.score}/{attempt.maxScore} điểm</p></div></div><Mascot mood={percentage >= 80 ? 'celebrating' : 'encouraging'} size={180} className="mx-auto hidden md:block" /></div>
    </section>
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[
      { label: 'Câu đúng', value: attempt.correctCount, icon: CheckCircle2, color: 'text-success bg-[#E8F8F2]' },
      { label: 'Câu sai', value: attempt.incorrectCount, icon: XCircle, color: 'text-danger bg-[#FDEFF3]' },
      { label: 'Chưa trả lời', value: attempt.unanswered, icon: AlertCircle, color: 'text-warning bg-[#FFF3E4]' },
      { label: 'Thời gian làm bài', value: formatDuration(attempt.timeSpent), icon: Clock3, color: 'text-blue bg-[#EAF3FD]' },
    ].map(item => <div key={item.label} className="card flex items-center gap-3 p-4 sm:p-5"><span className={`rounded-2xl p-2.5 ${item.color}`}><item.icon size={20} /></span><div><p className="text-lg font-extrabold sm:text-xl">{item.value}</p><p className="mt-0.5 text-[9px] text-muted sm:text-[10px]">{item.label}</p></div></div>)}</section>
    {attempt.violations > 0 && <section className="flex items-start gap-3 rounded-2xl border border-[#F3D9A4] bg-[#FFFBF2] p-4 text-[#8A5A12]"><ShieldAlert size={20} className="mt-0.5 shrink-0" /><div><h2 className="text-xs font-bold">Bài làm có {attempt.violations} cảnh báo giám sát</h2><p className="mt-1 text-[11px] leading-5">Các lần rời tab hoặc thao tác bị hạn chế đã được ghi nhận. Ở những lượt sau, hãy giữ màn hình làm bài mở và tự trả lời bằng kiến thức của mình.</p></div></section>}
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <section className="card overflow-hidden"><div className="border-b border-slate-100 p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><h2 className="text-[16px] font-bold">Chi tiết bài làm</h2><p className="mt-1 text-[11px] text-muted">Xem đáp án và giải thích từng câu</p></div><div className="no-print flex gap-1 rounded-xl bg-[#F5F5FA] p-1">{(['all', 'correct', 'wrong'] as const).map(item => <button key={item} onClick={() => setFilter(item)} className={`rounded-lg px-3 py-1.5 text-[10px] font-semibold transition ${filter === item ? 'bg-white text-primary-600 shadow-sm' : 'text-muted'}`}>{item === 'all' ? 'Tất cả' : item === 'correct' ? 'Câu đúng' : 'Câu sai'}</button>)}</div></div></div><div className="divide-y divide-slate-100">{filtered.map((answer, index) => <article key={answer.questionId} className="p-5 sm:p-6"><button onClick={() => setExpanded(expanded === answer.questionId ? null : answer.questionId)} className="flex w-full items-start gap-3 text-left"><span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold ${answer.isCorrect ? 'bg-[#E8F8F2] text-success' : answer.isCorrect === false ? 'bg-[#FDEFF3] text-danger' : 'bg-[#FFF3E4] text-warning'}`}>{answer.isCorrect ? <Check size={15} /> : answer.isCorrect === false ? <X size={15} /> : index + 1}</span><div className="min-w-0 flex-1"><p className="line-clamp-2 text-xs font-semibold leading-6 sm:text-[13px]">Câu {answer.question.order}. {answer.question.content}</p><p className="mt-1.5 text-[10px] text-muted">{answer.pointsAwarded}/{answer.question.points} điểm · {answer.question.topic}</p></div><ChevronDown size={17} className={`mt-1 shrink-0 text-muted transition ${expanded === answer.questionId ? 'rotate-180' : ''}`} /></button><AnimatePresence>{expanded === answer.questionId && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><div className="ml-10 mt-4 space-y-3"><div className={`rounded-2xl p-4 text-xs leading-6 ${answer.isCorrect ? 'bg-[#F0FAF7]' : 'bg-[#FFF5F7]'}`}><p className="font-bold">Câu trả lời của bạn</p><p className="mt-1 whitespace-pre-wrap text-slate-600">{answerText(answer.value, answer)}</p></div>{answer.isCorrect === false && <div className="rounded-2xl bg-[#F0FAF7] p-4 text-xs leading-6"><p className="font-bold text-[#248D69]">Đáp án đúng</p><p className="mt-1 text-slate-600">{answerText(answer.correctAnswer, answer)}</p></div>}{answer.explanation && <div className="rounded-2xl border border-primary-100 bg-primary-50/60 p-4 text-xs leading-6"><p className="flex items-center gap-1.5 font-bold text-primary-700"><Lightbulb size={15} />Giải thích</p><p className="mt-1 whitespace-pre-wrap text-slate-600">{answer.explanation}</p></div>}</div></motion.div>}</AnimatePresence></article>)}</div></section>
      <aside className="space-y-5"><section className="card p-5"><span className="mb-4 inline-flex rounded-2xl bg-[#FFF3E4] p-2.5 text-warning"><Target size={21} /></span><h2 className="text-sm font-bold">Kiến thức cần ôn tập</h2><p className="mt-1 text-[10px] leading-5 text-muted">Dựa trên các câu chưa chính xác</p><div className="mt-4 space-y-2">{weakTopics.length ? weakTopics.map(([topic, count]) => <div key={topic} className="flex items-center justify-between rounded-xl bg-[#F8F8FC] p-3"><span className="text-[11px] font-semibold">{topic}</span><Badge tone="orange">{count} lỗi</Badge></div>) : <div className="rounded-xl bg-[#F0FAF7] p-4 text-center text-[11px] leading-5 text-[#248D69]"><BookOpenCheck size={20} className="mx-auto mb-2" />Không có chủ đề yếu. Hãy duy trì phong độ!</div>}</div></section><section className="no-print card p-5"><h2 className="text-sm font-bold">Bước tiếp theo</h2><p className="mt-2 text-[11px] leading-5 text-muted">Xem lại lỗi sai trước, sau đó làm lại đề để đánh giá mức độ ghi nhớ.</p><Link to="/exams" className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary-50 px-4 py-3 text-[11px] font-bold text-primary-600">Chọn đề luyện tập</Link></section></aside>
    </div>
  </motion.div>
}
