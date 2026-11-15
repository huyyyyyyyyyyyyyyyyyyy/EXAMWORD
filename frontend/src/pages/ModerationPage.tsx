import { Fragment, useMemo, useRef, useState } from 'react'
import type { ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertCircle, AlertTriangle, AppWindow, Archive, ArrowUpRight, BookOpen, Bug, CheckCircle2, ChevronDown, ChevronRight, ClipboardPaste, Clock3, Copy, Edit3, EyeOff, Flag, Flame, Globe, GraduationCap, Info, LayoutDashboard, Lock, MessageSquare, MousePointerClick, RefreshCw, RotateCcw, Search, ShieldAlert, ShieldCheck, ShieldOff, Sparkles, Trash2, UserCheck, UsersRound, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAsync } from '../hooks/useAsync'
import type { Exam, Role, User } from '../types'
import { Avatar, Badge, Button, EmptyState, ErrorState, Modal, PageLoader, TextLink } from '../components/ui'
import { OwlProfessor } from '../components/Characters'
import { api, jsonBody } from '../services/api'
import { formatDate, formatDateTime, friendlyError, getSubjectMeta, timeAgo } from '../utils'
import { useAuth } from '../stores/AuthContext'
import { useToast } from '../stores/ToastContext'
import { useSound } from '../stores/SoundContext'

type ModerationExam = Exam & { ownerName: string }
interface ModerationComment { id: string; examId: string; examTitle: string; content: string; active: boolean; createdAt: string; author: string }
interface ViolationEntry { type: string; at: string }
interface FlaggedAttempt { id: string; examId: string; examTitle: string; userName: string; status: string; violations: number; violationLog: ViolationEntry[]; submittedAt: string | null }
interface ModerationData {
  stats: { totalUsers: number; activeUsers: number; totalExams: number; publishedExams: number; archivedExams: number; activeComments: number; flaggedAttempts: number; totalViolations: number }
  users: User[]
  exams: ModerationExam[]
  comments: ModerationComment[]
  violationAttempts: FlaggedAttempt[]
}

type TabKey = 'overview' | 'users' | 'exams' | 'comments' | 'violations'
type BadgeTone = ComponentProps<typeof Badge>['tone']
type ConfirmState =
  | { kind: 'lockUser'; target: User }
  | { kind: 'examStatus'; target: ModerationExam; status: Exam['status'] }
  | { kind: 'deleteComment'; target: ModerationComment }
  | null

const tabs: { key: TabKey; label: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Tổng quan', icon: LayoutDashboard },
  { key: 'users', label: 'Người dùng', icon: UsersRound },
  { key: 'exams', label: 'Đề thi', icon: BookOpen },
  { key: 'comments', label: 'Bình luận', icon: MessageSquare },
  { key: 'violations', label: 'Vi phạm', icon: ShieldAlert },
]

const roleMeta: Record<Role, { label: string; tone: BadgeTone; icon?: LucideIcon }> = {
  admin: { label: 'Quản trị', tone: 'purple', icon: ShieldCheck },
  teacher: { label: 'Giáo viên', tone: 'blue', icon: GraduationCap },
  student: { label: 'Học sinh', tone: 'gray' },
}
const examStatusMeta: Record<Exam['status'], { label: string; tone: BadgeTone }> = {
  draft: { label: 'Bản nháp', tone: 'orange' },
  published: { label: 'Đã xuất bản', tone: 'green' },
  archived: { label: 'Lưu trữ', tone: 'gray' },
}
const attemptStatusMeta: Record<string, { label: string; tone: BadgeTone }> = {
  inProgress: { label: 'Đang làm', tone: 'blue' },
  submitted: { label: 'Đã nộp', tone: 'green' },
  needsReview: { label: 'Chờ chấm', tone: 'orange' },
  expired: { label: 'Hết giờ', tone: 'gray' },
}
const violationMeta: Record<string, { label: string; icon: LucideIcon; color: string; soft: string }> = {
  tab_hidden: { label: 'Rời khỏi tab làm bài', icon: EyeOff, color: '#B77A2C', soft: '#FFF3E4' },
  window_blur: { label: 'Cửa sổ mất tiêu điểm', icon: AppWindow, color: '#4482C0', soft: '#EAF3FD' },
  copy: { label: 'Sao chép nội dung', icon: Copy, color: '#C85A75', soft: '#FDEFF3' },
  paste: { label: 'Dán nội dung', icon: ClipboardPaste, color: '#C85A75', soft: '#FDEFF3' },
  context_menu: { label: 'Mở menu chuột phải', icon: MousePointerClick, color: '#5A47B8', soft: '#F2F0FF' },
  devtools_suspected: { label: 'Nghi ngờ mở công cụ lập trình', icon: Bug, color: '#C0392B', soft: '#FDECEA' },
  screenshot_suspected: { label: 'Nghi ngờ chụp màn hình bài thi', icon: ShieldAlert, color: '#C0392B', soft: '#FDECEA' },
}
const violationFallback = { label: 'Sự kiện khác', icon: AlertTriangle, color: '#9298B0', soft: '#F1F2F8' }

const moderationError = (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : ''
  if (message === 'cannot_moderate_self') return 'Bạn không thể tự khóa tài khoản của chính mình.'
  return friendlyError(reason, 'Không thể hoàn thành thao tác kiểm duyệt.')
}
const percent = (part: number, whole: number) => whole > 0 ? Math.round(part / whole * 100) : 0
const normalize = (value: string) => value.trim().toLowerCase()

