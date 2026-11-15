// Smoke test against the local backend. Run: node dev/smoke.mjs
import { createServer } from 'node:http';
import { createHmac } from 'node:crypto';

const B = 'http://127.0.0.1:8000/functions/v1/app/api';
const webhookSecret = 'local-test-webhook-secret';
const providerRequests = [];
const failedPayoutReferences = new Set();
const provider = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  providerRequests.push({ body, idempotencyKey: request.headers['idempotency-key'] });
  if (failedPayoutReferences.has(body.reference)) {
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'temporary_failure' }));
    return;
  }
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({ payoutId: `PO-${body.reference}`, status: 'completed' }));
});
await new Promise((resolve) => provider.listen(8787, '127.0.0.1', resolve));
async function webhook(payload, signatureOverride) {
  const raw = JSON.stringify(payload);
  const timestamp = String(Date.now());
  const signature = signatureOverride ?? createHmac('sha256', webhookSecret).update(`${timestamp}.${raw}`).digest('hex');
  const response = await fetch(`${B}/payments/webhook`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-timestamp': timestamp, 'x-webhook-signature': signature }, body: raw });
  return { status: response.status, json: await response.json() };
}
async function call(method, path, { token, body } = {}) {
  const res = await fetch(B + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}
const log = (label, r) => console.log(`\n== ${label} [${r.status}] ==\n`, typeof r.json === 'string' ? r.json : JSON.stringify(r.json).slice(0, 600));
let failures = 0;
const expect = (cond, msg) => { if (!cond) { failures++; console.error('FAIL:', msg); } else console.log('ok:', msg); };

const health = await call('GET', '/health'); expect(health.json.ok, 'health');

const login = await call('POST', '/auth/login', { body: { email: 'student@examworld.dev', password: 'Student123!' } });
log('login student', { status: login.status, json: { role: login.json.user?.role, active: login.json.user?.active, hasToken: Boolean(login.json.token) } }); expect(login.status === 200 && login.json.token, 'student login token');
const st = login.json.token;
const me = await call('GET', '/auth/me', { token: st }); expect(me.json.role === 'student' && me.json.name, 'me returns bare user');

const exams = await call('GET', '/exams', { token: st });
log('exams', exams); expect(Array.isArray(exams.json), 'exams list');
const english = exams.json.find((e) => e.title === 'Kiểm tra giữa kì Tiếng Anh 10');
expect(english && english.visibility === 'restricted' && english.questionCount === 32, 'student sees restricted English exam (32q) via class');

const detail = await call('GET', `/exams/${english.id}`, { token: st });
expect(detail.json.questions.length === 32, 'exam detail 32 questions');
expect(detail.json.questions[0].partInstruction.includes('Mister Lee'), 'part instruction preserved');
expect(detail.json.questions[0].correctAnswer === undefined, 'student does NOT see correct answers');
expect(detail.json.questions.find((q) => q.content.includes('too polluted')).content.includes('______'), 'blank underscores preserved');

// start + answer + submit
const start = await call('POST', '/attempts/start', { token: st, body: { examId: english.id } });
log('start', { status: start.status, json: { id: start.json.id, status: start.json.status } });
expect(start.status === 201 && start.json.status === 'inProgress', 'attempt started');
const aid = start.json.id;
const qs = start.json.exam.questions;
const answers = {};
// answer only the first 4 correctly (B,A,B,A); leave the rest unanswered
answers[qs[0].id] = { value: 'B', flagged: false };
answers[qs[1].id] = { value: 'A', flagged: false };
answers[qs[2].id] = { value: 'B', flagged: false };
answers[qs[3].id] = { value: 'A', flagged: true };
const save = await call('PUT', `/attempts/${aid}/answers`, { token: st, body: { answers } });
expect(save.status === 200 && save.json.ok, 'autosave answers');
const screenshotViolation = await call('POST', `/attempts/${aid}/violations`, { token: st, body: { type: 'screenshot_suspected' } });
expect(screenshotViolation.status === 200 && screenshotViolation.json.violations === 1, 'screenshot suspicion recorded');
const submit = await call('POST', `/attempts/${aid}/submit`, { token: st });
log('submit', { status: submit.status, json: { score: submit.json.score, max: submit.json.maxScore, pct: submit.json.percentage, correct: submit.json.correctCount, incorrect: submit.json.incorrectCount, unanswered: submit.json.unanswered, timeSpent: submit.json.timeSpent } });
expect(submit.json.status === 'submitted', 'submitted');
expect(submit.json.correctCount === 4, 'correctCount=4');
expect(submit.json.unanswered === 28, 'unanswered=28');
expect(submit.json.incorrectCount === 0, 'incorrectCount=0');
expect(submit.json.maxScore === 32, 'maxScore=32');
expect(typeof submit.json.timeSpent === 'number', 'timeSpent present');
const result = await call('GET', `/results/${aid}`, { token: st });
expect(result.json.exam.questions[0].correctAnswer !== undefined, 'result review shows answers');

// teacher flow
const tlogin = await call('POST', '/auth/login', { body: { email: 'teacher@examworld.dev', password: 'Teacher123!' } });
const tt = tlogin.json.token; expect(tlogin.json.user.role === 'teacher', 'teacher login');
const teacherViolationNotes = await call('GET', '/notifications', { token: tt });
expect(teacherViolationNotes.json.items.some((item) => item.type === 'violation' && item.title.includes('chụp màn hình')), 'teacher notified of screenshot suspicion');
const classes = await call('GET', '/classes', { token: tt });
log('classes', classes); expect(classes.json.length === 2, 'teacher has 2 classes');
const students = await call('GET', '/students', { token: tt });
expect(students.json.length === 6, 'teacher has 6 students');
const newClass = await call('POST', '/classes', { token: tt, body: { name: 'Lớp 10A3', description: 'Lớp mới' } });
expect(newClass.status === 201, 'create class');
const newStudent = await call('POST', '/students', { token: tt, body: { name: 'Học sinh mới', email: 'new@student.examworld.dev', password: 'Student123!', classId: newClass.json.id } });
expect(newStudent.status === 201 && newStudent.json.role === 'student', 'teacher creates student');
const classStudents = await call('GET', `/classes/${newClass.json.id}/students`, { token: tt });
expect(classStudents.json.length === 1, 'new student in new class');
// student cannot see teacher management
const forbidden = await call('GET', '/classes', { token: st });
expect(forbidden.status === 403, 'student forbidden from classes');

// restricted visibility: a student NOT in any exam class cannot access
const outsider = await call('POST', '/auth/register', { body: { name: 'Người ngoài', email: 'outsider@test.dev', password: 'Student123!', role: 'student' } });
const ot = outsider.json.token; expect(outsider.status === 201, 'register outsider');
const outsiderExams = await call('GET', '/exams', { token: ot });
expect(!outsiderExams.json.find((e) => e.title === 'Kiểm tra giữa kì Tiếng Anh 10'), 'outsider does NOT see restricted exam');
expect(outsiderExams.json.find((e) => e.visibility === 'public'), 'outsider sees public exams');
const outsiderStart = await call('POST', '/attempts/start', { token: ot, body: { examId: english.id } });
expect(outsiderStart.status === 403, 'outsider cannot start restricted exam');

// community, tutoring, live and automatic bank reconciliation
const adminLogin = await call('POST', '/auth/login', { body: { email: 'admin@examworld.dev', password: 'Admin123!' } });
const at = adminLogin.json.token; expect(adminLogin.status === 200 && at, 'admin login');
const teacher2 = await call('POST', '/auth/register', { body: { name: 'Thầy Trực Tuyến', email: 'teacher2@test.dev', password: 'Teacher123!', role: 'teacher' } });
const tt2 = teacher2.json.token; expect(teacher2.status === 201, 'register second teacher');
const direct = await call('POST', '/community/direct', { token: tt, body: { userId: teacher2.json.user.id } });
expect(direct.status === 201 && direct.json.kind === 'direct', 'teacher creates teacher chat');
const directMessage = await call('POST', `/community/threads/${direct.json.id}/messages`, { token: tt2, body: { content: 'Chào cô, mình cùng trao đổi kế hoạch học nhé.' } });
expect(directMessage.status === 201, 'other teacher sends direct message');
const directForbidden = await call('POST', '/community/direct', { token: st, body: { userId: teacher2.json.user.id } });
expect(directForbidden.status === 403, 'student cannot create teacher direct chat');
const classChat = await call('POST', `/community/classes/${classes.json[0].id}/thread`, { token: st });
expect(classChat.status === 201 && classChat.json.kind === 'class', 'student opens class group');
const classMessage = await call('POST', `/community/threads/${classChat.json.id}/messages`, { token: tt, body: { content: 'Thông báo cho cả lớp.' } });
expect(classMessage.status === 201, 'teacher posts class announcement');
const outsiderChat = await call('GET', `/community/threads/${classChat.json.id}/messages`, { token: ot });
expect(outsiderChat.status === 403, 'outsider cannot read class chat');

const tutorProfile = await call('PUT', '/tutors/profile', { token: tt, body: { subjects: ['Toán học'], bio: 'Hỗ trợ theo từng bước.', hourlyPrice: 0, available: true } });
expect(tutorProfile.status === 200, 'teacher enables tutor profile');
const tutorRequest = await call('POST', '/tutors/requests', { token: st, body: { teacherId: teacher2.json.user.id ? classes.json[0].teacherId : null, subject: 'Toán học', question: 'Em cần hỗ trợ phương trình bậc nhất.' } });
expect(tutorRequest.status === 201 && tutorRequest.json.status === 'waiting', 'student creates tutor request');
const tutorAccept = await call('POST', `/tutors/requests/${tutorRequest.json.id}/accept`, { token: tt });
expect(tutorAccept.status === 200 && tutorAccept.json.threadId, 'teacher accepts tutor request');
const tutorMessages = await call('GET', `/community/threads/${tutorAccept.json.threadId}/messages`, { token: st });
expect(tutorMessages.status === 200 && tutorMessages.json.messages[0].content.includes('phương trình'), 'tutor chat contains original question');
const studentNotifications = await call('GET', '/notifications', { token: st });
expect(studentNotifications.json.unread > 0, 'notifications generated');

for (const [method, path] of [['POST', '/courses'], ['GET', '/wallet'], ['PUT', '/admin/platform-bank'], ['POST', '/payments/webhook']]) {
  const removed = await call(method, path, { token: at, ...(method === 'GET' ? {} : { body: {} }) });
  expect(removed.status === 410 && removed.json.error === 'feature_removed', `${path} is disabled`);
}

const live = await call('POST', '/live', { token: tt, body: { title: 'Live ôn Toán', subject: 'Toán học', description: 'Hỏi đáp trực tiếp.', scheduledAt: new Date(Date.now() + 3600000).toISOString(), durationMinutes: 45 } });
expect(live.status === 201, 'teacher schedules live room');
const liveRegister = await call('POST', `/live/${live.json.id}/register`, { token: st });
expect(liveRegister.status === 201 && liveRegister.json.threadId, 'student registers live and joins chat');
const liveStart = await call('PUT', `/live/${live.json.id}`, { token: tt, body: { status: 'live' } });
expect(liveStart.status === 200, 'teacher starts live room');
const outsiderSignal = await call('POST', `/live/${live.json.id}/signals`, { token: ot, body: { kind: 'ready', payload: {} } });
expect(outsiderSignal.status === 403, 'unregistered student cannot signal live room');
const readySignal = await call('POST', `/live/${live.json.id}/signals`, { token: st, body: { kind: 'ready', payload: {} } });
expect(readySignal.status === 201, 'registered student sends WebRTC ready signal');
const teacherSignals = await call('GET', `/live/${live.json.id}/signals`, { token: tt });
expect(teacherSignals.json.some((signal) => signal.kind === 'ready'), 'teacher receives private WebRTC signal');
const consumedSignals = await call('GET', `/live/${live.json.id}/signals`, { token: tt });
expect(consumedSignals.json.length === 0, 'consumed WebRTC signal is not replayed');
const liveComment = await call('POST', `/community/threads/${liveRegister.json.threadId}/messages`, { token: st, body: { content: 'Thầy giải thích lại câu này giúp em.' } });
expect(liveComment.status === 201, 'registered student comments in live room');
const liveComments = await call('GET', `/community/threads/${liveRegister.json.threadId}/messages`, { token: tt });
expect(liveComments.json.messages.some((message) => message.content.includes('giải thích')), 'teacher reads live comments');

// announcements + follow teacher
const annForbidden = await call('POST', '/community/announcements', { token: st, body: { classId: classes.json[0].id, title: 'x', content: 'y' } });
expect(annForbidden.status === 403, 'student cannot post announcements');
const ann = await call('POST', '/community/announcements', { token: tt, body: { classId: classes.json[0].id, title: 'Kiểm tra tuần sau', content: 'Ôn chương 2.' } });
expect(ann.status === 201 && ann.json.recipients > 0, 'teacher announces to class');
const annMsgs = await call('GET', `/community/threads/${classChat.json.id}/messages`, { token: st });
expect(annMsgs.json.messages.some((m) => m.content.includes('Kiểm tra tuần sau')), 'announcement appears in class chat');
const annNotes = await call('GET', '/notifications', { token: st });
expect(annNotes.json.items.some((n) => n.type === 'announcement'), 'students receive announcement notification');
const follow = await call('POST', `/teachers/${classes.json[0].teacherId}/follow`, { token: ot });
expect(follow.status === 200 && follow.json.following, 'student follows teacher');
const live2 = await call('POST', '/live', { token: tt, body: { title: 'Live mới', subject: 'Toán học', scheduledAt: new Date(Date.now() + 7200000).toISOString(), durationMinutes: 30 } });
expect(live2.status === 201, 'teacher schedules second live');
const followNotes = await call('GET', '/notifications', { token: ot });
expect(followNotes.json.items.some((n) => n.type === 'live' && n.title.includes('vừa lên lịch live')), 'follower notified of new live');
const liveFollowed = await call('GET', '/live', { token: ot });
expect(liveFollowed.json.find((r) => r.id === live2.json.id)?.teacherFollowed === true, 'live list marks followed teacher');
const unfollow = await call('DELETE', `/teachers/${classes.json[0].teacherId}/follow`, { token: ot });
expect(unfollow.status === 200 && unfollow.json.following === false, 'student unfollows teacher');

console.log(`\n${failures === 0 ? 'ALL PASSED' : failures + ' FAILURES'}`);
provider.close();
process.exit(failures === 0 ? 0 : 1);