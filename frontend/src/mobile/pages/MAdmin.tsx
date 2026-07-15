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
  const canRole = !!user?.permissions?.includes('role.manage')

  const [tab, setTab] = useState<'member' | 'admin' | 'pending' | 'plan'>('member')

  // ── 会员/管理员列表 ──
  const [users, setUsers] = useState<any[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [listLoading, setListLoading] = useState(false)

  // ── 待审批/审批明细 ──
  const [pendingFilter, setPendingFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
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
  const [editLoading, setEditLoading] = useState(false)

  // ── 编辑弹层：角色分配 ──
  const [editRoles, setEditRoles] = useState<any[]>([])
  const [allRoles, setAllRoles] = useState<any[]>([])
  const [editRoleId, setEditRoleId] = useState('')

  // ── 编辑弹层：工作区分配 ──
  const [editWs, setEditWs] = useState<any[]>([])
  const [allWs, setAllWs] = useState<any[]>([])
  const [editWsId, setEditWsId] = useState('')

  // ── 付费明细弹层 ──
  const [paymentsTarget, setPaymentsTarget] = useState<any | null>(null)
  const [payments, setPayments] = useState<any[]>([])
  const [paymentsLoading, setPaymentsLoading] = useState(false)

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

  const loadPending = useCallback(async (status: string, p: number) => {
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

      if (status === 'pending') {
        const pm = await api.listPendingMembers(p, PAGE_SIZE)
        if (pm != null && Array.isArray(pm.members)) {
          setPending(pm.members)
          setPendingTotal(Number(pm.total) || 0)
        } else {
          setPending([])
          setPendingTotal(0)
        }
      } else {
        const st = status === 'all' ? undefined : status
        const data = await api.listUsers({ user_type: 'member', status: st, page: p, page_size: PAGE_SIZE }) as any
        if (data != null && Array.isArray(data.users)) {
          setPending(data.users)
          setPendingTotal(Number(data.total) || 0)
        } else {
          setPending([])
          setPendingTotal(0)
        }
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
      loadPending(pendingFilter, pendingPage)
    } else if (tab === 'plan' && !planLoaded) {
      loadPlanSettings()
    }
  }, [canMember, tab, page, pendingPage, pendingFilter, planLoaded, loadUsers, loadPending, loadPlanSettings])

  // 进页时拉一次角标数
  useEffect(() => {
    if (!canMember) return
    loadPending('pending', 1)
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
    if (!window.confirm(`确定删除用户「${u.display_name || u.username}」？此操作不可恢复，将级联删除其角色、工作区和付费记录。`)) return
    setBusyUserId(u.id)
    try {
      const result = await api.deleteUser(u.id)
      if (result != null) {
        mToast('已删除')
        await loadUsers(tab, page)
      }
    } catch (e: any) {
      mToast(`删除失败: ${e?.message || e}`, 'error')
    } finally {
      setBusyUserId('')
    }
  }

  const openEdit = async (u: any) => {
    setEditTarget(u)
    setEditName(u.display_name || '')
    setEditEmail(u.email || '')
    setEditPassword('')
    setEditRoles([])
    setAllRoles([])
    setEditRoleId('')
    setEditWs([])
    setAllWs([])
    setEditWsId('')
    setEditLoading(true)
    try {
      const detail = await api.getUser(u.id) as any
      if (detail != null) {
        setEditRoles(Array.isArray(detail.roles) ? detail.roles : [])
      }
      if (canRole) {
        const rl = await api.listRoles(u.user_type)
        if (Array.isArray(rl)) setAllRoles(rl)
      }
      const wl = await api.listWorkspaces() as any
      if (wl != null && Array.isArray(wl.workspaces)) setAllWs(wl.workspaces)
      const uw = await api.getUserWorkspaces(u.id) as any[]
      if (Array.isArray(uw)) setEditWs(uw)
    } catch (e: any) {
      mToast(`加载用户信息失败: ${e?.message || e}`, 'error')
    } finally {
      setEditLoading(false)
    }
  }

  const handleEditSubmit = async () => {
    if (editTarget == null) return
    setEditSubmitting(true)
    try {
      if (editName !== (editTarget.display_name || '') || editEmail !== (editTarget.email || '')) {
        const result = await api.updateUser(editTarget.id, {
          display_name: editName.trim() || undefined,
          email: editEmail.trim() || undefined,
        })
        if (result == null) { mToast('保存失败：服务器未确认', 'error'); return }
      }
      if (editPassword.trim() && editPassword.trim().length >= 8) {
        const pr = await api.resetUserPassword(editTarget.id, editPassword.trim()) as any
        if (pr == null || !pr.ok) { mToast('密码重置失败：服务器未确认', 'error'); return }
      } else if (editPassword.trim() && editPassword.trim().length < 8) {
        mToast('密码至少 8 位', 'error'); return
      }
      mToast('保存成功')
      setEditTarget(null)
      await loadUsers(tab, page)
    } catch (e: any) {
      mToast(`保存失败: ${e?.message || e}`, 'error')
    } finally {
      setEditSubmitting(false)
    }
  }

  const handleAddRole = async () => {
    if (!editTarget || !editRoleId) { mToast('请选择角色', 'error'); return }
    try {
      const result = await api.addUserRole(editTarget.id, editRoleId) as any
      if (result != null && result.ok) {
        const role = allRoles.find(r => r.id === editRoleId)
        if (role) setEditRoles(prev => [...prev, role])
        setEditRoleId('')
      } else {
        mToast('分配失败：服务器未确认', 'error')
      }
    } catch (e: any) {
      mToast(`分配失败: ${e?.message || e}`, 'error')
    }
  }

  const handleRemoveRole = async (roleId: string) => {
    if (!editTarget) return
    try {
      const result = await api.removeUserRole(editTarget.id, roleId) as any
      if (result != null && result.ok) {
        setEditRoles(prev => prev.filter(r => r.id !== roleId))
      } else {
        mToast('移除失败：服务器未确认', 'error')
      }
    } catch (e: any) {
      mToast(`移除失败: ${e?.message || e}`, 'error')
    }
  }

  const handleAddWs = async () => {
    if (!editTarget || !editWsId) { mToast('请选择工作区', 'error'); return }
    try {
      const result = await api.addUserWorkspaces(editTarget.id, [editWsId]) as any
      if (result != null && result.ok) {
        const ws = allWs.find(w => w.id === editWsId)
        if (ws) setEditWs(prev => [...prev, ws])
        setEditWsId('')
      } else {
        mToast('添加失败：服务器未确认', 'error')
      }
    } catch (e: any) {
      mToast(`添加失败: ${e?.message || e}`, 'error')
    }
  }

  const handleRemoveWs = async (wsId: string) => {
    if (!editTarget) return
    try {
      const result = await api.removeUserWorkspace(editTarget.id, wsId) as any
      if (result != null && result.ok) {
        setEditWs(prev => prev.filter(w => w.id !== wsId))
      } else {
        mToast('移除失败：服务器未确认', 'error')
      }
    } catch (e: any) {
      mToast(`移除失败: ${e?.message || e}`, 'error')
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

  const openPayments = async (u: any) => {
    setPaymentsTarget(u)
    setPayments([])
    setPaymentsLoading(true)
    try {
      const data = await api.listPayments(u.id) as any
      if (data != null && Array.isArray(data.payments)) {
        setPayments(data.payments)
      }
    } catch (e: any) {
      mToast(`加载付费明细失败: ${e?.message || e}`, 'error')
    } finally {
      setPaymentsLoading(false)
    }
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
        await loadPending(pendingFilter, pendingPage)
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
        await loadPending(pendingFilter, pendingPage)
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
        await loadPending(pendingFilter, pendingPage)
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
  const availableRoles = allRoles.filter(r => !editRoles.some(er => er.id === r.id))
  const availableWs = allWs.filter(w => !editWs.some(ew => ew.id === w.id))

  const statusBadge = (u: any) => {
    if (u.is_active === 0) return <span className="m-badge warn">已停用</span>
    if (u.is_approved === 0) return <span className="m-badge warn">待审批</span>
    if (u.is_approved === 2) return <span className="m-badge">已拒绝</span>
    return <span className="m-badge completed">正常</span>
  }

  const paymentInfo = (m: any) => {
    if (m.payment == null) return <span className="m-badge">试用</span>
    return (
      <>
        {m.payment.plan_name || '付费'} {fmtYuan(m.payment.amount_cents)} · {payLabel(m.payment.payment_method)}
        {m.payment.payment_ref ? ` · 单号 ${m.payment.payment_ref}` : ''}
        {m.payment.note ? ` · ${m.payment.note}` : ''}
      </>
    )
  }

  // 审批状态筛选标签
  const approvalFilterTabs = () => (
    <div className="m-tabs" style={{ marginBottom: 12 }}>
      <button className={`m-tab ${pendingFilter === 'pending' ? 'active' : ''}`}
        onClick={() => { setPendingFilter('pending'); setPendingPage(1) }}>待审批</button>
      <button className={`m-tab ${pendingFilter === 'approved' ? 'active' : ''}`}
        onClick={() => { setPendingFilter('approved'); setPendingPage(1) }}>已通过</button>
      <button className={`m-tab ${pendingFilter === 'rejected' ? 'active' : ''}`}
        onClick={() => { setPendingFilter('rejected'); setPendingPage(1) }}>已拒绝</button>
      <button className={`m-tab ${pendingFilter === 'all' ? 'active' : ''}`}
        onClick={() => { setPendingFilter('all'); setPendingPage(1) }}>全部</button>
    </div>
  )

  return (
    <>
      <MTopBar title="用户管理" back="/" />
      <div className="m-tabs">
        <button className={`m-tab ${tab === 'member' ? 'active' : ''}`}
          onClick={() => { setTab('member'); setPage(1) }}>会员</button>
        <button className={`m-tab ${tab === 'admin' ? 'active' : ''}`}
          onClick={() => { setTab('admin'); setPage(1) }}>管理员</button>
        <button className={`m-tab ${tab === 'pending' ? 'active' : ''}`}
          onClick={() => { setTab('pending'); setPendingFilter('pending'); setPendingPage(1) }}>
          审批{badge > 0 && <span className="m-tab-badge">{badge}</span>}
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
                      <div>@{u.username}{u.email ? ` · ${u.email}` : ''}{u.phone ? ` · ${u.phone}` : ''}</div>
                      <div>
                        注册：{fmtDate(u.created_at)}
                        {tab === 'member' && <> · 到期：{fmtDate(u.expires_at)}</>}
                      </div>
                      {Array.isArray(u.roles) && u.roles.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                          {u.roles.map((r: any) => (
                            <span key={r.id} className="m-badge" style={{ fontSize: 11, padding: '1px 6px' }}>{r.name}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="m-row-actions">
                      <button className="m-mini-btn" onClick={() => openEdit(u)}>编辑</button>
                      {tab === 'member' && (
                        <button className="m-mini-btn" onClick={() => openPayments(u)}>明细</button>
                      )}
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
              {pendingFilter === 'pending' && upgrades.length > 0 && (
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

              {approvalFilterTabs()}

              {pending.length === 0 ? (
                <div className="m-empty">
                  {pendingFilter === 'pending' ? '暂无待审批会员' :
                   pendingFilter === 'approved' ? '暂无已通过会员' :
                   pendingFilter === 'rejected' ? '暂无已拒绝会员' : '暂无记录'}
                </div>
              ) : (
                <>
                  {pending.map(m => (
                    <div key={m.id} className="m-user-row">
                      <div className="m-user-head">
                        <div className="m-user-name">{m.display_name || m.username}</div>
                        {statusBadge(m)}
                      </div>
                      <div className="m-user-meta">
                        <div>@{m.username}{m.email ? ` · ${m.email}` : ''}{m.phone ? ` · ${m.phone}` : ''}</div>
                        <div>注册：{fmtDate(m.created_at)} · 到期：{fmtDate(m.expires_at)}</div>
                        {m.payment != null && <div style={{ marginTop: 2 }}>{paymentInfo(m)}</div>}
                      </div>
                      <div className="m-row-actions">
                        {pendingFilter === 'pending' && (
                          <>
                            <button className="m-mini-btn primary" onClick={() => openApprove(m)}>通过</button>
                            <button className="m-mini-btn warn" onClick={() => { setRejectTarget(m); setRejectReason('') }}>拒绝</button>
                          </>
                        )}
                        <button className="m-mini-btn" onClick={() => openPayments(m)}>明细</button>
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
          {editLoading ? (
            <div className="m-loading">加载中…</div>
          ) : (
            <>
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

              {canRole && (
                <>
                  <div className="m-section-title">角色分配</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                    {editRoles.map(r => (
                      <span key={r.id} className="m-badge completed" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {r.name}
                        <button className="m-mini-btn"
                          style={{ padding: '0 4px', fontSize: 11, lineHeight: '16px' }}
                          onClick={() => handleRemoveRole(r.id)}>×</button>
                      </span>
                    ))}
                    {editRoles.length === 0 && (
                      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>未分配角色</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <select className="m-input" style={{ flex: 1 }} value={editRoleId}
                      onChange={e => setEditRoleId(e.target.value)}>
                      <option value="">选择角色…</option>
                      {availableRoles.map(r => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                    <button className="m-mini-btn primary" disabled={!editRoleId}
                      onClick={handleAddRole}>分配</button>
                  </div>
                </>
              )}

              <div className="m-section-title">可访问工作区</div>
              <div style={{ marginBottom: 8 }}>
                {editWs.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>未分配工作区</div>
                ) : (
                  editWs.map(w => (
                    <div key={w.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                      <span>{w.name}</span>
                      <button className="m-mini-btn warn"
                        style={{ padding: '0 6px', fontSize: 11 }}
                        onClick={() => handleRemoveWs(w.id)}>×</button>
                    </div>
                  ))
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select className="m-input" style={{ flex: 1 }} value={editWsId}
                  onChange={e => setEditWsId(e.target.value)}>
                  <option value="">添加工作区…</option>
                  {availableWs.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <button className="m-mini-btn primary" disabled={!editWsId}
                  onClick={handleAddWs}>添加</button>
              </div>

              <div className="m-sheet-actions" style={{ marginTop: 16 }}>
                <button disabled={editSubmitting} onClick={() => setEditTarget(null)}>取消</button>
                <button className="primary" disabled={editSubmitting} onClick={handleEditSubmit}>
                  {editSubmitting ? '保存中…' : '保存'}
                </button>
              </div>
            </>
          )}
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
            <input className="m-input" value={renewNote} onChange={e => setRenewNote(e.target.value)}
              placeholder="可填写付款人、用途等备注信息" />
          </div>
          <div className="m-sheet-actions">
            <button disabled={renewSubmitting} onClick={() => setRenewTarget(null)}>取消</button>
            <button className="primary" disabled={renewSubmitting} onClick={handleRenewSubmit}>
              {renewSubmitting ? '提交中…' : '确认续期'}
            </button>
          </div>
        </MSheet>
      )}

      {paymentsTarget != null && (
        <MSheet title={`付费明细 · ${paymentsTarget.display_name || paymentsTarget.username}`}
          onClose={() => setPaymentsTarget(null)}>
          {paymentsLoading ? (
            <div className="m-loading">加载中…</div>
          ) : payments.length === 0 ? (
            <div className="m-empty">暂无付费记录</div>
          ) : (
            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {payments.map((p: any) => (
                <div key={p.id} style={{
                  borderBottom: '1px solid var(--border)', padding: '10px 0',
                  fontSize: 13, lineHeight: 1.7,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{p.plan_name}</strong>
                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{fmtYuan(p.amount_cents)}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    {payLabel(p.payment_method)} · {p.duration_days} 天
                    {p.payment_ref ? ` · 单号: ${p.payment_ref}` : ''}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>
                    {fmtDate(p.paid_at)}
                    {p.expires_before && ` · 续前到期: ${fmtDate(p.expires_before)}`}
                    {p.expires_after && ` → 续后到期: ${fmtDate(p.expires_after)}`}
                  </div>
                  {p.note && (
                    <div style={{
                      background: 'var(--bg-secondary)', padding: '4px 8px',
                      borderRadius: 4, marginTop: 4, fontSize: 12,
                    }}>
                      备注：{p.note}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
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
