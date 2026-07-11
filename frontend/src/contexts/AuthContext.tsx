import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'

const TOKEN_KEY = 'auth_token'

export interface User {
  user_id: string
  username: string
  display_name: string
  user_type: 'admin' | 'member'
  permissions: string[]
  roles: string[]
}

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  authRequired: boolean
  tokenVersionMismatch: boolean
  login: (password: string) => Promise<void>
  authLogin: (username: string, password: string) => Promise<void>
  memberLogin: (username: string, password: string) => Promise<void>
  memberRegister: (data: {
    username: string; password: string; display_name: string; email: string
    plan_type?: string; payment_method?: string; payment_ref?: string
    amount_cents?: number; plan_name?: string; duration_days?: number
  }) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  clearTokenVersionMismatch: () => void
}

const AuthContext = createContext<AuthState>({
  user: null,
  token: null,
  loading: true,
  authRequired: true,
  tokenVersionMismatch: false,
  login: async () => {},
  authLogin: async () => {},
  memberLogin: async () => {},
  memberRegister: async () => {},
  logout: () => {},
  refreshUser: async () => {},
  clearTokenVersionMismatch: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [authRequired, setAuthRequired] = useState(true)
  const [tokenVersionMismatch, setTokenVersionMismatch] = useState(false)

  const saveToken = useCallback((t: string | null) => {
    setToken(t)
    if (t) {
      localStorage.setItem(TOKEN_KEY, t)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  }, [])

  const clearTokenVersionMismatch = useCallback(() => {
    setTokenVersionMismatch(false)
  }, [])

  // Check if auth is required (RBAC or legacy password)
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const s = data.settings || {}
        if (s.db_schema_version) {
          setAuthRequired(true)
        } else if (s.admin_password_enabled === '1') {
          setAuthRequired(true)
        } else {
          setAuthRequired(false)
        }
      })
      .catch(() => {})
  }, [])

  // On token change, validate with /api/auth/me
  useEffect(() => {
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }
    let cancelled = false
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (cancelled) return
      if (res.ok) {
        const data = await res.json()
        setUser({
          user_id: data.user_id,
          username: data.username,
          display_name: data.display_name || data.username,
          user_type: data.user_type,
          permissions: data.permissions || [],
          roles: data.roles || [],
        })
        setTokenVersionMismatch(false)
      } else if (res.status === 401) {
        const body = await res.json().catch(() => ({}))
        if (body.detail?.includes('权限已变更')) {
          setTokenVersionMismatch(true)
        }
        saveToken(null)
        setUser(null)
      } else {
        saveToken(null)
        setUser(null)
      }
    }).catch(() => {
      if (!cancelled) { saveToken(null); setUser(null) }
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [token, saveToken])

  // Listen for token_version mismatch from api interceptor
  useEffect(() => {
    const unsub = onAuthEvent('token_version_mismatch', () => {
      setTokenVersionMismatch(true)
      saveToken(null)
      setUser(null)
    })
    return unsub
  }, [saveToken])

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
    saveToken(data.token)
    if (data.user) {
      setUser(data.user)
    }
  }, [saveToken])

  const authLogin = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as any).detail || '用户名或密码错误')
    }
    const data = await res.json()
    saveToken(data.token)
    if (data.user) {
      setUser(data.user)
    }
  }, [saveToken])

  const memberLogin = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/member/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error((data as any).detail || '用户名或密码错误')
    }
    const data = await res.json()
    saveToken(data.token)
    if (data.user) {
      setUser(data.user)
    }
  }, [saveToken])

  const memberRegister = useCallback(async (data: {
    username: string; password: string; display_name: string; email: string
    plan_type?: string; payment_method?: string; payment_ref?: string
    amount_cents?: number; plan_name?: string; duration_days?: number
  }) => {
    const res = await fetch('/api/member/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error((err as any).detail || '注册失败')
    }
    return await res.json()
  }, [])

  const logout = useCallback(() => {
    saveToken(null)
    setUser(null)
    setTokenVersionMismatch(false)
  }, [saveToken])

  const refreshUser = useCallback(async () => {
    if (!token) return
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setUser({
        user_id: data.user_id,
        username: data.username,
        display_name: data.display_name || data.username,
        user_type: data.user_type,
        permissions: data.permissions || [],
        roles: data.roles || [],
      })
    }
  }, [token])

  return (
    <AuthContext.Provider value={{
      user, token, loading, authRequired, tokenVersionMismatch,
      login, authLogin, memberLogin, memberRegister,
      logout, refreshUser, clearTokenVersionMismatch,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

// ── Auth event system for cross-cutting concerns ──

type AuthEventHandler = () => void
const _authListeners: Record<string, AuthEventHandler[]> = {}

export function onAuthEvent(event: string, handler: AuthEventHandler) {
  (_authListeners[event] ??= []).push(handler)
  return () => { _authListeners[event] = (_authListeners[event] || []).filter(h => h !== handler) }
}

export function emitAuthEvent(event: string) {
  (_authListeners[event] || []).forEach(h => h())
}
