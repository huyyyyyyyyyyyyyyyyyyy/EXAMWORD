import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, ArrowRight, Bookmark, Check, CheckCircle2, Clock3, CloudUpload, Grid3X3, Headphones, Send, ShieldCheck, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Logo } from '../components/Logo'
import { Button, Modal, PageLoader } from '../components/ui'
import { AudioPlayer } from '../components/AudioPlayer'
import { ListeningPlayer } from '../components/ListeningPlayer'
import { api, jsonBody } from '../services/api'
import type { Attempt, AttemptAnswer, Question } from '../types'
import { useToast } from '../stores/ToastContext'
import { SoundToggle, useSound } from '../stores/SoundContext'
import { useAuth } from '../stores/AuthContext'
import { ProtectedImage } from '../components/ProtectedImage'

const hasValue = (answer?: AttemptAnswer) => Array.isArray(answer?.value) ? answer.value.length > 0 : Boolean(answer?.value?.trim())
const isListeningPart = (question: Question) => /listen|listening|nghe/i.test(`${question.partTitle || ''} ${question.partInstruction || ''}`)
const typeLabels = { single: 'Một đáp án', multiple: 'Nhiều đáp án', truefalse: 'Đúng / Sai', fill: 'Điền đáp án', short: 'Trả lời ngắn', math: 'Biểu thức toán', essay: 'Tự luận', matching: 'Nối đáp án', order: 'Sắp xếp thứ tự' }

