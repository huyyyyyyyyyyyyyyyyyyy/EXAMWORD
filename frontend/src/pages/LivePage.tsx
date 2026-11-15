import { useEffect, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { BellPlus, BellRing, CalendarClock, Clock3, MessageCircle, Mic, MicOff, Plus, Radio, Send, UsersRound, Video, VideoOff } from 'lucide-react'
import { Badge, Button, EmptyState, ErrorState, Modal, PageLoader } from '../components/ui'
import { useAsync } from '../hooks/useAsync'
import { api, jsonBody } from '../services/api'
import { useAuth } from '../stores/AuthContext'
import { useToast } from '../stores/ToastContext'
import type { ChatMessage, LiveRoom } from '../types'
import { formatDateTime, friendlyError } from '../utils'

function Heading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <section className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex items-start gap-3"><span className="mt-0.5 rounded-2xl bg-primary-50 p-3 text-primary-600"><Radio size={23} /></span><div><h2 className="text-2xl font-extrabold tracking-[-.6px]">{title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-muted">{description}</p></div></div>{action}</section>
}

type Signal = { id: string; senderId: string; kind: 'ready' | 'offer' | 'answer' | 'ice' | 'leave'; payload: Record<string, unknown> }

function LiveStudio({ room, onClose }: { room: LiveRoom; onClose: () => void }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const owner = room.teacherId === user?.id || user?.role === 'admin'
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const peers = useRef(new Map<string, RTCPeerConnection>())
  const [connected, setConnected] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [comment, setComment] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let active = true
    const send = async (kind: Signal['kind'], payload: Record<string, unknown>, recipientId?: string) => {
      await api(`/live/${room.id}/signals`, { method: 'POST', body: jsonBody({ kind, payload, recipientId }) })
    }
    const peerFor = (peerId: string) => {
      const existing = peers.current.get(peerId)
      if (existing) return existing
      const peer = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
      streamRef.current?.getTracks().forEach(track => peer.addTrack(track, streamRef.current!))
      peer.onicecandidate = event => { if (event.candidate) void send('ice', { candidate: event.candidate.toJSON() }, peerId).catch(() => undefined) }
      peer.ontrack = event => { if (videoRef.current && event.streams[0]) { videoRef.current.srcObject = event.streams[0]; setConnected(true) } }
      peer.onconnectionstatechange = () => { if (!owner) setConnected(peer.connectionState === 'connected') }
      peers.current.set(peerId, peer)
      return peer
    }
    const handle = async (signal: Signal) => {
      if (signal.kind === 'leave') { peers.current.get(signal.senderId)?.close(); peers.current.delete(signal.senderId); return }
      if (signal.kind === 'ready' && owner) {
        const peer = peerFor(signal.senderId)
        const offer = await peer.createOffer()
        await peer.setLocalDescription(offer)
        await send('offer', { description: peer.localDescription }, signal.senderId)
        return
      }
      if (signal.kind === 'offer' && !owner) {
        const peer = peerFor(signal.senderId)
        await peer.setRemoteDescription(signal.payload.description as RTCSessionDescriptionInit)
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        await send('answer', { description: peer.localDescription })
        return
      }
      const peer = peerFor(signal.senderId)
      if (signal.kind === 'answer') await peer.setRemoteDescription(signal.payload.description as RTCSessionDescriptionInit)
      if (signal.kind === 'ice') await peer.addIceCandidate(signal.payload.candidate as RTCIceCandidateInit)
    }
    const start = async () => {
      if (owner) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
          if (!active) { stream.getTracks().forEach(track => track.stop()); return }
          streamRef.current = stream
          if (videoRef.current) videoRef.current.srcObject = stream
          setConnected(true)
        } catch { setMediaError('Không thể mở camera/micro. Hãy cấp quyền trong trình duyệt rồi vào lại phòng.') }
      } else await send('ready', {})
      const poll = async () => {
        if (!active) return
        try {
          const signals = await api<Signal[]>(`/live/${room.id}/signals`)
          for (const signal of signals) { if (active) await handle(signal) }
        } catch { /* Retry on the next interval. */ }
      }
      await poll()
      const timer = window.setInterval(() => void poll(), 1800)
      return () => window.clearInterval(timer)
    }
    let stopPolling: (() => void) | undefined
    void start().then(stop => { stopPolling = stop }).catch(() => { if (active) setMediaError('Kết nối phòng live chưa sẵn sàng. Vui lòng thử lại.') })
    return () => {
      active = false
      stopPolling?.()
      peers.current.forEach(peer => peer.close())
      peers.current.clear()
      streamRef.current?.getTracks().forEach(track => track.stop())
      if (videoRef.current) videoRef.current.srcObject = null
    }
  }, [room.id, room.teacherId, owner])

  useEffect(() => {
    if (!room.threadId) return
    let active = true
    const load = () => api<{ messages: ChatMessage[] }>(`/community/threads/${room.threadId}/messages`).then(result => { if (active) setMessages(result.messages) }).catch(() => undefined)
    void load()
    const timer = window.setInterval(load, 2500)
    return () => { active = false; window.clearInterval(timer) }
  }, [room.threadId])

  const sendComment = async (event: FormEvent) => {
    event.preventDefault()
    if (!comment.trim() || !room.threadId) return
    setSending(true)
    try { await api(`/community/threads/${room.threadId}/messages`, { method: 'POST', body: jsonBody({ content: comment }) }); setComment(''); const result = await api<{ messages: ChatMessage[] }>(`/community/threads/${room.threadId}/messages`); setMessages(result.messages) } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setSending(false) }
  }
  const toggleTrack = (kind: 'audio' | 'video') => {
    const tracks = kind === 'audio' ? streamRef.current?.getAudioTracks() : streamRef.current?.getVideoTracks()
    tracks?.forEach(track => { track.enabled = !track.enabled })
    if (kind === 'audio') setMicOn(value => !value); else setCameraOn(value => !value)
  }

  return <Modal open onClose={onClose} title={room.title}>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(240px,1fr)]">
      <div><div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-950"><video ref={videoRef} autoPlay playsInline muted={owner} className="h-full w-full object-cover" />{!connected && <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-xs leading-6 text-white/70">{mediaError || 'Đang thiết lập kết nối trực tiếp...'}</div>}<span className="absolute left-3 top-3 rounded-full bg-danger px-3 py-1 text-[10px] font-bold text-white">TRỰC TIẾP</span></div>
        {mediaError && <p className="mt-3 text-xs text-danger">{mediaError}</p>}
        {owner && <div className="mt-3 flex gap-2"><Button size="sm" variant="outline" onClick={() => toggleTrack('audio')}>{micOn ? <Mic size={15} /> : <MicOff size={15} />}{micOn ? 'Tắt micro' : 'Bật micro'}</Button><Button size="sm" variant="outline" onClick={() => toggleTrack('video')}>{cameraOn ? <Video size={15} /> : <VideoOff size={15} />}{cameraOn ? 'Tắt camera' : 'Bật camera'}</Button></div>}
        <p className="mt-3 text-[10px] leading-5 text-muted">Kết nối WebRTC trực tiếp phù hợp phòng học nhỏ. Một số mạng chặn kết nối ngang hàng cần máy chủ TURN để hoạt động ổn định.</p>
      </div>
      <section className="flex min-h-72 flex-col rounded-2xl border border-slate-200 bg-slate-50"><h3 className="flex items-center gap-2 border-b border-slate-200 p-3 text-xs font-bold"><MessageCircle size={16} />Bình luận phòng live</h3><div className="max-h-80 flex-1 space-y-3 overflow-y-auto p-3">{messages.length ? messages.map(message => <div key={message.id}><p className="text-[10px] font-bold text-primary-600">{message.sender.name}</p><p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-700">{message.content}</p></div>) : <p className="py-8 text-center text-xs text-muted">Hãy gửi bình luận đầu tiên.</p>}</div><form onSubmit={sendComment} className="flex gap-2 border-t border-slate-200 p-3"><input className="field min-w-0 py-2 text-xs" maxLength={2000} value={comment} onChange={event => setComment(event.target.value)} placeholder="Nhập bình luận..." aria-label="Bình luận phòng live" /><Button size="sm" type="submit" loading={sending} disabled={!comment.trim()} aria-label="Gửi bình luận"><Send size={15} /></Button></form></section>
    </div>
  </Modal>
}

export function LivePage() {
  const { user } = useAuth()
  const { data, loading, error, reload } = useAsync<LiveRoom[]>('/live')
  const { showToast } = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<LiveRoom | null>(null)
  const [studio, setStudio] = useState<LiveRoom | null>(null)
  const [title, setTitle] = useState('')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [durationMinutes, setDurationMinutes] = useState(60)
  const [busy, setBusy] = useState(false)
  const openCreate = () => { setEditing(null); setTitle(''); setSubject(''); setDescription(''); setScheduledAt(''); setDurationMinutes(60); setFormOpen(true) }
  const openEdit = (room: LiveRoom) => { setEditing(room); setTitle(room.title); setSubject(room.subject); setDescription(room.description); setScheduledAt(room.scheduledAt.slice(0, 16)); setDurationMinutes(room.durationMinutes); setFormOpen(true) }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true)
    try { await api(editing ? `/live/${editing.id}` : '/live', { method: editing ? 'PUT' : 'POST', body: jsonBody({ title, subject, description, scheduledAt: new Date(scheduledAt).toISOString(), durationMinutes }) }); showToast(editing ? 'Đã cập nhật phòng live.' : 'Đã tạo lịch phát trực tiếp.'); setFormOpen(false); await reload() } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setBusy(false) }
  }
  const setStatus = async (room: LiveRoom, status: LiveRoom['status']) => {
    setBusy(true)
    try { await api(`/live/${room.id}`, { method: 'PUT', body: jsonBody({ status }) }); const updated = { ...room, status }; if (status === 'live') setStudio(updated); showToast(status === 'live' ? 'Phòng đã phát trực tiếp và thông báo cho học sinh.' : 'Đã cập nhật trạng thái phòng.'); await reload() } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setBusy(false) }
  }
  const toggleFollow = async (room: LiveRoom) => {
    setBusy(true)
    try { await api(`/teachers/${room.teacherId}/follow`, { method: room.teacherFollowed ? 'DELETE' : 'POST' }); showToast(room.teacherFollowed ? `Đã bỏ theo dõi ${room.teacherName}.` : `Đã theo dõi ${room.teacherName}.`); await reload() } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setBusy(false) }
  }
  const register = async (room: LiveRoom) => {
    setBusy(true)
    try { await api(`/live/${room.id}/register`, { method: 'POST' }); showToast('Đã đăng ký. Bạn sẽ nhận thông báo khi giáo viên bắt đầu.'); await reload() } catch (reason) { showToast(friendlyError(reason), 'error') } finally { setBusy(false) }
  }
  return <div><Heading title="Phòng live" description="Giáo viên phát camera và micro ngay trong ExamWorld. Học sinh đã đăng ký có thể xem và bình luận theo thờ i gian thực trong phòng được bảo vệ." action={user?.role === 'teacher' ? <Button onClick={openCreate}><Plus size={17} />Tạo lịch live</Button> : undefined} />
    {loading ? <PageLoader /> : error ? <ErrorState message={error} onRetry={reload} /> : data?.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{data.map(room => { const owner = room.teacherId === user?.id || user?.role === 'admin'; return <article key={room.id} className="card overflow-hidden"><div className={`p-5 ${room.status === 'live' ? 'bg-gradient-to-br from-[#E56980] to-[#C84865] text-white' : 'bg-gradient-to-br from-primary-500 to-[#6754C7] text-white'}`}><div className="flex items-center justify-between"><Badge tone={room.status === 'live' ? 'pink' : 'purple'} className="bg-white/15 text-white">{room.status === 'live' ? 'ĐANG LIVE' : room.status === 'scheduled' ? 'SẮP DIỄN RA' : room.status === 'ended' ? 'ĐÃ KẾT THÚC' : 'ĐÃ HỦY'}</Badge><Video size={22} /></div><h3 className="mt-5 text-lg font-extrabold leading-6">{room.title}</h3><p className="mt-2 text-xs text-white/75">{room.subject} · {room.teacherName}</p></div><div className="p-5"><p className="line-clamp-2 min-h-10 text-xs leading-5 text-muted">{room.description || 'Buổi học trực tiếp và thảo luận cùng giáo viên.'}</p><div className="mt-4 space-y-2 text-[11px] text-slate-600"><p className="flex items-center gap-2"><CalendarClock size={15} className="text-primary-500" />{formatDateTime(room.scheduledAt)}</p><p className="flex items-center gap-2"><Clock3 size={15} className="text-primary-500" />{room.durationMinutes} phút</p><p className="flex items-center gap-2"><UsersRound size={15} className="text-primary-500" />{room.registrationCount} học sinh đăng ký</p></div><div className="mt-5 flex flex-wrap gap-2">{room.registered && room.status === 'live' && <Button size="sm" onClick={() => setStudio(room)}><Video size={15} />Vào phòng live</Button>}{!room.registered && user?.role === 'student' && !['ended', 'cancelled'].includes(room.status) && <Button size="sm" loading={busy} onClick={() => void register(room)}>Đăng ký chờ</Button>}{user?.role === 'student' && <Button size="sm" variant={room.teacherFollowed ? 'secondary' : 'ghost'} loading={busy} onClick={() => void toggleFollow(room)}>{room.teacherFollowed ? <BellRing size={15} /> : <BellPlus size={15} />}{room.teacherFollowed ? 'Đang theo dõi' : 'Theo dõi giáo viên'}</Button>}{owner && <><Button size="sm" variant="ghost" onClick={() => openEdit(room)}>Sửa</Button>{room.status === 'scheduled' && <Button size="sm" variant="success" onClick={() => void setStatus(room, 'live')}>Bắt đầu</Button>}{room.status === 'live' && <Button size="sm" variant="secondary" onClick={() => void setStatus(room, 'ended')}>Kết thúc</Button>}</>}</div></div></article> })}</div> : <div className="card"><EmptyState title="Chưa có buổi live nào" description="Lịch phát do giáo viên tạo sẽ hiển thị tại đây." action={user?.role === 'teacher' ? <Button onClick={openCreate}>Tạo lịch live</Button> : undefined} /></div>}
    <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? 'Cập nhật phòng live' : 'Tạo lịch live'}><form onSubmit={save} className="space-y-4"><div><label className="field-label">Chủ đề</label><input required className="field" value={title} onChange={event => setTitle(event.target.value)} /></div><div><label className="field-label">Môn học</label><input required className="field" value={subject} onChange={event => setSubject(event.target.value)} /></div><div><label className="field-label">Mô tả</label><textarea className="field min-h-20" value={description} onChange={event => setDescription(event.target.value)} /></div><div className="grid gap-3 sm:grid-cols-2"><div><label className="field-label">Thờ i giangian bắt đầu</label><input required type="datetime-local" className="field" value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} /></div><div><label className="field-label">Thờ i gianlượng (phút)</label><input required type="number" min={5} max={480} className="field" value={durationMinutes} onChange={event => setDurationMinutes(Number(event.target.value))} /></div></div><div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>Hủy</Button><Button type="submit" loading={busy}>Lưu lịch</Button></div></form></Modal>
    {studio && <LiveStudio key={studio.id} room={studio} onClose={() => setStudio(null)} />}
  </div>
}
