import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function MemberRegisterPage() {
  const { memberRegister } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('用户名和密码不能为空')
      return
    }
    if (username.trim().length < 2) {
      setError('用户名至少需要 2 个字符')
      return
    }
    if (password.length < 8) {
      setError('密码长度不能少于 8 位')
      return
    }
    if (email && (!email.includes('@') || !email.split('@')[1]?.includes('.'))) {
      setError('邮箱格式不正确')
      return
    }
    setLoading(true)
    try {
      const result = await memberRegister({
        username: username.trim(),
        password,
        display_name: displayName.trim() || username.trim(),
        email: email.trim(),
      })
      setSuccess((result as any).message || '注册成功，请等待管理员审批')
    } catch (e: any) {
      setError(e.message || '注册失败')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', background: 'var(--primary)',
      }}>
        <div style={{
          background: '#ffffff', padding: '48px 40px',
          borderRadius: 12, width: 360,
          boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0' }}>注册成功</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {success}
          </p>
          <Link to="/member" style={{
            display: 'inline-block', marginTop: 20,
            color: 'var(--primary)', fontSize: 13, textDecoration: 'none',
          }}>
            返回登录 →
          </Link>
        </div>
      </div>
    )
  }

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
        <h1 style={{
          fontSize: 22, fontWeight: 700, textAlign: 'center',
          margin: '0 0 8px 0', color: 'var(--text)',
        }}>
          会员注册
        </h1>
        <p style={{
          fontSize: 12, textAlign: 'center', margin: '0 0 24px 0',
          color: 'var(--text-secondary)',
        }}>
          注册后需等待管理员审批
        </p>

        <input
          className="form-input"
          type="text"
          placeholder="用户名 *"
          value={username}
          onChange={e => { setUsername(e.target.value); setError('') }}
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
        />
        <input
          className="form-input"
          type="password"
          placeholder="密码（至少 8 位）*"
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
        />
        <input
          className="form-input"
          type="text"
          placeholder="显示名（可选）"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
        />
        <input
          className="form-input"
          type="email"
          placeholder="邮箱（可选）"
          value={email}
          onChange={e => { setEmail(e.target.value); setError('') }}
          style={{ width: '100%', boxSizing: 'border-box' }}
        />

        {error && (
          <div style={{
            fontSize: 12, color: 'var(--warning)',
            marginTop: 10, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: '100%', marginTop: 20 }}
        >
          {loading ? '提交中...' : '注册'}
        </button>

        <p style={{
          fontSize: 11, color: 'var(--text-secondary)',
          marginTop: 16, textAlign: 'center',
        }}>
          已有账号？{' '}
          <Link to="/member" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
            立即登录 →
          </Link>
        </p>
      </div>
    </div>
  )
}
