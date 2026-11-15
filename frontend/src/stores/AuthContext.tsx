import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { api, jsonBody } from '../services/api'
import type { User } from '../types'

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (name: string, email: string, password: string, role?: 'student' | 'teacher') => Promise<User>
  logout: () => void
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    localStorage.removeItem('examworld_token')
    setUser(null)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('examworld_token')
    if (!token) { setLoading(false); return }
    const controller = new AbortController()
    let active = true
    api<User>('/auth/me', { signal: controller.signal })
      .then(user => { if (active) setUser(user) })
      .catch(() => { if (active) logout() })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; controller.abort() }
  }, [logout])

  useEffect(() => {
    const handleExpired = () => logout()
    window.addEventListener('auth-expired', handleExpired)
    return () => window.removeEventListener('auth-expired', handleExpired)
  }, [logout])

  const login = async (email: string, password: string) => {
    const result = await api<{ token: string; user: User }>('/auth/login', { method: 'POST', body: jsonBody({ email, password }) })
    localStorage.setItem('examworld_token', result.token)
    setUser(result.user)
    return result.user
  }

  const register = async (name: string, email: string, password: string, role: 'student' | 'teacher' = 'student') => {
    const result = await api<{ token: string; user: User }>('/auth/register', { method: 'POST', body: jsonBody({ name, email, password, role }) })
    localStorage.setItem('examworld_token', result.token)
    setUser(result.user)
    return result.user
  }

  const refresh = useCallback(async () => {
    if (!localStorage.getItem('examworld_token')) return
    try { setUser(await api<User>('/auth/me')) } catch { /* keep current session view */ }
  }, [])

  const value = useMemo(() => ({ user, loading, login, register, logout, refresh }), [user, loading, logout, refresh])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
