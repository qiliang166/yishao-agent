import { useEffect, useState } from 'react'
import { api } from '../services/api'

interface PaymentRecord {
  id: string
  plan_name: string
  amount_cents: number
  duration_days: number
  payment_method: string
  payment_ref: string
  status: string
  note: string
  paid_at: string
}

function methodLabel(m: string): string {
  return m === 'wechat' ? '微信支付' : m === 'alipay' ? '支付宝' : m || '—'
}

function statusLabel(s: string): { text: string; color: string } {
  if (s === 'confirmed') return { text: '已确认', color: 'var(--success)' }
  if (s === 'pending') return { text: '待审核', color: '#f0ad4e' }
  return { text: s || '—', color: 'var(--text-secondary)' }
}

export default function PaymentHistoryDialog({ user, onClose }: {
  user: { id: string; username: string; display_name: string } | null
  onClose: () => void
}) {
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    setLoading(true)
    setError('')
    api.listPayments(user.id)
      .then(data => {
        if (cancelled) return
        setPayments(data != null && Array.isArray(data.payments) ? data.payments : [])
      })
      .catch((e: any) => { if (!cancelled) setError(e?.message || '加载付款记录失败') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [user])

  if (!user) return null

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-box" style={{ width: 480, maxHeight: '75vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="dialog-title">付款明细 — {user.display_name} @{user.username}</div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)', fontSize: 12 }}>加载中...</div>
        ) : error ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--warning)', fontSize: 12 }}>{error}</div>
        ) : payments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)', fontSize: 12 }}>暂无付款记录</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {payments.map(p => {
              const st = statusLabel(p.status)
              return (
                <div key={p.id} style={{
                  border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
                  fontSize: 12, lineHeight: 1.8,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>
                      {p.plan_name || '—'} ￥{(p.amount_cents / 100).toFixed(2)}
                      {p.duration_days > 0 && (
                        <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 6 }}>
                          / {p.duration_days} 天
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: st.color }}>{st.text}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {methodLabel(p.payment_method)} · 单号 {p.payment_ref || '—'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {p.paid_at ? new Date(p.paid_at + (p.paid_at.includes('Z') ? '' : 'Z')).toLocaleString('zh-CN') : '—'}
                  </div>
                  {p.note && (
                    <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 2 }}>
                      备注：{p.note}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}
