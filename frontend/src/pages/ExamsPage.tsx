import { useMemo, useState } from 'react'
import { Search, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAsync } from '../hooks/useAsync'
import type { Exam } from '../types'
import { ExamCard } from '../components/ExamCard'
import { EmptyState, ErrorState, PageLoader } from '../components/ui'

const defaultSubjects = ['Tất cả', 'Tiếng Anh', 'Toán học', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lý', 'Ngữ văn', 'Tin học']

export function ExamsPage() {
  const [params, setParams] = useSearchParams()
  const search = params.get('search') || ''
  const subject = params.get('subject') || 'Tất cả'
  const mode = params.get('mode') || 'all'
  const [sort, setSort] = useState('newest')
  const path = `/exams?search=${encodeURIComponent(search)}&subject=${encodeURIComponent(subject === 'Tất cả' ? '' : subject)}`
  const { data, loading, error, reload } = useAsync<Exam[]>(path)
  const { data: subjectData } = useAsync<string[] | { subjects: string[] }>('/exams/subjects')
  const subjects = Array.isArray(subjectData) ? ['Tất cả', ...subjectData] : subjectData?.subjects ? ['Tất cả', ...subjectData.subjects] : defaultSubjects
  const exams = useMemo(() => {
    const items = (data || []).filter(exam => mode === 'all' || exam.mode === mode)
    if (sort === 'duration') items.sort((a, b) => a.durationMinutes - b.durationMinutes)
    if (sort === 'title') items.sort((a, b) => a.title.localeCompare(b.title, 'vi'))
    if (sort === 'newest') items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return items
  }, [data, mode, sort])
  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'Tất cả' && value !== 'all') next.set(key, value); else next.delete(key)
    setParams(next, { replace: true })
  }
  return <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
    <section className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><span className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[1.3px] text-primary-500"><Sparkles size={14} />Mỗi bài thi là một bước tiến</span><h2 className="text-[26px] font-extrabold tracking-[-.8px]">Tìm đề phù hợp với bạn</h2><p className="mt-2 text-xs leading-5 text-muted">Luyện tập có mục tiêu, nhận kết quả và hướng dẫn chi tiết ngay.</p></div><p className="text-xs font-medium text-muted"><strong className="text-lg font-extrabold text-ink">{exams.length}</strong> đề thi khả dụng</p></section>
    <section className="card mb-6 p-4 sm:p-5"><div className="flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={event => update('search', event.target.value)} className="field pl-11" placeholder="Tìm theo tên đề thi..." aria-label="Tìm theo tên đề thi" /></div><div className="relative md:w-44"><select value={mode} onChange={event => update('mode', event.target.value)} className="field appearance-none" aria-label="Lọc theo hình thức đề"><option value="all">Mọi hình thức</option><option value="practice">Đề luyện tập</option><option value="test">Đề kiểm tra</option></select></div><div className="relative md:w-48"><SlidersHorizontal size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" /><select value={sort} onChange={event => setSort(event.target.value)} className="field appearance-none pl-10" aria-label="Sắp xếp đề thi"><option value="newest">Mới nhất</option><option value="duration">Thời gian ngắn</option><option value="title">Tên A – Z</option></select></div></div><div className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">{subjects.map(item => <button key={item} onClick={() => update('subject', item)} className={`whitespace-nowrap rounded-xl px-4 py-2 text-[11px] font-semibold transition ${subject === item ? 'bg-primary-500 text-white shadow-button' : 'bg-[#F5F5FA] text-muted hover:bg-primary-50 hover:text-primary-600'}`}>{item}</button>)}</div></section>
    {loading ? <PageLoader label="Đang tìm những đề thi phù hợp..." /> : error ? <ErrorState message={error} onRetry={reload} /> : exams.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{exams.map((exam, index) => <motion.div key={exam.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * .05, .3) }}><ExamCard exam={exam} /></motion.div>)}</div> : <div className="card"><EmptyState title="Không tìm thấy đề thi phù hợp" description="Thử từ khóa khác hoặc xem toàn bộ các môn học." action={<button onClick={() => setParams({})} className="rounded-xl bg-primary-50 px-4 py-2 text-xs font-bold text-primary-600">Xóa bộ lọc</button>} /></div>}
  </motion.div>
}
