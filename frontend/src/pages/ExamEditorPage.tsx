import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Clock3, Copy, Eye, FileText, Globe2, GripVertical, Headphones, ImagePlus, Lock, Plus, Save, ShieldCheck, Trash2, UsersRound } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button, PageLoader } from '../components/ui'
import { api, jsonBody } from '../services/api'
import type { ClassRoom, Exam, Question, QuestionType, Visibility } from '../types'
import { useAsync } from '../hooks/useAsync'
import { useSound } from '../stores/SoundContext'
import { useToast } from '../stores/ToastContext'
import { ProtectedImage } from '../components/ProtectedImage'

const newId = () => `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const choiceOptions = () => [{ id: 'A', label: 'A', text: '' }, { id: 'B', label: 'B', text: '' }, { id: 'C', label: 'C', text: '' }, { id: 'D', label: 'D', text: '' }]
const emptyQuestion = (order: number): Question => ({ id: newId(), content: '', type: 'single', options: choiceOptions(), points: 1, topic: '', order, correctAnswer: 'A', explanation: '', partTitle: '', partInstruction: '' })
const emptyExam: Exam = { id: '', title: '', description: '', subject: 'Tiếng Anh', grade: 'Lớp 10', durationMinutes: 30, status: 'draft', difficulty: 'medium', questionCount: 0, totalPoints: 0, createdAt: '', updatedAt: '', visibility: 'public', ownerId: '', audioUrl: null, classIds: [], questions: [emptyQuestion(1)], mode: 'practice', maxAttempts: 0, antiCheat: false, maxViolations: 3 }
const typeOptions: { value: QuestionType; label: string }[] = [{ value: 'single', label: 'Một đáp án' }, { value: 'multiple', label: 'Nhiều đáp án' }, { value: 'truefalse', label: 'Đúng / Sai' }, { value: 'fill', label: 'Điền từ' }, { value: 'short', label: 'Trả lời ngắn' }, { value: 'math', label: 'Biểu thức toán' }, { value: 'matching', label: 'Nối đáp án' }, { value: 'order', label: 'Sắp xếp thứ tự' }, { value: 'essay', label: 'Tự luận' }]

export function ExamEditorPage() {
  const { examId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { play } = useSound()
  const [exam, setExam] = useState<Exam>(emptyExam)
  const [loading, setLoading] = useState(Boolean(examId))
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState<number>(0)
  const [imageFiles, setImageFiles] = useState<Record<string, File>>({})
  const [removedImages, setRemovedImages] = useState<string[]>([])
  const [audioFile, setAudioFile] = useState<File | null>(null)
  const savedIdRef = useRef(examId)
  const { data: classes } = useAsync<ClassRoom[]>('/classes')

  useEffect(() => {
    if (!examId) return
    api<Exam>(`/exams/${examId}`)
      .then(result => { setExam({ ...result, classIds: result.classIds || [], questions: result.questions?.length ? result.questions : [emptyQuestion(1)] }); setLoading(false) })
      .catch(reason => { showToast(reason.message, 'error'); setLoading(false) })
  }, [examId, showToast])

  const questions = exam.questions || []
  const classIds = exam.classIds || []
  const totalPoints = useMemo(() => questions.reduce((sum, question) => sum + (Math.round(Number(question.points)) || 0), 0), [questions])
  const updateExam = <K extends keyof Exam>(key: K, value: Exam[K]) => setExam(current => ({ ...current, [key]: value }))
  const updateQuestion = (index: number, patch: Partial<Question>) => setExam(current => ({ ...current, questions: current.questions?.map((question, itemIndex) => itemIndex === index ? { ...question, ...patch } : question) }))
  const setImage = (index: number, file: File | null) => {
    const question = questions[index]
    if (file && (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024)) { showToast('Ảnh cần là PNG, JPG, WebP hoặc GIF và không quá 8 MB.', 'error'); return }
    setImageFiles(current => { const next = { ...current }; if (file) next[question.id] = file; else delete next[question.id]; return next })
    if (!file && !imageFiles[question.id] && question.imageUrl) { setRemovedImages(current => [...new Set([...current, question.id])]); updateQuestion(index, { imageUrl: null }) }
  }

  const changeType = (index: number, type: QuestionType) => {
    play('toggle')
    const options = ['single', 'multiple'].includes(type) ? choiceOptions() : type === 'truefalse' ? [{ id: 'A', label: 'A', text: 'Đúng' }, { id: 'B', label: 'B', text: 'Sai' }] : null
    updateQuestion(index, { type, options, correctAnswer: type === 'multiple' ? [] : ['single', 'truefalse'].includes(type) ? 'A' : '' })
  }
  const setVisibility = (visibility: Visibility) => { play('toggle'); updateExam('visibility', visibility) }
  const toggleClass = (id: string) => { play('toggle'); updateExam('classIds', classIds.includes(id) ? classIds.filter(item => item !== id) : [...classIds, id]) }

  const validate = () => {
    if (!exam.title.trim() || !exam.subject.trim()) return 'Vui lòng nhập tên đề thi và môn học.'
    if (!questions.length) return 'Đề thi cần có ít nhất một câu hỏi.'
    if (exam.visibility === 'restricted' && !classIds.length) return 'Đề giới hạn cần được gán cho ít nhất một lớp.'
    for (const [index, question] of questions.entries()) {
      if (!question.content.trim()) return `Câu ${index + 1} chưa có nội dung.`
      if (['single', 'multiple', 'truefalse'].includes(question.type) && (question.options || []).some(option => !option.text.trim())) return `Câu ${index + 1} còn phương án trống.`
      if (question.type !== 'essay' && (!question.correctAnswer || (Array.isArray(question.correctAnswer) && !question.correctAnswer.length))) return `Câu ${index + 1} chưa có đáp án chuẩn.`
    }
    return ''
  }

  const save = async (publish = false) => {
    const validation = validate()
    if (validation) { showToast(validation, 'error'); return }
    setSaving(true)
    try {
      const payload = {
        title: exam.title, description: exam.description, subject: exam.subject, grade: exam.grade,
        durationMinutes: exam.durationMinutes, difficulty: exam.difficulty, visibility: exam.visibility,
        mode: exam.mode, maxAttempts: exam.maxAttempts, antiCheat: exam.antiCheat, maxViolations: exam.maxViolations,
        classIds: exam.visibility === 'restricted' ? classIds : [],
        questions: questions.map((question, index) => ({
          content: question.content, type: question.type, options: question.options, correctAnswer: question.correctAnswer,
          explanation: question.explanation, points: Math.round(Number(question.points)) || 1, topic: question.topic,
          partTitle: question.partTitle || '', partInstruction: question.partInstruction || '', order: index + 1,
        })),
      }
      const targetId = savedIdRef.current
      const saved = await api<Exam>(targetId ? `/admin/exams/${targetId}` : '/admin/exams', { method: targetId ? 'PUT' : 'POST', body: jsonBody(payload) })
      savedIdRef.current = saved.id
      const savedQuestions = saved.questions || []
      for (const [index, question] of questions.entries()) {
        const target = savedQuestions[index]
        const file = imageFiles[question.id]
        if (!target || !file) continue
        const { uploadUrl } = await api<{ uploadUrl: string }>(`/admin/questions/${target.id}/image`, { method: 'POST' })
        const response = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type || 'application/octet-stream' } })
        if (!response.ok) throw new Error('Không thể tải hình minh họa lên máy chủ.')
        await api(`/admin/questions/${target.id}/image/complete`, { method: 'POST' })
      }
      for (const questionId of removedImages) {
        const target = savedQuestions.find(item => item.id === questionId)
        if (target) await api(`/admin/questions/${target.id}/image`, { method: 'DELETE' })
      }
      if (audioFile && exam.subject === 'Tiếng Anh') {
        const { uploadUrl } = await api<{ uploadUrl: string }>(`/admin/exams/${saved.id}/audio`, { method: 'POST' })
        const response = await fetch(uploadUrl, { method: 'PUT', body: audioFile, headers: { 'Content-Type': audioFile.type || 'application/octet-stream' } })
        if (!response.ok) throw new Error('Không thể tải âm thanh lên máy chủ.')
        await api(`/admin/exams/${saved.id}/audio/complete`, { method: 'POST' })
      }
      if (publish) await api(`/admin/exams/${saved.id}/publish`, { method: 'POST' })
      play('success')
      showToast(publish ? 'Đã lưu và xuất bản đề thi.' : 'Đã lưu bản nháp.')
      navigate('/admin/exams')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Không thể lưu đề thi.'
      showToast(message === 'exam_has_attempts' ? 'Đề đã có lượt làm bài nên không thể sửa câu hỏi. Bạn vẫn có thể đổi tiêu đề và phân quyền.' : message, 'error')
    } finally { setSaving(false) }
  }

  if (loading) return <PageLoader label="Đang mở trình biên tập..." />
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Link to="/admin/exams" className="mb-3 inline-flex items-center gap-2 text-[11px] font-semibold text-muted hover:text-primary-600"><ArrowLeft size={15} />Quản lý đề thi</Link>
          <h2 className="text-2xl font-extrabold tracking-[-.6px]">{examId ? 'Chỉnh sửa đề thi' : 'Tạo đề thi mới'}</h2>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" loading={saving} onClick={() => save(false)}><Save size={16} />Lưu nháp</Button>
          <Button loading={saving} onClick={() => save(true)}><CheckCircle2 size={16} />Lưu & xuất bản</Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <section className="card p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="rounded-xl bg-primary-50 p-2.5 text-primary-600"><FileText size={20} /></span>
              <div><h3 className="text-sm font-bold">Thông tin chung</h3><p className="mt-1 text-[10px] text-muted">Thông tin hiển thị với học sinh</p></div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="field-label" htmlFor="exam-title">Tên đề thi *</label><input id="exam-title" value={exam.title} onChange={event => updateExam('title', event.target.value)} className="field" placeholder="Ví dụ: Kiểm tra Tiếng Anh Unit 4" /></div>
              <div className="sm:col-span-2"><label className="field-label" htmlFor="exam-description">Mô tả</label><textarea id="exam-description" value={exam.description} onChange={event => updateExam('description', event.target.value)} className="field resize-none" rows={3} placeholder="Phạm vi kiến thức và mục tiêu của bài thi..." /></div>
              <div><label className="field-label">Môn học</label><select value={exam.subject} onChange={event => { updateExam('subject', event.target.value); if (event.target.value !== 'Tiếng Anh') setAudioFile(null) }} className="field">{['Tiếng Anh', 'Toán học', 'Vật lý', 'Hóa học', 'Sinh học', 'Lịch sử', 'Địa lý', 'Ngữ văn', 'Tin học'].map(item => <option key={item}>{item}</option>)}</select></div>
              <div><label className="field-label">Khối lớp</label><select value={exam.grade} onChange={event => updateExam('grade', event.target.value)} className="field">{['Lớp 6', 'Lớp 7', 'Lớp 8', 'Lớp 9', 'Lớp 10', 'Lớp 11', 'Lớp 12', 'Ôn đại học'].map(item => <option key={item}>{item}</option>)}</select></div>
              <div><label className="field-label">Thời gian (phút)</label><input type="number" min={1} max={600} value={exam.durationMinutes} onChange={event => updateExam('durationMinutes', Number(event.target.value))} className="field" /></div>
              <div><label className="field-label">Độ khó</label><select value={exam.difficulty} onChange={event => updateExam('difficulty', event.target.value as Exam['difficulty'])} className="field"><option value="easy">Cơ bản</option><option value="medium">Trung bình</option><option value="hard">Nâng cao</option></select></div>
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3"><span className="rounded-xl bg-[#FFF3E4] p-2.5 text-warning"><ShieldCheck size={20} /></span><div><h3 className="text-sm font-bold">Hình thức & bảo vệ phòng thi</h3><p className="mt-1 text-[10px] text-muted">Thiết lập cách học sinh tham gia bài làm</p></div></div>
            <div className="grid gap-3 sm:grid-cols-2">{(['practice', 'test'] as const).map(mode => <button key={mode} type="button" onClick={() => setExam(current => ({ ...current, mode, maxAttempts: mode === 'test' ? 1 : 0, antiCheat: mode === 'test' }))} className={`rounded-2xl border p-4 text-left transition ${exam.mode === mode ? 'border-primary-400 bg-primary-50 ring-1 ring-primary-400' : 'border-slate-200 hover:border-primary-300'}`}><span className="text-xs font-bold">{mode === 'practice' ? 'Đề luyện tập' : 'Đề kiểm tra'}</span><span className="mt-1.5 block text-[10px] leading-5 text-muted">{mode === 'practice' ? 'Có thể làm lại để củng cố kiến thức.' : 'Mặc định một lượt, bật cảnh báo gian lận.'}</span></button>)}</div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><label className="field-label" htmlFor="attempt-limit">Số lượt được làm</label><select id="attempt-limit" className="field" value={exam.maxAttempts} onChange={event => updateExam('maxAttempts', Number(event.target.value))}><option value={0}>Không giới hạn</option>{[1, 2, 3, 5, 10].map(value => <option key={value} value={value}>{value} lượt</option>)}</select></div><div><label className="field-label" htmlFor="violation-limit">Tự nộp sau số cảnh báo</label><input id="violation-limit" type="number" min={1} max={20} className="field" value={exam.maxViolations} disabled={!exam.antiCheat} onChange={event => updateExam('maxViolations', Math.max(1, Math.min(20, Number(event.target.value) || 3)))} /></div></div>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#E2DEF6] bg-[#FBFAFF] p-4"><input type="checkbox" checked={exam.antiCheat} onChange={event => updateExam('antiCheat', event.target.checked)} className="mt-1 h-4 w-4 accent-[#8171E8]" /><span><span className="block text-xs font-bold">Bật giám sát hành vi trình duyệt</span><span className="mt-1 block text-[10px] leading-5 text-muted">Cảnh báo chuyển tab, sao chép/dán và phím mở công cụ phát triển. Đáp án luôn được giữ trên máy chủ; đây là biện pháp răn đe, không thể ngăn tuyệt đối AI hoặc công cụ bên ngoài.</span></span></label>
          </section>

          {exam.subject === 'Tiếng Anh' && <section className="card p-5 sm:p-6"><div className="mb-4 flex items-center gap-3"><span className="rounded-xl bg-[#E8F8FC] p-2.5 text-[#2C8FA3]"><Headphones size={20} /></span><div><h3 className="text-sm font-bold">Âm thanh phần nghe</h3><p className="mt-1 text-[10px] text-muted">Chỉ khả dụng cho môn Tiếng Anh · MP3, WAV, M4A, OGG</p></div></div><input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg" onChange={event => { const file = event.target.files?.[0] || null; if (file && file.size > 25 * 1024 * 1024) { showToast('Âm thanh không được vượt quá 25 MB.', 'error'); return } setAudioFile(file) }} className="field file:mr-4 file:rounded-lg file:border-0 file:bg-primary-50 file:px-3 file:py-2 file:text-[10px] file:font-bold file:text-primary-600" />{audioFile ? <p className="mt-2 text-[10px] text-success">Sẽ tải lên: {audioFile.name}</p> : exam.audioUrl && <p className="mt-2 text-[10px] text-success">Đề hiện đã có âm thanh nghe.</p>}</section>}

          <section className="card p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <span className="rounded-xl bg-[#EAF3FD] p-2.5 text-blue"><Eye size={20} /></span>
              <div><h3 className="text-sm font-bold">Phạm vi hiển thị</h3><p className="mt-1 text-[10px] text-muted">Ai có thể nhìn thấy và làm đề thi này</p></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => setVisibility('public')} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${exam.visibility === 'public' ? 'border-blue bg-[#F3F8FE] ring-1 ring-blue' : 'border-slate-200 bg-white hover:border-blue'}`}>
                <span className={`mt-0.5 rounded-xl p-2 ${exam.visibility === 'public' ? 'bg-blue text-white' : 'bg-slate-100 text-muted'}`}><Globe2 size={18} /></span>
                <span><span className="block text-xs font-bold">Công khai</span><span className="mt-1 block text-[10px] leading-4 text-muted">Mọi học sinh đều có thể tìm thấy và làm bài.</span></span>
              </button>
              <button type="button" onClick={() => setVisibility('restricted')} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${exam.visibility === 'restricted' ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500' : 'border-slate-200 bg-white hover:border-primary-400'}`}>
                <span className={`mt-0.5 rounded-xl p-2 ${exam.visibility === 'restricted' ? 'bg-primary-500 text-white' : 'bg-slate-100 text-muted'}`}><Lock size={18} /></span>
                <span><span className="block text-xs font-bold">Theo lớp</span><span className="mt-1 block text-[10px] leading-4 text-muted">Chỉ học sinh thuộc các lớp được chọn mới làm được.</span></span>
              </button>
            </div>
            {exam.visibility === 'restricted' && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="mt-4 overflow-hidden">
                <div className="rounded-2xl border border-[#DED8FA] bg-[#FBFAFF] p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="flex items-center gap-2 text-[11px] font-bold text-primary-700"><UsersRound size={15} />Chọn lớp được phép làm bài</p>
                    <Link to="/admin/classes" className="text-[10px] font-semibold text-primary-600 hover:underline">Quản lý lớp</Link>
                  </div>
                  {classes && classes.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {classes.map(item => {
                        const checked = classIds.includes(item.id)
                        return (
                          <button key={item.id} type="button" onClick={() => toggleClass(item.id)} className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${checked ? 'border-primary-500 bg-white' : 'border-slate-200 bg-white hover:border-primary-300'}`}>
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${checked ? 'border-primary-500 bg-primary-500 text-white' : 'border-slate-300 bg-white'}`}>{checked && <CheckCircle2 size={14} />}</span>
                            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{item.name}</span><span className="text-[9px] text-muted">{item.studentCount} học sinh</span></span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-[11px] leading-5 text-muted">Bạn chưa có lớp nào. Hãy <Link to="/admin/classes" className="font-semibold text-primary-600 hover:underline">tạo lớp và thêm học sinh</Link> trước, hoặc chuyển đề sang chế độ công khai.</p>
                  )}
                </div>
              </motion.div>
            )}
          </section>

          <div className="flex items-center justify-between">
            <div><h3 className="text-sm font-bold">Danh sách câu hỏi</h3><p className="mt-1 text-[10px] text-muted">{questions.length} câu · {totalPoints} điểm</p></div>
            <Button size="sm" variant="secondary" onClick={() => { play('tap'); setExam(current => ({ ...current, questions: [...(current.questions || []), emptyQuestion(questions.length + 1)] })); setExpanded(questions.length) }}><Plus size={15} />Thêm câu hỏi</Button>
          </div>

          {questions.map((question, index) => (
            <QuestionEditor
              key={question.id}
              question={question}
              index={index}
              expanded={expanded === index}
              onToggle={() => setExpanded(expanded === index ? -1 : index)}
              onChange={patch => updateQuestion(index, patch)}
              imageFile={imageFiles[question.id] || null}
              onImageChange={file => setImage(index, file)}
              onTypeChange={type => changeType(index, type)}
              onDelete={() => { if (questions.length === 1) { showToast('Đề thi cần ít nhất một câu hỏi.', 'error'); return } play('tap'); updateExam('questions', questions.filter((_, itemIndex) => itemIndex !== index)); setExpanded(0) }}
              onDuplicate={() => { play('tap'); const copy = { ...question, id: newId(), order: questions.length + 1, options: (question.options || []).map(option => ({ ...option })) }; updateExam('questions', [...questions, copy]); setExpanded(questions.length) }}
            />
          ))}
        </div>

        <aside className="card sticky top-24 hidden p-5 lg:block">
          <h3 className="text-sm font-bold">Tóm tắt đề thi</h3>
          <div className="mt-5 space-y-4 text-[11px]">
            <div className="flex items-center justify-between"><span className="text-muted">Số câu hỏi</span><strong>{questions.length}</strong></div>
            <div className="flex items-center justify-between"><span className="text-muted">Tổng điểm</span><strong>{totalPoints}</strong></div>
            <div className="flex items-center justify-between"><span className="text-muted">Thời gian</span><strong className="flex items-center gap-1"><Clock3 size={13} />{exam.durationMinutes} phút</strong></div>
            <div className="flex items-center justify-between"><span className="text-muted">Phạm vi</span><strong className={exam.visibility === 'restricted' ? 'text-primary-600' : 'text-blue'}>{exam.visibility === 'restricted' ? `${classIds.length} lớp` : 'Công khai'}</strong></div>
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-2xl bg-primary-50 p-4 text-[10px] leading-5 text-primary-700"><Headphones size={15} className="mt-0.5 shrink-0" />Thêm tiêu đề và chú thích cho từng phần (ví dụ phần nghe) để học sinh hiểu rõ yêu cầu trước khi làm.</div>
          <div className="mt-3 rounded-2xl bg-[#F4F5FB] p-4 text-[10px] leading-5 text-muted">Đáp án chỉ được trả về cho học sinh sau khi nộp bài. Điểm trắc nghiệm luôn được tính trên máy chủ. Đề đã có lượt làm bài sẽ không thể sửa câu hỏi.</div>
        </aside>
      </div>
    </motion.div>
  )
}

