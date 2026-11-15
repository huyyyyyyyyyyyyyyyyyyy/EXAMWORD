import { useMemo, useState } from 'react'
import { Mail, Pencil, Search, ShieldCheck, ShieldOff, Sparkles, UserPlus, UsersRound, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAsync } from '../hooks/useAsync'
import type { Attempt, ClassRoom, User } from '../types'
import { Avatar, Badge, Button, EmptyState, ErrorState, Modal, PageLoader } from '../components/ui'
import { api, jsonBody } from '../services/api'
import { formatDate, formatDateTime, friendlyError } from '../utils'
import { useToast } from '../stores/ToastContext'
import { useSound } from '../stores/SoundContext'

type StudentDetail = User & { attempts: Attempt[] }
const emailOk = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

export function StudentsPage() {
  const { data, loading, error, reload } = useAsync<User[]>('/students')
  const { data: classes } = useAsync<ClassRoom[]>('/classes')
  const { showToast } = useToast()
  const { play } = useSound()
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [sort, setSort] = useState<'name' | 'xp' | 'recent'>('name')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', classId: '' })
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<User | null>(null)
  const [editTarget, setEditTarget] = useState<User | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [edit, setEdit] = useState({ name: '', active: true, password: '' })
  const [busy, setBusy] = useState<string | null>(null)
  const { data: detailData, loading: detailLoading, reload: reloadDetail } = useAsync<StudentDetail>(detail ? `/students/${detail.id}` : null)

  const students = useMemo(() => {
    let list = (data || []).filter(item => item.name.toLowerCase().includes(search.toLowerCase()) || item.email.toLowerCase().includes(search.toLowerCase()))
    if (classFilter) list = list.filter(item => (item.classes || []).some(c => c.id === classFilter))
    return [...list].sort((a, b) => sort === 'xp' ? b.xp - a.xp : sort === 'recent' ? (b.createdAt || '').localeCompare(a.createdAt || '') : a.name.localeCompare(b.name, 'vi'))
  }, [data, search, classFilter, sort])

  const openCreate = () => { setForm({ name: '', email: '', password: '', classId: '' }); setCreateOpen(true) }
  const openDetail = (item: User) => { play('tap'); setDetail(item) }
  const openEdit = () => { if (!detailData) return; setEditTarget(detailData); setEdit({ name: detailData.name, active: detailData.active !== false, password: '' }); setEditOpen(true) }

  const createStudent = async () => {
    if (!form.name.trim()) { showToast('Vui lòng nhập tên học sinh.', 'error'); return }
    if (!emailOk(form.email)) { showToast('Email không hợp lệ.', 'error'); return }
    if (form.password.length < 6) { showToast('Mật khẩu cần tối thiểu 6 ký tự.', 'error'); return }
    setSaving(true)
    try {
      await api('/students', { method: 'POST', body: jsonBody({ name: form.name, email: form.email, password: form.password, classId: form.classId || undefined }) })
      play('success')
      showToast(`Đã tạo tài khoản cho ${form.name}.`)
      setCreateOpen(false)
      await reload()
    } catch (reason) { showToast(friendlyError(reason, 'Không thể tạo học sinh.'), 'error') } finally { setSaving(false) }
  }

  const saveEdit = async () => {
    if (!editTarget) return
    if (!edit.name.trim()) { showToast('Vui lòng nhập tên học sinh.', 'error'); return }
    if (edit.password && edit.password.length < 6) { showToast('Mật khẩu mới cần tối thiểu 6 ký tự.', 'error'); return }
    setSaving(true)
    try {
      await api(`/students/${editTarget.id}`, { method: 'PUT', body: jsonBody({ name: edit.name, active: edit.active, password: edit.password || undefined }) })
      play('success')
      showToast(edit.password ? 'Đã cập nhật thông tin và đặt lại mật khẩu.' : 'Đã cập nhật thông tin học sinh.')
      setEditOpen(false)
      await reloadDetail()
      await reload()
    } catch (reason) { showToast(friendlyError(reason, 'Không thể cập nhật.'), 'error') } finally { setSaving(false) }
  }

  const toggleActive = async (item: User) => {
    setBusy(item.id)
    try {
      const next = item.active === false
      await api(`/students/${item.id}`, { method: 'PUT', body: jsonBody({ active: next }) })
      play('toggle')
      showToast(next ? `Đã mở khóa tài khoản ${item.name}.` : `Đã khóa tài khoản ${item.name}.`)
      await reload()
      if (detail?.id === item.id) await reloadDetail()
    } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setBusy(null) }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <section className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h2 className="text-[26px] font-extrabold tracking-[-.8px]">Học sinh</h2><p className="mt-2 text-xs text-muted">Tạo tài khoản, quản lý hồ sơ và theo dõi tiến độ học tập.</p></div>
        <Button onClick={openCreate}><UserPlus size={17} />Tạo học sinh</Button>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-sm flex-1"><Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={event => setSearch(event.target.value)} className="field py-2.5 pl-10" placeholder="Tìm tên hoặc email..." /></div>
          <div className="flex flex-wrap items-center gap-3">
            <select value={classFilter} onChange={event => setClassFilter(event.target.value)} className="field w-auto py-2.5 text-xs"><option value="">Tất cả lớp</option>{(classes || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            <select value={sort} onChange={event => setSort(event.target.value as typeof sort)} className="field w-auto py-2.5 text-xs"><option value="name">Tên A–Z</option><option value="xp">XP cao nhất</option><option value="recent">Mới tham gia</option></select>
            <span className="text-[11px] text-muted">{students.length} học sinh</span>
          </div>
        </div>
        {loading ? <PageLoader /> : error ? <div className="p-5"><ErrorState message={error} onRetry={reload} /></div> : students.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left">
              <thead><tr className="border-b border-slate-100 bg-[#FAFAFD] text-[9px] uppercase tracking-[1px] text-muted"><th className="px-6 py-3">Học sinh</th><th className="px-4 py-3">Lớp</th><th className="px-4 py-3">Cấp độ</th><th className="px-4 py-3">Trạng thái</th><th className="px-4 py-3">Tham gia</th><th className="px-6 py-3 text-right">Thao tác</th></tr></thead>
              <tbody>
                {students.map(item => (
                  <tr key={item.id} className="border-b border-slate-50 last:border-0 hover:bg-[#FCFBFF]">
                    <td className="px-6 py-4"><button onClick={() => openDetail(item)} className="flex items-center gap-3 text-left"><Avatar name={item.name} size="sm" /><span><span className="block max-w-[200px] truncate text-xs font-bold">{item.name}</span><span className="mt-0.5 block max-w-[200px] truncate text-[10px] text-muted">{item.email}</span></span></button></td>
                    <td className="px-4 py-4"><div className="flex max-w-[180px] flex-wrap gap-1">{(item.classes || []).length ? (item.classes || []).map(c => <Badge key={c.id} tone="purple">{c.name}</Badge>) : <span className="text-[10px] text-muted">Chưa xếp lớp</span>}</div></td>
                    <td className="px-4 py-4"><p className="flex items-center gap-1.5 text-[11px] font-bold text-primary-600"><Sparkles size={13} />Cấp {item.level}</p><p className="mt-1 text-[10px] text-muted">{item.xp} XP</p></td>
                    <td className="px-4 py-4"><button onClick={() => toggleActive(item)} disabled={busy === item.id} title={item.active === false ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}>{item.active === false ? <Badge tone="gray"><ShieldOff size={12} />Đã khóa</Badge> : <Badge tone="green"><ShieldCheck size={12} />Hoạt động</Badge>}</button></td>
                    <td className="px-4 py-4 text-[10px] text-muted">{formatDate(item.createdAt)}</td>
                    <td className="px-6 py-4"><div className="flex items-center justify-end gap-1"><Button size="sm" variant="secondary" onClick={() => openDetail(item)}>Hồ sơ</Button><button className="icon-button" title="Chỉnh sửa" onClick={() => { setEditTarget(item); setEditOpen(true); setEdit({ name: item.name, active: item.active !== false, password: '' }) }}><Pencil size={16} /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Chưa có học sinh" description="Tạo tài khoản học sinh để các em có thể đăng nhập và làm bài. Học sinh tự đăng ký cũng sẽ xuất hiện ở đây." action={<Button onClick={openCreate}><UserPlus size={16} />Tạo học sinh đầu tiên</Button>} />
        )}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Tạo tài khoản học sinh" footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Hủy</Button><Button loading={saving} onClick={createStudent}>Tạo tài khoản</Button></>}>
        <div className="space-y-4">
          <div><label className="field-label" htmlFor="st-name">Họ và tên *</label><input id="st-name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} className="field" placeholder="Nguyễn Văn An" /></div>
          <div><label className="field-label" htmlFor="st-email">Email *</label><input id="st-email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} className="field" placeholder="an.nguyen@example.com" /></div>
          <div><label className="field-label" htmlFor="st-pass">Mật khẩu *</label><input id="st-pass" type="text" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} className="field" placeholder="Tối thiểu 6 ký tự" /><p className="mt-1.5 text-[10px] text-muted">Học sinh dùng email và mật khẩu này để đăng nhập.</p></div>
          <div><label className="field-label" htmlFor="st-class">Xếp vào lớp</label><select id="st-class" value={form.classId} onChange={event => setForm({ ...form, classId: event.target.value })} className="field"><option value="">Chưa xếp lớp</option>{(classes || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
        </div>
      </Modal>

      <Modal open={editOpen && Boolean(editTarget)} onClose={() => setEditOpen(false)} title="Chỉnh sửa học sinh" footer={<><Button variant="ghost" onClick={() => setEditOpen(false)}>Hủy</Button><Button loading={saving} onClick={saveEdit}>Lưu thay đổi</Button></>}>
        <div className="space-y-4">
          <div><label className="field-label" htmlFor="ed-name">Họ và tên *</label><input id="ed-name" value={edit.name} onChange={event => setEdit({ ...edit, name: event.target.value })} className="field" /></div>
          <div><label className="field-label" htmlFor="ed-pass">Mật khẩu mới</label><input id="ed-pass" type="text" value={edit.password} onChange={event => setEdit({ ...edit, password: event.target.value })} className="field" placeholder="Để trống nếu không đổi" /></div>
          <button type="button" onClick={() => setEdit({ ...edit, active: !edit.active })} className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition ${edit.active ? 'border-success bg-[#F0FAF7]' : 'border-slate-200 bg-white'}`}><span className="flex items-center gap-2 text-xs font-semibold">{edit.active ? <ShieldCheck size={17} className="text-success" /> : <ShieldOff size={17} className="text-muted" />}{edit.active ? 'Tài khoản đang hoạt động' : 'Tài khoản đang bị khóa'}</span><span className={`relative h-6 w-11 rounded-full transition ${edit.active ? 'bg-success' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${edit.active ? 'left-[22px]' : 'left-0.5'}`} /></span></button>
        </div>
      </Modal>

      {detail && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-[#252944]/35 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setDetail(null) }}>
          <motion.aside initial={{ x: 440 }} animate={{ x: 0 }} className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div className="flex items-center gap-3"><Avatar name={detail.name} size="lg" /><div className="min-w-0"><h3 className="truncate text-lg font-extrabold">{detail.name}</h3><p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-muted"><Mail size={12} />{detail.email}</p></div></div>
              <button className="icon-button" onClick={() => setDetail(null)} aria-label="Đóng"><X size={20} /></button>
            </div>
            {detailLoading || !detailData ? <div className="flex-1"><PageLoader label="Đang tải hồ sơ..." /></div> : (
              <div className="flex-1 overflow-y-auto p-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl bg-primary-50 p-3 text-center"><p className="text-lg font-extrabold text-primary-600">{detailData.level}</p><p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-primary-700">Cấp độ</p></div>
                  <div className="rounded-2xl bg-[#FFF3E4] p-3 text-center"><p className="text-lg font-extrabold text-[#B77A2C]">{detailData.xp}</p><p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#B77A2C]">XP</p></div>
                  <div className="rounded-2xl bg-[#E8F8F2] p-3 text-center"><p className="text-lg font-extrabold text-[#248D69]">{detailData.streak}</p><p className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#248D69]">Chuỗi ngày</p></div>
                </div>
                <div className="mt-4 flex items-center justify-between rounded-2xl border border-slate-100 p-3.5">
                  <span className="flex items-center gap-2 text-xs font-semibold">{detailData.active === false ? <><ShieldOff size={16} className="text-muted" />Đã khóa</> : <><ShieldCheck size={16} className="text-success" />Đang hoạt động</>}</span>
                  <div className="flex gap-2"><Button size="sm" variant="outline" onClick={openEdit}><Pencil size={14} />Sửa</Button><Button size="sm" variant={detailData.active === false ? 'success' : 'ghost'} loading={busy === detailData.id} onClick={() => toggleActive(detailData)}>{detailData.active === false ? 'Mở khóa' : 'Khóa'}</Button></div>
                </div>
                <div className="mt-5"><p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-muted"><UsersRound size={14} />Lớp học</p><div className="flex flex-wrap gap-1.5">{(detailData.classes || []).length ? (detailData.classes || []).map(c => <Badge key={c.id} tone="purple">{c.name}</Badge>) : <span className="text-[11px] text-muted">Chưa xếp lớp nào.</span>}</div></div>
                <div className="mt-6">
                  <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted">Lượt làm bài gần đây</p>
                  {detailData.attempts.length ? (
                    <ul className="space-y-2.5">
                      {detailData.attempts.slice(0, 12).map(attempt => (
                        <li key={attempt.id} className="rounded-2xl border border-slate-100 bg-[#FCFCFE] p-3.5">
                          <div className="flex items-center justify-between gap-3"><p className="min-w-0 flex-1 truncate text-xs font-bold">{attempt.exam?.title || 'Đề thi'}</p><span className={`shrink-0 text-sm font-extrabold ${attempt.percentage >= 80 ? 'text-success' : attempt.percentage >= 50 ? 'text-[#B77A2C]' : 'text-danger'}`}>{attempt.percentage}%</span></div>
                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted"><span>{attempt.score}/{attempt.maxScore} điểm · {attempt.exam?.subject}</span><span>{formatDateTime(attempt.submittedAt || attempt.startedAt)}</span></div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="rounded-2xl bg-[#F4F5FB] p-4 text-[11px] leading-5 text-muted">Học sinh chưa làm bài thi nào.</p>}
                </div>
              </div>
            )}
          </motion.aside>
        </div>
      )}
    </motion.div>
  )
}