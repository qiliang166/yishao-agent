import { useState, useEffect } from 'react'
import { api } from '../../services/api'
import { BookletDraft, Chapter, PageMapChapter, Theme, mdToHtml } from '../types'
import ProsePreview from './ProsePreview'
import { splitProsePages, proseSplitCss, themeVars } from '../proseSplit'

interface Props {
  draft: BookletDraft
  dirty: boolean
  onSave: () => Promise<boolean>
  onChange: (updater: (d: BookletDraft) => BookletDraft) => void
}

const FIXED_LABEL: Record<string, string> = { flyleaf: '扉页', toc: '目录', back: '封底' }

/** order 须为 0..n-1 完整排列才生效（与后端 _visible_page_indices / 模板编排脚本同规则） */
function validOrder(order: number[] | undefined | null, count: number): number[] {
  const natural = Array.from({ length: count }, (_, i) => i)
  if (!Array.isArray(order)) return natural
  const cand = order.filter(i => Number.isInteger(i) && i >= 0 && i < count)
  if (cand.length === count && new Set(cand).size === count) return cand
  return natural
}

function pageOrderOf(ch: Chapter | undefined, count: number): number[] {
  return validOrder(ch?.page_order, count)
}

const safeBg = (v?: string) => (v && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : undefined)

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 生成 PPT 章节标题页缩略图文档（与合成模板 bk-chapter-divider 同款） */
function chapterDividerDoc(chapterNo: number, title: string, src: string, theme: Theme | null): string {
  const vars = themeVars(theme)
  const varCss = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{font-family:var(--book-font);color:var(--book-text)}
.bk-slide{width:1280px;height:720px;display:flex;flex-direction:column;overflow:hidden}
.bk-chapter-divider{align-items:center;justify-content:center;text-align:center;background:var(--book-primary)}
.bk-chapter-no{font-size:22px;color:var(--book-accent);letter-spacing:0.35em;font-weight:600}
.bk-chapter-title{margin-top:26px;font-size:46px;font-weight:700;color:var(--book-bg);max-width:1000px;line-height:1.4}
.bk-chapter-src{margin-top:20px;font-size:17px;color:var(--book-bg);opacity:0.6}
</style></head>
<body style="${varCss};font-family:var(--book-font);color:var(--book-text)">
<section class="bk-slide bk-chapter-divider">
<div class="bk-chapter-no">CHAPTER ${String(chapterNo).padStart(2, '0')}</div>
<div class="bk-chapter-title">${escHtml(title)}</div>
<div class="bk-chapter-src">来源：${escHtml(src)}</div>
</section></body></html>`
}

/** 把拆页产物包成自包含文档（iframe 缩略图用，页数分界与合成产物一致） */
function proseDoc(bookType: 'a4' | 'ppt', inner: string, theme: Theme | null, bgColor?: string): string {
  const vars = themeVars(theme)
  const varCss = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')
  const cls = bookType === 'a4' ? 'bk-sheet' : 'bk-slide bk-prose-slide'
  const bg = bgColor ? `background:${bgColor};` : ''
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}${proseSplitCss(bookType)}</style></head>` +
    `<body class="bkr-host" style="${varCss};font-family:var(--book-font);color:var(--book-text)">` +
    `<section class="${cls}" style="${bg}">${inner}</section></body></html>`
}

function Thumb({ doc, pageW, pageH, thumbW }: { doc: string; pageW: number; pageH: number; thumbW: number }) {
  const scale = thumbW / pageW
  return (
    <div style={{ width: thumbW, height: Math.round(pageH * scale), overflow: 'hidden', background: '#fff' }}>
      <iframe srcDoc={doc} sandbox="" scrolling="no" title="页面缩略图"
        style={{ width: pageW, height: pageH, border: 'none', transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }} />
    </div>
  )
}