export function TakeExamPage() {
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { play } = useSound()
  const { refresh } = useAuth()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [answers, setAnswers] = useState<Record<string, AttemptAnswer>>({})
  const answersRef = useRef(answers)
  const [current, setCurrent] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [submitOpen, setSubmitOpen] = useState(false)
  const [exitOpen, setExitOpen] = useState(false)
  const [navigatorOpen, setNavigatorOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [violations, setViolations] = useState(0)
  const [screenshotDecoy, setScreenshotDecoy] = useState(false)
  const decoyTimer = useRef<number | undefined>(undefined)
  const lastViolationRef = useRef(0)
  const closedRef = useRef(false)
  const saveTimer = useRef<number | undefined>(undefined)
  const questions = useMemo(() => attempt?.exam.questions || [], [attempt])

  const submit = useCallback(async () => {
    if (!attemptId || submitting || closedRef.current) return
    closedRef.current = true
    setSubmitting(true)
    try {
      if (saveTimer.current) window.clearTimeout(saveTimer.current)
      await api(`/attempts/${attemptId}/answers`, { method: 'PUT', body: jsonBody({ answers: answersRef.current }) }).catch(() => undefined)
      await api(`/attempts/${attemptId}/submit`, { method: 'POST' })
      play('complete')
      void refresh()
      navigate(`/results/${attemptId}`, { replace: true })
    } catch (error) { closedRef.current = false; showToast(error instanceof Error ? error.message : 'Không thể nộp bài.', 'error'); setSubmitting(false) }
  }, [attemptId, navigate, showToast, submitting, play, refresh])

  const save = useCallback(async () => {
    if (!attemptId || !attempt) return
    setSaveState('saving')
    try { await api(`/attempts/${attemptId}/answers`, { method: 'PUT', body: jsonBody({ answers: answersRef.current }) }); setSaveState('saved') } catch { setSaveState('error') }
  }, [attemptId, attempt])

  const scheduleSave = useCallback(() => {
    setSaveState('saving')
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => void save(), 700)
  }, [save])

  const reportViolation = useCallback(async (type: string) => {
    if (!attemptId || !attempt?.exam.antiCheat || closedRef.current) return
    const now = Date.now()
    if (now - lastViolationRef.current < 1800) return
    lastViolationRef.current = now
    try {
      await save()
      const result = await api<{ violations: number; maxViolations: number; autoSubmitted: boolean }>(`/attempts/${attemptId}/violations`, { method: 'POST', body: jsonBody({ type }) })
      setViolations(result.violations)
      if (result.autoSubmitted) { closedRef.current = true; play('complete'); navigate(`/results/${attemptId}`, { replace: true }); return }
      showToast(`Cảnh báo ${result.violations}/${result.maxViolations}: hãy ở lại phòng thi và tự làm bài.`, 'error')
    } catch { setSaveState('error') }
  }, [attemptId, attempt?.exam.antiCheat, save, showToast, navigate, play])

  useEffect(() => {
    if (!attemptId) return
    const controller = new AbortController()
    let active = true
    closedRef.current = false
    lastViolationRef.current = 0
    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    setAttempt(null); setAnswers({}); answersRef.current = {}; setCurrent(0); setViolations(0)
    setSubmitting(false); setSubmitOpen(false); setExitOpen(false); setNavigatorOpen(false); setSaveState('saved'); setLoadError('')
    setLoading(true)
    api<Attempt>(`/attempts/${attemptId}`, { signal: controller.signal }).then(result => {
      if (!active) return
      if (result.status !== 'inProgress') { navigate(`/results/${attemptId}`, { replace: true }); return }
      setAttempt(result); setAnswers(result.answers || {}); answersRef.current = result.answers || {}; setViolations(result.violations || 0)
      setSecondsLeft(Math.max(0, Math.floor((new Date(result.expiresAt).getTime() - Date.now()) / 1000)))
      play('start')
    }).catch(error => { if (active && !controller.signal.aborted) setLoadError(error.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [attemptId, navigate, play])

  useEffect(() => {
    if (!attempt || secondsLeft <= 0) return
    const interval = window.setInterval(() => setSecondsLeft(value => {
      if (value <= 1) { window.clearInterval(interval); void submit(); return 0 }
      return value - 1
    }), 1000)
    return () => window.clearInterval(interval)
  }, [attempt, secondsLeft > 0, submit])

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault() }
    const visibility = () => { if (document.hidden) void save() }
    window.addEventListener('beforeunload', beforeUnload)
    document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('beforeunload', beforeUnload); document.removeEventListener('visibilitychange', visibility); if (saveTimer.current) window.clearTimeout(saveTimer.current) }
  }, [save])

  useEffect(() => {
    if (!attempt?.exam.antiCheat) return
    const visibility = () => { if (document.hidden) void reportViolation('tab_hidden') }
    const blur = () => { if (!document.hidden) void reportViolation('window_blur') }
    const clipboard = (event: Event) => { event.preventDefault(); void reportViolation(event.type === 'contextmenu' ? 'context_menu' : event.type === 'paste' ? 'paste' : 'copy') }
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'PrintScreen') {
        event.preventDefault()
        setScreenshotDecoy(true)
        if (decoyTimer.current) window.clearTimeout(decoyTimer.current)
        decoyTimer.current = window.setTimeout(() => setScreenshotDecoy(false), 1400)
        void reportViolation('screenshot_suspected')
        return
      }
      const devtools = event.key === 'F12' || ((event.ctrlKey || event.metaKey) && event.shiftKey && ['i', 'j', 'c'].includes(event.key.toLowerCase()))
      if (devtools) { event.preventDefault(); void reportViolation('devtools_suspected') }
    }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('blur', blur)
    document.addEventListener('copy', clipboard, true)
    document.addEventListener('cut', clipboard, true)
    document.addEventListener('paste', clipboard, true)
    document.addEventListener('contextmenu', clipboard, true)
    document.addEventListener('keydown', keydown, true)
    return () => {
      document.removeEventListener('visibilitychange', visibility); window.removeEventListener('blur', blur)
      document.removeEventListener('copy', clipboard, true); document.removeEventListener('cut', clipboard, true)
      document.removeEventListener('paste', clipboard, true); document.removeEventListener('contextmenu', clipboard, true)
      document.removeEventListener('keydown', keydown, true)
      if (decoyTimer.current) window.clearTimeout(decoyTimer.current)
    }
  }, [attempt?.exam.antiCheat, reportViolation])

  if (loading) return <div className="min-h-screen bg-canvas"><PageLoader label="Đang chuẩn bị phòng thi..." /></div>
  if (loadError || !attempt || !questions.length) return <div className="flex min-h-screen flex-col items-center justify-center bg-canvas p-6 text-center"><AlertTriangle size={32} className="mb-4 text-danger" /><h1 className="text-xl font-bold">Không thể mở bài thi</h1><p className="mt-2 text-sm text-muted">{loadError || 'Đề thi chưa có câu hỏi.'}</p><Button className="mt-5" onClick={() => navigate('/exams')}>Về kho đề thi</Button></div>

  const question = questions[current]
  const inListening = isListeningPart(question)
  const answeredCount = questions.filter(item => hasValue(answers[item.id])).length
  const flaggedCount = questions.filter(item => answers[item.id]?.flagged).length
  const time = `${Math.floor(secondsLeft / 3600) > 0 ? `${Math.floor(secondsLeft / 3600).toString().padStart(2, '0')}:` : ''}${Math.floor(secondsLeft % 3600 / 60).toString().padStart(2, '0')}:${(secondsLeft % 60).toString().padStart(2, '0')}`
  const updateAnswer = (value: string | string[]) => {
    const next = { ...answersRef.current, [question.id]: { ...answersRef.current[question.id], value } }
    answersRef.current = next; setAnswers(next); scheduleSave()
  }
  const toggleFlag = () => {
    const currentAnswer = answersRef.current[question.id] || { value: '' }
    const next = { ...answersRef.current, [question.id]: { ...currentAnswer, flagged: !currentAnswer.flagged } }
    answersRef.current = next; setAnswers(next); scheduleSave(); play('flag')
  }
  const goTo = (index: number) => { setCurrent(index); setNavigatorOpen(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }

  const navigator = <div className="card p-5"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">Danh sách câu hỏi</h3><span className="text-[10px] font-semibold text-muted">{answeredCount}/{questions.length} câu</span></div><div className="mt-4 grid grid-cols-5 gap-2 lg:grid-cols-4 xl:grid-cols-5">{questions.map((item, index) => <button key={item.id} onClick={() => goTo(index)} className={`relative aspect-square rounded-xl text-xs font-bold transition ${index === current ? 'bg-primary-500 text-white shadow-button' : hasValue(answers[item.id]) ? 'bg-[#E5F7F1] text-[#2A9C76]' : 'bg-[#F4F4F9] text-muted hover:bg-primary-50'}`} aria-label={`Câu ${index + 1}${hasValue(answers[item.id]) ? ', đã trả lời' : ''}`}>{index + 1}{answers[item.id]?.flagged && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-warning" />}</button>)}</div><div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-[10px] text-muted"><p className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#CFEFE4]" />Đã trả lời</p><p className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#E3E3EC]" />Chưa trả lời</p><p className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-warning" />Đánh dấu xem lại ({flaggedCount})</p></div><Button onClick={() => setSubmitOpen(true)} className="mt-5 w-full"><Send size={16} />Nộp bài</Button></div>

  return <div className="min-h-screen bg-[#F7F8FC]">
    <header className="sticky top-0 z-40 border-b border-[#E8E8F0] bg-white/95 backdrop-blur"><div className="mx-auto flex h-[74px] max-w-[1440px] items-center gap-4 px-4 sm:px-7"><button onClick={() => setExitOpen(true)} className="icon-button shrink-0" aria-label="Thoát phòng thi"><ArrowLeft size={20} /></button><div className="hidden sm:block"><Logo compact /></div><div className="min-w-0 flex-1 border-l border-slate-100 pl-3"><h1 className="truncate text-xs font-bold sm:text-sm">{attempt.exam.title}</h1><p className="mt-1 flex items-center gap-1.5 text-[9px] text-muted sm:text-[10px]">{saveState === 'saving' ? <><CloudUpload size={12} className="text-primary-500" />Đang lưu...</> : saveState === 'error' ? <><AlertTriangle size={12} className="text-danger" />Chưa lưu được · sẽ thử lại</> : <><CheckCircle2 size={12} className="text-success" />Đã lưu tự động</>}</p></div><SoundToggle className="shrink-0" /><div className={`flex items-center gap-2 rounded-2xl px-3 py-2.5 font-mono text-sm font-bold sm:px-4 sm:text-base ${secondsLeft < 300 ? 'animate-pulse bg-[#FDEFF3] text-danger' : 'bg-primary-50 text-primary-700'}`}><Clock3 size={18} /><span>{time}</span></div></div></header>
    {attempt.exam.antiCheat && <div className="border-b border-[#F4DDAA] bg-[#FFF8E9]"><div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[10px] text-[#8A5A12] sm:px-7 sm:text-[11px]"><ShieldCheck size={16} className="shrink-0" /><strong>Phòng thi được giám sát</strong><span>Không chuyển tab, sao chép/dán hoặc dùng công cụ hỗ trợ bên ngoài.</span><span className="ml-auto rounded-full bg-white px-2.5 py-1 font-bold">Cảnh báo {violations}/{attempt.exam.maxViolations}</span></div></div>}
    <div className="mx-auto grid max-w-[1280px] gap-6 p-4 sm:p-7 lg:grid-cols-[1fr_280px]">
      <main className="min-w-0">{inListening && attempt.exam.audioUrl && <div className="mb-5"><ListeningPlayer key={attempt.exam.id} path={attempt.exam.audioUrl} title={question.partTitle || 'Phần nghe hiểu'} /></div>}<div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[1.2px] text-primary-500">{attempt.exam.subject}</p><p className="mt-1 text-xs text-muted">Câu {current + 1} / {questions.length} · {question.points} điểm</p></div><BadgeType type={question.type} /></div><motion.article key={question.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="card p-5 sm:p-8">{(question.partTitle || question.partInstruction) && <div className="mb-6 rounded-2xl border border-[#DED8FA] bg-gradient-to-br from-[#F4F1FF] to-[#EEF7FB] p-4 sm:p-5"><div className="flex items-start gap-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-white"><Headphones size={16} /></span><div className="min-w-0">{question.partTitle && <p className="text-[11px] font-extrabold uppercase tracking-[1.2px] text-primary-600">{question.partTitle}</p>}{question.partInstruction && <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-[#4A4568]">{question.partInstruction}</p>}</div></div></div>}<div className="flex items-start gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-sm font-extrabold text-white">{current + 1}</span><h2 className="whitespace-pre-wrap pt-1 text-[15px] font-semibold leading-7 text-ink sm:text-base">{question.content}</h2></div>{question.audioUrl && <div className="mt-6"><AudioPlayer path={question.audioUrl} /></div>}{question.imageUrl && <div className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white"><ProtectedImage path={question.imageUrl} alt={`Hình minh họa câu ${current + 1}`} className="max-h-96" /></div>}<div className="mt-7"><AnswerInput question={question} answer={answers[question.id]} onChange={updateAnswer} /></div><div className="mt-8 flex items-center justify-between border-t border-slate-100 pt-5"><button onClick={toggleFlag} className={`flex items-center gap-2 rounded-xl px-3 py-2 text-[11px] font-semibold transition ${answers[question.id]?.flagged ? 'bg-[#FFF3E3] text-[#B77A2C]' : 'text-muted hover:bg-slate-50 hover:text-ink'}`}><Bookmark size={16} fill={answers[question.id]?.flagged ? 'currentColor' : 'none'} />{answers[question.id]?.flagged ? 'Đã đánh dấu' : 'Đánh dấu xem lại'}</button><span className="hidden text-[10px] text-muted sm:block">Câu trả lời được lưu khi bạn thay đổi</span></div></motion.article><div className="mt-5 flex items-center justify-between"><Button variant="outline" disabled={current === 0} onClick={() => goTo(current - 1)}><ArrowLeft size={16} />Câu trước</Button><button onClick={() => setNavigatorOpen(true)} className="icon-button lg:hidden" aria-label="Mở danh sách câu hỏi"><Grid3X3 size={20} /></button>{current === questions.length - 1 ? <Button onClick={() => setSubmitOpen(true)}>Xem lại & nộp <CheckCircle2 size={17} /></Button> : <Button onClick={() => goTo(current + 1)}>Câu tiếp theo<ArrowRight size={16} /></Button>}</div></main>
      <aside className="hidden lg:block"><div className="sticky top-[98px]">{navigator}<div className="mt-4 rounded-2xl border border-[#E4F2EF] bg-[#F1FAF7] p-4 text-[10px] leading-5 text-[#59937F]"><Check size={15} className="mb-1" />Bạn có thể tải lại trang. Bài làm và thời gian đã được lưu trên máy chủ.</div></div></aside>
    </div>
    <AnimatePresence>{navigatorOpen && <motion.div className="fixed inset-0 z-50 flex items-end bg-ink/30 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setNavigatorOpen(false)}><motion.div onClick={event => event.stopPropagation()} className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}><div className="mb-3 flex items-center justify-between"><span className="text-sm font-bold">Điều hướng bài thi</span><button className="icon-button" onClick={() => setNavigatorOpen(false)}><X size={20} /></button></div>{navigator}</motion.div></motion.div>}</AnimatePresence>
    <Modal open={submitOpen} onClose={() => setSubmitOpen(false)} title="Sẵn sàng nộp bài?" footer={<><Button variant="ghost" onClick={() => setSubmitOpen(false)}>Tiếp tục làm</Button><Button loading={submitting} onClick={submit}>Nộp bài ngay</Button></>}><div className="rounded-2xl bg-canvas p-4"><div className="flex justify-between py-2"><span>Đã trả lời</span><strong className="text-success">{answeredCount}/{questions.length} câu</strong></div><div className="flex justify-between border-t border-slate-200 py-2"><span>Chưa trả lời</span><strong className={questions.length - answeredCount ? 'text-danger' : ''}>{questions.length - answeredCount} câu</strong></div><div className="flex justify-between border-t border-slate-200 py-2"><span>Đánh dấu xem lại</span><strong className="text-[#B77A2C]">{flaggedCount} câu</strong></div></div>{answeredCount < questions.length && <p className="mt-3 flex gap-2 text-xs text-danger"><AlertTriangle size={16} className="shrink-0" />Bạn vẫn còn câu chưa trả lời. Sau khi nộp, bạn không thể thay đổi bài làm.</p>}</Modal>
    {screenshotDecoy && <ScreenshotDecoy index={current} />}
    <Modal open={exitOpen} onClose={() => setExitOpen(false)} title="Tạm rời phòng thi?" footer={<><Button variant="ghost" onClick={() => setExitOpen(false)}>Ở lại</Button><Button onClick={async () => { await save(); navigate('/exams') }}>Lưu & rời phòng thi</Button></>}><p>Bài làm của bạn đã được lưu. Bạn có thể quay lại tiếp tục trong thời gian làm bài còn hiệu lực.</p></Modal>
  </div>
}

function ScreenshotDecoy({ index }: { index: number }) {
  const prompts = ['Đại lượng nào được đo bằng đơn vị mét?', 'Chọn khẳng định đúng về quá trình quang hợp.', 'Giá trị của biểu thức 3 × 4 + 2 là bao nhiêu?']
  const options = ['C. 14', 'A. 8', 'D. 24', 'B. 10']
  return <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#F7F8FC] p-5 sm:p-10" aria-live="assertive">
    <div className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-9">
      <p className="text-xs font-bold uppercase tracking-wider text-primary-500">Nội dung bảo vệ bài thi</p>
      <div className="mt-7 flex items-start gap-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-500 text-sm font-extrabold text-white">{index + 1}</span><h2 className="pt-1 text-base font-semibold leading-7">{prompts[index % prompts.length]}</h2></div>
      <div className="mt-8 space-y-3">{options.map((option, optionIndex) => <div key={option} className={`flex items-center gap-4 rounded-2xl border p-4 text-sm ${optionIndex === index % options.length ? 'border-primary-400 bg-primary-50 font-semibold text-primary-700' : 'border-slate-200'}`}><span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-300 text-xs font-bold">{option[0]}</span>{option.slice(3)}</div>)}</div>
      <p className="mt-8 flex items-center gap-2 border-t border-slate-100 pt-5 text-xs text-muted"><ShieldCheck size={16} />Đang ghi nhận sự kiện bảo mật. Bài làm thật sẽ trở lại ngay.</p>
    </div>
  </div>
}

function BadgeType({ type }: { type: Question['type'] }) {
  return <span className="rounded-full bg-[#F0EFF9] px-3 py-1.5 text-[10px] font-semibold text-primary-700">{typeLabels[type]}</span>
}

function AnswerInput({ question, answer, onChange }: { question: Question; answer?: AttemptAnswer; onChange: (value: string | string[]) => void }) {
  const value = answer?.value || (question.type === 'multiple' ? [] : '')
  if (['single', 'multiple', 'truefalse'].includes(question.type)) return <div className="space-y-3">{(question.options || []).map(option => {
    const selected = Array.isArray(value) ? value.includes(option.id) : value === option.id
    const toggle = () => {
      if (question.type === 'multiple') { const values = Array.isArray(value) ? value : []; onChange(selected ? values.filter(item => item !== option.id) : [...values, option.id]) } else onChange(option.id)
    }
    return <button key={option.id} onClick={toggle} role={question.type === 'multiple' ? 'checkbox' : 'radio'} aria-checked={selected} className={`group flex w-full items-center gap-3.5 rounded-2xl border p-4 text-left transition ${selected ? 'border-primary-400 bg-primary-50 shadow-[0_0_0_3px_rgba(129,113,232,.07)]' : 'border-[#E7E7EF] bg-white hover:border-primary-200 hover:bg-[#FCFBFF]'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center border text-[11px] font-bold transition ${question.type === 'multiple' ? 'rounded-lg' : 'rounded-full'} ${selected ? 'border-primary-500 bg-primary-500 text-white' : 'border-[#DADAE5] bg-[#FAFAFC] text-muted group-hover:border-primary-300'}`}>{selected ? <Check size={15} strokeWidth={3} /> : option.label}</span><span className={`text-xs leading-6 sm:text-[13px] ${selected ? 'font-semibold text-primary-700' : 'text-slate-600'}`}>{option.text}</span></button>
  })}</div>
  if (question.type === 'essay' || question.type === 'short' || question.type === 'matching' || question.type === 'order') return <textarea value={Array.isArray(value) ? value.join('\n') : value} onChange={event => onChange(event.target.value)} rows={question.type === 'essay' ? 10 : 4} className="field resize-y leading-7" placeholder={question.type === 'essay' ? 'Trình bày bài làm của bạn tại đây. Bài tự luận sẽ được giáo viên xem xét theo rubric...' : 'Nhập câu trả lời của bạn...'} />
  return <div><label htmlFor={`answer-${question.id}`} className="sr-only">Đáp án câu {question.order}</label><input id={`answer-${question.id}`} value={Array.isArray(value) ? value.join(', ') : value} onChange={event => onChange(event.target.value)} className="field max-w-xl py-4" placeholder={question.type === 'math' ? 'Ví dụ: 2x + 1 hoặc 3.14' : 'Nhập đáp án...'} autoComplete="off" />{question.type === 'math' && <p className="mt-2 text-[10px] text-muted">Hệ thống kiểm tra biểu thức tương đương và sai số số học trên máy chủ.</p>}</div>
}
