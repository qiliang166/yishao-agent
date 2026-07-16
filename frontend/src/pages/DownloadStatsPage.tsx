import { useState, useCallback, useEffect } from 'react'
import { api } from '../services/api'

const PAGE_SIZE = 20

function Pager({ page, totalPages, total, onChange }: { page: number; totalPages: number; total: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '10px 0', fontSize: 11, color: 'var(--text-secondary)' }}>
      <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button>
      <span>第 {page} / {totalPages} 页（共 {total} 条）</span>
      <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>下一页</button>
    </div>
  )
}

export default function DownloadStatsPage() {
  const [statsTab, setStatsTab] = useState<'projects' | 'members'>('projects')
  const [projectStats, setProjectStats] = useState<any[]>([])
  const [memberStats, setMemberStats] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [authorFilter, setAuthorFilter] = useState('')
  const [projPage, setProjPage] = useState(1)
  const [memPage, setMemPage] = useState(1)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  const loadStats = async (which: 'projects' | 'members') => {
    setStatsTab(which)
    setLoading(true)
    setProjPage(1)
    setMemPage(1)
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

  const catOptions = [...new Set(projectStats.map((p: any) => p.category_name).filter(Boolean))] as string[]
  const authorOptions = [...new Set(projectStats.map((p: any) => p.author_name).filter(Boolean))] as string[]

  const filteredStats = projectStats.filter((p: any) =>
    (!catFilter || (catFilter === '__none__' ? !p.category_name : p.category_name === catFilter)) &&
    (!authorFilter || (authorFilter === '__none__' ? !p.author_name : p.author_name === authorFilter))
  )

  const sumBy = (key: string) => {
    const m = new Map<string, number>()
    for (const p of filteredStats) {
      const k = p[key] || '未设置'
      m.set(k, (m.get(k) || 0) + (p.download_count || 0))
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }

  const projTotalPages = Math.max(1, Math.ceil(filteredStats.length / PAGE_SIZE))
  const projPageItems = filteredStats.slice((projPage - 1) * PAGE_SIZE, projPage * PAGE_SIZE)
  const memTotalPages = Math.max(1, Math.ceil(memberStats.length / PAGE_SIZE))
  const memPageItems = memberStats.slice((memPage - 1) * PAGE_SIZE, memPage * PAGE_SIZE)

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
          <>
            {(catOptions.length > 0 || authorOptions.length > 0) && (
              <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
                {catOptions.length > 0 && (
                  <select className="form-input" style={{ width: 150, fontSize: 12 }}
                    value={catFilter} onChange={e => { setCatFilter(e.target.value); setProjPage(1) }}>
                    <option value="">全部分类</option>
                    {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="__none__">未分类</option>
                  </select>
                )}
                {authorOptions.length > 0 && (
                  <select className="form-input" style={{ width: 150, fontSize: 12 }}
                    value={authorFilter} onChange={e => { setAuthorFilter(e.target.value); setProjPage(1) }}>
                    <option value="">全部作者</option>
                    {authorOptions.map(a => <option key={a} value={a}>{a}</option>)}
                    <option value="__none__">无署名</option>
                  </select>
                )}
                {(catFilter || authorFilter) && (
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    共 {filteredStats.length} 条，下载合计 {filteredStats.reduce((s: number, p: any) => s + (p.download_count || 0), 0)} 次
                  </span>
                )}
              </div>
            )}
            <div className="card" style={{ padding: 0, marginTop: 12 }}>
              <table className="output-table">
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>序号</th>
                    <th style={{ width: 90 }}>编号</th>
                    <th>明细名称</th>
                    <th style={{ width: 110 }}>所属项目</th>
                    <th style={{ width: 100 }}>所属分类</th>
                    <th style={{ width: 100 }}>作者</th>
                    <th style={{ width: 80 }}>下载次数</th>
                    <th style={{ width: 60 }}>可下载</th>
                    <th style={{ width: 60 }}>积分</th>
                  </tr>
                </thead>
                <tbody>
                  {projPageItems.map((p: any, i: number) => (
                    <tr key={p.project_id}>
                      <td style={{ color: 'var(--text-secondary)' }}>{(projPage - 1) * PAGE_SIZE + i + 1}</td>
                      <td style={{ fontSize: 11, fontFamily: 'monospace' }}>{p.project_code || '—'}</td>
                      <td>{p.project_name}</td>
                      <td style={{ fontSize: 11 }}>{p.workspace_name || '—'}</td>
                      <td style={{ fontSize: 11 }}>{p.category_name || '—'}</td>
                      <td style={{ fontSize: 11 }}>{p.author_name || '—'}</td>
                      <td style={{ fontWeight: 600 }}>{p.download_count || 0}</td>
                      <td style={{ color: p.is_downloadable ? 'var(--success)' : 'var(--text-secondary)' }}>
                        {p.is_downloadable ? '是' : '否'}
                      </td>
                      <td>{(p.point_cost_deci / 10).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={projPage} totalPages={projTotalPages} total={filteredStats.length} onChange={setProjPage} />
            </div>
            {(catOptions.length > 0 || authorOptions.length > 0) && (
              <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                {catOptions.length > 0 && (
                  <div className="card" style={{ flex: 1, minWidth: 280, padding: '12px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>按分类汇总</div>
                    {sumBy('category_name').map(([name, count]) => (
                      <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{name}</span>
                        <span style={{ fontWeight: 600 }}>{count} 次</span>
                      </div>
                    ))}
                  </div>
                )}
                {authorOptions.length > 0 && (
                  <div className="card" style={{ flex: 1, minWidth: 280, padding: '12px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>按作者汇总</div>
                    {sumBy('author_name').map(([name, count]) => (
                      <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{name}</span>
                        <span style={{ fontWeight: 600 }}>{count} 次</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
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
                  <th style={{ width: 50 }}>序号</th>
                  <th>会员</th>
                  <th style={{ width: 90 }}>充值金额</th>
                  <th style={{ width: 80 }}>剩余积分</th>
                  <th style={{ width: 80 }}>消耗积分</th>
                  <th style={{ width: 80 }}>下载次数</th>
                  <th style={{ width: 70 }}>明细数</th>
                  <th style={{ width: 110 }}>最近下载</th>
                </tr>
              </thead>
              <tbody>
                {memPageItems.map((m: any, i: number) => (
                  <tr key={m.id}>
                    <td style={{ color: 'var(--text-secondary)' }}>{(memPage - 1) * PAGE_SIZE + i + 1}</td>
                    <td>
                      {m.display_name || m.username}
                      <span style={{ color: 'var(--text-secondary)', marginLeft: 6 }}>{m.username}</span>
                    </td>
                    <td>¥{((m.total_paid_cents || 0) / 100).toFixed(2)}</td>
                    <td style={{ fontWeight: 600, color: 'var(--success)' }}>{((m.balance_deci || 0) / 10).toFixed(1)}</td>
                    <td style={{ color: 'var(--warning)' }}>{((m.spent_deci || 0) / 10).toFixed(1)}</td>
                    <td style={{ fontWeight: 600 }}>{m.total_downloads || 0}</td>
                    <td>{m.unique_projects || 0}</td>
                    <td>{m.last_download ? new Date(m.last_download).toLocaleDateString('zh-CN') : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={memPage} totalPages={memTotalPages} total={memberStats.length} onChange={setMemPage} />
          </div>
        )
      )}
    </div>
  )
}