export default function StepPages({ draft, dirty, onSave, onChange }: Props) {
  const [pageMap, setPageMap] = useState<PageMapChapter[] | null>(null)
  const [fixedKeys, setFixedKeys] = useState<string[]>([])
  const [fixedDocs, setFixedDocs] = useState<Record<string, string>>({})
  const [proseDocs, setProseDocs] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [themes, setThemes] = useState<Theme[]>([])
  const [reloadKey, setReloadKey] = useState(0)

  const isA4 = draft.book_type === 'a4'
  const isFlow = draft.cover.render_mode === 'flow'
  const pageW = isA4 ? 794 : 1280
  const pageH = isA4 ? 1123 : 720
  const thumbW = isA4 ? 118 : 170
  const thumbH = Math.round(pageH * (thumbW / pageW))
  const theme = themes.find(t => t.id === draft.cover.theme_id) || themes[0] || null

  useEffect(() => {
    api.bookletThemes()
      .then(list => { if (list != null) setThemes(list) })
      .catch(() => { /* 主题加载失败时缩略图用默认配色，不阻断编排 */ })
  }, [])

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setLoadError('')
      try {
        if (dirty) {
          const saved = await onSave()
          if (!saved) { setLoadError('草稿保存失败，无法生成页面清单'); return }
        }
        const r = await api.bookletPageMap(draft.id)
        if (r != null && r.chapters != null) {
          setPageMap(r.chapters)
          setFixedKeys(r.fixed || [])
          setFixedDocs(r.fixed_docs || {})
        }
      } catch (e: any) {
        setLoadError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [reloadKey])

  /* 正文章节浏览器端拆页（与合成模板 bkSplitProse 同算法）；网页式不分页不拆 */
  useEffect(() => {
    if (!pageMap || isFlow) { setProseDocs({}); return }
    const out: Record<string, string[]> = {}
    pageMap.forEach((pm, chIdx) => {
      if (pm.kind !== 'prose') return
      const ch = draft.chapters.find(c => c.id === pm.chapter_id)
      if (!ch) return
      try {
        const html = ch.content_html || mdToHtml(ch.content || '')
        const bg = safeBg(ch.bg_color)
        const pages = splitProsePages({
          bookType: draft.book_type, html, theme, bgColor: bg,
          chapterNo: chIdx + 1, chapterTitle: ch.title,
          chapterSrc: ch.project_name ? `来源：${ch.project_name}` : '自建章节',
        })
        out[pm.chapter_id] = pages.map(p => proseDoc(draft.book_type, p, theme, bg))
      } catch { /* 拆页失败回退单卡展示 */ }
    })
    setProseDocs(out)
  }, [pageMap, theme, isFlow, draft.book_type])

  const hiddenFixed = draft.cover.hidden_fixed || []
  const toggleFixed = (key: string) => {
    onChange(d => {
      const cur = new Set(d.cover.hidden_fixed || [])
      if (cur.has(key)) cur.delete(key); else cur.add(key)
      return { ...d, cover: { ...d.cover, hidden_fixed: [...cur] } }
    })
  }

  const togglePage = (chapterId: string, idx: number) => {
    onChange(d => ({
      ...d,
      chapters: d.chapters.map(c => {
        if (c.id !== chapterId) return c
        const hidden = new Set(c.hidden_pages || [])
        if (hidden.has(idx)) hidden.delete(idx); else hidden.add(idx)
        return { ...c, hidden_pages: [...hidden].sort((a, b) => a - b) }
      }),
    }))
  }

  const movePage = (chapterId: string, count: number, pos: number, dir: -1 | 1) => {
    onChange(d => ({
      ...d,
      chapters: d.chapters.map(c => {
        if (c.id !== chapterId) return c
        const order = pageOrderOf(c, count)
        const j = pos + dir
        if (j < 0 || j >= order.length) return c
        const next = [...order]
        ;[next[pos], next[j]] = [next[j], next[pos]]
        return { ...c, page_order: next }
      }),
    }))
  }

  /* 正文拆页级操作写 prose_* 新字段：与 hidden_pages=[0]（整章隐藏）语义独立，翻页式/标准页合成时生效 */
  const toggleProsePage = (chapterId: string, idx: number) => {
    onChange(d => ({
      ...d,
      chapters: d.chapters.map(c => {
        if (c.id !== chapterId) return c
        const hidden = new Set(c.prose_hidden_pages || [])
        if (hidden.has(idx)) hidden.delete(idx); else hidden.add(idx)
        return { ...c, prose_hidden_pages: [...hidden].sort((a, b) => a - b) }
      }),
    }))
  }

  const moveProsePage = (chapterId: string, count: number, pos: number, dir: -1 | 1) => {
    onChange(d => ({
      ...d,
      chapters: d.chapters.map(c => {
        if (c.id !== chapterId) return c
        const order = validOrder(c.prose_page_order, count)
        const j = pos + dir
        if (j < 0 || j >= order.length) return c
        const next = [...order]
        ;[next[pos], next[j]] = [next[j], next[pos]]
        return { ...c, prose_page_order: next }
      }),
    }))
  }

  const toggleDivider = (chapterId: string) => {
    onChange(d => ({
      ...d,
      chapters: d.chapters.map(c => (c.id === chapterId ? { ...c, hide_divider: !c.hide_divider } : c)),
    }))
  }

  const eyeBtn = (hidden: boolean, onClick: () => void, title: string) => (
    <button className="btn btn-ghost btn-sm" title={title} onClick={onClick}
      style={{ fontSize: 10, padding: '1px 6px' }}>
      {hidden ? '🚫 已隐藏' : '👁 显示中'}
    </button>
  )

  const cardStyle = (hidden: boolean): React.CSSProperties => ({
    border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden',
    background: 'var(--card)', opacity: hidden ? 0.4 : 1, position: 'relative', flexShrink: 0,
  })

  const badge = (
    <span style={{
      position: 'absolute', top: 4, right: 4, fontSize: 9, padding: '1px 5px', borderRadius: 3,
      background: 'rgba(0,0,0,0.65)', color: '#fff', zIndex: 1,
    }}>已隐藏</span>
  )

  if (loading) {
    return <div style={{ padding: 30, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>正在生成页面清单...</div>
  }
  if (loadError) {
    return (
      <div style={{ padding: 30, textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: 'var(--danger, #dc2626)', marginBottom: 10 }}>页面清单加载失败：{loadError}</div>
        <button className="btn btn-ghost btn-sm" onClick={() => setReloadKey(k => k + 1)}>重试</button>
      </div>
    )
  }

  const draftChapterById = (id: string) => draft.chapters.find(c => c.id === id)

  const fixedFallback = (icon: string, label: string, dark?: boolean) => (
    <div style={{
      width: thumbW, height: thumbH, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 4, fontSize: 11,
      background: dark ? 'var(--book-primary, #18181b)' : 'var(--bg-secondary, #f4f4f5)', color: dark ? '#fff' : undefined,
    }}>
      <span style={{ fontSize: 18 }}>{icon}</span>
      <span>{label}</span>
    </div>
  )

  return (
    <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="card-title" style={{ flexShrink: 0 }}>📑 页面编排</div>
      <div className="card-hint" style={{ flexShrink: 0 }}>
        每一页可单独隐藏（不进合成产物），同一章节内的页可调整先后顺序；章节之间的顺序在第②步调整。
        {isFlow && <span style={{ color: 'var(--warning, #d97706)' }}> 当前为网页式合成：正文不分页，正文章节仅支持整章隐藏。</span>}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>

        {/* 固定页：可隐藏不可排序（封面不可隐藏） */}
        <div style={{ fontSize: 12, fontWeight: 600, margin: '8px 0 6px' }}>📘 固定页</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={cardStyle(false)}>
            {fixedDocs['cover']
              ? <Thumb doc={fixedDocs['cover']} pageW={pageW} pageH={pageH} thumbW={thumbW} />
              : fixedFallback('📕', '封面', true)}
            <div style={{ padding: '3px 6px', fontSize: 10, color: 'var(--text-secondary)', textAlign: 'center' }}>封面 · 不可隐藏</div>
          </div>
          {fixedKeys.map(key => {
            const hidden = hiddenFixed.includes(key)
            return (
              <div key={key} style={cardStyle(hidden)}>
                {hidden && badge}
                {fixedDocs[key]
                  ? <Thumb doc={fixedDocs[key]} pageW={pageW} pageH={pageH} thumbW={thumbW} />
                  : fixedFallback(key === 'toc' ? '📋' : key === 'flyleaf' ? '📃' : '📄', FIXED_LABEL[key] || key)}
                <div style={{ padding: '3px 4px', display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{FIXED_LABEL[key] || key}</span>
                  {eyeBtn(hidden, () => toggleFixed(key), hidden ? '恢复显示该固定页' : '隐藏该固定页（不进合成产物）')}
                </div>
              </div>
            )
          })}
        </div>

        {/* 章节页 */}
        {(pageMap || []).map((pm, chIdx) => {
          const ch = draftChapterById(pm.chapter_id)
          const isProse = pm.kind === 'prose'
          const splitDocs = isProse ? proseDocs[pm.chapter_id] : undefined
          const proseMulti = isProse && !!splitDocs && splitDocs.length > 1
          const count = proseMulti ? splitDocs!.length : pm.page_count
          const order = proseMulti ? validOrder(ch?.prose_page_order, count) : pageOrderOf(ch, count)
          const hiddenSet = proseMulti ? new Set(ch?.prose_hidden_pages || []) : new Set(ch?.hidden_pages || [])
          const chapterHidden = isProse && (ch?.hidden_pages || []).includes(0)
          const singlePage = !proseMulti && (pm.kind !== 'embed' || count <= 1)
          return (
            <div key={pm.chapter_id} style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{String(chIdx + 1).padStart(2, '0')} · {pm.title}</span>
                <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-secondary)' }}>
                  {isProse
                    ? `正文章节（${proseMulti ? count : 1} 页）`
                    : pm.kind === 'fulldoc' ? '页面章节（1 页）' : `${count} 页`}
                  {singlePage && '，隐藏后整章不进合成'}
                </span>
                {proseMulti && eyeBtn(chapterHidden, () => togglePage(pm.chapter_id, 0),
                  chapterHidden ? '恢复显示整章' : '隐藏整章（所有页不进合成产物）')}
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {/* ppt 章节标题片 */}
                {!isA4 && (
                  <div style={cardStyle(!!ch?.hide_divider)}>
                    {ch?.hide_divider && badge}
                    <Thumb
                      doc={chapterDividerDoc(chIdx + 1, pm.title, ch?.project_name || '自建章节', theme)}
                      pageW={pageW} pageH={pageH} thumbW={thumbW}
                    />
                    <div style={{ padding: '3px 4px', display: 'flex', justifyContent: 'center' }}>
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginRight: 2 }}>章节标题页</span>
                      {eyeBtn(!!ch?.hide_divider, () => toggleDivider(pm.chapter_id), ch?.hide_divider ? '恢复显示章节标题页' : '隐藏章节标题页')}
                    </div>
                  </div>
                )}
                {count === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: 10 }}>（该章节无可用页面）</div>
                )}
                {order.map((pageIdx, pos) => {
                  const hidden = hiddenSet.has(pageIdx)
                  return (
                    <div key={pageIdx} style={cardStyle(hidden || chapterHidden)}>
                      {(hidden || (chapterHidden && !proseMulti)) && badge}
                      {isProse ? (
                        splitDocs && splitDocs.length > 0 ? (
                          <Thumb doc={splitDocs[pageIdx] || ''} pageW={pageW} pageH={pageH} thumbW={thumbW} />
                        ) : (
                          <div style={{ width: thumbW, height: thumbH, overflow: 'hidden', background: '#fff' }}>
                            <div style={{ width: pageW, transform: `scale(${thumbW / pageW})`, transformOrigin: 'top left', pointerEvents: 'none' }}>
                              <ProsePreview html={ch?.content_html || mdToHtml(ch?.content || '')} theme={theme}
                                bgColor={ch?.bg_color} style={{ minHeight: pageH }} />
                            </div>
                          </div>
                        )
                      ) : (
                        <Thumb doc={(pm.docs || [])[pageIdx] || ''} pageW={pageW} pageH={pageH} thumbW={thumbW} />
                      )}
                      <div style={{ padding: '3px 4px', display: 'flex', alignItems: 'center', gap: 2, justifyContent: 'center' }}>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginRight: 2 }}>第{pos + 1}页</span>
                        {proseMulti ? (
                          <>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 5px' }} disabled={pos === 0}
                              title="向前移动" onClick={() => moveProsePage(pm.chapter_id, count, pos, -1)}>◀</button>
                            <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 5px' }} disabled={pos === order.length - 1}
                              title="向后移动" onClick={() => moveProsePage(pm.chapter_id, count, pos, 1)}>▶</button>
                            {eyeBtn(hidden, () => toggleProsePage(pm.chapter_id, pageIdx), hidden ? '恢复显示该页' : '隐藏该页（不进合成产物）')}
                          </>
                        ) : (
                          <>
                            {!singlePage && (
                              <>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 5px' }} disabled={pos === 0}
                                  title="向前移动" onClick={() => movePage(pm.chapter_id, count, pos, -1)}>◀</button>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 5px' }} disabled={pos === order.length - 1}
                                  title="向后移动" onClick={() => movePage(pm.chapter_id, count, pos, 1)}>▶</button>
                              </>
                            )}
                            {eyeBtn(hidden, () => togglePage(pm.chapter_id, pageIdx), hidden ? '恢复显示该页' : '隐藏该页（不进合成产物）')}
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {(pageMap || []).length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 20, textAlign: 'center' }}>
            还没有启用的章节 — 请先在第①步选择内容。
          </div>
        )}
      </div>
    </div>
  )
}
