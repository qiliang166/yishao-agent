import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import type { Workspace } from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { MTopBar, mToast } from '../MobileApp'

export default function MHome() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  const canAdmin = user?.user_type === 'admin' && !!user?.permissions?.includes('member.manage')

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const data = await api.listWorkspaces()
        if (!cancelled && data != null && Array.isArray(data.workspaces)) {
          setWorkspaces(data.workspaces)
        }
      } catch (e: any) {
        if (!cancelled) mToast(`加载失败: ${e?.message || e}`, 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: '草稿', published: '已发布', completed: '已完成' }
    return map[s] || s
  }

  return (
    <>
      <MTopBar
        title={`工作区 · ${user?.display_name || ''}`}
        action={{ label: '退出', onClick: logout }}
      />
      <div className="m-content">
        <div className="m-entry-grid">
          {canAdmin && (
            <button className="m-entry-card" onClick={() => navigate('/admin')}>
              <span className="m-entry-icon">👥</span>
              <span>用户管理</span>
            </button>
          )}
          <button className="m-entry-card" onClick={() => navigate('/me')}>
            <span className="m-entry-icon">👤</span>
            <span>个人中心</span>
          </button>
        </div>
        {loading ? (
          <div className="m-loading">加载中…</div>
        ) : workspaces.length === 0 ? (
          <div className="m-empty">暂无工作区</div>
        ) : (
          workspaces.map(ws => (
            <div key={ws.id} className="m-card" onClick={() => navigate(`/ws/${ws.id}`)}>
              {ws.logo ? (
                <img className="m-card-logo" src={ws.logo} alt="" />
              ) : (
                <div className="m-card-logo-placeholder">{(ws.name || '?').charAt(0)}</div>
              )}
              <div className="m-card-body">
                <div className="m-card-name">{ws.name}</div>
                {ws.description && <div className="m-card-desc">{ws.description}</div>}
              </div>
              <span className={`m-badge ${ws.status === 'completed' ? 'completed' : ''}`}>
                {statusLabel(ws.status)}
              </span>
              <span className="m-card-arrow">›</span>
            </div>
          ))
        )}
      </div>
    </>
  )
}
