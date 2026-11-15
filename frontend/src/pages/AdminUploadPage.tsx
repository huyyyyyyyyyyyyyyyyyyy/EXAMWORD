import { useRef, useState } from 'react'
import type { DragEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, BookOpen, CheckCircle2, ClipboardCheck, Eye, FileText, FileUp, Globe2, Headphones, KeyRound, Lock, Minus, Plus, ShieldCheck, Sparkles, Trash2, UsersRound, Wand2 } from 'lucide-react'
import { Badge, Button } from '../components/ui'
import { api, jsonBody } from '../services/api'
import type { ClassRoom, Exam, ExamMode, QuestionOption, Visibility } from '../types'
import { useAsync } from '../hooks/useAsync'
import { useSound } from '../stores/SoundContext'
import { useToast } from '../stores/ToastContext'
import { friendlyError } from '../utils'
import { parseExamFiles } from '../lib/examParser'
import type { ParsedQuestion, ParseResult } from '../lib/examParser'

interface CreatedResult { exam: Exam; questions: ParsedQuestion[]; warnings: string[]; missingAnswers: number; published: boolean }

const EXAM_ACCEPT = '.docx,.pdf,.txt,.xlsx,.xls'
const AUDIO_ACCEPT = '.mp3,.wav,.m4a,.ogg,audio/*'
const subjects = ['Tiếng Anh', 'Toán học', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lý', 'Ngữ văn', 'Tin học', 'GDCD', 'Giáo dục kinh tế và pháp luật']
const grades = ['Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9', 'Lớp 10', 'Lớp 11', 'Lớp 12', 'Ôn đại học']
const attemptOptions = [0, 1, 2, 3, 5]
const modeOptions = [
  { value: 'practice', title: 'Luyện tập', desc: 'Làm lại nhiều lần để củng cố kiến thức, không áp lực.', icon: BookOpen },
  { value: 'test', title: 'Kiểm tra', desc: 'Mặc định 1 lượt, bật giám sát như phòng thi thật.', icon: ClipboardCheck },
] as const
const clampViolations = (value: number) => Number.isFinite(value) ? Math.max(1, Math.min(10, Math.round(value))) : 3
const typeLabels: Record<string, string> = { single: 'Một đáp án', multiple: 'Nhiều đáp án', truefalse: 'Đúng / Sai', fill: 'Điền từ', short: 'Trả lời ngắn', math: 'Biểu thức toán', essay: 'Tự luận', matching: 'Nối đáp án', order: 'Sắp xếp thứ tự' }

async function uploadExamAudio(examId: string, file: File) {
  const { uploadUrl } = await api<{ uploadUrl: string }>(`/admin/exams/${examId}/audio`, { method: 'POST' })
  const response = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
  if (!response.ok) throw new Error('Không thể tải file âm thanh lên máy chủ.')
  await api(`/admin/exams/${examId}/audio/complete`, { method: 'POST' })
}

function FileDrop({ label, hint, icon, file, accept, required, onChange }: { label: string; hint: string; icon: ReactNode; file: File | null; accept: string; required?: boolean; onChange: (file: File | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const drop = (event: DragEvent) => {
    event.preventDefault()
    setOver(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) onChange(dropped)
  }
  return <div>
    <label className="field-label">{label} {required && <span className="text-danger">*</span>}</label>
    <div
      onDragOver={event => { event.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={`flex min-h-[148px] flex-col items-center justify-center rounded-3xl border-2 border-dashed p-5 text-center transition ${over ? 'border-primary-400 bg-primary-50' : file ? 'border-success bg-[#F0FAF7]' : 'border-[#DDD9F3] bg-[#FCFBFF]'}`}
    >
      <input ref={input} type="file" accept={accept} className="hidden" onChange={event => { onChange(event.target.files?.[0] || null); event.target.value = '' }} />
      {file ? <>
        <span className="rounded-2xl bg-white p-3 text-success shadow-soft"><CheckCircle2 size={22} /></span>
        <p className="mt-3 max-w-full truncate text-xs font-bold">{file.name}</p>
        <p className="mt-1 text-[10px] text-muted">{(file.size / 1024).toFixed(0)} KB</p>
        <button type="button" onClick={() => onChange(null)} className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-danger"><Trash2 size={13} />Bỏ file</button>
      </> : <>
        <span className="rounded-2xl bg-white p-3 text-primary-600 shadow-soft">{icon}</span>
        <p className="mt-3 text-xs font-bold">Kéo thả file vào đây</p>
        <p className="mt-1 text-[10px] text-muted">{hint}</p>
        <button type="button" onClick={() => input.current?.click()} className="mt-3 rounded-xl bg-primary-50 px-4 py-2 text-[11px] font-bold text-primary-600 hover:bg-primary-100">Chọn file</button>
      </>}
    </div>
  </div>
}

function isCorrect(question: ParsedQuestion, option: QuestionOption) {
  return Array.isArray(question.correctAnswer) ? question.correctAnswer.includes(option.id) : question.correctAnswer === option.id
}

function PreviewList({ questions }: { questions: ParsedQuestion[] }) {
  return <div className="space-y-3">
    {questions.map((question, index) => {
      const answer = Array.isArray(question.correctAnswer) ? question.correctAnswer.join(', ') : question.correctAnswer
      const prev = questions[index - 1]
      const firstOfPart = question.partInstruction && (!prev || prev.partInstruction !== question.partInstruction || prev.partTitle !== question.partTitle)
      return <div key={question.id}>
        {firstOfPart && <div className="mb-3 rounded-2xl border border-[#CFE3FA] bg-[#F3F8FE] p-4">
          {question.partTitle && <p className="text-xs font-extrabold uppercase tracking-wide text-blue">{question.partTitle}</p>}
          <p className={`whitespace-pre-line text-[11px] leading-5 text-[#3A6EA5] ${question.partTitle ? 'mt-1.5' : ''}`}>{question.partInstruction}</p>
        </div>}
        <div className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary-500 text-[11px] font-bold text-white">{index + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="whitespace-pre-line text-xs font-semibold leading-5">{question.content}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone="blue">{typeLabels[question.type] || question.type}</Badge>
                {answer ? <Badge tone="green">Đáp án: {answer}</Badge> : <Badge tone="orange">Chưa có đáp án</Badge>}
              </div>
              {question.options.length > 0 && <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
                {question.options.map(option => <li key={option.id} className={`rounded-xl px-3 py-2 text-[11px] ${isCorrect(question, option) ? 'bg-[#E9F8F2] font-semibold text-[#237A5B]' : 'bg-[#F7F8FC] text-slate-600'}`}><strong className="mr-1.5">{option.label}.</strong>{option.text}</li>)}
              </ul>}
              {question.explanation && <p className="mt-3 text-[10px] leading-5 text-muted">Giải thích: {question.explanation}</p>}
            </div>
          </div>
        </div>
      </div>
    })}
  </div>
}

function Warnings({ items }: { items: string[] }) {
  if (!items.length) return null
  return <div className="rounded-2xl border border-[#FBE2B7] bg-[#FFF9EE] p-4">
    <p className="flex items-center gap-2 text-xs font-bold text-[#B7791F]"><AlertTriangle size={15} />Cần kiểm tra ({items.length})</p>
    <ul className="mt-2 list-disc space-y-1 pl-5 text-[11px] leading-5 text-[#8A5A12]">{items.slice(0, 12).map((item, index) => <li key={index}>{item}</li>)}</ul>
    {items.length > 12 && <p className="mt-2 text-[10px] text-[#8A5A12]">… và {items.length - 12} cảnh báo khác.</p>}
  </div>
}

export function AdminUploadPage() {
  const { showToast } = useToast()
  const { play } = useSound()
  const { data: classes } = useAsync<ClassRoom[]>('/classes')
  const [examFile, setExamFile] = useState<File | null>(null)
  const [answerFile, setAnswerFile] = useState<File | null>(null)
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [subject, setSubject] = useState('Tiếng Anh')
  const [grade, setGrade] = useState('Lớp 10')
  const [duration, setDuration] = useState(30)
  const [difficulty, setDifficulty] = useState<Exam['difficulty']>('medium')
  const [perQuestion, setPerQuestion] = useState(1)
  const [visibility, setVisibility] = useState<Visibility>('public')
  const [classIds, setClassIds] = useState<string[]>([])
  const [mode, setMode] = useState<ExamMode>('practice')
  const [maxAttempts, setMaxAttempts] = useState(0)
  const [antiCheat, setAntiCheat] = useState(false)
  const [maxViolations, setMaxViolations] = useState(3)
  const [publish, setPublish] = useState(true)
  const [busy, setBusy] = useState<'preview' | 'create' | null>(null)
  const [preview, setPreview] = useState<ParseResult | null>(null)
  const [created, setCreated] = useState<CreatedResult | null>(null)

  const setFile = (setter: (file: File | null) => void) => (file: File | null) => { setter(file); setPreview(null); setCreated(null) }
  const toggleClass = (id: string) => { play('toggle'); setClassIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]) }
  const chooseVisibility = (value: Visibility) => { play('toggle'); setVisibility(value) }
  const changeSubject = (value: string) => {
    setSubject(value)
    if (value !== 'Tiếng Anh' && audioFile) {
      setAudioFile(null)
      showToast('Đã bỏ file âm thanh — phần nghe chỉ hỗ trợ môn Tiếng Anh.', 'info')
    }
  }
  const chooseMode = (value: ExamMode) => {
    play('toggle')
    setMode(value)
    setMaxAttempts(value === 'test' ? 1 : 0)
    setAntiCheat(value === 'test')
  }
  const toggleAntiCheat = () => { play('toggle'); setAntiCheat(current => !current) }
  const stepViolations = (delta: number) => { play('toggle'); setMaxViolations(current => clampViolations(current + delta)) }

  const runPreview = async () => {
    if (!examFile) { showToast('Hãy chọn file đề thi trước.', 'error'); return }
    setBusy('preview')
    try {
      const result = await parseExamFiles(examFile, answerFile)
      setPreview(result)
      if (!title) setTitle(result.title)
      showToast(`Nhận diện được ${result.questions.length} câu hỏi.`, result.questions.length ? 'success' : 'error')
    } catch (reason) { showToast(friendlyError(reason, 'Không thể phân tích file.'), 'error') } finally { setBusy(null) }
  }

  const runCreate = async () => {
    if (!examFile) { showToast('Hãy chọn file đề thi trước.', 'error'); return }
    if (visibility === 'restricted' && !classIds.length) { showToast('Đề giới hạn cần được gán cho ít nhất một lớp.', 'error'); return }
    setBusy('create')
    try {
      const result = preview || await parseExamFiles(examFile, answerFile)
      if (!result.questions.length) { showToast('Không nhận diện được câu hỏi nào để tạo đề.', 'error'); setBusy(null); return }
      const points = Math.min(100, Math.max(1, Math.round(perQuestion) || 1))
      const payload = {
        title: title.trim() || result.title, description, subject, grade, durationMinutes: duration, difficulty, visibility,
        mode, maxAttempts, antiCheat, maxViolations: clampViolations(maxViolations),
        classIds: visibility === 'restricted' ? classIds : [],
        questions: result.questions.map((question, index) => ({
          content: question.content, type: question.type, options: question.options.length ? question.options : null,
          correctAnswer: question.correctAnswer, explanation: question.explanation || '', points, topic: question.topic || '',
          partTitle: question.partTitle || '', partInstruction: question.partInstruction || '', order: index + 1,
        })),
      }
      const exam = await api<Exam>('/admin/exams', { method: 'POST', body: jsonBody(payload) })
      let published = false
      if (publish && result.missingAnswers === 0) { await api(`/admin/exams/${exam.id}/publish`, { method: 'POST' }); published = true }
      if (audioFile && subject === 'Tiếng Anh') await uploadExamAudio(exam.id, audioFile)
      play('complete')
      setCreated({ exam, questions: result.questions, warnings: result.warnings, missingAnswers: result.missingAnswers, published })
      setPreview(null)
      showToast(published ? 'Đã tạo và xuất bản đề thi.' : 'Đã tạo đề thi (bản nháp).')
    } catch (reason) { showToast(friendlyError(reason, 'Không thể tạo đề thi.'), 'error') } finally { setBusy(null) }
  }

  const reset = () => { setExamFile(null); setAnswerFile(null); setAudioFile(null); setTitle(''); setDescription(''); setPreview(null); setCreated(null); setClassIds([]); setVisibility('public') }

  if (created) {
    const exam = created.exam
    const summaryMode = exam.mode || mode
    const summaryAttempts = exam.maxAttempts ?? maxAttempts
    const summaryAntiCheat = exam.antiCheat ?? antiCheat
    const summaryViolations = exam.maxViolations ?? maxViolations
    return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-3xl space-y-5">
      <section className="card p-6 text-center sm:p-8">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#E9F8F2] text-success"><CheckCircle2 size={30} /></span>
        <h2 className="mt-4 text-xl font-extrabold tracking-[-.5px]">Đã tạo đề thi “{exam.title}”</h2>
        <p className="mt-2 text-xs text-muted">{exam.questionCount} câu hỏi · {exam.totalPoints} điểm · {exam.durationMinutes} phút</p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Badge tone={created.published ? 'green' : 'orange'}>{created.published ? 'Đã xuất bản — học sinh có thể làm bài' : 'Bản nháp — cần xuất bản để học sinh làm bài'}</Badge>
          <Badge tone={exam.visibility === 'restricted' ? 'purple' : 'blue'}>{exam.visibility === 'restricted' ? 'Theo lớp' : 'Công khai'}</Badge>
          <Badge tone={summaryMode === 'test' ? 'orange' : 'green'}>{summaryMode === 'test' ? 'Kiểm tra' : 'Luyện tập'}</Badge>
          <Badge tone="gray">{summaryAttempts === 0 ? 'Không giới hạn lượt' : `${summaryAttempts} lượt làm`}</Badge>
          {summaryAntiCheat && <Badge tone="purple">Giám sát · tự nộp sau {summaryViolations} vi phạm</Badge>}
          {audioFile && subject === 'Tiếng Anh' && <Badge tone="pink">Có audio nghe</Badge>}
        </div>
        {created.missingAnswers > 0 && <p className="mt-3 text-[11px] text-[#B7791F]">{created.missingAnswers} câu chưa có đáp án. Hãy bổ sung trong trình biên tập rồi xuất bản.</p>}
        <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
          <Link to={`/admin/exams/${exam.id}/edit`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary-500 px-5 py-3 text-xs font-bold text-white shadow-button">Xem & chỉnh sửa đề</Link>
          <Link to="/admin/exams" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#DDD9F3] bg-white px-5 py-3 text-xs font-bold text-primary-600">Danh sách đề thi</Link>
          <Button variant="ghost" onClick={reset}>Tải đề khác</Button>
        </div>
      </section>
      <Warnings items={created.warnings} />
      <section><h3 className="mb-3 text-sm font-bold">Câu hỏi đã tạo</h3><PreviewList questions={created.questions} /></section>
    </motion.div>
  }

  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-5xl">
    <section className="mb-7">
      <h2 className="text-[26px] font-extrabold tracking-[-.8px]">Tải đề & tạo đề tự động</h2>
      <p className="mt-2 text-xs text-muted">Tải file đề (Word, PDF, Excel, TXT) và file đáp án. Hệ thống tự tách câu hỏi, giữ chú thích từng phần và các chỗ trống, gán đáp án rồi tạo đề thi để học sinh làm bài ngay.</p>
    </section>
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <section className="card grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
          <FileDrop label="File đề thi" hint="Word, PDF, Excel hoặc TXT · tối đa 10 MB" icon={<FileUp size={22} />} file={examFile} accept={EXAM_ACCEPT} required onChange={setFile(setExamFile)} />
          <FileDrop label="File đáp án (nếu có)" hint="Có thể bỏ trống nếu đáp án nằm trong đề" icon={<KeyRound size={22} />} file={answerFile} accept={EXAM_ACCEPT} onChange={setFile(setAnswerFile)} />
          {subject === 'Tiếng Anh' ? <div className="sm:col-span-2">
            <FileDrop label="File âm thanh bài nghe (nếu có)" hint="MP3, WAV, M4A, OGG · chỉ dành cho môn Tiếng Anh" icon={<Headphones size={22} />} file={audioFile} accept={AUDIO_ACCEPT} onChange={setFile(setAudioFile)} />
          </div> : <p className="flex items-center gap-2 self-start rounded-2xl bg-[#F7F8FC] px-4 py-3 text-[10px] leading-4 text-muted sm:col-span-2"><Headphones size={14} className="shrink-0" />Phần nghe chỉ khả dụng với môn Tiếng Anh. Đổi môn học sẽ bỏ file âm thanh đã chọn.</p>}
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-primary-50 p-2.5 text-primary-600"><FileText size={20} /></span><div><h3 className="text-sm font-bold">Thông tin đề thi</h3><p className="mt-1 text-[10px] text-muted">Có thể chỉnh lại sau trong trình biên tập</p></div></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="field-label" htmlFor="up-title">Tên đề thi</label><input id="up-title" className="field" value={title} onChange={event => setTitle(event.target.value)} placeholder="Để trống để dùng tên suy ra từ file" /></div>
            <div className="sm:col-span-2"><label className="field-label" htmlFor="up-desc">Mô tả</label><textarea id="up-desc" className="field resize-none" rows={2} value={description} onChange={event => setDescription(event.target.value)} placeholder="Phạm vi kiến thức, mục tiêu bài thi (không bắt buộc)" /></div>
            <div><label className="field-label" htmlFor="up-subject">Môn học</label><select id="up-subject" className="field" value={subject} onChange={event => changeSubject(event.target.value)}>{subjects.map(item => <option key={item}>{item}</option>)}</select></div>
            <div><label className="field-label" htmlFor="up-grade">Khối lớp</label><select id="up-grade" className="field" value={grade} onChange={event => setGrade(event.target.value)}>{grades.map(item => <option key={item}>{item}</option>)}</select></div>
            <div><label className="field-label" htmlFor="up-duration">Thời gian (phút)</label><input id="up-duration" type="number" min={1} max={600} className="field" value={duration} onChange={event => setDuration(Number(event.target.value))} /></div>
            <div><label className="field-label" htmlFor="up-difficulty">Độ khó</label><select id="up-difficulty" className="field" value={difficulty} onChange={event => setDifficulty(event.target.value as Exam['difficulty'])}><option value="easy">Cơ bản</option><option value="medium">Trung bình</option><option value="hard">Nâng cao</option></select></div>
            <div><label className="field-label" htmlFor="up-points">Điểm mỗi câu</label><input id="up-points" type="number" min={1} max={100} step={1} className="field" value={perQuestion} onChange={event => setPerQuestion(Number(event.target.value))} /></div>
            <label className="flex items-center gap-3 self-end rounded-2xl bg-[#F7F8FC] px-4 py-3 text-xs font-semibold"><input type="checkbox" checked={publish} onChange={event => { setPublish(event.target.checked); play('toggle') }} className="h-4 w-4 accent-[#8171E8]" />Xuất bản ngay nếu đủ đáp án</label>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-[#FFF3E4] p-2.5 text-[#D99A45]"><ShieldCheck size={20} /></span><div><h3 className="text-sm font-bold">Hình thức & lượt làm</h3><p className="mt-1 text-[10px] text-muted">Cách học sinh tham gia bài làm và giới hạn số lượt</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Hình thức làm bài">
            {modeOptions.map(({ value, title, desc, icon: Icon }) => <label key={value} className="relative cursor-pointer">
              <input type="radio" name="up-mode" value={value} checked={mode === value} onChange={() => chooseMode(value)} className="peer sr-only" />
              <span className={`flex h-full items-start gap-3 rounded-2xl border p-4 transition peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-200 ${mode === value ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-400' : 'border-slate-200 bg-white hover:border-primary-300'}`}>
                <span className={`mt-0.5 rounded-xl p-2 ${mode === value ? 'bg-primary-500 text-white' : 'bg-slate-100 text-muted'}`}><Icon size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-bold">{title}{mode === value && <CheckCircle2 size={14} className="text-primary-500" />}</span>
                  <span className="mt-1 block text-[10px] leading-4 text-muted">{desc}</span>
                </span>
              </span>
            </label>)}
          </div>
          <div className="mt-5 grid gap-5 sm:grid-cols-2">
            <div>
              <label className="field-label" htmlFor="up-attempts">Giới hạn lượt làm</label>
              <select id="up-attempts" className="field" value={maxAttempts} onChange={event => { play('toggle'); setMaxAttempts(Number(event.target.value)) }}>
                {attemptOptions.map(value => <option key={value} value={value}>{value === 0 ? 'Không giới hạn' : `${value} lượt`}</option>)}
              </select>
              <p className="mt-1.5 text-[10px] leading-4 text-muted">{maxAttempts === 0 ? 'Học sinh được làm lại bao nhiêu lần tùy thích.' : `Mỗi học sinh được làm tối đa ${maxAttempts} lần.`}</p>
            </div>
            <div className="flex flex-col justify-between rounded-2xl border border-[#E2DEF6] bg-[#FBFAFF] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold">Giám sát gian lận</p>
                  <p className="mt-1 text-[10px] leading-4 text-muted">Cảnh báo chuyển tab, sao chép/dán và mở công cụ phát triển.</p>
                </div>
                <button type="button" role="switch" aria-checked={antiCheat} aria-label="Bật giám sát gian lận" onClick={toggleAntiCheat} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${antiCheat ? 'bg-primary-500' : 'bg-[#D8D5E8]'}`}>
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${antiCheat ? 'translate-x-5' : 'translate-x-0'}`} />
                </button>
              </div>
              <p className={`mt-2 text-[10px] font-semibold ${antiCheat ? 'text-primary-600' : 'text-muted'}`}>{antiCheat ? 'Đang bật — bài làm được giám sát.' : 'Đang tắt — không giám sát hành vi.'}</p>
            </div>
          </div>
          {antiCheat && <div className="panel-in mt-4 rounded-2xl border border-[#FBE2B7] bg-[#FFF9EE] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <label htmlFor="up-violations" className="text-xs font-bold text-[#8A5A12]">Tự nộp bài sau số vi phạm</label>
                <p className="mt-1 text-[10px] leading-4 text-[#8A5A12]">Vượt ngưỡng này, bài làm tự động nộp và ghi nhận vi phạm.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="inline-flex items-center overflow-hidden rounded-xl border border-[#EBD9B4] bg-white">
                  <button type="button" onClick={() => stepViolations(-1)} disabled={maxViolations <= 1} aria-label="Giảm ngưỡng vi phạm" className="flex h-10 w-9 items-center justify-center text-[#8A5A12] transition hover:bg-[#FFF3E4] disabled:opacity-40"><Minus size={14} /></button>
                  <input id="up-violations" type="number" min={1} max={10} value={maxViolations} onChange={event => setMaxViolations(clampViolations(Number(event.target.value)))} className="h-10 w-12 border-x border-[#EBD9B4] text-center text-sm font-bold text-[#8A5A12] outline-none" />
                  <button type="button" onClick={() => stepViolations(1)} disabled={maxViolations >= 10} aria-label="Tăng ngưỡng vi phạm" className="flex h-10 w-9 items-center justify-center text-[#8A5A12] transition hover:bg-[#FFF3E4] disabled:opacity-40"><Plus size={14} /></button>
                </div>
                <span className="text-[10px] font-semibold text-[#8A5A12]">vi phạm (1–10)</span>
              </div>
            </div>
          </div>}
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-[#EAF3FD] p-2.5 text-blue"><Eye size={20} /></span><div><h3 className="text-sm font-bold">Phạm vi hiển thị</h3><p className="mt-1 text-[10px] text-muted">Ai có thể nhìn thấy và làm đề thi này</p></div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => chooseVisibility('public')} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${visibility === 'public' ? 'border-blue bg-[#F3F8FE] ring-1 ring-blue' : 'border-slate-200 bg-white hover:border-blue'}`}>
              <span className={`mt-0.5 rounded-xl p-2 ${visibility === 'public' ? 'bg-blue text-white' : 'bg-slate-100 text-muted'}`}><Globe2 size={18} /></span>
              <span><span className="block text-xs font-bold">Công khai</span><span className="mt-1 block text-[10px] leading-4 text-muted">Mọi học sinh đều có thể tìm thấy và làm bài.</span></span>
            </button>
            <button type="button" onClick={() => chooseVisibility('restricted')} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${visibility === 'restricted' ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-slate-200 bg-white hover:border-primary-400'}`}>
              <span className={`mt-0.5 rounded-xl p-2 ${visibility === 'restricted' ? 'bg-primary-500 text-white' : 'bg-slate-100 text-muted'}`}><Lock size={18} /></span>
              <span><span className="block text-xs font-bold">Theo lớp</span><span className="mt-1 block text-[10px] leading-4 text-muted">Chỉ học sinh thuộc các lớp được chọn mới làm được.</span></span>
            </button>
          </div>
          {visibility === 'restricted' && <div className="mt-4">
            <p className="mb-2 flex items-center gap-2 text-[11px] font-bold text-ink"><UsersRound size={14} className="text-primary-500" />Chọn lớp được làm đề</p>
            {classes && classes.length > 0 ? <div className="flex flex-wrap gap-2">
              {classes.map(item => <button key={item.id} type="button" onClick={() => toggleClass(item.id)} className={`rounded-xl border px-3.5 py-2 text-[11px] font-semibold transition ${classIds.includes(item.id) ? 'border-primary-500 bg-primary-500 text-white' : 'border-[#DDD9F3] bg-white text-slate-600 hover:border-primary-400'}`}>{item.name} · {item.studentCount} HS</button>)}
            </div> : <p className="rounded-2xl bg-[#FFF9EE] p-3 text-[11px] leading-5 text-[#8A5A12]">Bạn chưa có lớp nào. Hãy <Link to="/admin/classes" className="font-bold underline">tạo lớp và thêm học sinh</Link> trước khi đăng đề giới hạn.</p>}
          </div>}
        </section>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" loading={busy === 'preview'} disabled={!examFile || busy !== null} onClick={runPreview}><Eye size={16} />Xem trước kết quả</Button>
          <Button loading={busy === 'create'} disabled={!examFile || busy !== null} onClick={runCreate}><Wand2 size={16} />Tạo đề thi tự động</Button>
        </div>

        {preview && <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-3"><h3 className="text-sm font-bold">Kết quả phân tích</h3><Badge tone="purple">{preview.questions.length} câu</Badge>{preview.missingAnswers > 0 ? <Badge tone="orange">{preview.missingAnswers} câu thiếu đáp án</Badge> : preview.questions.length > 0 && <Badge tone="green">Đủ đáp án</Badge>}</div>
          <Warnings items={preview.warnings} />
          <PreviewList questions={preview.questions} />
        </section>}
      </div>

      <aside className="card p-5 lg:sticky lg:top-24">
        <h3 className="flex items-center gap-2 text-sm font-bold"><Sparkles size={16} className="text-primary-500" />Định dạng được nhận diện</h3>
        <ul className="mt-4 space-y-3 text-[11px] leading-5 text-slate-600">
          <li><strong className="text-ink">Câu hỏi:</strong> “Câu 1.”, “Câu 1:”, “1.” ; phương án A. B. C. D. (mỗi dòng hoặc cùng một dòng).</li>
          <li><strong className="text-ink">Chú thích phần:</strong> tiêu đề “PART/LISTENING…” và dòng hướng dẫn (ví dụ “You will hear… Listen and do Task 1…”) được giữ lại và hiển thị trước mỗi phần.</li>
          <li><strong className="text-ink">Chỗ trống:</strong> các gạch dưới “______” trong file Word được giữ nguyên để học sinh điền.</li>
          <li><strong className="text-ink">Đáp án:</strong> dòng “Đáp án: B” trong đề, mục “ĐÁP ÁN” cuối file, hoặc file riêng dạng “1. A”, “1-B”, “1A 2B 3C”, bảng ngang Câu/Đáp án.</li>
          <li><strong className="text-ink">Nhiều đáp án:</strong> “A,C” hoặc “AC”. <strong className="text-ink">Điền từ:</strong> nhiều đáp án chấp nhận cách nhau bởi |.</li>
          <li><strong className="text-ink">Word:</strong> phương án gạch chân, tô sáng hoặc chữ đỏ được hiểu là đáp án đúng.</li>
          <li><strong className="text-ink">Excel:</strong> cột Câu hỏi, A, B, C, D, Đáp án, Giải thích.</li>
        </ul>
        <p className="mt-4 rounded-2xl bg-primary-50 p-3 text-[10px] leading-5 text-primary-700">File được phân tích ngay trên trình duyệt. Công thức/hình ảnh nhúng trong Word chưa được đọc — hãy xem trước kết quả và kiểm tra lại trước khi xuất bản.</p>
      </aside>
    </div>
  </motion.div>
}