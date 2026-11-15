import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { PageLoader } from './components/ui'
import { AppShell } from './layouts/AppShell'
import { AchievementsPage } from './pages/AchievementsPage'
import { AdminDashboard } from './pages/AdminDashboard'
import { AdminExamsPage } from './pages/AdminExamsPage'
import { AdminUploadPage } from './pages/AdminUploadPage'
import { ClassesPage } from './pages/ClassesPage'
import { LivePage } from './pages/LivePage'
import { MessagesPage, NotificationsPage, TutorsPage } from './pages/SocialPages'
import { ExamEditorPage } from './pages/ExamEditorPage'
import { ExamDetailPage } from './pages/ExamDetailPage'
import { ExamsPage } from './pages/ExamsPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { HistoryPage } from './pages/HistoryPage'
import { LoginPage } from './pages/LoginPage'
import { ModerationPage } from './pages/ModerationPage'
import { RegisterPage } from './pages/RegisterPage'
import { ResultPage } from './pages/ResultPage'
import { StudentDashboard } from './pages/StudentDashboard'
import { StudentsPage } from './pages/StudentsPage'
import { TakeExamPage } from './pages/TakeExamPage'
import { useAuth } from './stores/AuthContext'
import type { Role } from './types'

const homeFor = (role: Role) => role === 'student' ? '/dashboard' : '/admin'

function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Outlet />
}

function Home() {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  return <Navigate to={user ? homeFor(user.role) : '/login'} replace />
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/exam/:attemptId" element={<TakeExamPage />} />
        <Route element={<AppShell />}>
          <Route element={<RequireAuth roles={['student']} />}>
            <Route path="/dashboard" element={<StudentDashboard />} />
            <Route path="/exams" element={<ExamsPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/achievements" element={<AchievementsPage />} />
          </Route>
          <Route path="/messages" element={<MessagesPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/tutors" element={<TutorsPage />} />
          <Route path="/live" element={<LivePage />} />
          <Route path="/results/:attemptId" element={<ResultPage />} />
          <Route path="/exams/:examId" element={<ExamDetailPage />} />
          <Route element={<RequireAuth roles={['teacher', 'admin']} />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/exams" element={<AdminExamsPage />} />
            <Route path="/admin/exams/new" element={<ExamEditorPage />} />
            <Route path="/admin/exams/:examId/edit" element={<ExamEditorPage />} />
            <Route path="/admin/upload" element={<AdminUploadPage />} />
            <Route path="/admin/classes" element={<ClassesPage />} />
            <Route path="/admin/students" element={<StudentsPage />} />
          </Route>
          <Route element={<RequireAuth roles={['admin']} />}>
            <Route path="/admin/moderation" element={<ModerationPage />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
