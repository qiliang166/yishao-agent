import { useState, useEffect } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const isImagePath = (v: string) =>
  v.startsWith('/api/logos/') || v.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)($|\?)/i)

export default function MemberLoginPage() {
  const { memberLogin, user } = useAuth()
  const [brandName, setBrandName] = useState('')
  const [brandLogo, setBrandLogo] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/version').then(r => r.json()),
    ]).then(([data, ver]) => {
      const s = data.settings || {}
      const fallback = ver.app || ''
      if (s.brand_name) setBrandName(s.brand_name)
      else if (fallback) setBrandName(fallback)
      if (s.brand_logo) setBrandLogo(s.brand_logo)
      if (s.contact_info) setContactInfo(s.contact_info)
    }).catch(() => {})
  }, [])

  if (user) {
    return <Navigate to={user.user_type === 'member' ? '/app' : '/'} replace />
  }

  const handleSubmit = async () => {
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      await memberLogin(username.trim(), password)
    } catch (e: any) {
      setError(e.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const name = brandName || ''
  const logo = brandLogo || '⚡'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--primary)',
    }}>
      <div style={{
        background: '#ffffff', padding: '48px 40px',
        borderRadius: 12, width: 360,
        boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 12 }}>
          {isImagePath(logo) ? (
            <img src={logo} alt="Logo" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <span style={{ fontSize: 40 }}>{logo}</span>
          )}
        </div>
        <h1 style={{
          fontSize: 22, fontWeight: 700, textAlign: 'center',
          margin: '0 0 8px 0', color: 'var(--text)',
        }}>
          {name}
        </h1>
        <p style={{
          fontSize: 12, textAlign: 'center', margin: '0 0 32px 0',
          color: 'var(--text-secondary)',
        }}>
          会员登录
        </p>

        <input
          className="form-input"
          type="text"
          placeholder="用户名"
          value={username}
          onChange={e => { setUsername(e.target.value); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
          autoFocus
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
        />
        <input
          className="form-input"
          type="password"
          placeholder="密码"
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />

        {error && (
          <div style={{
            fontSize: 12, color: 'var(--warning)',
            marginTop: 10, textAlign: 'center',
          }}>
            {error}
            {error.includes('已到期') && (
              <> <Link to={`/member/renew?username=${encodeURIComponent(username)}`}
                      style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                续费 →
              </Link></>
            )}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: '100%', marginTop: 20 }}
        >
          {loading ? '验证中...' : '登录'}
        </button>

        <p style={{
          fontSize: 11, color: 'var(--text-secondary)',
          marginTop: 16, textAlign: 'center',
        }}>
          还没有账号？{' '}
          <Link to="/member/register" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
            立即注册 →
          </Link>
        </p>

        <p style={{
          fontSize: 11, color: 'var(--text-secondary)',
          marginTop: 8, textAlign: 'center',
        }}>
          <Link to="/login" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>
            管理员登录
          </Link>
        </p>

        {contactInfo && (
          <p style={{
            fontSize: 11, color: 'var(--text-secondary)',
            marginTop: 8, textAlign: 'center',
          }}>
            遇到问题？联系我们：{contactInfo}
          </p>
        )}
      </div>
    </div>
  )
}
