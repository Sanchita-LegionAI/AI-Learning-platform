// context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

async function fetchUserRole(userId, accessToken) {
  try {
    // Use the access token explicitly so RLS sees the authenticated user
    const { data, error } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()
      .setHeader?.('Authorization', `Bearer ${accessToken}`)

    if (error || !data) {
      // Fallback: determine role from email pattern
      return 'student'
    }
    return data.role
  } catch {
    return 'student'
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [token, setToken]     = useState(null)
  const [role, setRole]       = useState('student')
  const [loading, setLoading] = useState(true)

  async function applySession(session) {
    if (!session) {
      setUser(null)
      setToken(null)
      setRole('student')
      return
    }
    setUser(session.user)
    setToken(session.access_token)

    // Fetch role directly using service-level supabase with explicit auth header
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?id=eq.${session.user.id}&select=role`,
        {
          headers: {
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          }
        }
      )
      const rows = await res.json()
      const fetchedRole = rows?.[0]?.role || 'student'
      setRole(fetchedRole)
    } catch {
      setRole('student')
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await applySession(session)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        await applySession(session)
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
