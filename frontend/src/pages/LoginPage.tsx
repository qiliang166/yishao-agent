import { useState, useEffect } from 'react'
import { useNavigate, Navigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import AboutDialog from '../components/AboutDialog'

const isImagePath = (v: string) =>
  v.startsWith('/api/logos/') || v.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)($|\?)/i)

export default function LoginPage() {
  const { user, login, authLogin, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [brandName, setBrandName] = useState('')
  const [brandLogo, setBrandLogo] = useState('')
  const [storedPhone, setStoredPhone] = useState('')
  const [hasRbac, setHasRbac] = useState(false)
  const [initialAdminPassword, setInitialAdminPassword] = useState('')
  const [needsSetup, setNeedsSetup] = useState(false)
  const [setupSuccess, setSetupSuccess] = useState(false)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [showAbout, setShowAbout] = useState(false)

  // Setup form state
  const [setupPassword, setSetupPassword] = useState('')
  const [setupConfirm, setSetupConfirm] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/version').then(r => r.json()),
      fetch('/api/auth/needs-setup').then(r => r.json()),
    ]).then(([data, ver, ns]) => {
      const s = data.settings || {}
      const fallback = ver.app || ''
      if (s.brand_name) setBrandName(s.brand_name)
      else if (fallback) setBrandName(fallback)
      if (s.brand_logo) setBrandLogo(s.brand_logo)
      if (s.admin_phone) setStoredPhone(s.admin_phone)
      if (s.db_schema_version) setHasRbac(true)
      if (ns && ns.needs_setup) {
        setNeedsSetup(true)
        setUsername(ns.admin_username || 'admin')
      } else if (s.initial_admin_password) {
        setInitialAdminPassword(s.initial_admin_password)
        setUsername('admin')
      }
    }).catch(() => {})
  }, [])

  // Already logged in → redirect based on user_type
  if (!authLoading && user) {
    if (user.user_type === 'member') {
      return <Navigate to="/app" replace />
    }
    return <Navigate to="/" replace />
  }

  const handleSetup = async () => {
    setError('')
    if (setupPassword.length < 6) {
      setError('密码至少需要6个字符')
      return
    }
    if (setupPassword !== setupConfirm) {
      setError('两次输入的密码不一致')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: setupPassword }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || '设置失败')
      setNeedsSetup(false)
      setInitialAdminPassword('')
      setPassword(setupPassword)
      setSetupSuccess(true)
    } catch (e: any) {
      setError(e.message || '设置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (!password.trim()) {
      setError('请输入密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (hasRbac && username.trim()) {
        await authLogin(username.trim(), password)
      } else {
        await login(password)
      }
      navigate('/', { replace: true })
    } catch (e: any) {
      setError(e.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const name = brandName || ''
  const logo = brandLogo || '⚡'

  if (needsSetup) {
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
            margin: '0 0 4px 0', color: 'var(--text)',
          }}>
            {name}
          </h1>
          <p style={{
            fontSize: 13, textAlign: 'center', margin: '0 0 28px 0',
            color: 'var(--text-secondary)',
          }}>
            欢迎使用！请设置管理员密码
          </p>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6, fontWeight: 500, color: 'var(--text)' }}>
              管理员账号
            </label>
            <input
              className="form-input"
              type="text"
              value={username}
              disabled
              style={{ width: '100%', boxSizing: 'border-box', background: '#f3f4f6' }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6, fontWeight: 500, color: 'var(--text)' }}>
              设置密码
            </label>
            <input
              className="form-input"
              type="password"
              placeholder="至少6个字符"
              value={setupPassword}
              onChange={e => { setSetupPassword(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleSetup() }}
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 13, marginBottom: 6, fontWeight: 500, color: 'var(--text)' }}>
              确认密码
            </label>
            <input
              className="form-input"
              type="password"
              placeholder="再次输入密码"
              value={setupConfirm}
              onChange={e => { setSetupConfirm(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleSetup() }}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </div>

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
            onClick={handleSetup}
            disabled={loading}
            style={{ width: '100%', marginTop: 20 }}
          >
            {loading ? '设置中...' : '设置密码并进入'}
          </button>
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
          请输入管理员账号密码以继续
        </p>

        {setupSuccess && (
          <div style={{
            fontSize: 13, background: '#d1fae5', border: '1px solid #10b981',
            color: '#065f46', padding: '10px 14px', borderRadius: 6,
            marginBottom: 16, lineHeight: 1.7, textAlign: 'center',
          }}>
            密码设置成功，请登录
          </div>
        )}

        {initialAdminPassword && (
          <div style={{
            fontSize: 13, background: '#d1fae5', border: '1px solid #10b981',
            color: '#065f46', padding: '10px 14px', borderRadius: 6,
            marginBottom: 16, lineHeight: 1.7, textAlign: 'center',
          }}>
            首次安装，初始密码为：<br/>
            <code style={{
              fontSize: 15, fontWeight: 700, background: 'rgba(0,0,0,0.06)',
              padding: '3px 10px', borderRadius: 4, letterSpacing: 1,
              userSelect: 'all',
            }}>{initialAdminPassword}</code>
            <br/><span style={{ fontSize: 10, opacity: 0.7 }}>登录后请立即修改</span>
          </div>
        )}

        {!storedPhone && !initialAdminPassword && !setupSuccess && (
          <div style={{
            fontSize: 11, background: '#fef3c7', border: '1px solid #f59e0b',
            color: '#92400e', padding: '8px 12px', borderRadius: 6,
            marginBottom: 16, textAlign: 'center', lineHeight: 1.5,
          }}>
            初次使用，登录后请在「全局设置」中填写<strong>管理员手机号</strong>，以便忘记密码时验证身份。
          </div>
        )}

        {hasRbac && (
          <input
            className="form-input"
            type="text"
            placeholder="用户名"
            value={username}
            onChange={e => { setUsername(e.target.value); setError('') }}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
            style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
          />
        )}

        <input
          className="form-input"
          type="password"
          placeholder={hasRbac ? '密码' : '管理员密码'}
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
          autoFocus={!needsSetup}
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
          {loading ? '验证中...' : '登录'}
        </button>

        {hasRbac && (
          <p style={{
            fontSize: 11, color: 'var(--text-secondary)',
            marginTop: 16, textAlign: 'center',
          }}>
            <Link to="/member" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
              会员登录 / 注册 →
            </Link>
          </p>
        )}

        <p style={{
          fontSize: 11, color: 'var(--text-secondary)',
          marginTop: hasRbac ? 8 : 24, textAlign: 'center',
        }}>
          <span
            onClick={() => { setShowHint(true); setPhoneInput(''); setPhoneError(''); setPhoneVerified(false) }}
            style={{ cursor: 'pointer', color: 'var(--primary)' }}
          >
            忘记密码？
          </span>
        </p>

        <div style={{
          fontSize: 11, color: 'var(--text-secondary)',
          marginTop: 12, textAlign: 'center',
          display: 'flex', gap: 12, justifyContent: 'center',
          borderTop: '1px solid var(--border)', paddingTop: 12,
        }}>
          <a href="/api/download/desktop" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>下载桌面版</a>
          <a href="/api/download/server" style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>下载服务器版</a>
          <span onClick={() => setShowAbout(true)}
            style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}>关于软件</span>
        </div>
      </div>

      {showAbout && <AboutDialog onClose={() => setShowAbout(false)} />}

      {/* Hint Dialog */}
      {showHint && (
        <div className="dialog-overlay" onClick={() => setShowHint(false)}>
          <div className="dialog-box" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">重置密码</div>
            {!phoneVerified ? (
              <>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', marginBottom: 12 }}>
                  请输入管理员手机号以验证身份：
                </p>
                <input
                  className="form-input"
                  type="text"
                  placeholder="管理员手机号"
                  value={phoneInput}
                  onChange={e => { setPhoneInput(e.target.value); setPhoneError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') {
                    if (storedPhone && phoneInput.trim() === storedPhone) {
                      setPhoneVerified(true); setPhoneError('')
                    } else {
                      setPhoneError(storedPhone ? '手机号不正确' : '未设置管理员手机号，无法通过此方式重置。请在服务器上手动执行 reset_password.py')
                    }
                  }}}
                  autoFocus
                />
                {phoneError && (
                  <p style={{ fontSize: 11, color: 'var(--warning)', marginTop: 8, lineHeight: 1.5 }}>{phoneError}</p>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowHint(false)}>取消</button>
                  <button className="btn btn-primary btn-sm" onClick={() => {
                    if (storedPhone && phoneInput.trim() === storedPhone) {
                      setPhoneVerified(true); setPhoneError('')
                    } else {
                      setPhoneError(storedPhone ? '手机号不正确' : '未设置管理员手机号，无法通过此方式重置。请在服务器上手动执行 reset_password.py')
                    }
                  }}>验证</button>
                </div>
              </>
            ) : (
              <>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', marginBottom: 12 }}>
                  进入 <code style={{ fontSize: 11, background: 'rgba(var(--text-rgb),0.06)', padding: '2px 5px', borderRadius: 3 }}>backend</code> 目录，运行以下命令清除密码：
                </p>
                <code style={{
                  display: 'block', fontSize: 11, background: 'rgba(var(--text-rgb),0.06)',
                  padding: '10px 12px', borderRadius: 6, marginBottom: 12,
                  wordBreak: 'break-all', lineHeight: 1.6, userSelect: 'all',
                }}>
                  venv\Scripts\python.exe reset_password.py
                </code>
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  执行后刷新页面即可无需密码进入系统，进入后请尽快在「全局设置」中设置新密码。
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowHint(false)}>我知道了</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
