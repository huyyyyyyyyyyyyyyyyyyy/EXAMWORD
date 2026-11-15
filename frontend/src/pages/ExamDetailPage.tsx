import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen, Clock3, Globe2, Headphones, Layers, Lock, Play, RotateCcw, ShieldCheck, Sparkles, Target } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Exam } from '../types'
import { api, jsonBody } from '../services/api'
import type { Attempt } from '../types'
import { useAsync } from '../hooks/useAsync'
import { useToast } from '../stores/ToastContext'
import { friendlyError, getSubjectMeta } from '../utils'
import { Badge, Button, ErrorState, PageLoader } from '../components/ui'
import { Comments } from '../components/Comments'
import { OwlProfessor } from '../components/Characters'

const difficultyLabel = { easy: 'Cơ bản', medium: 'Trung bình', hard: 'Nâng cao' }

export function ExamDetailPage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { data: exam, loading, error, reload } = useAsync<Exam>(examId ? `/exams/${examId}` : null)
  const [starting, setStarting] = useState(false)

  const parts = useMemo(() => {
    const map = new Map<string, number>()
    for (const question of exam?.questions || []) {
      const key = question.partTitle?.trim() || 'Câu hỏi'
      map.set(key, (map.get(key) ?? 0) + 1)
    }
    return [...map.entries()]
  }, [exam])

  const start = async () => {
    if (!exam) return
    if (exam.activeAttemptId) { navigate(`/exam/${exam.activeAttemptId}`); return }
    setStarting(true)
    try {
      const attempt = await api<Attempt>('/attempts/start', { method: 'POST', body: jsonBody({ examId: exam.id }) })
      navigate(`/exam/${attempt.id}`)
    } catch (reason) { showToast(friendlyError(reason, 'Không thể bắt đầu bài thi.'), 'error'); setStarting(false) }
  }

  if (loading) return <PageLoader label="Đang mở đề thi..." />
  if (error || !exam) return <ErrorState message={error || 'Không tìm thấy đề thi.'} onRetry={reload} />

  const meta = getSubjectMeta(exam.subject)
  const isPublic = exam.visibility === 'public' && exam.status === 'published'
  const hasListening = Boolean(exam.audioUrl) && exam.subject === 'Tiếng Anh'
  const attemptsExhausted = exam.maxAttempts > 0 && (exam.attemptsUsed || 0) >= exam.maxAttempts && !exam.activeAttemptId

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-5xl">
      <Link to="/exams" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-muted transition hover:text-primary-600"><ArrowLeft size={16} />Kho đề thi</Link>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="card relative overflow-hidden p-6 sm:p-8">
            <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-50 blur-2xl" style={{ background: meta.soft }} />
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-extrabold" style={{ color: meta.color, background: meta.soft }}>{meta.short}</span>
                <Badge tone={exam.difficulty === 'easy' ? 'green' : exam.difficulty === 'hard' ? 'pink' : 'orange'}>{difficultyLabel[exam.difficulty]}</Badge>
                <Badge tone={exam.visibility === 'public' ? 'blue' : 'purple'}>{exam.visibility === 'public' ? <><Globe2 size={12} />Công khai</> : <><Lock size={12} />Theo lớp</>}</Badge>
                <Badge tone={exam.mode === 'test' ? 'purple' : 'green'}>{exam.mode === 'test' ? 'Đề kiểm tra' : 'Đề luyện tập'}</Badge>
                {hasListening && <Badge tone="pink"><Headphones size={12} />Có bài nghe</Badge>}
              </div>
              <p className="mt-5 text-[11px] font-bold uppercase tracking-[1.3px]" style={{ color: meta.color }}>{exam.subject} · {exam.grade}</p>
              <h1 className="mt-2 text-2xl font-extrabold leading-tight tracking-[-.6px] sm:text-[28px]">{exam.title}</h1>
              {exam.description && <p className="mt-3 max-w-2xl text-sm leading-6 text-muted">{exam.description}</p>}
              <div className="mt-6 flex flex-wrap gap-3">
                <span className="flex items-center gap-2 rounded-2xl bg-[#F7F8FC] px-4 py-2.5 text-xs font-semibold text-slate-600"><BookOpen size={16} className="text-primary-500" />{exam.questionCount} câu hỏi</span>
                <span className="flex items-center gap-2 rounded-2xl bg-[#F7F8FC] px-4 py-2.5 text-xs font-semibold text-slate-600"><Clock3 size={16} className="text-primary-500" />{exam.durationMinutes} phút</span>
                <span className="flex items-center gap-2 rounded-2xl bg-[#F7F8FC] px-4 py-2.5 text-xs font-semibold text-slate-600"><Target size={16} className="text-primary-500" />{exam.totalPoints} điểm</span>
              </div>
              <Button size="lg" className="mt-7 w-full sm:w-auto" loading={starting} disabled={attemptsExhausted} onClick={start}>{attemptsExhausted ? 'Đã hết lượt làm bài' : exam.activeAttemptId ? 'Tiếp tục làm bài' : 'Vào làm bài ngay'} {exam.activeAttemptId ? <RotateCcw size={17} /> : <Play size={17} fill="currentColor" />}</Button>
              <p className="mt-3 text-[11px] font-medium text-muted">{exam.activeAttemptId ? 'Bạn có một bài làm đang được lưu. Hãy tiếp tục trước khi hết giờ.' : exam.maxAttempts > 0 ? `Đã dùng ${exam.attemptsUsed || 0}/${exam.maxAttempts} lượt làm bài.` : 'Bạn có thể luyện tập nhiều lần để củng cố kiến thức.'}</p>
            </div>
          </section>

          <section className="card p-6">
            <h3 className="flex items-center gap-2 text-sm font-extrabold"><ShieldCheck size={17} className="text-primary-500" />Hình thức & quy định</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#E7E3F7] bg-[#FAF9FF] p-4"><p className="flex items-center gap-2 text-xs font-bold text-primary-700"><RotateCcw size={15} />{exam.mode === 'test' ? 'Đề kiểm tra' : 'Đề luyện tập'}</p><p className="mt-2 text-[11px] leading-5 text-muted">{exam.maxAttempts > 0 ? `Tối đa ${exam.maxAttempts} lượt cho mỗi học sinh.` : 'Không giới hạn số lượt làm bài.'} {exam.mode === 'test' ? 'Kết quả được ghi nhận ngay khi nộp bài.' : 'Xem giải thích và làm lại để tiến bộ.'}</p></div>
              <div className={`rounded-2xl border p-4 ${exam.antiCheat ? 'border-[#F6DCA8] bg-[#FFFBF2]' : 'border-[#DCEFE7] bg-[#F5FCF8]'}`}><p className={`flex items-center gap-2 text-xs font-bold ${exam.antiCheat ? 'text-[#A66A16]' : 'text-[#248D69]'}`}><ShieldCheck size={15} />{exam.antiCheat ? 'Phòng thi được giám sát' : 'Làm bài thông thường'}</p><p className="mt-2 text-[11px] leading-5 text-muted">{exam.antiCheat ? `Rời tab, sao chép hoặc mở công cụ phát triển sẽ được ghi nhận; quá ${exam.maxViolations} cảnh báo, bài tự nộp. Trình duyệt không thể chặn tuyệt đối AI hoặc công cụ bên ngoài — hãy làm bài trung thực.` : 'Tập trung đọc kỹ câu hỏi, tự lưu câu trả lời và nộp bài khi hoàn thành.'}</p></div>
            </div>
          </section>

          {parts.length > 0 && (
            <section className="card p-6">
              <h3 className="flex items-center gap-2 text-sm font-extrabold"><Layers size={17} className="text-primary-500" />Cấu trúc đề thi</h3>
              <ul className="mt-4 space-y-2.5">
                {parts.map(([title, count], index) => (
                  <li key={title} className="flex items-center gap-3 rounded-2xl border border-[#EEF0F6] bg-[#FAFBFE] px-4 py-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-[11px] font-bold text-primary-600">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink">{title}</span>
                    <span className="shrink-0 text-[11px] font-medium text-muted">{count} câu</span>
                  </li>
                ))}
              </ul>
              {hasListening && <p className="mt-4 flex items-start gap-2 rounded-2xl bg-[#EAF9FC] p-3 text-[11px] leading-5 text-[#2C8FA3]"><Headphones size={15} className="mt-0.5 shrink-0" />Khi vào phần nghe, âm thanh sẽ đếm ngược 3‑2‑1 rồi tự động phát. Bạn chỉ nghe trong phần listening của đề.</p>}
            </section>
          )}

          {isPublic ? <Comments examId={exam.id} /> : (
            <section className="card flex items-center gap-4 p-6">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-500"><Lock size={22} /></span>
              <div><h3 className="text-sm font-bold">Thảo luận dành cho đề công khai</h3><p className="mt-1 text-xs leading-5 text-muted">Đề này được giới hạn theo lớp nên chưa mở bình luận. Các đề công khai sẽ có khu vực thảo luận riêng.</p></div>
            </section>
          )}
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24">
          <section className="card overflow-hidden">
            <div className="flex flex-col items-center bg-gradient-to-br from-[#F4F1FF] to-[#EEF7FB] px-5 pb-2 pt-6 text-center">
              <OwlProfessor size={150} />
              <p className="text-sm font-extrabold">Giáo sư Cú Mèo</p>
              <p className="mt-1 text-[11px] leading-5 text-muted">“Đọc kỹ hướng dẫn từng phần, làm câu chắc trước rồi quay lại câu khó sau nhé!”</p>
            </div>
            <div className="space-y-3 p-5">
              <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[1px] text-primary-500"><Sparkles size={14} />Mẹo làm bài</p>
              <ul className="space-y-2.5 text-[11px] leading-5 text-slate-600">
                <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />Canh thời gian: {exam.durationMinutes} phút cho {exam.questionCount} câu.</li>
                <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />Đánh dấu câu chưa chắc để xem lại trước khi nộp.</li>
                <li className="flex gap-2"><span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />Bài làm tự lưu — có thể tải lại trang an toàn.</li>
              </ul>
            </div>
          </section>
        </aside>
      </div>
    </motion.div>
  )
}