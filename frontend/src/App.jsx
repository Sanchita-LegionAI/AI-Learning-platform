// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoadingMessage from './components/LoadingMessage'

import LoginPage    from './pages/LoginPage'
import SelectPage   from './pages/SelectPage'
import PaperPage    from './pages/PaperPage'
import UploadPage   from './pages/UploadPage'
import ResultsPage  from './pages/ResultsPage'
import OcrReviewPage  from './pages/OcrReviewPage'
import MyExamsPage  from './pages/MyExamsPage'
import AdminLogin     from './pages/admin/AdminLogin'
import AdminDashboard from './pages/admin/AdminDashboard'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingMessage message="লোড হচ্ছে..." />
  if (!user)   return <Navigate to="/login" replace />
  return children
}

function RequireAdmin({ children }) {
  const { user, role, loading } = useAuth()
  if (loading)          return <LoadingMessage message="Loading..." />
  if (!user)            return <Navigate to="/admin/login" replace />
  if (role !== 'admin') return <Navigate to="/exam/select" replace />
  return children
}

// Changed: instead of auto-redirecting, show login with "Continue as" option
// The LoginPage itself handles this via useAuth()
function MaybeRedirectAdmin({ children }) {
  const { user, role, loading } = useAuth()
  if (loading) return <LoadingMessage message="লোড হচ্ছে..." />
  // Admins always bounce to /admin — they don't see the student login
  if (user && role === 'admin') return <Navigate to="/admin" replace />
  // Students see the LoginPage which shows "Continue as [name]" if logged in
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"              element={<Navigate to="/login" replace />} />
          <Route path="/login"         element={<MaybeRedirectAdmin><LoginPage /></MaybeRedirectAdmin>} />
          <Route path="/exam/select"   element={<RequireAuth><SelectPage /></RequireAuth>} />
          <Route path="/exam/paper"    element={<RequireAuth><PaperPage /></RequireAuth>} />
          <Route path="/exam/ocr-review" element={<RequireAuth><OcrReviewPage /></RequireAuth>} />
          <Route path="/exam/upload"   element={<RequireAuth><UploadPage /></RequireAuth>} />
          <Route path="/exam/results"  element={<RequireAuth><ResultsPage /></RequireAuth>} />
          <Route path="/exam/my-exams" element={<RequireAuth><MyExamsPage /></RequireAuth>} />
          <Route path="/admin/login"   element={<AdminLogin />} />
          <Route path="/admin"         element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
          <Route path="*"              element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
