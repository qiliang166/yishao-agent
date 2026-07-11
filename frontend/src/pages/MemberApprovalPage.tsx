import { useState, useEffect } from 'react'
import { api } from '../services/api'

interface PendingMember {
  id: string
  username: string
  display_name: string
  email: string
  is_approved: number
  created_at: string
}

export default function MemberApprovalPage() {
  const [members, setMembers] = useState<PendingMember[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [approveId, setApproveId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [durationDays, setDurationDays] = useState(30)
  const [rejectReason, setRejectReason] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

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

  useEffect(() => { loadMembers() }, [page])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const handleApprove = async () => {
    if (!approveId) return
    setActionLoading(true)
    setError('')
    try {
      await api.approveMember(approveId, durationDays)
      showToast('审批通过')
      setApproveId(null)
      setDurationDays(30)
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px 0' }}>会员审批</h1>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: 'var(--primary)', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
      ) : members.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 64,
          color: 'var(--text-secondary)', fontSize: 14,
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
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {m.display_name}
                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8, fontSize: 12 }}>
                      @{m.username}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {m.email} · 注册于 {new Date(m.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => { setApproveId(m.id); setDurationDays(30); setError('') }}
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

      {/* Approve Dialog */}
      {approveId && (
        <div className="dialog-overlay" onClick={() => setApproveId(null)}>
          <div className="dialog-box" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">审批通过</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
              通过后将自动分配"基础会员"角色，设置到期时间并开放登录。
            </p>
            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>
              首次到期天数
            </label>
            <input
              className="form-input"
              type="number"
              min={1}
              max={3650}
              value={durationDays}
              onChange={e => setDurationDays(Number(e.target.value))}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }}
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
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, resize: 'vertical' }}
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
    </div>
  )
}
