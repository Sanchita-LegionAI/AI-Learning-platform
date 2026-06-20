// context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

async function fetchUserRole(userId, accessToken) {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=role&limit=1`
    console.log('[AuthContext] fetchUserRole URL:', url)
    const res = await fetch(url, {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      }
    })
    const rows = await res.json()
    console.log('[AuthContext] role rows:', rows)
    return rows?.[0]?.role || 'student'
  } catch (e) {
    console.error('[AuthContext] fetchUserRole error:', e)
    return 'student'
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null)
  const [token, setToken]             = useState(null)
  const [role, setRole]               = useState('student')
  const [loading, setLoading]         = useState(true)
  const [roleLoading, setRoleLoading] = useState(true)

  async function applySession(session) {
    console.log('[AuthContext] applySession called, session:', session?.user?.email)
    if (!session) {
      setUser(null)
      setToken(null)
      setRole('student')
      setRoleLoading(false)
      return
    }
    setUser(session.user)
    setToken(session.access_token)
    setRoleLoading(true)
    const r = await fetchUserRole(session.user.id, session.access_token)
    console.log('[AuthContext] setting role to:', r)
    setRole(r)
    setRoleLoading(false)
  }

  useEffect(() => {
    const timeout = setTimeout(() => {
      console.log('[AuthContext] timeout fallback triggered')
      setLoading(false)
      setRoleLoading(false)
    }, 5000)

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      clearTimeout(timeout)
      console.log('[AuthContext] getSession result:', session?.user?.email, error)
      if (error) {
        await supabase.auth.signOut()
        setLoading(false)
        setRoleLoading(false)
        return
      }
      await applySession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AuthContext] onAuthStateChange event:', event, session?.user?.email)
        await applySession(session)
      }
    )
    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, token, role, loading, roleLoading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
