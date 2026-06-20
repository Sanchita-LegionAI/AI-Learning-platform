// src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoadingMessage from './components/LoadingMessage'

import LoginPage   from './pages/LoginPage'
import SelectPage  from './pages/SelectPage'
import PaperPage   from './pages/PaperPage'
import UploadPage  from './pages/UploadPage'
import ResultsPage from './pages/ResultsPage'
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

function RedirectIfAuth({ children }) {
  const { user, role, loading } = useAuth()
  if (loading) return <LoadingMessage message="লোড হচ্ছে..." />
  if (user)    return <Navigate to={role === 'admin' ? '/admin' : '/exam/select'} replace />
  return children
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/exam/select" replace />} />
          <Route path="/login" element={<RedirectIfAuth><LoginPage /></RedirectIfAuth>} />
          <Route path="/exam/select" element={<RequireAuth><SelectPage /></RequireAuth>} />
          <Route path="/exam/paper"  element={<RequireAuth><PaperPage /></RequireAuth>} />
          <Route path="/exam/upload" element={<RequireAuth><UploadPage /></RequireAuth>} />
          <Route path="/exam/results" element={<RequireAuth><ResultsPage /></RequireAuth>} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<RequireAdmin><AdminDashboard /></RequireAdmin>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
