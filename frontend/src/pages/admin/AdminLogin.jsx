// pages/admin/AdminLogin.jsx
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function AdminLogin() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  const signIn = async () => {
    setError('')
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
    } catch (e) {
      setError(e.message || 'লগইন ব্যর্থ হয়েছে')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-card p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-saffron rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white text-xl">⚙️</span>
          </div>
          <h1 className="text-lg font-bold text-ink font-ui">Admin Dashboard</h1>
          <p className="text-sm text-ink-light font-ui">Bengali AI Learning Platform</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className="input-field" placeholder="admin@example.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && signIn()}
              className="input-field" placeholder="••••••••" />
          </div>
          {error && <p className="text-red-500 text-sm font-ui">{error}</p>}
          <button onClick={signIn} disabled={loading} className="btn-primary">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </div>
    </div>
  )
}