function QuestionEditor({ question, index, expanded, onToggle, onChange, imageFile, onImageChange, onTypeChange, onDelete, onDuplicate }: { question: Question; index: number; expanded: boolean; onToggle: () => void; onChange: (patch: Partial<Question>) => void; imageFile: File | null; onImageChange: (file: File | null) => void; onTypeChange: (type: QuestionType) => void; onDelete: () => void; onDuplicate: () => void }) {
  const options = question.options || []
  const hasOptions = ['single', 'multiple', 'truefalse'].includes(question.type)
  const preview = useMemo(() => imageFile ? URL.createObjectURL(imageFile) : '', [imageFile])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 p-4 sm:gap-3 sm:p-5">
        <GripVertical size={17} className="hidden text-[#C5C6D2] sm:block" />
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-xs font-bold text-white">{index + 1}</span>
        <button onClick={onToggle} className="min-w-0 flex-1 text-left">
          <p className="truncate text-xs font-semibold">{question.content || 'Câu hỏi chưa có nội dung'}</p>
          <p className="mt-1 text-[9px] text-muted">{typeOptions.find(item => item.value === question.type)?.label} · {question.points} điểm{question.partTitle ? ` · ${question.partTitle}` : ''}</p>
        </button>
        <button onClick={onDuplicate} className="icon-button hidden sm:inline-flex" title="Nhân bản"><Copy size={16} /></button>
        <button onClick={onDelete} className="icon-button hover:bg-[#FDEFF3] hover:text-danger" title="Xóa câu hỏi"><Trash2 size={16} /></button>
        <button onClick={onToggle} className="icon-button" aria-label="Mở rộng câu hỏi">{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
      </div>
      {expanded && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="border-t border-slate-100 bg-[#FCFCFE] p-5 sm:p-6">
          <div className="mb-4 grid gap-4 rounded-2xl border border-[#E4EEF8] bg-[#F5FAFE] p-4 sm:grid-cols-[200px_1fr]">
            <div><label className="field-label">Tiêu đề phần</label><input value={question.partTitle || ''} onChange={event => onChange({ partTitle: event.target.value })} className="field bg-white" placeholder="PART 1 — Listening" /></div>
            <div><label className="field-label">Chú thích / hướng dẫn của phần</label><textarea value={question.partInstruction || ''} onChange={event => onChange({ partInstruction: event.target.value })} className="field resize-none bg-white" rows={2} placeholder="You will hear a radio interview... Listen and do Task 1 and Task 2. You will listen TWICE." /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_180px_100px]">
            <div className="sm:col-span-3"><label className="field-label">Nội dung câu hỏi *</label><textarea value={question.content} onChange={event => onChange({ content: event.target.value })} className="field resize-y bg-white" rows={3} placeholder="Nhập nguyên văn nội dung câu hỏi, giữ các chỗ trống ______ ..." /></div>
            <div className="sm:col-span-3"><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-[#CFC9EE] bg-white p-4"><div className="flex items-center gap-3"><span className="rounded-xl bg-primary-50 p-2 text-primary-600"><ImagePlus size={18} /></span><div><p className="text-xs font-bold">Hình minh họa câu hỏi</p><p className="mt-1 text-[10px] text-muted">PNG, JPG, WebP hoặc GIF · tối đa 8 MB · phù hợp sơ đồ Toán và các môn khác</p></div></div><label className="cursor-pointer rounded-xl bg-primary-50 px-4 py-2 text-[11px] font-bold text-primary-600 hover:bg-primary-100">{imageFile || question.imageUrl ? 'Thay ảnh' : 'Tải ảnh lên'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={event => { onImageChange(event.target.files?.[0] || null); event.target.value = '' }} /></label></div>{(preview || question.imageUrl) && <div className="relative mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-white p-3"><ProtectedImage path={preview || question.imageUrl || ''} alt={`Hình minh họa câu ${index + 1}`} className="max-h-80" /><button type="button" onClick={() => onImageChange(null)} className="absolute right-5 top-5 rounded-xl bg-white/95 p-2 text-danger shadow-soft" aria-label="Gỡ hình minh họa"><Trash2 size={16} /></button><p className="mt-2 text-[10px] text-muted">{imageFile ? `${imageFile.name} · sẽ tải lên khi lưu đề` : 'Ảnh hiện tại của câu hỏi'}</p></div>}</div>
            <div><label className="field-label">Loại câu hỏi</label><select value={question.type} onChange={event => onTypeChange(event.target.value as QuestionType)} className="field bg-white">{typeOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
            <div><label className="field-label">Chủ đề</label><input value={question.topic} onChange={event => onChange({ topic: event.target.value })} className="field bg-white" placeholder="Grammar" /></div>
            <div><label className="field-label">Điểm</label><input type="number" min={1} max={100} step={1} value={question.points} onChange={event => onChange({ points: Math.max(1, Math.round(Number(event.target.value) || 1)) })} className="field bg-white" /></div>
          </div>
          {hasOptions && (
            <div className="mt-5">
              <label className="field-label">Phương án & đáp án chuẩn</label>
              <div className="space-y-2.5">
                {options.map((option, optionIndex) => {
                  const selected = Array.isArray(question.correctAnswer) ? question.correctAnswer.includes(option.id) : question.correctAnswer === option.id
                  return (
                    <div key={option.id} className={`flex items-center gap-3 rounded-2xl border p-2.5 ${selected ? 'border-success bg-[#F0FAF7]' : 'border-slate-200 bg-white'}`}>
                      <button onClick={() => { if (question.type === 'multiple') { const values = Array.isArray(question.correctAnswer) ? question.correctAnswer : []; onChange({ correctAnswer: selected ? values.filter(item => item !== option.id) : [...values, option.id] }) } else onChange({ correctAnswer: option.id }) }} className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${selected ? 'bg-success text-white' : 'bg-[#F3F3F8] text-muted'}`} title="Đánh dấu đáp án đúng">{selected ? <CheckCircle2 size={16} /> : option.label}</button>
                      <input value={option.text} disabled={question.type === 'truefalse'} onChange={event => onChange({ options: options.map((item, itemIndex) => itemIndex === optionIndex ? { ...item, text: event.target.value } : item) })} className="min-w-0 flex-1 bg-transparent text-xs outline-none disabled:text-slate-600" placeholder={`Phương án ${option.label}`} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          {!hasOptions && (
            <div className="mt-5">
              <label className="field-label">{question.type === 'essay' ? 'Rubric / gợi ý chấm' : 'Đáp án chuẩn'} {question.type !== 'essay' && '*'}</label>
              <textarea value={Array.isArray(question.correctAnswer) ? question.correctAnswer.join('\n') : question.correctAnswer || ''} onChange={event => onChange({ correctAnswer: event.target.value })} className="field resize-none bg-white" rows={2} placeholder={question.type === 'essay' ? 'Các tiêu chí và điểm thành phần...' : question.type === 'order' ? 'Thứ tự đúng, phân tách bằng dấu | (ví dụ B|A|D|C)' : question.type === 'fill' || question.type === 'short' ? 'Các đáp án chấp nhận, phân tách bằng dấu |' : 'Nhập đáp án...'} />
            </div>
          )}
          <div className="mt-5"><label className="field-label">Giải thích (hiển thị sau khi nộp)</label><textarea value={question.explanation || ''} onChange={event => onChange({ explanation: event.target.value })} className="field resize-none bg-white" rows={2} placeholder="Giải thích cách suy luận và kiến thức cần nhớ..." /></div>
        </motion.div>
      )}
    </section>
  )
}
