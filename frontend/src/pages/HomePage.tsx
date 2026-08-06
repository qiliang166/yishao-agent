import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api, Workspace } from '../services/api'
import { useModal } from '../components/ModalProvider'
import { usePermission } from '../hooks/usePermission'
import { useAuth } from '../contexts/AuthContext'
import HelpButton from '../components/HelpButton'
import SetupWizard from '../components/SetupWizard'
import SvgIcon from '../components/SvgIcon'

const PAGE_SIZE = 16

function HomePage() {
  const modal = useModal()
  const canCreate = usePermission('project.create')
  const canEditOwn = usePermission('project.edit_own')
  const canDeleteOwn = usePermission('project.delete_own')
  const { user } = useAuth()
  const isOwner = (createdBy: string | null | undefined): boolean => {
    if (!user) return false
    if (createdBy == null) return user.permissions?.includes('project.edit_all') ?? false
    if (user.permissions?.includes('project.edit_all')) return true
    return createdBy === user.user_id
  }
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const navigate = useNavigate()

  const canManageMembers = usePermission('member.manage')
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [createLogo, setCreateLogo] = useState('')
  const [createLogoUploading, setCreateLogoUploading] = useState(false)
  const [createStatus, setCreateStatus] = useState('draft')
  const [createRoleIds, setCreateRoleIds] = useState<string[]>([])
  const [memberRoles, setMemberRoles] = useState<{id:string;name:string}[]>([])
  const [creating, setCreating] = useState(false)
  const [showWizard, setShowWizard] = useState(false)
  const [sourceWorkspaceId, setSourceWorkspaceId] = useState('')
  const [sourceWorkspaceQuery, setSourceWorkspaceQuery] = useState('')
  const [showSourceDropdown, setShowSourceDropdown] = useState(false)
  const [allWorkspaces, setAllWorkspaces] = useState<Workspace[]>([])

  const loadWorkspaces = (p: number) => {
    setLoading(true)
    api.listWorkspaces(p, PAGE_SIZE)
      .then(data => {
        setWorkspaces(data.workspaces)
        setTotal(data.total)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load workspaces:', err)
        setLoading(false)
      })
  }

  const location = useLocation()

  useEffect(() => { loadWorkspaces(page) }, [page, location.pathname])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openCreateDialog = () => {
    setShowCreate(true)
    setCreateName('')
    setCreateDesc('')
    setCreateLogo('')
    setCreateStatus('draft')
    setCreateRoleIds([])
    setSourceWorkspaceId('')
    setSourceWorkspaceQuery('')
    setShowSourceDropdown(false)
    if (canManageMembers) {
      api.listRoles('member').then(roles => setMemberRoles(roles as {id:string;name:string}[])).catch(() => {})
    }
    api.listWorkspaces(1, 200).then(data => setAllWorkspaces(data.workspaces)).catch(() => {})
  }

  const handleCreate = async () => {
    if (!createName.trim()) return
    setCreating(true)
    try {
      const ws = await api.createWorkspace(createName.trim(), createDesc.trim(), createLogo.trim(), createStatus, createRoleIds.length > 0 ? createRoleIds : undefined, sourceWorkspaceId || undefined)
      setShowCreate(false)
      navigate(`/workspace/${ws.id}`)
    } catch (err: any) {
      modal.toast('创建失败：' + err.message, 'error')
    } finally { setCreating(false) }
  }

  const deleteWorkspace = async (id: string, name: string) => {
    if (!await modal.confirm(`确认删除「${name}」？其下所有明细将被一并删除，此操作不可撤销。`)) return
    try {
      await api.deleteWorkspace(id)
      loadWorkspaces(page)
    } catch (err: any) { modal.toast('删除失败：' + err.message, 'error') }
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: '草稿', completed: '已完成' }
    return map[s] || s
  }

  const filtered = search
    ? workspaces.filter(w => w.name.toLowerCase().includes(search.toLowerCase()))
    : workspaces

  return (
    <div>
      <div className="proj-list-header">
        <input className="form-input" type="text" placeholder="搜索项目..."
          style={{ flex: 1, maxWidth: 300 }}
          value={search} onChange={e => setSearch(e.target.value)} />
        <HelpButton location="home" />
        {canCreate && (
          <button className="btn btn-primary btn-sm" onClick={openCreateDialog}>+ 新建项目</button>
        )}
      </div>

      {loading ? (
        <p style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>加载中...</p>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-secondary)' }}>
          <div style={{ marginBottom: 12 }}><SvgIcon name="folder" size={40} /></div>
          <div style={{ fontSize: 14, marginBottom: 8 }}>暂无项目</div>
          <div style={{ fontSize: 12, marginBottom: 16 }}>点击「快速上手」跟随向导完成第一个培训项目</div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={() => setShowWizard(true)}>快速上手</button>
            {canCreate && <button className="btn btn-ghost" onClick={openCreateDialog}>+ 新建项目</button>}
          </div>
        </div>
      ) : (
        <>
          <div style={{
            background: 'var(--bg-secondary)',
            borderRadius: 12,
            padding: 20,
            margin: '16px 20px',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 20,
            }}>
              {filtered.map(w => (
              <div key={w.id}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 24,
                  cursor: 'pointer',
                  background: 'var(--bg)',
                  transition: 'box-shadow 0.15s, transform 0.15s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
                  ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.boxShadow = ''
                  ;(e.currentTarget as HTMLElement).style.transform = ''
                }}
                onClick={() => navigate(`/workspace/${w.id}`)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  {w.logo ? (
                    <img src={w.logo} style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} alt="" />
                  ) : (
                    <SvgIcon name="folder" size={28} />
                  )}
                  <span style={{ fontSize: 15, fontWeight: 600, wordBreak: 'break-word', minWidth: 0 }}>
                    {w.name}
                  </span>
                  <span style={{
                    marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 10, flexShrink: 0,
                    background: w.status === 'completed' ? 'rgba(34,197,94,0.12)' : 'rgba(148,163,184,0.12)',
                    color: w.status === 'completed' ? 'var(--success)' : 'var(--text-secondary)'
                  }}>
                    {statusLabel(w.status)}
                  </span>
                </div>
                <div style={{
                  fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.6,
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  overflow: 'hidden', wordBreak: 'break-word', minHeight: 38,
                }}>
                  {w.description || '暂无简介'}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}
                  onClick={e => e.stopPropagation()}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                    onClick={() => navigate(`/workspace/${w.id}`)}>进入</button>
                  {canDeleteOwn && isOwner(w.created_by) && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--warning)' }}
                      onClick={() => deleteWorkspace(w.id, w.name)}>删除</button>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-secondary)' }}>
                    <SvgIcon name="file" size={11} /> {w.project_count ?? 0} 个明细
                  </span>
                </div>
              </div>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 20 }}>
              <button className="btn btn-outline btn-sm" disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{page} / {totalPages}</span>
              <button className="btn btn-outline btn-sm" disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          )}

          <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 11 }}>
            共 {total} 个项目
          </div>
        </>
      )}

      {showCreate && (
        <div className="dialog-overlay"
          onClick={e => { if (e.target === e.currentTarget) setShowCreate(false) }}>
          <div className="dialog-box" style={{ width: 440 }}>
            <div className="dialog-title">新建项目</div>
            <div className="form-group">
              <label className="form-label">项目名称</label>
              <input className="form-input" type="text"
                value={createName} onChange={e => setCreateName(e.target.value)}
                placeholder="如：门店培训、餐饮教案" autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">项目图标</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {createLogo ? (
                  <>
                    <img src={createLogo} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} alt="" />
                    <button className="btn btn-ghost btn-sm" onClick={() => setCreateLogo('')}>移除</button>
                  </>
                ) : (
                  <span style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}><SvgIcon name="image" size={22} /></span>
                )}
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  {createLogoUploading ? '上传中...' : '上传图片'}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setCreateLogoUploading(true)
                      try {
                        const data = await api.uploadLogo(file)
                        setCreateLogo(data.url)
                      } catch (err: any) {
                        modal.toast('上传失败: ' + err.message, 'error')
                      } finally {
                        setCreateLogoUploading(false)
                      }
                    }} />
                </label>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">项目简介</label>
              <textarea className="form-input" rows={4} value={createDesc}
                onChange={e => setCreateDesc(e.target.value)}
                placeholder="简要描述该项目的用途和内容..."
                style={{ resize: 'vertical' }} />
            </div>
            <div className="form-group">
              <label className="form-label">复制配置自</label>
              {sourceWorkspaceId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg-secondary)', borderRadius: 6, fontSize: 13 }}>
                  <span style={{ flex: 1 }}>{allWorkspaces.find(w => w.id === sourceWorkspaceId)?.name || sourceWorkspaceId}</span>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--text-secondary)' }}
                    onClick={() => { setSourceWorkspaceId(''); setSourceWorkspaceQuery('') }}>清除</button>
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <input className="form-input" type="text"
                    value={sourceWorkspaceQuery}
                    onChange={e => { setSourceWorkspaceQuery(e.target.value); setShowSourceDropdown(true) }}
                    onFocus={() => setShowSourceDropdown(true)}
                    onBlur={() => setTimeout(() => setShowSourceDropdown(false), 200)}
                    placeholder="搜索并选择工作区（留空则使用默认配置）" />
                  {showSourceDropdown && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                      background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6,
                      maxHeight: 180, overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                      {(sourceWorkspaceQuery
                        ? allWorkspaces.filter(w => w.name.toLowerCase().includes(sourceWorkspaceQuery.toLowerCase()))
                        : allWorkspaces
                      ).map(w => (
                        <div key={w.id}
                          style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--border)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}
                          onMouseDown={() => { setSourceWorkspaceId(w.id); setSourceWorkspaceQuery(w.name); setShowSourceDropdown(false) }}>
                          {w.name}
                        </div>
                      ))}
                      {allWorkspaces.length === 0 && (
                        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-secondary)' }}>暂无工作区</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                选择已有工作区，将其提示词、演讲、语音等配置复制到新项目
              </div>
            </div>
            {canManageMembers && memberRoles.length > 0 && (
              <div className="form-group">
                <label className="form-label">可见角色</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {memberRoles.map(r => {
                    const checked = createRoleIds.includes(r.id)
                    return (
                      <label key={r.id} style={{
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                        background: checked ? 'var(--primary-light)' : 'var(--card-bg)',
                        border: checked ? '1px solid var(--primary)' : '1px solid var(--border)',
                        color: checked ? 'var(--primary)' : 'var(--text-secondary)',
                        fontWeight: checked ? 600 : 400,
                      }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setCreateRoleIds(prev =>
                            prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                          )}
                          style={{ display: 'none' }} />
                        {r.name}
                      </label>
                    )
                  })}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                  勾选后，该角色下所有会员将自动可见此项目
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">状态</label>
              <select className="form-input" value={createStatus} onChange={e => setCreateStatus(e.target.value)}>
                <option value="draft">草稿</option>
                <option value="completed">已完成</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleCreate} disabled={!createName.trim() || creating}>
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showWizard && <SetupWizard onDone={() => { setShowWizard(false); loadWorkspaces(1) }} />}
    </div>
  )
}

export default HomePage
