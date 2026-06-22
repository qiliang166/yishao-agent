import { useState, useEffect } from 'react'
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

  const createProject = async () => {
    const name = await modal.prompt('请输入食谱名称：')
    if (!name) return
    try {
      const project = await api.createProject(name)
      navigate(`/project/${project.id}`)
    } catch (err: any) {
      modal.toast('创建失败：' + err.message, 'error')
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
    const ok = await modal.confirm(`确认删除选中的 ${selected.size} 个项目？此操作不可撤销。`)
    if (!ok) return
    try {
      await api.batchDeleteProjects([...selected])
      setSelected(new Set())
      loadProjects(page)
      modal.toast(`已删除 ${selected.size} 个项目`, 'success')
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

  const exportProject = (p: Project) => {
    const data = JSON.stringify(p, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${p.name}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: '草稿', in_progress: '进行中', completed: '已完成' }
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
        <button className="btn btn-primary btn-sm" onClick={createProject}>+ 新建项目</button>

        {selected.size > 0 && (
          <button className="btn btn-sm" onClick={batchDelete}
            style={{ background: 'var(--warning)', color: '#fff', borderColor: 'var(--warning)' }}>
            删除选中({selected.size})
          </button>
        )}
      </div>

      {loading ? (
        <p style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 12 }}>加载中...</p>
      ) : (
        <div className="proj-list">
          {filtered.length > 0 && (
            <div className="proj-card" style={{ background: 'var(--bg-hover)', cursor: 'default' }}>
              <input type="checkbox"
                checked={filtered.length > 0 && selected.size === filtered.length}
                onChange={toggleAll}
                onClick={e => e.stopPropagation()} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', paddingLeft: 6 }}>
                {selected.size > 0 ? `已选 ${selected.size} 项` : '全选'}
              </span>
            </div>
          )}
          {filtered.map(p => (
            <div key={p.id} className="proj-card">
              <input type="checkbox"
                checked={selected.has(p.id)}
                onChange={() => toggleSelect(p.id)}
                onClick={e => e.stopPropagation()}
                style={{ marginRight: 8 }} />
              <span className="pc-name" style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/project/${p.id}`)}>{p.name}</span>
              <span className={`pc-status ${p.status}`}>{statusLabel(p.status)}</span>
              <span className="pc-date">{new Date(p.updated_at).toLocaleDateString('zh-CN')}</span>
              <span className="pc-actions">
                <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); exportProject(p) }}>导出</button>
                <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); deleteProject(p.id, p.name) }}
                  style={{ color: 'var(--warning)' }}>删除</button>
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
    </div>
  )
}

export default HomePage
