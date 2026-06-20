// context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

async function fetchUserRole(userId, accessToken) {
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?id=eq.${userId}&select=role&limit=1`
    const res = await fetch(url, {
      headers: {
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      }
    })
    if (!res.ok) return 'student'
    const rows = await res.json()
    return rows?.[0]?.role || 'student'
  } catch {
    return 'student'
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null)
  const [token, setToken]   = useState(null)
  const [role, setRole]     = useState('student')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Single source of truth: getSession only
    // onAuthStateChange handles subsequent changes (login/logout)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        setToken(session.access_token)
        const r = await fetchUserRole(session.user.id, session.access_token)
        setRole(r)
      }
      // Only set loading=false AFTER role is resolved
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // Skip INITIAL_SESSION — handled by getSession above
        if (event === 'INITIAL_SESSION') return
        if (session) {
          setUser(session.user)
          setToken(session.access_token)
          const r = await fetchUserRole(session.user.id, session.access_token)
          setRole(r)
        } else {
          setUser(null)
          setToken(null)
          setRole('student')
        }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return (
    <AuthContext.Provider value={{ user, token, role, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
