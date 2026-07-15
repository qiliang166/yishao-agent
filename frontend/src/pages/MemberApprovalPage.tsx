import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import PaymentHistoryDialog from '../components/PaymentHistoryDialog'

interface PaymentInfo {
  plan_name: string
  amount_cents: number
  duration_days: number
  payment_method: string
  payment_ref: string
}

interface MemberRow {
  id: string
  username: string
  display_name: string
  email: string
  phone: string
  is_approved: number
  created_at: string
  expires_at?: string | null

  payment?: PaymentInfo | null
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

type StatusFilter = 'pending' | 'approved' | 'rejected' | 'all'

const FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'pending', label: '待审批' },
  { key: 'approved', label: '已通过' },
  { key: 'rejected', label: '已拒绝' },
  { key: 'all', label: '全部' },
]

function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2)
}

function paymentMethodLabel(m: string): string {
  return m === 'wechat' ? '微信支付' : m === 'alipay' ? '支付宝' : m || '—'
}

function statusBadge(isApproved: number) {
  const map: Record<number, { text: string; bg: string; color: string }> = {
    0: { text: '待审批', bg: 'rgba(240,173,78,0.12)', color: '#f0ad4e' },
    1: { text: '已通过', bg: 'rgba(92,184,92,0.12)', color: '#5cb85c' },
    2: { text: '已拒绝', bg: 'rgba(217,83,79,0.12)', color: 'var(--warning)' },
  }
  const s = map[isApproved] || map[0]
  return (
    <span style={{
      marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4,
      background: s.bg, color: s.color, fontWeight: 600,
    }}>
      {s.text}
    </span>
  )
}

