import { Fragment, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Award, Bell, BookOpen, ChevronDown, CircleHelp, ClipboardList, Flame, GraduationCap, LayoutDashboard, Library, LogOut, Menu, MessageCircle, PlusCircle, Radio, Search, Settings, ShieldCheck, Upload, UserRoundSearch, UsersRound, X, Zap } from 'lucide-react'
import { Logo } from '../components/Logo'
import { Avatar, Button, Modal } from '../components/ui'
import { SoundToggle } from '../stores/SoundContext'
import { useAuth } from '../stores/AuthContext'
import { api } from '../services/api'

const studentNav = [
  { to: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { to: '/exams', label: 'Kho đề thi', icon: Library },
  { to: '/history', label: 'Lịch sử làm bài', icon: ClipboardList },
  { to: '/achievements', label: 'Thành tích', icon: Award },
]
const adminNav = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/admin/exams', label: 'Quản lý đề thi', icon: BookOpen },
  { to: '/admin/upload', label: 'Tải đề & phân tích', icon: Upload },
  { to: '/admin/classes', label: 'Lớp học', icon: GraduationCap },
  { to: '/admin/students', label: 'Học sinh', icon: UsersRound },
]
const moderationNav = { to: '/admin/moderation', label: 'Kiểm duyệt', icon: ShieldCheck }
const communityNav = [
  { to: '/messages', label: 'Tin nhắn', icon: MessageCircle },
  { to: '/tutors', label: 'Gia sư & hỏi bài', icon: UserRoundSearch },
  { to: '/live', label: 'Phòng live', icon: Radio },
]
const pageTitles: Record<string, string> = {
  '/dashboard': 'Tổng quan', '/exams': 'Kho đề thi', '/history': 'Lịch sử làm bài', '/achievements': 'Thành tích của tôi',
  '/admin': 'Tổng quan quản trị', '/admin/exams': 'Quản lý đề thi', '/admin/upload': 'Tải đề & phân tích', '/admin/exams/new': 'Tạo đề thi mới',
  '/admin/classes': 'Lớp học', '/admin/students': 'Học sinh', '/admin/moderation': 'Kiểm duyệt nền tảng',
  '/messages': 'Tin nhắn', '/notifications': 'Thông báo', '/tutors': 'Gia sư & hỏi bài', '/live': 'Phòng live',
}
const roleLabel: Record<string, string> = { admin: 'Quản trị viên', teacher: 'Giáo viên', student: 'Học sinh' }

