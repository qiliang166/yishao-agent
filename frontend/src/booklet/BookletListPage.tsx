import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import SvgIcon from '../components/SvgIcon'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'
import { useAuth } from '../contexts/AuthContext'
import { BOOK_TYPE_LABEL, BookType, BookletSummary } from './types'

const PAGE_SIZE = 24

const triggerHtmlDownload = (html: string, filename: string) => {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

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
  const [showBatch, setShowBatch] = useState(false)
  const [batchType, setBatchType] = useState<BookType>('a4')
  const [cloning, setCloning] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [recPage, setRecPage] = useState(1)
  const [minePage, setMinePage] = useState(1)
  const [userPage, setUserPage] = useState(1)

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
    setRecPage(1)
    setMinePage(1)
    setUserPage(1)
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

  const handleCardDownload = async (b: BookletSummary, e: React.MouseEvent) => {
    e.preventDefault()
    actionLock.current = true
    try {
      const costInfo = await api.getBookletDownloadCost(b.id)
      if (costInfo == null) { toast('操作失败', 'error'); return }

      // 超管或 owner 直接下载
      if (costInfo.is_super_admin || costInfo.is_owner || costInfo.cost_deci === 0) {
        setDownloadingId(b.id)
        const html = await api.downloadBooklet(b.id)
        triggerHtmlDownload(html, `${b.title}.html`)
        toast('下载完成', 'success')
        return
      }

      // 需要扣积分 → 确认弹窗
      const cost = (costInfo.cost_deci / 10).toFixed(1)
      const balance = (costInfo.balance_deci / 10).toFixed(1)
      const ok = await confirm(
        `下载「${b.title}」将消耗 ${cost} 积分（余额 ${balance} 积分），共 ${costInfo.project_count} 个项目。\n\n确定下载吗？`
      )
      if (!ok) return

      setDownloadingId(b.id)
      const html = await api.downloadBooklet(b.id)
      triggerHtmlDownload(html, `${b.title}.html`)
      toast('下载完成', 'success')
    } catch (e: any) {
      toast(`下载失败: ${e?.message || e}`, 'error')
    } finally {
      setDownloadingId(null)
      actionLock.current = false
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

  const paginate = (arr: BookletSummary[], page: number) => {
    const totalPages = Math.max(1, Math.ceil(arr.length / PAGE_SIZE))
    const cur = Math.min(Math.max(1, page), totalPages)
    const start = (cur - 1) * PAGE_SIZE
    return { items: arr.slice(start, start + PAGE_SIZE), cur, totalPages }
  }

  const recPg = paginate(recommended, recPage)
  const minePg = paginate(myBooklets, minePage)
  const userPg = paginate(userBooklets, userPage)

  const renderPager = (cur: number, totalPages: number, total: number, setPage: (p: number) => void) => {
    if (totalPages <= 1) return null
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 14 }}>
        <button type="button" className="btn btn-ghost btn-sm" disabled={cur <= 1} onClick={() => setPage(cur - 1)}>« 上一页</button>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>第 {cur} / {totalPages} 页 · 共 {total} 本</span>
        <button type="button" className="btn btn-ghost btn-sm" disabled={cur >= totalPages} onClick={() => setPage(cur + 1)}>下一页 »</button>
      </div>
    )
  }

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
    const isDownloading = downloadingId === b.id
    return (
    <div key={b.id} className="card" style={{ display: 'flex', flexDirection: 'row', padding: 0, overflow: 'hidden', gap: 0 }}>
      {renderThumb(b)}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 12px', minWidth: 0 }}>
        <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => handleCardClick(b)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.title}</div>
          </div>
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
                <span style={{ display: 'flex', gap: 4 }}>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                    disabled={isDownloading}
                    onClick={(e) => { e.preventDefault(); handleCardDownload(b, e) }}>
                    {isDownloading ? '下载中...' : '下载'}
                  </button>
                  {b.owner_id === userId && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                      onClick={(e) => handleDelete(b, e)}><SvgIcon name="trash" size={14} /> 删除</button>
                  )}
                </span>
              </>
            ) : (
              cloning === b.id ? (
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>引用中...</span>
              ) : (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                    onClick={(e) => { e.preventDefault(); handleClone(b) }}>复制推荐</button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                    disabled={isDownloading}
                    onClick={(e) => { e.preventDefault(); handleCardDownload(b, e) }}>
                    {isDownloading ? '下载中...' : '下载'}
                  </button>
                </>
              )
            )
          ) : (
            <>
              <span>
                {isAdmin && (
                  <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                    onClick={(e) => handleToggleRecommend(b, e)}><SvgIcon name="star" size={14} /> 推荐</button>
                )}
              </span>
              <span style={{ display: 'flex', gap: 4 }}>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                  disabled={isDownloading}
                  onClick={(e) => { e.preventDefault(); handleCardDownload(b, e) }}>
                  {isDownloading ? '下载中...' : '下载'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" style={{ fontSize: 10 }}
                  onClick={(e) => handleDelete(b, e)}><SvgIcon name="trash" size={14} /> 删除</button>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  )}

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, flex: 1 }}><SvgIcon name="book-open" size={14} /> 电子成册</h2>
        <button type="button" className="btn btn-ghost" onClick={(e) => { e.preventDefault(); setShowBatch(true); }}><SvgIcon name="package" size={14} /> 批量新建</button>
        <button type="button" className="btn btn-primary" onClick={(e) => { e.preventDefault(); setShowNew(true); }}><SvgIcon name="plus" size={14} /> 新建册子</button>
      </div>
      <div className="card-hint" style={{ marginBottom: 14 }}>
        把已生成的文档、课件、演讲稿汇编成一本可下载的电子书 — 选内容 → 排顺序 → 填封面 → 合成下载，四步完成。
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 30, textAlign: 'center' }}>加载中...</div>
      ) : booklets.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 13 }}>
          还没有册子 — 点击右上角「<SvgIcon name="plus" size={14} /> 新建册子」开始
        </div>
      ) : (
        <>
          {recommended.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}><SvgIcon name="star" size={14} /> 推荐画册</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {recPg.items.map(b => renderCard(b, true))}
              </div>
              {renderPager(recPg.cur, recPg.totalPages, recommended.length, setRecPage)}
            </div>
          )}
          {myBooklets.length > 0 && (
            <div style={{ marginBottom: userBooklets.length > 0 ? 24 : 0 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>
                <SvgIcon name="file-text" size={14} /> 我的画册
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {minePg.items.map(b => renderCard(b, false))}
              </div>
              {renderPager(minePg.cur, minePg.totalPages, myBooklets.length, setMinePage)}
            </div>
          )}
          {userBooklets.length > 0 && (
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}><SvgIcon name="users" size={14} /> 用户画册</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {userPg.items.map(b => renderCard(b, false))}
              </div>
              {renderPager(userPg.cur, userPg.totalPages, userBooklets.length, setUserPage)}
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
                    <div style={{ fontWeight: 600 }}>{t === 'a4' ? <><SvgIcon name="book-open" size={14} /> A4 书册版</> : <><SvgIcon name="monitor" size={14} /> PPT 合辑版</>}</div>
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

      {showBatch && (
        <div className="dialog-overlay" onClick={() => setShowBatch(false)}>
          <div className="dialog-box" style={{ width: 400 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">批量新建</div>
            <div className="card-hint" style={{ marginTop: 0 }}>
              一次勾选多个项目，为每个项目各生成一本电子书，封面与署名批量设置。
            </div>
            <div className="form-group">
              <label className="form-label">册子类型（决定页面尺寸）</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                {(['a4', 'ppt'] as BookType[]).map(t => (
                  <div key={t} onClick={() => setBatchType(t)}
                    style={{
                      flex: 1, padding: '10px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                      border: `2px solid ${batchType === t ? 'var(--primary)' : 'var(--border)'}`,
                      background: batchType === t ? 'var(--bg-hover)' : 'transparent',
                    }}>
                    <div style={{ fontWeight: 600 }}>{t === 'a4' ? <><SvgIcon name="book-open" size={14} /> A4 书册版</> : <><SvgIcon name="monitor" size={14} /> PPT 合辑版</>}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>
                      {t === 'a4' ? '竖版 A4 — 文档、演讲稿，可打印装订' : '横版 16:9 — 分析PPT、综合PPT 合辑'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowBatch(false)}>取消</button>
              <button type="button" className="btn btn-primary btn-sm"
                onClick={() => { setShowBatch(false); navigate(`${base}/batch?book_type=${batchType}`) }}>
                下一步
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
