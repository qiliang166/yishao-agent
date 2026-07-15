import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function MMemberLogin() {
  const { user, memberLogin } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/" replace />

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      await memberLogin(username.trim(), password)
    } catch (e: any) {
      setError(e?.message || '登录失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="m-login-wrap">
      <div className="m-login-card">
        <div className="m-login-title">智绘食谱教案系统</div>
        <div className="m-login-sub">会员登录 · 手机版</div>
        {error && <div className="m-error">{error}</div>}
        <div className="m-field">
          <label>用户名</label>
          <input className="m-input" value={username} autoComplete="username"
            onChange={e => setUsername(e.target.value)} />
        </div>
        <div className="m-field">
          <label>密码</label>
          <input className="m-input" type="password" value={password} autoComplete="current-password"
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleLogin() }} />
        </div>
        <button className="m-btn-primary" disabled={submitting} onClick={handleLogin}>
          {submitting ? '登录中…' : '登录'}
        </button>
        <div className="m-login-switch">
          管理员？<Link to="/login">管理员登录</Link>
        </div>
      </div>
    </div>
  )
}
