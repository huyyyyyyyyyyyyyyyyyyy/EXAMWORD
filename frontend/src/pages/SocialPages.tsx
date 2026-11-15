import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Loader2, Megaphone, MessageCircle, Plus, Send, UserRoundSearch, UsersRound, X } from 'lucide-react'
import { Avatar, Badge, Button, EmptyState, ErrorState, Modal, PageLoader } from '../components/ui'
import { useAsync } from '../hooks/useAsync'
import { api, jsonBody } from '../services/api'
import { useAuth } from '../stores/AuthContext'
import { useToast } from '../stores/ToastContext'
import type { ChatMessage, ChatThread, CommunityBootstrap, NotificationItem, TutorData, TutorRequest } from '../types'
import { formatDateTime, friendlyError, timeAgo } from '../utils'

function Heading({ icon, title, description, action }: { icon: ReactNode; title: string; description: string; action?: ReactNode }) {
  return <section className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><span className="mt-0.5 rounded-2xl bg-primary-50 p-3 text-primary-600">{icon}</span><div><h2 className="text-2xl font-extrabold tracking-[-.6px]">{title}</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted">{description}</p></div></div>{action}</section>
}

const kindLabel = { direct: 'Giáo viên', class: 'Nhóm lớp', tutor: 'Gia sư', live: 'Phòng live' }
const kindTone = { direct: 'blue', class: 'green', tutor: 'purple', live: 'orange' } as const

