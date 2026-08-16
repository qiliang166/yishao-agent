import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { api } from '../services/api'
import UnlockConfirmDialog from '../components/UnlockConfirmDialog'
import SvgIcon from '../components/SvgIcon'

interface DlFile {
  filename: string
  display_name: string
  size: number
  ext: string
  category: string
  download_url: string
}

interface DlProject {
  id: string
  name: string
  point_cost_deci: number
  download_count: number
  workspace_id: string
  workspace_name: string
  category_name: string
  author_id: string
  author_name: string
  preview_requires_unlock: boolean
  unlocked: {
    is_unlocked: boolean
    unlocked_at: string | null
    expires_at: string | null
  }
  files: DlFile[]
}

interface DlItem {
  project: DlProject
  files: DlFile[]
}

const fileKey = (pid: string, filename: string) => `${pid}|${filename}`

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']
const AUDIO_EXTS = ['mp3', 'wav', 'm4a', 'ogg', 'flac']
const VIDEO_EXTS = ['mp4', 'webm']
// html/pdf 走 iframe（html 由预览端点注入防复制）；文本类走 fetch + markdown 人读渲染
const FRAME_EXTS = ['html', 'htm', 'pdf']
const TEXT_MD_EXTS = ['txt', 'md']
const TEXT_RAW_EXTS = ['json', 'csv', 'log']

const blockEvent = (e: React.SyntheticEvent) => { e.preventDefault() }

