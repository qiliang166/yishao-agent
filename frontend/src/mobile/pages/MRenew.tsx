import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { MTopBar } from '../MobileApp'

export default function MRenew() {
  const [params] = useSearchParams()
  const [step, setStep] = useState(0)
  const [username, setUsername] = useState(() => params.get('u') || '')
  const [password, setPassword] = useState('')
  const [method, setMethod] = useState('wechat')
  const [paymentRef, setPaymentRef] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [qrWechat, setQrWechat] = useState('')
  const [qrAlipay, setQrAlipay] = useState('')
  const [planName, setPlanName] = useState('标准套餐')
  const [planPrice, setPlanPrice] = useState('29.90')
  const [planDays, setPlanDays] = useState('90')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const resp = await fetch('/api/settings')
        if (!resp.ok) return
        const data = await resp.json()
        if (cancelled || data == null) return
        const s = data.settings || {}
        if (s.payment_qr_wechat) setQrWechat(s.payment_qr_wechat)
        if (s.payment_qr_alipay) setQrAlipay(s.payment_qr_alipay)
        if (s.member_plan) {
          try {
            const p = JSON.parse(s.member_plan)
            const q = p?.quarterly || {}
            if (q.name) setPlanName(q.name)
            if (q.amount_cents != null) setPlanPrice((q.amount_cents / 100).toFixed(2))
            if (q.duration_days != null) setPlanDays(String(q.duration_days))
          } catch {}
        }
      } catch {
        // 设置读取失败 → 用默认展示，提交时后端仍以服务器价格为准
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const handleVerify = () => {
    setError('')
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }
    if (password.length < 8) {
      setError('密码长度不能少于 8 位')
      return
    }
    setStep(1)
  }

  const handleSubmit = async () => {
    setError('')
    if (!paymentRef.trim()) {
      setError('请填写付款单号/订单号')
      return
    }
    setSubmitting(true)
    try {
      const resp = await fetch('/api/member/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
          plan_type: 'paid',
          plan_id: 'quarterly',
          payment_method: method,
          payment_ref: paymentRef.trim(),
        }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        throw new Error((err as any)?.detail || '续费失败')
      }
      const data = await resp.json()
      setSuccess((data as any)?.message || '续费申请已提交，请等待管理员审批')
    } catch (e: any) {
      setError(e?.message || '续费失败')
    } finally {
      setSubmitting(false)
    }
  }

  const qr = method === 'wechat' ? qrWechat : qrAlipay

  if (success) {
    return (
      <>
        <MTopBar title="会员续费" />
        <div className="m-login-wrap">
          <div className="m-login-card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>✓</div>
            <div className="m-login-title">续费申请已提交</div>
            <div className="m-login-sub" style={{ marginBottom: 16 }}>{success}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 16 }}>
              管理员审批通过后生效。审批前账号需重新等待审核，请耐心等待。
            </div>
            <div className="m-login-switch">
              <Link to="/member">返回会员登录</Link>
            </div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <MTopBar title="会员续费" back="__back__" />
      <div className="m-login-wrap">
        <div className="m-login-card">
          {step === 0 ? (
            <>
              <div className="m-login-title">会员续费</div>
              <div className="m-login-sub">请先验证您的身份</div>
              {error && <div className="m-error">{error}</div>}
              <div className="m-field">
                <label>用户名</label>
                <input className="m-input" value={username} autoComplete="username"
                  onChange={e => { setUsername(e.target.value); setError('') }} />
              </div>
              <div className="m-field">
                <label>密码</label>
                <input className="m-input" type="password" value={password} autoComplete="current-password"
                  onChange={e => { setPassword(e.target.value); setError('') }}
                  onKeyDown={e => { if (e.key === 'Enter') handleVerify() }} />
              </div>
              <button className="m-btn-primary" onClick={handleVerify}>下一步</button>
            </>
          ) : (
            <>
              <div className="m-login-title">会员续费</div>
              <div className="m-login-sub">{username} · ￥{planPrice}/{planDays}天</div>
              {error && <div className="m-error">{error}</div>}

              <div className="m-plan-card">
                <div className="m-plan-name">{planName} ￥{planPrice}</div>
                <div className="m-plan-desc">全部功能含文件下载，{planDays} 天有效期</div>
              </div>

              <div className="m-pay-tabs">
                <button className={method === 'wechat' ? 'active' : ''}
                  onClick={() => { setMethod('wechat'); setError('') }}>微信支付</button>
                <button className={method === 'alipay' ? 'active' : ''}
                  onClick={() => { setMethod('alipay'); setError('') }}>支付宝</button>
              </div>

              {qr ? (
                <img className="m-qr-preview" src={qr} alt="收款码" />
              ) : (
                <div className="m-qr-empty">该渠道收款码未配置，请联系管理员</div>
              )}

              <div className="m-field" style={{ marginTop: 10 }}>
                <label>付款单号/订单号（付款后在微信/支付宝账单中查看）</label>
                <input className="m-input" value={paymentRef} placeholder="扫码付款后填写"
                  onChange={e => { setPaymentRef(e.target.value); setError('') }} />
              </div>

              <div className="m-sheet-actions">
                <button disabled={submitting} onClick={() => setStep(0)}>上一步</button>
                <button className="primary" disabled={submitting} onClick={handleSubmit}>
                  {submitting ? '提交中…' : '提交续费'}
                </button>
              </div>
            </>
          )}
          <div className="m-login-switch">
            <Link to="/member">返回会员登录</Link>
          </div>
        </div>
      </div>
    </>
  )
}
