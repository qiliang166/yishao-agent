import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, Project } from '../services/api'
import { useModal } from '../components/ModalProvider'

function HomePage() {
  const modal = useModal()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.listProjects()
      .then(data => {
        setProjects(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load projects:', err)
        setLoading(false)
      })
  }, [])

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
      setProjects(prev => prev.filter(p => p.id !== id))
    } catch (err: any) {
      modal.toast('删除失败：' + err.message, 'error')
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
        <button className="btn btn-outline btn-sm">导入</button>
      </div>

      {loading ? (
        <p style={{ padding: 20, color: 'var(--text-secondary)', fontSize: 12 }}>加载中...</p>
      ) : (
        <div className="proj-list">
          {filtered.map(p => (
            <div key={p.id} className="proj-card" onClick={() => navigate(`/project/${p.id}`)}>
              <span className="pc-name">{p.name}</span>
              <span className={`pc-status ${p.status}`}>{statusLabel(p.status)}</span>
              <span className="pc-date">{new Date(p.updated_at).toLocaleDateString('zh-CN')}</span>
              <span className="pc-actions">
                <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); exportProject(p) }}>导出</button>
                <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); deleteProject(p.id, p.name) }}
                  style={{ color: 'var(--warning)' }}>删除</button>
              </span>
            </div>
          ))}
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 11 }}>
            {filtered.length === 0 ? '没有匹配的项目' : '点击项目卡片进入编辑'}
          </div>
        </div>
      )}
    </div>
  )
}

export default HomePage
