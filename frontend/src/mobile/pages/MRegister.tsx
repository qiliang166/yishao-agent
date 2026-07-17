import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { MTopBar } from '../MobileApp'

export default function MRegister() {
  const { user, memberRegister } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)
  const [contactInfo, setContactInfo] = useState('')

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      const s = data.settings || {}
      if (s.contact_info) setContactInfo(s.contact_info)
    }).catch(() => {})
  }, [])

  if (user) {
    navigate('/', { replace: true })
    return null
  }

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
    if (!phone.trim()) {
      setError('请填写手机号（用于联系与退款）')
      return
    }
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length !== 11) {
      setError('手机号格式不正确')
      return
    }
    setLoading(true)
    try {
      const result = await memberRegister({
        username: username.trim(),
        password,
        display_name: displayName.trim() || username.trim(),
        email: email.trim(),
        phone: phone.trim(),
        plan_type: 'trial',
      })
      setSuccess((result as any)?.message || '注册成功')
    } catch (e: any) {
      setError(e?.message || '注册失败')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <>
        <MTopBar title="注册成功" back="/member" />
        <div className="m-content" style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0' }}>注册成功</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {success}
          </p>
          {contactInfo && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
              遇到问题？联系我们：{contactInfo}
            </p>
          )}
          <Link to="/member" style={{
            display: 'inline-block', marginTop: 20,
            color: 'var(--primary)', fontSize: 13, textDecoration: 'none',
          }}>
            返回登录 →
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <MTopBar title="会员注册" back="/member" />
      <div className="m-content">

        <p style={{
          fontSize: 12, textAlign: 'center', margin: '0 0 16px 0',
          color: 'var(--text-secondary)',
        }}>
          注册即开通试用会员，可在会员中心升级付费
        </p>

        <div className="m-field">
          <label>用户名 *</label>
          <input className="m-input" type="text" placeholder="至少 2 个字符" value={username} autoFocus
            onChange={e => { setUsername(e.target.value); setError('') }} />
        </div>
        <div className="m-field">
          <label>密码 *（至少 8 位）</label>
          <input className="m-input" type="password" placeholder="至少 8 位" value={password}
            onChange={e => { setPassword(e.target.value); setError('') }} />
        </div>
        <div className="m-field">
          <label>显示名</label>
          <input className="m-input" type="text" placeholder="选填，默认同用户名" value={displayName}
            onChange={e => setDisplayName(e.target.value)} />
        </div>
        <div className="m-field">
          <label>邮箱</label>
          <input className="m-input" type="email" placeholder="选填" value={email}
            onChange={e => { setEmail(e.target.value); setError('') }} />
        </div>
        <div className="m-field">
          <label>手机号 *</label>
          <input className="m-input" type="tel" placeholder="11 位手机号" value={phone}
            onChange={e => { setPhone(e.target.value); setError('') }} />
        </div>

        {error && <div className="m-error">{error}</div>}

        <button className="m-btn-primary" style={{ marginTop: 12 }}
          disabled={loading} onClick={handleSubmit}>
          {loading ? '提交中…' : '注 册'}
        </button>

        <p style={{
          fontSize: 11, color: 'var(--text-secondary)',
          marginTop: 20, textAlign: 'center',
        }}>
          已有账号？{' '}
          <Link to="/member" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
            立即登录 →
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
    </>
  )
}
