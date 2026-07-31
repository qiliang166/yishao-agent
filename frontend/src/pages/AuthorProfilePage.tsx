import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../services/api'

export default function AuthorProfilePage() {
  const { id } = useParams<{ id: string }>()
  const [author, setAuthor] = useState<any>(null)
  const [works, setWorks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    Promise.all([
      api.getAuthorProfile(id).catch(() => null),
      api.getAuthorWorks(id).catch(() => ({ works: [] })),
    ]).then(([profile, w]) => {
      setAuthor(profile)
      setWorks((w as any)?.works || [])
    }).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>
  }
  if (!author) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>作者不存在</div>
  }

  const isSigned = author.contract_status === 'active'

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 20px' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 32 }}>
        {author.photo_url ? (
          <img src={author.photo_url} alt={author.name}
            style={{ width: 100, height: 100, borderRadius: '50%', objectFit: 'cover', border: '3px solid var(--border)', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 100, height: 100, borderRadius: '50%', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: 'var(--text-secondary)', flexShrink: 0 }}>
            {author.name?.charAt(0) || '?'}
          </div>
        )}
        <div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 12 }}>
            {author.name}
            {isSigned && <span style={{ fontSize: 13, background: 'var(--accent)', color: '#fff', padding: '2px 10px', borderRadius: 12, fontWeight: 500 }}>签约作者</span>}
          </h1>
          {author.intro && <p style={{ margin: '12px 0 0', color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: 15 }}>{author.intro}</p>}
        </div>
      </div>

      {/* Works Gallery */}
      {works.length > 0 && (
        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>作品集</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
            {works.slice(0, 8).map(w => (
              <div key={w.id} style={{
                background: 'var(--card-bg)', borderRadius: 10, overflow: 'hidden',
                border: '1px solid var(--border)', transition: '0.15s',
              }}>
                <div style={{ height: 120, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {w.name?.substring(0, 4)}
                </div>
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                    {(w.point_cost_deci / 10).toFixed(1)} 积分 · {w.download_count || 0} 次下载
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Works List */}
      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>可下载作品</h2>
        {works.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>暂无作品</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {works.map(w => (
              <div key={w.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', background: 'var(--card-bg)', borderRadius: 8,
                border: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{w.name}</span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {(w.point_cost_deci / 10).toFixed(1)} 积分
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* License */}
      {author.license_text && (
        <section>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>授权说明</h2>
          <div style={{ padding: 16, background: 'var(--bg-secondary)', borderRadius: 8, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
            {author.license_text}
          </div>
        </section>
      )}
    </div>
  )
}
