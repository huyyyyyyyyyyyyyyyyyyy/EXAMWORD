import { useEffect, useRef, useState } from 'react'
import { Loader2, MessageCircle, Send, Trash2, Undo2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Comment } from '../types'
import { api, jsonBody } from '../services/api'
import { useAsync } from '../hooks/useAsync'
import { useAuth } from '../stores/AuthContext'
import { useToast } from '../stores/ToastContext'
import { useSound } from '../stores/SoundContext'
import { Avatar, Badge, Button } from './ui'
import { ChatBird } from './Characters'
import { friendlyError, timeAgo } from '../utils'

const roleBadge = { teacher: { label: 'Giáo viên', tone: 'purple' as const }, admin: { label: 'Quản trị', tone: 'blue' as const }, student: { label: 'Học sinh', tone: 'green' as const } }

export function Comments({ examId }: { examId: string }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const { play } = useSound()
  const { data, loading, error, reload, setData } = useAsync<Comment[]>(`/exams/${examId}/comments`)
  const [text, setText] = useState('')
  const [posting, setPosting] = useState(false)
  const [pending, setPending] = useState<Comment | null>(null)
  const pendingTimer = useRef<number | undefined>(undefined)
  const comments = data || []

  useEffect(() => () => { if (pendingTimer.current) window.clearTimeout(pendingTimer.current) }, [])

  const commitDelete = (comment: Comment) => {
    api(`/comments/${comment.id}`, { method: 'DELETE' }).catch(() => {
      setData(list => (list ? [...list, comment].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [comment]))
      showToast('Không thể xóa bình luận. Đã khôi phục lại.', 'error')
    })
  }

  const removeComment = (comment: Comment) => {
    play('toggle')
    if (pending && pendingTimer.current) { window.clearTimeout(pendingTimer.current); commitDelete(pending) }
    setData(list => (list || []).filter(item => item.id !== comment.id))
    setPending(comment)
    pendingTimer.current = window.setTimeout(() => { commitDelete(comment); setPending(null) }, 5000)
  }

  const undoDelete = () => {
    if (!pending) return
    if (pendingTimer.current) window.clearTimeout(pendingTimer.current)
    const restored = pending
    setData(list => [...(list || []), restored].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    setPending(null)
    play('success')
  }

  const submit = async () => {
    const content = text.trim()
    if (!content || !user || posting) return
    setPosting(true)
    const temp: Comment = { id: `temp-${Date.now()}`, examId, content, createdAt: new Date().toISOString(), author: { id: user.id, name: user.name, role: user.role }, canDelete: true }
    setData(list => [temp, ...(list || [])])
    setText('')
    try {
      const created = await api<Comment>(`/exams/${examId}/comments`, { method: 'POST', body: jsonBody({ content }) })
      setData(list => (list || []).map(item => (item.id === temp.id ? created : item)))
      play('success')
    } catch (reason) {
      setData(list => (list || []).filter(item => item.id !== temp.id))
      setText(content)
      showToast(friendlyError(reason, 'Không thể gửi bình luận.'), 'error')
    } finally { setPosting(false) }
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[#EEF0F6] bg-gradient-to-r from-[#FBF7FF] to-[#F4FAFF] px-5 py-4 sm:px-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F8B9C5] to-[#F27D91] text-white shadow-button"><MessageCircle size={19} /></span>
        <div className="flex-1">
          <h3 className="text-sm font-extrabold tracking-[-.2px]">Thảo luận về đề thi</h3>
          <p className="mt-0.5 text-[11px] text-muted">Cùng trao đổi cách làm, mẹo và thắc mắc với mọi người.</p>
        </div>
        <Badge tone="pink">{comments.length} bình luận</Badge>
      </div>

      <div className="p-5 sm:p-6">
        <div className="flex gap-3">
          <Avatar name={user?.name || '?'} />
          <div className="min-w-0 flex-1">
            <textarea
              value={text} onChange={event => setText(event.target.value.slice(0, 1000))} rows={3}
              placeholder="Chia sẻ suy nghĩ của bạn về đề thi này..."
              className="field resize-none leading-6"
              onKeyDown={event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') void submit() }}
              aria-label="Nội dung bình luận"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="text-[10px] text-muted">{text.length}/1000 · Ctrl + Enter để gửi</span>
              <Button size="sm" onClick={submit} loading={posting} disabled={!text.trim()}><Send size={14} />Gửi bình luận</Button>
            </div>
          </div>
        </div>

        <AnimatePresence>
          {pending && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#FBE2B7] bg-[#FFF9EE] px-4 py-3">
                <Trash2 size={16} className="shrink-0 text-[#B7791F]" />
                <p className="flex-1 text-xs font-medium text-[#8A5A12]">Đã xóa bình luận của bạn.</p>
                <button onClick={undoDelete} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-[11px] font-bold text-[#B7791F] shadow-sm hover:bg-[#FFF3E4]"><Undo2 size={14} />Hoàn tác</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted"><Loader2 size={17} className="animate-spin text-primary-500" />Đang tải thảo luận...</div>
          ) : error ? (
            <div className="py-8 text-center"><p className="text-sm text-muted">{friendlyError(error)}</p><Button variant="outline" size="sm" className="mt-3" onClick={reload}>Thử lại</Button></div>
          ) : comments.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center">
              <ChatBird size={130} />
              <p className="mt-2 text-sm font-bold">Chưa có bình luận nào</p>
              <p className="mt-1 max-w-xs text-xs leading-5 text-muted">Hãy là người đầu tiên chia sẻ cảm nhận hoặc đặt câu hỏi về đề thi này nhé!</p>
            </div>
          ) : (
            <ul className="space-y-4">
              <AnimatePresence initial={false}>
                {comments.map(comment => {
                  const badge = roleBadge[comment.author.role] || roleBadge.student
                  return (
                    <motion.li key={comment.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -20 }} className="group flex gap-3">
                      <Avatar name={comment.author.name} />
                      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-[#EEF0F6] bg-[#FAFBFE] px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-ink">{comment.author.name}</span>
                          <Badge tone={badge.tone}>{badge.label}</Badge>
                          <span className="text-[10px] text-muted">{timeAgo(comment.createdAt)}</span>
                          {comment.canDelete && (
                            <button onClick={() => removeComment(comment)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-semibold text-muted opacity-0 transition hover:bg-[#FDEFF3] hover:text-danger focus:opacity-100 group-hover:opacity-100" aria-label="Xóa bình luận"><Trash2 size={13} />Xóa</button>
                          )}
                        </div>
                        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-slate-600">{comment.content}</p>
                      </div>
                    </motion.li>
                  )
                })}
              </AnimatePresence>
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}