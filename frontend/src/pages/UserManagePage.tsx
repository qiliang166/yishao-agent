import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { usePermission } from '../hooks/usePermission'
import { useAuth } from '../contexts/AuthContext'
import PaymentHistoryDialog from '../components/PaymentHistoryDialog'

interface UserItem {
  id: string
  username: string
  display_name: string
  email: string
  phone?: string
  user_type: string
  is_active: number
  expires_at: string | null
  created_at: string
  admin_note?: string
  roles: { id: string; name: string }[]
}

interface RoleItem {
  id: string
  name: string
  description: string
  user_type: string
  is_system: number
  permissions: string[]
}

interface WorkspaceItem {
  id: string
  name: string
}

function typeLabel(t: string): string {
  const map: Record<string, string> = {
    purchase: '购买',
    admin_adjust: '管理员调整',
    admin_grant: '管理员赠送',
    signup_bonus: '注册赠送',
  }
  return map[t] || t
}

export default function UserManagePage() {
  const canManageMembers = usePermission('member.manage')
  const canManageRoles = usePermission('role.manage')
  const { user: authUser } = useAuth()
  const isSuperAdmin = authUser?.username === 'admin'
  const [tab, setTab] = useState<'admin' | 'member'>('admin')
  const [users, setUsers] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  // Batch selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchExpiry, setShowBatchExpiry] = useState(false)
  const [batchExpiryDate, setBatchExpiryDate] = useState('')
  const [showBatchPoints, setShowBatchPoints] = useState(false)
  const [batchPointsAmount, setBatchPointsAmount] = useState('')
  const [batchPointsNote, setBatchPointsNote] = useState('')
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [createUsername, setCreateUsername] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createDisplayName, setCreateDisplayName] = useState('')
  const [createEmail, setCreateEmail] = useState('')
  const [createUserType, setCreateUserType] = useState<'admin' | 'member'>('admin')
  const [createLoading, setCreateLoading] = useState(false)
  const [createError, setCreateError] = useState('')

  // Edit dialog
  const [editUser, setEditUser] = useState<UserItem | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editAdminNote, setEditAdminNote] = useState('')
  const [userRoles, setUserRoles] = useState<{id:string;name:string}[]>([])
  const [allRoles, setAllRoles] = useState<RoleItem[]>([])
  const [userWorkspaces, setUserWorkspaces] = useState<WorkspaceItem[]>([])
  const [allWorkspaces, setAllWorkspaces] = useState<WorkspaceItem[]>([])
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')
  const [resetPwValue, setResetPwValue] = useState('')
  const [resetPwLoading, setResetPwLoading] = useState(false)

  // Payment history dialog
  const [payHistUser, setPayHistUser] = useState<UserItem | null>(null)

  // Role assignment
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [roleAssignLoading, setRoleAssignLoading] = useState(false)

  // Workspace assignment
  const [selectedWsId, setSelectedWsId] = useState('')
  const [wsAssignLoading, setWsAssignLoading] = useState(false)

  // Points management
  const [pointsUser, setPointsUser] = useState<UserItem | null>(null)
  const [pointsData, setPointsData] = useState<any>(null)
  const [pointsLoading, setPointsLoading] = useState(false)
  const [pointsNewBalance, setPointsNewBalance] = useState('')
  const [pointsNote, setPointsNote] = useState('')
  const [pointsSaving, setPointsSaving] = useState(false)
  const [pointsError, setPointsError] = useState('')
  const [giftAmount, setGiftAmount] = useState('')
  const [giftNote, setGiftNote] = useState('')
  const [giftSaving, setGiftSaving] = useState(false)
  const [pointsPerYuan, setPointsPerYuan] = useState(1.0)
  const [expiryDate, setExpiryDate] = useState('')
  const [expirySaving, setExpirySaving] = useState(false)

  const pageSize = 20

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  const loadUsers = useCallback(() => {
    setLoading(true)
    api.listUsers({ user_type: tab, page, page_size: pageSize })
      .then(data => { setUsers(data.users || []); setTotal(data.total) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tab, page])

  useEffect(() => { loadUsers() }, [loadUsers])

  // Clear selection on tab/page change
  useEffect(() => { setSelectedIds(new Set()) }, [tab, page])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    const currentIds = users.map(u => u.id)
    const allSelected = currentIds.every(id => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        currentIds.forEach(id => next.delete(id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        currentIds.forEach(id => next.add(id))
        return next
      })
    }
  }

  const isAllSelected = users.length > 0 && users.every(u => selectedIds.has(u.id))

  const openEdit = async (u: UserItem) => {
    setEditUser(u)
    setEditDisplayName(u.display_name)
    setEditEmail(u.email || '')
    setEditAdminNote(u.admin_note || '')
    setEditError('')
    setSelectedRoleId('')
    setSelectedWsId('')

    try {
      const [rolesData, wsData, wsListData] = await Promise.all([
        api.listRoles(tab),
        api.getUserWorkspaces(u.id),
        api.listWorkspaces(1, 1000),
      ])
      setAllRoles(rolesData)
      setUserRoles(u.roles || [])
      setUserWorkspaces(wsData)
      setAllWorkspaces(wsListData.workspaces || [])
    } catch {}
  }

  const handleSaveUser = async () => {
    if (!editUser) return
    setEditLoading(true)
    setEditError('')
    try {
      const payload: any = {
        display_name: editDisplayName,
        email: editEmail,
      }
      if (isSuperAdmin && editAdminNote !== (editUser.admin_note || '')) {
        payload.admin_note = editAdminNote
      }
      const result = await api.updateUser(editUser.id, payload)
      if (result == null) { setEditError('保存失败：服务器未确认'); return }
      showToast('用户信息已更新')
      setEditUser(null)
      loadUsers()
    } catch (e: any) {
      setEditError(e.message || '保存失败')
    } finally {
      setEditLoading(false)
    }
  }

  const handleCreate = async () => {
    setCreateError('')
    if (!createUsername.trim() || !createPassword || !createDisplayName.trim()) {
      setCreateError('用户名、密码、显示名不能为空')
      return
    }
    if (createPassword.length < 8) {
      setCreateError('密码至少 8 位')
      return
    }
    setCreateLoading(true)
    try {
      await api.createUser({
        username: createUsername.trim(),
        password: createPassword,
        display_name: createDisplayName.trim(),
        user_type: createUserType,
        email: createEmail.trim() || undefined,
      })
      showToast('创建成功')
      setShowCreate(false)
      setCreateUsername(''); setCreatePassword(''); setCreateDisplayName(''); setCreateEmail('')
      loadUsers()
    } catch (e: any) {
      setCreateError(e.message || '创建失败')
    } finally {
      setCreateLoading(false)
    }
  }

  const handleToggleActive = async (u: UserItem) => {
    try {
      await api.toggleUserActive(u.id)
      showToast(u.is_active ? '已停用' : '已启用')
      loadUsers()
    } catch (e: any) {
      showToast(e.message || '操作失败')
    }
  }

  const handleDelete = async (u: UserItem) => {
    if (!confirm(`确定删除用户 "${u.display_name}" 吗？此操作不可撤销。`)) return
    try {
      await api.deleteUser(u.id)
      showToast('已删除')
      loadUsers()
    } catch (e: any) {
      showToast(e.message || '删除失败')
    }
  }

  // ── Batch operations ──

  const handleBatchExpiry = async () => {
    if (!batchExpiryDate) return
    setBatchLoading(true)
    try {
      const result = await api.batchUpdateUsers({
        user_ids: Array.from(selectedIds),
        updates: { expires_at: batchExpiryDate },
      })
      if (result == null) { showToast('操作失败：服务器未确认'); return }
      showToast(result.message || `已更新 ${result.count} 个用户`)
      setShowBatchExpiry(false)
      setBatchExpiryDate('')
      setSelectedIds(new Set())
      loadUsers()
    } catch (e: any) {
      showToast(e.message || '批量操作失败')
    } finally {
      setBatchLoading(false)
    }
  }

  const handleBatchPoints = async () => {
    const amount = parseInt(batchPointsAmount)
    if (!amount || amount <= 0) { showToast('请输入有效的积分数'); return }
    setBatchLoading(true)
    try {
      const result = await api.batchGrantPoints({
        user_ids: Array.from(selectedIds),
        amount_deci: amount,
        note: batchPointsNote || undefined,
      })
      if (result == null) { showToast('操作失败：服务器未确认'); return }
      showToast(result.message || `已为 ${result.count} 个用户增加积分`)
      setShowBatchPoints(false)
      setBatchPointsAmount('')
      setBatchPointsNote('')
      setSelectedIds(new Set())
    } catch (e: any) {
      showToast(e.message || '批量操作失败')
    } finally {
      setBatchLoading(false)
    }
  }

  const handleBatchToggleActive = async (makeActive: boolean) => {
    const label = makeActive ? '启用' : '停用'
    const selectedUsers = users.filter(u => selectedIds.has(u.id))
    if (selectedUsers.length === 0) return
    if (!confirm(`确定批量${label} ${selectedUsers.length} 个用户吗？`)) return
    setBatchLoading(true)
    try {
      const result = await api.batchUpdateUsers({
        user_ids: Array.from(selectedIds),
        updates: { is_active: makeActive ? 1 : 0 },
      })
      if (result == null) { showToast('操作失败：服务器未确认'); return }
      showToast(result.message || `已${label} ${result.count} 个用户`)
      setSelectedIds(new Set())
      loadUsers()
    } catch (e: any) {
      showToast(e.message || '批量操作失败')
    } finally {
      setBatchLoading(false)
    }
  }

  const handleBatchDelete = async () => {
    setBatchLoading(true)
    try {
      const result = await api.batchDeleteUsers({ user_ids: Array.from(selectedIds) })
      if (result == null) { showToast('操作失败：服务器未确认'); return }
      showToast(result.message || `已删除 ${result.count} 个用户`)
      setShowBatchDeleteConfirm(false)
      setSelectedIds(new Set())
      loadUsers()
    } catch (e: any) {
      showToast(e.message || '批量删除失败')
    } finally {
      setBatchLoading(false)
    }
  }

  const handleAssignRole = async () => {
    if (!editUser || !selectedRoleId) return
    setRoleAssignLoading(true)
    try {
      await api.addUserRole(editUser.id, selectedRoleId)
      const existing = allRoles.find(r => r.id === selectedRoleId)
      if (existing) {
        setUserRoles(prev => [...prev, existing])
      }
      setSelectedRoleId('')
      showToast('角色已分配')
    } catch (e: any) {
      showToast(e.message || '分配失败')
    } finally {
      setRoleAssignLoading(false)
    }
  }

  const handleRemoveRole = async (roleId: string) => {
    if (!editUser) return
    try {
      await api.removeUserRole(editUser.id, roleId)
      setUserRoles(prev => prev.filter(r => r.id !== roleId))
      showToast('角色已移除')
    } catch (e: any) {
      showToast(e.message || '移除失败')
    }
  }

  const handleAddWorkspace = async () => {
    if (!editUser || !selectedWsId) return
    setWsAssignLoading(true)
    try {
      await api.addUserWorkspaces(editUser.id, [selectedWsId])
      const ws = allWorkspaces.find(w => w.id === selectedWsId)
      if (ws) setUserWorkspaces(prev => [...prev, ws])
      setSelectedWsId('')
    } catch (e: any) {
      showToast(e.message || '添加失败')
    } finally {
      setWsAssignLoading(false)
    }
  }

  const handleRemoveWorkspace = async (workspaceId: string) => {
    if (!editUser) return
    try {
      await api.removeUserWorkspace(editUser.id, workspaceId)
      setUserWorkspaces(prev => prev.filter(w => w.id !== workspaceId))
      showToast('工作区已移除')
    } catch (e: any) {
      showToast(e.message || '移除失败')
    }
  }

  const openPoints = async (u: UserItem) => {
    setPointsUser(u)
    setPointsData(null)
    setPointsNewBalance('')
    setPointsNote('')
    setPointsError('')
    setGiftAmount('')
    setGiftNote('')
    setGiftSaving(false)
    setExpiryDate(u.expires_at ? new Date(u.expires_at).toISOString().slice(0, 16) : '')
    setPointsLoading(true)
    try {
      const [data, settings] = await Promise.all([
        api.getUserPoints(u.id),
        api.getSettings(),
      ])
      if (data != null) {
        setPointsData(data)
        setPointsNewBalance(String(data.balance_display || '0'))
      }
      if (settings?.settings?.points_per_yuan) {
        setPointsPerYuan(parseFloat(settings.settings.points_per_yuan) || 1.0)
      }
    } catch (e: any) {
      showToast(e.message || '加载积分失败')
    } finally {
      setPointsLoading(false)
    }
  }

  const handleSetPoints = async () => {
    if (!pointsUser) return
    const val = parseFloat(pointsNewBalance)
    if (isNaN(val) || val < 0) { setPointsError('请输入有效积分数'); return }
    setPointsSaving(true)
    setPointsError('')
    try {
      const deci = Math.round(val * 10)
      const result = await api.setUserPoints(pointsUser.id, deci, pointsNote.trim() || undefined)
      if (result != null && result.ok) {
        showToast(`积分已更新：${result.balance_display || val.toFixed(1)}`)
        setPointsUser(null)
      } else {
        setPointsError('设置失败：服务器未确认')
      }
    } catch (e: any) {
      setPointsError(e.message || '设置失败')
    } finally {
      setPointsSaving(false)
    }
  }

  const handleGrantPoints = async () => {
    if (!pointsUser) return
    const val = parseFloat(giftAmount)
    if (isNaN(val) || val <= 0) { setPointsError('请输入有效的赠送积分'); return }
    setGiftSaving(true)
    setPointsError('')
    try {
      const deci = Math.round(val * 10)
      const result = await api.grantPoints(pointsUser.id, deci, giftNote.trim() || undefined)
      if (result != null && result.ok) {
        showToast(`已赠送 ${val.toFixed(1)} 积分 (汇率: 1元=${result.rate || pointsPerYuan}积分)`)
        setPointsUser(null)
      } else {
        setPointsError('赠送失败：服务器未确认')
      }
    } catch (e: any) {
      setPointsError(e.message || '赠送失败')
    } finally {
      setGiftSaving(false)
    }
  }

  const handleUpdateExpiry = async () => {
    if (!pointsUser) return
    setExpirySaving(true)
    setPointsError('')
    try {
      const result = await api.updateUserExpiry(pointsUser.id, expiryDate || null)
      if (result != null && result.ok) {
        showToast(expiryDate ? `到期时间已更新：${new Date(expiryDate).toLocaleDateString('zh-CN')}` : '已设为永久有效')
        // Refresh user list to show updated expiry
        loadUsers()
      } else {
        setPointsError('更新失败：服务器未确认')
      }
    } catch (e: any) {
      setPointsError(e.message || '更新失败')
    } finally {
      setExpirySaving(false)
    }
  }

  const expiresInfo = (u: UserItem) => {
    if (!u.expires_at) return <span style={{ color: 'var(--text-secondary)' }}>永久有效</span>
    const now = new Date()
    const exp = new Date(u.expires_at)
    const diff = exp.getTime() - now.getTime()
    const days = Math.floor(diff / (86400 * 1000))
    const dateStr = exp.toLocaleDateString('zh-CN')
    if (diff < 0) {
      return <span style={{ color: 'var(--warning)', fontWeight: 600 }}>已过期 ({dateStr})</span>
    }
    if (days <= 7) {
      return <span style={{ color: '#f0ad4e', fontWeight: 600 }}>{dateStr}（{days} 天后到期）</span>
    }
    return <span style={{ color: 'var(--success)' }}>{dateStr}（剩余 {days} 天）</span>
  }

  const isExperienceOfficer = (u: UserItem) => u.roles?.some(r => r.name === '开发体验员')

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const selectedUsers = users.filter(u => selectedIds.has(u.id))
  const selectedNamesForConfirm = selectedUsers.slice(0, 5).map(u => u.display_name).join('、')
    + (selectedUsers.length > 5 ? `...等 ${selectedUsers.length} 个` : '')

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px 0' }}>用户管理</h1>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: 'var(--primary)', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '1px solid var(--border)', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex' }}>
          <button
            onClick={() => { setTab('admin'); setPage(1) }}
            style={{
              padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: tab === 'admin' ? 700 : 400,
              color: tab === 'admin' ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: tab === 'admin' ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            管理员
          </button>
          <button
            onClick={() => { setTab('member'); setPage(1) }}
            style={{
              padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: tab === 'member' ? 700 : 400,
              color: tab === 'member' ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: tab === 'member' ? '2px solid var(--primary)' : '2px solid transparent',
            }}
          >
            会员
          </button>
        </div>
        <button className="btn btn-primary btn-sm"
          onClick={() => { setShowCreate(true); setCreateUserType(tab); setCreateError('') }}
          style={{ marginRight: 8 }}>
          + 新建用户
        </button>
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0',
          borderBottom: '1px solid var(--border)', background: 'var(--card-bg)',
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
            已选 {selectedIds.size} 个用户
          </span>
          {tab === 'member' && (
            <button className="btn btn-ghost btn-sm" onClick={() => {
              setShowBatchExpiry(true)
              setBatchExpiryDate('')
            }}>
              批量改到期
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => {
            setShowBatchPoints(true)
            setBatchPointsAmount('')
            setBatchPointsNote('')
          }}>
            批量加积分
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => handleBatchToggleActive(true)}>
            批量启用
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => handleBatchToggleActive(false)}>
            批量停用
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBatchDeleteConfirm(true)}
            style={{ color: 'var(--warning)' }}>
            批量删除
          </button>
          <button className="btn btn-ghost btn-sm" onClick={() => setSelectedIds(new Set())}
            style={{ marginLeft: 'auto', fontSize: 11 }}>
            取消选择
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
      ) : users.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 12,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{tab === 'admin' ? '🛡' : '👤'}</div>
          <p>{tab === 'admin' ? '暂无其他管理员账号' : '暂无会员'}</p>
        </div>
      ) : (
        <>
          {/* Select-all bar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0',
            borderBottom: '1px solid var(--border)',
          }}>
            <input type="checkbox" checked={isAllSelected} onChange={toggleSelectAll}
              style={{ margin: 0, cursor: 'pointer', accentColor: 'var(--primary)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', cursor: 'pointer' }}
              onClick={toggleSelectAll}>
              {isAllSelected ? '取消全选' : '全选当前页'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {users.map((u) => (
              <div
                key={u.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  display: 'flex', alignItems: 'center',
                  opacity: u.is_active ? 1 : 0.5,
                  gap: 12,
                }}
              >
                <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelect(u.id)}
                  style={{ margin: 0, cursor: 'pointer', accentColor: 'var(--primary)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>
                    {u.display_name}
                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8, fontSize: 12 }}>
                      {u.username}
                    </span>
                    {!u.is_active && (
                      <span style={{ fontSize: 10, color: '#fff', background: '#999', padding: '1px 6px', borderRadius: 3, marginLeft: 8 }}>已停用</span>
                    )}

                    {isExperienceOfficer(u) && (
                      <span style={{ fontSize: 10, color: 'var(--primary)', background: 'var(--primary-light)', padding: '1px 6px', borderRadius: 3, marginLeft: 8, fontWeight: 600 }}>
                        开发体验员
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {u.email || '无邮箱'}
                    {u.phone ? ` · ${u.phone}` : ''}
                    {` · 注册：${new Date(u.created_at).toLocaleDateString('zh-CN')}`}
                    {tab === 'member' && (
                      <span> · 会员：{expiresInfo(u)}</span>
                    )}
                  </div>
                  {isSuperAdmin && u.admin_note && (
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 3 }}>
                      备注：{u.admin_note}
                    </div>
                  )}
                  {tab === 'member' && u.roles && u.roles.length > 0 && (
                    <div style={{ fontSize: 11, marginTop: 3, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>角色：</span>
                      {u.roles.map(r => {
                        const isUpgrade = r.name === '开发体验员'
                        return (
                          <span key={r.id} style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 3, fontWeight: 500,
                            background: isUpgrade ? 'var(--primary-light)' : 'var(--card-bg)',
                            color: isUpgrade ? 'var(--primary)' : 'var(--text)',
                            border: isUpgrade ? '1px solid var(--primary)' : '1px solid var(--border)',
                          }}>
                            {r.name}
                            {isUpgrade && u.expires_at && (
                              <span style={{ marginLeft: 3, opacity: 0.7 }}>
                                · 随会员 {new Date(u.expires_at).toLocaleDateString('zh-CN')} 到期
                              </span>
                            )}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                    {(canManageMembers || canManageRoles) && (
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>编辑</button>
                      )}
                      {tab === 'member' && canManageMembers && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => setPayHistUser(u)}>明细</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openPoints(u)}
                            style={{ color: '#5cb85c' }}>积分</button>
                        </>
                      )}
                      {u.username !== 'admin' && canManageMembers && (
                        <>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleToggleActive(u)}
                            style={{ color: u.is_active ? 'var(--warning)' : '#5cb85c' }}>
                            {u.is_active ? '停用' : '启用'}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => handleDelete(u)}
                            style={{ color: 'var(--warning)' }}>删除</button>
                        </>
                      )}
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
              <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', alignSelf: 'center' }}>{page} / {totalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          )}
        </>
      )}

      {/* Batch Expiry Dialog */}
      {showBatchExpiry && (
        <div className="dialog-overlay" onClick={() => setShowBatchExpiry(false)}>
          <div className="dialog-box" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">批量修改到期时间</div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
              将为选中的 {selectedIds.size} 个用户设置相同的到期时间。
            </p>
            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>到期时间</label>
            <input className="form-input" type="datetime-local"
              value={batchExpiryDate}
              onChange={e => setBatchExpiryDate(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowBatchExpiry(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleBatchExpiry}
                disabled={batchLoading || !batchExpiryDate}>
                {batchLoading ? '处理中...' : '确认修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Points Dialog */}
      {showBatchPoints && (
        <div className="dialog-overlay" onClick={() => setShowBatchPoints(false)}>
          <div className="dialog-box" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">批量增加积分</div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
              将为选中的 {selectedIds.size} 个用户增加积分。
            </p>
            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>积分数量</label>
            <input className="form-input" type="number" min="1"
              value={batchPointsAmount}
              onChange={e => setBatchPointsAmount(e.target.value)}
              placeholder="请输入积分数"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }} />
            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 10 }}>备注（可选）</label>
            <input className="form-input" type="text"
              value={batchPointsNote}
              onChange={e => setBatchPointsNote(e.target.value)}
              placeholder="赠送原因..."
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowBatchPoints(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleBatchPoints}
                disabled={batchLoading || !batchPointsAmount || parseInt(batchPointsAmount) <= 0}>
                {batchLoading ? '处理中...' : '确认增加'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirm Dialog */}
      {showBatchDeleteConfirm && (
        <div className="dialog-overlay" onClick={() => setShowBatchDeleteConfirm(false)}>
          <div className="dialog-box" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">批量删除用户</div>
            <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>
              确定删除以下 {selectedIds.size} 个用户吗？此操作不可撤销。
            </p>
            <div style={{
              fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12,
              padding: '8px 12px', background: 'var(--card-bg)', borderRadius: 6,
              border: '1px solid var(--border)',
            }}>
              {selectedNamesForConfirm}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowBatchDeleteConfirm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleBatchDelete}
                disabled={batchLoading}
                style={{ background: 'var(--warning)', borderColor: 'var(--warning)' }}>
                {batchLoading ? '删除中...' : '确认删除'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit User Dialog */}
      {editUser && (
        <div className="dialog-overlay" onClick={() => setEditUser(null)}>
          <div className="dialog-box" style={{ width: 500, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">编辑用户 — {editUser.username}</div>

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>显示名</label>
            <input className="form-input" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }} />

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 12 }}>邮箱</label>
            <input className="form-input" value={editEmail} onChange={e => setEditEmail(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }} />

            {isSuperAdmin && (
              <>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 12 }}>
                  备注（仅超级管理员可见）
                </label>
                <textarea className="form-input" rows={2} value={editAdminNote}
                  onChange={e => setEditAdminNote(e.target.value)}
                  placeholder="如：某学校李老师、老客户等"
                  style={{ width: '100%', boxSizing: 'border-box', fontSize: 11, resize: 'vertical' }} />
              </>
            )}

            {/* Roles */}
            {canManageRoles && (
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6 }}>角色</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {userRoles.map(r => (
                  <span key={r.id} style={{
                    fontSize: 11, padding: '3px 8px', background: 'var(--card-bg)', borderRadius: 4,
                    display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--border)',
                  }}>
                    {r.name}
                    <span onClick={() => handleRemoveRole(r.id)}
                      style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1 }}>×</span>
                  </span>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <select className="form-input" value={selectedRoleId}
                  onChange={e => setSelectedRoleId(e.target.value)}
                  style={{ flex: 1, fontSize: 12 }}>
                  <option value="">选择角色...</option>
                  {allRoles.filter(r => r.user_type === editUser.user_type && !userRoles.some(ur => ur.id === r.id))
                    .map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
                <button className="btn btn-primary btn-sm" onClick={handleAssignRole}
                  disabled={!selectedRoleId || roleAssignLoading}>
                  {roleAssignLoading ? '...' : '分配'}
                </button>
              </div>
            </div>
            )}

            {/* Workspaces (member only) */}
            {editUser.user_type === 'member' && canManageMembers && (
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6 }}>可访问工作区</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                  {userWorkspaces.map(w => (
                    <span key={w.id} style={{
                      fontSize: 11, padding: '3px 8px', background: 'var(--card-bg)', borderRadius: 4,
                      display: 'inline-flex', alignItems: 'center', gap: 4, border: '1px solid var(--border)',
                    }}>
                      {w.name}
                      <span onClick={() => handleRemoveWorkspace(w.id)}
                        style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1 }}>×</span>
                    </span>
                  ))}
                  {userWorkspaces.length === 0 && (
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>未分配工作区</span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="form-input" value={selectedWsId}
                    onChange={e => setSelectedWsId(e.target.value)}
                    style={{ flex: 1, fontSize: 12 }}>
                    <option value="">添加工作区...</option>
                    {allWorkspaces.filter(w => !userWorkspaces.some(uw => uw.id === w.id))
                      .map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                  <button className="btn btn-primary btn-sm" onClick={handleAddWorkspace}
                    disabled={!selectedWsId || wsAssignLoading}>
                    {wsAssignLoading ? '...' : '添加'}
                  </button>
                </div>
              </div>
            )}

            {/* Reset Password */}
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 6 }}>重置密码</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="form-input" type="password" placeholder="新密码（至少 8 位）"
                  value={resetPwValue}
                  onChange={e => setResetPwValue(e.target.value)}
                  style={{ flex: 1, fontSize: 12 }} />
                <button className="btn btn-ghost btn-sm" onClick={async () => {
                  if (resetPwValue.length < 8) { setEditError('密码至少 8 位'); return }
                  setResetPwLoading(true); setEditError('')
                  try {
                    await api.resetUserPassword(editUser.id, resetPwValue)
                    showToast('密码已重置'); setResetPwValue('')
                  } catch (e: any) {
                    setEditError(e.message || '重置失败')
                  } finally { setResetPwLoading(false) }
                }} disabled={resetPwLoading || !resetPwValue}>
                  {resetPwLoading ? '...' : '重置'}
                </button>
              </div>
            </div>

            {editError && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 12, textAlign: 'center' }}>{editError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditUser(null)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleSaveUser} disabled={editLoading}>
                {editLoading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment History Dialog */}
      <PaymentHistoryDialog user={payHistUser} onClose={() => setPayHistUser(null)} />

      {/* Points Dialog */}
      {pointsUser && (
        <div className="dialog-overlay" onClick={() => setPointsUser(null)}>
          <div className="dialog-box" style={{ width: 420, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">积分管理 — {pointsUser.display_name || pointsUser.username}</div>

            {pointsLoading ? (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>加载中...</div>
            ) : pointsData ? (
              <>
                <div style={{ fontSize: 13, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span>当前余额</span>
                    <span style={{ fontWeight: 700 }}>{pointsData.balance_display} 积分</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span>过期时间</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{pointsData.expires_at ? new Date(pointsData.expires_at).toLocaleDateString('zh-CN') : '无'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <span>已解锁明细</span>
                    <span>{pointsData.unlocked?.length || 0} 个</span>
                  </div>
                </div>

                {pointsData.unlocked && pointsData.unlocked.length > 0 && (
                  <div style={{ marginBottom: 12, maxHeight: 120, overflowY: 'auto', background: 'var(--bg-secondary)', borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>已解锁明细：</div>
                    {pointsData.unlocked.map((p: any) => (
                      <div key={p.project_id} style={{ fontSize: 11, padding: '2px 0', color: 'var(--text-secondary)' }}>
                        {p.project_name} · {(p.points_spent_deci / 10).toFixed(1)} 积分
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>会员到期时间</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-input" type="datetime-local"
                      value={expiryDate}
                      onChange={e => setExpiryDate(e.target.value)}
                      style={{ flex: 1, fontSize: 12 }} />
                    <button className="btn btn-primary btn-sm"
                      onClick={handleUpdateExpiry}
                      disabled={expirySaving || !isSuperAdmin}
                      style={{ whiteSpace: 'nowrap' }}>
                      {expirySaving ? '更新中...' : '更新到期'}
                    </button>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                    清空日期并保存 = 永久有效
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>修改积分余额</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-input" type="number" step="0.1" min="0"
                      value={pointsNewBalance}
                      onChange={e => setPointsNewBalance(e.target.value)}
                      style={{ flex: 1, fontSize: 12 }} />
                    <span style={{ fontSize: 12, alignSelf: 'center', color: 'var(--text-secondary)' }}>积分</span>
                  </div>
                </div>

                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>变更备注</label>
                  <input className="form-input" value={pointsNote}
                    onChange={e => setPointsNote(e.target.value)}
                    placeholder="如：手动调整、活动赠送等"
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 12 }} />
                </div>

                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 600 }}>赠送积分</label>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>汇率: 1元 = {pointsPerYuan} 积分</span>
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    直接增加积分，独立于余额设置，记录汇率以便计算收益
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <input className="form-input" type="number" step="0.1" min="0.1"
                      value={giftAmount}
                      onChange={e => setGiftAmount(e.target.value)}
                      placeholder="赠送积分数量"
                      style={{ flex: 1, fontSize: 12 }} />
                    <span style={{ fontSize: 12, alignSelf: 'center', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>积分</span>
                  </div>
                  <input className="form-input" value={giftNote}
                    onChange={e => setGiftNote(e.target.value)}
                    placeholder="赠送备注（可选）"
                    style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, marginBottom: 8 }} />
                  <button className="btn btn-primary btn-sm"
                    onClick={handleGrantPoints}
                    disabled={giftSaving || !isSuperAdmin}
                    style={{ width: '100%' }}>
                    {isSuperAdmin ? (giftSaving ? '赠送中...' : `确认赠送 ${giftAmount ? parseFloat(giftAmount).toFixed(1) : '0.0'} 积分`) : '仅超级管理员可操作'}
                  </button>
                </div>

                {pointsData.transactions && pointsData.transactions.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4 }}>积分流水</div>
                    <div style={{ maxHeight: 150, overflowY: 'auto', fontSize: 11 }}>
                      {pointsData.transactions.slice(0, 20).map((tx: any) => (
                        <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                          <span>
                            <span style={{ color: tx.amount_deci > 0 ? 'var(--success)' : 'var(--warning)' }}>
                              {tx.amount_deci > 0 ? '+' : ''}{(tx.amount_deci / 10).toFixed(1)}
                            </span>
                            <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>{typeLabel(tx.type)}</span>
                          </span>
                          <span style={{ color: 'var(--text-secondary)' }}>
                            {tx.created_at ? new Date(tx.created_at).toLocaleDateString('zh-CN') : ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)' }}>无积分数据</div>
            )}

            {pointsError && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 12, textAlign: 'center' }}>{pointsError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPointsUser(null)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleSetPoints} disabled={pointsSaving || !isSuperAdmin}>
                {isSuperAdmin ? (pointsSaving ? '保存中...' : '确认修改') : '仅超级管理员可修改'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create User Dialog */}
      {showCreate && (
        <div className="dialog-overlay" onClick={() => setShowCreate(false)}>
          <div className="dialog-box" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">新建{createUserType === 'admin' ? '管理员' : '会员'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input className="form-input" type="text" placeholder="用户名 *" value={createUsername}
                onChange={e => setCreateUsername(e.target.value)} autoFocus />
              <input className="form-input" type="password" placeholder="密码（至少 8 位）*" value={createPassword}
                onChange={e => setCreatePassword(e.target.value)} />
              <input className="form-input" type="text" placeholder="显示名 *" value={createDisplayName}
                onChange={e => setCreateDisplayName(e.target.value)} />
              <input className="form-input" type="email" placeholder="邮箱（可选）" value={createEmail}
                onChange={e => setCreateEmail(e.target.value)} />
              {createError && (
                <div style={{ fontSize: 11, color: 'var(--warning)', textAlign: 'center' }}>{createError}</div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={createLoading}>
                {createLoading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
