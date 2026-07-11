import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'

interface RoleItem {
  id: string
  name: string
  description: string
  user_type: string
  is_system: number
  permissions: string[]
}

const PERMISSION_GROUPS: { group: string; codes: { code: string; label: string }[] }[] = [
  {
    group: '项目管理', codes: [
      { code: 'project.create', label: '新建项目' },
      { code: 'project.edit_own', label: '编辑/删除自己的项目' },
      { code: 'project.delete_own', label: '删除自己的项目' },
      { code: 'project.view_all', label: '查看所有项目' },
      { code: 'project.edit_all', label: '编辑/删除任何项目（仅超管）' },
    ]
  },
  {
    group: '项目配置', codes: [
      { code: 'config.project', label: '修改项目级配置' },
      { code: 'config.global', label: '修改全局设置' },
    ]
  },
  {
    group: '素材输入 (Stage1)', codes: [
      { code: 'stage1.view', label: '浏览素材' },
      { code: 'stage1.generate', label: '上传/提取/编辑素材' },
    ]
  },
  {
    group: '文档生成 (Stage2)', codes: [
      { code: 'stage2.view', label: '浏览文档' },
      { code: 'stage2.generate', label: '生成/编辑文档' },
    ]
  },
  {
    group: '课件输出 (Stage3)', codes: [
      { code: 'stage3.view', label: '浏览课件' },
      { code: 'stage3.generate', label: '生成/编辑课件' },
    ]
  },
  {
    group: '演讲课件 (Stage4)', codes: [
      { code: 'stage4.view', label: '浏览/播放' },
      { code: 'stage4.generate', label: 'TTS 语音合成' },
    ]
  },
  {
    group: '输出', codes: [
      { code: 'stage5.view', label: '浏览输出文件' },
      { code: 'stage5.download', label: '下载文件' },
    ]
  },
  {
    group: '工具', codes: [
      { code: 'template.manage', label: '模板管理' },
      { code: 'prompt.manage', label: '提示词工作室' },
    ]
  },
  {
    group: '管理', codes: [
      { code: 'member.manage', label: '会员管理' },
      { code: 'role.manage', label: '角色管理' },
    ]
  },
]

