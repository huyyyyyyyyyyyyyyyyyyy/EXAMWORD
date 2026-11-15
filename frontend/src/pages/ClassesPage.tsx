import { useMemo, useState } from 'react'
import { DoorOpen, GraduationCap, Pencil, Plus, Search, Trash2, UserMinus, UserPlus, UsersRound, X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useAsync } from '../hooks/useAsync'
import type { ClassRoom, User } from '../types'
import { Avatar, Badge, Button, EmptyState, ErrorState, Modal, PageLoader } from '../components/ui'
import { api, jsonBody } from '../services/api'
import { formatDate } from '../utils'
import { useToast } from '../stores/ToastContext'
import { useSound } from '../stores/SoundContext'

const accents = [
  { bar: 'from-[#8171E8] to-[#B6A9F8]', soft: '#EEEAFE', text: '#6A59D1' },
  { bar: 'from-[#4FBCC9] to-[#8FE0E8]', soft: '#E7F7F9', text: '#2E97A4' },
  { bar: 'from-[#F09B62] to-[#F8C79F]', soft: '#FFF0E5', text: '#D07A3C' },
  { bar: 'from-[#D879A1] to-[#F0AEC8]', soft: '#FBEAF1', text: '#C25E88' },
  { bar: 'from-[#65B77A] to-[#A5DBB4]', soft: '#EBF7ED', text: '#479A5D' },
]

