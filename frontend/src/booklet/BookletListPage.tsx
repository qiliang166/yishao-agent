import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'
import { useAuth } from '../contexts/AuthContext'
import { BOOK_TYPE_LABEL, BookType, BookletSummary } from './types'

export default function BookletListPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { confirm, toast } = useModal()
  const { user, token } = useAuth()
  const base = location.pathname.startsWith('/app') ? '/app/booklets' : '/booklets'
  const isAdmin = user?.user_type === 'admin'
  const userId = user?.user_id || ''

  const actionLock = useRef(false)

  const [booklets, setBooklets] = useState<BookletSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newType, setNewType] = useState<BookType>('a4')
  const [creating, setCreating] = useState(false)
  const [cloning, setCloning] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const list = await api.listBooklets()
      if (list != null) setBooklets(list as BookletSummary[])
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

  const handleClone = async (b: BookletSummary) => {
    setCloning(b.id)
    try {
      const cloned = await api.cloneBooklet(b.id)
      if (cloned != null && cloned.id) {
        toast('已引用到我的册子', 'success')
        navigate(`${base}/${cloned.id}`)
      }
    } catch (e: any) {
      toast(`引用失败: ${e?.message || e}`, 'error')
    } finally {
      setCloning(null)
    }
  }

  const recommended = isAdmin
    ? booklets.filter(b => b.is_recommended)
    : booklets.filter(b => b.is_recommended && b.owner_id !== userId)

  const myBooklets = isAdmin
    ? booklets.filter(b => !b.is_recommended && b.owner_id === userId)
    : booklets.filter(b => !b.is_recommended || b.owner_id === userId)

  const userBooklets = isAdmin
    ? booklets.filter(b => !b.is_recommended && b.owner_id !== userId)
    : []

  const handleCardClick = (b: BookletSummary) => {
    if (actionLock.current) { actionLock.current = false; return }
    navigate(`${base}/${b.id}`)
  }

  const handleToggleRecommend = async (b: BookletSummary, e?: React.MouseEvent) => {
    if (e) e.preventDefault()
    actionLock.current = true
    try {
      await api.updateBooklet(b.id, { is_recommended: !b.is_recommended })
      toast(b.is_recommended ? '已取消推荐' : '已设为推荐', 'success')
      load()
    } catch (err: any) { toast(`${b.is_recommended ? '取消' : '推荐'}失败: ${err?.message || err}`, 'error') }
    finally { actionLock.current = false }
  }

  const handleDelete = async (b: BookletSummary, e?: React.MouseEvent) => {
    if (e) e.preventDefault()
    actionLock.current = true
    const ok = await confirm(`确定删除册子「${b.title}」？删除后无法恢复。`)
    if (!ok) { actionLock.current = false; return }
    try {
      const r = await api.deleteBooklet(b.id)
      if (r != null) {
        toast('已删除', 'success')
        load()
      }
    } catch (e: any) {
      toast(`删除失败: ${e?.message || e}`, 'error')
    } finally { actionLock.current = false }
  }

  const renderThumb = (b: BookletSummary) => {
    const isPpt = b.book_type === 'ppt'
    const pageW = isPpt ? 1280 : 794
    const pageH = isPpt ? 720 : 1123
    const thumbW = isPpt ? 100 : 65
    const scale = thumbW / pageW
    const thumbH = Math.round(pageH * scale)
    const coverUrl = token
      ? `/api/booklets/${b.id}/cover-thumb?token=${encodeURIComponent(token)}`
      : `/api/booklets/${b.id}/cover-thumb`
    return (
      <div style={{
        width: thumbW + 16,
        flexShrink: 0,
        alignSelf: 'stretch',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 8px',
      }}>
        <div style={{
          width: thumbW,
          height: thumbH,
          overflow: 'hidden',
          borderRadius: 3,
          border: '1px solid rgba(0,0,0,0.08)',
          background: 'var(--bg-secondary, #f5f5f5)',
        }}>
          <iframe src={coverUrl} sandbox="allow-scripts" scrolling="no" title="封面"
            style={{
              width: pageW,
              height: pageH,
              border: 'none',
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }} />
        </div>
      </div>
    )
  }

  const renderCard = (b: BookletSummary, isRec: boolean) => {
    return (
    <div key={b.id} className="card" style={{ display: 'flex', flexDirection: 'row', padding: 0, overflow: 'hidden', gap: 0 }}>
      {renderThumb(b)}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 12px', minWidth: 0 }}>
        <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => handleCardClick(b)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 16 }}>{b.book_type === 'ppt' ? '🖥' : '📕'}</span>
            <div style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
          </div>
          {b.subtitle && <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{b.subtitle}</div>}
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', display: 'flex', gap: 10, marginTop: 2 }}>
            <span>{BOOK_TYPE_LABEL[b.book_type as BookType] || b.book_type}</span>
            <span>{b.chapter_count} 章</span>
          </div>
          {(isAdmin || isRec) && b.owner_name && (
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
              创建者：{b.owner_name}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 1 }}>
            更新于 {(b.updated_at || '').replace('T', ' ').slice(0, 16)}
          </div>
        </div>
        <div style={{ fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 6 }}>
          {isRec ? (
            isAdmin ? (
              <>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                  onClick={(e) => handleToggleRecommend(b, e)}>取消推荐</button>
                <span>
                  {b.owner_id === userId && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                      onClick={(e) => handleDelete(b, e)}>🗑 删除</button>
                  )}
                </span>
              </>
            ) : (
              cloning === b.id ? (
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>引用中...</span>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                  onClick={(e) => { e.preventDefault(); handleClone(b) }}>使用推荐</button>
              )
            )
          ) : (
            <>
              <span>
                {isAdmin && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                    onClick={(e) => handleToggleRecommend(b, e)}>⭐ 推荐</button>
                )}
              </span>
              <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                onClick={(e) => handleDelete(b, e)}>🗑 删除</button>
            </>
          )}
        </div>
      </div>
    </div>
  )}

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}>📚 电子成册</h2>
        <button type="button" className="btn btn-primary" onClick={(e) => { e.preventDefault(); setShowNew(true); }}>➕ 新建册子</button>
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
        <>
          {recommended.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>⭐ 推荐画册</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {recommended.map(b => renderCard(b, true))}
              </div>
            </div>
          )}
          {myBooklets.length > 0 && (
            <div style={{ marginBottom: userBooklets.length > 0 ? 24 : 0 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                {isAdmin ? '📝 我的画册' : '📝 我的画册'}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {myBooklets.map(b => renderCard(b, false))}
              </div>
            </div>
          )}
          {userBooklets.length > 0 && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>👥 用户画册</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {userBooklets.map(b => renderCard(b, false))}
              </div>
            </div>
          )}
        </>
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
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowNew(false)}>取消</button>
              <button type="button" className="btn btn-primary btn-sm" disabled={creating} onClick={handleCreate}>
                {creating ? '创建中...' : '创建并编辑'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
