import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

interface QRState {
  wechat: string
  alipay: string
}

export default function MemberRenewPage() {
  const [searchParams] = useSearchParams()
  const [step, setStep] = useState(0)
  const [username, setUsername] = useState(() => searchParams.get('username') || '')
  const [password, setPassword] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('wechat')
  const [paymentRef, setPaymentRef] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [loading, setLoading] = useState(false)
  const [qrCodes, setQrCodes] = useState<QRState>({ wechat: '', alipay: '' })
  const [brandName, setBrandName] = useState('')
  const [contactInfo, setContactInfo] = useState('')
  const [planPrice, setPlanPrice] = useState('29.90')
  const [planDays, setPlanDays] = useState('90')

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(data => {
      const s = data.settings || {}
      if (s.brand_name) setBrandName(s.brand_name)
      if (s.contact_info) setContactInfo(s.contact_info)
      if (s.payment_qr_wechat) setQrCodes(prev => ({ ...prev, wechat: s.payment_qr_wechat }))
      if (s.payment_qr_alipay) setQrCodes(prev => ({ ...prev, alipay: s.payment_qr_alipay }))
      if (s.member_plan) {
        try {
          const p = JSON.parse(s.member_plan)
          const q = p.quarterly || p[Object.keys(p)[0]] || {}
          if (q.amount_cents != null) setPlanPrice((q.amount_cents / 100).toFixed(2))
          if (q.duration_days) setPlanDays(String(q.duration_days))
        } catch {}
      }
    }).catch(() => {})
  }, [])

  const handleVerify = async () => {
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }
    if (password.length < 8) {
      setError('密码长度不能少于 8 位')
      return
    }
    setVerifying(true)
    try {
      const res = await fetch('/api/member/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any)?.detail || '用户名或密码错误')
      }
      setStep(1)
    } catch (e: any) {
      setError(e.message || '用户名或密码错误')
    } finally {
      setVerifying(false)
    }
  }

  const handleSubmit = async () => {
    setError('')
    if (!paymentRef.trim()) {
      setError('请填写交易单号')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/member/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          plan_type: 'paid',
          plan_id: 'quarterly',
          payment_method: paymentMethod,
          payment_ref: paymentRef.trim(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as any).detail || '续费失败')
      }
      const data = await res.json()
      setSuccess((data as any).message || '续费申请已提交，请等待管理员审批')
    } catch (e: any) {
      setError(e.message || '续费失败')
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
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px 0' }}>续费申请已提交</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {success}
          </p>
          {contactInfo && (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
              遇到问题？联系我们：{contactInfo}
            </p>
          )}
          <Link to="/" style={{
            display: 'inline-block', marginTop: 20,
            color: 'var(--primary)', fontSize: 13, textDecoration: 'none',
          }}>
            返回首页 →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: 'var(--primary)',
      padding: '20px 0',
    }}>
      <div style={{
        background: '#ffffff', padding: '36px 32px',
        borderRadius: 12, width: 380,
        boxShadow: '0 2px 16px rgba(0,0,0,0.08)',
      }}>
        {/* Progress */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, justifyContent: 'center' }}>
          <div style={{
            width: step >= 0 ? 32 : 8, height: 8, borderRadius: 4,
            background: step >= 0 ? 'var(--primary)' : 'var(--border)',
            transition: 'all 0.3s',
          }} />
          <div style={{
            width: step >= 1 ? 32 : 8, height: 8, borderRadius: 4,
            background: step >= 1 ? 'var(--primary)' : 'var(--border)',
            transition: 'all 0.3s',
          }} />
        </div>

        {/* Step 0: Verify Identity */}
        {step === 0 && (
          <>
            <h1 style={{
              fontSize: 20, fontWeight: 700, textAlign: 'center',
              margin: '0 0 4px 0', color: 'var(--text)',
            }}>
              会员续费
            </h1>
            <p style={{
              fontSize: 12, textAlign: 'center', margin: '0 0 20px 0',
              color: 'var(--text-secondary)',
            }}>
              请先验证您的身份
            </p>

            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
              用户名
            </label>
            <input className="form-input" type="text" placeholder="输入用户名" value={username}
              onChange={e => { setUsername(e.target.value); setError('') }}
              autoFocus style={{ width: '100%', boxSizing: 'border-box', marginBottom: 10 }} />
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4, display: 'block' }}>
              密码
            </label>
            <input className="form-input" type="password" placeholder="输入密码以验证身份" value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleVerify() }}
              style={{ width: '100%', boxSizing: 'border-box' }} />

            {error && (
              <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 10, textAlign: 'center' }}>
                {error}
              </div>
            )}

            <button className="btn btn-primary" onClick={handleVerify}
              disabled={verifying}
              style={{ width: '100%', marginTop: 20 }}>
              {verifying ? '验证中…' : '下一步'}
            </button>
          </>
        )}

        {/* Step 1: Payment */}
        {step === 1 && (
          <>
            <h1 style={{
              fontSize: 20, fontWeight: 700, textAlign: 'center',
              margin: '0 0 4px 0', color: 'var(--text)',
            }}>
              会员续费
            </h1>
            <p style={{
              fontSize: 12, textAlign: 'center', margin: '0 0 20px 0',
              color: 'var(--text-secondary)',
            }}>
              {username} · ￥{planPrice}/{planDays}天
            </p>

            {/* Paid option */}
            <div style={{
              border: '2px solid var(--primary)', borderRadius: 10, padding: 16, marginBottom: 12,
              background: 'rgba(59,130,246,0.04)',
            }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                标准套餐 <span style={{ fontSize: 13, color: 'var(--primary)' }}>￥{planPrice}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                全部功能含文件下载，{planDays} 天有效期
              </div>
            </div>

            {/* QR + payment ref */}
            <div style={{
              background: '#f8fafc', borderRadius: 8, padding: 16, marginBottom: 12,
              border: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                请扫描下方二维码付款
              </div>

              {/* Payment method tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button
                  onClick={() => setPaymentMethod('wechat')}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 6, border: 'none',
                    cursor: 'pointer', fontWeight: paymentMethod === 'wechat' ? 700 : 400,
                    background: paymentMethod === 'wechat' ? 'var(--primary)' : 'var(--card-bg)',
                    color: paymentMethod === 'wechat' ? '#fff' : 'var(--text)',
                  }}
                >
                  微信支付
                </button>
                <button
                  onClick={() => setPaymentMethod('alipay')}
                  style={{
                    flex: 1, padding: '6px 0', fontSize: 12, borderRadius: 6, border: 'none',
                    cursor: 'pointer', fontWeight: paymentMethod === 'alipay' ? 700 : 400,
                    background: paymentMethod === 'alipay' ? 'var(--primary)' : 'var(--card-bg)',
                    color: paymentMethod === 'alipay' ? '#fff' : 'var(--text)',
                  }}
                >
                  支付宝
                </button>
              </div>

              {/* QR code display */}
              {(paymentMethod === 'wechat' && qrCodes.wechat) || (paymentMethod === 'alipay' && qrCodes.alipay) ? (
                <div style={{ textAlign: 'center', marginBottom: 12 }}>
                  <img
                    src={paymentMethod === 'wechat' ? qrCodes.wechat : qrCodes.alipay}
                    alt="收款码"
                    style={{ width: 160, height: 160, objectFit: 'contain', borderRadius: 8 }}
                  />
                </div>
              ) : (
                <div style={{
                  textAlign: 'center', padding: '20px 0', marginBottom: 12,
                  color: 'var(--text-secondary)', fontSize: 12,
                }}>
                  请联系管理员获取收款码
                </div>
              )}

              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                交易单号
              </div>
              <input
                className="form-input"
                type="text"
                placeholder="支付宝/微信支付完成后可查"
                value={paymentRef}
                onChange={e => { setPaymentRef(e.target.value); setError('') }}
                style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }}
              />
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                付款后请在支付宝/微信中查看交易单号并填入上方
              </div>
            </div>

            {error && (
              <div style={{ fontSize: 12, color: 'var(--warning)', marginTop: 10, textAlign: 'center' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setStep(0)}
                style={{ flex: 1 }}>
                上一步
              </button>
              <button className="btn btn-primary" onClick={handleSubmit}
                disabled={loading} style={{ flex: 1 }}>
                {loading ? '提交中...' : '提交续费'}
              </button>
            </div>
          </>
        )}

        <p style={{
          fontSize: 11, color: 'var(--text-secondary)',
          marginTop: 16, textAlign: 'center',
        }}>
          <Link to="/" style={{ color: 'var(--primary)', textDecoration: 'none' }}>
            返回首页
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
