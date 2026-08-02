import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api'

interface Plan {
  id: number
  name: string
  price_yuan: number
  duration_days: number | null
  features: string[]
}

function durationLabel(days: number | null): string {
  if (days == null) return '永久有效'
  if (days < 30) return `${days}天`
  const months = Math.round(days / 30)
  if (months === 1) return '1个月'
  if (months === 3) return '3个月'
  if (months === 6) return '6个月'
  if (months === 12) return '1年'
  return `${days}天`
}

export default function PurchasePage() {
  const navigate = useNavigate()

  // Step state: 1=select plan, 2=phone+confirm, 3=pay, 4=waiting result
  const [step, setStep] = useState(1)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null)
  const [phone, setPhone] = useState('')
  const [orderNo, setOrderNo] = useState('')
  const [amountYuan, setAmountYuan] = useState(0)
  const [planName, setPlanName] = useState('')

  // Step 3 — QR codes
  const [qrcodes, setQrcodes] = useState<{ wechat: string; alipay: string }>({ wechat: '', alipay: '' })
  const [showWechat, setShowWechat] = useState(true)
  const [paymentRef, setPaymentRef] = useState('')
  const [paySaving, setPaySaving] = useState(false)
  const [payError, setPayError] = useState('')

  // Step 4 — polling
  const [licenseKey, setLicenseKey] = useState('')
  const [orderStatus, setOrderStatus] = useState('')
  const [copied, setCopied] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    api.listPlans()
      .then(d => setPlans(d.plans || []))
      .catch(e => setError(`加载套餐失败: ${e.message}`))
      .finally(() => setLoading(false))

    // Load QR code URLs
    api.getQrcodeUrls().then(setQrcodes).catch(() => {})
  }, [])

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan)
    setError('')
  }

  const handleSubmitOrder = async () => {
    if (!selectedPlan) return
    if (!phone.trim()) { setError('请输入手机号'); return }
    setError('')
    setLoading(true)
    try {
      const result = await api.createOrder({ phone: phone.trim(), plan_type_id: selectedPlan.id })
      if (result?.ok) {
        setOrderNo(result.order_no)
        setAmountYuan(result.amount_yuan)
        setPlanName(result.plan_name)
        setStep(3)
      }
    } catch (e: any) {
      setError(`提交订单失败: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitPaymentRef = async () => {
    if (!paymentRef.trim()) { setPayError('请输入转账单号'); return }
    setPayError('')
    setPaySaving(true)
    try {
      const result = await api.updatePaymentRef(orderNo, paymentRef.trim())
      if (result?.ok) {
        setStep(4)
        startPolling()
      }
    } catch (e: any) {
      setPayError(`提交失败: ${e.message}`)
    } finally {
      setPaySaving(false)
    }
  }

  const startPolling = () => {
    let attempts = 0
    pollRef.current = setInterval(async () => {
      attempts++
      try {
        const order = await api.getOrder(orderNo)
        setOrderStatus(order.status)
        if (order.status === 'completed' && order.license_key) {
          setLicenseKey(order.license_key)
          if (pollRef.current) clearInterval(pollRef.current)
        } else if (order.status === 'cancelled' || order.status === 'expired') {
          if (pollRef.current) clearInterval(pollRef.current)
        } else if (attempts > 120) {
          // Stop after 10 minutes
          if (pollRef.current) clearInterval(pollRef.current)
        }
      } catch {
        // Silently retry
      }
    }, 4000)
  }

  const handleCopyKey = async () => {
    try {
      await navigator.clipboard.writeText(licenseKey)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = licenseKey
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const containerStyle: React.CSSProperties = {
    maxWidth: 'min(100vw - 32px, 420px)',
    margin: '0 auto',
    padding: '24px 16px',
  }

  if (loading && step === 1) {
    return <div style={containerStyle}><p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</p></div>
  }

  if (error && step === 1) {
    return (
      <div style={containerStyle}>
        <div style={{ color: 'var(--danger)', textAlign: 'center', padding: 40 }}>{error}</div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/app/center')}>返回会员中心</button>
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {/* Step indicator */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginBottom: 32 }}>
        {[1, 2, 3, 4].map(s => (
          <div key={s} style={{
            width: 28, height: 28, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 600,
            background: s <= step ? 'var(--primary)' : 'var(--bg-secondary)',
            color: s <= step ? '#fff' : 'var(--text-secondary)',
            transition: 'background 0.2s',
          }}>{s}</div>
        ))}
      </div>

      {/* ── Step 1: Select plan ── */}
      {step === 1 && (
        <>
          <h2 style={{ textAlign: 'center', marginBottom: 8 }}>选择套餐</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
            选择适合您的套餐方案
          </p>
          {error && <div style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: 12, fontSize: 13 }}>{error}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {plans.map(plan => {
              const selected = selectedPlan?.id === plan.id
              return (
                <div
                  key={plan.id}
                  onClick={() => handleSelectPlan(plan)}
                  style={{
                    border: `2px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
                    borderRadius: 12,
                    padding: '20px 16px',
                    cursor: 'pointer',
                    background: selected ? 'var(--bg-hover)' : 'var(--bg)',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{plan.name}</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>
                      ¥{plan.price_yuan}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    有效期: {durationLabel(plan.duration_days)}
                  </div>
                  {plan.features.length > 0 && (
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                      {plan.features.map((f, i) => (
                        <li key={i}>{f}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
          {selectedPlan && (
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 20 }}
              onClick={() => setStep(2)}
            >
              下一步 — ¥{selectedPlan.price_yuan}
            </button>
          )}
        </>
      )}

      {/* ── Step 2: Phone + Confirm ── */}
      {step === 2 && selectedPlan && (
        <>
          <h2 style={{ textAlign: 'center', marginBottom: 8 }}>确认订单</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 24 }}>
            填写手机号以接收激活码
          </p>

          <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-secondary)' }}>套餐</span>
              <span style={{ fontWeight: 600 }}>{selectedPlan.name}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ color: 'var(--text-secondary)' }}>有效期</span>
              <span>{durationLabel(selectedPlan.duration_days)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>金额</span>
              <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: 18 }}>¥{selectedPlan.price_yuan}</span>
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>手机号</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="请输入您的手机号"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', fontSize: 14,
                background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && <div style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: 12, fontSize: 13 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setStep(1); setError('') }}>
              返回
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={handleSubmitOrder}
              disabled={loading || !phone.trim()}
            >
              {loading ? '提交中...' : '确认并前往付款'}
            </button>
          </div>
        </>
      )}

      {/* ── Step 3: Pay ── */}
      {step === 3 && (
        <>
          <h2 style={{ textAlign: 'center', marginBottom: 8 }}>扫码付款</h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
            请使用微信或支付宝扫描下方二维码付款
          </p>

          <div style={{
            background: 'var(--bg-secondary)', borderRadius: 12, padding: 16,
            textAlign: 'center', marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>应付金额</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--primary)' }}>¥{amountYuan.toFixed(2)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              订单号: {orderNo.slice(0, 8)}...
            </div>
          </div>

          {/* Payment method tabs */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 16 }}>
            <button
              onClick={() => setShowWechat(true)}
              style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                borderRadius: '8px 0 0 8px', fontSize: 14, fontWeight: 600,
                background: showWechat ? '#07C160' : 'var(--bg-secondary)',
                color: showWechat ? '#fff' : 'var(--text-secondary)',
              }}
            >
              微信支付
            </button>
            <button
              onClick={() => setShowWechat(false)}
              style={{
                flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer',
                borderRadius: '0 8px 8px 0', fontSize: 14, fontWeight: 600,
                background: !showWechat ? '#1677FF' : 'var(--bg-secondary)',
                color: !showWechat ? '#fff' : 'var(--text-secondary)',
              }}
            >
              支付宝
            </button>
          </div>

          {/* QR code image */}
          <div style={{
            textAlign: 'center', marginBottom: 20,
            border: '1px solid var(--border)', borderRadius: 12,
            padding: 16, background: '#fff',
          }}>
            {(showWechat ? qrcodes.wechat : qrcodes.alipay) ? (
              <img
                src={showWechat ? qrcodes.wechat : qrcodes.alipay}
                alt={showWechat ? '微信收款码' : '支付宝收款码'}
                style={{ width: '100%', maxWidth: 280, height: 'auto' }}
              />
            ) : (
              <div style={{ padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
                收款码暂未配置，请联系管理员
              </div>
            )}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>转账单号</label>
            <input
              type="text"
              value={paymentRef}
              onChange={e => setPaymentRef(e.target.value)}
              placeholder="请输入微信/支付宝转账单号"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 8,
                border: '1px solid var(--border)', fontSize: 14,
                background: 'var(--bg)', color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
              付款后请在微信/支付宝的账单详情中查看转账单号
            </div>
          </div>

          {payError && <div style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: 12, fontSize: 13 }}>{payError}</div>}

          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={handleSubmitPaymentRef}
            disabled={paySaving || !paymentRef.trim()}
          >
            {paySaving ? '提交中...' : '已完成付款，提交转账单号'}
          </button>
        </>
      )}

      {/* ── Step 4: Waiting / Result ── */}
      {step === 4 && (
        <>
          <h2 style={{ textAlign: 'center', marginBottom: 8 }}>
            {licenseKey ? '购买成功' : (orderStatus === 'cancelled' ? '订单已驳回' : (orderStatus === 'expired' ? '订单已过期' : '等待审核'))}
          </h2>

          {!licenseKey && orderStatus !== 'cancelled' && orderStatus !== 'expired' && (
            <>
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  border: '3px solid var(--primary)',
                  borderTopColor: 'transparent',
                  animation: 'spin 1s linear infinite',
                  margin: '0 auto 16px',
                }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                  管理员正在审核您的付款，请稍候...
                </p>
                <p style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 4 }}>
                  订单号: {orderNo.slice(0, 8)}...
                </p>
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </>
          )}

          {licenseKey && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🎉</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>
                {planName} 已激活，请复制您的激活码
              </p>
              <div style={{
                background: 'var(--bg-secondary)', borderRadius: 12, padding: 16,
                marginBottom: 16, wordBreak: 'break-all',
              }}>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>激活码</div>
                <div style={{
                  fontSize: 16, fontWeight: 700, fontFamily: 'monospace',
                  userSelect: 'all',
                }}>
                  {licenseKey}
                </div>
              </div>
              <button
                className={copied ? 'btn btn-ghost' : 'btn btn-primary'}
                style={{ width: '100%' }}
                onClick={handleCopyKey}
              >
                {copied ? '已复制!' : '复制激活码'}
              </button>
              <button
                className="btn btn-ghost"
                style={{ width: '100%', marginTop: 8 }}
                onClick={() => navigate('/app/center')}
              >
                返回会员中心
              </button>
            </div>
          )}

          {(orderStatus === 'cancelled' || orderStatus === 'expired') && (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>😞</div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
                {orderStatus === 'cancelled' ? '您的订单已被管理员驳回，如有疑问请联系管理员。' : '订单超时未付款，请重新下单。'}
              </p>
              <button
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => { setStep(1); setSelectedPlan(null); setPhone(''); setOrderNo(''); }}
              >
                重新购买
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
