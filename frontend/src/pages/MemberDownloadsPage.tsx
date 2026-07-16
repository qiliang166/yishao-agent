import { useState, useEffect, useCallback } from 'react'
import { api } from '../services/api'
import UnlockConfirmDialog from '../components/UnlockConfirmDialog'

interface DlProject {
  id: string
  name: string
  point_cost_deci: number
  workspace_id: string
  unlocked: {
    is_unlocked: boolean
    unlocked_at: string | null
    expires_at: string | null
  }
  files: {
    filename: string
    size: number
    ext: string
    category: string
    download_url: string
  }[]
}

export default function MemberDownloadsPage() {
  const [projects, setProjects] = useState<DlProject[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unlocked' | 'locked'>('all')
  const [toast, setToast] = useState('')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  useEffect(() => {
    setLoading(true)
    api.getDownloadableProjects()
      .then(d => setProjects((d as any)?.projects || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const doDownload = async (project: DlProject, files: { filename: string; download_url: string }[]) => {
    if (files.length === 0) return
    try {
      const check = await api.canDownload(files.map(f => ({
        project_id: project.id,
        filename: f.filename,
      })))
      if (check == null) { showToast('操作失败：服务器未确认'); return }
      if (check.is_admin) {
        if (files.length === 1) {
          await api.downloadWithName(files[0].download_url, files[0].filename)
        } else {
          await api.downloadSelectedFiles(project.id, files.map(f => ({
            filename: f.filename,
            download_url: f.download_url,
            display_name: f.filename,
          })))
        }
        showToast(`已下载 ${files.length} 个文件`)
        return
      }
      if (check.need_unlock && check.need_unlock.length > 0) {
        setUnlockCheck(check)
        setUnlockProject(project)
        setUnlockPendingFiles(files)
        return
      }
      if (check.already_unlocked && check.already_unlocked.length > 0) {
        if (files.length === 1) {
          await api.downloadWithName(files[0].download_url, files[0].filename)
        } else {
          await api.downloadSelectedFiles(project.id, files.map(f => ({
            filename: f.filename,
            download_url: f.download_url,
            display_name: f.filename,
          })))
        }
        showToast(`已下载 ${files.length} 个文件`)
        return
      }
      showToast('无法下载：请联系管理员')
    } catch (e: any) {
      showToast(`下载失败: ${e?.message || e}`)
    }
  }

  const downloadSingle = async (project: DlProject, f: { filename: string; download_url: string }) => {
    doDownload(project, [f])
  }

  const downloadAllFiles = async (project: DlProject) => {
    doDownload(project, project.files)
  }

  const [unlockCheck, setUnlockCheck] = useState<any>(null)
  const [unlockProject, setUnlockProject] = useState<DlProject | null>(null)
  const [unlockPendingFiles, setUnlockPendingFiles] = useState<{ filename: string; download_url: string }[]>([])

  const handleUnlockConfirm = async () => {
    if (!unlockCheck || !unlockProject) return
    try {
      const projectIds = [...new Set(unlockCheck.need_unlock.map((p: any) => p.project_id))]
      await api.unlockProjects(projectIds as string[])
      // Refresh list after unlock
      const d = await api.getDownloadableProjects()
      setProjects((d as any)?.projects || [])
      showToast('解锁成功，开始下载...')
      // Download the pending files
      const files = unlockPendingFiles
      if (files.length === 1) {
        await api.downloadWithName(files[0].download_url, files[0].filename)
      } else {
        await api.downloadSelectedFiles(unlockProject.id, files.map(f => ({
          filename: f.filename,
          download_url: f.download_url,
          display_name: f.filename,
        })))
      }
      setUnlockCheck(null)
      setUnlockProject(null)
      setUnlockPendingFiles([])
    } catch (e: any) {
      showToast(`解锁失败: ${e?.message || e}`)
    }
  }

  const fileIcon = (cat: string) => {
    if (cat.includes('文档生成')) return '📝'
    if (cat.includes('课件输出')) return '📌'
    if (cat.includes('演讲课件')) return '🎵'
    return '📄'
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`
    return `${(bytes / 1048576).toFixed(1)}MB`
  }

  const pts = (d: number) => (d / 10).toFixed(1)

  const filtered = projects.filter(p => {
    const matchSearch = !search || p.name.toLowerCase().includes(search.toLowerCase())
      || p.files.some(f => f.filename.toLowerCase().includes(search.toLowerCase()))
    const matchFilter = filter === 'all'
      || (filter === 'unlocked' && p.unlocked.is_unlocked)
      || (filter === 'locked' && !p.unlocked.is_unlocked)
    return matchSearch && matchFilter
  })

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px 0' }}>下载文件</h1>

      {/* Search + Filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <input className="form-input" type="text" value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="搜索项目或文件..."
          style={{ flex: 1, fontSize: 12 }} />
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
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📥</div>
          <p>{projects.length === 0 ? '暂无可用下载' : '没有匹配的结果'}</p>
        </div>
      ) : (
        filtered.map(proj => {
          const grouped = proj.files.reduce((acc: Record<string, typeof proj.files>, f) => {
            const g = f.category || '其他'
            if (!acc[g]) acc[g] = []
            acc[g].push(f)
            return acc
          }, {})

          return (
            <div key={proj.id} className="card" style={{ padding: 0, marginBottom: 16 }}>
              <div style={{
                padding: '14px 20px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                borderBottom: proj.files.length > 0 ? '1px solid var(--border)' : 'none',
              }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{proj.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>
                    {proj.files.length} 个文件
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {proj.unlocked.is_unlocked ? (
                    <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>已解锁</span>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--warning)' }}>
                      {pts(proj.point_cost_deci)} 积分
                    </span>
                  )}
                  {proj.files.length > 0 && (
                    <button className="btn btn-primary btn-sm" onClick={() => downloadAllFiles(proj)}>
                      📥 一键下载
                    </button>
                  )}
                </div>
              </div>
              {proj.files.length > 0 && (
                <div style={{ padding: '8px 0' }}>
                  {Object.entries(grouped).map(([cat, files]) => (
                    <div key={cat}>
                      <div style={{
                        padding: '4px 20px', fontSize: 10, fontWeight: 600,
                        color: 'var(--text-secondary)', textTransform: 'uppercase',
                      }}>
                        {fileIcon(cat)} {cat}
                      </div>
                      {files.map(f => (
                        <div key={f.filename} style={{
                          display: 'flex', alignItems: 'center', padding: '6px 20px 6px 32px',
                          borderBottom: '1px solid var(--border)',
                        }}>
                          <span style={{ flex: 1, fontSize: 12 }}>{f.filename}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginRight: 8 }}>
                            {formatSize(f.size)}
                          </span>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                            onClick={() => downloadSingle(proj, f)}>
                            ⬇ 下载
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}

      {unlockCheck && unlockProject && (
        <UnlockConfirmDialog
          needUnlock={unlockCheck.need_unlock || []}
          alreadyUnlocked={unlockCheck.already_unlocked || []}
          notDownloadable={unlockCheck.not_downloadable || []}
          totalCostDeci={unlockCheck.total_cost_deci || 0}
          balanceDeci={unlockCheck.balance_deci || 0}
          onConfirm={handleUnlockConfirm}
          onCancel={() => { setUnlockCheck(null); setUnlockProject(null); setUnlockPendingFiles([]) }}
        />
      )}
    </div>
  )
}
