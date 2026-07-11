import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import { usePermission } from '../hooks/usePermission'

interface UserItem {
  id: string
  username: string
  display_name: string
  email: string
  user_type: string
  is_active: number
  is_approved: number
  expires_at: string | null
  created_at: string
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

export default function UserManagePage() {
  const canManageMembers = usePermission('member.manage')
  const canManageRoles = usePermission('role.manage')
  const [tab, setTab] = useState<'admin' | 'member'>('admin')
  const [users, setUsers] = useState<UserItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  // Edit dialog
  const [editUser, setEditUser] = useState<UserItem | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [userRoles, setUserRoles] = useState<{id:string;name:string}[]>([])
  const [allRoles, setAllRoles] = useState<RoleItem[]>([])
  const [userWorkspaces, setUserWorkspaces] = useState<WorkspaceItem[]>([])
  const [allWorkspaces, setAllWorkspaces] = useState<WorkspaceItem[]>([])
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState('')

  // Payment dialog
  const [payUser, setPayUser] = useState<UserItem | null>(null)
  const [payAmount, setPayAmount] = useState('29.90')
  const [payPlan, setPayPlan] = useState('月费套餐')
  const [payDays, setPayDays] = useState(30)
  const [payMethod, setPayMethod] = useState('微信支付')
  const [payNote, setPayNote] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState('')

  // Role assignment
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [roleAssignLoading, setRoleAssignLoading] = useState(false)

  // Workspace assignment
  const [selectedWsId, setSelectedWsId] = useState('')
  const [wsAssignLoading, setWsAssignLoading] = useState(false)

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

  const openEdit = async (u: UserItem) => {
    setEditUser(u)
    setEditDisplayName(u.display_name)
    setEditEmail(u.email || '')
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
      await api.updateUser(editUser.id, {
        display_name: editDisplayName,
        email: editEmail,
      })
      showToast('用户信息已更新')
      setEditUser(null)
      loadUsers()
    } catch (e: any) {
      setEditError(e.message || '保存失败')
    } finally {
      setEditLoading(false)
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

  const openPayment = (u: UserItem) => {
    setPayUser(u)
    setPayAmount('29.90')
    setPayPlan('月费套餐')
    setPayDays(30)
    setPayMethod('微信支付')
    setPayNote('')
    setPayError('')
  }

  const handlePayment = async () => {
    if (!payUser) return
    setPayLoading(true)
    setPayError('')
    try {
      const amount = Math.round(parseFloat(payAmount) * 100)
      if (isNaN(amount) || amount <= 0) {
        setPayError('金额无效')
        setPayLoading(false)
        return
      }
      await api.recordPayment(payUser.id, {
        amount_cents: amount,
        plan_name: payPlan,
        duration_days: payDays,
        payment_method: payMethod,
        note: payNote,
      })
      showToast('付费记录成功')
      setPayUser(null)
      loadUsers()
    } catch (e: any) {
      setPayError(e.message || '操作失败')
    } finally {
      setPayLoading(false)
    }
  }

  const expiresBadge = (u: UserItem) => {
    if (!u.expires_at) return null
    const now = new Date()
    const exp = new Date(u.expires_at)
    const diff = exp.getTime() - now.getTime()
    const days = diff / (86400 * 1000)
    if (diff < 0) {
      return <span style={{ fontSize: 10, color: '#fff', background: 'var(--warning)', padding: '1px 6px', borderRadius: 3, marginLeft: 8 }}>已过期</span>
    }
    if (days <= 7) {
      return <span style={{ fontSize: 10, color: '#fff', background: '#f0ad4e', padding: '1px 6px', borderRadius: 3, marginLeft: 8 }}>{Math.floor(days)}天后到期</span>
    }
    return <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 8 }}>{Math.floor(days)}天后到期</span>
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px 0' }}>用户管理</h1>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: 'var(--primary)', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => { setTab('admin'); setPage(1) }}
          style={{
            padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === 'admin' ? 700 : 400,
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
            fontSize: 13, fontWeight: tab === 'member' ? 700 : 400,
            color: tab === 'member' ? 'var(--primary)' : 'var(--text-secondary)',
            borderBottom: tab === 'member' ? '2px solid var(--primary)' : '2px solid transparent',
          }}
        >
          会员
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
      ) : users.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 14,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>{tab === 'admin' ? '🛡' : '👤'}</div>
          <p>{tab === 'admin' ? '暂无其他管理员账号' : '暂无会员'}</p>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {users.map((u) => (
              <div
                key={u.id}
                className="card"
                style={{
                  padding: '16px 20px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  opacity: u.is_active ? 1 : 0.5,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {u.display_name}
                    <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 8, fontSize: 12 }}>
                      @{u.username}
                    </span>
                    {!u.is_active && (
                      <span style={{ fontSize: 10, color: '#fff', background: '#999', padding: '1px 6px', borderRadius: 3, marginLeft: 8 }}>已停用</span>
                    )}
                    {!u.is_approved && (
                      <span style={{ fontSize: 10, color: '#fff', background: 'var(--warning)', padding: '1px 6px', borderRadius: 3, marginLeft: 8 }}>待审批</span>
                    )}
                    {expiresBadge(u)}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {u.email || '无邮箱'} · {u.roles?.map(r => r.name).join(', ') || '无角色'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(canManageMembers || canManageRoles) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>编辑</button>
                  )}
                  {tab === 'member' && canManageMembers && (
                    <button className="btn btn-ghost btn-sm" onClick={() => openPayment(u)}
                      style={{ color: 'var(--primary)' }}>付费</button>
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

      {/* Edit User Dialog */}
      {editUser && (
        <div className="dialog-overlay" onClick={() => setEditUser(null)}>
          <div className="dialog-box" style={{ width: 500, maxHeight: '80vh', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">编辑用户 — @{editUser.username}</div>

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>显示名</label>
            <input className="form-input" value={editDisplayName} onChange={e => setEditDisplayName(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} />

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 12 }}>邮箱</label>
            <input className="form-input" value={editEmail} onChange={e => setEditEmail(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} />

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

      {/* Payment Dialog */}
      {payUser && (
        <div className="dialog-overlay" onClick={() => setPayUser(null)}>
          <div className="dialog-box" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">记录付费 — @{payUser.username}</div>
            <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
              当前到期：{payUser.expires_at ? new Date(payUser.expires_at).toLocaleString('zh-CN') : '永久'}
            </p>

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>金额（元）</label>
            <input className="form-input" value={payAmount} onChange={e => setPayAmount(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} />

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 12 }}>套餐名</label>
            <input className="form-input" value={payPlan} onChange={e => setPayPlan(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} />

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 12 }}>续期天数</label>
            <input className="form-input" type="number" min={1} max={3650} value={payDays}
              onChange={e => setPayDays(Number(e.target.value))}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} />

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 12 }}>支付方式</label>
            <input className="form-input" value={payMethod} onChange={e => setPayMethod(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }} />

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 12 }}>备注（可选）</label>
            <textarea className="form-input" rows={2} value={payNote} onChange={e => setPayNote(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, resize: 'vertical' }} />

            {payError && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 12, textAlign: 'center' }}>{payError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPayUser(null)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handlePayment} disabled={payLoading}>
                {payLoading ? '处理中...' : '确认记录'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