export function AppShell() {
  const { user, logout } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [unread, setUnread] = useState(0)
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (!user) return
    let active = true
    const load = () => { if (document.visibilityState === 'visible') api<{ unread: number }>('/notifications').then((result) => { if (active) setUnread(result.unread) }).catch(() => {}) }
    load()
    const timer = window.setInterval(load, 30000)
    return () => { active = false; window.clearInterval(timer) }
  }, [user, location.pathname])
  if (!user) return null
  const isManager = user.role === 'admin' || user.role === 'teacher'
  const nav = isManager ? [...adminNav, ...communityNav, ...(user.role === 'admin' ? [moderationNav] : [])] : [...studentNav, ...communityNav]
  const title = pageTitles[location.pathname] || (location.pathname.startsWith('/results') ? 'Kết quả chi tiết' : location.pathname.startsWith('/admin/exams/') ? 'Chỉnh sửa đề thi' : 'EXAM WORLD')

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault()
    navigate(`/exams?search=${encodeURIComponent(search)}`)
  }

  const sidebar = <div className="flex h-full flex-col">
    <div className="flex h-[82px] items-center px-6"><Logo /></div>
    <div className="flex-1 overflow-y-auto px-4 pt-5">
      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[1.6px] text-[#B0B3C5]">{user.role === 'admin' ? 'Không gian quản trị' : isManager ? 'Không gian giảng dạy' : 'Không gian của bạn'}</p>
      <nav className="space-y-1.5" aria-label="Điều hướng chính">
        {nav.map(item => <Fragment key={item.to}>{item.to === '/admin/moderation' && <div className="!my-3 border-t border-[#ECECF4]" />}<NavLink to={item.to} end={'end' in item ? Boolean(item.end) : false} onClick={() => setMobileOpen(false)} className={({ isActive }) => `group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-[13px] font-semibold transition ${isActive ? 'bg-primary-50 text-primary-700' : 'text-[#858BA4] hover:bg-[#F8F8FC] hover:text-ink'}`}>{({ isActive }) => <><item.icon size={19} strokeWidth={isActive ? 2.4 : 1.9} /><span>{item.label}</span>{item.to === '/admin/moderation' && !isActive && <span className="ml-auto rounded-md bg-primary-50 px-1.5 py-0.5 text-[8px] font-extrabold tracking-[.6px] text-primary-500">ADMIN</span>}{isActive && <motion.span layoutId="nav-dot" className="ml-auto h-1.5 w-1.5 rounded-full bg-primary-500" />}</>}</NavLink></Fragment>)}
      </nav>
    </div>
    <div className="mt-auto p-4">
      {user.role === 'student' ? <div className="relative mb-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[#8372E8] to-[#6B59CE] p-5 text-white">
        <div className="absolute -right-5 -top-5 h-20 w-20 rounded-full border-[14px] border-white/10" />
        <div className="mb-3 flex items-center gap-2"><span className="rounded-xl bg-white/15 p-2"><Flame size={18} className="text-[#FFD38C]" /></span><span className="text-xs font-semibold">Chuỗi ngày học</span></div>
        <p className="text-2xl font-extrabold">{user.streak || 0} ngày <span className="text-sm font-medium text-white/70">liên tiếp</span></p>
        <p className="mt-1 text-[11px] leading-5 text-white/65">Mỗi ngày một chút, tiến bộ mỗi ngày.</p>
      </div> : <Link to="/admin/exams/new" className="mb-4 flex items-center justify-center gap-2 rounded-2xl bg-primary-500 px-4 py-3 text-sm font-semibold text-white shadow-button transition hover:bg-primary-600"><PlusCircle size={18} />Tạo đề thi mới</Link>}
      <button onClick={() => setHelpOpen(true)} className="flex w-full items-center gap-3 rounded-2xl px-3.5 py-3 text-[13px] font-medium text-[#858BA4] transition hover:bg-slate-50 hover:text-ink"><CircleHelp size={19} />Trợ giúp & hướng dẫn</button>
    </div>
  </div>

  return <div className="min-h-screen bg-canvas">
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[242px] border-r border-[#ECECF4] bg-white lg:block">{sidebar}</aside>
    <AnimatePresence>{mobileOpen && <><motion.div className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} /><motion.aside className="fixed inset-y-0 left-0 z-50 w-[280px] bg-white lg:hidden" initial={{ x: -290 }} animate={{ x: 0 }} exit={{ x: -290 }} transition={{ type: 'spring', damping: 28 }}><button className="icon-button absolute right-3 top-5 z-10" onClick={() => setMobileOpen(false)} aria-label="Đóng menu"><X size={20} /></button>{sidebar}</motion.aside></>}</AnimatePresence>
    <div className="lg:pl-[242px]">
      <header className="sticky top-0 z-30 flex h-[76px] items-center gap-3 border-b border-[#ECECF4]/80 bg-canvas/90 px-4 backdrop-blur-xl sm:px-7 lg:px-9">
        <button className="icon-button lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Mở menu"><Menu size={22} /></button>
        <h1 className="hidden text-[15px] font-bold text-ink sm:block">{title}</h1>
        {user.role === 'student' && <form onSubmit={submitSearch} className="relative ml-auto hidden w-full max-w-[290px] md:block"><Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A5A9BA]" /><input value={search} onChange={event => setSearch(event.target.value)} className="h-10 w-full rounded-xl border border-[#E7E7F0] bg-white pl-10 pr-3 text-xs outline-none transition focus:border-primary-400 focus:ring-4 focus:ring-primary-100" placeholder="Tìm đề thi, môn học..." aria-label="Tìm đề thi" /></form>}
        <div className="ml-auto flex items-center gap-1 md:ml-2">
          <Link to="/notifications" className="icon-button relative" aria-label={`Thông báo, ${unread} chưa đọc`}><Bell size={19} />{unread > 0 && <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}</Link>
          <SoundToggle />
          <button className="icon-button" onClick={() => setHelpOpen(true)} aria-label="Trợ giúp"><CircleHelp size={19} /></button>
          <div className="relative">
            <button onClick={() => setProfileOpen(value => !value)} className="flex items-center gap-2 rounded-2xl p-1.5 transition hover:bg-white" aria-expanded={profileOpen}><Avatar name={user.name} /><span className="hidden text-left xl:block"><span className="block max-w-32 truncate text-xs font-bold">{user.name}</span><span className="mt-0.5 block text-[10px] text-muted">{roleLabel[user.role] || 'Học sinh'}</span></span><ChevronDown size={15} className="hidden text-muted xl:block" /></button>
            <AnimatePresence>{profileOpen && <><button className="fixed inset-0 z-10 cursor-default" onClick={() => setProfileOpen(false)} aria-label="Đóng menu tài khoản" /><motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-[#ECECF4] bg-white p-2 shadow-lift"><div className="border-b border-slate-100 px-3 py-2.5"><p className="truncate text-sm font-bold">{user.name}</p><p className="mt-1 truncate text-[11px] text-muted">{user.email}</p></div><Link to={isManager ? '/admin' : '/achievements'} onClick={() => setProfileOpen(false)} className="mt-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50"><Settings size={16} />{isManager ? 'Bảng điều khiển' : 'Hồ sơ học tập'}</Link><button onClick={() => { logout(); navigate('/login') }} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-xs font-medium text-danger hover:bg-[#FDEFF3]"><LogOut size={16} />Đăng xuất</button></motion.div></>}</AnimatePresence>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1536px] p-4 sm:p-7 lg:p-9"><Outlet /></main>
    </div>
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} title="Orbi luôn sẵn sàng giúp bạn" footer={<Button onClick={() => setHelpOpen(false)}>Đã hiểu</Button>}>
      <div className="space-y-3"><p><strong className="text-ink">Với học sinh:</strong> Chọn một đề trong Kho đề thi, hệ thống sẽ tự lưu đáp án và đồng hồ sẽ tự nộp khi hết giờ.</p><p><strong className="text-ink">Với giáo viên:</strong> Tạo lớp học, thêm học sinh, rồi đăng đề ở chế độ công khai hoặc chỉ dành cho lớp của mình. Tải DOCX/PDF để hệ thống tự tách câu hỏi và giữ nguyên chú thích từng phần.</p><div className="rounded-2xl bg-primary-50 p-3 text-xs leading-5 text-primary-700"><Zap size={16} className="mb-1" />Dữ liệu được lưu trên máy chủ. Bạn có thể tải lại trang và tiếp tục bài đang làm.</div></div>
    </Modal>
  </div>
}
