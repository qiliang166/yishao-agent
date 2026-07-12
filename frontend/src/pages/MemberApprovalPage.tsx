import { useState, useEffect } from 'react'
import { api } from '../services/api'

interface PaymentInfo {
  plan_name: string
  amount_cents: number
  duration_days: number
  payment_method: string
  payment_ref: string
}

interface PendingMember {
  id: string
  username: string
  display_name: string
  email: string
  phone: string
  is_approved: number
  created_at: string
  payment: PaymentInfo | null
}

interface PendingUpgrade {
  id: string
  username: string
  display_name: string
  email: string
  phone: string
  created_at: string
  expires_at: string | null
  is_approved: number
  payment: PaymentInfo | null
}

function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2)
}

function paymentMethodLabel(m: string): string {
  return m === 'wechat' ? '微信支付' : m === 'alipay' ? '支付宝' : m || '—'
}

export default function MemberApprovalPage() {
  const [members, setMembers] = useState<PendingMember[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [approveId, setApproveId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [durationDays, setDurationDays] = useState(7)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  // Pending upgrades
  const [upgrades, setUpgrades] = useState<PendingUpgrade[]>([])
  const [upgradeLoading, setUpgradeLoading] = useState(true)
  const [approveUpgradeId, setApproveUpgradeId] = useState<string | null>(null)

  const pageSize = 20

  const loadMembers = () => {
    setLoading(true)
    api.listPendingMembers(page, pageSize)
      .then(data => {
        setMembers(data.members as PendingMember[])
        setTotal(data.total)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  const loadUpgrades = () => {
    setUpgradeLoading(true)
    api.listPendingUpgrades()
      .then(data => setUpgrades(data.members as PendingUpgrade[]))
      .catch(() => {})
      .finally(() => setUpgradeLoading(false))
  }

  useEffect(() => { loadMembers() }, [page])
  useEffect(() => { loadUpgrades() }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const getSelectedMember = () => members.find(m => m.id === approveId)

  const handleApprove = async () => {
    if (!approveId) return
    setActionLoading(true)
    setError('')
    try {
      await api.approveMember(approveId, durationDays)
      showToast('审批通过')
      setApproveId(null)
      setDurationDays(7)
      loadMembers()
    } catch (e: any) {
      setError(e.message || '操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectId) return
    setActionLoading(true)
    setError('')
    try {
      await api.rejectMember(rejectId, rejectReason)
      showToast('已拒绝')
      setRejectId(null)
      setRejectReason('')
      loadMembers()
    } catch (e: any) {
      setError(e.message || '操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleApproveUpgrade = async () => {
    if (!approveUpgradeId) return
    setActionLoading(true)
    setError('')
    try {
      await api.approveUpgrade(approveUpgradeId)
      showToast('升级审批通过')
      setApproveUpgradeId(null)
      loadUpgrades()
    } catch (e: any) {
      setError(e.message || '操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  const openApprove = (m: PendingMember) => {
    setApproveId(m.id)
    setDurationDays(m.payment ? (m.payment.duration_days || 90) : 7)
    setError('')
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const selectedMember = getSelectedMember()
  const selectedUpgrade = upgrades.find(u => u.id === approveUpgradeId)

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px 0' }}>会员审批</h1>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: 'var(--primary)', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      {/* ── Pending Upgrades ── */}
      {upgrades.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>
            待审批升级 ({upgrades.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upgrades.map((u) => (
              <div
                key={u.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderLeft: '3px solid var(--primary)',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>
                    {u.display_name}
                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8, fontSize: 12 }}>
                      @{u.username}
                    </span>
                    <span style={{
                      marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', fontWeight: 600,
                    }}>
                      申请升级
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {u.email || '无邮箱'}{u.phone ? ` · ${u.phone}` : ''} · 注册于 {new Date(u.created_at).toLocaleString('zh-CN')}
                  </div>
                  {u.expires_at && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      会员到期：{new Date(u.expires_at).toLocaleDateString('zh-CN')}
                    </div>
                  )}
                  {u.payment && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      付款单号：{u.payment.payment_ref || '—'} · {paymentMethodLabel(u.payment.payment_method)} · ￥{formatAmount(u.payment.amount_cents)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => { setApproveUpgradeId(u.id); setError('') }}
                  >
                    通过升级
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pending Members ── */}
      <h2 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>
        待审批会员
      </h2>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
      ) : members.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 64,
          color: 'var(--text-secondary)', fontSize: 12,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <p>全部已处理</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map((m) => (
              <div
                key={m.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>
                    {m.display_name}
                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8, fontSize: 12 }}>
                      @{m.username}
                    </span>
                    {m.payment ? (
                      <span style={{
                        marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(59,130,246,0.1)', color: 'var(--primary)', fontWeight: 600,
                      }}>
                        付费
                      </span>
                    ) : (
                      <span style={{
                        marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(148,163,184,0.1)', color: 'var(--text-secondary)', fontWeight: 600,
                      }}>
                        试用
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {m.email || '无邮箱'}{m.phone ? ` · ${m.phone}` : ''} · 注册于 {new Date(m.created_at).toLocaleString('zh-CN')}
                  </div>
                  {m.payment && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      付款单号：{m.payment.payment_ref || '—'} · {paymentMethodLabel(m.payment.payment_method)} · ￥{formatAmount(m.payment.amount_cents)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => openApprove(m)}
                  >
                    通过
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setRejectId(m.id); setRejectReason(''); setError('') }}
                    style={{ color: 'var(--warning)' }}
                  >
                    拒绝
                  </button>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                上一页
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>
                {page} / {totalPages}
              </span>
              <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                下一页
              </button>
            </div>
          )}
        </>
      )}

      {/* Approve Member Dialog */}
      {approveId && selectedMember && (
        <div className="dialog-overlay" onClick={() => setApproveId(null)}>
          <div className="dialog-box" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">审批通过</div>

            <div style={{
              background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 16,
              fontSize: 12, lineHeight: 1.8,
            }}>
              <div><strong>用户名：</strong>{selectedMember.username}</div>
              <div><strong>显示名：</strong>{selectedMember.display_name}</div>
              {selectedMember.email && <div><strong>邮箱：</strong>{selectedMember.email}</div>}
              {selectedMember.phone && <div><strong>手机号：</strong>{selectedMember.phone}</div>}
              <div><strong>注册时间：</strong>{new Date(selectedMember.created_at).toLocaleString('zh-CN')}</div>
            </div>

            {selectedMember.payment ? (
              <div style={{
                background: 'rgba(59,130,246,0.05)', borderRadius: 8, padding: 12, marginBottom: 16,
                border: '1px solid rgba(59,130,246,0.15)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--primary)' }}>
                  付款信息
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text)' }}>
                  <div>套餐：{selectedMember.payment.plan_name}</div>
                  <div>金额：￥{formatAmount(selectedMember.payment.amount_cents)}</div>
                  <div>支付方式：{paymentMethodLabel(selectedMember.payment.payment_method)}</div>
                  <div>付款单号：<strong>{selectedMember.payment.payment_ref || '—'}</strong></div>
                </div>
              </div>
            ) : (
              <div style={{
                background: 'rgba(148,163,184,0.05)', borderRadius: 8, padding: 12, marginBottom: 16,
                border: '1px solid var(--border)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  试用会员
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  无付款信息，通过后将分配"试用会员"角色（7 天到期，仅可查看）。
                </div>
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              通过后将自动分配"{selectedMember.payment ? '付费会员' : '试用会员'}"角色，设置到期时间并开放登录。
            </p>
            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              到期天数
            </label>
            <input
              className="form-input"
              type="number"
              min={1}
              max={3650}
              value={durationDays}
              onChange={e => setDurationDays(Number(e.target.value))}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }}
            />
            {error && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 10, textAlign: 'center' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setApproveId(null)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleApprove} disabled={actionLoading}>
                {actionLoading ? '处理中...' : '确认通过'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      {rejectId && (
        <div className="dialog-overlay" onClick={() => setRejectId(null)}>
          <div className="dialog-box" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">拒绝审批</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              拒绝后该会员将无法登录。可附带拒绝原因。
            </p>
            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              拒绝原因（可选）
            </label>
            <textarea
              className="form-input"
              rows={3}
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, resize: 'vertical' }}
            />
            {error && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 10, textAlign: 'center' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setRejectId(null)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleReject} disabled={actionLoading}
                style={{ background: 'var(--warning)', borderColor: 'var(--warning)' }}>
                {actionLoading ? '处理中...' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Upgrade Dialog */}
      {approveUpgradeId && selectedUpgrade && (
        <div className="dialog-overlay" onClick={() => setApproveUpgradeId(null)}>
          <div className="dialog-box" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">审批升级</div>

            <div style={{
              background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 16,
              fontSize: 12, lineHeight: 1.8,
            }}>
              <div><strong>用户名：</strong>{selectedUpgrade.username}</div>
              <div><strong>显示名：</strong>{selectedUpgrade.display_name}</div>
              {selectedUpgrade.email && <div><strong>邮箱：</strong>{selectedUpgrade.email}</div>}
              {selectedUpgrade.phone && <div><strong>手机号：</strong>{selectedUpgrade.phone}</div>}
              <div><strong>注册时间：</strong>{new Date(selectedUpgrade.created_at).toLocaleString('zh-CN')}</div>
              {selectedUpgrade.expires_at && (
                <div><strong>会员到期：</strong>{new Date(selectedUpgrade.expires_at).toLocaleDateString('zh-CN')}</div>
              )}
            </div>

            {selectedUpgrade.payment && (
              <div style={{
                background: 'rgba(139,92,246,0.05)', borderRadius: 8, padding: 12, marginBottom: 16,
                border: '1px solid rgba(139,92,246,0.15)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#8b5cf6' }}>
                  升级付款信息
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text)' }}>
                  <div>套餐：{selectedUpgrade.payment.plan_name}</div>
                  <div>金额：￥{formatAmount(selectedUpgrade.payment.amount_cents)}</div>
                  <div>升级天数：{selectedUpgrade.payment.duration_days} 天</div>
                  <div>支付方式：{paymentMethodLabel(selectedUpgrade.payment.payment_method)}</div>
                  <div>付款单号：<strong>{selectedUpgrade.payment.payment_ref || '—'}</strong></div>
                </div>
              </div>
            )}

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              通过后将为此会员分配"开发体验员"角色，拥有内容创建和编辑权限。升级有效期自动对齐会员到期时间。
            </p>

            {error && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 10, textAlign: 'center' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setApproveUpgradeId(null)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleApproveUpgrade} disabled={actionLoading}>
                {actionLoading ? '处理中...' : '确认通过升级'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