export default function MemberApprovalPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [approveId, setApproveId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [durationDays, setDurationDays] = useState(7)
  const [approveNote, setApproveNote] = useState('')
  const [pointsGranted, setPointsGranted] = useState<number>(0)  // deci
  const [pointsPerYuan, setPointsPerYuan] = useState<number>(1.0)
  const [upgradePointsGranted, setUpgradePointsGranted] = useState<number>(0)  // deci
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [payHistUser, setPayHistUser] = useState<MemberRow | null>(null)

  // Pending upgrades
  const [upgrades, setUpgrades] = useState<PendingUpgrade[]>([])
  const [upgradeLoading, setUpgradeLoading] = useState(true)
  const [approveUpgradeId, setApproveUpgradeId] = useState<string | null>(null)
  const [rejectUpgradeId, setRejectUpgradeId] = useState<string | null>(null)
  const [rejectUpgradeReason, setRejectUpgradeReason] = useState('')

  // Pending renewals
  const [renewals, setRenewals] = useState<any[]>([])
  const [renewalLoading, setRenewalLoading] = useState(true)
  const [approveRenewalTarget, setApproveRenewalTarget] = useState<any | null>(null)
  const [renewalPointsGranted, setRenewalPointsGranted] = useState<number>(0)

  const pageSize = 20

  const loadMembers = useCallback(async () => {
    setLoading(true)
    try {
      if (statusFilter === 'pending') {
        const data = await api.listPendingMembers(page, pageSize)
        if (data != null && Array.isArray(data.members)) {
          setMembers(data.members as MemberRow[])
          setTotal(Number(data.total) || 0)
        } else {
          setMembers([]); setTotal(0)
        }
      } else {
        const data = await api.listUsers({
          user_type: 'member',
          status: statusFilter === 'all' ? undefined : statusFilter,
          page, page_size: pageSize,
        }) as any
        if (data != null && Array.isArray(data.users)) {
          setMembers(data.users as MemberRow[])
          setTotal(Number(data.total) || 0)
        } else {
          setMembers([]); setTotal(0)
        }
      }
    } catch {
      setMembers([]); setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, page])

  const loadUpgrades = () => {
    setUpgradeLoading(true)
    api.listPendingUpgrades()
      .then(data => setUpgrades(data.members as PendingUpgrade[]))
      .catch(() => {})
      .finally(() => setUpgradeLoading(false))
  }

  const loadRenewals = () => {
    setRenewalLoading(true)
    api.listPendingRenewals()
      .then(data => setRenewals(data.members as any[] || []))
      .catch(() => {})
      .finally(() => setRenewalLoading(false))
  }

  useEffect(() => { loadMembers() }, [loadMembers])
  useEffect(() => { loadUpgrades() }, [])
  useEffect(() => { loadRenewals() }, [])

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
      const result = await api.approveMember(approveId, durationDays, approveNote.trim(),
        pointsGranted > 0 ? pointsGranted : undefined)
      if (result == null) { setError('操作失败：服务器未确认'); return }
      showToast('审批通过')
      setApproveId(null)
      setDurationDays(7)
      setApproveNote('')
      setPointsGranted(0)
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
      const result = await api.rejectMember(rejectId, rejectReason)
      if (result == null) { setError('操作失败：服务器未确认'); return }
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
      const result = await api.approveUpgrade(approveUpgradeId, upgradePointsGranted > 0 ? upgradePointsGranted : undefined)
      if (result == null) { setError('操作失败：服务器未确认'); return }
      showToast('升级审批通过')
      setApproveUpgradeId(null)
      setUpgradePointsGranted(0)
      loadUpgrades()
    } catch (e: any) {
      setError(e.message || '操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleApproveRenewal = async () => {
    if (!approveRenewalTarget) return
    setActionLoading(true)
    setError('')
    try {
      const result = await api.approveRenewal(approveRenewalTarget.user_id, renewalPointsGranted > 0 ? renewalPointsGranted : undefined)
      if (result == null) { setError('操作失败：服务器未确认'); return }
      showToast(`续费审批通过 — ${result.plan_name}，获 ${(result.points_granted_deci / 10).toFixed(1)} 积分`)
      setApproveRenewalTarget(null)
      loadRenewals()
    } catch (e: any) {
      setError(e.message || '操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleRejectUpgrade = async () => {
    if (!rejectUpgradeId) return
    setActionLoading(true)
    setError('')
    try {
      const result = await api.rejectUpgrade(rejectUpgradeId, rejectUpgradeReason.trim())
      if (result == null) { setError('操作失败：服务器未确认'); return }
      showToast('已拒绝升级申请')
      setRejectUpgradeId(null)
      setRejectUpgradeReason('')
      loadUpgrades()
    } catch (e: any) {
      setError(e.message || '操作失败')
    } finally {
      setActionLoading(false)
    }
  }

  // Load points-per-yuan rate on mount
  useEffect(() => {
    api.getSettings().then((data: any) => {
      const s = data?.settings || {}
      if (s.points_per_yuan) setPointsPerYuan(parseFloat(s.points_per_yuan) || 1.0)
    }).catch(() => {})
  }, [])

  const openApprove = (m: MemberRow) => {
    setApproveId(m.id)
    setDurationDays(m.payment ? (m.payment.duration_days || 90) : 7)
    setApproveNote('')
    setError('')
    // Calculate default points from payment amount
    if (m.payment && m.payment.amount_cents > 0) {
      setPointsGranted(Math.round(m.payment.amount_cents / 100.0 * pointsPerYuan * 10))
    } else {
      setPointsGranted(0)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const selectedMember = getSelectedMember()
  const selectedUpgrade = upgrades.find(u => u.id === approveUpgradeId)

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 16px 0' }}>会员审批</h1>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: 'var(--primary)', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      {/* ── Status Filter Tabs ── */}
      <div style={{ display: 'flex', marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {FILTER_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setStatusFilter(t.key); setPage(1) }}
            style={{
              padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: statusFilter === t.key ? 700 : 400,
              color: statusFilter === t.key ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: statusFilter === t.key ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Pending Upgrades (only under pending filter) ── */}
      {statusFilter === 'pending' && upgrades.length > 0 && (
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
                      {u.username}
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
                      交易单号：{u.payment.payment_ref || '—'} · {paymentMethodLabel(u.payment.payment_method)} · ￥{formatAmount(u.payment.amount_cents)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setApproveUpgradeId(u.id)
                      setError('')
                      if (u.payment && u.payment.amount_cents > 0) {
                        setUpgradePointsGranted(Math.round(u.payment.amount_cents / 100.0 * pointsPerYuan * 10))
                      } else {
                        setUpgradePointsGranted(0)
                      }
                    }}
                  >
                    通过升级
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => { setRejectUpgradeId(u.id); setRejectUpgradeReason(''); setError('') }}
                    style={{ color: 'var(--warning)' }}
                  >
                    拒绝
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Pending Renewals (only under pending filter) ── */}
      {statusFilter === 'pending' && renewals.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>
            待审批续费 ({renewals.length})
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {renewals.map((r) => (
              <div key={r.payment_id} className="card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>
                    {r.display_name}
                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8, fontSize: 12 }}>
                      {r.username}
                    </span>
                    <span style={{
                      marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4,
                      background: 'rgba(240,173,78,0.1)', color: '#f0ad4e', fontWeight: 600,
                    }}>
                      待审核续费
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {r.email || '无邮箱'}{r.phone ? ` · ${r.phone}` : ''} · 注册于 {new Date(r.created_at).toLocaleString('zh-CN')}
                  </div>
                  {r.expires_at && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      当前到期：{new Date(r.expires_at).toLocaleDateString('zh-CN')}
                    </div>
                  )}
                  {r.payment && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      续费套餐：{r.payment.plan_name} · ￥{formatAmount(r.payment.amount_cents)} · {r.payment.duration_days}天
                      · 单号：{r.payment.payment_ref || '—'}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      setApproveRenewalTarget(r)
                      setError('')
                      if (r.payment && r.payment.amount_cents > 0) {
                        setRenewalPointsGranted(Math.round(r.payment.amount_cents / 100.0 * pointsPerYuan * 10))
                      } else {
                        setRenewalPointsGranted(0)
                      }
                    }}
                    disabled={actionLoading}
                  >
                    确认收款
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPayHistUser({ id: r.user_id, username: r.username, display_name: r.display_name } as MemberRow)}
                  >
                    明细
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Members ── */}
      <h2 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>
        {statusFilter === 'pending' ? '待审批会员' : statusFilter === 'approved' ? '已通过会员' : statusFilter === 'rejected' ? '已拒绝会员' : '全部会员'}
        {statusFilter !== 'pending' && total > 0 && ` (${total})`}
      </h2>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
      ) : members.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 64,
          color: 'var(--text-secondary)', fontSize: 12,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{statusFilter === 'pending' ? '✅' : '📭'}</div>
          <p>{statusFilter === 'pending' ? '全部已处理' : '暂无记录'}</p>
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
                      {m.username}
                    </span>
                    {statusFilter === 'pending' ? (
                      <>
                        {m.expires_at ? (
                          <span style={{
                            marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(59,130,246,0.08)', color: 'var(--primary)', fontWeight: 600,
                          }}>
                            续费
                          </span>
                        ) : (
                          <span style={{
                            marginLeft: 8, fontSize: 11, padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(148,163,184,0.1)', color: 'var(--text-secondary)', fontWeight: 600,
                          }}>
                            新注册
                          </span>
                        )}
                        {m.payment ? (
                          <span style={{
                            marginLeft: 4, fontSize: 11, padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(59,130,246,0.1)', color: 'var(--primary)', fontWeight: 600,
                          }}>
                            付费
                          </span>
                        ) : (
                          <span style={{
                            marginLeft: 4, fontSize: 11, padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(148,163,184,0.1)', color: 'var(--text-secondary)', fontWeight: 600,
                          }}>
                            试用
                          </span>
                        )}
                      </>
                    ) : (
                      statusBadge(m.is_approved)
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {m.email || '无邮箱'}{m.phone ? ` · ${m.phone}` : ''} · 注册于 {new Date(m.created_at).toLocaleString('zh-CN')}
                  </div>
                  {m.expires_at && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      {statusFilter === 'pending' ? '原到期：' : '会员到期：'}
                      {new Date(m.expires_at).toLocaleDateString('zh-CN')}
                    </div>
                  )}
                  {m.payment && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                      交易单号：{m.payment.payment_ref || '—'} · {paymentMethodLabel(m.payment.payment_method)} · ￥{formatAmount(m.payment.amount_cents)}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {m.is_approved === 0 && statusFilter === 'pending' && (
                    <>
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
                    </>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setPayHistUser(m)}
                  >
                    明细
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

      {/* Reject Upgrade Dialog */}
      {rejectUpgradeId && (
        <div className="dialog-overlay" onClick={() => setRejectUpgradeId(null)}>
          <div className="dialog-box" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">拒绝升级申请</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              驳回后将标记升级付款记录为已处理，会员状态不受影响。
            </p>
            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              拒绝原因（可选）
            </label>
            <textarea
              className="form-input"
              rows={3}
              value={rejectUpgradeReason}
              onChange={e => setRejectUpgradeReason(e.target.value)}
              placeholder="如：查不到订单编号"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, resize: 'vertical' }}
            />
            {error && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 10, textAlign: 'center' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setRejectUpgradeId(null)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleRejectUpgrade} disabled={actionLoading}
                style={{ background: 'var(--warning)', borderColor: 'var(--warning)' }}>
                {actionLoading ? '处理中...' : '确认拒绝'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Dialog */}
      <PaymentHistoryDialog user={payHistUser} onClose={() => setPayHistUser(null)} />

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
                  <div>交易单号：<strong>{selectedMember.payment.payment_ref || '—'}</strong></div>
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
            {selectedMember.payment && selectedMember.payment.amount_cents > 0 && (
              <>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 12 }}>
                  获得积分
                </label>
                <input
                  className="form-input"
                  type="number"
                  step="0.1"
                  min={0}
                  value={pointsGranted / 10}
                  onChange={e => setPointsGranted(Math.round(parseFloat(e.target.value || '0') * 10))}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }}
                />
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                  默认 {pointsPerYuan} 积分/元，￥{formatAmount(selectedMember.payment.amount_cents)} × {pointsPerYuan} = {(selectedMember.payment.amount_cents / 100.0 * pointsPerYuan).toFixed(1)} 积分
                </div>
              </>
            )}
            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 12 }}>
              审批意见（可选）
            </label>
            <textarea
              className="form-input"
              rows={2}
              value={approveNote}
              onChange={e => setApproveNote(e.target.value)}
              placeholder="可填写审批说明，将显示在审批记录中"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, resize: 'vertical' }}
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
              驳回此申请。拒绝原因将记录在付款明细中。如为新注册申请，会员将无法登录。
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
                  <div>交易单号：<strong>{selectedUpgrade.payment.payment_ref || '—'}</strong></div>
                </div>
              </div>
            )}

            {selectedUpgrade.payment && selectedUpgrade.payment.amount_cents > 0 && (
              <>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  获得积分
                </label>
                <input
                  className="form-input"
                  type="number"
                  step="0.1"
                  min={0}
                  value={upgradePointsGranted / 10}
                  onChange={e => setUpgradePointsGranted(Math.round(parseFloat(e.target.value || '0') * 10))}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }}
                />
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, marginBottom: 12 }}>
                  默认 {pointsPerYuan} 积分/元，￥{formatAmount(selectedUpgrade.payment.amount_cents)} × {pointsPerYuan} = {(selectedUpgrade.payment.amount_cents / 100.0 * pointsPerYuan).toFixed(1)} 积分
                </div>
              </>
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

      {/* Approve Renewal Dialog */}
      {approveRenewalTarget && (
        <div className="dialog-overlay" onClick={() => setApproveRenewalTarget(null)}>
          <div className="dialog-box" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">续费审批</div>

            <div style={{
              background: '#f8fafc', borderRadius: 8, padding: 12, marginBottom: 16,
              fontSize: 12, lineHeight: 1.8,
            }}>
              <div><strong>用户名：</strong>{approveRenewalTarget.username}</div>
              <div><strong>显示名：</strong>{approveRenewalTarget.display_name}</div>
              {approveRenewalTarget.email && <div><strong>邮箱：</strong>{approveRenewalTarget.email}</div>}
              {approveRenewalTarget.phone && <div><strong>手机号：</strong>{approveRenewalTarget.phone}</div>}
              <div><strong>注册时间：</strong>{new Date(approveRenewalTarget.created_at).toLocaleString('zh-CN')}</div>
              {approveRenewalTarget.expires_at && (
                <div><strong>当前到期：</strong>{new Date(approveRenewalTarget.expires_at).toLocaleDateString('zh-CN')}</div>
              )}
            </div>

            {approveRenewalTarget.payment && (
              <div style={{
                background: 'rgba(240,173,78,0.05)', borderRadius: 8, padding: 12, marginBottom: 16,
                border: '1px solid rgba(240,173,78,0.2)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#f0ad4e' }}>
                  续费付款信息
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text)' }}>
                  <div>套餐：{approveRenewalTarget.payment.plan_name}</div>
                  <div>金额：￥{formatAmount(approveRenewalTarget.payment.amount_cents)}</div>
                  <div>续期天数：{approveRenewalTarget.payment.duration_days} 天</div>
                  <div>单号：<strong>{approveRenewalTarget.payment.payment_ref || '—'}</strong></div>
                </div>
              </div>
            )}

            {approveRenewalTarget.payment && approveRenewalTarget.payment.amount_cents > 0 && (
              <>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  获得积分
                </label>
                <input
                  className="form-input"
                  type="number"
                  step="0.1"
                  min={0}
                  value={renewalPointsGranted / 10}
                  onChange={e => setRenewalPointsGranted(Math.round(parseFloat(e.target.value || '0') * 10))}
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }}
                />
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, marginBottom: 12 }}>
                  默认 {pointsPerYuan} 积分/元，￥{formatAmount(approveRenewalTarget.payment.amount_cents)} × {pointsPerYuan} = {(approveRenewalTarget.payment.amount_cents / 100.0 * pointsPerYuan).toFixed(1)} 积分
                </div>
              </>
            )}

            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              确认收款后将自动延长会员有效期并发放积分。
            </p>

            {error && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 10, textAlign: 'center' }}>{error}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setApproveRenewalTarget(null)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleApproveRenewal} disabled={actionLoading}>
                {actionLoading ? '处理中...' : '确认收款'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
