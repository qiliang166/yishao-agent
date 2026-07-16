import { useState, useCallback, useEffect } from 'react'
import { api } from '../services/api'

export default function DownloadStatsPage() {
  const [statsTab, setStatsTab] = useState<'projects' | 'members'>('projects')
  const [projectStats, setProjectStats] = useState<any[]>([])
  const [memberStats, setMemberStats] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  const loadStats = async (which: 'projects' | 'members') => {
    setStatsTab(which)
    setLoading(true)
    try {
      if (which === 'projects') {
        const d = await api.getDownloadStatsByProject()
        setProjectStats((d as any)?.projects || [])
      } else {
        const d = await api.getDownloadStatsByMember()
        setMemberStats((d as any)?.members || [])
      }
    } catch (e: any) {
      showToast(e.message || '加载统计失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStats('projects') }, [])

  return (
    <div style={{ padding: '24px 32px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 24px 0' }}>下载统计</h1>

      {toast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 9999,
          background: 'var(--primary)', color: '#fff', padding: '10px 20px',
          borderRadius: 8, fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}>
          {toast}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => loadStats('projects')} style={{
          padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: statsTab === 'projects' ? 700 : 400,
          color: statsTab === 'projects' ? 'var(--primary)' : 'var(--text-secondary)',
          borderBottom: statsTab === 'projects' ? '2px solid var(--primary)' : '2px solid transparent',
        }}>按明细</button>
        <button onClick={() => loadStats('members')} style={{
          padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
          fontSize: 11, fontWeight: statsTab === 'members' ? 700 : 400,
          color: statsTab === 'members' ? 'var(--primary)' : 'var(--text-secondary)',
          borderBottom: statsTab === 'members' ? '2px solid var(--primary)' : '2px solid transparent',
        }}>按会员</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-secondary)' }}>加载中...</div>
      ) : statsTab === 'projects' ? (
        projectStats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 12 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📊</div>
            <p>暂无下载记录</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, marginTop: 16 }}>
            <table className="output-table">
              <thead>
                <tr>
                  <th>明细名称</th>
                  <th style={{ width: 100 }}>下载次数</th>
                  <th style={{ width: 100 }}>可下载</th>
                  <th style={{ width: 80 }}>积分</th>
                </tr>
              </thead>
              <tbody>
                {projectStats.map((p: any) => (
                  <tr key={p.project_id}>
                    <td>{p.project_name}</td>
                    <td style={{ fontWeight: 600 }}>{p.download_count || 0}</td>
                    <td style={{ color: p.is_downloadable ? 'var(--success)' : 'var(--text-secondary)' }}>
                      {p.is_downloadable ? '是' : '否'}
                    </td>
                    <td>{(p.point_cost_deci / 10).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        memberStats.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 64, color: 'var(--text-secondary)', fontSize: 12 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>👥</div>
            <p>暂无下载记录</p>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, marginTop: 16 }}>
            <table className="output-table">
              <thead>
                <tr>
                  <th>会员</th>
                  <th style={{ width: 100 }}>下载次数</th>
                  <th style={{ width: 100 }}>明细数</th>
                  <th style={{ width: 140 }}>最近下载</th>
                </tr>
              </thead>
              <tbody>
                {memberStats.map((m: any) => (
                  <tr key={m.id}>
                    <td>
                      {m.display_name || m.username}
                      <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>{m.username}</span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{m.total_downloads || 0}</td>
                    <td>{m.unique_projects || 0}</td>
                    <td>{m.last_download ? new Date(m.last_download).toLocaleDateString('zh-CN') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
