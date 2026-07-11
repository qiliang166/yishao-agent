import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function FirstTimeSetupPage() {
  const { user, token, logout } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Step 0: Change password
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Step 1: Brand settings
  const [brandName, setBrandName] = useState('')
  const [brandLogo, setBrandLogo] = useState('')

  // Step 2: Payment QR codes
  const [qrWechat, setQrWechat] = useState('')
  const [qrAlipay, setQrAlipay] = useState('')

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      const s = data.settings || {}
      if (s.brand_name) setBrandName(s.brand_name)
    }).catch(() => {})
  }, [])

  // Check if setup is actually needed
  useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true })
      return
    }
    fetch('/api/setup/status', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()).then(d => {
      if (!d.need_setup) {
        navigate('/', { replace: true })
      }
    }).catch(() => {})
  }, [token, navigate])

  const handleNext = () => {
    setError('')
    if (step === 0) {
      if (!newPassword || newPassword.length < 8) {
        setError('密码长度不能少于 8 位')
        return
      }
      if (newPassword !== confirmPassword) {
        setError('两次输入的密码不一致')
        return
      }
    }
    setStep(s => s + 1)
  }

  const toBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleComplete = async () => {
    setLoading(true)
    setError('')
    try {
      const body: any = { new_password: newPassword }
      if (brandName) body.brand_name = brandName
      if (brandLogo) body.brand_logo = brandLogo
      if (qrWechat) body.payment_qr_wechat = qrWechat
      if (qrAlipay) body.payment_qr_alipay = qrAlipay

      const res = await fetch('/api/setup/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error((e as any).detail || '设置失败')
      }
      // Force logout so user re-logs in with new password
      logout()
      navigate('/login', { replace: true, state: { reason: '设置完成，请使用新密码登录' } })
    } catch (e: any) {
      setError(e.message || '设置失败')
    } finally {
      setLoading(false)
    }
  }

  const steps = [
    { title: '修改管理员密码', sub: '请设置一个安全的管理员密码' },
    { title: '品牌设置', sub: '自定义系统名称和Logo（可跳过）' },
    { title: '收款码配置', sub: '上传微信/支付宝收款码（可跳过）' },
    { title: '完成设置', sub: '一切就绪，开始使用系统' },
  ]

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--primary)',
    }}>
      <div style={{
        background: '#ffffff', padding: '40px 36px',
        borderRadius: 12, width: 440,
        boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
      }}>
        {/* Progress indicator */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 24, justifyContent: 'center' }}>
          {steps.map((s, i) => (
            <div key={i} style={{
              width: i <= step ? 32 : 8, height: 8,
              borderRadius: 4,
              background: i <= step ? 'var(--primary)' : 'var(--border)',
              transition: 'all 0.3s',
            }} />
          ))}
        </div>

        <h1 style={{
          fontSize: 20, fontWeight: 700, textAlign: 'center',
          margin: '0 0 4px 0', color: 'var(--text)',
        }}>
          {steps[step].title}
        </h1>
        <p style={{
          fontSize: 12, textAlign: 'center', margin: '0 0 24px 0',
          color: 'var(--text-secondary)',
        }}>
          {steps[step].sub}
        </p>

        {/* Step 0: Password */}
        {step === 0 && (
          <>
            <input
              className="form-input"
              type="password"
              placeholder="新密码（至少 8 位）"
              value={newPassword}
              onChange={e => { setNewPassword(e.target.value); setError('') }}
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
            />
            <input
              className="form-input"
              type="password"
              placeholder="确认新密码"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleNext() }}
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
          </>
        )}

        {/* Step 1: Brand */}
        {step === 1 && (
          <>
            <input
              className="form-input"
              type="text"
              placeholder="系统名称"
              value={brandName}
              onChange={e => setBrandName(e.target.value)}
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }}
            />
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Logo 图片（可选）
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={async e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    try { setBrandLogo(await toBase64(f)) } catch {}
                  }
                }}
                style={{ fontSize: 12 }}
              />
              {brandLogo && (
                <div style={{ marginTop: 8 }}>
                  <img src={brandLogo} alt="Preview" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover' }} />
                </div>
              )}
            </div>
          </>
        )}

        {/* Step 2: Payment QR Codes */}
        {step === 2 && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                微信收款码
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={async e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    try { setQrWechat(await toBase64(f)) } catch {}
                  }
                }}
                style={{ fontSize: 12 }}
              />
              {qrWechat && (
                <img src={qrWechat} alt="WeChat QR" style={{ width: 120, height: 120, marginTop: 8, objectFit: 'contain' }} />
              )}
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                支付宝收款码
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={async e => {
                  const f = e.target.files?.[0]
                  if (f) {
                    try { setQrAlipay(await toBase64(f)) } catch {}
                  }
                }}
                style={{ fontSize: 12 }}
              />
              {qrAlipay && (
                <img src={qrAlipay} alt="Alipay QR" style={{ width: 120, height: 120, marginTop: 8, objectFit: 'contain' }} />
              )}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>
              会员注册时将展示这些收款码
            </p>
          </>
        )}

        {/* Step 3: Done */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
            <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>
              设置完成！现在可以开始使用系统了。
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
              点击下方按钮后需要重新登录。
            </p>
          </div>
        )}

        {error && (
          <div style={{
            fontSize: 12, color: 'var(--warning)',
            marginTop: 10, textAlign: 'center',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          {step > 0 && step < 3 && (
            <button
              className="btn btn-ghost"
              onClick={() => setStep(s => s - 1)}
              style={{ flex: 1 }}
            >
              上一步
            </button>
          )}
          {step < 2 && (
            <button
              className="btn btn-primary"
              onClick={step === 1 ? () => setStep(2) : handleNext}
              style={{ flex: 1 }}
            >
              下一步
            </button>
          )}
          {step === 1 && (
            <button
              className="btn btn-ghost"
              onClick={() => setStep(2)}
              style={{ flex: 1 }}
            >
              跳过
            </button>
          )}
          {step === 2 && (
            <>
              <button
                className="btn btn-ghost"
                onClick={() => setStep(3)}
                style={{ flex: 1 }}
              >
                跳过
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setStep(3)}
                style={{ flex: 1 }}
              >
                下一步
              </button>
            </>
          )}
          {step === 3 && (
            <button
              className="btn btn-primary"
              onClick={handleComplete}
              disabled={loading}
              style={{ flex: 1 }}
            >
              {loading ? '保存中...' : '完成设置'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
