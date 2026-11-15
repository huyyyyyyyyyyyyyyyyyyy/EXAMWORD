export type Role = 'student' | 'teacher' | 'admin'
export type QuestionType = 'single' | 'multiple' | 'truefalse' | 'fill' | 'short' | 'math' | 'essay' | 'matching' | 'order'
export type Visibility = 'public' | 'restricted'
export type ExamMode = 'practice' | 'test'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  xp: number
  level: number
  streak: number
  teacherId?: string | null
  active?: boolean
  avatarColor?: string
  createdAt?: string
  classes?: { id: string; name: string }[]
}

export interface QuestionOption {
  id: string
  label: string
  text: string
}

export interface Question {
  id: string
  content: string
  type: QuestionType
  options: QuestionOption[] | null
  points: number
  topic: string
  partTitle?: string
  partInstruction?: string
  order: number
  audioUrl?: string | null
  imageUrl?: string | null
  correctAnswer?: string | string[] | null
  explanation?: string
}

export interface Exam {
  id: string
  title: string
  description: string
  subject: string
  grade: string
  durationMinutes: number
  status: 'draft' | 'published' | 'archived'
  difficulty: 'easy' | 'medium' | 'hard'
  questionCount: number
  totalPoints: number
  audioUrl?: string | null
  visibility: Visibility
  ownerId: string
  classIds?: string[]
  createdAt: string
  updatedAt: string
  questions?: Question[]
  commentCount?: number
  mode: ExamMode
  maxAttempts: number
  antiCheat: boolean
  maxViolations: number
  attemptsUsed?: number
  activeAttemptId?: string | null
}

export interface Comment {
  id: string
  examId: string
  content: string
  createdAt: string
  author: { id: string; name: string; role: Role }
  canDelete: boolean
}

export interface AttemptAnswer {
  value: string | string[] | null
  flagged?: boolean
  updatedAt?: string
}

export interface Attempt {
  id: string
  examId: string
  status: 'inProgress' | 'submitted' | 'needsReview' | 'expired'
  startedAt: string
  expiresAt: string
  submittedAt?: string | null
  score: number
  maxScore: number
  percentage: number
  timeSpent: number
  correctCount: number
  incorrectCount: number
  unanswered: number
  violations: number
  answers: Record<string, AttemptAnswer>
  exam: Exam
}

export interface AttemptSummary {
  id: string
  examId: string
  examTitle: string
  subject: string
  score: number
  maxScore: number
  percentage: number
  submittedAt: string
  status: string
  userName?: string | null
}

export interface StudentDashboard {
  stats: {
    completedExams: number
    averageScore: number
    highestScore: number
    totalXp: number
    level: number
    streak: number
  }
  recentAttempts: AttemptSummary[]
  weeklyActivity: { day: string; label: string; count: number }[]
  recommendedExams: Exam[]
  skillProgress: { subject: string; percentage: number }[]
}

export interface AdminDashboard {
  stats: { totalStudents: number; totalExams: number; totalAttempts: number; pendingReview: number }
  recentAttempts: AttemptSummary[]
  subjectDistribution: { subject: string; count: number }[]
}

export interface ResultAnswer {
  questionId: string
  value: string | string[] | null
  correctAnswer: string | string[] | null
  explanation: string
  isCorrect: boolean | null
  pointsAwarded: number
  question: Question
}

export interface ExamResult {
  attempt: Attempt
  exam: Exam
  answers: ResultAnswer[]
}

export interface ClassRoom {
  id: string
  name: string
  description: string
  teacherId: string
  studentCount: number
  createdAt?: string
}

export interface AchievementData {
  xp: number
  level: number
  nextLevelXp: number
  streak: number
  items: { id: string; title: string; description: string; icon: string; unlocked: boolean; unlockedAt?: string | null; progress: number }[]
}

export interface Person { id: string; name: string; role: Role }
export interface ChatThread {
  id: string
  kind: 'direct' | 'class' | 'tutor' | 'live'
  title: string
  classId?: string | null
  liveId?: string | null
  updatedAt: string
  createdAt: string
  members: Person[]
  lastMessage?: { content: string; senderId: string; createdAt: string } | null
  unread: number
}
export interface ChatMessage { id: string; content: string; senderId: string; sender: Person; createdAt: string }
export interface CommunityBootstrap { teachers: Person[]; classes: { id: string; name: string; threadId?: string | null }[] }
export interface NotificationItem { id: string; type: string; title: string; content: string; link: string; readAt?: string | null; createdAt: string }
export interface TutorProfile { userId?: string; name?: string; subjects: string[]; bio: string; hourlyPrice: number; available?: boolean }
export interface TutorRequest { id: string; studentId: string; studentName: string; teacherId?: string | null; teacherName?: string | null; subject: string; question: string; status: 'waiting' | 'accepted' | 'closed'; threadId?: string | null; createdAt: string }
export interface TutorData { tutors: TutorProfile[]; requests: TutorRequest[]; profile?: TutorProfile | null }
export interface Course {
  id: string
  title: string
  description: string
  content?: string
  subject: string
  grade: string
  price: number
  status: 'draft' | 'published' | 'archived'
  teacherId: string
  teacherName: string
  createdAt: string
  updatedAt: string
  enrolled: boolean
}
export interface LiveRoom {
  id: string
  title: string
  description: string
  subject: string
  teacherId: string
  teacherName: string
  scheduledAt: string
  durationMinutes: number
  status: 'scheduled' | 'live' | 'ended' | 'cancelled'
  courseId?: string | null
  createdAt: string
  registered: boolean
  registrationCount: number
  threadId?: string | null
  streamUrl?: string
  teacherFollowed?: boolean
}
export interface BankAccount { bankName: string; accountNumber: string; accountName: string }
export interface CourseOrder {
  id: string
  courseId: string
  courseTitle: string
  studentId: string
  studentName: string
  teacherId: string
  teacherName: string
  grossAmount: number
  platformFee: number
  teacherAmount: number
  reference: string
  status: 'pending' | 'paid' | 'cancelled'
  payoutStatus: 'unpaid' | 'ready' | 'processing' | 'paid' | 'failed' | 'not_applicable'
  createdAt: string
  paidAt?: string | null
  payoutAt?: string | null
  payoutReference?: string
  platformBank?: BankAccount | null
}
export interface WalletData {
  items: CourseOrder[]
  totals: { gross: number; platformFee: number; teacherAmount: number; pendingPayout: number }
  paymentAutomation: { webhookConfigured: boolean; autoPayout: boolean }
  teacherBank?: BankAccount | null
  platformBank?: BankAccount | null
  teacherBanks: (BankAccount & { teacherId: string; teacherName: string })[]
}