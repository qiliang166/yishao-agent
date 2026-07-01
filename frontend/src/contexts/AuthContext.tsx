import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'

const TOKEN_KEY = 'auth_token'

interface AuthState {
  token: string | null
  login: (password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
  passwordRequired: boolean
  loading: boolean
}

const AuthContext = createContext<AuthState>({
  token: null,
  login: async () => {},
  logout: () => {},
  isAuthenticated: false,
  passwordRequired: false,
  loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY)
  })
  const [passwordRequired, setPasswordRequired] = useState(false)
  const [loading, setLoading] = useState(true)

  // Check if password protection is enabled
  useEffect(() => {
    const token_ = localStorage.getItem(TOKEN_KEY)
    const headers: Record<string, string> = token_
      ? { Authorization: `Bearer ${token_}` }
      : {}
    fetch('/api/settings', { headers })
      .then(res => res.json())
      .then(data => {
        const s = data.settings || {}
        setPasswordRequired(s.admin_password_enabled === '1')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  }, [token])

  const login = useCallback(async (password: string) => {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as any).detail || `登录失败 (${res.status})`)
    }
    const data = await res.json()
    setToken(data.token)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
  }, [])

  const isAuthenticated = !passwordRequired || !!token

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated, passwordRequired, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
