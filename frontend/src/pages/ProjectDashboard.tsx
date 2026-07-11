import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, Project } from '../services/api'
import { useModal } from '../components/ModalProvider'
import { usePermission } from '../hooks/usePermission'
import { useAuth } from '../contexts/AuthContext'
import HelpButton from '../components/HelpButton'

const PAGE_SIZE = 20

export default function ProjectDashboard() {
  const { wid } = useParams<{ wid: string }>()
  const modal = useModal()
  const canCreate = usePermission('project.create')
  const canEditOwn = usePermission('project.edit_own')
  const canDeleteOwn = usePermission('project.delete_own')
  const canDownload = usePermission('stage5.download')
  const canView4 = usePermission('stage4.view')
  const { user } = useAuth()
  const isOwner = (createdBy: string | null | undefined): boolean => {
    if (!user) return false
    if (createdBy == null) return user.permissions?.includes('project.edit_all') ?? false
    if (user.permissions?.includes('project.edit_all')) return true
    return createdBy === user.user_id
  }
  const isMember = user?.user_type === 'member'
  const projectUrl = (id: string) => isMember ? `/app/project/${id}` : `/project/${id}/workspace`
  const [workspace, setWorkspace] = useState<any>(null)
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
  // Expand project row to show output files
  const [expandedProject, setExpandedProject] = useState('')
  const [projectFiles, setProjectFiles] = useState<any[]>([])
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [loadingFiles, setLoadingFiles] = useState(false)

  const [createName, setCreateName] = useState('')
  const [createCopy, setCreateCopy] = useState(false)
  const [createSourceQuery, setCreateSourceQuery] = useState('')
  const [createSourceId, setCreateSourceId] = useState('')
  const [createSourceName, setCreateSourceName] = useState('')
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [creating, setCreating] = useState(false)
  const [srcDropdown, setSrcDropdown] = useState(false)
  const srcRef = useRef<HTMLDivElement>(null)

  // File list search & multi-select within expanded project
  const [fileSearch, setFileSearch] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set())
  const [playingAudio, setPlayingAudio] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)

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

  useEffect(() => {
    if (!wid) return
    api.getWorkspace(wid).then(setWorkspace).catch(() => {})
  }, [wid])

  const loadProjects = (p: number) => {
    if (!wid) return
    setLoading(true)
    api.listProjects(p, PAGE_SIZE, wid)
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

  useEffect(() => { if (wid) loadProjects(page) }, [page, wid])

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
      const data = await api.listProjects(1, 1000, wid)
      setAllProjects(data.projects)
    } catch {}
  }

  const sourceMatches = createSourceQuery
    ? allProjects.filter(p => p.name.toLowerCase().includes(createSourceQuery.toLowerCase()))
    : allProjects

  const handleCreate = async () => {
    if (!createName.trim() || !wid) return
    setCreating(true)
    try {
      const project = await api.createProject(createName.trim(), wid)
      if (createCopy && createSourceId) {
        try {
          await api.copyProjectItems(project.id, createSourceId)
        } catch (e: any) {
          modal.toast('配置复制失败：' + e.message, 'error')
        }
      }
      setShowCreate(false)
      navigate(projectUrl(project.id))
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
      modal.toast(`已复制明细「${name}」`, 'success')
      loadProjects(page)
      if (newId) navigate(projectUrl(newId))
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
      modal.toast('所选明细均已锁定，无法删除', 'error')
      return
    }
    let msg = `确认删除 ${unlockedCount} 条明细？`
    if (lockedNames.length > 0) {
      msg += `\n${lockedNames.length} 条明细已锁定将跳过：${lockedNames.join('、')}`
    }
    const ok = await modal.confirm(msg)
    if (!ok) return
    try {
      const resp = await api.batchDeleteProjects(ids)
      setSelected(new Set())
      loadProjects(page)
      modal.toast((resp as any).message || `已删除 ${unlockedCount} 条明细`, 'success')
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

  const formatSize = (bytes?: number) => {
    if (bytes == null) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1048576).toFixed(1)} MB`
  }

  const toggleProjectExpand = async (pid: string) => {
    if (expandedProject === pid) {
      setExpandedProject('')
      setFileSearch('')
      setSelectedFiles(new Set())
      return
    }
    setExpandedProject(pid)
    setFileSearch('')
    setSelectedFiles(new Set())
    setLoadingFiles(true)
    try {
      const data = await api.getProjectFiles(pid) as any
      setProjectFiles(data.files || [])
      const sources = [...new Set<string>((data.files || []).map((f: any) => f.category || f.type))]
      setExpandedGroups(new Set<string>(sources))
    } catch { setProjectFiles([]) }
    finally { setLoadingFiles(false) }
  }

  const fileKey = (f: any) => f.download_url || f.filename

  const deleteFile = async (pid: string, f: any) => {
    const key = fileKey(f)
    try {
      await api.deleteProjectFile(pid, f.filename)
      setProjectFiles(prev => prev.filter(x => fileKey(x) !== key))
      setSelectedFiles(prev => { const s = new Set(prev); s.delete(key); return s })
    } catch (e: any) { modal.toast('删除失败: ' + (e?.message || e), 'error') }
  }

  const batchDeleteFiles = async () => {
    if (selectedFiles.size === 0) return
    const keys = [...selectedFiles]
    const ok = await modal.confirm(`确认删除 ${keys.length} 个文件？`)
    if (!ok) return
    let deleted = 0
    for (const key of keys) {
      try {
        const f = projectFiles.find(x => fileKey(x) === key)
        if (f) {
          await api.deleteProjectFile(expandedProject, f.filename)
          deleted++
        }
      } catch {}
    }
    setProjectFiles(prev => prev.filter(f => !selectedFiles.has(fileKey(f))))
    setSelectedFiles(new Set())
    if (deleted > 0) modal.toast(`已删除 ${deleted} 个文件`, 'success')
  }

  const handleAudioToggle = (audioUrl: string) => {
    if (!audioRef.current || audioRef.current.src !== audioUrl) {
      if (audioRef.current) { audioRef.current.pause() }
      const a = new Audio(audioUrl)
      a.onended = () => setPlayingAudio('')
      a.onpause = () => setPlayingAudio('')
      a.onplay = () => setPlayingAudio(audioUrl)
      audioRef.current = a
      a.play().catch(() => {})
    } else if (audioRef.current.paused) {
      audioRef.current.play().catch(() => {})
    } else {
      audioRef.current.pause()
    }
  }

  const toggleFileSelect = (key: string) => {
    setSelectedFiles(prev => {
      const s = new Set(prev)
      s.has(key) ? s.delete(key) : s.add(key)
      return s
    })
  }

  const toggleAllFiles = (files: any[]) => {
    const keys = files.map(f => fileKey(f))
    if (selectedFiles.size === keys.length && keys.length > 0) {
      setSelectedFiles(new Set())
    } else {
      setSelectedFiles(new Set(keys))
    }
  }

  const downloadSelectedFiles = async () => {
    const selected = projectFiles.filter(f => selectedFiles.has(fileKey(f)))
    if (selected.length === 0) return
    try {
      await api.downloadSelectedFiles(expandedProject, selected.map(f => ({
        filename: f.filename,
        download_url: f.download_url || '',
        display_name: f.display_name || f.filename,
      })))
      modal.toast(`已打包下载 ${selected.length} 个文件`, 'success')
    } catch (e) { modal.toast(`下载失败: ${e}`, 'error') }
  }

  const fileIcon = (f: any) => {
    const cat = f.category || ''
    if (cat.includes('素材输入')) return '📥'
    if (cat.includes('文档生成')) return '📝'
    if (cat.includes('课件输出')) return '📌'
    if (cat.includes('演讲课件')) return '🎵'
    return '📄'
  }

  const groupedFiles = projectFiles.reduce((acc: Record<string, any[]>, f: any) => {
    const g = f.category || f.type || '其他'
    if (!acc[g]) acc[g] = []
    acc[g].push(f)
    return acc
  }, {})

  const filtered = search
    ? projects.filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
    : projects

  const filteredProjectFiles = fileSearch
    ? projectFiles.filter(f => f.filename.toLowerCase().includes(fileSearch.toLowerCase()))
    : projectFiles

  if (!workspace) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>
  }

  return (
    <div>
      <div className="proj-list-header">
        <input className="form-input" type="text" placeholder="搜索明细..."
          style={{ flex: 1, maxWidth: 300 }}
          value={search} onChange={e => setSearch(e.target.value)} />
        <HelpButton location="dashboard" />
        {canCreate && <button className="btn btn-primary btn-sm" onClick={openCreateDialog}>+ 新建明细</button>}

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
                  {canEditOwn && (
                    <>
                      <button className="btn btn-outline btn-sm" onClick={async () => {
                        const ids = [...selected]
                        await Promise.all(ids.map(id => api.updateProject(id, { status: 'completed' })))
                        loadProjects(page)
                        setSelected(new Set())
                        modal.toast(`已标记 ${ids.length} 条明细为已完成`, 'success')
                      }}>批量完成</button>
                      <button className="btn btn-outline btn-sm" onClick={async () => {
                        const ids = [...selected]
                        await Promise.all(ids.map(id => api.updateProject(id, { status: 'draft' })))
                        loadProjects(page)
                        setSelected(new Set())
                        modal.toast(`已标记 ${ids.length} 条明细为草稿`, 'success')
                      }}>批量草稿</button>
                      <button className="btn btn-outline btn-sm" onClick={async () => {
                        const ids = [...selected]
                        await Promise.all(ids.map(id => api.updateProject(id, { is_locked: 1 })))
                        loadProjects(page)
                        setSelected(new Set())
                        modal.toast(`已锁定 ${ids.length} 条明细`, 'success')
                      }}>批量锁定</button>
                      <button className="btn btn-outline btn-sm" onClick={async () => {
                        const ids = [...selected]
                        await Promise.all(ids.map(id => api.updateProject(id, { is_locked: 0 })))
                        loadProjects(page)
                        setSelected(new Set())
                        modal.toast(`已解锁 ${ids.length} 条明细`, 'success')
                      }}>批量解锁</button>
                    </>
                  )}
                  {canDeleteOwn && (
                    <button className="btn btn-sm" onClick={batchDelete}
                      style={{ background: 'var(--warning)', color: '#fff', borderColor: 'var(--warning)' }}>
                      删除选中({selected.size})
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {filtered.map((p, i) => (
            <div key={p.id}>
              <div className="proj-card" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  onClick={() => toggleProjectExpand(p.id)}
                  style={{ cursor: 'pointer', fontSize: 10, minWidth: 16, textAlign: 'center', userSelect: 'none', color: expandedProject === p.id ? 'var(--accent)' : 'var(--text-secondary)' }}>
                  {expandedProject === p.id ? '▼' : '▶'}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', minWidth: 28, textAlign: 'center' }}>{(page - 1) * PAGE_SIZE + i + 1}</span>
                <input type="checkbox"
                  checked={selected.has(p.id)}
                  onChange={() => toggleSelect(p.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ marginRight: 8 }} />
                {p.project_code && (
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginRight: 4 }}>{p.project_code}</span>
                )}
                <span className="pc-name" style={{ cursor: 'pointer' }}
                  onClick={() => navigate(projectUrl(p.id))}>{p.name}</span>
                {p.copied_from_project_id && (
                  <span style={{ fontSize: 10, color: 'var(--accent)', marginLeft: 4 }} title="从其他明细复制">📋</span>
                )}
                <span className={`pc-status ${p.status}`}
                  style={{ cursor: (canEditOwn && isOwner(p.created_by)) ? 'pointer' : 'default' }}
                  onClick={async e => {
                    e.stopPropagation()
                    if (!canEditOwn || !isOwner(p.created_by)) return
                    const newStatus = p.status === 'completed' ? 'draft' : 'completed'
                    await api.updateProject(p.id, { status: newStatus })
                    loadProjects(page)
                  }}>{statusLabel(p.status)}</span>
                <span className="pc-date">{new Date(p.updated_at).toLocaleDateString('zh-CN')}</span>
                <span className="pc-actions" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {expandedProject !== p.id && projectFiles.length === 0 && (
                    <button className="btn btn-ghost btn-sm"
                      onClick={e => { e.stopPropagation(); toggleProjectExpand(p.id) }}
                      style={{ color: 'var(--accent)', fontSize: 11 }}
                      title="查看输出文件">📦 输出</button>
                  )}
                  {expandedProject === p.id && selectedFiles.size > 0 && canDownload && (
                    <button className="btn btn-ghost btn-sm"
                      onClick={e => { e.stopPropagation(); downloadSelectedFiles() }}
                      style={{ color: 'var(--accent)', fontSize: 11 }}
                      title="下载选中文件">📥 下载选中 ({selectedFiles.size})</button>
                  )}
                  {canCreate && (
                    <button className="btn btn-ghost btn-sm"
                      onClick={e => { e.stopPropagation(); copyProject(p.id, p.name) }}
                      style={{ color: 'var(--accent)', fontSize: 11 }}
                      title="复制明细及其配置">复制</button>
                  )}
                  {canEditOwn && isOwner(p.created_by) ? (
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
                  ) : (
                    <span style={{ fontSize: 11, marginLeft: 4, color: p.is_locked ? 'var(--warning)' : 'var(--text-secondary)' }}>
                      {p.is_locked ? '已锁定' : '—'}
                    </span>
                  )}
                  {!p.is_locked && canDeleteOwn && isOwner(p.created_by) && (
                    <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); deleteProject(p.id, p.name) }}
                      style={{ color: 'var(--warning)' }}>删除</button>
                  )}
                </span>
              </div>

              {/* Expanded file list */}
              {expandedProject === p.id && (
                <div style={{
                  marginLeft: 36, marginRight: 0, marginBottom: 4,
                  background: 'var(--bg)', border: '1px solid var(--border)',
                  borderLeft: '3px solid var(--accent)',
                  borderRadius: 6, padding: 12,
                }}>
                  {loadingFiles ? (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: 12 }}>加载中...</p>
                  ) : projectFiles.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: 12 }}>暂无输出文件</p>
                  ) : (
                    <>
                      {/* File toolbar: search + batch actions */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                        <input className="form-input" type="text" placeholder="搜索文件..."
                          style={{ flex: 1, maxWidth: 240, fontSize: 12, padding: '4px 8px' }}
                          value={fileSearch} onChange={e => setFileSearch(e.target.value)} />
                        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                          <input type="checkbox"
                            checked={filteredProjectFiles.length > 0 && selectedFiles.size === filteredProjectFiles.length}
                            onChange={() => toggleAllFiles(filteredProjectFiles)}
                            onClick={e => e.stopPropagation()} />
                          全选
                        </label>
                        {selectedFiles.size > 0 && (
                          <>
                            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>已选 {selectedFiles.size} 项</span>
                            {canEditOwn && isOwner(projects.find(p => p.id === expandedProject)?.created_by) && (
                              <button className="btn btn-sm" onClick={batchDeleteFiles}
                                style={{ background: 'var(--warning)', color: '#fff', borderColor: 'var(--warning)', fontSize: 11, padding: '3px 10px' }}>
                                删除选中
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {/* File groups */}
                      {Object.entries(groupedFiles).sort(([a], [b]) => a.localeCompare(b, 'zh-CN')).map(([category, files]) => {
                        const visibleFiles = fileSearch
                          ? files.filter((f: any) => f.filename.toLowerCase().includes(fileSearch.toLowerCase()))
                          : files
                        if (visibleFiles.length === 0) return null
                        const groupExpanded = expandedGroups.has(category)
                        return (
                          <div key={category} style={{ marginBottom: 6 }}>
                            <div
                              onClick={() => {
                                setExpandedGroups(prev => {
                                  const s = new Set(prev)
                                  groupExpanded ? s.delete(category) : s.add(category)
                                  return s
                                })
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                cursor: 'pointer', padding: '4px 0',
                                fontSize: 11, fontWeight: 600,
                                color: 'var(--text-primary)',
                              }}>
                              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{groupExpanded ? '▼' : '▶'}</span>
                              <span>{fileIcon(visibleFiles[0])}</span>
                              <span>{category}</span>
                              <span style={{ fontWeight: 400, color: 'var(--text-secondary)', fontSize: 11 }}>({visibleFiles.length})</span>
                            </div>
                            {groupExpanded && (
                              <div style={{ marginLeft: 20 }}>
                                {visibleFiles.map((f: any) => {
                                  const isAudio = f.type === 'MP3' || f.type === 'Audio'
                                  const dateStr = f.modified ? new Date(f.modified * 1000).toLocaleDateString('zh-CN') : ''
                                  const fkey = fileKey(f)
                                  return (
                                  <div key={fkey}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 8,
                                      padding: '4px 6px', borderRadius: 4,
                                      fontSize: 11,
                                      background: selectedFiles.has(fkey) ? 'var(--bg-hover)' : 'transparent',
                                    }}>
                                    <input type="checkbox"
                                      checked={selectedFiles.has(fkey)}
                                      onChange={() => toggleFileSelect(fkey)}
                                      onClick={e => e.stopPropagation()} />
                                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {fileIcon(f)} {f.display_name || f.filename}
                                    </span>
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', minWidth: 55, textAlign: 'right' }}>
                                      {dateStr}
                                    </span>
                                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', minWidth: 38, textAlign: 'right' }}>
                                      {formatSize(f.size)}
                                    </span>
                                    {isAudio && f.audio_url && canView4 && (() => {
                                      const url = (f.audio_url as string).startsWith('/') ? f.audio_url : '/' + (f.audio_url as string).replace(/^\//, '')
                                      const isPlaying = playingAudio === url
                                      return (
                                      <button className="btn btn-ghost btn-sm"
                                        onClick={() => handleAudioToggle(url)}
                                        style={{ fontSize: 10, padding: '2px 6px', color: 'var(--accent)' }}
                                        title={isPlaying ? '暂停' : '播放'}>
                                        {isPlaying ? '⏸' : '▶'}
                                      </button>
                                      )
                                    })()}
                                    {canDownload && (
                                      <button className="btn btn-ghost btn-sm"
                                        onClick={async () => {
                                          try {
                                            const dlName = f.display_name || f.filename
                                            if (f.download_url) {
                                              await api.downloadWithName(f.download_url, dlName)
                                            } else {
                                              await api.downloadWithName(
                                                `/api/download/${encodeURIComponent(f.filename)}?project_id=${encodeURIComponent(expandedProject)}`,
                                                dlName
                                              )
                                            }
                                          } catch (e) { modal.toast(`下载失败: ${e}`, 'error') }
                                        }}
                                        style={{ fontSize: 10, padding: '2px 6px', color: 'var(--accent)' }}
                                        title="下载">⬇</button>
                                    )}
                                    {canEditOwn && isOwner(projects.find(p => p.id === expandedProject)?.created_by) && (
                                      <button className="btn btn-ghost btn-sm"
                                        onClick={async () => {
                                          const ok = await modal.confirm(`确认删除「${f.display_name || f.filename}」？`)
                                          if (ok) deleteFile(expandedProject, f)
                                        }}
                                        style={{ fontSize: 10, padding: '2px 6px', color: 'var(--warning)' }}
                                        title="删除">✕</button>
                                    )}
                                  </div>
                                )})}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </>
                  )}
                </div>
              )}
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
            {filtered.length === 0 ? '没有匹配的明细' : `共 ${total} 条明细`}
          </div>
        </div>
      )}

      {/* Create Detail Dialog */}
      {showCreate && (
        <div className="dialog-overlay"
          onMouseDown={(e: any) => { overlayMouseDownRef.current = e.target === e.currentTarget }}
          onClick={() => { if (overlayMouseDownRef.current) setShowCreate(false) }}>
          <div className="dialog-box" style={{ width: 460, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">新建明细</div>

            <div className="form-group">
              <label className="form-label">明细名称</label>
              <input className="form-input" type="text"
                value={createName}
                onChange={e => setCreateName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && createName.trim()) handleCreate() }}
                placeholder="输入明细名称" autoFocus />
            </div>

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={createCopy}
                  onChange={e => setCreateCopy(e.target.checked)} />
                从已有明细复制配置
              </label>
            </div>

            <div style={{
              maxHeight: createCopy ? 300 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.25s ease',
            }}>
              {createCopy && (
              <div className="form-group" ref={srcRef} style={{ minHeight: 0 }}>
                <label className="form-label">源明细</label>
                <input className="form-input" type="text"
                  value={createSourceQuery}
                  onChange={e => { setCreateSourceQuery(e.target.value); setSrcDropdown(true) }}
                  onFocus={() => setSrcDropdown(true)}
                  placeholder="输入关键词搜索明细..." />
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
