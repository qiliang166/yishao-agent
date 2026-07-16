import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'
import { BOOK_TYPE_LABEL, BookType } from './types'

export default function BookletListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { confirm, toast } = useModal()
  const base = location.pathname.startsWith('/app') ? '/app/booklets' : '/booklets'

  const [booklets, setBooklets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<BookType>('a4')
  const [creating, setCreating] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const list = await api.listBooklets()
      if (list != null) setBooklets(list)
    } catch (e: any) {
      toast(`加载失败: ${e?.message || e}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!newTitle.trim()) { toast('请输入书名', 'error'); return }
    setCreating(true)
    try {
      const b = await api.createBooklet(newTitle.trim(), newType)
      if (b != null && b.id) {
        setShowNew(false)
        setNewTitle('')
        navigate(`${base}/${b.id}`)
      }
    } catch (e: any) {
      toast(`创建失败: ${e?.message || e}`, 'error')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (b: any) => {
    const ok = await confirm(`确定删除册子「${b.title}」？删除后无法恢复。`)
    if (!ok) return
    try {
      const r = await api.deleteBooklet(b.id)
      if (r != null) {
        toast('已删除', 'success')
        load()
      }
    } catch (e: any) {
      toast(`删除失败: ${e?.message || e}`, 'error')
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>📚 电子成册</h2>
        <button className="btn btn-primary" onClick={() => setShowNew(true)}>➕ 新建册子</button>
      </div>
      <div className="card-hint" style={{ marginBottom: 14 }}>
        把已生成的文档、课件、演讲稿汇编成一本可下载的电子书 — 选内容 → 排顺序 → 填封面 → 合成下载，四步完成。
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 30, textAlign: 'center' }}>加载中...</div>
      ) : booklets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
          还没有册子 — 点击右上角「➕ 新建册子」开始
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {booklets.map(b => (
            <div key={b.id} className="card" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 6 }}
              onClick={() => navigate(`${base}/${b.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 18 }}>{b.book_type === 'ppt' ? '🖥' : '📕'}</span>
                <div style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
              </div>
              {b.subtitle && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{b.subtitle}</div>}
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 10 }}>
                <span>{BOOK_TYPE_LABEL[b.book_type as BookType] || b.book_type}</span>
                <span>{b.chapter_count} 章</span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center' }}>
                <span style={{ flex: 1 }}>更新于 {(b.updated_at || '').replace('T', ' ').slice(0, 16)}</span>
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                  onClick={e => { e.stopPropagation(); handleDelete(b) }}>🗑 删除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="dialog-overlay" onClick={() => setShowNew(false)}>
          <div className="dialog-box" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">新建册子</div>
            <div className="form-group">
              <label className="form-label">书名</label>
              <input className="form-input" value={newTitle} autoFocus
                placeholder="例如：食品安全培训手册"
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate() }} />
            </div>
            <div className="form-group">
              <label className="form-label">册子类型（决定页面尺寸，创建后不可更改）</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {(['a4', 'ppt'] as BookType[]).map(t => (
                  <div key={t} onClick={() => setNewType(t)}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      border: `2px solid ${newType === t ? 'var(--primary)' : 'var(--border)'}`,
                      background: newType === t ? 'var(--bg-hover)' : 'transparent',
                    }}>
                    <div style={{ fontWeight: 600 }}>{t === 'a4' ? '📕 A4 书册版' : '🖥 PPT 合辑版'}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>
                      {t === 'a4' ? '竖版 A4 — 文档、演讲稿、文档课件，可打印装订' : '横版 16:9 — 分析PPT、综合PPT 合辑，键盘翻页'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>取消</button>
              <button className="btn btn-primary btn-sm" disabled={creating} onClick={handleCreate}>
                {creating ? '创建中...' : '创建并编辑'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
