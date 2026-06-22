import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface Project {
  id: string
  name: string
  status: string
  source_type: string
  created_at: string
  updated_at: string
}

function HomePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => {
        setProjects(data.projects || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load projects:', err)
        setLoading(false)
      })
  }, [])

  const createProject = async () => {
    const name = prompt('请输入食谱名称：')
    if (!name) return
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, source_type: 'text' }),
    })
    const project = await res.json()
    navigate(`/project/${project.id}`)
  }

  const deleteProject = async (id: string, name: string) => {
    if (!confirm(`确认删除「${name}」？此操作不可撤销。`)) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: '草稿', in_progress: '进行中', completed: '已完成' }
    return map[s] || s
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>我的项目</h1>
        <button
          onClick={createProject}
          style={{
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          + 新建项目
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>加载中...</p>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-text-secondary)' }}>
          <p style={{ fontSize: 16, marginBottom: 12 }}>还没有项目</p>
          <p>点击「+ 新建项目」开始你的第一份食谱笔记</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {projects.map(p => (
            <div
              key={p.id}
              onClick={() => navigate(`/project/${p.id}`)}
              style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{p.name}</h3>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {statusLabel(p.status)} · {new Date(p.updated_at).toLocaleString('zh-CN')}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteProject(p.id, p.name) }}
                style={{
                  background: 'none',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 12px',
                  color: 'var(--color-text-secondary)',
                  fontSize: 12,
                }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default HomePage