export function ClassesPage() {
  const { data, loading, error, reload } = useAsync<ClassRoom[]>('/classes')
  const { data: students } = useAsync<User[]>('/students')
  const { showToast } = useToast()
  const { play } = useSound()
  const [search, setSearch] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ClassRoom | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<ClassRoom | null>(null)
  const [detail, setDetail] = useState<ClassRoom | null>(null)
  const [addId, setAddId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const { data: members, loading: membersLoading, reload: reloadMembers } = useAsync<User[]>(detail ? `/classes/${detail.id}/students` : null)

  const classes = useMemo(() => (data || []).filter(item => item.name.toLowerCase().includes(search.toLowerCase()) || item.description.toLowerCase().includes(search.toLowerCase())), [data, search])
  const memberIds = useMemo(() => new Set((members || []).map(item => item.id)), [members])
  const addable = useMemo(() => (students || []).filter(item => !memberIds.has(item.id)), [students, memberIds])

  const openCreate = () => { setEditing(null); setName(''); setDescription(''); setFormOpen(true) }
  const openEdit = (item: ClassRoom) => { setEditing(item); setName(item.name); setDescription(item.description); setFormOpen(true) }
  const openDetail = (item: ClassRoom) => { play('tap'); setDetail(item); setAddId('') }

  const submitForm = async () => {
    if (!name.trim()) { showToast('Vui lòng nhập tên lớp.', 'error'); return }
    setSaving(true)
    try {
      if (editing) await api(`/classes/${editing.id}`, { method: 'PUT', body: jsonBody({ name, description }) })
      else await api('/classes', { method: 'POST', body: jsonBody({ name, description }) })
      play('success')
      showToast(editing ? 'Đã cập nhật lớp học.' : 'Đã tạo lớp học mới.')
      setFormOpen(false)
      await reload()
    } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Không thể lưu lớp.', 'error') } finally { setSaving(false) }
  }

  const removeClass = async () => {
    if (!deleting) return
    setBusy(deleting.id)
    try { await api(`/classes/${deleting.id}`, { method: 'DELETE' }); showToast(`Đã xóa lớp “${deleting.name}”. Học sinh vẫn được giữ trong danh sách.`); setDeleting(null); if (detail?.id === deleting.id) setDetail(null); await reload() } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Không thể xóa lớp.', 'error') } finally { setBusy(null) }
  }

  const addStudent = async () => {
    if (!detail || !addId) return
    setBusy('add')
    try { await api(`/classes/${detail.id}/students`, { method: 'POST', body: jsonBody({ studentId: addId }) }); play('success'); showToast('Đã thêm học sinh vào lớp.'); setAddId(''); await reloadMembers(); await reload() } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Không thể thêm học sinh.', 'error') } finally { setBusy(null) }
  }

  const removeStudent = async (student: User) => {
    if (!detail) return
    setBusy(student.id)
    try { await api(`/classes/${detail.id}/students/${student.id}`, { method: 'DELETE' }); showToast(`Đã đưa ${student.name} ra khỏi lớp.`); await reloadMembers(); await reload() } catch (reason) { showToast(reason instanceof Error ? reason.message : 'Không thể xóa học sinh.', 'error') } finally { setBusy(null) }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <section className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div><h2 className="text-[26px] font-extrabold tracking-[-.8px]">Lớp học</h2><p className="mt-2 text-xs text-muted">Chia học sinh thành nhiều lớp và gán đề thi theo từng lớp.</p></div>
        <Button onClick={openCreate}><Plus size={17} />Tạo lớp mới</Button>
      </section>

      <div className="relative mb-5 max-w-sm"><Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" /><input value={search} onChange={event => setSearch(event.target.value)} className="field py-2.5 pl-10" placeholder="Tìm lớp học..." /></div>

      {loading ? <PageLoader /> : error ? <ErrorState message={error} onRetry={reload} /> : classes.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((item, index) => {
            const accent = accents[index % accents.length]
            return (
              <motion.section key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className="card group overflow-hidden">
                <div className={`h-1.5 bg-gradient-to-r ${accent.bar}`} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl" style={{ background: accent.soft, color: accent.text }}><DoorOpen size={21} /></span>
                    <div className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                      <button className="icon-button" title="Sửa lớp" onClick={() => openEdit(item)}><Pencil size={16} /></button>
                      <button className="icon-button hover:bg-[#FDEFF3] hover:text-danger" title="Xóa lớp" onClick={() => setDeleting(item)}><Trash2 size={16} /></button>
                    </div>
                  </div>
                  <h3 className="mt-4 truncate text-base font-extrabold tracking-[-.3px]">{item.name}</h3>
                  <p className="mt-1.5 line-clamp-2 min-h-[32px] text-[11px] leading-4 text-muted">{item.description || 'Chưa có mô tả cho lớp này.'}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600"><UsersRound size={15} className="text-muted" />{item.studentCount} học sinh</span>
                    <span className="text-[10px] text-muted">{formatDate(item.createdAt)}</span>
                  </div>
                  <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => openDetail(item)}><GraduationCap size={15} />Quản lý học sinh</Button>
                </div>
              </motion.section>
            )
          })}
        </div>
      ) : (
        <div className="card"><EmptyState title="Chưa có lớp học" description="Tạo lớp đầu tiên để nhóm học sinh và gán các đề thi giới hạn theo lớp." action={<Button onClick={openCreate}><Plus size={16} />Tạo lớp đầu tiên</Button>} /></div>
      )}

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Chỉnh sửa lớp' : 'Tạo lớp mới'} footer={<><Button variant="ghost" onClick={() => setFormOpen(false)}>Hủy</Button><Button loading={saving} onClick={submitForm}>{editing ? 'Lưu thay đổi' : 'Tạo lớp'}</Button></>}>
        <div className="space-y-4">
          <div><label className="field-label" htmlFor="class-name">Tên lớp *</label><input id="class-name" value={name} onChange={event => setName(event.target.value)} className="field" placeholder="Ví dụ: Lớp 10A1 — Tiếng Anh" /></div>
          <div><label className="field-label" htmlFor="class-desc">Mô tả</label><textarea id="class-desc" value={description} onChange={event => setDescription(event.target.value)} className="field resize-none" rows={3} placeholder="Ghi chú về lớp, lịch học hoặc mục tiêu..." /></div>
        </div>
      </Modal>

      <Modal open={Boolean(deleting)} onClose={() => setDeleting(null)} title="Xóa lớp học?" footer={<><Button variant="ghost" onClick={() => setDeleting(null)}>Hủy</Button><Button variant="danger" loading={busy === deleting?.id} onClick={removeClass}>Xóa lớp</Button></>}>
        <p>Lớp “{deleting?.name}” sẽ bị xóa. Học sinh trong lớp vẫn còn trong danh sách của bạn, nhưng các đề gán riêng cho lớp này sẽ không còn hiển thị với họ.</p>
      </Modal>

      {detail && (
        <div className="fixed inset-0 z-[100] flex justify-end bg-[#252944]/35 backdrop-blur-sm" onMouseDown={event => { if (event.target === event.currentTarget) setDetail(null) }}>
          <motion.aside initial={{ x: 420 }} animate={{ x: 0 }} exit={{ x: 420 }} className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[1px] text-primary-600">Lớp học</p><h3 className="mt-1 truncate text-lg font-extrabold">{detail.name}</h3><p className="mt-1 text-[11px] text-muted">{(members || []).length} học sinh trong lớp</p></div>
              <button className="icon-button" onClick={() => setDetail(null)} aria-label="Đóng"><X size={20} /></button>
            </div>
            <div className="border-b border-slate-100 p-5">
              <label className="field-label">Thêm học sinh có sẵn</label>
              <div className="flex gap-2">
                <select value={addId} onChange={event => setAddId(event.target.value)} className="field min-w-0 flex-1">
                  <option value="">Chọn học sinh...</option>
                  {addable.map(item => <option key={item.id} value={item.id}>{item.name} — {item.email}</option>)}
                </select>
                <Button size="sm" disabled={!addId} loading={busy === 'add'} onClick={addStudent}><UserPlus size={16} />Thêm</Button>
              </div>
              {!addable.length && <p className="mt-2 text-[10px] leading-4 text-muted">Tất cả học sinh của bạn đã ở trong lớp, hoặc bạn chưa có học sinh. Hãy tạo học sinh ở mục “Học sinh”.</p>}
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {membersLoading ? <PageLoader label="Đang tải danh sách..." /> : (members || []).length ? (
                <ul className="space-y-2.5">
                  {(members || []).map(student => (
                    <li key={student.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-[#FCFCFE] p-3">
                      <Avatar name={student.name} size="sm" />
                      <div className="min-w-0 flex-1"><p className="truncate text-xs font-bold">{student.name}</p><p className="truncate text-[10px] text-muted">{student.email}</p></div>
                      <Badge tone="purple">Cấp {student.level}</Badge>
                      <button className="icon-button hover:bg-[#FDEFF3] hover:text-danger" title="Đưa ra khỏi lớp" disabled={busy === student.id} onClick={() => removeStudent(student)}><UserMinus size={16} /></button>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Lớp chưa có học sinh" description="Thêm học sinh có sẵn vào lớp bằng ô chọn phía trên." />
              )}
            </div>
          </motion.aside>
        </div>
      )}
    </motion.div>
  )
}