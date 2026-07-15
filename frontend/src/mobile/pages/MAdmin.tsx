import { useCallback, useEffect, useState } from 'react'
import { api } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { MTopBar, mToast } from '../MobileApp'

const PAGE_SIZE = 20

const fmtDate = (v?: string | null) => {
  if (!v) return '永久'
  try {
    return new Date(v).toLocaleDateString('zh-CN')
  } catch {
    return String(v)
  }
}

const fmtYuan = (cents?: number | null) => {
  if (cents == null) return ''
  return `￥${(cents / 100).toFixed(2)}`
}

const payLabel = (m?: string | null) => {
  if (m === 'wechat') return '微信支付'
  if (m === 'alipay') return '支付宝'
  return m || '其他'
}

// 底部弹层容器
function MSheet({ title, onClose, children }: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="m-sheet-mask" onClick={onClose}>
      <div className="m-sheet" onClick={e => e.stopPropagation()}>
        <div className="m-sheet-title">{title}</div>
        {children}
      </div>
    </div>
  )
}

export default function MAdmin() {
  const { user } = useAuth()
  const canMember = user?.user_type === 'admin' && !!user?.permissions?.includes('member.manage')
  const canGlobal = !!user?.permissions?.includes('config.global')

  const [tab, setTab] = useState<'member' | 'admin' | 'pending' | 'plan'>('member')

  // ── 会员/管理员列表 ──
  const [users, setUsers] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)

  // ── 待审批 ──
  const [upgrades, setUpgrades] = useState<any[]>([])
  const [pending, setPending] = useState<any[]>([])
  const [pendingPage, setPendingPage] = useState(1)
  const [pendingTotal, setPendingTotal] = useState(0)
  const [upgradeTotal, setUpgradeTotal] = useState(0)
  const [pendingLoading, setPendingLoading] = useState(false)

  // ── 弹层 ──
  const [renewTarget, setRenewTarget] = useState<any | null>(null)
  const [renewPlan, setRenewPlan] = useState('标准套餐')
  const [renewYuan, setRenewYuan] = useState('29.90')
  const [renewDays, setRenewDays] = useState('90')
  const [renewMethod, setRenewMethod] = useState('wechat')
  const [renewNote, setRenewNote] = useState('')
  const [renewSubmitting, setRenewSubmitting] = useState(false)

  const [editTarget, setEditTarget] = useState<any | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editPassword, setEditPassword] = useState('')
  const [editSubmitting, setEditSubmitting] = useState(false)

  const [approveTarget, setApproveTarget] = useState<any | null>(null)
  const [approveDays, setApproveDays] = useState('7')
  const [approveSubmitting, setApproveSubmitting] = useState(false)

  const [rejectTarget, setRejectTarget] = useState<any | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejectSubmitting, setRejectSubmitting] = useState(false)

  const [busyUserId, setBusyUserId] = useState('')

  // ── 套餐设置 ──
  const [planLoaded, setPlanLoaded] = useState(false)
  const [qName, setQName] = useState('标准套餐')
  const [qPrice, setQPrice] = useState('29.90')
  const [qDays, setQDays] = useState('90')
  const [uName, setUName] = useState('体验管理员升级')
  const [uPrice, setUPrice] = useState('19.90')
  const [uDays, setUDays] = useState('30')
  const [qrWechat, setQrWechat] = useState('')
  const [qrAlipay, setQrAlipay] = useState('')
  const [planSaving, setPlanSaving] = useState(false)

  const loadUsers = useCallback(async (userType: string, p: number) => {
    setListLoading(true)
    try {
      const data = await api.listUsers({ user_type: userType, page: p, page_size: PAGE_SIZE }) as any
      if (data != null && Array.isArray(data.users)) {
        setUsers(data.users)
        setTotal(Number(data.total) || 0)
      } else {
        setUsers([])
        setTotal(0)
      }
    } catch (e: any) {
      mToast(`加载失败: ${e?.message || e}`, 'error')
    } finally {
      setListLoading(false)
    }
  }, [])

  const loadPending = useCallback(async (p: number) => {
    setPendingLoading(true)
    try {
      const up = await api.listPendingUpgrades()
      if (up != null && Array.isArray(up.members)) {
        setUpgrades(up.members)
        setUpgradeTotal(Number(up.total) || up.members.length)
      } else {
        setUpgrades([])
        setUpgradeTotal(0)
      }
      const pm = await api.listPendingMembers(p, PAGE_SIZE)
      if (pm != null && Array.isArray(pm.members)) {
        setPending(pm.members)
        setPendingTotal(Number(pm.total) || 0)
      } else {
        setPending([])
        setPendingTotal(0)
      }
    } catch (e: any) {
      mToast(`加载失败: ${e?.message || e}`, 'error')
    } finally {
      setPendingLoading(false)
    }
  }, [])

  const loadPlanSettings = useCallback(async () => {
    try {
      const data = await api.getSettings() as any
      const s = data?.settings || {}
      if (s.payment_qr_wechat) setQrWechat(s.payment_qr_wechat)
      if (s.payment_qr_alipay) setQrAlipay(s.payment_qr_alipay)
      if (s.member_plan) {
        try {
          const p = JSON.parse(s.member_plan)
          if (p?.quarterly != null) {
            if (p.quarterly.name) setQName(p.quarterly.name)
            if (p.quarterly.amount_cents != null) setQPrice((p.quarterly.amount_cents / 100).toFixed(2))
            if (p.quarterly.duration_days != null) setQDays(String(p.quarterly.duration_days))
          }
          if (p?.upgrade != null) {
            if (p.upgrade.name) setUName(p.upgrade.name)
            if (p.upgrade.amount_cents != null) setUPrice((p.upgrade.amount_cents / 100).toFixed(2))
            if (p.upgrade.duration_days != null) setUDays(String(p.upgrade.duration_days))
          }
        } catch {}
      }
      setPlanLoaded(true)
    } catch (e: any) {
      mToast(`设置加载失败: ${e?.message || e}`, 'error')
    }
  }, [])

  useEffect(() => {
    if (!canMember) return
    if (tab === 'member' || tab === 'admin') {
      loadUsers(tab, page)
    } else if (tab === 'pending') {
      loadPending(pendingPage)
    } else if (tab === 'plan' && !planLoaded) {
      loadPlanSettings()
    }
  }, [canMember, tab, page, pendingPage, planLoaded, loadUsers, loadPending, loadPlanSettings])

  // 进页时拉一次角标数
  useEffect(() => {
    if (!canMember) return
    loadPending(1)
  }, [canMember, loadPending])

  const handleToggleActive = async (u: any) => {
    const action = u.is_active === 0 ? '启用' : '停用'
    if (!window.confirm(`确定${action}用户「${u.display_name || u.username}」？`)) return
    setBusyUserId(u.id)
    try {
      const result = await api.toggleUserActive(u.id)
      if (result != null) {
        mToast(`已${action}`)
        await loadUsers(tab, page)
      }
    } catch (e: any) {
      mToast(`${action}失败: ${e?.message || e}`, 'error')
    } finally {
      setBusyUserId('')
    }
  }

  const handleDelete = async (u: any) => {
    if (!window.confirm(`确定删除用户「${u.display_name || u.username}」？该操作不可恢复，将同时删除其角色、工作区分配和付费记录。`)) return
    setBusyUserId(u.id)
    try {
      const result = await api.deleteUser(u.id) as any
      if (result != null) {
        mToast('已删除')
        await loadUsers(tab, page)
      } else {
        mToast('删除失败：服务器未确认', 'error')
      }
    } catch (e: any) {
      mToast(`删除失败: ${e?.message || e}`, 'error')
    } finally {
      setBusyUserId('')
    }
  }

  const openEdit = (u: any) => {
    setEditTarget(u)
    setEditName(u.display_name || '')
    setEditEmail(u.email || '')
    setEditPassword('')
  }

  const handleEditSubmit = async () => {
    if (editTarget == null) return
    if (!editName.trim()) {
      mToast('显示名不能为空', 'error')
      return
    }
    if (editPassword && editPassword.length < 8) {
      mToast('重置密码至少 8 位', 'error')
      return
    }
    setEditSubmitting(true)
    try {
      const result = await api.updateUser(editTarget.id, {
        display_name: editName.trim(),
        email: editEmail.trim(),
      })
      if (result == null) {
        mToast('保存失败：服务器未确认', 'error')
        return
      }
      if (editPassword) {
        const pw = await api.resetUserPassword(editTarget.id, editPassword) as any
        if (pw == null || !pw.ok) {
          mToast('资料已保存，但密码重置失败', 'error')
          return
        }
      }
      mToast(editPassword ? '已保存，密码已重置' : '已保存')
      setEditTarget(null)
      await loadUsers(tab, page)
    } catch (e: any) {
      mToast(`保存失败: ${e?.message || e}`, 'error')
    } finally {
      setEditSubmitting(false)
    }
  }

  const openRenew = (u: any) => {
    setRenewTarget(u)
    setRenewPlan(qName || '标准套餐')
    setRenewYuan(qPrice || '29.90')
    setRenewDays(qDays || '90')
    setRenewMethod('wechat')
    setRenewNote('')
  }

  const handleRenewSubmit = async () => {
    if (renewTarget == null) return
    const cents = Math.round(parseFloat(renewYuan) * 100)
    const days = parseInt(renewDays, 10)
    if (!renewPlan.trim() || !Number.isFinite(cents) || cents < 0 || !Number.isFinite(days) || days <= 0) {
      mToast('请填写有效的套餐名、金额和天数', 'error')
      return
    }
    setRenewSubmitting(true)
    try {
      const result = await api.recordPayment(renewTarget.id, {
        amount_cents: cents,
        plan_name: renewPlan.trim(),
        duration_days: days,
        payment_method: renewMethod,
        note: renewNote.trim() || undefined,
      })
      if (result != null && result.ok) {
        mToast(`续期成功，新到期时间：${fmtDate(result.expires_after)}`)
        setRenewTarget(null)
        await loadUsers(tab, page)
      } else {
        mToast('续期失败：服务器未确认', 'error')
      }
    } catch (e: any) {
      mToast(`续期失败: ${e?.message || e}`, 'error')
    } finally {
      setRenewSubmitting(false)
    }
  }

  const openApprove = (m: any) => {
    setApproveTarget(m)
    setApproveDays(String(m?.payment?.duration_days || 7))
  }

  const handleApprove = async () => {
    if (approveTarget == null) return
    const days = parseInt(approveDays, 10)
    if (!Number.isFinite(days) || days <= 0) {
      mToast('请填写有效天数', 'error')
      return
    }
    setApproveSubmitting(true)
    try {
      const result = await api.approveMember(approveTarget.id, days)
      if (result != null && result.ok) {
        mToast(`已通过，到期时间：${fmtDate(result.expires_at)}`)
        setApproveTarget(null)
        await loadPending(pendingPage)
      } else {
        mToast('审批失败：服务器未确认', 'error')
      }
    } catch (e: any) {
      mToast(`审批失败: ${e?.message || e}`, 'error')
    } finally {
      setApproveSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (rejectTarget == null) return
    setRejectSubmitting(true)
    try {
      const result = await api.rejectMember(rejectTarget.id, rejectReason.trim() || undefined)
      if (result != null && result.ok) {
        mToast('已拒绝')
        setRejectTarget(null)
        setRejectReason('')
        await loadPending(pendingPage)
      } else {
        mToast('操作失败：服务器未确认', 'error')
      }
    } catch (e: any) {
      mToast(`操作失败: ${e?.message || e}`, 'error')
    } finally {
      setRejectSubmitting(false)
    }
  }

  const handleApproveUpgrade = async (m: any) => {
    if (!window.confirm(`确定通过「${m.display_name || m.username}」的升级申请？`)) return
    setBusyUserId(m.id)
    try {
      const result = await api.approveUpgrade(m.id)
      if (result != null && result.ok) {
        mToast('升级已通过')
        await loadPending(pendingPage)
      } else {
        mToast('操作失败：服务器未确认', 'error')
      }
    } catch (e: any) {
      mToast(`操作失败: ${e?.message || e}`, 'error')
    } finally {
      setBusyUserId('')
    }
  }

  const handleQrUpload = (which: 'wechat' | 'alipay') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const v = typeof reader.result === 'string' ? reader.result : ''
      if (!v) {
        mToast('读取图片失败', 'error')
        return
      }
      which === 'wechat' ? setQrWechat(v) : setQrAlipay(v)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const handlePlanSave = async () => {
    const qc = Math.round(parseFloat(qPrice) * 100)
    const qd = parseInt(qDays, 10)
    const uc = Math.round(parseFloat(uPrice) * 100)
    const ud = parseInt(uDays, 10)
    if (!qName.trim() || !Number.isFinite(qc) || qc < 0 || !Number.isFinite(qd) || qd <= 0
      || !uName.trim() || !Number.isFinite(uc) || uc < 0 || !Number.isFinite(ud) || ud <= 0) {
      mToast('请填写有效的套餐名、价格和天数', 'error')
      return
    }
    setPlanSaving(true)
    try {
      const result = await api.updateSettings({
        member_plan: JSON.stringify({
          quarterly: { name: qName.trim(), amount_cents: qc, duration_days: qd },
          upgrade: { name: uName.trim(), amount_cents: uc, duration_days: ud },
        }),
        payment_qr_wechat: qrWechat,
        payment_qr_alipay: qrAlipay,
      })
      if (result != null) {
        mToast('保存成功')
      } else {
        mToast('保存失败：服务器未确认', 'error')
      }
    } catch (e: any) {
      mToast(`保存失败: ${e?.message || e}`, 'error')
    } finally {
      setPlanSaving(false)
    }
  }

  if (!canMember) {
    return (
      <>
        <MTopBar title="用户管理" back="/" />
        <div className="m-empty">无权限访问此页面</div>
      </>
    )
  }

  const badge = upgradeTotal + pendingTotal
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const pendingPages = Math.max(1, Math.ceil(pendingTotal / PAGE_SIZE))

  const statusBadge = (u: any) => {
    if (u.is_active === 0) return <span className="m-badge warn">已停用</span>
    if (u.is_approved === 0) return <span className="m-badge warn">待审批</span>
    return <span className="m-badge completed">正常</span>
  }

  const paymentInfo = (m: any) => {
    if (m.payment == null) return <span className="m-badge">试用</span>
    return (
      <>
        {m.payment.plan_name || '付费'} {fmtYuan(m.payment.amount_cents)} · {payLabel(m.payment.payment_method)}
        {m.payment.payment_ref ? ` · 单号 ${m.payment.payment_ref}` : ''}
      </>
    )
  }

  return (
    <>
      <MTopBar title="用户管理" back="/" />
      <div className="m-tabs">
        <button className={`m-tab ${tab === 'member' ? 'active' : ''}`}
          onClick={() => { setTab('member'); setPage(1) }}>会员</button>
        <button className={`m-tab ${tab === 'admin' ? 'active' : ''}`}
          onClick={() => { setTab('admin'); setPage(1) }}>管理员</button>
        <button className={`m-tab ${tab === 'pending' ? 'active' : ''}`}
          onClick={() => { setTab('pending'); setPendingPage(1) }}>
          待审批{badge > 0 && <span className="m-tab-badge">{badge}</span>}
        </button>
        {canGlobal && (
          <button className={`m-tab ${tab === 'plan' ? 'active' : ''}`}
            onClick={() => setTab('plan')}>套餐</button>
        )}
      </div>
      <div className="m-content">
        {(tab === 'member' || tab === 'admin') && (
          listLoading ? (
            <div className="m-loading">加载中…</div>
          ) : users.length === 0 ? (
            <div className="m-empty">暂无用户</div>
          ) : (
            <>
              {users.map(u => {
                const isSuperAdmin = u.user_type === 'admin' && u.username === 'admin'
                return (
                  <div key={u.id} className="m-user-row">
                    <div className="m-user-head">
                      <div className="m-user-name">{u.display_name || u.username}</div>
                      {statusBadge(u)}
                    </div>
                    <div className="m-user-meta">
                      @{u.username}{u.email ? ` · ${u.email}` : ''}
                      {tab === 'member' && <> · 到期：{fmtDate(u.expires_at)}</>}
                    </div>
                    <div className="m-row-actions">
                      <button className="m-mini-btn" onClick={() => openEdit(u)}>编辑</button>
                      {!isSuperAdmin && (
                        <button className={`m-mini-btn ${u.is_active === 0 ? '' : 'warn'}`}
                          disabled={busyUserId === u.id}
                          onClick={() => handleToggleActive(u)}>
                          {u.is_active === 0 ? '启用' : '停用'}
                        </button>
                      )}
                      {tab === 'member' && (
                        <button className="m-mini-btn primary" onClick={() => openRenew(u)}>录入续期</button>
                      )}
                      {!isSuperAdmin && (
                        <button className="m-mini-btn warn" disabled={busyUserId === u.id}
                          onClick={() => handleDelete(u)}>删除</button>
                      )}
                    </div>
                  </div>
                )
              })}
              {totalPages > 1 && (
                <div className="m-pager">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
                  <span>{page} / {totalPages}</span>
                  <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
                </div>
              )}
            </>
          )
        )}

        {tab === 'pending' && (
          pendingLoading ? (
            <div className="m-loading">加载中…</div>
          ) : (
            <>
              {upgrades.length > 0 && (
                <>
                  <div className="m-section-title">升级申请（{upgrades.length}）</div>
                  {upgrades.map(m => (
                    <div key={m.id} className="m-user-row">
                      <div className="m-user-head">
                        <div className="m-user-name">{m.display_name || m.username}</div>
                        <span className="m-badge">升级</span>
                      </div>
                      <div className="m-user-meta">
                        @{m.username}{m.email ? ` · ${m.email}` : ''}{m.phone ? ` · ${m.phone}` : ''}
                        <br />{paymentInfo(m)}
                      </div>
                      <div className="m-row-actions">
                        <button className="m-mini-btn primary" disabled={busyUserId === m.id}
                          onClick={() => handleApproveUpgrade(m)}>通过升级</button>
                      </div>
                    </div>
                  ))}
                </>
              )}
              <div className="m-section-title">待审批会员（{pendingTotal}）</div>
              {pending.length === 0 ? (
                <div className="m-empty">暂无待审批会员</div>
              ) : (
                <>
                  {pending.map(m => (
                    <div key={m.id} className="m-user-row">
                      <div className="m-user-head">
                        <div className="m-user-name">{m.display_name || m.username}</div>
                        {m.payment != null ? <span className="m-badge completed">付费</span> : <span className="m-badge">试用</span>}
                      </div>
                      <div className="m-user-meta">
                        @{m.username}{m.email ? ` · ${m.email}` : ''}{m.phone ? ` · ${m.phone}` : ''}
                        <br />{paymentInfo(m)}
                      </div>
                      <div className="m-row-actions">
                        <button className="m-mini-btn primary" onClick={() => openApprove(m)}>通过</button>
                        <button className="m-mini-btn warn" onClick={() => { setRejectTarget(m); setRejectReason('') }}>拒绝</button>
                      </div>
                    </div>
                  ))}
                  {pendingPages > 1 && (
                    <div className="m-pager">
                      <button disabled={pendingPage <= 1} onClick={() => setPendingPage(p => p - 1)}>上一页</button>
                      <span>{pendingPage} / {pendingPages}</span>
                      <button disabled={pendingPage >= pendingPages} onClick={() => setPendingPage(p => p + 1)}>下一页</button>
                    </div>
                  )}
                </>
              )}
            </>
          )
        )}

        {tab === 'plan' && canGlobal && (
          !planLoaded ? (
            <div className="m-loading">加载中…</div>
          ) : (
            <>
              <div className="m-section-title">标准套餐（会员续费）</div>
              <div className="m-field">
                <label>套餐名称</label>
                <input className="m-input" value={qName} onChange={e => setQName(e.target.value)} />
              </div>
              <div className="m-field-inline">
                <div className="m-field">
                  <label>价格（元）</label>
                  <input className="m-input" type="number" inputMode="decimal" value={qPrice}
                    onChange={e => setQPrice(e.target.value)} />
                </div>
                <div className="m-field">
                  <label>有效天数</label>
                  <input className="m-input" type="number" inputMode="numeric" value={qDays}
                    onChange={e => setQDays(e.target.value)} />
                </div>
              </div>

              <div className="m-section-title">升级套餐（体验管理员）</div>
              <div className="m-field">
                <label>套餐名称</label>
                <input className="m-input" value={uName} onChange={e => setUName(e.target.value)} />
              </div>
              <div className="m-field-inline">
                <div className="m-field">
                  <label>价格（元）</label>
                  <input className="m-input" type="number" inputMode="decimal" value={uPrice}
                    onChange={e => setUPrice(e.target.value)} />
                </div>
                <div className="m-field">
                  <label>有效天数</label>
                  <input className="m-input" type="number" inputMode="numeric" value={uDays}
                    onChange={e => setUDays(e.target.value)} />
                </div>
              </div>

              <div className="m-section-title">微信收款码</div>
              {qrWechat ? <img className="m-qr-preview" src={qrWechat} alt="微信收款码" />
                : <div className="m-qr-empty">未设置</div>}
              <div className="m-qr-actions">
                <label className="m-mini-btn" style={{ display: 'flex', alignItems: 'center' }}>
                  从相册选择
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={handleQrUpload('wechat')} />
                </label>
                {qrWechat && <button className="m-mini-btn warn" onClick={() => setQrWechat('')}>清除</button>}
              </div>

              <div className="m-section-title">支付宝收款码</div>
              {qrAlipay ? <img className="m-qr-preview" src={qrAlipay} alt="支付宝收款码" />
                : <div className="m-qr-empty">未设置</div>}
              <div className="m-qr-actions">
                <label className="m-mini-btn" style={{ display: 'flex', alignItems: 'center' }}>
                  从相册选择
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={handleQrUpload('alipay')} />
                </label>
                {qrAlipay && <button className="m-mini-btn warn" onClick={() => setQrAlipay('')}>清除</button>}
              </div>

              <button className="m-btn-primary" style={{ marginTop: 20 }}
                disabled={planSaving} onClick={handlePlanSave}>
                {planSaving ? '保存中…' : '保存套餐设置'}
              </button>
            </>
          )
        )}
      </div>

      {editTarget != null && (
        <MSheet title={`编辑用户 · @${editTarget.username}`}
          onClose={() => { if (!editSubmitting) setEditTarget(null) }}>
          <div className="m-field">
            <label>显示名</label>
            <input className="m-input" value={editName} onChange={e => setEditName(e.target.value)} />
          </div>
          <div className="m-field">
            <label>邮箱（可留空）</label>
            <input className="m-input" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
          </div>
          <div className="m-field">
            <label>重置密码（留空则不修改，至少 8 位）</label>
            <input className="m-input" type="password" value={editPassword} autoComplete="new-password"
              onChange={e => setEditPassword(e.target.value)} />
          </div>
          <div className="m-sheet-actions">
            <button disabled={editSubmitting} onClick={() => setEditTarget(null)}>取消</button>
            <button className="primary" disabled={editSubmitting} onClick={handleEditSubmit}>
              {editSubmitting ? '保存中…' : '保存'}
            </button>
          </div>
        </MSheet>
      )}

      {renewTarget != null && (
        <MSheet title={`录入续期 · ${renewTarget.display_name || renewTarget.username}`}
          onClose={() => { if (!renewSubmitting) setRenewTarget(null) }}>
          <div className="m-field">
            <label>套餐名称</label>
            <input className="m-input" value={renewPlan} onChange={e => setRenewPlan(e.target.value)} />
          </div>
          <div className="m-field-inline">
            <div className="m-field">
              <label>金额（元）</label>
              <input className="m-input" type="number" inputMode="decimal" value={renewYuan}
                onChange={e => setRenewYuan(e.target.value)} />
            </div>
            <div className="m-field">
              <label>续期天数</label>
              <input className="m-input" type="number" inputMode="numeric" value={renewDays}
                onChange={e => setRenewDays(e.target.value)} />
            </div>
          </div>
          <div className="m-field">
            <label>支付方式</label>
            <select className="m-input" value={renewMethod} onChange={e => setRenewMethod(e.target.value)}>
              <option value="wechat">微信支付</option>
              <option value="alipay">支付宝</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div className="m-field">
            <label>备注（可选）</label>
            <input className="m-input" value={renewNote} onChange={e => setRenewNote(e.target.value)} />
          </div>
          <div className="m-sheet-actions">
            <button disabled={renewSubmitting} onClick={() => setRenewTarget(null)}>取消</button>
            <button className="primary" disabled={renewSubmitting} onClick={handleRenewSubmit}>
              {renewSubmitting ? '提交中…' : '确认续期'}
            </button>
          </div>
        </MSheet>
      )}

      {approveTarget != null && (
        <MSheet title={`通过审批 · ${approveTarget.display_name || approveTarget.username}`}
          onClose={() => { if (!approveSubmitting) setApproveTarget(null) }}>
          <div className="m-user-meta" style={{ marginBottom: 12 }}>
            {approveTarget.payment != null
              ? <>付款信息：{approveTarget.payment.plan_name || ''} {fmtYuan(approveTarget.payment.amount_cents)} · {payLabel(approveTarget.payment.payment_method)}{approveTarget.payment.payment_ref ? ` · 单号 ${approveTarget.payment.payment_ref}` : ''}</>
              : '试用会员：默认 7 天有效期'}
          </div>
          <div className="m-field">
            <label>生效天数</label>
            <input className="m-input" type="number" inputMode="numeric" value={approveDays}
              onChange={e => setApproveDays(e.target.value)} />
          </div>
          <div className="m-sheet-actions">
            <button disabled={approveSubmitting} onClick={() => setApproveTarget(null)}>取消</button>
            <button className="primary" disabled={approveSubmitting} onClick={handleApprove}>
              {approveSubmitting ? '提交中…' : '确认通过'}
            </button>
          </div>
        </MSheet>
      )}

      {rejectTarget != null && (
        <MSheet title={`拒绝审批 · ${rejectTarget.display_name || rejectTarget.username}`}
          onClose={() => { if (!rejectSubmitting) setRejectTarget(null) }}>
          <div className="m-field">
            <label>拒绝原因（可选）</label>
            <input className="m-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
          </div>
          <div className="m-sheet-actions">
            <button disabled={rejectSubmitting} onClick={() => setRejectTarget(null)}>取消</button>
            <button className="primary" disabled={rejectSubmitting} onClick={handleReject}>
              {rejectSubmitting ? '提交中…' : '确认拒绝'}
            </button>
          </div>
        </MSheet>
      )}
    </>
  )
}
