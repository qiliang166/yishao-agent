import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import type { ReactNode } from 'react'

const SETTINGS_TOKEN_KEY = 'settings_token'

export default function SettingsLock({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { isAuthenticated, login, loading: authLoading } = useAuth()
  const [passwordEnabled, setPasswordEnabled] = useState<boolean | null>(null)
  const [unlocked, setUnlocked] = useState(false)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        const s = data.settings || {}
        setPasswordEnabled(s.admin_password_enabled === '1')
      })
      .catch(() => { setPasswordEnabled(false) })
      .finally(() => setChecking(false))

    return () => {
      sessionStorage.removeItem(SETTINGS_TOKEN_KEY)
    }
  }, [])

  // Already authenticated via AuthContext
  useEffect(() => {
    if (isAuthenticated) {
      setUnlocked(true)
    }
  }, [isAuthenticated])

  const handleSubmit = async () => {
    if (!password.trim()) {
      setError('请输入密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as any).detail || `验证失败 (${res.status})`)
      }
      const data = await res.json()
      sessionStorage.setItem(SETTINGS_TOKEN_KEY, data.token)
      setUnlocked(true)
      // Sync to AuthContext so other protected pages don't re-prompt
      try { await login(password) } catch {}
    } catch (e: any) {
      setError(e.message || '密码错误')
    } finally {
      setLoading(false)
    }
  }

  if (checking || authLoading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
        加载中...
      </div>
    )
  }

  if (!passwordEnabled || unlocked) {
    return <>{children}</>
  }

  return (
    <div className="dialog-overlay" style={{ position: 'fixed', zIndex: 9999 }}>
      <div className="dialog-box" style={{ width: 360 }}>
        <div className="dialog-title">需要密码</div>
        <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
          此页面需要输入管理员密码才能查看和编辑。
        </p>
        <input
          className="form-input"
          type="password"
          placeholder="管理员密码"
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
          autoFocus
          style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }}
        />
        {error && (
          <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 10, textAlign: 'center' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(-1)}>取消</button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmit} disabled={loading}>
            {loading ? '验证中...' : '确认'}
          </button>
        </div>
      </div>
    </div>
  )
}