export function MessagesPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const location = useLocation()
  const initialThread = (location.state as { threadId?: string } | null)?.threadId
  const threadsQuery = useAsync<ChatThread[]>('/community/threads')
  const bootstrapQuery = useAsync<CommunityBootstrap>('/community/bootstrap')
  const [selectedId, setSelectedId] = useState<string | null>(initialThread ?? null)
  const conversation = useAsync<{ thread: ChatThread; messages: ChatMessage[] }>(selectedId ? `/community/threads/${selectedId}/messages` : null)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [newOpen, setNewOpen] = useState(false)
  const [teacherId, setTeacherId] = useState('')
  const [annOpen, setAnnOpen] = useState(false)
  const [annTitle, setAnnTitle] = useState('')
  const [annContent, setAnnContent] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const threads = threadsQuery.data ?? []
  const selected = threads.find((thread) => thread.id === selectedId) ?? conversation.data?.thread

  useEffect(() => { if (!selectedId && threads.length) setSelectedId(threads[0].id) }, [selectedId, threads])
  useEffect(() => {
    if (!selectedId) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') { void conversation.reload(); void threadsQuery.reload() }
    }, 5000)
    return () => window.clearInterval(timer)
  }, [selectedId, conversation.reload, threadsQuery.reload])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [conversation.data?.messages.length, selectedId])

  const openThread = (id: string) => { setSelectedId(id); setNewOpen(false) }
  const openDirect = async () => {
    if (!teacherId) return
    setSending(true)
    try { const thread = await api<ChatThread>('/community/direct', { method: 'POST', body: jsonBody({ userId: teacherId }) }); await threadsQuery.reload(); openThread(thread.id) } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setSending(false) }
  }
  const openClass = async (classId: string) => {
    setSending(true)
    try { const thread = await api<ChatThread>(`/community/classes/${classId}/thread`, { method: 'POST' }); await threadsQuery.reload(); openThread(thread.id) } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setSending(false) }
  }
  const sendAnnouncement = async () => {
    if (!selected?.classId || !annTitle.trim() || !annContent.trim()) { showToast('Vui lòng nhập tiêu đề và nội dung thông báo.', 'error'); return }
    setSending(true)
    try { const result = await api<{ recipients: number }>('/community/announcements', { method: 'POST', body: jsonBody({ classId: selected.classId, title: annTitle, content: annContent }) }); showToast(`Đã gửi thông báo đến ${result.recipients} học sinh.`); setAnnOpen(false); setAnnTitle(''); setAnnContent(''); await conversation.reload(); await threadsQuery.reload() } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setSending(false) }
  }
  const send = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedId || !content.trim()) return
    setSending(true)
    try { await api(`/community/threads/${selectedId}/messages`, { method: 'POST', body: jsonBody({ content }) }); setContent(''); await conversation.reload(); await threadsQuery.reload() } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setSending(false) }
  }

  return <div>
    <Heading icon={<MessageCircle size={23} />} title="Tin nhắn" description="Trao đổi giữa giáo viên, nhóm học tập theo lớp, buổi gia sư và phòng live. Tin nhắn được cập nhật định kỳ khi bạn mở trang." action={user?.role !== 'student' ? <Button onClick={() => setNewOpen(true)}><Plus size={17} />Chat giáo viên</Button> : undefined} />
    <div className="grid min-h-[620px] overflow-hidden rounded-3xl border border-[#ECECF4] bg-white shadow-soft lg:grid-cols-[320px_1fr]">
      <aside className="border-b border-[#ECECF4] lg:border-b-0 lg:border-r">
        <div className="border-b border-slate-100 p-4"><p className="text-xs font-bold text-ink">Cuộc trò chuyện</p><p className="mt-1 text-[11px] text-muted">{threads.reduce((sum, thread) => sum + thread.unread, 0)} tin chưa đọc</p></div>
        <div className="max-h-[330px] overflow-y-auto p-2 lg:max-h-[510px]">
          {threadsQuery.loading ? <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary-500" /></div> : threads.length ? threads.map((thread) => <button key={thread.id} onClick={() => openThread(thread.id)} className={`mb-1 w-full rounded-2xl p-3 text-left transition ${selectedId === thread.id ? 'bg-primary-50' : 'hover:bg-slate-50'}`}><div className="flex items-center gap-2"><Badge tone={kindTone[thread.kind]}>{kindLabel[thread.kind]}</Badge><span className="ml-auto text-[10px] text-muted">{timeAgo(thread.updatedAt)}</span></div><div className="mt-2 flex items-center gap-2"><p className="min-w-0 flex-1 truncate text-xs font-bold">{thread.title}</p>{thread.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-500 px-1 text-[10px] font-bold text-white">{thread.unread}</span>}</div><p className="mt-1 truncate text-[11px] text-muted">{thread.lastMessage?.content || 'Bắt đầu cuộc trò chuyện'}</p></button>) : <EmptyState title="Chưa có cuộc trò chuyện" description="Mở nhóm lớp hoặc tìm gia sư để bắt đầu." />}
        </div>
        {(bootstrapQuery.data?.classes.length ?? 0) > 0 && <div className="border-t border-slate-100 p-4"><p className="mb-2 text-[11px] font-bold text-muted">NHÓM LỚP CỦA BẠN</p><div className="flex flex-wrap gap-2">{bootstrapQuery.data?.classes.map((item) => <button key={item.id} disabled={sending} onClick={() => item.threadId ? openThread(item.threadId) : void openClass(item.id)} className="rounded-xl bg-[#E8F8F2] px-3 py-2 text-[11px] font-semibold text-[#248D69] hover:bg-[#D9F2E9]"><UsersRound size={13} className="mr-1 inline" />{item.name}</button>)}</div></div>}
      </aside>
      <section className="flex min-h-[520px] flex-col">
        {selected ? <>
          <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-6"><Avatar name={selected.title} /><div className="min-w-0"><h3 className="truncate text-sm font-extrabold">{selected.title}</h3><p className="mt-0.5 text-[11px] text-muted">{selected.members.length} thành viên · {kindLabel[selected.kind]}</p></div>{selected.kind === 'class' && selected.classId && user?.role !== 'student' && <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => setAnnOpen(true)}><Megaphone size={15} /><span className="hidden sm:inline">Gửi thông báo</span></Button>}</div>
          <div className="flex-1 space-y-4 overflow-y-auto bg-[#FAFAFD] p-4 sm:p-6 lg:max-h-[450px]">
            {conversation.loading && !conversation.data ? <PageLoader label="Đang tải tin nhắn..." /> : conversation.error ? <ErrorState message={conversation.error} onRetry={conversation.reload} /> : conversation.data?.messages.length ? conversation.data.messages.map((message) => { const mine = message.senderId === user?.id; return <div key={message.id} className={`flex gap-2 ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] sm:max-w-[70%] ${mine ? 'text-right' : ''}`}><p className="mb-1 px-1 text-[10px] font-semibold text-muted">{mine ? 'Bạn' : message.sender.name} · {timeAgo(message.createdAt)}</p><div className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-left text-xs leading-5 ${mine ? 'rounded-br-md bg-primary-500 text-white' : 'rounded-bl-md border border-slate-100 bg-white text-ink'}`}>{message.content}</div></div></div> }) : <EmptyState title="Hãy gửi lời chào" description="Nội dung chỉ hiển thị với thành viên của cuộc trò chuyện này." />}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="flex items-end gap-2 border-t border-slate-100 p-3 sm:p-4"><textarea value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} className="field max-h-28 min-h-11 flex-1 resize-none py-3" maxLength={2000} placeholder="Nhập tin nhắn... (Enter để gửi)" aria-label="Nội dung tin nhắn" /><Button type="submit" loading={sending} disabled={!content.trim()} className="shrink-0"><Send size={17} /><span className="hidden sm:inline">Gửi</span></Button></form>
        </> : <EmptyState title="Chọn một cuộc trò chuyện" description="Chọn nhóm ở bên trái hoặc tạo cuộc trò chuyện mới." />}
      </section>
    </div>
    <Modal open={newOpen} onClose={() => setNewOpen(false)} title="Trò chuyện với giáo viên" footer={<><Button variant="ghost" onClick={() => setNewOpen(false)}>Hủy</Button><Button loading={sending} disabled={!teacherId} onClick={openDirect}>Mở cuộc trò chuyện</Button></>}><label className="field-label">Giáo viên hoặc quản trị viên</label><select className="field" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">Chọn người nhận</option>{bootstrapQuery.data?.teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.name} · {teacher.role === 'admin' ? 'Quản trị' : 'Giáo viên'}</option>)}</select></Modal>
    <Modal open={annOpen} onClose={() => setAnnOpen(false)} title="Thông báo đến cả lớp" footer={<><Button variant="ghost" onClick={() => setAnnOpen(false)}>Hủy</Button><Button loading={sending} disabled={!annTitle.trim() || !annContent.trim()} onClick={sendAnnouncement}>Gửi thông báo</Button></>}><div className="space-y-4"><div><label className="field-label">Tiêu đề</label><input className="field" maxLength={120} value={annTitle} onChange={(event) => setAnnTitle(event.target.value)} placeholder="Ví dụ: Kiểm tra 15 phút tuần sau" /></div><div><label className="field-label">Nội dung</label><textarea className="field min-h-28" maxLength={1500} value={annContent} onChange={(event) => setAnnContent(event.target.value)} placeholder="Nội dung gửi đến tất cả học sinh trong lớp..." /></div><p className="rounded-xl bg-primary-50 p-3 text-[11px] leading-5 text-primary-700">Thông báo được đăng trong nhóm chat lớp và gửi chuông thông báo cho từng học sinh.</p></div></Modal>
  </div>
}

export function NotificationsPage() {
  const { data, loading, error, reload } = useAsync<{ unread: number; items: NotificationItem[] }>('/notifications')
  const { showToast } = useToast()
  const navigate = useNavigate()
  const open = async (item: NotificationItem) => {
    try { await api(`/notifications/${item.id}/read`, { method: 'POST' }); await reload(); if (item.link) navigate(item.link) } catch (reason) { showToast(friendlyError(reason), 'error') }
  }
  const readAll = async () => { try { await api('/notifications/read-all', { method: 'POST' }); await reload(); showToast('Đã đánh dấu tất cả là đã đọc.') } catch (reason) { showToast(friendlyError(reason), 'error') } }
  return <div className="mx-auto max-w-4xl"><Heading icon={<Bell size={23} />} title="Thông báo" description="Tin nhắn, yêu cầu gia sư, lịch live và trạng thái đơn khóa học được tập hợp tại đây." action={data?.unread ? <Button variant="outline" onClick={readAll}><CheckCheck size={17} />Đọc tất cả</Button> : undefined} />
    {loading ? <PageLoader /> : error ? <ErrorState message={error} onRetry={reload} /> : data?.items.length ? <div className="card overflow-hidden">{data.items.map((item) => <button key={item.id} onClick={() => void open(item)} className={`flex w-full items-start gap-3 border-b border-slate-100 p-4 text-left last:border-0 hover:bg-slate-50 sm:p-5 ${!item.readAt ? 'bg-primary-50/45' : ''}`}><span className={`mt-1 rounded-xl p-2 ${!item.readAt ? 'bg-primary-100 text-primary-600' : 'bg-slate-100 text-slate-400'}`}><Bell size={17} /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><strong className="text-sm">{item.title}</strong>{!item.readAt && <span className="h-2 w-2 rounded-full bg-primary-500" />}</span><span className="mt-1 block text-xs leading-5 text-muted">{item.content}</span><span className="mt-2 block text-[10px] text-slate-400">{formatDateTime(item.createdAt)}</span></span></button>)}</div> : <div className="card"><EmptyState title="Không có thông báo mới" description="Các hoạt động liên quan đến bạn sẽ xuất hiện tại đây." /></div>}
  </div>
}

export function TutorsPage() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync<TutorData>('/tutors')
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [requestOpen, setRequestOpen] = useState(false)
  const [selectedTutor, setSelectedTutor] = useState('')
  const [subject, setSubject] = useState('')
  const [question, setQuestion] = useState('')
  const [subjects, setSubjects] = useState('')
  const [bio, setBio] = useState('')
  const [hourlyPrice, setHourlyPrice] = useState(0)
  const [available, setAvailable] = useState(true)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data?.profile) { setSubjects(data.profile.subjects.join(', ')); setBio(data.profile.bio); setHourlyPrice(data.profile.hourlyPrice); setAvailable(data.profile.available !== false) } }, [data?.profile])
  const ask = (tutorId = '') => { setSelectedTutor(tutorId); setRequestOpen(true) }
  const submitRequest = async () => {
    if (!subject.trim() || !question.trim()) { showToast('Vui lòng nhập môn học và câu hỏi.', 'error'); return }
    setBusy(true)
    try { await api('/tutors/requests', { method: 'POST', body: jsonBody({ teacherId: selectedTutor || null, subject, question }) }); showToast(selectedTutor ? 'Đã gửi câu hỏi đến gia sư.' : 'Đã đăng câu hỏi vào hàng chờ gia sư.'); setRequestOpen(false); setQuestion(''); await reload() } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setBusy(false) }
  }
  const saveProfile = async () => {
    setBusy(true)
    try { await api('/tutors/profile', { method: 'PUT', body: jsonBody({ subjects: subjects.split(',').map((item) => item.trim()).filter(Boolean), bio, hourlyPrice, available }) }); showToast('Đã lưu hồ sơ gia sư.'); await reload() } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setBusy(false) }
  }
  const accept = async (request: TutorRequest) => {
    setBusy(true)
    try { const result = await api<{ threadId: string }>(`/tutors/requests/${request.id}/accept`, { method: 'POST' }); showToast('Đã nhận hỗ trợ. Mở cuộc trò chuyện để trả lời học sinh.'); navigate('/messages', { state: { threadId: result.threadId } }) } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setBusy(false) }
  }
  const close = async (request: TutorRequest) => { setBusy(true); try { await api(`/tutors/requests/${request.id}/close`, { method: 'POST' }); await reload(); showToast('Đã đóng yêu cầu hỗ trợ.') } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setBusy(false) } }

  return <div><Heading icon={<UserRoundSearch size={23} />} title="Gia sư & hỏi bài" description="Học sinh chọn giáo viên đang nhận gia sư hoặc đăng câu hỏi vào hàng chờ. Khi được nhận, hai bên trao đổi trong một cuộc chat riêng." action={user?.role === 'student' ? <Button onClick={() => ask()}><Plus size={17} />Đăng câu hỏi</Button> : undefined} />
    {loading ? <PageLoader /> : error ? <ErrorState message={error} onRetry={reload} /> : <div className="space-y-6">
      {user?.role === 'teacher' && <section className="card p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><div><h3 className="font-extrabold">Hồ sơ nhận gia sư</h3><p className="mt-1 text-xs text-muted">Bật trạng thái sẵn sàng để học sinh tìm thấy bạn.</p></div><Badge tone={available ? 'green' : 'gray'}>{available ? 'Đang nhận' : 'Tạm ẩn'}</Badge></div><div className="grid gap-4 md:grid-cols-2"><div><label className="field-label">Môn hỗ trợ (phân cách bằng dấu phẩy)</label><input className="field" value={subjects} onChange={(event) => setSubjects(event.target.value)} placeholder="Toán học, Vật lý" /></div><div><label className="field-label">Học phí tham khảo (VND/giờ, 0 nếu miễn phí)</label><input className="field" type="number" min={0} value={hourlyPrice} onChange={(event) => setHourlyPrice(Number(event.target.value))} /></div><div className="md:col-span-2"><label className="field-label">Giới thiệu kinh nghiệm</label><textarea className="field min-h-24" value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Kinh nghiệm, phương pháp và lịch hỗ trợ..." /></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={available} onChange={(event) => setAvailable(event.target.checked)} className="h-4 w-4 accent-primary-500" />Sẵn sàng nhận yêu cầu</label><Button loading={busy} onClick={saveProfile}>Lưu hồ sơ</Button></div></section>}
      {user?.role === 'student' && <section><div className="mb-4 flex items-center justify-between"><h3 className="font-extrabold">Gia sư đang sẵn sàng</h3><Badge tone="green">{data?.tutors.length ?? 0} giáo viên</Badge></div>{data?.tutors.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.tutors.map((tutor) => <article key={tutor.userId} className="card p-5"><div className="flex items-center gap-3"><Avatar name={tutor.name || 'G'} size="lg" /><div><h4 className="font-extrabold">{tutor.name}</h4><p className="mt-1 text-xs font-semibold text-primary-600">{tutor.hourlyPrice ? `${tutor.hourlyPrice.toLocaleString('vi-VN')} VND/giờ` : 'Hỗ trợ miễn phí'}</p></div></div><div className="mt-4 flex flex-wrap gap-1.5">{tutor.subjects.map((item) => <Badge key={item}>{item}</Badge>)}</div><p className="mt-3 line-clamp-3 text-xs leading-5 text-muted">{tutor.bio}</p><Button className="mt-4 w-full" variant="outline" onClick={() => ask(tutor.userId)}><MessageCircle size={16} />Hỏi bài</Button></article>)}</div> : <div className="card"><EmptyState title="Chưa có gia sư trực tuyến" description="Bạn vẫn có thể đăng câu hỏi vào hàng chờ. Giáo viên đăng ký gia sư sẽ nhận thông báo." action={<Button onClick={() => ask()}>Đăng câu hỏi chờ</Button>} /></div>}</section>}
      <section><h3 className="mb-4 font-extrabold">{user?.role === 'student' ? 'Yêu cầu của tôi' : 'Yêu cầu cần xử lý'}</h3>{data?.requests.length ? <div className="space-y-3">{data.requests.map((request) => <article key={request.id} className="card p-4 sm:p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge tone={request.status === 'accepted' ? 'green' : request.status === 'waiting' ? 'orange' : 'gray'}>{request.status === 'accepted' ? 'Đã nhận' : request.status === 'waiting' ? 'Đang chờ' : 'Đã đóng'}</Badge><Badge tone="blue">{request.subject}</Badge></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6">{request.question}</p><p className="mt-2 text-[11px] text-muted">{request.studentName}{request.teacherName ? ` · ${request.teacherName}` : ''} · {formatDateTime(request.createdAt)}</p></div><div className="flex shrink-0 gap-2">{request.status === 'waiting' && user?.role === 'teacher' && <Button loading={busy} onClick={() => void accept(request)}>Nhận hỗ trợ</Button>}{request.status === 'accepted' && request.threadId && <Button variant="outline" onClick={() => navigate('/messages', { state: { threadId: request.threadId } })}><MessageCircle size={16} />Mở chat</Button>}{request.status !== 'closed' && (request.status !== 'waiting' || request.studentId === user?.id) && <Button variant="ghost" onClick={() => void close(request)}><X size={16} />Đóng</Button>}</div></div></article>)}</div> : <div className="card"><EmptyState title="Chưa có yêu cầu nào" description="Những câu hỏi và buổi hỗ trợ sẽ hiển thị tại đây." /></div>}</section>
    </div>}
    <Modal open={requestOpen} onClose={() => setRequestOpen(false)} title="Đăng câu hỏi cho gia sư" footer={<><Button variant="ghost" onClick={() => setRequestOpen(false)}>Hủy</Button><Button loading={busy} onClick={submitRequest}>Gửi câu hỏi</Button></>}><div className="space-y-4"><div><label className="field-label">Môn học</label><input className="field" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ví dụ: Toán học" /></div><div><label className="field-label">Câu hỏi chi tiết</label><textarea className="field min-h-32" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={3000} placeholder="Mô tả bài tập và bước bạn đang gặp khó khăn..." /></div><p className="rounded-xl bg-primary-50 p-3 text-[11px] leading-5 text-primary-700">Không gửi mật khẩu, thông tin ngân hàng hoặc dữ liệu cá nhân nhạy cảm trong cuộc trò chuyện.</p></div></Modal>
  </div>
}
