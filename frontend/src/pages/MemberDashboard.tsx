import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import SvgIcon from '../components/SvgIcon'

interface MemberWorkspace {
  id: string
  name: string
  status: string
  description?: string
  logo?: string
  created_at: string
}

export default function MemberDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<MemberWorkspace[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    fetch('/api/workspaces', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(data => {
        setWorkspaces(data.workspaces || [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/member', { replace: true })
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: '草稿', completed: '已完成' }
    return map[s] || s
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            欢迎，{user?.display_name || user?.username}
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            会员中心 — 可查看和下载已分配的项目内容
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
          退出登录
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
      ) : workspaces.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: 64,
          color: 'var(--text-secondary)', fontSize: 14,
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}><SvgIcon name="folder" size={48} /></div>
          <p>暂无可用项目，请联系管理员分配</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {workspaces.map((w) => (
            <div
              key={w.id}
              className="card"
              onClick={() => navigate(`/app/workspace/${w.id}`)}
              style={{
                padding: '16px 20px', cursor: 'pointer',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{w.name}</div>
                {w.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {w.description}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                {statusLabel(w.status)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
