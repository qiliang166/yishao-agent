import { useState, useEffect, useMemo, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../services/api'
import SvgIcon from '../components/SvgIcon'

const isImagePath = (v: string) =>
  v.startsWith('/api/logos/') || v.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)($|\?)/i)

const PAGE_SIZE_OPTIONS = [
  { label: '50张', value: 50 },
  { label: '250张', value: 250 },
  { label: '500张', value: 500 },
  { label: '显示全部', value: 0 },
]

export default function LandingPage() {
  const { user, token } = useAuth()
  const navigate = useNavigate()

  const [brandName, setBrandName] = useState('')
  const [brandLogo, setBrandLogo] = useState('')
  const [brandSlogan, setBrandSlogan] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [booklets, setBooklets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [pageSize, setPageSize] = useState(50)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then(r => r.json()),
      fetch('/api/version').then(r => r.json()),
      api.publicListBooklets('', 1, pageSize === 0 ? 100000 : pageSize),
    ]).then(([data, ver, bookletData]) => {
      const s = data.settings || {}
      const fallback = (ver as any).app || ''
      if (s.brand_name) setBrandName(s.brand_name)
      else if (fallback) setBrandName(fallback)
      if (s.brand_logo) setBrandLogo(s.brand_logo)
      if (s.branding_slogan) setBrandSlogan(s.branding_slogan)
      setBooklets(bookletData.booklets || [])
      setTotalCount(bookletData.total_all ?? 0)
    }).catch(() => {})
    .finally(() => setLoading(false))
  }, [pageSize])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return booklets
    const q = searchQuery.trim().toLowerCase()
    return booklets.filter((b: any) =>
      b.title.toLowerCase().includes(q) || b.id.toLowerCase().includes(q)
    )
  }, [booklets, searchQuery])

  const handleBookletClick = (id: string) => {
    if (!user) {
      const hp = (window as any).__HOMEPAGE_PATH__ || window.location.pathname
      navigate('/member?redirect=' + encodeURIComponent(hp))
      return
    }
    const base = user.user_type === 'admin' ? '/booklets' : '/app/booklets'
    navigate(`${base}/${id}?step=5`)
  }

  const name = brandName || 'Yishao Agent'
  const logo = brandLogo || ''

  const coverThumbUrl = useCallback((b: any) => {
    if (user && token) return `/api/booklets/${b.id}/cover-thumb?token=${encodeURIComponent(token)}`
    return `/api/public/booklets/${b.id}/cover-thumb`
  }, [user, token])

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 24px', borderBottom: '1px solid var(--border)',
        background: 'var(--card-bg, #ffffff)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isImagePath(logo) ? (
            <img src={logo} alt="Logo" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'cover' }} />
          ) : logo ? (
            <span style={{ fontSize: 24 }}>{logo}</span>
          ) : (
            <SvgIcon name="bolt" size={28} />
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{name}</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {user ? (
            <Link to={(user.user_type === 'member' && !user.roles?.includes('开发体验员')) ? '/app/center' : '/home'} style={{
              fontSize: 12, color: 'var(--primary)', textDecoration: 'none',
              padding: '4px 12px', border: '1px solid var(--primary)', borderRadius: 4,
            }}>
              {(user.user_type === 'member' && !user.roles?.includes('开发体验员')) ? '进入工作台' : '进入后台'}
            </Link>
          ) : (
            <>
              <Link to="/login" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none' }}>
                管理员登录
              </Link>
              <Link to="/member" style={{
                fontSize: 12, color: 'var(--primary)', textDecoration: 'none',
                padding: '4px 12px', border: '1px solid var(--primary)', borderRadius: 4,
              }}>
                会员登录
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero */}
      <section style={{
        textAlign: 'center', padding: '60px 24px 40px',
      }}>
        <div style={{ marginBottom: 16 }}>
          {isImagePath(logo) ? (
            <img src={logo} alt="Logo" style={{ width: 64, height: 64, borderRadius: 12, objectFit: 'cover' }} />
          ) : logo ? (
            <span style={{ fontSize: 56 }}>{logo}</span>
          ) : (
            <SvgIcon name="bolt" size={56} />
          )}
        </div>
        <h1 style={{
          fontSize: 28, fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text)',
        }}>
          {name}
        </h1>
        {brandSlogan && (
          <p style={{
            fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 8px 0',
          }}>
            {brandSlogan}
          </p>
        )}
        <div style={{
          fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 28px 0',
        }}>
          当前收录：{totalCount}份菜谱
        </div>

        {/* Search Box */}
        <div style={{
          display: 'inline-flex', alignItems: 'center',
          width: '100%', maxWidth: 560,
          border: '1px solid var(--border)',
          borderRadius: 24, padding: '10px 20px',
          background: 'var(--card-bg, #ffffff)',
          boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          transition: 'box-shadow 0.2s',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索电子书..."
            style={{
              flex: 1, border: 'none', outline: 'none',
              fontSize: 15, marginLeft: 10,
              background: 'transparent', color: 'var(--text)',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                border: 'none', background: 'none', cursor: 'pointer',
                color: 'var(--text-secondary)', fontSize: 16, padding: 0,
              }}
            >
              ×
            </button>
          )}
        </div>
      </section>

      {/* Booklet Grid */}
      <section style={{ padding: '0 24px 60px', maxWidth: 1200, margin: '0 auto' }}>
        {loading ? (
          <div style={{
            textAlign: 'center', padding: 60,
            color: 'var(--text-secondary)', fontSize: 14,
          }}>
            加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 60,
            color: 'var(--text-secondary)', fontSize: 14,
          }}>
            {searchQuery ? '未找到匹配的电子书' : '暂无电子书'}
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            justifyContent: 'center',
          }}>
            {filtered.map((b: any) => {
              const isPpt = b.book_type === 'ppt'
              const pageW = isPpt ? 1280 : 794
              const pageH = isPpt ? 720 : 1123
              const COVER_H = 255
              const coverW = COVER_H * (isPpt ? 1280/720 : 794/1123)
              return (
                <div
                  key={b.id}
                  onClick={() => handleBookletClick(b.id)}
                  style={{
                    width: coverW,
                    maxWidth: '100%',
                    flexShrink: 0,
                    cursor: 'pointer',
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid var(--border)',
                    background: 'var(--card-bg, #ffffff)',
                    transition: 'box-shadow 0.2s, transform 0.2s',
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)'
                    ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLElement).style.boxShadow = ''
                    ;(e.currentTarget as HTMLElement).style.transform = ''
                  }}
                >
                  {/* Cover iframe — same rendering engine as admin backend */}
                  <div style={{
                    width: coverW,
                    height: COVER_H,
                    overflow: 'hidden',
                    background: 'var(--bg-secondary, #f0f0f0)',
                    position: 'relative',
                  }}>
                    <iframe src={coverThumbUrl(b)}
                      sandbox="allow-scripts" scrolling="no" title={b.title}
                      ref={(el) => {
                        if (!el) return
                        const parent = el.parentElement
                        if (!parent) return
                        const cw = parent.clientWidth
                        const ch = parent.clientHeight
                        if (!cw || !ch) return
                        const scale = Math.min(cw / pageW, ch / pageH)
                        el.style.width = pageW + 'px'
                        el.style.height = pageH + 'px'
                        el.style.transform = `scale(${scale})`
                      }}
                      style={{
                        border: 'none',
                        transformOrigin: 'top left',
                        position: 'absolute',
                        top: 0, left: 0,
                        pointerEvents: 'none',
                      }}
                    />
                  </div>
                  {/* Card Footer */}
                  <div style={{
                    padding: '10px 12px',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                      {b.book_type === 'a4' ? '书册版' : '合辑版'}
                    </span>
                    <span style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 3,
                      background: b.is_recommended ? 'var(--primary)' : 'var(--border)',
                      color: b.is_recommended ? '#ffffff' : 'var(--text-secondary)',
                    }}>
                      {b.is_recommended ? '推荐' : `${b.chapter_count || 0}篇`}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{
            display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 24,
          }}>
            {PAGE_SIZE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setPageSize(opt.value)}
                style={{
                  padding: '4px 16px', fontSize: 13, borderRadius: 4, cursor: 'pointer',
                  border: pageSize === opt.value ? '1px solid var(--primary)' : '1px solid var(--border)',
                  background: pageSize === opt.value ? 'var(--primary)' : 'var(--card-bg, #ffffff)',
                  color: pageSize === opt.value ? '#ffffff' : 'var(--text-secondary)',
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