export default function MemberDownloadsPage() {
  const [projects, setProjects] = useState<DlProject[]>([])
  const [memberWorkspaces, setMemberWorkspaces] = useState<{id:string; name:string}[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all')
  const [catFilter, setCatFilter] = useState('')
  const [wsFilter, setWsFilter] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [fileSel, setFileSel] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [preview, setPreview] = useState<{ project: DlProject; file: DlFile } | null>(null)
  const [previewText, setPreviewText] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewUnlocking, setPreviewUnlocking] = useState(false)
  const navigate = useNavigate()

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  useEffect(() => {
    setLoading(true)
    api.getDownloadableProjects()
      .then(d => {
        const list: DlProject[] = (d as any)?.projects || []
        setProjects(list)
        setMemberWorkspaces((d as any)?.workspaces || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // 预览弹框 Esc 关闭
  useEffect(() => {
    if (!preview) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [preview])

  // 文本类预览：拉取内容（md/txt 渲染人读格式，json/csv/log 原文显示）
  useEffect(() => {
    setPreviewText(null)
    if (!preview) return
    if (preview.project.preview_requires_unlock && !preview.project.unlocked.is_unlocked) return
    const ext = (preview.file.ext || '').toLowerCase()
    if (!TEXT_MD_EXTS.includes(ext) && !TEXT_RAW_EXTS.includes(ext)) return
    let cancelled = false
    setPreviewLoading(true)
    api.previewFileText(preview.project.id, preview.file)
      .then(t => { if (!cancelled && t != null) setPreviewText(t) })
      .catch((e: any) => {
        if (!cancelled) {
          setPreviewText('')
          showToast(`预览加载失败: ${e?.message || e}`)
        }
      })
      .finally(() => { if (!cancelled) setPreviewLoading(false) })
    return () => { cancelled = true }
  }, [preview, showToast])

  // ── 左栏：项目选中（联动右侧文件默认全勾） ──

  const toggleProject = (proj: DlProject) => {
    setSelected(prev => {
      const next = new Set(prev)
      const keys = proj.files.map(f => fileKey(proj.id, f.filename))
      if (next.has(proj.id)) {
        next.delete(proj.id)
        setFileSel(fs => {
          const nf = new Set(fs)
          for (const k of keys) nf.delete(k)
          return nf
        })
      } else {
        next.add(proj.id)
        setFileSel(fs => {
          const nf = new Set(fs)
          for (const k of keys) nf.add(k)
          return nf
        })
      }
      return next
    })
  }

  const selectAllFiltered = (list: DlProject[]) => {
    setSelected(prev => {
      const next = new Set(prev)
      for (const p of list) next.add(p.id)
      return next
    })
    setFileSel(prev => {
      const next = new Set(prev)
      for (const p of list) for (const f of p.files) next.add(fileKey(p.id, f.filename))
      return next
    })
  }

  const clearSelection = () => {
    setSelected(new Set())
    setFileSel(new Set())
  }

  // ── 右栏：文件勾选 ──

  const toggleFile = (pid: string, filename: string) => {
    setFileSel(prev => {
      const next = new Set(prev)
      const k = fileKey(pid, filename)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const toggleProjectFiles = (proj: DlProject) => {
    setFileSel(prev => {
      const next = new Set(prev)
      const keys = proj.files.map(f => fileKey(proj.id, f.filename))
      const allChecked = keys.every(k => next.has(k))
      for (const k of keys) {
        if (allChecked) next.delete(k)
        else next.add(k)
      }
      return next
    })
  }

  // ── 下载链路：canDownload 预检 → 解锁弹窗 → 执行下载 ──

  const [unlockCheck, setUnlockCheck] = useState<any>(null)
  const [unlockPendingItems, setUnlockPendingItems] = useState<DlItem[]>([])

  const performDownload = async (items: DlItem[]) => {
    const nonEmpty = items.filter(it => it.files.length > 0)
    if (nonEmpty.length === 0) return
    if (nonEmpty.length === 1) {
      const { project, files } = nonEmpty[0]
      if (files.length === 1) {
        await api.downloadWithName(files[0].download_url, files[0].display_name || files[0].filename)
      } else {
        await api.downloadSelectedFiles(project.id, files.map(f => ({
          filename: f.filename,
          download_url: f.download_url,
          display_name: f.display_name || f.filename,
        })))
      }
    } else {
      await api.downloadBatch(nonEmpty.map(it => ({
        project_id: it.project.id,
        files: it.files.map(f => ({
          filename: f.filename,
          download_url: f.download_url,
          display_name: f.display_name || f.filename,
        })),
      })))
    }
    const total = nonEmpty.reduce((n, it) => n + it.files.length, 0)
    showToast(`已开始下载 ${total} 个文件`)
  }

  const doDownload = async (items: DlItem[]) => {
    const nonEmpty = items.filter(it => it.files.length > 0)
    if (nonEmpty.length === 0) { showToast('请先勾选要下载的文件'); return }
    setBusy(true)
    try {
      const flat = nonEmpty.flatMap(it => it.files.map(f => ({
        project_id: it.project.id,
        filename: f.filename,
      })))
      const check = await api.canDownload(flat)
      if (check == null) { showToast('操作失败：服务器未确认'); return }
      if (!check.is_admin && check.need_unlock && check.need_unlock.length > 0) {
        setUnlockCheck(check)
        setUnlockPendingItems(nonEmpty)
        return
      }
      await performDownload(nonEmpty)
    } catch (e: any) {
      showToast(`下载失败: ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  const handleUnlockConfirm = async () => {
    if (!unlockCheck) return
    setBusy(true)
    try {
      const projectIds = [...new Set(unlockCheck.need_unlock.map((p: any) => p.project_id))]
      await api.unlockProjects(projectIds as string[])
      const d = await api.getDownloadableProjects()
      if (d != null) setProjects((d as any)?.projects || [])
      showToast('解锁成功，开始下载...')
      await performDownload(unlockPendingItems)
      setUnlockCheck(null)
      setUnlockPendingItems([])
    } catch (e: any) {
      showToast(`解锁失败: ${e?.message || e}`)
    } finally {
      setBusy(false)
    }
  }

  const unlockPreview = async () => {
    if (!preview) return
    setPreviewUnlocking(true)
    try {
      await api.unlockProjects([preview.project.id])
      const d = await api.getDownloadableProjects()
      if (d != null) {
        const list: DlProject[] = (d as any)?.projects || []
        setProjects(list)
        const updated = list.find(p => p.id === preview.project.id)
        if (updated) setPreview({ project: updated, file: preview.file })
      }
      showToast('解锁成功')
    } catch (e: any) {
      showToast(`解锁失败: ${e?.message || e}`)
    } finally {
      setPreviewUnlocking(false)
    }
  }

  const downloadSingle = (project: DlProject, f: DlFile) => {
    doDownload([{ project, files: [f] }])
  }

  const downloadChecked = () => {
    const items: DlItem[] = shownProjects
      .map(p => ({ project: p, files: p.files.filter(f => fileSel.has(fileKey(p.id, f.filename))) }))
      .filter(it => it.files.length > 0)
    doDownload(items)
  }

  // ── 工具函数 ──

  const fileIcon = (cat: string) => {
    if (cat.includes('文档生成')) return 'file-text'
    if (cat.includes('课件输出')) return 'bookmark'
    if (cat.includes('演讲课件')) return 'music'
    return 'file'
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1048576).toFixed(1)}MB`
  }

  const pts = (d: number) => (d / 10).toFixed(1)

  // ── 全量过滤：搜索(项目名+文件名) × 解锁状态 × 分类 × 项目，作用于全部已加载数据 ──

  // 按下载量从高到低排序
  const sorted = [...projects].sort((a, b) => (b.download_count || 0) - (a.download_count || 0))

  const categories = [...new Set(sorted.map(p => p.category_name).filter(Boolean))]
  const workspaces = memberWorkspaces.length > 0
    ? memberWorkspaces
    : [...new Map(sorted.filter(p => p.workspace_id).map(p => [p.workspace_id, { id: p.workspace_id, name: p.workspace_name || p.workspace_id }])).values()]

  const filtered = sorted.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !search || p.name.toLowerCase().includes(q)
      || p.files.some(f => f.filename.toLowerCase().includes(q)
        || (f.display_name || '').toLowerCase().includes(q))
    const matchFilter = filter === 'all'
      || (filter === 'unlocked' && p.unlocked.is_unlocked)
      || (filter === 'locked' && !p.unlocked.is_unlocked)
    const matchCat = !catFilter || p.category_name === catFilter
    const matchWs = !wsFilter || p.workspace_id === wsFilter
    return matchSearch && matchFilter && matchCat && matchWs
  })

  const shownProjects = sorted.filter(p => selected.has(p.id))
  const multiProj = shownProjects.length > 1
  const checkedCount = fileSel.size

  const previewExt = preview ? (preview.file.ext || '').toLowerCase() : ''
  const previewUrl = preview ? api.previewFileUrl(preview.project.id, preview.file) : ''
  const previewIsText = TEXT_MD_EXTS.includes(previewExt) || TEXT_RAW_EXTS.includes(previewExt)
  const isPreviewLocked = preview ? (preview.project.preview_requires_unlock && !preview.project.unlocked.is_unlocked) : false

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1440, margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 0px)', boxSizing: 'border-box' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 16px 0' }}>下载文件</h1>

      {/* 搜索 + 筛选 + 批量工具栏 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="form-input" type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索项目或文件..."
          style={{ flex: '1 1 200px', fontSize: 12, minWidth: 160 }} />
        <select className="form-input" value={catFilter}
          onChange={e => setCatFilter(e.target.value)}
          style={{ width: 130, fontSize: 12, padding: '6px 8px' }}>
          <option value="">全部分类</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="form-input" value={wsFilter}
          onChange={e => setWsFilter(e.target.value)}
          style={{ width: 170, fontSize: 12, padding: '6px 8px' }}>
          <option value="">全部工作区</option>
          {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 0, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          {([
            ['all', '全部'],
            ['unlocked', '已解锁'],
            ['locked', '未解锁'],
          ] as const).map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)}
              style={{
                padding: '6px 14px', border: 'none', background: filter === k ? 'var(--primary)' : 'transparent',
                color: filter === k ? '#fff' : 'var(--text-secondary)',
                fontSize: 11, cursor: 'pointer', fontWeight: filter === k ? 600 : 400,
              }}>{label}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 'auto' }}>
          已选 {selected.size} 个项目 / 勾选 {checkedCount} 个文件
        </span>
        <button className="btn btn-primary btn-sm" disabled={busy || checkedCount === 0}
          onClick={downloadChecked}>
          {busy ? '处理中...' : <><SvgIcon name="package" size={14} /> 批量下载</>}
        </button>
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
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}><SvgIcon name="download" size={48} /></div>
          <p>暂无可用下载</p>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, paddingBottom: 16 }}>
          {/* 左栏：项目清单（滚动，不分页；项目名最多两行完整展示） */}
          <div className="card" style={{ width: 400, flexShrink: 0, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>共 {filtered.length} 个项目</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                  onClick={() => selectAllFiltered(filtered)}>全选</button>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                  disabled={selected.size === 0} onClick={clearSelection}>清空</button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-secondary)', fontSize: 12 }}>没有匹配的结果</div>
              ) : filtered.map((proj, idx) => {
                const isSel = selected.has(proj.id)
                return (
                  <div key={proj.id}
                    onClick={() => toggleProject(proj)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                      borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      background: isSel ? 'var(--primary-light, rgba(59,130,246,0.08))' : 'transparent',
                    }}>
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0, width: 18, textAlign: 'right', userSelect: 'none' }}>{idx + 1}</span>
                    <input type="checkbox" checked={isSel} readOnly style={{ cursor: 'pointer', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontSize: 12, fontWeight: isSel ? 600 : 400 }} title={proj.name}>{proj.name}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6 }}>
                        {proj.category_name ? `${proj.category_name} · ` : ''}{proj.files.length} 个文件
                      </span>
                    </div>
                    {proj.unlocked.is_unlocked ? (
                      <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 600, flexShrink: 0 }}>已解锁</span>
                    ) : (
                      <span style={{ fontSize: 10, color: 'var(--warning)', flexShrink: 0 }}>{pts(proj.point_cost_deci)} 积分</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* 右栏：选中项目的文件明细（预览 + 勾选；多项目时分组头带项目名便于区分） */}
          <div style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>
            {shownProjects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 12 }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}><SvgIcon name="download" size={48} /></div>
                <p>从左侧勾选项目，这里显示可下载的文件明细</p>
              </div>
            ) : shownProjects.map(proj => {
              const grouped = proj.files.reduce((acc: Record<string, DlFile[]>, f) => {
                const g = f.category || '其他'
                if (!acc[g]) acc[g] = []
                acc[g].push(f)
                return acc
              }, {})
              const projKeys = proj.files.map(f => fileKey(proj.id, f.filename))
              const projAllChecked = projKeys.length > 0 && projKeys.every(k => fileSel.has(k))

              return (
                <div key={proj.id} className="card" style={{ padding: 0, marginBottom: 12 }}>
                  <div style={{
                    padding: '12px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: proj.files.length > 0 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <input type="checkbox" checked={projAllChecked}
                        onChange={() => toggleProjectFiles(proj)}
                        title="全选/取消本项目文件" style={{ cursor: 'pointer', flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{proj.name}</span>
                      {proj.category_name && (
                        <span style={{
                          fontSize: 10, color: 'var(--primary)', background: 'var(--primary-light, rgba(59,130,246,0.12))',
                          padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap',
                        }}>{proj.category_name}</span>
                      )}
                      {proj.author_name && proj.author_id && (
                        <span
                          onClick={() => navigate(`/author/${proj.author_id}`)}
                          title="查看作者主页"
                          style={{
                            fontSize: 10, color: 'var(--primary)', border: '1px solid var(--border)',
                            padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap', cursor: 'pointer',
                          }}><SvgIcon name="edit" size={14} /> {proj.author_name}</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                      {proj.unlocked.is_unlocked ? (
                        <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>已解锁</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--warning)' }}>
                          {pts(proj.point_cost_deci)} 积分
                        </span>
                      )}
                    </div>
                  </div>
                  {proj.files.length === 0 ? (
                    <div style={{ padding: '16px 20px', fontSize: 12, color: 'var(--text-secondary)' }}>该项目暂无可下载文件</div>
                  ) : (
                    <div style={{ padding: '8px 0' }}>
                      {Object.entries(grouped).map(([cat, files]) => (
                        <div key={cat}>
                          <div style={{
                            padding: '4px 16px', fontSize: 10, fontWeight: 600,
                            color: 'var(--text-secondary)', textTransform: 'uppercase',
                          }}>
                            <SvgIcon name={fileIcon(cat)} size={14} /> {cat}{multiProj ? ` — ${proj.name}` : ''}
                          </div>
                          {files.map(f => {
                            const k = fileKey(proj.id, f.filename)
                            return (
                              <div key={f.filename} style={{
                                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px 6px 28px',
                                borderBottom: '1px solid var(--border)',
                              }}>
                                <input type="checkbox" checked={fileSel.has(k)}
                                  onChange={() => toggleFile(proj.id, f.filename)}
                                  style={{ cursor: 'pointer', flexShrink: 0 }} />
                                <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.display_name || f.filename}>
                                  {f.display_name || f.filename}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>
                                  {formatSize(f.size)}
                                </span>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, flexShrink: 0 }}
                                  onClick={() => setPreview({ project: proj, file: f })}>
                                  <SvgIcon name="eye" size={14} /> 预览
                                </button>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, flexShrink: 0 }}
                                  disabled={busy}
                                  onClick={() => downloadSingle(proj, f)}>
                                  <SvgIcon name="download" size={14} /> 下载
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 预览弹框（试看场景：文本区禁选禁复制，HTML 由预览端点注入防复制） */}
      {preview && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setPreview(null)}>
          <div style={{
            background: 'var(--bg-primary, #fff)', borderRadius: 12, width: '90vw', height: '88vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
              borderBottom: '1px solid var(--border)', flexShrink: 0,
            }}>
              <span style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {preview.file.display_name || preview.file.filename}
              </span>
              <span style={{
                fontSize: 10, color: 'var(--text-secondary)', border: '1px solid var(--border)',
                padding: '1px 6px', borderRadius: 3, whiteSpace: 'nowrap', flexShrink: 0,
              }}>{preview.project.name}</span>
              <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>{formatSize(preview.file.size)}</span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} disabled={busy}
                  onClick={() => downloadSingle(preview.project, preview.file)}>
                  <SvgIcon name="download" size={14} /> 下载
                </button>
                <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }}
                  onClick={() => setPreview(null)}>关闭</button>
              </div>
            </div>
            <div style={{ flex: 1, minHeight: 0, background: 'var(--bg-secondary, #f5f5f5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isPreviewLocked ? (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #111)', margin: '0 0 4px' }}>付费预览</p>
                  <p style={{ fontSize: 12, margin: '0 0 16px' }}>该明细已设为付费预览，解锁后可在线预览正文</p>
                  <button className="btn btn-primary btn-sm" style={{ fontSize: 12 }}
                    disabled={previewUnlocking}
                    onClick={unlockPreview}>
                    {previewUnlocking ? '解锁中...' : `解锁（${pts(preview.project.point_cost_deci)} 积分）`}
                  </button>
                </div>
              ) : previewIsText ? (
                <div
                  onCopy={blockEvent} onCut={blockEvent} onContextMenu={blockEvent} onDragStart={blockEvent}
                  style={{
                    width: '100%', height: '100%', overflowY: 'auto', background: '#fff',
                    userSelect: 'none', WebkitUserSelect: 'none',
                  }}>
                  {previewLoading ? (
                    <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)', fontSize: 12 }}>加载中...</div>
                  ) : TEXT_MD_EXTS.includes(previewExt) ? (
                    <div
                      style={{ padding: '28px 48px', fontSize: 13, lineHeight: 1.9 }}
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(previewText || '', { breaks: true, async: false }) as string) }} />
                  ) : (
                    <pre style={{
                      padding: '24px 48px', fontSize: 12, lineHeight: 1.7,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>{previewText}</pre>
                  )}
                </div>
              ) : FRAME_EXTS.includes(previewExt) ? (
                <iframe src={previewUrl} title="文件预览" sandbox="allow-scripts"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
              ) : IMAGE_EXTS.includes(previewExt) ? (
                <img src={previewUrl} alt={preview.file.display_name || preview.file.filename}
                  onContextMenu={blockEvent} onDragStart={blockEvent}
                  style={{ maxWidth: '96%', maxHeight: '96%', objectFit: 'contain' }} />
              ) : AUDIO_EXTS.includes(previewExt) ? (
                <audio src={previewUrl} controls controlsList="nodownload" style={{ width: '70%' }} />
              ) : VIDEO_EXTS.includes(previewExt) ? (
                <video src={previewUrl} controls controlsList="nodownload" onContextMenu={blockEvent}
                  style={{ maxWidth: '96%', maxHeight: '96%' }} />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
                  <div style={{ fontSize: 48, marginBottom: 12 }}><SvgIcon name="file" size={48} /></div>
                  <p>该文件类型（.{previewExt || '未知'}）暂不支持在线预览</p>
                  <p style={{ fontSize: 11 }}>请下载后在本地查看</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {unlockCheck && (
        <UnlockConfirmDialog
          needUnlock={unlockCheck.need_unlock || []}
          alreadyUnlocked={unlockCheck.already_unlocked || []}
          notDownloadable={unlockCheck.not_downloadable || []}
          totalCostDeci={unlockCheck.total_cost_deci || 0}
          balanceDeci={unlockCheck.balance_deci || 0}
          onConfirm={handleUnlockConfirm}
          onCancel={() => { setUnlockCheck(null); setUnlockPendingItems([]) }}
        />
      )}

    </div>
  )
}
