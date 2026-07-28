import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../../services/api'
import type { Project } from '../../services/api'
import { MTopBar, mToast } from '../MobileApp'

const PAGE_SIZE = 20

export default function MProjects() {
  const { wid } = useParams<{ wid: string }>()
  const [wsName, setWsName] = useState('')
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!wid) return
    let cancelled = false
    api.getWorkspace(wid)
      .then(ws => { if (!cancelled && ws != null && ws.name) setWsName(ws.name) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [wid])

  useEffect(() => {
    if (!wid) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const data = await api.listProjects(page, PAGE_SIZE, wid)
        if (!cancelled && data != null && Array.isArray(data.projects)) {
          setProjects(data.projects)
          setTotal(data.total || 0)
        }
      } catch (e: any) {
        if (!cancelled) mToast(`加载失败: ${e?.message || e}`, 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [wid, page])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: '草稿', completed: '已完成' }
    return map[s] || s
  }

  return (
    <>
      <MTopBar title={wsName || '项目列表'} back="/" />
      <div className="m-content">
        {loading ? (
          <div className="m-loading">加载中…</div>
        ) : projects.length === 0 ? (
          <div className="m-empty">暂无项目</div>
        ) : (
          <>
            {projects.map(p => (
              <Link key={p.id} className="m-card" to={`/project/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="m-card-body">
                  <div className="m-card-name">{p.name}</div>
                  <div className="m-card-desc">
                    {p.project_code ? `${p.project_code} · ` : ''}
                    {p.created_at ? new Date(p.created_at).toLocaleDateString('zh-CN') : ''}
                  </div>
                </div>
                <span className={`m-badge ${p.status === 'completed' ? 'completed' : ''}`}>
                  {statusLabel(p.status)}
                </span>
                <span className="m-card-arrow">›</span>
              </Link>
            ))}
            {totalPages > 1 && (
              <div className="m-pager">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>上一页</button>
                <span>{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>下一页</button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
