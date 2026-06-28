import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, Project } from '../services/api'
import { useModal } from '../components/ModalProvider'

const PAGE_SIZE = 20

function HomePage() {
  const modal = useModal()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const navigate = useNavigate()
  const overlayMouseDownRef = useRef(false)

  // Create dialog state
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createCopy, setCreateCopy] = useState(false)
  const [createSourceQuery, setCreateSourceQuery] = useState('')
  const [createSourceId, setCreateSourceId] = useState('')
  const [createSourceName, setCreateSourceName] = useState('')
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [creating, setCreating] = useState(false)
  const [srcDropdown, setSrcDropdown] = useState(false)
  const srcRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (srcRef.current && !srcRef.current.contains(e.target as Node)) {
        setSrcDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadProjects = (p: number) => {
    setLoading(true)
    api.listProjects(p, PAGE_SIZE)
      .then(data => {
        setProjects(data.projects)
        setTotal(data.total)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load projects:', err)
        setLoading(false)
      })
  }

  useEffect(() => { loadProjects(page) }, [page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openCreateDialog = async () => {
    setShowCreate(true)
    setCreateName('')
    setCreateCopy(false)
    setCreateSourceQuery('')
    setCreateSourceId('')
    setCreateSourceName('')
    setSrcDropdown(false)
    try {
      const data = await api.listProjects(1, 1000)
      setAllProjects(data.projects)
    } catch {}
  }

  const sourceMatches = createSourceQuery
    ? allProjects.filter(p => p.name.toLowerCase().includes(createSourceQuery.toLowerCase()))
    : allProjects

  const handleCreate = async () => {
    if (!createName.trim()) return
    setCreating(true)
    try {
      const project = await api.createProject(createName.trim())
      if (createCopy && createSourceId) {
        try {
          await api.copyProjectItems(project.id, createSourceId)
        } catch (e: any) {
          modal.toast('配置复制失败：' + e.message, 'error')
        }
      }
      setShowCreate(false)
      navigate(`/project/${project.id}`)
    } catch (err: any) {
      modal.toast('创建失败：' + err.message, 'error')
    } finally {
      setCreating(false)
    }
  }

  const copyProject = async (id: string, name: string) => {
    try {
      const result = await api.copyProject(id)
      const newId = (result as any).project?.id
      modal.toast(`已复制项目「${name}」`, 'success')
      loadProjects(page)
      if (newId) navigate(`/project/${newId}`)
    } catch (err: any) {
      modal.toast('复制失败：' + err.message, 'error')
    }
  }

  const deleteProject = async (id: string, name: string) => {
    const ok = await modal.confirm(`确认删除「${name}」？此操作不可撤销。`)
    if (!ok) return
    try {
      await api.deleteProject(id)
      setSelected(prev => { const s = new Set(prev); s.delete(id); return s })
      loadProjects(page)
    } catch (err: any) {
      modal.toast('删除失败：' + err.message, 'error')
    }
  }

  const batchDelete = async () => {
    if (selected.size === 0) return
    const ids = [...selected]
    const lockedNames = projects.filter(p => ids.includes(p.id) && p.is_locked).map(p => p.name)
    const unlockedCount = ids.length - lockedNames.length
    if (unlockedCount === 0) {
      modal.toast('所选项目均已锁定，无法删除', 'error')
      return
    }
    let msg = `确认删除 ${unlockedCount} 个项目？`
    if (lockedNames.length > 0) {
      msg += `\n${lockedNames.length} 个已锁定将跳过：${lockedNames.join('、')}`
    }
    const ok = await modal.confirm(msg)
    if (!ok) return
    try {
      const resp = await api.batchDeleteProjects(ids)
      setSelected(new Set())
      loadProjects(page)
      modal.toast((resp as any).message || `已删除 ${unlockedCount} 个项目`, 'success')
    } catch (err: any) {
      modal.toast('批量删除失败：' + err.message, 'error')
    }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev)
      s.has(id) ? s.delete(id) : s.add(id)
      return s
    })
  }

  const toggleAll = () => {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map(p => p.id)))
    }
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: '草稿', completed: '已完成' }
    return map[s] || s
  }

  const filtered = search
    ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects

  return (
    <div>
      <div className="proj-list-header">
        <input className="form-input" type="text" placeholder="搜索项目..."
          style={{ flex: 1, maxWidth: 300 }}
          value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn btn-primary btn-sm" onClick={openCreateDialog}>+ 新建项目</button>

      </div>

      {loading ? (
        <p style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 12 }}>加载中...</p>
      ) : (
        <div className="proj-list">
          {filtered.length > 0 && (
            <div className="proj-card" style={{ background: 'var(--bg-hover)', cursor: 'default', display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox"
                checked={filtered.length > 0 && selected.size === filtered.length}
                onChange={toggleAll}
                onClick={e => e.stopPropagation()} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {selected.size > 0 ? `已选 ${selected.size} 项` : '全选'}
              </span>
              {selected.size > 0 && (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button className="btn btn-outline btn-sm" onClick={async () => {
                    const ids = [...selected]
                    await Promise.all(ids.map(id => api.updateProject(id, { status: 'completed' })))
                    loadProjects(page)
                    setSelected(new Set())
                    modal.toast(`已标记 ${ids.length} 个项目为已完成`, 'success')
                  }}>批量完成</button>
                  <button className="btn btn-outline btn-sm" onClick={async () => {
                    const ids = [...selected]
                    await Promise.all(ids.map(id => api.updateProject(id, { status: 'draft' })))
                    loadProjects(page)
                    setSelected(new Set())
                    modal.toast(`已标记 ${ids.length} 个项目为草稿`, 'success')
                  }}>批量草稿</button>
                  <button className="btn btn-outline btn-sm" onClick={async () => {
                    const ids = [...selected]
                    await Promise.all(ids.map(id => api.updateProject(id, { is_locked: 1 })))
                    loadProjects(page)
                    setSelected(new Set())
                    modal.toast(`已锁定 ${ids.length} 个项目`, 'success')
                  }}>批量锁定</button>
                  <button className="btn btn-outline btn-sm" onClick={async () => {
                    const ids = [...selected]
                    await Promise.all(ids.map(id => api.updateProject(id, { is_locked: 0 })))
                    loadProjects(page)
                    setSelected(new Set())
                    modal.toast(`已解锁 ${ids.length} 个项目`, 'success')
                  }}>批量解锁</button>
                  <button className="btn btn-sm" onClick={batchDelete}
                    style={{ background: 'var(--warning)', color: '#fff', borderColor: 'var(--warning)' }}>
                    删除选中({selected.size})
                  </button>
                </div>
              )}
            </div>
          )}
          {filtered.map((p, i) => (
            <div key={p.id} className="proj-card">
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 28, textAlign: 'center' }}>{(page - 1) * PAGE_SIZE + i + 1}</span>
              <input type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggleSelect(p.id)}
                onClick={e => e.stopPropagation()}
                style={{ marginRight: 8 }} />
              {p.project_code && (
                <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--accent)', fontWeight: 600, background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 3, marginRight: 4 }}>{p.project_code}</span>
              )}
              <span className="pc-name" style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/project/${p.id}`)}>{p.name}</span>
              {p.copied_from_project_id && (
                <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 4 }} title="从其他项目复制">📋</span>
              )}
              <span className={`pc-status ${p.status}`}
                style={{ cursor: 'pointer' }}
                onClick={async e => {
                  e.stopPropagation()
                  const newStatus = p.status === 'completed' ? 'draft' : 'completed'
                  await api.updateProject(p.id, { status: newStatus })
                  loadProjects(page)
                }}>{statusLabel(p.status)}</span>
              <span className="pc-date">{new Date(p.updated_at).toLocaleDateString('zh-CN')}</span>
              <span className="pc-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button className="btn btn-ghost btn-sm"
                  onClick={e => { e.stopPropagation(); copyProject(p.id, p.name) }}
                  style={{ color: 'var(--accent)', fontSize: 11 }}
                  title="复制项目及其配置">复制</button>
                <span style={{
                    cursor: 'pointer', fontSize: 11, marginLeft: 4,
                    color: p.is_locked ? 'var(--warning)' : 'var(--text-secondary)',
                    fontWeight: p.is_locked ? 500 : 400,
                  }}
                  onClick={async e => {
                    e.stopPropagation()
                    const locked = p.is_locked ? 0 : 1
                    await api.updateProject(p.id, { is_locked: locked })
                    loadProjects(page)
                  }} title={p.is_locked ? '点击解锁' : '点击锁定'}>
                  {p.is_locked ? '已锁定' : '锁定'}
                </span>
                {!p.is_locked && (
                  <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); deleteProject(p.id, p.name) }}
                    style={{ color: 'var(--warning)' }}>删除</button>
                )}
              </span>
            </div>
          ))}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: 12 }}>
              <button className="btn btn-outline btn-sm" disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}>上一页</button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {page} / {totalPages}
              </span>
              <button className="btn btn-outline btn-sm" disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}>下一页</button>
            </div>
          )}
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 11 }}>
            {filtered.length === 0 ? '没有匹配的项目' : `共 ${total} 个项目`}
          </div>
        </div>
      )}

      {/* Create Project Dialog */}
      {showCreate && (
        <div className="dialog-overlay"
          onMouseDown={(e: any) => { overlayMouseDownRef.current = e.target === e.currentTarget }}
          onClick={() => { if (overlayMouseDownRef.current) setShowCreate(false) }}>
          <div className="dialog-box" style={{ width: 460, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">新建项目</div>

            <div className="form-group">
              <label className="form-label">项目名称</label>
              <input className="form-input" type="text"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && createName.trim()) handleCreate() }}
                placeholder="输入项目名称" autoFocus />
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={createCopy}
                  onChange={e => setCreateCopy(e.target.checked)} />
                从已有项目复制配置
              </label>
            </div>

            <div style={{
              maxHeight: createCopy ? 300 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.25s ease',
            }}>
              {createCopy && (
              <div className="form-group" ref={srcRef} style={{ minHeight: 0 }}>
                <label className="form-label">源项目</label>
                <input className="form-input" type="text"
                  value={createSourceQuery}
                  onChange={e => { setCreateSourceQuery(e.target.value); setSrcDropdown(true) }}
                  onFocus={() => setSrcDropdown(true)}
                  placeholder="输入关键词搜索项目..." />
                {srcDropdown && sourceMatches.length > 0 && (
                  <div style={{
                    maxHeight: 180, overflow: 'auto', background: 'var(--bg)',
                    border: '1px solid var(--border)', borderRadius: 6, marginTop: 2,
                  }}>
                    {sourceMatches.map(p => (
                      <div key={p.id}
                        onClick={() => {
                          setCreateSourceId(p.id)
                          setCreateSourceName(p.name)
                          setCreateSourceQuery(p.name)
                          setSrcDropdown(false)
                        }}
                        style={{
                          padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                          borderBottom: '1px solid var(--border)',
                          background: createSourceId === p.id ? 'var(--bg-hover)' : 'transparent',
                          display: 'flex', alignItems: 'center', gap: 8,
                        }}>
                        {p.project_code && (
                          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--accent)', fontWeight: 600, marginRight: 4 }}>{p.project_code}</span>
                        )}
                        <span style={{ fontWeight: 500, flex: 1 }}>{p.name}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                          {p.status === 'completed' ? '已完成' : '草稿'} · {new Date(p.created_at).toLocaleDateString('zh-CN')}
                        </span>
                        {p.copied_from_project_id && (
                          <span style={{ fontSize: 10, color: 'var(--accent)' }} title="副本">📋</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {createSourceId && (
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    已选择: <strong>{createSourceName}</strong>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setCreateSourceId('')
                      setCreateSourceName('')
                      setCreateSourceQuery('')
                    }} style={{ fontSize: 10, padding: '2px 6px' }}>清除</button>
                  </div>
                )}
              </div>
            )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCreate(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleCreate}
                disabled={!createName.trim() || creating}>
                {creating ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