function Toolbar({ search, onSearch, placeholder, count, children }: { search: string; onSearch: (value: string) => void; placeholder: string; count: string; children?: ReactNode }) {
  return <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
    <div className="relative max-w-sm flex-1">
      <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      <input value={search} onChange={event => onSearch(event.target.value)} className="field py-2.5 pl-10 pr-9" placeholder={placeholder} aria-label={placeholder} />
      {search && <button onClick={() => onSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted transition hover:text-ink" aria-label="Xóa từ khóa"><X size={15} /></button>}
    </div>
    <div className="flex flex-wrap items-center gap-2.5">{children}<span className="text-[11px] font-medium text-muted">{count}</span></div>
  </div>
}

function Distribution({ label, total, parts }: { label: string; total: number; parts: { label: string; count: number; color: string }[] }) {
  return <div>
    <div className="mb-2.5 flex items-center justify-between text-[11px]"><span className="font-bold text-ink">{label}</span><span className="font-medium text-muted">{total} tổng cộng</span></div>
    <div className="flex h-3 overflow-hidden rounded-full bg-[#F1F1F9]">
      {parts.filter(part => part.count > 0).map(part => <motion.div key={part.label} initial={{ width: 0 }} animate={{ width: `${total > 0 ? part.count / total * 100 : 0}%` }} transition={{ duration: .6, ease: 'easeOut' }} className="h-full first:rounded-l-full last:rounded-r-full" style={{ background: part.color }} title={`${part.label}: ${part.count}`} />)}
    </div>
    <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">{parts.map(part => <span key={part.label} className="flex items-center gap-1.5 text-[10px] font-medium text-slate-600"><span className="h-2 w-2 rounded-full" style={{ background: part.color }} />{part.label} · <strong className="font-bold">{part.count}</strong></span>)}</div>
  </div>
}

export function ModerationPage() {
  const { user: currentUser } = useAuth()
  const { data, loading, error, reload } = useAsync<ModerationData>('/admin/moderation')
  const { showToast } = useToast()
  const { play } = useSound()

  const [tab, setTab] = useState<TabKey>('overview')
  const [limit, setLimit] = useState(20)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmState>(null)
  const lastConfirm = useRef<ConfirmState>(null)
  if (confirm) lastConfirm.current = confirm
  const shownConfirm = confirm ?? lastConfirm.current
  const [userSearch, setUserSearch] = useState('')
  const [userRole, setUserRole] = useState<'all' | Role>('all')
  const [userStatus, setUserStatus] = useState<'all' | 'active' | 'locked'>('all')
  const [userSort, setUserSort] = useState<'name' | 'recent' | 'xp'>('name')
  const [examSearch, setExamSearch] = useState('')
  const [examStatus, setExamStatus] = useState<'all' | Exam['status']>('all')
  const [examSort, setExamSort] = useState<'recent' | 'title'>('recent')
  const [commentSearch, setCommentSearch] = useState('')
  const [commentStatus, setCommentStatus] = useState<'all' | 'active' | 'hidden'>('all')
  const [violationSearch, setViolationSearch] = useState('')
  const [violationStatus, setViolationStatus] = useState('all')
  const [violationSort, setViolationSort] = useState<'count' | 'recent'>('count')
  const [expandedAttempt, setExpandedAttempt] = useState<string | null>(null)
  const [expandedComment, setExpandedComment] = useState<string | null>(null)

  const users = useMemo(() => {
    const query = normalize(userSearch)
    const list = (data?.users || []).filter(item =>
      (!query || item.name.toLowerCase().includes(query) || item.email.toLowerCase().includes(query)) &&
      (userRole === 'all' || item.role === userRole) &&
      (userStatus === 'all' || (userStatus === 'active' ? item.active !== false : item.active === false)))
    return [...list].sort((a, b) => userSort === 'xp' ? b.xp - a.xp : userSort === 'recent' ? (b.createdAt || '').localeCompare(a.createdAt || '') : a.name.localeCompare(b.name, 'vi'))
  }, [data, userSearch, userRole, userStatus, userSort])

  const exams = useMemo(() => {
    const query = normalize(examSearch)
    const list = (data?.exams || []).filter(item =>
      (!query || item.title.toLowerCase().includes(query) || item.subject.toLowerCase().includes(query) || item.ownerName.toLowerCase().includes(query)) &&
      (examStatus === 'all' || item.status === examStatus))
    return [...list].sort((a, b) => examSort === 'title' ? a.title.localeCompare(b.title, 'vi') : (b.updatedAt || '').localeCompare(a.updatedAt || ''))
  }, [data, examSearch, examStatus, examSort])

  const comments = useMemo(() => {
    const query = normalize(commentSearch)
    return (data?.comments || []).filter(item =>
      (!query || item.content.toLowerCase().includes(query) || item.author.toLowerCase().includes(query) || item.examTitle.toLowerCase().includes(query)) &&
      (commentStatus === 'all' || (commentStatus === 'active' ? item.active : !item.active)))
  }, [data, commentSearch, commentStatus])

  const violations = useMemo(() => {
    const query = normalize(violationSearch)
    const list = (data?.violationAttempts || []).filter(item =>
      (!query || item.userName.toLowerCase().includes(query) || item.examTitle.toLowerCase().includes(query)) &&
      (violationStatus === 'all' || item.status === violationStatus))
    return [...list].sort((a, b) => violationSort === 'count' ? b.violations - a.violations || (b.submittedAt || '').localeCompare(a.submittedAt || '') : (b.submittedAt || '').localeCompare(a.submittedAt || '') || b.violations - a.violations)
  }, [data, violationSearch, violationStatus, violationSort])

  if (loading && !data) return <PageLoader label="Đang tải dữ liệu kiểm duyệt..." />
  if (error && !data) return <ErrorState message={error} onRetry={reload} />
  if (!data) return null

  const stats = data.stats
  const refreshing = loading
  const lockedUsers = data.users.filter(item => item.active === false).length
  const hiddenComments = data.comments.filter(item => !item.active).length
  const draftExams = data.exams.filter(item => item.status === 'draft').length
  const studentCount = data.users.filter(item => item.role === 'student').length
  const teacherCount = data.users.filter(item => item.role === 'teacher').length

  const switchTab = (key: TabKey) => { play('tap'); setTab(key); setLimit(20) }
  const jumpTo = (key: TabKey, preset?: { userStatus?: 'all' | 'active' | 'locked'; examStatus?: 'all' | Exam['status']; commentStatus?: 'all' | 'active' | 'hidden'; violationSort?: 'count' | 'recent' }) => {
    play('tap')
    if (preset?.userStatus !== undefined) setUserStatus(preset.userStatus)
    if (preset?.examStatus !== undefined) setExamStatus(preset.examStatus)
    if (preset?.commentStatus !== undefined) setCommentStatus(preset.commentStatus)
    if (preset?.violationSort !== undefined) setViolationSort(preset.violationSort)
    setTab(key)
    setLimit(20)
    document.getElementById('moderation-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const runMutation = async (id: string, request: () => Promise<unknown>, successMessage: string) => {
    setBusy(id)
    try {
      await request()
      showToast(successMessage)
      setConfirm(null)
      await reload()
    } catch (reason) { showToast(moderationError(reason), 'error') } finally { setBusy(null) }
  }
  const unlockUser = (item: User) => runMutation(item.id, () => api(`/admin/moderation/users/${item.id}`, { method: 'PUT', body: jsonBody({ active: true }) }), `Đã mở khóa tài khoản ${item.name}.`)
  const changeExamStatus = (item: ModerationExam, status: Exam['status'], message: string) => runMutation(item.id, () => api(`/admin/moderation/exams/${item.id}`, { method: 'PUT', body: jsonBody({ status }) }), message)
  const removeComment = (item: ModerationComment) => runMutation(item.id, () => api(`/comments/${item.id}`, { method: 'DELETE' }), `Đã xóa bình luận của ${item.author}.`)
  const confirmAction = () => {
    if (!confirm) return
    if (confirm.kind === 'lockUser') void runMutation(confirm.target.id, () => api(`/admin/moderation/users/${confirm.target.id}`, { method: 'PUT', body: jsonBody({ active: false }) }), `Đã khóa tài khoản ${confirm.target.name}.`)
    else if (confirm.kind === 'examStatus') void changeExamStatus(confirm.target, confirm.status, confirm.status === 'archived' ? `Đã lưu trữ đề “${confirm.target.title}”.` : `Đã gỡ xuất bản đề “${confirm.target.title}”.`)
    else void removeComment(confirm.target)
  }
  const isProtected = (item: User) => item.role === 'admin' || item.id === currentUser?.id

  const statCards: { label: string; value: number; sub: string; icon: LucideIcon; color: string; soft: string; onClick: () => void }[] = [
    { label: 'Tổng người dùng', value: stats.totalUsers, sub: `${studentCount} học sinh · ${teacherCount} giáo viên`, icon: UsersRound, color: '#8171E8', soft: '#EEEAFE', onClick: () => jumpTo('users', { userStatus: 'all' }) },
    { label: 'Đang hoạt động', value: stats.activeUsers, sub: `${percent(stats.activeUsers, stats.totalUsers)}% tổng tài khoản`, icon: UserCheck, color: '#2FA97F', soft: '#E6F8F2', onClick: () => jumpTo('users', { userStatus: 'active' }) },
    { label: 'Tổng đề thi', value: stats.totalExams, sub: `${draftExams} bản nháp chờ xuất bản`, icon: BookOpen, color: '#67A9ED', soft: '#E9F3FE', onClick: () => jumpTo('exams', { examStatus: 'all' }) },
    { label: 'Đề đã xuất bản', value: stats.publishedExams, sub: `${percent(stats.publishedExams, stats.totalExams)}% tổng số đề`, icon: Globe, color: '#35A8B8', soft: '#E4F7F9', onClick: () => jumpTo('exams', { examStatus: 'published' }) },
    { label: 'Đề lưu trữ', value: stats.archivedExams, sub: 'Không còn hiển thị với học sinh', icon: Archive, color: '#7C829C', soft: '#F1F2F8', onClick: () => jumpTo('exams', { examStatus: 'archived' }) },
    { label: 'Bình luận hiển thị', value: stats.activeComments, sub: `${hiddenComments} bình luận đã ẩn`, icon: MessageSquare, color: '#D879A1', soft: '#FBEAF1', onClick: () => jumpTo('comments', { commentStatus: 'active' }) },
    { label: 'Lượt thi gắn cờ', value: stats.flaggedAttempts, sub: 'Có ít nhất một vi phạm', icon: Flag, color: '#E9A543', soft: '#FFF3E3', onClick: () => jumpTo('violations', { violationSort: 'recent' }) },
    { label: 'Tổng vi phạm', value: stats.totalViolations, sub: 'Sự kiện chống gian lận ghi nhận', icon: ShieldAlert, color: '#E0637C', soft: '#FDEFF3', onClick: () => jumpTo('violations', { violationSort: 'count' }) },
  ]
  const tabCounts: Record<TabKey, number | null> = { overview: null, users: data.users.length, exams: data.exams.length, comments: data.comments.length, violations: data.violationAttempts.length }
  const attention = [
    { show: stats.flaggedAttempts > 0, icon: ShieldAlert, color: '#E0637C', soft: '#FDEFF3', title: `${stats.flaggedAttempts} lượt thi bị gắn cờ`, desc: 'Kiểm tra nhật ký chống gian lận', action: () => jumpTo('violations', { violationSort: 'count' }) },
    { show: lockedUsers > 0, icon: ShieldOff, color: '#B77A2C', soft: '#FFF3E4', title: `${lockedUsers} tài khoản đang bị khóa`, desc: 'Xem lại và mở khóa nếu phù hợp', action: () => jumpTo('users', { userStatus: 'locked' }) },
    { show: hiddenComments > 0, icon: EyeOff, color: '#4482C0', soft: '#EAF3FD', title: `${hiddenComments} bình luận đã ẩn`, desc: 'Nội dung bị gỡ khỏi đề thi', action: () => jumpTo('comments', { commentStatus: 'hidden' }) },
    { show: draftExams > 0, icon: BookOpen, color: '#5A47B8', soft: '#F2F0FF', title: `${draftExams} đề thi còn là nháp`, desc: 'Chờ giáo viên hoàn thiện nội dung', action: () => jumpTo('exams', { examStatus: 'draft' }) },
  ].filter(item => item.show)

  const loadMore = (total: number) => total > limit && <div className="border-t border-slate-100 bg-[#FCFCFE] p-4 text-center"><Button variant="outline" size="sm" onClick={() => { play('tap'); setLimit(value => value + 20) }}>Xem thêm · còn {total - limit} mục</Button></div>
  const resetFilters = () => {
    if (tab === 'users') { setUserSearch(''); setUserRole('all'); setUserStatus('all') }
    if (tab === 'exams') { setExamSearch(''); setExamStatus('all') }
    if (tab === 'comments') { setCommentSearch(''); setCommentStatus('all') }
    if (tab === 'violations') { setViolationSearch(''); setViolationStatus('all') }
    setLimit(20)
  }
  const noResults = <EmptyState title="Không tìm thấy kết quả" description="Thử thay đổi từ khóa hoặc bộ lọc để xem thêm dữ liệu." action={<Button variant="outline" size="sm" onClick={resetFilters}><X size={14} />Xóa bộ lọc</Button>} />

  return <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
    <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#5A47B8] via-[#8171E8] to-[#4FBCC9] p-6 text-white shadow-lift sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.16)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#73D8E6]/25 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[1.6px] text-white/80"><ShieldCheck size={14} />Exam World · Kiểm duyệt nền tảng</p>
          <h2 className="mt-3 text-[28px] font-extrabold leading-tight tracking-[-.8px] sm:text-[32px]">Trung tâm kiểm duyệt</h2>
          <p className="mt-2.5 text-xs leading-6 text-white/80">Quản lý tài khoản, đề thi, bình luận và giám sát gian lận trên toàn bộ nền tảng — mọi thao tác đều được ghi nhận tức thì.</p>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 px-3 py-1.5 text-[10px] font-bold backdrop-blur"><Lock size={12} />Chỉ dành cho quản trị viên</span>
            <button onClick={() => { play('tap'); void reload() }} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-1.5 text-[11px] font-bold text-primary-700 shadow-button transition hover:bg-primary-50 active:scale-95 disabled:opacity-70"><RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />{refreshing ? 'Đang làm mới...' : 'Làm mới dữ liệu'}</button>
          </div>
        </div>
        <OwlProfessor size={132} className="hidden shrink-0 drop-shadow-xl md:block" />
      </div>
    </section>

    {error && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#F6D3DC] bg-[#FDF2F5] p-4 text-xs font-medium text-[#C85A75]"><AlertCircle size={16} className="shrink-0" />Không thể làm mới dữ liệu: {error}<button onClick={() => void reload()} className="ml-auto font-bold underline underline-offset-2">Thử lại</button></div>}

    <section className="grid grid-cols-2 gap-3.5 sm:gap-4 xl:grid-cols-4">
      {statCards.map((item, index) => <motion.button key={item.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * .04 }} onClick={item.onClick} className="card group p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift">
        <div className="flex items-start justify-between"><span className="inline-flex rounded-2xl p-2.5" style={{ color: item.color, background: item.soft }}><item.icon size={20} /></span><ArrowUpRight size={15} className="mt-1 text-muted opacity-0 transition group-hover:opacity-100" /></div>
        <p className="mt-3.5 text-[24px] font-extrabold tracking-[-.6px] text-ink">{item.value.toLocaleString('vi-VN')}</p>
        <p className="mt-0.5 text-[11px] font-semibold text-slate-600">{item.label}</p>
        <p className="mt-1 text-[10px] leading-4 text-muted">{item.sub}</p>
      </motion.button>)}
    </section>

    <div id="moderation-tabs" className="card no-scrollbar flex scroll-mt-[92px] gap-1 overflow-x-auto p-1.5">
      {tabs.map(item => { const active = tab === item.key; const count = tabCounts[item.key]; return <button key={item.key} onClick={() => switchTab(item.key)} aria-current={active ? 'page' : undefined} className={`relative shrink-0 rounded-xl px-4 py-2.5 text-xs font-bold transition ${active ? 'text-white' : 'text-slate-500 hover:bg-[#F8F8FC] hover:text-ink'}`}>
        {active && <motion.span layoutId="moderation-tab-pill" className="absolute inset-0 rounded-xl bg-primary-500 shadow-button" transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
        <span className="relative z-10 flex items-center gap-2"><item.icon size={15} strokeWidth={active ? 2.4 : 2} />{item.label}{count !== null && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-extrabold ${active ? 'bg-white/20 text-white' : 'bg-[#F1F1F9] text-muted'}`}>{count}</span>}</span>
      </button> })}
    </div>

    <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }} className="space-y-6">
        {tab === 'overview' && <>
          <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
            <section className="card p-6">
              <h3 className="text-[15px] font-bold">Bức tranh toàn cảnh</h3>
              <p className="mt-1 text-[11px] text-muted">Tỷ lệ trạng thái nội dung và tài khoản trên nền tảng</p>
              <div className="mt-6 space-y-6">
                <Distribution label="Đề thi" total={stats.totalExams} parts={[{ label: 'Đã xuất bản', count: stats.publishedExams, color: '#47C99A' }, { label: 'Bản nháp', count: draftExams, color: '#FFBE69' }, { label: 'Lưu trữ', count: stats.archivedExams, color: '#9298B0' }]} />
                <Distribution label="Tài khoản" total={stats.totalUsers} parts={[{ label: 'Hoạt động', count: stats.activeUsers, color: '#8171E8' }, { label: 'Bị khóa', count: lockedUsers, color: '#C9CCDB' }]} />
                <Distribution label="Bình luận" total={data.comments.length} parts={[{ label: 'Hiển thị', count: stats.activeComments, color: '#4FBCC9' }, { label: 'Đã ẩn', count: hiddenComments, color: '#C9CCDB' }]} />
              </div>
            </section>
            <section className="card p-6">
              <h3 className="flex items-center gap-2 text-[15px] font-bold"><Flag size={16} className="text-[#E9A543]" />Cần chú ý</h3>
              <p className="mt-1 text-[11px] text-muted">Những mục quản trị viên nên xem trước</p>
              {attention.length ? <div className="mt-5 space-y-2.5">{attention.map(item => <button key={item.title} onClick={item.action} className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 p-3.5 text-left transition hover:border-primary-200 hover:bg-primary-50/50">
                <span className="inline-flex shrink-0 rounded-xl p-2.5" style={{ color: item.color, background: item.soft }}><item.icon size={17} /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-ink">{item.title}</span><span className="mt-0.5 block text-[10px] text-muted">{item.desc}</span></span>
                <ChevronRight size={16} className="shrink-0 text-muted" />
              </button>)}</div> : <div className="mt-6 flex flex-col items-center rounded-2xl bg-[#F0FAF7] p-6 text-center"><CheckCircle2 size={28} className="text-success" /><p className="mt-3 text-sm font-bold text-[#248D69]">Không có mục nào cần xử lý</p><p className="mt-1 text-[11px] leading-5 text-[#668F80]">Nền tảng đang sạch sẽ: không gắn cờ, không tài khoản khóa, không bình luận ẩn.</p></div>}
            </section>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between p-6"><div><h3 className="text-[15px] font-bold">Bình luận mới nhất</h3><p className="mt-1 text-[11px] text-muted">Trao đổi gần đây trên các đề thi</p></div><TextLink onClick={() => jumpTo('comments', { commentStatus: 'all' })}>Xem tất cả</TextLink></div>
              {data.comments.length ? <div className="border-t border-slate-100">{data.comments.slice(0, 4).map(item => <div key={item.id} className="flex items-start gap-3 border-b border-slate-50 p-4 last:border-0">
                <Avatar name={item.author} size="sm" />
                <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-x-2 text-[11px]"><strong className="font-bold">{item.author}</strong><span className="text-muted">{timeAgo(item.createdAt)}</span>{!item.active && <Badge tone="gray">Đã ẩn</Badge>}</p><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-600">{item.content}</p><p className="mt-1 truncate text-[10px] text-muted">{item.examTitle}</p></div>
                {item.active && <button className="icon-button h-8 w-8 shrink-0 hover:bg-[#FDEFF3] hover:text-danger" title="Xóa bình luận" aria-label={`Xóa bình luận của ${item.author}`} onClick={() => setConfirm({ kind: 'deleteComment', target: item })}><Trash2 size={15} /></button>}
              </div>)}</div> : <EmptyState title="Chưa có bình luận" description="Bình luận sẽ xuất hiện khi học sinh trao đổi dưới các đề thi công khai." />}
            </section>
            <section className="card overflow-hidden">
              <div className="flex items-center justify-between p-6"><div><h3 className="text-[15px] font-bold">Lượt thi bị gắn cờ</h3><p className="mt-1 text-[11px] text-muted">Sự kiện chống gian lận gần đây</p></div><TextLink onClick={() => jumpTo('violations', { violationSort: 'recent' })}>Xem tất cả</TextLink></div>
              {data.violationAttempts.length ? <div className="border-t border-slate-100">{data.violationAttempts.slice(0, 4).map(item => <div key={item.id} className="flex items-center gap-3 border-b border-slate-50 p-4 last:border-0">
                <span className={`inline-flex shrink-0 rounded-xl p-2.5 ${item.violations >= 3 ? 'bg-[#FDEFF3] text-[#E0637C]' : 'bg-[#FFF3E4] text-[#B77A2C]'}`}><ShieldAlert size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-bold">{item.userName}</p><p className="mt-0.5 truncate text-[10px] text-muted">{item.examTitle}</p></div>
                <div className="shrink-0 text-right"><Badge tone={item.violations >= 3 ? 'pink' : 'orange'}>{item.violations} vi phạm</Badge><p className="mt-1 text-[9px] text-muted">{item.submittedAt ? timeAgo(item.submittedAt) : 'Chưa nộp'}</p></div>
              </div>)}</div> : <EmptyState title="Chưa có vi phạm" description="Hệ thống chống gian lận chưa ghi nhận sự kiện nào. Tiếp tục theo dõi tại tab Vi phạm." />}
            </section>
          </div>
          <section className="relative flex items-center gap-6 overflow-hidden rounded-3xl border border-[#E3E6F8] bg-gradient-to-br from-[#F2F0FF] via-white to-[#E7F7F9] p-6">
            <div className="min-w-0 flex-1">
              <h3 className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={17} className="text-primary-500" />Nguyên tắc kiểm duyệt</h3>
              <ul className="mt-3 space-y-2 text-[11px] leading-5 text-slate-600">
                <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-400" />Không thể khóa tài khoản quản trị viên hoặc chính bạn — máy chủ sẽ từ chối các thao tác này.</li>
                <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#4FBCC9]" />Lưu trữ đề thi giữ nguyên lượt làm bài và kết quả; học sinh không còn nhìn thấy đề.</li>
                <li className="flex gap-2"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#F27D91]" />Xóa bình luận là ẩn mềm: nội dung ngừng hiển thị công khai nhưng vẫn còn trong dữ liệu kiểm duyệt.</li>
              </ul>
            </div>
            <OwlProfessor size={116} className="hidden shrink-0 sm:block" />
          </section>
        </>}

        {tab === 'users' && <section className="card overflow-hidden">
          <Toolbar search={userSearch} onSearch={value => { setUserSearch(value); setLimit(20) }} placeholder="Tìm tên hoặc email..." count={`${users.length} người dùng`}>
            <select value={userRole} onChange={event => { setUserRole(event.target.value as 'all' | Role); setLimit(20) }} className="field w-auto py-2.5 text-xs" aria-label="Lọc theo vai trò"><option value="all">Mọi vai trò</option><option value="student">Học sinh</option><option value="teacher">Giáo viên</option><option value="admin">Quản trị</option></select>
            <select value={userStatus} onChange={event => { setUserStatus(event.target.value as 'all' | 'active' | 'locked'); setLimit(20) }} className="field w-auto py-2.5 text-xs" aria-label="Lọc theo trạng thái"><option value="all">Mọi trạng thái</option><option value="active">Hoạt động</option><option value="locked">Đã khóa</option></select>
            <select value={userSort} onChange={event => setUserSort(event.target.value as typeof userSort)} className="field w-auto py-2.5 text-xs" aria-label="Sắp xếp"><option value="name">Tên A–Z</option><option value="recent">Mới tham gia</option><option value="xp">XP cao nhất</option></select>
          </Toolbar>
          {users.length ? <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left">
                <thead><tr className="border-b border-slate-100 bg-[#FAFAFD] text-[9px] uppercase tracking-[1px] text-muted"><th className="px-6 py-3">Tài khoản</th><th className="px-4 py-3">Vai trò</th><th className="px-4 py-3">Tiến độ</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Tham gia</th><th className="px-6 py-3 text-right">Thao tác</th></tr></thead>
                <tbody>{users.slice(0, limit).map(item => { const role = roleMeta[item.role]; const locked = item.active === false; return <tr key={item.id} className="border-b border-slate-50 last:border-0 hover:bg-[#FCFBFF]">
                  <td className="px-6 py-4"><div className="flex items-center gap-3"><Avatar name={item.name} size="sm" /><div className="min-w-0"><p className="flex max-w-[220px] items-center gap-1.5 truncate text-xs font-bold">{item.name}{item.id === currentUser?.id && <Badge tone="purple" className="shrink-0 !px-1.5 !py-0.5 !text-[8px]">Bạn</Badge>}</p><p className="mt-0.5 max-w-[220px] truncate text-[10px] text-muted">{item.email}</p></div></div></td>
                  <td className="px-4 py-4"><Badge tone={role.tone}>{role.icon && <role.icon size={11} />}{role.label}</Badge></td>
                  <td className="px-4 py-4"><p className="flex items-center gap-1.5 text-[11px] font-bold text-primary-600"><Sparkles size={12} />Cấp {item.level}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-muted">{item.xp} XP · <Flame size={11} className="text-[#E9A543]" />{item.streak} ngày</p></td>
                  <td className="px-4 py-4">{locked ? <Badge tone="gray"><ShieldOff size={11} />Đã khóa</Badge> : <Badge tone="green"><ShieldCheck size={11} />Hoạt động</Badge>}</td>
                  <td className="px-4 py-4 text-[10px] text-muted">{formatDate(item.createdAt)}</td>
                  <td className="px-6 py-4"><div className="flex justify-end">{locked ? <Button size="sm" variant="success" loading={busy === item.id} onClick={() => void unlockUser(item)}><ShieldCheck size={14} />Mở khóa</Button> : isProtected(item) ? <Button size="sm" variant="outline" disabled title={item.id === currentUser?.id ? 'Không thể tự khóa tài khoản của mình' : 'Không thể khóa tài khoản quản trị viên'}><Lock size={14} />Khóa</Button> : <Button size="sm" variant="outline" className="hover:!border-[#F27D91] hover:!text-[#E0637C]" onClick={() => setConfirm({ kind: 'lockUser', target: item })}><ShieldOff size={14} />Khóa</Button>}</div></td>
                </tr> })}</tbody>
              </table>
            </div>
            {loadMore(users.length)}
            <p className="flex items-start gap-2 border-t border-slate-100 bg-[#FAFAFD] p-4 text-[10px] leading-4 text-muted"><Info size={13} className="mt-0.5 shrink-0" />Tài khoản quản trị viên và tài khoản đang đăng nhập không thể bị khóa. Khi khóa, toàn bộ phiên đăng nhập của người dùng sẽ bị thu hồi.</p>
          </> : noResults}
        </section>}

        {tab === 'exams' && <section className="card overflow-hidden">
          <Toolbar search={examSearch} onSearch={value => { setExamSearch(value); setLimit(20) }} placeholder="Tìm đề thi, môn học, chủ sở hữu..." count={`${exams.length} đề thi`}>
            <select value={examStatus} onChange={event => { setExamStatus(event.target.value as 'all' | Exam['status']); setLimit(20) }} className="field w-auto py-2.5 text-xs" aria-label="Lọc theo trạng thái"><option value="all">Mọi trạng thái</option><option value="published">Đã xuất bản</option><option value="draft">Bản nháp</option><option value="archived">Lưu trữ</option></select>
            <select value={examSort} onChange={event => setExamSort(event.target.value as typeof examSort)} className="field w-auto py-2.5 text-xs" aria-label="Sắp xếp"><option value="recent">Cập nhật gần đây</option><option value="title">Tên A–Z</option></select>
          </Toolbar>
          {exams.length ? <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[940px] text-left">
                <thead><tr className="border-b border-slate-100 bg-[#FAFAFD] text-[9px] uppercase tracking-[1px] text-muted"><th className="px-6 py-3">Đề thi</th><th className="px-4 py-3">Chủ sở hữu</th><th className="px-4 py-3">Cấu hình</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Cập nhật</th><th className="px-6 py-3 text-right">Thao tác</th></tr></thead>
                <tbody>{exams.slice(0, limit).map(item => { const meta = getSubjectMeta(item.subject); const status = examStatusMeta[item.status]; return <tr key={item.id} className="border-b border-slate-50 last:border-0 hover:bg-[#FCFBFF]">
                  <td className="px-6 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[10px] font-extrabold" style={{ color: meta.color, background: meta.soft }}>{meta.short}</span><div className="min-w-0"><Link to={`/exams/${item.id}`} className="block max-w-[240px] truncate text-xs font-bold transition hover:text-primary-600" title={item.title}>{item.title}</Link><p className="mt-1 text-[10px] text-muted">{item.subject} · {item.grade}</p></div></div></td>
                  <td className="px-4 py-4"><div className="flex items-center gap-2"><Avatar name={item.ownerName} size="sm" /><span className="max-w-[130px] truncate text-[11px] font-semibold">{item.ownerName}</span></div></td>
                  <td className="px-4 py-4"><p className="flex items-center gap-1.5 text-[10px] text-slate-600"><Clock3 size={12} />{item.durationMinutes} phút · {item.mode === 'test' ? 'Kiểm tra' : 'Luyện tập'}{item.questionCount > 0 && ` · ${item.questionCount} câu`}</p><div className="mt-1.5 flex flex-wrap gap-1">{item.antiCheat && <Badge tone="purple"><ShieldAlert size={10} />Chống gian lận</Badge>}<Badge tone={item.visibility === 'restricted' ? 'blue' : 'green'}>{item.visibility === 'restricted' ? 'Theo lớp' : 'Công khai'}</Badge></div></td>
                  <td className="px-4 py-4"><Badge tone={status.tone}>{status.label}</Badge></td>
                  <td className="px-4 py-4 text-[10px] text-muted">{formatDate(item.updatedAt)}</td>
                  <td className="px-6 py-4"><div className="flex items-center justify-end gap-1">
                    {item.status === 'draft' && <Button size="sm" variant="secondary" loading={busy === item.id} onClick={() => void changeExamStatus(item, 'published', `Đã xuất bản đề “${item.title}”.`)}><CheckCircle2 size={14} />Xuất bản</Button>}
                    {item.status === 'published' && <Button size="sm" variant="outline" onClick={() => setConfirm({ kind: 'examStatus', target: item, status: 'draft' })}><EyeOff size={14} />Gỡ xuất bản</Button>}
                    {item.status === 'archived' && <Button size="sm" variant="secondary" loading={busy === item.id} onClick={() => void changeExamStatus(item, 'draft', `Đã khôi phục đề “${item.title}” về bản nháp.`)}><RotateCcw size={14} />Khôi phục</Button>}
                    <Link to={`/admin/exams/${item.id}/edit`} className="icon-button" title="Chỉnh sửa đề" aria-label={`Chỉnh sửa đề ${item.title}`}><Edit3 size={16} /></Link>
                    {item.status !== 'archived' && <button className="icon-button hover:bg-[#FDEFF3] hover:text-danger" title="Lưu trữ đề" aria-label={`Lưu trữ đề ${item.title}`} onClick={() => setConfirm({ kind: 'examStatus', target: item, status: 'archived' })}><Archive size={16} /></button>}
                  </div></td>
                </tr> })}</tbody>
              </table>
            </div>
            {loadMore(exams.length)}
          </> : noResults}
        </section>}

        {tab === 'comments' && <section className="card overflow-hidden">
          <Toolbar search={commentSearch} onSearch={value => { setCommentSearch(value); setLimit(20) }} placeholder="Tìm nội dung, tác giả, đề thi..." count={`${comments.length} bình luận`}>
            <select value={commentStatus} onChange={event => { setCommentStatus(event.target.value as 'all' | 'active' | 'hidden'); setLimit(20) }} className="field w-auto py-2.5 text-xs" aria-label="Lọc theo trạng thái"><option value="all">Mọi trạng thái</option><option value="active">Đang hiển thị</option><option value="hidden">Đã ẩn</option></select>
          </Toolbar>
          {comments.length ? <>
            <div>{comments.slice(0, limit).map(item => <div key={item.id} className="border-b border-slate-50 p-5 last:border-0">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3"><Avatar name={item.author} size="sm" /><div className="min-w-0"><p className="text-xs font-bold">{item.author} <span className="font-medium text-muted">· {timeAgo(item.createdAt)}</span></p><Link to={`/exams/${item.examId}`} className="mt-1 flex max-w-[280px] items-center gap-1.5 text-[10px] font-semibold text-primary-600 transition hover:text-primary-700" title={item.examTitle}><BookOpen size={11} className="shrink-0" /><span className="truncate">{item.examTitle}</span></Link></div></div>
                <div className="flex shrink-0 items-center gap-2">{item.active ? <Badge tone="green"><CheckCircle2 size={11} />Hiển thị</Badge> : <Badge tone="gray"><EyeOff size={11} />Đã ẩn</Badge>}{item.active && <Button size="sm" variant="ghost" className="!text-[#E0637C] hover:!bg-[#FDEFF3]" loading={busy === item.id} onClick={() => setConfirm({ kind: 'deleteComment', target: item })}><Trash2 size={14} />Xóa</Button>}</div>
              </div>
              <p className={`mt-3 whitespace-pre-wrap break-words text-[13px] leading-6 text-slate-600 ${expandedComment === item.id ? '' : 'line-clamp-3'}`}>{item.content}</p>
              {item.content.length > 180 && <button onClick={() => setExpandedComment(expandedComment === item.id ? null : item.id)} className="mt-1.5 text-[11px] font-bold text-primary-600 transition hover:text-primary-700">{expandedComment === item.id ? 'Thu gọn' : 'Xem thêm'}</button>}
            </div>)}</div>
            {loadMore(comments.length)}
          </> : noResults}
        </section>}

        {tab === 'violations' && <section className="card overflow-hidden">
          <Toolbar search={violationSearch} onSearch={value => { setViolationSearch(value); setLimit(20) }} placeholder="Tìm học sinh hoặc đề thi..." count={`${violations.length} lượt gắn cờ`}>
            <select value={violationStatus} onChange={event => { setViolationStatus(event.target.value); setLimit(20) }} className="field w-auto py-2.5 text-xs" aria-label="Lọc theo trạng thái lượt thi"><option value="all">Mọi trạng thái</option><option value="inProgress">Đang làm</option><option value="submitted">Đã nộp</option><option value="needsReview">Chờ chấm</option><option value="expired">Hết giờ</option></select>
            <select value={violationSort} onChange={event => setViolationSort(event.target.value as typeof violationSort)} className="field w-auto py-2.5 text-xs" aria-label="Sắp xếp"><option value="count">Vi phạm nhiều nhất</option><option value="recent">Mới nhất</option></select>
          </Toolbar>
          {violations.length ? <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left">
                <thead><tr className="border-b border-slate-100 bg-[#FAFAFD] text-[9px] uppercase tracking-[1px] text-muted"><th className="px-6 py-3">Học sinh</th><th className="px-4 py-3">Đề thi</th><th className="px-4 py-3">Vi phạm</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Nộp lúc</th><th className="px-6 py-3 text-right">Nhật ký</th></tr></thead>
                <tbody>{violations.slice(0, limit).map(item => { const status = attemptStatusMeta[item.status] || { label: item.status, tone: 'gray' as BadgeTone }; const expanded = expandedAttempt === item.id; return <Fragment key={item.id}>
                  <tr className={`border-b border-slate-50 transition hover:bg-[#FCFBFF] ${expanded ? 'bg-[#FAFAFD]' : ''}`}>
                    <td className="px-6 py-4"><div className="flex items-center gap-2.5"><Avatar name={item.userName} size="sm" /><span className="max-w-[160px] truncate text-xs font-bold">{item.userName}</span></div></td>
                    <td className="max-w-[220px] px-4 py-4"><Link to={`/exams/${item.examId}`} className="block truncate text-[11px] font-medium transition hover:text-primary-600" title={item.examTitle}>{item.examTitle}</Link></td>
                    <td className="px-4 py-4"><Badge tone={item.violations >= 3 ? 'pink' : 'orange'}><AlertTriangle size={11} />{item.violations} lần</Badge></td>
                    <td className="px-4 py-4"><Badge tone={status.tone}>{status.label}</Badge></td>
                    <td className="px-4 py-4 text-[10px] text-muted">{formatDateTime(item.submittedAt)}</td>
                    <td className="px-6 py-4 text-right"><button className={`icon-button ${expanded ? 'bg-primary-50 text-primary-600' : ''}`} onClick={() => { play('tap'); setExpandedAttempt(expanded ? null : item.id) }} aria-expanded={expanded} aria-label={`Xem nhật ký vi phạm của ${item.userName}`}><ChevronDown size={17} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} /></button></td>
                  </tr>
                  {expanded && <motion.tr key={`${item.id}-log`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: .15 }}>
                    <td colSpan={6} className="border-b border-slate-100 bg-[#FAFAFD] px-6 py-5">
                      <p className="mb-3.5 text-[10px] font-bold uppercase tracking-[1.2px] text-muted">Nhật ký vi phạm · {item.violationLog.length} sự kiện</p>
                      {item.violationLog.length ? <ol className="ml-1.5 space-y-3.5 border-l-2 border-[#E4E1F5] pl-5">{item.violationLog.map((entry, index) => { const meta = violationMeta[entry.type] || { ...violationFallback, label: entry.type || violationFallback.label }; return <li key={`${entry.at}-${index}`} className="relative">
                        <span className="absolute -left-[27px] top-0 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white" style={{ background: meta.soft, color: meta.color }}><meta.icon size={9} /></span>
                        <p className="text-[11px] font-bold text-ink">{meta.label}</p><p className="mt-0.5 text-[10px] text-muted">{formatDateTime(entry.at)}</p>
                      </li> })}</ol> : <p className="rounded-xl bg-white p-3.5 text-[11px] text-muted">Lượt thi này không có nhật ký chi tiết — chỉ ghi nhận tổng số vi phạm.</p>}
                    </td>
                  </motion.tr>}
                </Fragment> })}</tbody>
              </table>
            </div>
            {loadMore(violations.length)}
            <p className="flex items-start gap-2 border-t border-slate-100 bg-[#FAFAFD] p-4 text-[10px] leading-4 text-muted"><Info size={13} className="mt-0.5 shrink-0" />Lượt thi đạt ngưỡng vi phạm của đề sẽ tự động nộp bài. Nhật ký hiển thị tối đa 20 sự kiện gần nhất của mỗi lượt.</p>
          </> : noResults}
        </section>}
    </motion.div>

    <Modal open={Boolean(confirm)} onClose={() => { if (!busy) setConfirm(null) }} title={shownConfirm?.kind === 'lockUser' ? 'Khóa tài khoản?' : shownConfirm?.kind === 'examStatus' ? (shownConfirm.status === 'archived' ? 'Lưu trữ đề thi?' : 'Gỡ xuất bản đề thi?') : 'Xóa bình luận?'} footer={<>
      <Button variant="ghost" disabled={Boolean(busy)} onClick={() => setConfirm(null)}>Hủy</Button>
      <Button variant={shownConfirm?.kind === 'examStatus' && shownConfirm.status === 'draft' ? 'primary' : 'danger'} loading={Boolean(busy)} onClick={confirmAction}>{shownConfirm?.kind === 'lockUser' ? 'Khóa tài khoản' : shownConfirm?.kind === 'examStatus' ? (shownConfirm.status === 'archived' ? 'Lưu trữ' : 'Gỡ xuất bản') : 'Xóa bình luận'}</Button>
    </>}>
      {shownConfirm?.kind === 'lockUser' && <div className="space-y-3">
        <p><strong className="text-ink">{shownConfirm.target.name}</strong> ({shownConfirm.target.email}) sẽ bị đăng xuất khỏi mọi thiết bị và không thể đăng nhập lại cho tới khi được mở khóa.</p>
        <p className="flex items-start gap-2 rounded-2xl bg-[#FFF3E4] p-3.5 text-[11px] leading-5 text-[#B77A2C]"><AlertTriangle size={15} className="mt-0.5 shrink-0" />Toàn bộ phiên đăng nhập hiện tại của người dùng sẽ bị thu hồi ngay lập tức.</p>
      </div>}
      {shownConfirm?.kind === 'examStatus' && <p>Đề <strong className="text-ink">“{shownConfirm.target.title}”</strong> {shownConfirm.status === 'archived' ? 'sẽ được chuyển vào lưu trữ và ngừng hiển thị với học sinh. Các lượt làm bài cùng kết quả hiện có vẫn được giữ nguyên.' : 'sẽ trở về bản nháp và ẩn khỏi học sinh cho tới khi được xuất bản trở lại. Kết quả các lượt thi cũ không bị ảnh hưởng.'}</p>}
      {shownConfirm?.kind === 'deleteComment' && <div className="space-y-3">
        <div className="rounded-2xl bg-[#F7F7FC] p-3.5"><p className="text-[10px] font-bold text-muted">{shownConfirm.target.author} · {shownConfirm.target.examTitle}</p><p className="mt-1.5 line-clamp-4 text-xs italic leading-5 text-slate-600">“{shownConfirm.target.content}”</p></div>
        <p>Bình luận sẽ bị ẩn khỏi đề thi và không thể khôi phục từ giao diện kiểm duyệt.</p>
      </div>}
    </Modal>
  </motion.div>
}