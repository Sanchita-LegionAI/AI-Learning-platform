// pages/admin/AdminLogin.jsx
// Separate admin login — email + password only, no Google OAuth
// If a student account is already logged in, shows a sign-out button first

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function AdminLogin() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [currentUser, setCurrentUser] = useState(null)
  const navigate = useNavigate()

  // Check if someone is already signed in
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) setCurrentUser(data.session.user)
    })
  }, [])

  const signOutFirst = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    setCurrentUser(null)
    setLoading(false)
  }

  const signIn = async () => {
    if (!email || !password) { setError('Email and password required'); return }
    setError('')
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      // Check if this account is admin
      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .single()

      if (userData?.role !== 'admin') {
        await supabase.auth.signOut()
        throw new Error('This account does not have admin access.')
      }

      navigate('/admin', { replace: true })
    } catch (e) {
      setError(e.message || 'Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-card p-8 w-full max-w-sm space-y-5">

        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 bg-saffron rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-xl">⚙️</span>
          </div>
          <h1 className="text-lg font-bold text-ink font-ui">Admin Dashboard</h1>
          <p className="text-sm text-ink-light font-ui">AI Pathshala</p>
        </div>

        {/* Already signed in warning */}
        {currentUser && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-2">
            <p className="text-xs font-ui text-amber-800 font-semibold">Another account is signed in:</p>
            <p className="text-xs font-ui text-amber-700 truncate">
              {currentUser.user_metadata?.full_name || currentUser.email}
            </p>
            <p className="text-xs font-ui text-amber-600">
              Sign out first to log in as admin.
            </p>
            <button
              onClick={signOutFirst}
              disabled={loading}
              className="w-full text-xs font-ui font-semibold bg-amber-500 text-white py-2 rounded-lg
                hover:bg-amber-600 disabled:opacity-50 transition-all"
            >
              {loading ? 'Signing out…' : 'Sign out & switch account'}
            </button>
          </div>
        )}

        {/* Login form — only show if no conflicting session */}
        {!currentUser && (
          <div className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="input-field"
                placeholder="admin@example.com"
                autoFocus
              />
            </div>
            <div>
              <label className="label">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && signIn()}
                className="input-field"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="text-red-500 text-sm font-ui">{error}</p>
            )}
            <button
              onClick={signIn}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </div>
        )}

        {/* Back to student login */}
        <div className="text-center pt-2 border-t border-border">
          <a href="/login"
            className="text-xs font-ui text-ink-light hover:text-saffron transition-colors">
            ← Student login
          </a>
        </div>
      </div>
    </div>
  )
}