export default function RoleManagePage() {
  const [roles, setRoles] = useState<RoleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  // Create dialog
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createType, setCreateType] = useState('admin')
  const [createError, setCreateError] = useState('')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  const loadRoles = () => {
    setLoading(true)
    api.listRoles()
      .then(data => setRoles(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { loadRoles() }, [])

  const handleCreate = async () => {
    if (!createName.trim()) { setCreateError('角色名不能为空'); return }
    setActionLoading(true)
    setCreateError('')
    try {
      await api.createRole({ name: createName.trim(), description: createDesc.trim(), user_type: createType })
      showToast('角色已创建')
      setShowCreate(false)
      setCreateName('')
      setCreateDesc('')
      loadRoles()
    } catch (e: any) {
      setCreateError(e.message || '创建失败')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (r: RoleItem) => {
    if (!confirm(`确定删除角色 "${r.name}" 吗？`)) return
    try {
      await api.deleteRole(r.id)
      showToast('角色已删除')
      loadRoles()
    } catch (e: any) {
      showToast(e.message || '删除失败')
    }
  }

  const handleTogglePerm = async (role: RoleItem, code: string, has: boolean) => {
    try {
      if (has) {
        await api.removeRolePermission(role.id, code)
      } else {
        // auto-add view if adding generate
        if (code.endsWith('.generate')) {
          const viewCode = code.replace('.generate', '.view')
          if (!role.permissions.includes(viewCode)) {
            await api.addRolePermission(role.id, viewCode)
          }
        }
        await api.addRolePermission(role.id, code)
      }
      showToast(has ? '权限已移除' : '权限已添加')
      loadRoles()
    } catch (e: any) {
      showToast(e.message || '操作失败')
    }
  }

  const adminRoles = roles.filter(r => r.user_type === 'admin')
  const memberRoles = roles.filter(r => r.user_type === 'member')

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>角色管理</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ 创建角色</button>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: 'var(--primary)', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
      ) : (
        <>
          {/* Admin roles */}
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>管理员角色</h2>
          {adminRoles.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 24 }}>暂无管理员角色</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
              {adminRoles.map((r) => (
                <RoleCard key={r.id} role={r} expanded={expandedId === r.id}
                  onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  onTogglePerm={handleTogglePerm} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {/* Member roles */}
          <h2 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>会员角色</h2>
          {memberRoles.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>暂无会员角色</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {memberRoles.map((r) => (
                <RoleCard key={r.id} role={r} expanded={expandedId === r.id}
                  onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  onTogglePerm={handleTogglePerm} onDelete={handleDelete} />
              ))}
            </div>
          )}

          {roles.length === 0 && (
            <div style={{
              textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 12,
            }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🛡</div>
              <p>暂无自定义角色</p>
            </div>
          )}
        </>
      )}

      {/* Create Role Dialog */}
      {showCreate && (
        <div className="dialog-overlay" onClick={() => setShowCreate(false)}>
          <div className="dialog-box" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">创建角色</div>

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4 }}>角色名</label>
            <input className="form-input" value={createName} onChange={e => setCreateName(e.target.value)}
              placeholder="如：高级编辑员" style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }} />

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 12 }}>描述（可选）</label>
            <input className="form-input" value={createDesc} onChange={e => setCreateDesc(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }} />

            <label style={{ fontSize: 11, fontWeight: 600, display: 'block', marginBottom: 4, marginTop: 12 }}>用户层级</label>
            <select className="form-input" value={createType} onChange={e => setCreateType(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 11 }}>
              <option value="admin">管理员 (admin)</option>
              <option value="member">会员 (member)</option>
            </select>

            {createError && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 12, textAlign: 'center' }}>{createError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={actionLoading}>
                {actionLoading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RoleCard({ role, expanded, onToggle, onTogglePerm, onDelete }: {
  role: RoleItem
  expanded: boolean
  onToggle: () => void
  onTogglePerm: (role: RoleItem, code: string, has: boolean) => void
  onDelete: (role: RoleItem) => void
}) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div
        onClick={onToggle}
        style={{
          padding: '14px 20px', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>
            {role.is_system ? '🔒 ' : ''}{role.name}
          </div>
          {role.description && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{role.description}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{role.permissions.length} 个权限</span>
          <span style={{ fontSize: 14, color: 'var(--text-secondary)', transform: expanded ? 'rotate(90deg)' : '' }}>▶</span>
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 20px 16px 20px', borderTop: '1px solid var(--border)' }}>
          {PERMISSION_GROUPS.map((group) => (
            <div key={group.group} style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                {group.group}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {group.codes.map(({ code, label }) => {
                  const has = role.permissions.includes(code)
                  return (
                    <label key={code} style={{
                      fontSize: 11, padding: '4px 8px', borderRadius: 4,
                      cursor: role.is_system ? 'default' : 'pointer',
                      background: has ? 'var(--primary)' : 'var(--card-bg)',
                      color: has ? '#fff' : 'var(--text-secondary)',
                      border: has ? '1px solid var(--primary)' : '1px solid var(--border)',
                      opacity: role.is_system ? 0.8 : 1,
                      userSelect: 'none',
                    }}>
                      <input type="checkbox" checked={has}
                        onChange={() => !role.is_system && onTogglePerm(role, code, has)}
                        disabled={!!role.is_system}
                        style={{ display: 'none' }} />
                      {label}
                    </label>
                  )
                })}
              </div>
            </div>
          ))}

          {!role.is_system && (
            <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => onDelete(role)}
                style={{ color: 'var(--warning)', fontSize: 11 }}>
                删除角色
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
