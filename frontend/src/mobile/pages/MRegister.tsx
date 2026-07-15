import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { MTopBar, mToast } from '../MobileApp'

type PlanType = 'trial' | 'paid'

interface QRState {
  wechat: string
  alipay: string
}

export default function MRegister() {
  const { user, memberRegister } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [planType, setPlanType] = useState<PlanType>('trial')
  const [paymentMethod, setPaymentMethod] = useState('wechat')
  const [paymentRef, setPaymentRef] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
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
          if (q.amount_cents) setPlanPrice((q.amount_cents / 100).toFixed(2))
          if (q.duration_days) setPlanDays(String(q.duration_days))
        } catch {}
      }
    }).catch(() => {})
  }, [])

  if (user) {
    navigate('/', { replace: true })
    return null
  }

  const handleNext = () => {
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
      setError('请填写手机号（用于审批联系与退款）')
      return
    }
    const phoneDigits = phone.replace(/\D/g, '')
    if (phoneDigits.length !== 11) {
      setError('手机号格式不正确')
      return
    }
    setStep(1)
  }

  const handleSubmit = async () => {
    setError('')
    if (planType === 'paid' && !paymentRef.trim()) {
      setError('请填写付款单号/订单号')
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
        plan_type: planType,
        ...(planType === 'paid' ? {
          plan_id: 'quarterly',
          payment_method: paymentMethod,
          payment_ref: paymentRef.trim(),
        } : {}),
      })
      setSuccess((result as any)?.message || '注册成功，请等待管理员审批')
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

        {/* Step indicators */}
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

        {/* Step 0: Basic Info */}
        {step === 0 && (
          <>
            <p style={{
              fontSize: 12, textAlign: 'center', margin: '0 0 16px 0',
              color: 'var(--text-secondary)',
            }}>
              填写基本信息
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
              <label>手机号 *（用于审批联系与退款）</label>
              <input className="m-input" type="tel" placeholder="11 位手机号" value={phone}
                onChange={e => { setPhone(e.target.value); setError('') }} />
            </div>

            {error && <div className="m-error">{error}</div>}

            <button className="m-btn-primary" style={{ marginTop: 12 }} onClick={handleNext}>
              下一步
            </button>
          </>
        )}

        {/* Step 1: Plan + Payment */}
        {step === 1 && (
          <>
            <p style={{
              fontSize: 12, textAlign: 'center', margin: '0 0 16px 0',
              color: 'var(--text-secondary)',
            }}>
              选择适合您的方案
            </p>

            {/* Trial option */}
            <div
              onClick={() => setPlanType('trial')}
              style={{
                border: `2px solid ${planType === 'trial' ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 10, padding: 16, marginBottom: 12, cursor: 'pointer',
                background: planType === 'trial' ? 'rgba(59,130,246,0.04)' : 'var(--card-bg)',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>7 天试用</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    免费体验全部功能（不含文件下载）
                  </div>
                </div>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: `2px solid ${planType === 'trial' ? 'var(--primary)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {planType === 'trial' && (
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--primary)' }} />
                  )}
                </div>
              </div>
            </div>

            {/* Paid option */}
            <div
              onClick={() => setPlanType('paid')}
              style={{
                border: `2px solid ${planType === 'paid' ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 10, padding: 16, marginBottom: 12, cursor: 'pointer',
                background: planType === 'paid' ? 'rgba(59,130,246,0.04)' : 'var(--card-bg)',
                transition: 'all 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>
                    付费开通 <span style={{ fontSize: 13, color: 'var(--primary)' }}>￥{planPrice}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    全部功能含文件下载，{planDays} 天有效期
                  </div>
                </div>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: `2px solid ${planType === 'paid' ? 'var(--primary)' : 'var(--border)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {planType === 'paid' && (
                    <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--primary)' }} />
                  )}
                </div>
              </div>
            </div>

            {/* Paid: QR + payment ref */}
            {planType === 'paid' && (
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: 8, padding: 16, marginBottom: 12,
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                  请扫描下方二维码付款
                </div>

                <div className="m-pay-tabs" style={{ marginBottom: 12 }}>
                  <button className={paymentMethod === 'wechat' ? 'active' : ''}
                    onClick={() => setPaymentMethod('wechat')}>微信支付</button>
                  <button className={paymentMethod === 'alipay' ? 'active' : ''}
                    onClick={() => setPaymentMethod('alipay')}>支付宝</button>
                </div>

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

                <div className="m-field">
                  <label>付款单号/订单号</label>
                  <input className="m-input" type="text" placeholder="支付宝/微信支付完成后可查"
                    value={paymentRef}
                    onChange={e => { setPaymentRef(e.target.value); setError('') }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                  付款后请在支付宝/微信中查看订单号并填入上方
                </div>
              </div>
            )}

            {error && <div className="m-error">{error}</div>}

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button className="m-btn-primary"
                style={{ background: 'var(--bg-secondary)', color: 'var(--text)', border: '1px solid var(--border)', flex: 1 }}
                onClick={() => setStep(0)}>
                上一步
              </button>
              <button className="m-btn-primary" style={{ flex: 1 }}
                disabled={loading} onClick={handleSubmit}>
                {loading ? '提交中…' : planType === 'trial' ? '开始试用' : '提交审批'}
              </button>
            </div>
          </>
        )}

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
