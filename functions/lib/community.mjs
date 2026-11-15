import { AppError, json, readJson, rows, isUuid, str } from './http.mjs';
import { paymentStatus, verifyPaymentWebhook, executeAutomaticPayout } from './payments.mjs';

const fail = (code, status = 400) => { throw new AppError(code, status); };
const now = () => new Date().toISOString();
const person = (u) => ({ id: u.id, name: u.name, role: u.role });
const money = (value) => Number.isInteger(value) && value >= 0 && value <= 1000000000 ? value : null;
const textList = (value, max = 8) => Array.isArray(value) ? [...new Set(value.map((x) => str(x, 80)).filter(Boolean))].slice(0, max) : [];
const liveUrl = (value, required = false) => {
  const raw = str(value, 1000);
  if (!raw) { if (required) fail('stream_url_required'); return null; }
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password) fail('invalid_stream_url');
    return url.toString();
  } catch { fail('invalid_stream_url'); }
};

export function createCommunityRouter({ db, currentUser, requireRole, classRow, canManageClass }) {
  async function userRow(id) {
    if (!isUuid(id)) fail('not_found', 404);
    const found = rows(await db.from('users').select('*').eq('id', id).limit(1));
    if (!found.length || found[0].active === false) fail('not_found', 404);
    return found[0];
  }
  async function notify(userIds, type, title, content, link = '') {
    const createdAt = now();
    for (const userId of [...new Set(userIds.filter(isUuid))].slice(0, 200)) {
      rows(await db.from('notifications').insert({ id: crypto.randomUUID(), user_id: userId, type, title: str(title, 160), content: str(content, 500), link: str(link, 300), read_at: null, active: true, created_at: createdAt }).select('id'));
    }
  }
  async function threadRow(id) {
    if (!isUuid(id)) fail('not_found', 404);
    const found = rows(await db.from('threads').select('*').eq('id', id).limit(1));
    if (!found.length || found[0].active === false) fail('not_found', 404);
    return found[0];
  }
  async function isMember(threadId, userId) {
    return rows(await db.from('thread_members').select('*').eq('thread_id', threadId).eq('user_id', userId).eq('active', true).limit(1)).length === 1;
  }
  async function addMember(threadId, userId) {
    rows(await db.from('thread_members').insertIfAbsent({ member_key: `${threadId}:${userId}`, thread_id: threadId, user_id: userId, joined_at: now(), last_read_at: now(), active: true }, { onConflict: 'member_key' }).select('member_key'));
    rows(await db.from('thread_members').update({ active: true }).eq('thread_id', threadId).eq('user_id', userId).select('member_key'));
  }
  async function createThread(kind, title, userId, lookupKey, classId = null, liveId = null) {
    if (lookupKey) {
      const existing = rows(await db.from('threads').select('*').eq('lookup_key', lookupKey).limit(1));
      if (existing.length) {
        await addMember(existing[0].id, userId);
        return existing[0];
      }
    }
    const id = crypto.randomUUID();
    const createdAt = now();
    const created = rows(await db.from('threads').insertIfAbsent({ id, kind, title: str(title, 160), lookup_key: lookupKey, class_id: classId, live_id: liveId, created_by: userId, active: true, created_at: createdAt, updated_at: createdAt }, { onConflict: lookupKey ? 'lookup_key' : 'id' }).select('*'));
    const thread = created[0] ?? rows(await db.from('threads').select('*').eq('lookup_key', lookupKey).limit(1))[0];
    if (!thread) fail('thread_unavailable', 503);
    await addMember(thread.id, userId);
    return thread;
  }
  async function accessibleClass(user, classId) {
    const c = await classRow(classId);
    if (canManageClass(user, c)) return c;
    if (user.role !== 'student') fail('forbidden', 403);
    const member = rows(await db.from('class_members').select('class_id').eq('class_id', c.id).eq('student_id', user.id).eq('active', true).limit(1));
    if (!member.length) fail('forbidden', 403);
    return c;
  }
  async function classThread(user, classId) {
    const c = await accessibleClass(user, classId);
    const thread = await createThread('class', `Nhóm ${c.name}`, c.teacher_id, `class:${c.id}`, c.id);
    await addMember(thread.id, user.id);
    return thread;
  }
  async function authorizeThread(user, thread) {
    if (!(await isMember(thread.id, user.id))) fail('forbidden', 403);
    if (thread.kind === 'class') await accessibleClass(user, thread.class_id);
    if (thread.kind === 'live') {
      const live = rows(await db.from('live_rooms').select('*').eq('id', thread.live_id).limit(1))[0];
      if (!live) fail('not_found', 404);
      if (live.teacher_id !== user.id && user.role !== 'admin') {
        const registered = rows(await db.from('live_registrations').select('registration_key').eq('live_id', live.id).eq('student_id', user.id).eq('active', true).limit(1));
        if (!registered.length) fail('forbidden', 403);
      }
    }
    return thread;
  }
  async function threadDict(thread, user) {
    const [memberRows, messageRows] = await Promise.all([
      db.from('thread_members').select('*').eq('thread_id', thread.id).eq('active', true).limit(202).then(rows),
      db.from('messages').select('*').eq('thread_id', thread.id).eq('active', true).order('created_at', { ascending: false }).limit(200).then(rows),
    ]);
    const users = rows(await db.from('users').select('id,name,role').eq('active', true).limit(2000));
    const byId = new Map(users.map((u) => [u.id, u]));
    const self = memberRows.find((m) => m.user_id === user.id);
    const lastRead = self?.last_read_at ? Date.parse(self.last_read_at) : 0;
    const last = messageRows[0];
    return {
      id: thread.id, kind: thread.kind, title: thread.title, classId: thread.class_id, liveId: thread.live_id,
      updatedAt: thread.updated_at, createdAt: thread.created_at,
      members: memberRows.map((m) => person(byId.get(m.user_id) ?? { id: m.user_id, name: 'Tài khoản', role: 'student' })),
      lastMessage: last ? { content: last.content, senderId: last.sender_id, createdAt: last.created_at } : null,
      unread: messageRows.filter((m) => m.sender_id !== user.id && Date.parse(m.created_at) > lastRead).length,
    };
  }
  function orderDict(order, course, student, teacher, platformBank = undefined) {
    return {
      id: order.id, courseId: order.course_id, courseTitle: course?.title ?? 'Khóa học', studentId: order.student_id,
      studentName: student?.name ?? 'Học sinh', teacherId: order.teacher_id, teacherName: teacher?.name ?? 'Giáo viên',
      grossAmount: order.gross_amount, platformFee: order.platform_fee, teacherAmount: order.teacher_amount,
      reference: order.reference, status: order.status, payoutStatus: order.payout_status,
      createdAt: order.created_at, paidAt: order.paid_at, payoutAt: order.payout_at, payoutReference: order.payout_reference,
      ...(platformBank ? { platformBank } : {}),
    };
  }
  async function platformBank() {
    const found = rows(await db.from('platform_settings').select('*').eq('key', 'platform_bank').limit(1));
    const value = found[0]?.value;
    if (!value || !str(value.bankName, 120) || !str(value.accountNumber, 40) || !str(value.accountName, 120)) return null;
    return { bankName: str(value.bankName, 120), accountNumber: str(value.accountNumber, 40), accountName: str(value.accountName, 120) };
  }
  async function requireTeacherBank(teacherId, code = 'teacher_bank_required') {
    const bank = rows(await db.from('teacher_bank_accounts').select('account_number,account_name,bank_name').eq('user_id', teacherId).limit(1))[0];
    if (!bank || !bank.account_number || !str(bank.account_name, 120) || !bank.bank_name) fail(code, 409);
  }
  async function courseRow(id) {
    if (!isUuid(id)) fail('not_found', 404);
    const found = rows(await db.from('courses').select('*').eq('id', id).limit(1));
    if (!found.length || found[0].status === 'archived') fail('not_found', 404);
    return found[0];
  }
  async function paidOrder(courseId, studentId) {
    return rows(await db.from('course_orders').select('*').eq('course_id', courseId).eq('student_id', studentId).eq('status', 'paid').limit(1))[0] ?? null;
  }
  async function courseDict(course, user, includeContent = false) {
    const teacher = await userRow(course.teacher_id);
    const order = user.role === 'student' ? await paidOrder(course.id, user.id) : null;
    const allowed = user.role === 'admin' || course.teacher_id === user.id || Boolean(order) || course.price === 0;
    return {
      id: course.id, title: course.title, description: course.description, subject: course.subject, grade: course.grade,
      price: course.price, status: course.status, teacherId: course.teacher_id, teacherName: teacher.name,
      createdAt: course.created_at, updatedAt: course.updated_at, enrolled: Boolean(order) || course.price === 0,
      ...(includeContent && allowed ? { content: course.content } : {}),
    };
  }
  function liveDict(room, teacher, registered, registrationCount, threadId, canViewUrl) {
    return {
      id: room.id, title: room.title, description: room.description, subject: room.subject,
      teacherId: room.teacher_id, teacherName: teacher?.name ?? 'Giáo viên', scheduledAt: room.scheduled_at,
      durationMinutes: room.duration_minutes, status: room.status, courseId: room.course_id,
      createdAt: room.created_at, registered, registrationCount, threadId,
      ...(canViewUrl && room.stream_url ? { streamUrl: room.stream_url } : {}),
    };
  }

  async function notifyAdmins(type, title, content) {
    const admins = rows(await db.from('users').select('id').eq('role', 'admin').eq('active', true).limit(50));
    await notify(admins.map((admin) => admin.id), type, title, content, '/wallet');
  }
  async function confirmOrderPayment(order, paidAt) {
    if (order.status !== 'pending') fail('invalid_order_state', 409);
    const updated = rows(await db.from('course_orders').update({ status: 'paid', paid_at: paidAt, payout_status: order.gross_amount === 0 ? 'not_applicable' : 'ready' }).eq('id', order.id).eq('status', 'pending').select('*'));
    if (!updated.length) fail('invalid_order_state', 409);
    await notify([order.student_id], 'order', 'Thanh toán đã được xác nhận', 'Khóa học của bạn đã được mở.', '/courses');
    await notify([order.teacher_id], 'order', 'Đơn khóa học đã thanh toán', `Nền tảng đã xác nhận đơn ${order.reference}. Phần giáo viên: ${order.teacher_amount} VND.`, '/wallet');
    return updated[0];
  }
  async function maybeAutoPayout(orderId) {
    if (!paymentStatus().autoPayout) return null;
    const claimed = rows(await db.from('course_orders').update({ payout_status: 'processing' }).eq('id', orderId).eq('status', 'paid').eq('payout_status', 'ready').select('*'));
    if (!claimed.length) return null;
    const order = claimed[0];
    const bank = rows(await db.from('teacher_bank_accounts').select('account_number,account_name,bank_name').eq('user_id', order.teacher_id).limit(1))[0];
    if (!bank) {
      rows(await db.from('course_orders').update({ payout_status: 'failed' }).eq('id', order.id).eq('payout_status', 'processing').select('id'));
      await notify([order.teacher_id], 'payout', 'Tự động chi trả cần xử lý', `Đơn ${order.reference} chưa có tài khoản nhận tiền hợp lệ.`, '/wallet');
      await notifyAdmins('payout', 'Chi trả tự động chưa thành công', `Đơn ${order.reference} cần bổ sung tài khoản giáo viên.`);
      return { status: 'failed' };
    }
    try {
      const result = await executeAutomaticPayout(order, bank);
      if (!result) return null;
      const paidAt = now();
      const paid = rows(await db.from('course_orders').update({ payout_status: 'paid', payout_at: paidAt, payout_reference: result.payoutId }).eq('id', order.id).eq('payout_status', 'processing').select('id'));
      if (paid.length) await notify([order.teacher_id], 'payout', 'Đã tự động chuyển 90% doanh thu', `Đơn ${order.reference}: ${order.teacher_amount} VND đã được chuyển tới tài khoản đã đăng ký.`, '/wallet');
      return { status: 'paid' };
    } catch {
      rows(await db.from('course_orders').update({ payout_status: 'failed' }).eq('id', order.id).eq('payout_status', 'processing').select('id'));
      await notify([order.teacher_id], 'payout', 'Tự động chi trả chưa thành công', `Đơn ${order.reference} đã xác nhận thanh toán nhưng khoản chi ${order.teacher_amount} VND cần được thử lại hoặc đối soát.`, '/wallet');
      await notifyAdmins('payout', 'Chi trả tự động chưa thành công', `Đơn ${order.reference} cần thử lại chi trả hoặc đối soát dự phòng.`);
      return { status: 'failed' };
    }
  }

  return async function communityRoute(request, path, method) {
    if (/^\/api\/(payments|courses|wallet)(\/|$)/.test(path) || /^\/api\/admin\/(platform-bank|orders)(\/|$)/.test(path)) fail('feature_removed', 410);
    if (path === '/api/payments/webhook' && method === 'POST') {
      const event = await verifyPaymentWebhook(request);
      const existingEvent = rows(await db.from('payment_events').select('id').eq('event_id', event.eventId).limit(1));
      if (existingEvent.length) return json({ ok: true, duplicate: true });
      const duplicateTransaction = rows(await db.from('payment_events').select('id').eq('transaction_id', event.transactionId).limit(1));
      if (duplicateTransaction.length) fail('duplicate_payment_transaction', 409);
      const found = rows(await db.from('course_orders').select('*').eq('reference', event.reference).limit(1));
      if (!found.length || found[0].gross_amount !== event.amount) fail('payment_order_mismatch', 409);
      const createdAt = now();
      const inserted = rows(await db.from('payment_events').insertIfAbsent({ id: crypto.randomUUID(), event_id: event.eventId, transaction_id: event.transactionId, order_id: found[0].id, reference: event.reference, amount: event.amount, status: 'processing', created_at: createdAt }, { onConflict: 'event_id' }).select('id'));
      if (!inserted.length) return json({ ok: true, duplicate: true });
      try {
        const paidOrder = await confirmOrderPayment(found[0], event.paidAt ? new Date(event.paidAt).toISOString() : createdAt);
        rows(await db.from('payment_events').update({ status: 'processed' }).eq('event_id', event.eventId).select('id'));
        const payout = await maybeAutoPayout(paidOrder.id);
        return json({ ok: true, payoutStatus: payout?.status ?? paidOrder.payout_status });
      } catch (error) {
        rows(await db.from('payment_events').update({ status: 'rejected' }).eq('event_id', event.eventId).eq('status', 'processing').select('id'));
        throw error;
      }
    }

    // Notifications
    if (path === '/api/notifications' && method === 'GET') {
      const user = await currentUser(request);
      const list = rows(await db.from('notifications').select('*').eq('user_id', user.id).eq('active', true).order('created_at', { ascending: false }).limit(200));
      return json({ unread: list.filter((n) => !n.read_at).length, items: list.map((n) => ({ id: n.id, type: n.type, title: n.title, content: n.content, link: n.link, readAt: n.read_at, createdAt: n.created_at })) });
    }
    if (path === '/api/notifications/read-all' && method === 'POST') {
      const user = await currentUser(request);
      rows(await db.from('notifications').update({ read_at: now() }).eq('user_id', user.id).eq('read_at', null).select('id'));
      return json({ ok: true });
    }
    const notificationRead = path.match(/^\/api\/notifications\/([0-9a-f-]{36})\/read$/);
    if (notificationRead && method === 'POST') {
      const user = await currentUser(request);
      const found = rows(await db.from('notifications').update({ read_at: now() }).eq('id', notificationRead[1]).eq('user_id', user.id).select('id'));
      if (!found.length) fail('not_found', 404);
      return json({ ok: true });
    }

    // Chat bootstrap and threads
    if (path === '/api/community/bootstrap' && method === 'GET') {
      const user = await currentUser(request);
      const users = rows(await db.from('users').select('id,name,role').eq('active', true).order('name', { ascending: true }).limit(2000));
      let classes = [];
      if (user.role === 'student') {
        const memberships = rows(await db.from('class_members').select('class_id').eq('student_id', user.id).eq('active', true).limit(200));
        const ids = new Set(memberships.map((m) => m.class_id));
        classes = rows(await db.from('classes').select('*').eq('archived', false).limit(500)).filter((c) => ids.has(c.id));
      } else if (user.role === 'admin') classes = rows(await db.from('classes').select('*').eq('archived', false).limit(500));
      else classes = rows(await db.from('classes').select('*').eq('teacher_id', user.id).eq('archived', false).limit(500));
      const threads = rows(await db.from('threads').select('id,lookup_key').limit(2000));
      return json({
        teachers: user.role === 'student' ? [] : users.filter((u) => u.id !== user.id && ['teacher', 'admin'].includes(u.role)),
        classes: classes.map((c) => ({ id: c.id, name: c.name, threadId: threads.find((t) => t.lookup_key === `class:${c.id}`)?.id ?? null })),
      });
    }
    if (path === '/api/community/direct' && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const body = await readJson(request); const other = await userRow(body?.userId);
      if (other.id === user.id || !['teacher', 'admin'].includes(other.role)) fail('invalid_recipient');
      const key = `direct:${[user.id, other.id].sort().join(':')}`;
      const thread = await createThread('direct', other.name, user.id, key);
      await addMember(thread.id, other.id);
      return json(await threadDict(thread, user), 201);
    }
    const openClass = path.match(/^\/api\/community\/classes\/([0-9a-f-]{36})\/thread$/);
    if (openClass && method === 'POST') {
      const user = await currentUser(request);
      const thread = await classThread(user, openClass[1]);
      return json(await threadDict(thread, user), 201);
    }
    if (path === '/api/community/threads' && method === 'GET') {
      const user = await currentUser(request);
      const memberships = rows(await db.from('thread_members').select('thread_id').eq('user_id', user.id).eq('active', true).limit(300));
      const result = [];
      for (const m of memberships) {
        const found = rows(await db.from('threads').select('*').eq('id', m.thread_id).eq('active', true).limit(1));
        if (found.length) result.push(await threadDict(found[0], user));
      }
      result.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
      return json(result);
    }
    const threadMessages = path.match(/^\/api\/community\/threads\/([0-9a-f-]{36})\/messages$/);
    if (threadMessages && method === 'GET') {
      const user = await currentUser(request); const thread = await authorizeThread(user, await threadRow(threadMessages[1]));
      const list = rows(await db.from('messages').select('*').eq('thread_id', thread.id).eq('active', true).order('created_at', { ascending: true }).limit(300));
      const users = rows(await db.from('users').select('id,name,role').limit(2000));
      const byId = new Map(users.map((u) => [u.id, u]));
      rows(await db.from('thread_members').update({ last_read_at: now() }).eq('thread_id', thread.id).eq('user_id', user.id).select('member_key'));
      return json({ thread: await threadDict(thread, user), messages: list.map((m) => ({ id: m.id, content: m.content, senderId: m.sender_id, sender: person(byId.get(m.sender_id) ?? { id: m.sender_id, name: 'Tài khoản', role: 'student' }), createdAt: m.created_at })) });
    }
    if (threadMessages && method === 'POST') {
      const user = await currentUser(request); const thread = await authorizeThread(user, await threadRow(threadMessages[1]));
      const body = await readJson(request); const content = str(body?.content, 2000);
      if (!content) fail('invalid_message');
      if (thread.kind === 'tutor') {
        const requestRow = rows(await db.from('tutor_requests').select('status').eq('thread_id', thread.id).limit(1))[0];
        if (!requestRow || requestRow.status !== 'accepted') fail('conversation_closed', 409);
      }
      const createdAt = now(); const id = crypto.randomUUID();
      rows(await db.from('messages').insert({ id, thread_id: thread.id, sender_id: user.id, content, active: true, created_at: createdAt }).select('id'));
      rows(await db.from('threads').update({ updated_at: createdAt }).eq('id', thread.id).select('id'));
      rows(await db.from('thread_members').update({ last_read_at: createdAt }).eq('thread_id', thread.id).eq('user_id', user.id).select('member_key'));
      const members = rows(await db.from('thread_members').select('user_id').eq('thread_id', thread.id).eq('active', true).limit(200));
      await notify(members.map((m) => m.user_id).filter((idValue) => idValue !== user.id), 'message', `Tin nhắn từ ${user.name}`, content.slice(0, 120), '/messages');
      return json({ id, content, senderId: user.id, sender: person(user), createdAt }, 201);
    }
    const messageItem = path.match(/^\/api\/community\/messages\/([0-9a-f-]{36})$/);
    if (messageItem && method === 'DELETE') {
      const user = await currentUser(request);
      const found = rows(await db.from('messages').select('*').eq('id', messageItem[1]).limit(1));
      if (!found.length || (found[0].sender_id !== user.id && user.role !== 'admin')) fail('not_found', 404);
      await authorizeThread(user, await threadRow(found[0].thread_id));
      rows(await db.from('messages').update({ active: false }).eq('id', found[0].id).select('id'));
      return json({ ok: true });
    }

    // Class announcements (teacher -> every active student of a class)
    if (path === '/api/community/announcements' && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const body = await readJson(request); const title = str(body?.title, 120); const content = str(body?.content, 1500);
      if (!title || !content) fail('invalid_announcement');
      const c = await classRow(body?.classId);
      if (!canManageClass(user, c)) fail('forbidden', 403);
      const thread = await classThread(user, c.id);
      const createdAt = now(); const id = crypto.randomUUID();
      rows(await db.from('messages').insert({ id, thread_id: thread.id, sender_id: user.id, content: `📢 ${title}\n${content}`, active: true, created_at: createdAt }).select('id'));
      rows(await db.from('threads').update({ updated_at: createdAt }).eq('id', thread.id).select('id'));
      const students = rows(await db.from('class_members').select('student_id').eq('class_id', c.id).eq('active', true).limit(500));
      await notify(students.map((m) => m.student_id), 'announcement', `Thông báo lớp ${c.name}: ${title}`, content.slice(0, 200), '/messages');
      return json({ ok: true, recipients: students.length, threadId: thread.id }, 201);
    }

    // Follow a teacher to be notified about new live sessions
    const followRoute = path.match(/^\/api\/teachers\/([0-9a-f-]{36})\/follow$/);
    if (followRoute && ['POST', 'DELETE'].includes(method)) {
      const user = await currentUser(request); requireRole(user, ['student']);
      const teacher = await userRow(followRoute[1]); if (teacher.role !== 'teacher') fail('invalid_tutor');
      const key = `${teacher.id}:${user.id}`;
      const active = method === 'POST';
      rows(await db.from('teacher_follows').insertIfAbsent({ follow_key: key, teacher_id: teacher.id, student_id: user.id, active, created_at: now() }, { onConflict: 'follow_key' }).select('follow_key'));
      rows(await db.from('teacher_follows').update({ active }).eq('follow_key', key).select('follow_key'));
      return json({ ok: true, following: active });
    }

    // Tutor profiles and requests
    if (path === '/api/tutors' && method === 'GET') {
      const user = await currentUser(request);
      const profiles = rows(await db.from('tutor_profiles').select('*').eq('available', true).limit(300));
      const users = rows(await db.from('users').select('*').eq('active', true).limit(2000));
      const byId = new Map(users.map((u) => [u.id, u]));
      const tutors = profiles.filter((p) => byId.get(p.user_id)?.role === 'teacher').map((p) => ({ userId: p.user_id, name: byId.get(p.user_id).name, subjects: Array.isArray(p.subjects) ? p.subjects : [], bio: p.bio, hourlyPrice: p.hourly_price }));
      let requests = [];
      if (user.role === 'student') requests = rows(await db.from('tutor_requests').select('*').eq('student_id', user.id).order('created_at', { ascending: false }).limit(200));
      else if (user.role === 'admin') requests = rows(await db.from('tutor_requests').select('*').order('created_at', { ascending: false }).limit(300));
      else requests = rows(await db.from('tutor_requests').select('*').order('created_at', { ascending: false }).limit(300)).filter((r) => r.teacher_id === user.id || (r.status === 'waiting' && !r.teacher_id && profiles.some((p) => p.user_id === user.id)));
      const requestsOut = requests.map((r) => ({ id: r.id, studentId: r.student_id, studentName: byId.get(r.student_id)?.name ?? 'Học sinh', teacherId: r.teacher_id, teacherName: byId.get(r.teacher_id)?.name ?? null, subject: r.subject, question: r.question, status: r.status, threadId: r.thread_id, createdAt: r.created_at }));
      const ownProfile = user.role === 'teacher' ? rows(await db.from('tutor_profiles').select('*').eq('user_id', user.id).limit(1))[0] : null;
      return json({ tutors, requests: requestsOut, profile: ownProfile ? { subjects: Array.isArray(ownProfile.subjects) ? ownProfile.subjects : [], bio: ownProfile.bio, hourlyPrice: ownProfile.hourly_price, available: ownProfile.available } : null });
    }
    if (path === '/api/tutors/profile' && method === 'PUT') {
      const user = await currentUser(request); requireRole(user, ['teacher']);
      const body = await readJson(request); const bio = str(body?.bio, 1500); const subjects = textList(body?.subjects);
      if (!bio || !subjects.length) fail('invalid_profile');
      const hourlyPrice = money(body?.hourlyPrice); if (hourlyPrice === null) fail('invalid_price');
      const value = { subjects, bio, hourly_price: hourlyPrice, available: body?.available !== false, updated_at: now() };
      const existing = rows(await db.from('tutor_profiles').select('user_id').eq('user_id', user.id).limit(1));
      if (existing.length) rows(await db.from('tutor_profiles').update(value).eq('user_id', user.id).select('user_id'));
      else rows(await db.from('tutor_profiles').insert({ user_id: user.id, ...value }).select('user_id'));
      return json({ ok: true });
    }
    if (path === '/api/tutors/requests' && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['student']);
      const body = await readJson(request); const subject = str(body?.subject, 100); const question = str(body?.question, 3000);
      if (!subject || !question) fail('invalid_request');
      let teacher = null;
      if (body?.teacherId) {
        teacher = await userRow(body.teacherId); if (teacher.role !== 'teacher') fail('invalid_tutor');
        const profile = rows(await db.from('tutor_profiles').select('user_id').eq('user_id', teacher.id).eq('available', true).limit(1));
        if (!profile.length) fail('tutor_unavailable', 409);
      }
      const id = crypto.randomUUID(); const createdAt = now();
      rows(await db.from('tutor_requests').insert({ id, student_id: user.id, teacher_id: teacher?.id ?? null, subject, question, status: 'waiting', thread_id: null, created_at: createdAt, accepted_at: null, closed_at: null }).select('id'));
      let recipients = [];
      if (teacher) recipients = [teacher.id];
      else recipients = rows(await db.from('tutor_profiles').select('user_id').eq('available', true).limit(100)).map((p) => p.user_id);
      await notify(recipients, 'tutor', `Yêu cầu gia sư môn ${subject}`, `${user.name}: ${question.slice(0, 100)}`, '/tutors');
      return json({ id, status: 'waiting' }, 201);
    }
    const tutorAccept = path.match(/^\/api\/tutors\/requests\/([0-9a-f-]{36})\/accept$/);
    if (tutorAccept && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher']);
      const profile = rows(await db.from('tutor_profiles').select('user_id').eq('user_id', user.id).eq('available', true).limit(1));
      if (!profile.length) fail('tutor_profile_required', 409);
      const found = rows(await db.from('tutor_requests').select('*').eq('id', tutorAccept[1]).limit(1));
      if (!found.length) fail('not_found', 404);
      const req = found[0];
      if (req.status === 'accepted' && req.teacher_id === user.id && req.thread_id) return json({ threadId: req.thread_id, status: 'accepted' });
      if (req.status !== 'waiting' || (req.teacher_id && req.teacher_id !== user.id)) fail('request_unavailable', 409);
      const student = await userRow(req.student_id);
      const acceptedAt = now();
      const accepted = rows(await db.from('tutor_requests').update({ teacher_id: user.id, status: 'accepted', accepted_at: acceptedAt }).eq('id', req.id).eq('status', 'waiting').select('*'));
      if (!accepted.length) fail('request_unavailable', 409);
      const thread = await createThread('tutor', `Gia sư ${req.subject} · ${student.name}`, user.id, null);
      await addMember(thread.id, student.id);
      rows(await db.from('tutor_requests').update({ thread_id: thread.id }).eq('id', req.id).select('id'));
      rows(await db.from('messages').insert({ id: crypto.randomUUID(), thread_id: thread.id, sender_id: student.id, content: req.question, active: true, created_at: req.created_at }).select('id'));
      await notify([student.id], 'tutor', `${user.name} đã nhận hỗ trợ`, `Mở cuộc trò chuyện gia sư môn ${req.subject}.`, '/messages');
      return json({ threadId: thread.id, status: 'accepted' });
    }
    const tutorClose = path.match(/^\/api\/tutors\/requests\/([0-9a-f-]{36})\/close$/);
    if (tutorClose && method === 'POST') {
      const user = await currentUser(request);
      const found = rows(await db.from('tutor_requests').select('*').eq('id', tutorClose[1]).limit(1));
      if (!found.length || (found[0].student_id !== user.id && found[0].teacher_id !== user.id && user.role !== 'admin')) fail('not_found', 404);
      if (found[0].status === 'closed') return json({ ok: true });
      rows(await db.from('tutor_requests').update({ status: 'closed', closed_at: now() }).eq('id', found[0].id).select('id'));
      await notify([found[0].student_id, found[0].teacher_id].filter((id) => id && id !== user.id), 'tutor', 'Buổi hỗ trợ đã kết thúc', `Yêu cầu môn ${found[0].subject} đã được đóng.`, '/tutors');
      return json({ ok: true });
    }

    // Courses and bank-transfer orders
    if (path === '/api/courses' && method === 'GET') {
      const user = await currentUser(request);
      let list = rows(await db.from('courses').select('*').order('created_at', { ascending: false }).limit(500));
      list = list.filter((c) => c.status === 'published' || c.teacher_id === user.id || user.role === 'admin');
      const result = [];
      for (const course of list) result.push(await courseDict(course, user, course.teacher_id === user.id || user.role === 'admin'));
      return json(result);
    }
    if (path === '/api/courses' && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher']);
      const body = await readJson(request); const title = str(body?.title, 180); const description = str(body?.description, 3000); const content = str(body?.content, 20000); const subject = str(body?.subject, 100);
      const price = money(body?.price); if (!title || !description || !content || !subject || price === null) fail('invalid_course');
      if (body?.status === 'published' && price > 0) await requireTeacherBank(user.id);
      const createdAt = now(); const id = crypto.randomUUID();
      rows(await db.from('courses').insert({ id, teacher_id: user.id, title, description, content, subject, grade: str(body?.grade, 80), price, status: body?.status === 'published' ? 'published' : 'draft', created_at: createdAt, updated_at: createdAt }).select('id'));
      return json(await courseDict(await courseRow(id), user, true), 201);
    }
    const courseItem = path.match(/^\/api\/courses\/([0-9a-f-]{36})$/);
    if (courseItem && method === 'GET') {
      const user = await currentUser(request); const course = await courseRow(courseItem[1]);
      if (course.status !== 'published' && course.teacher_id !== user.id && user.role !== 'admin') fail('not_found', 404);
      return json(await courseDict(course, user, true));
    }
    if (courseItem && method === 'PUT') {
      const user = await currentUser(request); const course = await courseRow(courseItem[1]);
      if (course.teacher_id !== user.id && user.role !== 'admin') fail('forbidden', 403);
      const body = await readJson(request); const patch = { updated_at: now() };
      if (body?.title !== undefined) { patch.title = str(body.title, 180); if (!patch.title) fail('invalid_course'); }
      if (body?.description !== undefined) { patch.description = str(body.description, 3000); if (!patch.description) fail('invalid_course'); }
      if (body?.content !== undefined) { patch.content = str(body.content, 20000); if (!patch.content) fail('invalid_course'); }
      if (body?.subject !== undefined) patch.subject = str(body.subject, 100);
      if (body?.grade !== undefined) patch.grade = str(body.grade, 80);
      if (body?.price !== undefined) { const price = money(body.price); if (price === null) fail('invalid_price'); patch.price = price; }
      if (body?.status !== undefined) { if (!['draft', 'published', 'archived'].includes(body.status)) fail('invalid_status'); patch.status = body.status; }
      if ((patch.status ?? course.status) === 'published' && (patch.price ?? course.price) > 0) await requireTeacherBank(course.teacher_id);
      rows(await db.from('courses').update(patch).eq('id', course.id).select('id'));
      return json(await courseDict(await courseRow(course.id), user, true));
    }
    const courseOrder = path.match(/^\/api\/courses\/([0-9a-f-]{36})\/order$/);
    if (courseOrder && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['student']); const course = await courseRow(courseOrder[1]);
      if (course.status !== 'published') fail('course_unavailable', 409);
      if (course.price > 0) await requireTeacherBank(course.teacher_id, 'course_unavailable');
      const key = `${course.id}:${user.id}`;
      let order = rows(await db.from('course_orders').select('*').eq('order_key', key).limit(1))[0];
      if (order?.status === 'paid') return json(orderDict(order, course, user, null));
      const createdAt = now();
      if (!order) {
        const gross = course.price; const fee = Math.round(gross * 0.1);
        order = { id: crypto.randomUUID(), order_key: key, course_id: course.id, student_id: user.id, teacher_id: course.teacher_id, gross_amount: gross, platform_fee: fee, teacher_amount: gross - fee, reference: `EW${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`, status: gross === 0 ? 'paid' : 'pending', created_at: createdAt, paid_at: gross === 0 ? createdAt : null, payout_status: gross === 0 ? 'not_applicable' : 'unpaid', payout_at: null, payout_reference: '' };
        const created = rows(await db.from('course_orders').insertIfAbsent(order, { onConflict: 'order_key' }).select('*'));
        order = created[0] ?? rows(await db.from('course_orders').select('*').eq('order_key', key).limit(1))[0];
      } else if (order.status === 'cancelled') {
        const updated = rows(await db.from('course_orders').update({ status: course.price === 0 ? 'paid' : 'pending', gross_amount: course.price, platform_fee: Math.round(course.price * 0.1), teacher_amount: course.price - Math.round(course.price * 0.1), reference: `EW${crypto.randomUUID().replace(/-/g, '').slice(0, 10).toUpperCase()}`, created_at: createdAt, paid_at: course.price === 0 ? createdAt : null, payout_status: course.price === 0 ? 'not_applicable' : 'unpaid', payout_at: null, payout_reference: '' }).eq('id', order.id).select('*'));
        order = updated[0];
      }
      const teacher = await userRow(course.teacher_id);
      if (order.status === 'paid') await notify([teacher.id], 'order', 'Có học sinh tham gia khóa học', `${user.name} đã tham gia “${course.title}”.`, '/wallet');
      else await notify([teacher.id], 'order', 'Có đơn khóa học chờ thanh toán', `${user.name} đã tạo đơn “${course.title}”.`, '/wallet');
      return json(orderDict(order, course, user, teacher, order.status === 'pending' ? await platformBank() : undefined), order.created_at === createdAt ? 201 : 200);
    }

    // Live rooms and registrations
    if (path === '/api/live' && method === 'GET') {
      const user = await currentUser(request);
      const rooms = rows(await db.from('live_rooms').select('*').order('scheduled_at', { ascending: true }).limit(300)).filter((r) => r.status !== 'cancelled' || r.teacher_id === user.id || user.role === 'admin');
      const regs = rows(await db.from('live_registrations').select('*').eq('active', true).limit(5000));
      const threads = rows(await db.from('threads').select('id,live_id').eq('kind', 'live').eq('active', true).limit(500));
      const follows = user.role === 'student' ? rows(await db.from('teacher_follows').select('teacher_id').eq('student_id', user.id).eq('active', true).limit(500)) : [];
      const result = [];
      for (const room of rooms) {
        const teacher = await userRow(room.teacher_id);
        const registered = room.teacher_id === user.id || user.role === 'admin' || regs.some((r) => r.live_id === room.id && r.student_id === user.id);
        result.push({ ...liveDict(room, teacher, registered, regs.filter((r) => r.live_id === room.id).length, registered ? threads.find((t) => t.live_id === room.id)?.id ?? null : null, registered), teacherFollowed: follows.some((f) => f.teacher_id === room.teacher_id) });
      }
      return json(result);
    }
    if (path === '/api/live' && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher']);
      const body = await readJson(request); const title = str(body?.title, 180); const subject = str(body?.subject, 100); const scheduledAt = str(body?.scheduledAt, 60);
      if (!title || !subject || !Number.isFinite(Date.parse(scheduledAt)) || Date.parse(scheduledAt) < Date.now() - 300000) fail('invalid_live');
      const duration = Number.isInteger(body?.durationMinutes) ? Math.max(5, Math.min(480, body.durationMinutes)) : 60;
      const createdAt = now(); const id = crypto.randomUUID();
      rows(await db.from('live_rooms').insert({ id, teacher_id: user.id, title, description: str(body?.description, 3000), subject, scheduled_at: new Date(scheduledAt).toISOString(), duration_minutes: duration, status: 'scheduled', stream_url: null, course_id: null, created_at: createdAt, updated_at: createdAt }).select('id'));
      await createThread('live', `Phòng live · ${title}`, user.id, `live:${id}`, null, id);
      const followers = rows(await db.from('teacher_follows').select('student_id').eq('teacher_id', user.id).eq('active', true).limit(500));
      await notify(followers.map((f) => f.student_id), 'live', `${user.name} vừa lên lịch live`, `“${title}” bắt đầu lúc ${new Date(scheduledAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}. Mở Phòng live để đăng ký chờ.`, '/live');
      return json({ id }, 201);
    }
    const liveItem = path.match(/^\/api\/live\/([0-9a-f-]{36})$/);
    if (liveItem && method === 'PUT') {
      const user = await currentUser(request); const found = rows(await db.from('live_rooms').select('*').eq('id', liveItem[1]).limit(1));
      if (!found.length || (found[0].teacher_id !== user.id && user.role !== 'admin')) fail('not_found', 404);
      const room = found[0]; const body = await readJson(request); const patch = { updated_at: now() };
      if (body?.title !== undefined) { patch.title = str(body.title, 180); if (!patch.title) fail('invalid_live'); }
      if (body?.description !== undefined) patch.description = str(body.description, 3000);
      if (body?.scheduledAt !== undefined) { if (!Number.isFinite(Date.parse(body.scheduledAt))) fail('invalid_live'); patch.scheduled_at = new Date(body.scheduledAt).toISOString(); }
      if (body?.durationMinutes !== undefined) { if (!Number.isInteger(body.durationMinutes)) fail('invalid_live'); patch.duration_minutes = Math.max(5, Math.min(480, body.durationMinutes)); }
      if (body?.streamUrl !== undefined) patch.stream_url = liveUrl(body.streamUrl);
      if (body?.status !== undefined) { if (!['scheduled', 'live', 'ended', 'cancelled'].includes(body.status)) fail('invalid_status'); patch.status = body.status; }
      if (patch.status && !['scheduled', 'live'].includes(room.status) && room.status !== patch.status) fail('live_unavailable', 409);
      rows(await db.from('live_rooms').update(patch).eq('id', room.id).select('id'));
      const regs = rows(await db.from('live_registrations').select('student_id').eq('live_id', room.id).eq('active', true).limit(200));
      if (patch.status || patch.scheduled_at) await notify(regs.map((r) => r.student_id), 'live', patch.status === 'live' ? `${room.title} đang phát trực tiếp` : `Lịch phát “${room.title}” đã cập nhật`, patch.status === 'cancelled' ? 'Giáo viên đã hủy buổi phát.' : 'Mở Phòng live để xem thông tin mới nhất.', '/live');
      return json({ ok: true });
    }
    const liveRegister = path.match(/^\/api\/live\/([0-9a-f-]{36})\/register$/);
    if (liveRegister && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['student']);
      const found = rows(await db.from('live_rooms').select('*').eq('id', liveRegister[1]).limit(1));
      if (!found.length || ['cancelled', 'ended'].includes(found[0].status)) fail('live_unavailable', 409);
      const room = found[0];
      const key = `${room.id}:${user.id}`;
      rows(await db.from('live_registrations').insertIfAbsent({ registration_key: key, live_id: room.id, student_id: user.id, active: true, created_at: now() }, { onConflict: 'registration_key' }).select('registration_key'));
      const thread = rows(await db.from('threads').select('*').eq('lookup_key', `live:${room.id}`).limit(1))[0];
      if (thread) await addMember(thread.id, user.id);
      await notify([room.teacher_id], 'live', 'Có học sinh đăng ký phòng live', `${user.name} đăng ký “${room.title}”.`, '/live');
      return json({ ok: true, threadId: thread?.id ?? null }, 201);
    }

    const liveSignals = path.match(/^\/api\/live\/([0-9a-f-]{36})\/signals$/);
    if (liveSignals && ['GET', 'POST'].includes(method)) {
      const user = await currentUser(request);
      const room = rows(await db.from('live_rooms').select('*').eq('id', liveSignals[1]).limit(1))[0];
      if (!room || room.status !== 'live') fail('live_unavailable', 409);
      const owner = room.teacher_id === user.id || user.role === 'admin';
      const registered = owner || rows(await db.from('live_registrations').select('registration_key').eq('live_id', room.id).eq('student_id', user.id).eq('active', true).limit(1)).length > 0;
      if (!registered) fail('forbidden', 403);
      if (method === 'GET') {
        const signals = rows(await db.from('live_signals').select('*').eq('live_id', room.id).eq('recipient_id', user.id).eq('consumed_at', null).order('created_at', { ascending: true }).limit(100));
        const consumedAt = now();
        for (const signal of signals) rows(await db.from('live_signals').update({ consumed_at: consumedAt }).eq('id', signal.id).eq('consumed_at', null).select('id'));
        return json(signals.map((signal) => ({ id: signal.id, senderId: signal.sender_id, kind: signal.kind, payload: signal.payload, createdAt: signal.created_at })));
      }
      const body = await readJson(request);
      const kind = str(body?.kind, 20);
      if (!['ready', 'offer', 'answer', 'ice', 'leave'].includes(kind) || !body?.payload || typeof body.payload !== 'object' || Array.isArray(body.payload)) fail('invalid_signal');
      const recipientId = owner ? str(body?.recipientId, 36) : room.teacher_id;
      if (!isUuid(recipientId) || recipientId === user.id) fail('invalid_signal');
      if (owner) {
        const allowed = rows(await db.from('live_registrations').select('registration_key').eq('live_id', room.id).eq('student_id', recipientId).eq('active', true).limit(1));
        if (!allowed.length) fail('forbidden', 403);
      } else if (kind !== 'ready' && kind !== 'answer' && kind !== 'ice' && kind !== 'leave') fail('forbidden', 403);
      const id = crypto.randomUUID();
      rows(await db.from('live_signals').insert({ id, live_id: room.id, sender_id: user.id, recipient_id: recipientId, kind, payload: body.payload, consumed_at: null, created_at: now() }).select('id'));
      return json({ id }, 201);
    }

    // Teacher bank, wallets and manual admin reconciliation
    if (path === '/api/wallet/bank' && method === 'PUT') {
      const user = await currentUser(request); requireRole(user, ['teacher']);
      const body = await readJson(request); const bankName = str(body?.bankName, 120); const accountNumber = str(body?.accountNumber, 30).replace(/[\s-]/g, ''); const accountName = str(body?.accountName, 120).replace(/\s+/g, ' ');
      if (!bankName || !/^[0-9]{6,25}$/.test(accountNumber) || accountName.length < 2) fail('invalid_bank_account');
      const value = { bank_name: bankName, account_number: accountNumber, account_name: accountName, updated_at: now() };
      const existing = rows(await db.from('teacher_bank_accounts').select('user_id').eq('user_id', user.id).limit(1));
      if (existing.length) rows(await db.from('teacher_bank_accounts').update(value).eq('user_id', user.id).select('user_id'));
      else rows(await db.from('teacher_bank_accounts').insert({ user_id: user.id, ...value, created_at: now() }).select('user_id'));
      return json({ ok: true });
    }
    if (path === '/api/wallet' && method === 'GET') {
      const user = await currentUser(request);
      let orders = rows(await db.from('course_orders').select('*').order('created_at', { ascending: false }).limit(1000));
      if (user.role === 'student') orders = orders.filter((o) => o.student_id === user.id);
      else if (user.role === 'teacher') orders = orders.filter((o) => o.teacher_id === user.id);
      const [courses, users] = await Promise.all([db.from('courses').select('*').limit(1000).then(rows), db.from('users').select('*').limit(2000).then(rows)]);
      const courseById = new Map(courses.map((c) => [c.id, c])); const userById = new Map(users.map((u) => [u.id, u]));
      const bank = user.role === 'student' ? null : await platformBank();
      let teacherBank = null;
      if (user.role === 'teacher') {
        const b = rows(await db.from('teacher_bank_accounts').select('*').eq('user_id', user.id).limit(1))[0];
        if (b) teacherBank = { bankName: b.bank_name, accountNumber: b.account_number, accountName: b.account_name };
      }
      const paid = orders.filter((o) => o.status === 'paid');
      const totals = { gross: paid.reduce((s, o) => s + o.gross_amount, 0), platformFee: paid.reduce((s, o) => s + o.platform_fee, 0), teacherAmount: paid.reduce((s, o) => s + o.teacher_amount, 0), pendingPayout: paid.filter((o) => o.payout_status === 'ready').reduce((s, o) => s + o.teacher_amount, 0) };
      const items = orders.map((o) => orderDict(o, courseById.get(o.course_id), userById.get(o.student_id), userById.get(o.teacher_id), user.role === 'student' && o.status === 'pending' ? bank : undefined));
      return json({ items, totals, paymentAutomation: paymentStatus(), teacherBank, platformBank: user.role === 'admin' ? bank : null, teacherBanks: user.role === 'admin' ? rows(await db.from('teacher_bank_accounts').select('*').limit(500)).map((b) => ({ teacherId: b.user_id, teacherName: userById.get(b.user_id)?.name ?? 'Giáo viên', bankName: b.bank_name, accountNumber: b.account_number, accountName: b.account_name })) : [] });
    }
    if (path === '/api/admin/platform-bank' && method === 'PUT') {
      const user = await currentUser(request); requireRole(user, ['admin']);
      const body = await readJson(request); const bankName = str(body?.bankName, 120); const accountNumber = str(body?.accountNumber, 30).replace(/[\s-]/g, ''); const accountName = str(body?.accountName, 120).replace(/\s+/g, ' ');
      if (!bankName || !/^[0-9]{6,25}$/.test(accountNumber) || accountName.length < 2) fail('invalid_bank_account');
      const value = { bankName, accountNumber, accountName };
      const existing = rows(await db.from('platform_settings').select('key').eq('key', 'platform_bank').limit(1));
      if (existing.length) rows(await db.from('platform_settings').update({ value, updated_at: now() }).eq('key', 'platform_bank').select('key'));
      else rows(await db.from('platform_settings').insert({ key: 'platform_bank', value, updated_at: now() }).select('key'));
      return json({ ok: true });
    }
    const adminOrder = path.match(/^\/api\/admin\/orders\/([0-9a-f-]{36})$/);
    if (adminOrder && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['admin']);
      const found = rows(await db.from('course_orders').select('*').eq('id', adminOrder[1]).limit(1));
      if (!found.length) fail('not_found', 404);
      const order = found[0]; const body = await readJson(request); const action = str(body?.action, 40); const at = now();
      if (action === 'confirm_paid') {
        const paidOrder = await confirmOrderPayment(order, at);
        await maybeAutoPayout(paidOrder.id);
      } else if (action === 'cancel') {
        if (order.status !== 'pending') fail('invalid_order_state', 409);
        rows(await db.from('course_orders').update({ status: 'cancelled' }).eq('id', order.id).eq('status', 'pending').select('id'));
        await notify([order.student_id, order.teacher_id], 'order', 'Đơn khóa học đã hủy', `Đơn ${order.reference} đã được hủy.`, '/wallet');
      } else if (action === 'retry_payout') {
        if (order.status !== 'paid' || order.payout_status !== 'failed' || !paymentStatus().autoPayout) fail('invalid_order_state', 409);
        const ready = rows(await db.from('course_orders').update({ payout_status: 'ready' }).eq('id', order.id).eq('payout_status', 'failed').select('id'));
        if (!ready.length) fail('invalid_order_state', 409);
        await maybeAutoPayout(order.id);
      } else if (action === 'mark_payout_paid') {
        if (order.status !== 'paid' || !['ready', 'failed'].includes(order.payout_status)) fail('invalid_order_state', 409);
        const bank = rows(await db.from('teacher_bank_accounts').select('user_id').eq('user_id', order.teacher_id).limit(1));
        if (!bank.length) fail('teacher_bank_required', 409);
        const payoutReference = str(body?.reference, 120); if (!payoutReference) fail('payout_reference_required');
        const marked = rows(await db.from('course_orders').update({ payout_status: 'paid', payout_at: at, payout_reference: payoutReference }).eq('id', order.id).eq('payout_status', order.payout_status).select('id'));
        if (!marked.length) fail('invalid_order_state', 409);
        await notify([order.teacher_id], 'payout', 'Khoản thanh toán giáo viên đã được ghi nhận', `Đơn ${order.reference}: ${order.teacher_amount} VND. Mã đối soát ${payoutReference}.`, '/wallet');
      } else fail('invalid_action');
      return json({ ok: true });
    }

    return null;
  };
}
