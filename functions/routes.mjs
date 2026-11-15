// ExamWorld application routes. Identity comes only from our own Bearer session.
// Client-supplied owner IDs are never trusted; ownership is derived server-side.
import { AppError, applicationPath, errorJson, json, readJson, rows, isUuid, str } from './lib/http.mjs';
import { hashPassword, verifyPassword, verifyPasswordAgainstDummy } from './lib/passwords.mjs';
import { createSession, validateSession, revokeSession, sha256Hex } from './lib/sessions.mjs';
import { consume } from './lib/limiter.mjs';
import { gradeValue, isEmpty } from './lib/grading.mjs';
import { ensureSeed } from './lib/seed.mjs';
import { createCommunityRouter } from './lib/community.mjs';

const fail = (code, status) => { throw new AppError(code, status); };
const retryAfter = (r) => ({ 'retry-after': String(Math.max(1, Math.ceil(r.retryAfterMs / 1000))) });
const day = (iso) => Math.floor(Date.parse(iso) / 86400000);
const boundedPassword = (raw) => {
  if (typeof raw !== 'string' || raw.length < 8 || new TextEncoder().encode(raw).length > 256) fail('invalid_password', 400);
  return raw;
};
const canonicalEmail = (raw) => {
  const e = str(raw, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail('invalid_email', 400);
  return e;
};
const isEnglishSubject = (subject) => /^(tieng anh|english)$/.test(str(subject, 120).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
const examSettings = (body, current = {}) => ({
  mode: body?.mode === 'test' ? 'test' : body?.mode === 'practice' ? 'practice' : (current.mode ?? 'practice'),
  max_attempts: Number.isInteger(body?.maxAttempts) ? Math.max(0, Math.min(100, body.maxAttempts)) : (current.max_attempts ?? 0),
  anti_cheat: body?.antiCheat === undefined ? current.anti_cheat === true : Boolean(body.antiCheat),
  max_violations: Number.isInteger(body?.maxViolations) ? Math.max(1, Math.min(20, body.maxViolations)) : (current.max_violations ?? 3),
});

class SessionRequired extends Error {
  constructor(state) { super('login_required'); this.state = state; }
}

export function application({ db, storage, demoAccounts = false }) {
  // ---------- serializers ----------
  const userDict = (u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, xp: u.xp ?? 0,
    level: Math.floor((u.xp ?? 0) / 500) + 1, streak: u.streak ?? 0,
    teacherId: u.teacher_id ?? null, active: u.active !== false, createdAt: u.created_at,
  });
  const examDict = (e, questionCount, commentCount) => ({
    id: e.id, title: e.title, description: e.description, subject: e.subject, grade: e.grade,
    durationMinutes: e.duration_minutes, status: e.status, difficulty: e.difficulty,
    questionCount: questionCount ?? 0, totalPoints: e.total_points ?? 0,
    audioUrl: e.audio_object_path ? `/exams/${e.id}/audio` : null,
    visibility: e.visibility, ownerId: e.owner_id, createdAt: e.created_at, updatedAt: e.updated_at,
    mode: e.mode ?? 'practice', maxAttempts: e.max_attempts ?? 0, antiCheat: e.anti_cheat === true,
    maxViolations: e.max_violations ?? 3, commentCount: commentCount ?? 0,
  });
  const questionDict = (q, includeAnswers) => {
    const base = {
      id: q.id, content: q.content, type: q.type, options: q.options ?? null, points: q.points ?? 1,
      topic: q.topic ?? '', partTitle: q.part_title ?? '', partInstruction: q.part_instruction ?? '',
      order: q.order_index, audioUrl: q.audio_object_path ? `/questions/${q.id}/audio` : null,
      imageUrl: q.image_object_path ? `/questions/${q.id}/image` : (q.image_url ?? null),
    };
    if (includeAnswers) { base.correctAnswer = q.correct_answer; base.explanation = q.explanation ?? ''; }
    return base;
  };

  // ---------- identity ----------
  async function requireSession(request) {
    const result = await validateSession(db, request);
    if (result.state !== 'valid') throw new SessionRequired(result.state);
    return result.session;
  }
  async function loadUser(userId) {
    const found = rows(await db.from('users').select('*').eq('id', userId).limit(1));
    if (found.length !== 1 || found[0].active === false) throw new SessionRequired('invalid');
    return found[0];
  }
  async function currentUser(request) {
    const session = await requireSession(request);
    return loadUser(session.userId);
  }
  const requireRole = (user, roles) => { if (!roles.includes(user.role)) fail('forbidden', 403); };

  // ---------- exam access ----------
  async function questionCounts() {
    const qs = rows(await db.from('questions').select('exam_id').eq('active', true).limit(5000));
    const map = new Map();
    for (const q of qs) map.set(q.exam_id, (map.get(q.exam_id) ?? 0) + 1);
    return map;
  }
  async function commentCounts() {
    const cs = rows(await db.from('comments').select('exam_id').eq('active', true).limit(10000));
    const map = new Map();
    for (const c of cs) map.set(c.exam_id, (map.get(c.exam_id) ?? 0) + 1);
    return map;
  }
  async function accessiblePublished(user) {
    const all = rows(await db.from('exams').select('*').eq('status', 'published').order('created_at', { ascending: false }).limit(500));
    if (user.role === 'admin') return all;
    const memberships = rows(await db.from('class_members').select('class_id').eq('student_id', user.id).eq('active', true)).map((m) => m.class_id);
    const ec = rows(await db.from('exam_classes').select('exam_id,class_id').eq('active', true).limit(5000));
    return all.filter((e) => {
      if (e.owner_id === user.id || e.visibility === 'public') return true;
      const classIds = ec.filter((x) => x.exam_id === e.id).map((x) => x.class_id);
      return classIds.some((c) => memberships.includes(c));
    });
  }
  async function canAccess(user, exam) {
    if (user.role === 'admin' || exam.owner_id === user.id) return true;
    if (exam.status !== 'published') return false;
    if (exam.visibility === 'public') return true;
    const classIds = rows(await db.from('exam_classes').select('class_id').eq('exam_id', exam.id).eq('active', true)).map((x) => x.class_id);
    if (!classIds.length) return false;
    const mem = rows(await db.from('class_members').select('class_id').eq('student_id', user.id).eq('active', true));
    return mem.some((m) => classIds.includes(m.class_id));
  }
  async function getExam(id) {
    if (!isUuid(id)) fail('not_found', 404);
    const found = rows(await db.from('exams').select('*').eq('id', id).limit(1));
    if (!found.length) fail('not_found', 404);
    return found[0];
  }
  async function examQuestions(examId) {
    return rows(await db.from('questions').select('*').eq('exam_id', examId).eq('active', true).order('order_index', { ascending: true }).limit(1000));
  }
  async function examClassIds(examId) {
    return rows(await db.from('exam_classes').select('class_id').eq('exam_id', examId).eq('active', true).limit(1000)).map((x) => x.class_id);
  }
  const canManage = (user, exam) => user.role === 'admin' || exam.owner_id === user.id;
  const commentDict = (c, author, viewer) => ({
    id: c.id, examId: c.exam_id, content: c.content, createdAt: c.created_at,
    author: { id: author.id, name: author.name, role: author.role },
    canDelete: Boolean(viewer) && (c.user_id === viewer.id || viewer.role === 'admin'),
  });

  // ---------- attempts ----------
  async function attemptRow(id) {
    if (!isUuid(id)) fail('not_found', 404);
    const found = rows(await db.from('attempts').select('*').eq('id', id).limit(1));
    if (!found.length) fail('not_found', 404);
    return found[0];
  }
  async function attemptAnswers(attemptId) {
    const list = rows(await db.from('answers').select('*').eq('attempt_id', attemptId).limit(2000));
    const map = {};
    for (const a of list) map[a.question_id] = { value: a.value, flagged: a.flagged };
    return map;
  }
  async function attemptDict(a, user, { withQuestions = true } = {}) {
    const exam = await getExam(a.exam_id);
    const answers = await attemptAnswers(a.id);
    const includeAnswers = user.role === 'admin' || exam.owner_id === user.id || a.status === 'submitted';
    const out = {
      id: a.id, examId: a.exam_id, status: a.status, startedAt: a.started_at, expiresAt: a.expires_at,
      submittedAt: a.submitted_at, score: a.score, maxScore: a.max_score, percentage: a.percentage,
      timeSpent: a.time_spent, correctCount: a.correct_count, incorrectCount: a.incorrect_count,
      unanswered: a.unanswered, violations: a.violations ?? 0, answers,
    };
    if (withQuestions) {
      const qs = await examQuestions(exam.id);
      out.exam = { ...examDict(exam, qs.length), questions: qs.map((q) => questionDict(q, includeAnswers)) };
    } else {
      const counts = await questionCounts();
      out.exam = examDict(exam, counts.get(exam.id) ?? 0);
    }
    return out;
  }
  async function submitAttempt(a, user) {
    if (a.status === 'submitted') return a;
    const qs = await examQuestions(a.exam_id);
    const answerRows = rows(await db.from('answers').select('*').eq('attempt_id', a.id).limit(2000));
    const byQ = new Map(answerRows.map((x) => [x.question_id, x]));
    let score = 0, max = 0, correct = 0, incorrect = 0, unanswered = 0;
    for (const q of qs) {
      max += q.points ?? 1;
      const ar = byQ.get(q.id);
      const value = ar?.value;
      let isCorrect = null, awarded = 0;
      if (isEmpty(value)) { unanswered += 1; isCorrect = false; }
      else {
        const g = gradeValue(q.type, q.correct_answer, value);
        if (g === null) { isCorrect = null; }
        else if (g) { isCorrect = true; correct += 1; awarded = q.points ?? 1; score += awarded; }
        else { isCorrect = false; incorrect += 1; }
      }
      if (ar) {
        rows(await db.from('answers').update({ is_correct: isCorrect, points_awarded: awarded }).eq('attempt_id', a.id).eq('question_id', q.id).select('question_id'));
      }
    }
    const now = Date.now();
    const percentage = max > 0 ? Math.round((score / max) * 100) : 0;
    const timeSpent = Math.max(0, Math.min(Math.floor((now - Date.parse(a.started_at)) / 1000), (a.expires_at ? Math.floor((Date.parse(a.expires_at) - Date.parse(a.started_at)) / 1000) : 3600)));
    const updated = rows(await db.from('attempts').update({
      status: 'submitted', submitted_at: new Date(now).toISOString(), score, max_score: max,
      percentage, time_spent: timeSpent, correct_count: correct, incorrect_count: incorrect, unanswered,
    }).eq('id', a.id).select('*'));
    // XP + streak + achievements (best-effort; a failure here does not undo the grade).
    try {
      const prior = rows(await db.from('attempts').select('submitted_at').eq('user_id', user.id).eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(1));
      const lastDay = prior.length && prior[0].submitted_at ? day(prior[0].submitted_at) : null;
      const today = day(new Date(now).toISOString());
      let streak = user.streak ?? 0;
      if (lastDay === today) streak = Math.max(1, streak);
      else if (lastDay === today - 1) streak += 1;
      else streak = 1;
      const xpGain = Math.max(1, Math.round(percentage));
      const newXp = (user.xp ?? 0) + xpGain;
      rows(await db.from('users').update({ xp: newXp, streak }).eq('id', user.id).select('id'));
      const achievements = rows(await db.from('achievements').select('*').limit(100));
      for (const ach of achievements) {
        if (newXp >= ach.xp_threshold) {
          rows(await db.from('user_achievements').insertIfAbsent({ user_achievement_key: `${user.id}:${ach.id}`, user_id: user.id, achievement_id: ach.id, unlocked_at: new Date(now).toISOString() }, { onConflict: 'user_achievement_key' }).select('user_id'));
        }
      }
    } catch { /* grading already committed */ }
    return updated[0] ?? { ...a, status: 'submitted', score, max_score: max, percentage };
  }
  async function autoSubmitExpired(user) {
    const inProgress = rows(await db.from('attempts').select('*').eq('user_id', user.id).eq('status', 'inProgress').limit(100));
    const now = Date.now();
    for (const a of inProgress) {
      if (Date.parse(a.expires_at) <= now) await submitAttempt(a, user);
    }
  }

  async function attemptSummary(a, userName) {
    const exam = await getExam(a.exam_id);
    return {
      id: a.id, examId: a.exam_id, examTitle: exam.title, subject: exam.subject,
      score: a.score, maxScore: a.max_score, percentage: a.percentage,
      submittedAt: a.submitted_at ?? a.started_at, status: a.status, userName: userName ?? null,
    };
  }
  async function resultDict(a, user) {
    const exam = await getExam(a.exam_id);
    const qs = await examQuestions(exam.id);
    const answerRows = rows(await db.from('answers').select('*').eq('attempt_id', a.id).limit(2000));
    const byQ = new Map(answerRows.map((x) => [x.question_id, x]));
    const answers = qs.map((q) => {
      const ar = byQ.get(q.id);
      return {
        questionId: q.id, value: ar?.value ?? null, correctAnswer: q.correct_answer,
        explanation: q.explanation ?? '', isCorrect: ar?.is_correct ?? (isEmpty(ar?.value) ? false : null),
        pointsAwarded: ar?.points_awarded ?? 0, question: questionDict(q, true),
      };
    });
    const attempt = {
      id: a.id, examId: a.exam_id, status: a.status, startedAt: a.started_at, expiresAt: a.expires_at,
      submittedAt: a.submitted_at, score: a.score, maxScore: a.max_score, percentage: a.percentage,
      timeSpent: a.time_spent, correctCount: a.correct_count, incorrectCount: a.incorrect_count,
      unanswered: a.unanswered, answers: await attemptAnswers(a.id),
    };
    return { attempt, exam: { ...examDict(exam, qs.length), questions: qs.map((q) => questionDict(q, true)) }, answers };
  }
  async function studentDashboard(user) {
    await autoSubmitExpired(user);
    const attempts = rows(await db.from('attempts').select('*').eq('user_id', user.id).order('started_at', { ascending: false }).limit(500));
    const submitted = attempts.filter((a) => a.status === 'submitted');
    const completedExams = submitted.length;
    const averageScore = completedExams ? Math.round(submitted.reduce((s, a) => s + a.percentage, 0) / completedExams) : 0;
    const highestScore = submitted.reduce((m, a) => Math.max(m, a.percentage), 0);
    const recentAttempts = [];
    for (const a of submitted.slice(0, 6)) recentAttempts.push(await attemptSummary(a, user.name));
    // weekly activity (last 7 days)
    const labels = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    const weeklyActivity = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const dayStart = d.getTime(); const dayEnd = dayStart + 86400000;
      const count = submitted.filter((a) => { const t = Date.parse(a.submitted_at ?? a.started_at); return t >= dayStart && t < dayEnd; }).length;
      weeklyActivity.push({ day: d.toISOString().slice(0, 10), label: i === 0 ? 'Hôm nay' : labels[d.getDay()], count });
    }
    // skill progress by subject
    const bySubject = new Map();
    for (const a of submitted) {
      const exam = await getExam(a.exam_id);
      const key = exam.subject || 'Khác';
      const cur = bySubject.get(key) ?? { sum: 0, n: 0 };
      cur.sum += a.percentage; cur.n += 1; bySubject.set(key, cur);
    }
    const skillProgress = [...bySubject.entries()].map(([subject, v]) => ({ subject, percentage: Math.round(v.sum / v.n) })).sort((a, b) => b.percentage - a.percentage);
    const accessible = await accessiblePublished(user);
    const counts = await questionCounts();
    const doneIds = new Set(attempts.map((a) => a.exam_id));
    const recommendedExams = accessible.filter((e) => !doneIds.has(e.id)).slice(0, 4).map((e) => examDict(e, counts.get(e.id) ?? 0));
    return {
      stats: { completedExams, averageScore, highestScore, totalXp: user.xp ?? 0, level: Math.floor((user.xp ?? 0) / 500) + 1, streak: user.streak ?? 0 },
      recentAttempts, weeklyActivity, recommendedExams, skillProgress,
    };
  }
  async function adminDashboard(user) {
    const students = await teacherStudents(user);
    const exams = user.role === 'admin'
      ? rows(await db.from('exams').select('*').limit(1000))
      : rows(await db.from('exams').select('*').eq('owner_id', user.id).limit(1000));
    const activeExams = exams.filter((e) => e.status !== 'archived');
    const examIds = new Set(exams.map((e) => e.id));
    const examTitle = new Map(exams.map((e) => [e.id, { title: e.title, subject: e.subject }]));
    const allAttempts = rows(await db.from('attempts').select('*').eq('status', 'submitted').order('submitted_at', { ascending: false }).limit(2000)).filter((a) => examIds.has(a.exam_id));
    const userIds = [...new Set(allAttempts.map((a) => a.user_id))];
    const userNames = new Map();
    for (const uid of userIds) { const u = rows(await db.from('users').select('id,name').eq('id', uid).limit(1)); if (u.length) userNames.set(uid, u[0].name); }
    const recentAttempts = allAttempts.slice(0, 8).map((a) => ({
      id: a.id, examId: a.exam_id, examTitle: examTitle.get(a.exam_id)?.title ?? '', subject: examTitle.get(a.exam_id)?.subject ?? '',
      score: a.score, maxScore: a.max_score, percentage: a.percentage, submittedAt: a.submitted_at, status: a.status, userName: userNames.get(a.user_id) ?? 'Học sinh',
    }));
    const subjectDistribution = [];
    const subjCount = new Map();
    for (const e of activeExams) { const k = e.subject || 'Khác'; subjCount.set(k, (subjCount.get(k) ?? 0) + 1); }
    for (const [subject, count] of subjCount.entries()) subjectDistribution.push({ subject, count });
    subjectDistribution.sort((a, b) => b.count - a.count);
    // pending review: submitted attempts containing an essay question (is_correct null)
    let pendingReview = 0;
    const essayExamIds = new Set(rows(await db.from('questions').select('exam_id').eq('type', 'essay').eq('active', true).limit(2000)).map((q) => q.exam_id));
    pendingReview = allAttempts.filter((a) => essayExamIds.has(a.exam_id)).length;
    return {
      stats: { totalStudents: students.length, totalExams: activeExams.length, totalAttempts: allAttempts.length, pendingReview },
      recentAttempts, subjectDistribution,
    };
  }

  // ---------- classes / students ----------
  async function classRow(id) {
    if (!isUuid(id)) fail('not_found', 404);
    const found = rows(await db.from('classes').select('*').eq('id', id).limit(1));
    if (!found.length || found[0].archived) fail('not_found', 404);
    return found[0];
  }
  const canManageClass = (user, c) => user.role === 'admin' || c.teacher_id === user.id;
  async function classMemberCount(classId) {
    return rows(await db.from('class_members').select('student_id').eq('class_id', classId).eq('active', true).limit(2000)).length;
  }
  async function teacherStudents(user) {
    if (user.role === 'admin') return rows(await db.from('users').select('*').eq('role', 'student').eq('active', true).order('created_at', { ascending: false }).limit(1000));
    return rows(await db.from('users').select('*').eq('role', 'student').eq('teacher_id', user.id).eq('active', true).order('created_at', { ascending: false }).limit(1000));
  }

  const communityRoute = createCommunityRouter({ db, currentUser, requireRole, classRow, canManageClass });

  // ---------- audio ----------
  async function verifyAudio(response) {
    const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
    const okTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm', 'application/octet-stream'];
    if (!response.ok || !response.body || (type && !okTypes.includes(type))) { await response.body?.cancel(); fail('invalid_upload', 422); }
    const reader = response.body.getReader(); let size = 0;
    try {
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 25 * 1024 * 1024) fail('invalid_upload', 422); }
      if (size === 0) fail('invalid_upload', 422);
    } catch (e) { if (e instanceof AppError) throw e; fail('storage_unavailable', 503); }
    finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }

  async function verifyImage(response) {
    if (!response.ok || !response.body) { await response.body?.cancel(); fail('invalid_upload', 422); }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 8 * 1024 * 1024) fail('invalid_upload', 422);
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const gif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;
    const webp = bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    if (!jpeg && !png && !gif && !webp) fail('invalid_upload', 422);
  }

  // ---------- exam create/update ----------
  function validateQuestions(questions) {
    if (!Array.isArray(questions) || questions.length === 0) fail('questions_required', 400);
    if (questions.length > 300) fail('too_many_questions', 400);
    return questions.map((q, i) => {
      const type = str(q?.type, 20) || 'single';
      const content = str(q?.content, 20000);
      if (!content) fail('invalid_input', 400);
      let options = null;
      if (Array.isArray(q?.options)) {
        options = q.options.slice(0, 12).map((o, j) => ({ id: str(o?.id, 8) || String.fromCharCode(65 + j), label: str(o?.label, 8) || String.fromCharCode(65 + j), text: str(o?.text, 4000) }));
      }
      const points = Number.isInteger(q?.points) && q.points > 0 && q.points <= 100 ? q.points : 1;
      return {
        content, type, options, correct_answer: q?.correctAnswer ?? q?.correct_answer ?? null,
        explanation: str(q?.explanation, 4000), points, topic: str(q?.topic, 120),
        part_title: str(q?.partTitle ?? q?.part_title, 200), part_instruction: str(q?.partInstruction ?? q?.part_instruction, 4000),
        order_index: i + 1, image_url: str(q?.imageUrl, 1000) || null,
      };
    });
  }
  async function replaceQuestions(examId, questions) {
    const existing = await examQuestions(examId);
    const validated = validateQuestions(questions);
    for (let i = 0; i < validated.length; i += 1) {
      const v = validated[i];
      if (i < existing.length) {
        rows(await db.from('questions').update({ ...v, exam_id: examId, active: true }).eq('id', existing[i].id).select('id'));
      } else {
        rows(await db.from('questions').insert({ id: crypto.randomUUID(), exam_id: examId, ...v, active: true, audio_object_path: null, image_object_path: null }).select('id'));
      }
    }
    for (let i = validated.length; i < existing.length; i += 1) {
      rows(await db.from('questions').update({ active: false }).eq('id', existing[i].id).select('id'));
    }
    return validated.reduce((s, v) => s + v.points, 0);
  }

  // ---------- router ----------
  async function route(request) {
    const path = applicationPath(request);
    const method = request.method;
    if (path === '/api/health' && method === 'GET') return json({ ok: true });

    // ----- auth -----
    if (path === '/api/auth/register' && method === 'POST') {
      const body = await readJson(request);
      const name = str(body?.name, 120);
      if (!name) fail('invalid_name', 400);
      const email = canonicalEmail(body?.email);
      const password = boundedPassword(body?.password);
      const role = body?.role === 'teacher' ? 'teacher' : 'student';
      const limit = await consume(db, 'register', email);
      if (!limit.allowed) return errorJson('rate_limited', 429, retryAfter(limit));
      const existing = rows(await db.from('users').select('id').eq('email', email).limit(1));
      if (existing.length) return errorJson('email_taken', 409);
      const derived = await hashPassword(password);
      const id = crypto.randomUUID();
      const created = rows(await db.from('users').insertIfAbsent({
        id, name, email, password_salt: derived.salt, password_hash: derived.hash, password_iterations: derived.iterations,
        role, teacher_id: null, active: true, xp: 0, streak: 0, created_at: new Date().toISOString(),
      }, { onConflict: 'email' }).select('*'));
      if (created.length !== 1) return errorJson('email_taken', 409);
      const { token } = await createSession(db, id);
      return json({ token, user: userDict(created[0]) }, 201);
    }
    if (path === '/api/auth/login' && method === 'POST') {
      const body = await readJson(request);
      const email = canonicalEmail(body?.email);
      const limit = await consume(db, 'login', email);
      if (!limit.allowed) return errorJson('rate_limited', 429, retryAfter(limit));
      const password = typeof body?.password === 'string' ? body.password : '';
      const found = rows(await db.from('users').select('*').eq('email', email).limit(1));
      if (found.length !== 1) { await verifyPasswordAgainstDummy(password || 'x'); return errorJson('invalid_credentials', 401); }
      const user = found[0];
      const ok = await verifyPassword(password, { salt: user.password_salt, hash: user.password_hash, iterations: user.password_iterations });
      if (!ok || user.active === false) return errorJson('invalid_credentials', 401);
      const { token } = await createSession(db, user.id);
      return json({ token, user: userDict(user) });
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      const result = await validateSession(db, request);
      if (result.state === 'valid' && result.session) {
        try { await revokeSession(db, result.session.digest); } catch { return errorJson('logout_unconfirmed', 503); }
      }
      return json({ ok: true });
    }
    if (path === '/api/auth/me' && method === 'GET') {
      return json(userDict(await currentUser(request)));
    }
    if (path === '/api/auth/forgot-password' && method === 'POST') {
      const body = await readJson(request);
      const email = canonicalEmail(body?.email);
      const limit = await consume(db, 'password_reset', email);
      if (!limit.allowed) return errorJson('rate_limited', 429, retryAfter(limit));
      return json({ ok: true, message: 'Nếu email tồn tại, yêu cầu đã được ghi nhận. Vui lòng liên hệ giáo viên hoặc quản trị viên để xác minh danh tính và đặt lại mật khẩu.' });
    }
    if (path === '/api/auth/reset-password' && method === 'POST') {
      const body = await readJson(request);
      const token = str(body?.token, 64);
      const password = boundedPassword(body?.password);
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) fail('invalid_token', 400);
      const digest = await sha256Hex(token);
      const found = rows(await db.from('password_reset_tokens').select('*').eq('token_digest', digest).limit(1));
      if (!found.length) fail('invalid_token', 400);
      const row = found[0];
      if (row.used_at != null || Date.parse(row.expires_at) <= Date.now()) fail('invalid_token', 400);
      const derived = await hashPassword(password);
      rows(await db.from('users').update({ password_salt: derived.salt, password_hash: derived.hash, password_iterations: derived.iterations }).eq('id', row.user_id).select('id'));
      rows(await db.from('password_reset_tokens').update({ used_at: new Date().toISOString() }).eq('token_digest', digest).select('token_digest'));
      return json({ ok: true, message: 'Đặt lại mật khẩu thành công. Bạn có thể đăng nhập bằng mật khẩu mới.' });
    }

    // ----- exams (read) -----
    if (path === '/api/exams/subjects' && method === 'GET') {
      const user = await currentUser(request);
      const exams = await accessiblePublished(user);
      return json([...new Set(exams.map((e) => e.subject).filter(Boolean))].sort());
    }
    if (path === '/api/exams' && method === 'GET') {
      const user = await currentUser(request);
      const url = new URL(request.url);
      const search = (url.searchParams.get('search') ?? '').toLowerCase().trim();
      const subject = url.searchParams.get('subject') ?? '';
      const counts = await questionCounts();
      const comments = await commentCounts();
      let exams = await accessiblePublished(user);
      if (search) exams = exams.filter((e) => e.title.toLowerCase().includes(search) || e.description.toLowerCase().includes(search));
      if (subject) exams = exams.filter((e) => e.subject === subject);
      return json(exams.map((e) => examDict(e, counts.get(e.id) ?? 0, comments.get(e.id) ?? 0)));
    }
    const examAudio = path.match(/^\/api\/exams\/([0-9a-f-]{36})\/audio$/);
    if (examAudio && method === 'GET') {
      const user = await currentUser(request);
      const exam = await getExam(examAudio[1]);
      if (!(await canAccess(user, exam))) fail('forbidden', 403);
      if (!exam.audio_object_path) fail('not_found', 404);
      const signed = await storage.createSignedUrl(exam.audio_object_path, 300);
      return json({ url: signed.signedUrl });
    }
    const questionAudio = path.match(/^\/api\/questions\/([0-9a-f-]{36})\/audio$/);
    if (questionAudio && method === 'GET') {
      const user = await currentUser(request);
      const found = rows(await db.from('questions').select('*').eq('id', questionAudio[1]).limit(1));
      if (!found.length || !found[0].audio_object_path) fail('not_found', 404);
      const exam = await getExam(found[0].exam_id);
      if (!(await canAccess(user, exam))) fail('forbidden', 403);
      const signed = await storage.createSignedUrl(found[0].audio_object_path, 300);
      return json({ url: signed.signedUrl });
    }
    const questionImage = path.match(/^\/api\/questions\/([0-9a-f-]{36})\/image$/);
    if (questionImage && method === 'GET') {
      const user = await currentUser(request);
      const found = rows(await db.from('questions').select('*').eq('id', questionImage[1]).limit(1));
      if (!found.length || !found[0].image_object_path) fail('not_found', 404);
      const exam = await getExam(found[0].exam_id);
      if (!(await canAccess(user, exam))) fail('forbidden', 403);
      const signed = await storage.createSignedUrl(found[0].image_object_path, 300);
      return json({ url: signed.signedUrl });
    }
    const examGet = path.match(/^\/api\/exams\/([0-9a-f-]{36})$/);
    if (examGet && method === 'GET') {
      const user = await currentUser(request);
      const exam = await getExam(examGet[1]);
      if (!(await canAccess(user, exam))) fail('forbidden', 403);
      const qs = await examQuestions(exam.id);
      const includeAnswers = user.role === 'admin' || exam.owner_id === user.id;
      const cc = rows(await db.from('comments').select('id').eq('exam_id', exam.id).eq('active', true).limit(10000)).length;
      const ownAttempts = rows(await db.from('attempts').select('id,status,expires_at').eq('exam_id', exam.id).eq('user_id', user.id).limit(100));
      const activeAttempt = ownAttempts.find((item) => item.status === 'inProgress' && Date.parse(item.expires_at) > Date.now());
      return json({ ...examDict(exam, qs.length, cc), attemptsUsed: ownAttempts.length, activeAttemptId: activeAttempt?.id ?? null, classIds: await examClassIds(exam.id), questions: qs.map((q) => questionDict(q, includeAnswers)) });
    }

    // ----- comments (public exams only) -----
    const examComments = path.match(/^\/api\/exams\/([0-9a-f-]{36})\/comments$/);
    if (examComments && method === 'GET') {
      const user = await currentUser(request);
      const exam = await getExam(examComments[1]);
      if (exam.status !== 'published' || exam.visibility !== 'public') fail('comments_unavailable', 403);
      const list = rows(await db.from('comments').select('*').eq('exam_id', exam.id).eq('active', true).order('created_at', { ascending: false }).limit(200));
      const authorIds = [...new Set(list.map((c) => c.user_id))];
      const authors = authorIds.length ? rows(await db.from('users').select('id,name,role').limit(1000)).filter((u) => authorIds.includes(u.id)) : [];
      const byId = new Map(authors.map((u) => [u.id, u]));
      return json(list.map((c) => commentDict(c, byId.get(c.user_id) ?? { id: c.user_id, name: 'Người dùng', role: 'student' }, user)));
    }
    if (examComments && method === 'POST') {
      const user = await currentUser(request);
      const exam = await getExam(examComments[1]);
      if (exam.status !== 'published' || exam.visibility !== 'public') fail('comments_unavailable', 403);
      const body = await readJson(request);
      const content = str(body?.content, 1000);
      if (!content) fail('invalid_comment', 400);
      const recent = rows(await db.from('comments').select('created_at').eq('user_id', user.id).eq('active', true).order('created_at', { ascending: false }).limit(1));
      if (recent.length && Date.now() - Date.parse(recent[0].created_at) < 3000) fail('comment_rate_limited', 429);
      const id = crypto.randomUUID();
      rows(await db.from('comments').insert({ id, exam_id: exam.id, user_id: user.id, content, active: true, created_at: new Date().toISOString() }).select('id'));
      const created = rows(await db.from('comments').select('*').eq('id', id).limit(1))[0];
      return json(commentDict(created, user, user), 201);
    }
    const commentDelete = path.match(/^\/api\/comments\/([0-9a-f-]{36})$/);
    if (commentDelete && method === 'DELETE') {
      const user = await currentUser(request);
      const found = rows(await db.from('comments').select('*').eq('id', commentDelete[1]).limit(1));
      if (!found.length || found[0].active === false) fail('not_found', 404);
      const c = found[0];
      if (c.user_id !== user.id && user.role !== 'admin') {
        const exam = await getExam(c.exam_id);
        if (exam.owner_id !== user.id) fail('forbidden', 403);
      }
      rows(await db.from('comments').update({ active: false }).eq('id', c.id).select('id'));
      return json({ ok: true });
    }

    // ----- attempts -----
    if (path === '/api/attempts/start' && method === 'POST') {
      const user = await currentUser(request);
      const body = await readJson(request);
      const exam = await getExam(str(body?.examId, 36));
      if (!(await canAccess(user, exam))) fail('forbidden', 403);
      const now = Date.now();
      const existing = rows(await db.from('attempts').select('*').eq('user_id', user.id).eq('exam_id', exam.id).eq('status', 'inProgress').limit(1));
      if (existing.length && Date.parse(existing[0].expires_at) > now) return json(await attemptDict(existing[0], user));
      if (existing.length) await submitAttempt(existing[0], user);
      const used = rows(await db.from('attempts').select('id').eq('user_id', user.id).eq('exam_id', exam.id).limit(100)).length;
      if ((exam.max_attempts ?? 0) > 0 && used >= exam.max_attempts) fail('attempt_limit_reached', 409);
      const id = crypto.randomUUID();
      const expires = new Date(now + exam.duration_minutes * 60 * 1000).toISOString();
      rows(await db.from('attempts').insert({
        id, user_id: user.id, exam_id: exam.id, status: 'inProgress', started_at: new Date(now).toISOString(),
        expires_at: expires, submitted_at: null, score: 0, max_score: exam.total_points ?? 0, percentage: 0,
        time_spent: 0, correct_count: 0, incorrect_count: 0, unanswered: 0, violations: 0, violation_log: [],
      }).select('id'));
      const created = await attemptRow(id);
      return json(await attemptDict(created, user), 201);
    }
    if (path === '/api/attempts/history' && method === 'GET') {
      const user = await currentUser(request);
      await autoSubmitExpired(user);
      const list = rows(await db.from('attempts').select('*').eq('user_id', user.id).order('started_at', { ascending: false }).limit(200));
      const out = [];
      for (const a of list) out.push(await attemptSummary(a, user.name));
      return json(out);
    }
    if (path === '/api/dashboard/student' && method === 'GET') {
      const user = await currentUser(request);
      return json(await studentDashboard(user));
    }
    if (path === '/api/dashboard/admin' && method === 'GET') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      return json(await adminDashboard(user));
    }
    const attemptSubmit = path.match(/^\/api\/attempts\/([0-9a-f-]{36})\/submit$/);
    if (attemptSubmit && method === 'POST') {
      const user = await currentUser(request);
      const a = await attemptRow(attemptSubmit[1]);
      if (a.user_id !== user.id && user.role !== 'admin') fail('forbidden', 403);
      const submitted = await submitAttempt(a, user);
      return json(await attemptDict(submitted, user));
    }
    const attemptViolation = path.match(/^\/api\/attempts\/([0-9a-f-]{36})\/violations$/);
    if (attemptViolation && method === 'POST') {
      const user = await currentUser(request);
      const a = await attemptRow(attemptViolation[1]);
      if (a.user_id !== user.id) fail('forbidden', 403);
      if (a.status !== 'inProgress') return json({ violations: a.violations ?? 0, autoSubmitted: true });
      const exam = await getExam(a.exam_id);
      if (!exam.anti_cheat) return json({ violations: a.violations ?? 0, maxViolations: exam.max_violations ?? 3, autoSubmitted: false });
      const body = await readJson(request);
      const allowed = ['tab_hidden', 'window_blur', 'copy', 'paste', 'context_menu', 'devtools_suspected', 'screenshot_suspected'];
      const type = allowed.includes(body?.type) ? body.type : 'window_blur';
      const now = Date.now();
      const history = Array.isArray(a.violation_log) ? a.violation_log.slice(-19) : [];
      const last = history.at(-1);
      if (last && now - Date.parse(last.at) < 1500) return json({ violations: a.violations ?? 0, maxViolations: exam.max_violations ?? 3, autoSubmitted: false });
      history.push({ type, at: new Date(now).toISOString() });
      const violations = (a.violations ?? 0) + 1;
      const updated = rows(await db.from('attempts').update({ violations, violation_log: history }).eq('id', a.id).select('*'));
      const current = updated[0] ?? { ...a, violations, violation_log: history };
      if (type === 'screenshot_suspected') {
        rows(await db.from('notifications').insert({
          id: crypto.randomUUID(), user_id: exam.owner_id, type: 'violation',
          title: 'Nghi ngờ chụp màn hình bài thi',
          content: str(`${user.name} vừa có sự kiện chụp màn hình nghi ngờ trong đề “${exam.title}”. Hệ thống đã hiển thị nội dung mồi tạm thờ i.`, 500),
          link: '/admin', read_at: null, active: true, created_at: new Date(now).toISOString(),
        }).select('id'));
      }
      if (violations >= (exam.max_violations ?? 3)) {
        await submitAttempt(current, user);
        return json({ violations, maxViolations: exam.max_violations ?? 3, autoSubmitted: true });
      }
      return json({ violations, maxViolations: exam.max_violations ?? 3, autoSubmitted: false });
    }
    const attemptAnswersPut = path.match(/^\/api\/attempts\/([0-9a-f-]{36})\/answers$/);
    if (attemptAnswersPut && method === 'PUT') {
      const user = await currentUser(request);
      const a = await attemptRow(attemptAnswersPut[1]);
      if (a.user_id !== user.id) fail('forbidden', 403);
      if (a.status !== 'inProgress') fail('attempt_closed', 409);
      if (Date.parse(a.expires_at) <= Date.now()) { await submitAttempt(a, user); fail('attempt_expired', 409); }
      const body = await readJson(request);
      const answers = body?.answers ?? {};
      if (typeof answers !== 'object' || Array.isArray(answers)) fail('invalid_input', 400);
      const qs = await examQuestions(a.exam_id);
      const validIds = new Set(qs.map((q) => q.id));
      const entries = Object.entries(answers).slice(0, 1000);
      for (const [qid, val] of entries) {
        if (!validIds.has(qid)) continue;
        const value = val?.value ?? null;
        const flagged = Boolean(val?.flagged);
        const updated = rows(await db.from('answers').update({ value, flagged }).eq('attempt_id', a.id).eq('question_id', qid).select('question_id'));
        if (!updated.length) rows(await db.from('answers').insertIfAbsent({ answer_key: `${a.id}:${qid}`, attempt_id: a.id, question_id: qid, value, flagged, is_correct: null, points_awarded: 0 }, { onConflict: 'answer_key' }).select('question_id'));
      }
      return json({ ok: true, saved: entries.length });
    }
    const attemptGet = path.match(/^\/api\/attempts\/([0-9a-f-]{36})$/);
    if (attemptGet && method === 'GET') {
      const user = await currentUser(request);
      const a = await attemptRow(attemptGet[1]);
      if (a.user_id !== user.id && user.role !== 'admin') fail('forbidden', 403);
      if (a.status === 'inProgress' && Date.parse(a.expires_at) <= Date.now()) {
        const submitted = await submitAttempt(a, user);
        return json(await attemptDict(submitted, user));
      }
      return json(await attemptDict(a, user));
    }
    const resultGet = path.match(/^\/api\/results\/([0-9a-f-]{36})$/);
    if (resultGet && method === 'GET') {
      const user = await currentUser(request);
      const a = await attemptRow(resultGet[1]);
      if (a.user_id !== user.id && user.role !== 'admin') fail('forbidden', 403);
      if (a.status !== 'submitted') fail('not_submitted', 409);
      return json(await resultDict(a, user));
    }

    // ----- achievements -----
    if (path === '/api/achievements' && method === 'GET') {
      const user = await currentUser(request);
      const all = rows(await db.from('achievements').select('*').order('xp_threshold', { ascending: true }).limit(100));
      const unlocked = rows(await db.from('user_achievements').select('achievement_id,unlocked_at').eq('user_id', user.id).limit(100));
      const map = new Map(unlocked.map((x) => [x.achievement_id, x.unlocked_at]));
      const xp = user.xp ?? 0;
      const level = Math.floor(xp / 500) + 1;
      const items = all.map((a) => ({
        id: a.id, title: a.title, description: a.description, icon: a.icon,
        unlocked: map.has(a.id), unlockedAt: map.get(a.id) ?? null,
        progress: a.xp_threshold > 0 ? Math.min(100, (xp / a.xp_threshold) * 100) : 100,
      }));
      return json({ xp, level, nextLevelXp: level * 500, streak: user.streak ?? 0, items });
    }

    // ----- admin exams -----
    if (path === '/api/admin/exams' && method === 'GET') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const counts = await questionCounts();
      const all = user.role === 'admin'
        ? rows(await db.from('exams').select('*').order('created_at', { ascending: false }).limit(500))
        : rows(await db.from('exams').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(500));
      return json(all.filter((e) => e.status !== 'archived').map((e) => examDict(e, counts.get(e.id) ?? 0)));
    }
    if (path === '/api/admin/exams' && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const body = await readJson(request, 1024 * 1024);
      const title = str(body?.title, 300); if (!title) fail('invalid_input', 400);
      const questions = validateQuestions(body?.questions);
      const total = questions.reduce((s, q) => s + q.points, 0);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const visibility = body?.visibility === 'restricted' ? 'restricted' : 'public';
      const settings = examSettings(body);
      rows(await db.from('exams').insert({
        id, title, description: str(body?.description, 2000), subject: str(body?.subject, 120), grade: str(body?.grade, 60),
        duration_minutes: Number.isInteger(body?.durationMinutes) && body.durationMinutes > 0 ? Math.min(body.durationMinutes, 600) : 30,
        status: 'draft', difficulty: ['easy', 'medium', 'hard'].includes(body?.difficulty) ? body.difficulty : 'medium',
        owner_id: user.id, visibility, ...settings, audio_object_path: null, total_points: total, created_at: now, updated_at: now,
      }).select('id'));
      for (let i = 0; i < questions.length; i += 1) {
        rows(await db.from('questions').insert({ id: crypto.randomUUID(), exam_id: id, ...questions[i], active: true, audio_object_path: null, image_object_path: null }).select('id'));
      }
      if (Array.isArray(body?.classIds)) await setExamClasses(id, user, body.classIds);
      const exam = await getExam(id);
      const createdQuestions = await examQuestions(id);
      return json({ ...examDict(exam, questions.length), questions: createdQuestions.map((q) => questionDict(q, true)) }, 201);
    }
    const adminExam = path.match(/^\/api\/admin\/exams\/([0-9a-f-]{36})$/);
    if (adminExam && method === 'PUT') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const exam = await getExam(adminExam[1]);
      if (!canManage(user, exam)) fail('forbidden', 403);
      const body = await readJson(request, 1024 * 1024);
      const attemptsExist = rows(await db.from('attempts').select('id').eq('exam_id', exam.id).limit(1)).length > 0;
      const patch = { updated_at: new Date().toISOString() };
      if (body?.title !== undefined) { const t = str(body.title, 300); if (!t) fail('invalid_input', 400); patch.title = t; }
      if (body?.description !== undefined) patch.description = str(body.description, 2000);
      if (body?.subject !== undefined) patch.subject = str(body.subject, 120);
      if (body?.grade !== undefined) patch.grade = str(body.grade, 60);
      if (body?.durationMinutes !== undefined) patch.duration_minutes = Number.isInteger(body.durationMinutes) && body.durationMinutes > 0 ? Math.min(body.durationMinutes, 600) : exam.duration_minutes;
      if (body?.difficulty !== undefined && ['easy', 'medium', 'hard'].includes(body.difficulty)) patch.difficulty = body.difficulty;
      if (body?.visibility !== undefined) patch.visibility = body.visibility === 'restricted' ? 'restricted' : 'public';
      Object.assign(patch, examSettings(body, exam));
      const nextSubject = patch.subject ?? exam.subject;
      if (!isEnglishSubject(nextSubject) && exam.audio_object_path) patch.audio_object_path = null;
      if (Array.isArray(body?.questions)) {
        if (attemptsExist) fail('exam_has_attempts', 409);
        patch.total_points = await replaceQuestions(exam.id, body.questions);
      }
      rows(await db.from('exams').update(patch).eq('id', exam.id).select('id'));
      if (Array.isArray(body?.classIds)) await setExamClasses(exam.id, user, body.classIds);
      const qs = await examQuestions(exam.id);
      return json({ ...examDict(await getExam(exam.id), qs.length), classIds: await examClassIds(exam.id), questions: qs.map((q) => questionDict(q, true)) });
    }
    if (adminExam && method === 'DELETE') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const exam = await getExam(adminExam[1]);
      if (!canManage(user, exam)) fail('forbidden', 403);
      rows(await db.from('exams').update({ status: 'archived', updated_at: new Date().toISOString() }).eq('id', exam.id).select('id'));
      return json({ ok: true });
    }
    const publish = path.match(/^\/api\/admin\/exams\/([0-9a-f-]{36})\/publish$/);
    if (publish && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const exam = await getExam(publish[1]);
      if (!canManage(user, exam)) fail('forbidden', 403);
      const count = (await examQuestions(exam.id)).length;
      if (count < 1) fail('questions_required', 400);
      rows(await db.from('exams').update({ status: 'published', updated_at: new Date().toISOString() }).eq('id', exam.id).select('id'));
      return json({ ok: true, status: 'published' });
    }
    const visibility = path.match(/^\/api\/admin\/exams\/([0-9a-f-]{36})\/visibility$/);
    if (visibility && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const exam = await getExam(visibility[1]);
      if (!canManage(user, exam)) fail('forbidden', 403);
      const body = await readJson(request);
      const vis = body?.visibility === 'restricted' ? 'restricted' : 'public';
      rows(await db.from('exams').update({ visibility: vis, updated_at: new Date().toISOString() }).eq('id', exam.id).select('id'));
      if (Array.isArray(body?.classIds)) await setExamClasses(exam.id, user, body.classIds);
      return json({ ok: true, visibility: vis });
    }
    const audioUpload = path.match(/^\/api\/admin\/exams\/([0-9a-f-]{36})\/audio$/);
    if (audioUpload && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const exam = await getExam(audioUpload[1]);
      if (!canManage(user, exam)) fail('forbidden', 403);
      if (!isEnglishSubject(exam.subject)) fail('audio_english_only', 422);
      const objectPath = `exam-audio/${exam.id}`;
      const signed = await storage.createSignedUploadUrl(objectPath, { upsert: true });
      return json({ uploadUrl: signed.signedUrl, objectPath });
    }
    const audioComplete = path.match(/^\/api\/admin\/exams\/([0-9a-f-]{36})\/audio\/complete$/);
    if (audioComplete && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const exam = await getExam(audioComplete[1]);
      if (!canManage(user, exam)) fail('forbidden', 403);
      if (!isEnglishSubject(exam.subject)) fail('audio_english_only', 422);
      const objectPath = `exam-audio/${exam.id}`;
      let uploaded;
      try { uploaded = await storage.download(objectPath); }
      catch (e) { if (e?.code === 'storage_object_not_found') fail('upload_pending', 409); throw e; }
      await verifyAudio(uploaded);
      rows(await db.from('exams').update({ audio_object_path: objectPath, updated_at: new Date().toISOString() }).eq('id', exam.id).select('id'));
      return json({ ok: true, audioUrl: `/exams/${exam.id}/audio` });
    }

    const questionImageUpload = path.match(/^\/api\/admin\/questions\/([0-9a-f-]{36})\/image$/);
    if (questionImageUpload && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const found = rows(await db.from('questions').select('*').eq('id', questionImageUpload[1]).eq('active', true).limit(1));
      if (!found.length) fail('not_found', 404);
      const exam = await getExam(found[0].exam_id);
      if (!canManage(user, exam)) fail('forbidden', 403);
      const objectPath = `question-images/${found[0].id}`;
      const signed = await storage.createSignedUploadUrl(objectPath, { upsert: true });
      return json({ uploadUrl: signed.signedUrl, objectPath });
    }
    if (questionImageUpload && method === 'DELETE') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const found = rows(await db.from('questions').select('*').eq('id', questionImageUpload[1]).limit(1));
      if (!found.length) fail('not_found', 404);
      const exam = await getExam(found[0].exam_id);
      if (!canManage(user, exam)) fail('forbidden', 403);
      rows(await db.from('questions').update({ image_object_path: null, image_url: null }).eq('id', found[0].id).select('id'));
      return json({ ok: true });
    }
    const questionImageComplete = path.match(/^\/api\/admin\/questions\/([0-9a-f-]{36})\/image\/complete$/);
    if (questionImageComplete && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const found = rows(await db.from('questions').select('*').eq('id', questionImageComplete[1]).eq('active', true).limit(1));
      if (!found.length) fail('not_found', 404);
      const exam = await getExam(found[0].exam_id);
      if (!canManage(user, exam)) fail('forbidden', 403);
      const objectPath = `question-images/${found[0].id}`;
      let uploaded;
      try { uploaded = await storage.download(objectPath); }
      catch (e) { if (e?.code === 'storage_object_not_found') fail('upload_pending', 409); throw e; }
      await verifyImage(uploaded);
      rows(await db.from('questions').update({ image_object_path: objectPath, image_url: null }).eq('id', found[0].id).select('id'));
      return json({ ok: true, imageUrl: `/questions/${found[0].id}/image` });
    }

    // ----- classes -----
    if (path === '/api/classes' && method === 'GET') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const list = user.role === 'admin'
        ? rows(await db.from('classes').select('*').eq('archived', false).order('created_at', { ascending: false }).limit(500))
        : rows(await db.from('classes').select('*').eq('teacher_id', user.id).eq('archived', false).order('created_at', { ascending: false }).limit(500));
      const out = [];
      for (const c of list) out.push({ id: c.id, name: c.name, description: c.description, teacherId: c.teacher_id, studentCount: await classMemberCount(c.id), createdAt: c.created_at });
      return json(out);
    }
    if (path === '/api/classes' && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const body = await readJson(request);
      const name = str(body?.name, 120); if (!name) fail('invalid_name', 400);
      const id = crypto.randomUUID();
      rows(await db.from('classes').insert({ id, name, description: str(body?.description, 1000), teacher_id: user.id, archived: false, created_at: new Date().toISOString() }).select('id'));
      return json({ id, name, description: str(body?.description, 1000), teacherId: user.id, studentCount: 0 }, 201);
    }
    const classItem = path.match(/^\/api\/classes\/([0-9a-f-]{36})$/);
    if (classItem && method === 'PUT') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const c = await classRow(classItem[1]);
      if (!canManageClass(user, c)) fail('forbidden', 403);
      const body = await readJson(request);
      const patch = {};
      if (body?.name !== undefined) { const n = str(body.name, 120); if (!n) fail('invalid_name', 400); patch.name = n; }
      if (body?.description !== undefined) patch.description = str(body.description, 1000);
      rows(await db.from('classes').update(patch).eq('id', c.id).select('id'));
      return json({ ok: true });
    }
    if (classItem && method === 'DELETE') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const c = await classRow(classItem[1]);
      if (!canManageClass(user, c)) fail('forbidden', 403);
      rows(await db.from('classes').update({ archived: true }).eq('id', c.id).select('id'));
      return json({ ok: true });
    }
    const classStudents = path.match(/^\/api\/classes\/([0-9a-f-]{36})\/students$/);
    if (classStudents && method === 'GET') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const c = await classRow(classStudents[1]);
      if (!canManageClass(user, c)) fail('forbidden', 403);
      const members = rows(await db.from('class_members').select('student_id').eq('class_id', c.id).eq('active', true).limit(2000));
      const out = [];
      for (const m of members) {
        const u = rows(await db.from('users').select('*').eq('id', m.student_id).limit(1));
        if (u.length && u[0].active !== false) out.push(userDict(u[0]));
      }
      return json(out);
    }
    if (classStudents && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const c = await classRow(classStudents[1]);
      if (!canManageClass(user, c)) fail('forbidden', 403);
      const body = await readJson(request);
      const studentId = str(body?.studentId, 36);
      const student = rows(await db.from('users').select('*').eq('id', studentId).eq('role', 'student').limit(1));
      if (!student.length) fail('not_found', 404);
      if (user.role !== 'admin' && student[0].teacher_id !== user.id) fail('forbidden', 403);
      const existing = rows(await db.from('class_members').select('class_id,active').eq('class_id', c.id).eq('student_id', studentId).limit(1));
      if (existing.length) rows(await db.from('class_members').update({ active: true }).eq('class_id', c.id).eq('student_id', studentId).select('class_id'));
      else rows(await db.from('class_members').insertIfAbsent({ membership_key: `${c.id}:${studentId}`, class_id: c.id, student_id: studentId, active: true, added_at: new Date().toISOString() }, { onConflict: 'membership_key' }).select('class_id'));
      return json({ ok: true });
    }
    const classStudentRemove = path.match(/^\/api\/classes\/([0-9a-f-]{36})\/students\/([0-9a-f-]{36})$/);
    if (classStudentRemove && method === 'DELETE') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const c = await classRow(classStudentRemove[1]);
      if (!canManageClass(user, c)) fail('forbidden', 403);
      rows(await db.from('class_members').update({ active: false }).eq('class_id', c.id).eq('student_id', classStudentRemove[2]).select('class_id'));
      return json({ ok: true });
    }

    // ----- students -----
    if (path === '/api/students' && method === 'GET') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const students = await teacherStudents(user);
      const members = rows(await db.from('class_members').select('class_id,student_id').eq('active', true).limit(5000));
      const classes = rows(await db.from('classes').select('id,name').eq('archived', false).limit(500));
      const className = new Map(classes.map((c) => [c.id, c.name]));
      return json(students.map((s) => ({
        ...userDict(s),
        classes: members.filter((m) => m.student_id === s.id).map((m) => ({ id: m.class_id, name: className.get(m.class_id) ?? '' })).filter((c) => c.name),
      })));
    }
    if (path === '/api/students' && method === 'POST') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const body = await readJson(request);
      const name = str(body?.name, 120); if (!name) fail('invalid_name', 400);
      const email = canonicalEmail(body?.email);
      const password = boundedPassword(body?.password);
      const existing = rows(await db.from('users').select('id').eq('email', email).limit(1));
      if (existing.length) return errorJson('email_taken', 409);
      const derived = await hashPassword(password);
      const id = crypto.randomUUID();
      const created = rows(await db.from('users').insertIfAbsent({
        id, name, email, password_salt: derived.salt, password_hash: derived.hash, password_iterations: derived.iterations,
        role: 'student', teacher_id: user.role === 'admin' ? (isUuid(body?.teacherId) ? body.teacherId : user.id) : user.id,
        active: true, xp: 0, streak: 0, created_at: new Date().toISOString(),
      }, { onConflict: 'email' }).select('*'));
      if (created.length !== 1) return errorJson('email_taken', 409);
      if (isUuid(body?.classId)) {
        const c = await classRow(body.classId);
        if (canManageClass(user, c)) rows(await db.from('class_members').insertIfAbsent({ membership_key: `${c.id}:${id}`, class_id: c.id, student_id: id, active: true, added_at: new Date().toISOString() }, { onConflict: 'membership_key' }).select('class_id'));
      }
      return json(userDict(created[0]), 201);
    }
    const studentItem = path.match(/^\/api\/students\/([0-9a-f-]{36})$/);
    if (studentItem && method === 'GET') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const found = rows(await db.from('users').select('*').eq('id', studentItem[1]).eq('role', 'student').limit(1));
      if (!found.length) fail('not_found', 404);
      if (user.role !== 'admin' && found[0].teacher_id !== user.id) fail('forbidden', 403);
      const attempts = rows(await db.from('attempts').select('*').eq('user_id', found[0].id).order('started_at', { ascending: false }).limit(100));
      const out = [];
      for (const a of attempts) out.push(await attemptDict(a, user, { withQuestions: false }));
      return json({ ...userDict(found[0]), attempts: out });
    }
    if (studentItem && method === 'PUT') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const found = rows(await db.from('users').select('*').eq('id', studentItem[1]).eq('role', 'student').limit(1));
      if (!found.length) fail('not_found', 404);
      if (user.role !== 'admin' && found[0].teacher_id !== user.id) fail('forbidden', 403);
      const body = await readJson(request);
      const patch = {};
      if (body?.name !== undefined) { const n = str(body.name, 120); if (!n) fail('invalid_name', 400); patch.name = n; }
      if (body?.active !== undefined) patch.active = Boolean(body.active);
      if (body?.password !== undefined) {
        const derived = await hashPassword(boundedPassword(body.password));
        patch.password_salt = derived.salt; patch.password_hash = derived.hash; patch.password_iterations = derived.iterations;
      }
      rows(await db.from('users').update(patch).eq('id', found[0].id).select('id'));
      return json({ ok: true });
    }

    // ----- platform moderation -----
    if (path === '/api/admin/moderation' && method === 'GET') {
      const user = await currentUser(request); requireRole(user, ['admin']);
      const [users, exams, comments, attempts] = await Promise.all([
        db.from('users').select('*').order('created_at', { ascending: false }).limit(1000).then(rows),
        db.from('exams').select('*').order('created_at', { ascending: false }).limit(1000).then(rows),
        db.from('comments').select('*').order('created_at', { ascending: false }).limit(500).then(rows),
        db.from('attempts').select('*').order('started_at', { ascending: false }).limit(2000).then(rows),
      ]);
      const userById = new Map(users.map((item) => [item.id, item]));
      const examById = new Map(exams.map((item) => [item.id, item]));
      const violationAttempts = attempts.filter((item) => (item.violations ?? 0) > 0).slice(0, 100).map((item) => ({
        id: item.id, examId: item.exam_id, examTitle: examById.get(item.exam_id)?.title ?? 'Đề đã lưu trữ',
        userName: userById.get(item.user_id)?.name ?? 'Tài khoản', status: item.status, violations: item.violations ?? 0,
        violationLog: Array.isArray(item.violation_log) ? item.violation_log : [], submittedAt: item.submitted_at,
      }));
      return json({
        stats: {
          totalUsers: users.length, activeUsers: users.filter((item) => item.active !== false).length,
          totalExams: exams.length, publishedExams: exams.filter((item) => item.status === 'published').length,
          archivedExams: exams.filter((item) => item.status === 'archived').length,
          activeComments: comments.filter((item) => item.active !== false).length,
          flaggedAttempts: violationAttempts.length,
          totalViolations: attempts.reduce((sum, item) => sum + (item.violations ?? 0), 0),
        },
        users: users.map(userDict),
        exams: exams.map((item) => ({ ...examDict(item), ownerName: userById.get(item.owner_id)?.name ?? 'Không rõ' })),
        comments: comments.map((item) => ({
          id: item.id, examId: item.exam_id, examTitle: examById.get(item.exam_id)?.title ?? 'Không rõ',
          content: item.content, active: item.active !== false, createdAt: item.created_at,
          author: userById.get(item.user_id)?.name ?? 'Không rõ',
        })),
        violationAttempts,
      });
    }
    const moderationUser = path.match(/^\/api\/admin\/moderation\/users\/([0-9a-f-]{36})$/);
    if (moderationUser && method === 'PUT') {
      const user = await currentUser(request); requireRole(user, ['admin']);
      if (moderationUser[1] === user.id) fail('cannot_moderate_self', 409);
      const found = rows(await db.from('users').select('*').eq('id', moderationUser[1]).limit(1));
      if (!found.length) fail('not_found', 404);
      if (found[0].role === 'admin') fail('forbidden', 403);
      const body = await readJson(request);
      if (typeof body?.active !== 'boolean') fail('invalid_input', 400);
      rows(await db.from('users').update({ active: body.active }).eq('id', found[0].id).select('id'));
      if (!body.active) rows(await db.from('sessions').update({ revoked_at: new Date().toISOString() }).eq('user_id', found[0].id).select('token_digest'));
      return json({ ok: true, active: body.active });
    }
    const moderationExam = path.match(/^\/api\/admin\/moderation\/exams\/([0-9a-f-]{36})$/);
    if (moderationExam && method === 'PUT') {
      const user = await currentUser(request); requireRole(user, ['admin']);
      const exam = await getExam(moderationExam[1]);
      const body = await readJson(request);
      const status = ['draft', 'published', 'archived'].includes(body?.status) ? body.status : '';
      if (!status) fail('invalid_input', 400);
      if (status === 'published' && !(await examQuestions(exam.id)).length) fail('questions_required', 400);
      rows(await db.from('exams').update({ status, updated_at: new Date().toISOString() }).eq('id', exam.id).select('id'));
      return json({ ok: true, status });
    }

    // ----- admin stats -----
    if (path === '/api/admin/stats' && method === 'GET') {
      const user = await currentUser(request); requireRole(user, ['teacher', 'admin']);
      const exams = user.role === 'admin'
        ? rows(await db.from('exams').select('id,status').limit(1000))
        : rows(await db.from('exams').select('id,status').eq('owner_id', user.id).limit(1000));
      const students = await teacherStudents(user);
      const examIds = new Set(exams.map((e) => e.id));
      const attempts = rows(await db.from('attempts').select('exam_id,status,percentage').eq('status', 'submitted').limit(5000)).filter((a) => examIds.has(a.exam_id));
      const avg = attempts.length ? Math.round(attempts.reduce((s, a) => s + a.percentage, 0) / attempts.length) : 0;
      return json({
        totalExams: exams.filter((e) => e.status !== 'archived').length,
        publishedExams: exams.filter((e) => e.status === 'published').length,
        draftExams: exams.filter((e) => e.status === 'draft').length,
        totalStudents: students.length,
        totalAttempts: attempts.length,
        averageScore: avg,
      });
    }

    const communityResponse = await communityRoute(request, path, method);
    if (communityResponse) return communityResponse;

    fail('not_found', 404);
  }

  async function setExamClasses(examId, user, classIds) {
    const ids = [...new Set(classIds.filter(isUuid))].slice(0, 100);
    const existing = rows(await db.from('exam_classes').select('exam_id,class_id,active').eq('exam_id', examId).limit(1000));
    const keep = new Set();
    for (const cid of ids) {
      const c = rows(await db.from('classes').select('*').eq('id', cid).limit(1));
      if (!c.length || c[0].archived || !canManageClass(user, c[0])) continue;
      keep.add(cid);
      const ex = existing.find((x) => x.class_id === cid);
      if (ex) rows(await db.from('exam_classes').update({ active: true }).eq('exam_id', examId).eq('class_id', cid).select('exam_id'));
      else rows(await db.from('exam_classes').insertIfAbsent({ exam_class_key: `${examId}:${cid}`, exam_id: examId, class_id: cid, active: true }, { onConflict: 'exam_class_key' }).select('exam_id'));
    }
    for (const ex of existing) {
      if (!keep.has(ex.class_id) && ex.active) rows(await db.from('exam_classes').update({ active: false }).eq('exam_id', examId).eq('class_id', ex.class_id).select('exam_id'));
    }
  }

  return async function handle(ctx) {
    try {
      await ensureSeed(db, { demoAccounts });
      return await route(ctx.request);
    } catch (error) {
      if (error instanceof SessionRequired) return errorJson('login_required', 401);
      if (error instanceof AppError) return errorJson(error.code, error.status);
      return errorJson('service_unavailable', 503);
    }
  };
}