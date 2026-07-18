import { useState, useRef, useEffect, useMemo } from 'react'
import DOMPurify from 'dompurify'
import { api } from '../../services/api'
import { useModal } from '../../components/ModalProvider'
import { BookletDraft, Theme, mdToHtml, isProseChapter, resolveDraftTheme } from '../types'
import { themeVars } from '../proseSplit'
import { applyEditableDoc, clearEditableDoc } from '../../utils/editableDoc'
import MdToolbar from './MdToolbar'

interface Props {
  draft: BookletDraft
  onChange: (updater: (d: BookletDraft) => BookletDraft) => void
}

const PROSE_CSS = `
.bkp-prose { font-size: 13px; line-height: 1.95; }
.bkp-prose h1, .bkp-prose h2, .bkp-prose h3, .bkp-prose h4 { color: var(--ink); margin: 14px 0 7px; line-height: 1.5; }
.bkp-prose h1 { font-size: 19px; } .bkp-prose h2 { font-size: 17px; } .bkp-prose h3 { font-size: 15px; } .bkp-prose h4 { font-size: 14px; }
.bkp-prose p { margin: 6px 0; }
.bkp-prose ul, .bkp-prose ol { margin: 6px 0 6px 18px; }
.bkp-prose li { margin: 3px 0; }
.bkp-prose table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 12px; }
.bkp-prose th, .bkp-prose td { border: 1px solid var(--text); padding: 4px 7px; }
.bkp-prose th { background: var(--card-bg); color: var(--ink); }
.bkp-prose blockquote { border-left: 3px solid var(--accent); background: var(--card-bg); padding: 6px 10px; margin: 8px 0; }
.bkp-prose code { background: var(--card-bg); padding: 1px 4px; border-radius: 2px; font-size: 12px; }
.bkp-prose pre { background: var(--card-bg); padding: 8px; overflow-x: auto; margin: 8px 0; }
.bkp-prose img { max-width: 100%; }
.bkp-prose hr { border: none; border-top: 1px solid var(--text); opacity: 0.25; margin: 12px 0; }
`

export default function StepArrange({ draft, onChange }: Props) {
  const { confirm, prompt, toast } = useModal()
  const [selectedId, setSelectedId] = useState('')
  const [refreshingId, setRefreshingId] = useState('')
  const [themes, setThemes] = useState<Theme[]>([])

  const [editorMode, setEditorMode] = useState<'view' | 'edit' | 'source'>('view')
  const [htmlDirty, setHtmlDirty] = useState(false)
  const [textColor, setTextColor] = useState('#ffffff')
  const [iframeKey, setIframeKey] = useState(0)

  const [fitScale, setFitScale] = useState(1)
  const [iframeNatH, setIframeNatH] = useState(300)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const sourceTaRef = useRef<HTMLTextAreaElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const previewBoxRef = useRef<HTMLDivElement>(null)

  const selected = draft.chapters.find(c => c.id === selectedId) || null
  const theme = useMemo(
    () => resolveDraftTheme(draft, themes),
    [themes, draft.cover.theme_id, draft.cover.theme_colors],
  )
  const isProse = selected ? isProseChapter(selected) : false

  useEffect(() => {
    api.bookletThemes()
      .then(list => { if (list != null) setThemes(list) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedId && draft.chapters.length > 0) setSelectedId(draft.chapters[0].id)
  }, [draft.chapters.length])

  useEffect(() => {
    setEditorMode('view')
    setHtmlDirty(false)
    setIframeNatH(300)
    setIframeKey(k => k + 1)
  }, [selectedId])

  /* prose：iframe 高度=内容自然高（body.scrollHeight 不受视口钳制，宽度变化后重测不棘轮）
     非 prose：按预览框宽度整体缩放 1280 宽的 HTML 页面 */
  const measureProseHeight = () => {
    const doc = iframeRef.current?.contentDocument
    const h = doc?.body?.scrollHeight
    if (h && h > 0) setIframeNatH(h)
  }

  useEffect(() => {
    const el = previewBoxRef.current
    if (!el) { setFitScale(1); return }
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width
      if (!w || w <= 0) return
      if (isProse) {
        requestAnimationFrame(measureProseHeight)
      } else {
        setFitScale(Math.min(1, (w - 4) / 1280))
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isProse, iframeKey])

  // Content HTML for the iframe — memoized to prevent spurious reloads
  const displayHtml = useMemo(() => {
    if (!selected) return ''
    if (isProse) {
      const vars = themeVars(theme)
      const varCss = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')
      const bg = selected.bg_color || 'var(--background)'
      return DOMPurify.sanitize(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  :root { ${varCss}; }
  body { margin:0; padding:14px 18px; font-family:var(--font); background:${bg}; color:var(--text); }
${PROSE_CSS}
</style></head>
<body><div class="bkp-prose">${mdToHtml(selected.content)}</div></body></html>`, { WHOLE_DOCUMENT: true })
    }
    const html = selected.content_html || selected.content || ''
    return DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true })
  }, [selected, isProse, theme])

  const move = (idx: number, dir: -1 | 1) => {
    onChange(d => {
      const arr = [...d.chapters]
      const j = idx + dir
      if (j < 0 || j >= arr.length) return d
      ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
      return { ...d, chapters: arr }
    })
  }

  const handleRename = async (id: string, current: string) => {
    const name = await prompt('章节重命名', current)
    if (name == null || !name.trim()) return
    onChange(d => ({ ...d, chapters: d.chapters.map(c => c.id === id ? { ...c, title: name.trim() } : c) }))
  }

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm(`确定从册子中移除「${title}」？（不影响原明细内容）`)
    if (!ok) return
    onChange(d => ({ ...d, chapters: d.chapters.filter(c => c.id !== id) }))
    if (selectedId === id) setSelectedId('')
  }

  const handleRefresh = async (id: string) => {
    const ch = draft.chapters.find(c => c.id === id)
    if (!ch || ch.source_type === 'custom') return
    const ok = await confirm(`从源刷新会用「${ch.project_name}」的最新内容覆盖本章当前内容（包括你的编辑），确定？`)
    if (!ok) return
    setRefreshingId(id)
    try {
      const r = await api.bookletContentItem(ch.project_id, ch.source_type, ch.source_key)
      if (r != null && r.content != null) {
        const isMd = r.content_format === 'md'
        onChange(d => ({
          ...d,
          chapters: d.chapters.map(c => c.id === id
            ? { ...c, content: r.content, content_html: isMd ? mdToHtml(r.content) : r.content, content_format: isMd ? 'md' as const : 'html' as const }
            : c),
        }))
        toast('已从源刷新', 'success')
      }
    } catch (e: any) {
      toast(`刷新失败: ${e?.message || e}`, 'error')
    } finally {
      setRefreshingId('')
    }
  }

  const setChapterBg = (id: string, bg: string) => {
    onChange(d => ({ ...d, chapters: d.chapters.map(c => c.id === id ? { ...c, bg_color: bg } : c) }))
    setIframeKey(k => k + 1)
  }

  // ── Unified editor handlers ──

  const saveIframeSelection = () => {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return
    const win = iframe.contentWindow
    if (!win) return
    const sel = win.getSelection()
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  const restoreIframeSelection = (): Range | null => {
    const range = savedRangeRef.current
    if (!range) return null
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return null
    const win = iframe.contentWindow
    if (!win) return null
    const sel = win.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(range)
    }
    return range
  }

  const execCmd = (command: string, value?: string) => {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return
    iframe.contentWindow?.focus()
    try { iframe.contentDocument.execCommand(command, false, value) } catch {}
  }

  const applyContentEditable = (enable: boolean) => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    if (enable) applyEditableDoc(doc)
    else clearEditableDoc(doc)
  }

  const extractIframeHtml = (): string | null => {
    const doc = iframeRef.current?.contentDocument
    if (!doc || !selected) return null
    // 存前剥离编辑态属性与注入样式，避免写进章节 HTML
    clearEditableDoc(doc)
    return '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
  }

  const toggleEdit = () => {
    if (editorMode === 'edit') {
      // Finish editing: extract HTML, update draft
      const html = extractIframeHtml()
      if (html) {
        onChange(d => ({
          ...d,
          chapters: d.chapters.map(c => {
            if (c.id !== selected!.id) return c
            const upd: any = { ...c, content_html: html }
            if (!isProseChapter(c)) upd.content = html
            return upd
          }),
        }))
        setHtmlDirty(true)
      }
      applyContentEditable(false)
      setEditorMode('view')
    } else {
      setEditorMode('edit')
      applyContentEditable(true)
    }
  }

  const toggleSource = () => {
    if (editorMode === 'source') {
      setEditorMode('view')
      setIframeKey(k => k + 1)
    } else {
      if (editorMode === 'edit') {
        const html = extractIframeHtml()
        if (html) {
          onChange(d => ({
            ...d,
            chapters: d.chapters.map(c => {
              if (c.id !== selected!.id) return c
              const upd: any = { ...c, content_html: html }
              if (!isProseChapter(c)) upd.content = html
              return upd
            }),
          }))
          setHtmlDirty(true)
        }
        applyContentEditable(false)
      }
      setEditorMode('source')
    }
  }

  const handleSourceChange = (text: string) => {
    if (!selected) return
    onChange(d => ({
      ...d,
      chapters: d.chapters.map(c => c.id === selected.id
        ? { ...c, content: text, content_html: mdToHtml(text) }
        : c),
    }))
  }

  const handleSave = () => {
    if (!selected) return
    if (editorMode === 'edit') {
      const html = extractIframeHtml()
      if (html) {
        onChange(d => ({
          ...d,
          chapters: d.chapters.map(c => {
            if (c.id !== selected.id) return c
            const upd: any = { ...c, content_html: html }
            if (!isProseChapter(c)) upd.content = html
            return upd
          }),
        }))
      }
      applyContentEditable(false)
      setEditorMode('view')
    }
    setHtmlDirty(false)
    toast('修改已存入本章（原明细不变）', 'success')
  }

  const applyColorToSelection = (type: 'foreground' | 'background', color: string) => {
    const range = restoreIframeSelection()
    if (!range || range.collapsed) {
      const iframe = iframeRef.current
      if (iframe?.contentDocument) {
        iframe.contentWindow?.focus()
        try {
          iframe.contentDocument.execCommand(
            type === 'foreground' ? 'foreColor' : 'backColor', false, color
          )
        } catch {}
      }
      return
    }
    const styleProp = type === 'foreground' ? 'color' : 'background-color'
    const span = document.createElement('span')
    span.style.setProperty(styleProp, color)
    try {
      range.surroundContents(span)
    } catch {
      const fragment = range.extractContents()
      span.appendChild(fragment)
      range.insertNode(span)
    }
    savedRangeRef.current = null
  }

  return (
    <div className="panel-grid">
      <div className="panel-left" style={{ overflow: 'hidden' }}>
        <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card-title" style={{ flexShrink: 0 }}>🗂 章节顺序</div>
          <div className="card-hint" style={{ flexShrink: 0 }}>点击章节在右侧编辑；停用的章节保留在草稿中但不进产物。</div>
          <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
            {draft.chapters.length === 0 && (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 16, textAlign: 'center' }}>
                还没有章节 — 回到第①步选择内容
              </div>
            )}
            {draft.chapters.map((c, i) => (
              <div key={c.id}
                onClick={() => setSelectedId(c.id)}
                style={{
                  padding: '6px 8px', borderRadius: 5, marginBottom: 4, cursor: 'pointer', fontSize: 12,
                  border: `1px solid ${selectedId === c.id ? 'var(--primary)' : 'var(--border)'}`,
                  background: selectedId === c.id ? 'var(--bg-hover)' : 'transparent',
                  opacity: c.enabled ? 1 : 0.5,
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={{ flex: 1, textDecoration: c.enabled ? 'none' : 'line-through' }}>{c.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {c.source_type === 'custom' ? (c.content_format === 'html' ? '自建·页面' : '自建') : c.source_type === 'step_md' ? '文档' : '课件'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }} title="上移"
                    disabled={i === 0} onClick={e => { e.stopPropagation(); move(i, -1) }}>↑</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }} title="下移"
                    disabled={i === draft.chapters.length - 1} onClick={e => { e.stopPropagation(); move(i, 1) }}>↓</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
                    onClick={e => { e.stopPropagation(); handleRename(c.id, c.title) }}>重命名</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
                    onClick={e => {
                      e.stopPropagation()
                      onChange(d => ({ ...d, chapters: d.chapters.map(x => x.id === c.id ? { ...x, enabled: !x.enabled } : x) }))
                    }}>{c.enabled ? '停用' : '启用'}</button>
                  {c.source_type !== 'custom' && (
                    <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
                      disabled={refreshingId === c.id}
                      onClick={e => { e.stopPropagation(); handleRefresh(c.id) }}>
                      {refreshingId === c.id ? '⏳' : '⟳ 从源刷新'}
                    </button>
                  )}
                  <span style={{ flex: 1 }} />
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
                    onClick={e => { e.stopPropagation(); handleDelete(c.id, c.title) }}>🗑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Unified editor: right panel ── */}
      <div className="panel-right" style={{ overflow: 'hidden' }}>
        {!selected ? (
          <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 13 }}>
            左侧选择一个章节进行编辑
          </div>
        ) : (
          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Toolbar */}
            <div className="card-title" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
              <span>✏️ 编辑「{selected.title}」</span>
              <span style={{ fontWeight: 400, fontSize: 10, color: 'var(--text-secondary)' }}>
                （编辑册子里的副本，不影响原明细）
              </span>
              <span style={{ flex: 1 }} />

              {htmlDirty && (
                <span style={{ fontSize: 10, color: 'var(--warning, #d97706)', marginRight: 4 }}>有未保存的修改</span>
              )}

              {/* WYSIWYG toggle — only for non-prose (HTML) chapters */}
              {!isProse && (
                <button
                  onClick={toggleEdit}
                  className="btn btn-ghost btn-sm"
                  style={{
                    fontSize: 11,
                    background: editorMode === 'edit' ? 'var(--primary)' : undefined,
                    color: editorMode === 'edit' ? '#fff' : undefined,
                  }}
                >
                  {editorMode === 'edit' ? '完成编辑' : '编辑文字'}
                </button>
              )}

              {/* Source toggle */}
              <button
                onClick={toggleSource}
                className="btn btn-ghost btn-sm"
                style={{
                  fontSize: 11,
                  background: editorMode === 'source' ? 'var(--primary)' : undefined,
                  color: editorMode === 'source' ? '#fff' : undefined,
                }}
              >
                {editorMode === 'source' ? '预览' : '源码'}
              </button>

              {/* Save */}
              <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={handleSave}>
                💾 保存修改
              </button>
            </div>

            {/* Formatting toolbar — visible only in edit mode */}
            {editorMode === 'edit' && (
              <div style={{
                display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0,
                padding: '4px 8px', marginBottom: 8,
                background: 'var(--bg-secondary, #f1f5f9)', borderRadius: 6,
              }}>
                <button onClick={() => execCmd('bold')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, fontWeight: 700, minWidth: 28 }} title="加粗">B</button>
                <button onClick={() => execCmd('italic')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, fontStyle: 'italic', minWidth: 28 }} title="斜体">I</button>
                <button onClick={() => execCmd('underline')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, textDecoration: 'underline', minWidth: 28 }} title="下划线">U</button>
                <button onClick={() => execCmd('strikeThrough')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, textDecoration: 'line-through', minWidth: 28 }} title="删除线">S</button>
                <span style={{ width: 1, height: 16, background: 'var(--border, #e2e8f0)', margin: '0 2px' }} />
                <button onClick={() => execCmd('undo')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, minWidth: 28 }} title="撤销">↶</button>
                <button onClick={() => execCmd('redo')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, minWidth: 28 }} title="重做">↷</button>
                <span style={{ width: 1, height: 16, background: 'var(--border, #e2e8f0)', margin: '0 2px' }} />
                <button onClick={() => execCmd('decreaseFontSize')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12, minWidth: 22 }} title="缩小字号">A-</button>
                <button onClick={() => execCmd('increaseFontSize')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12, minWidth: 22 }} title="增大字号">A+</button>
                <span style={{ width: 1, height: 16, background: 'var(--border, #e2e8f0)', margin: '0 2px' }} />
                {/* Text color */}
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <input type="color" value={textColor}
                    onPointerDown={(e) => { e.preventDefault(); saveIframeSelection() }}
                    onChange={e => { setTextColor(e.target.value); applyColorToSelection('foreground', e.target.value) }}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                    title="字体颜色" />
                  <span className="btn btn-ghost btn-sm" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3, pointerEvents: 'none' }}>
                    <span style={{
                      display: 'inline-block', width: 13, height: 13, borderRadius: 2,
                      background: textColor, border: '1px solid rgba(0,0,0,0.15)',
                    }} />A</span>
                </div>
                {/* Background color */}
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <input type="color" value="#ffff00"
                    onPointerDown={(e) => { e.preventDefault(); saveIframeSelection() }}
                    onChange={e => applyColorToSelection('background', e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                    title="背景色" />
                  <span className="btn btn-ghost btn-sm" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3, pointerEvents: 'none' }}>
                    <span style={{
                      display: 'inline-block', width: 13, height: 13, borderRadius: 2,
                      background: '#ffff00', border: '1px solid rgba(0,0,0,0.15)',
                    }} />A</span>
                </div>
              </div>
            )}

            {/* MD toolbar — visible only in source mode for prose chapters */}
            {editorMode === 'source' && isProse && (
              <MdToolbar textareaRef={sourceTaRef} value={selected.content}
                onChange={handleSourceChange} />
            )}

            {/* Page background color — always visible for prose chapters */}
            {isProse && (
              <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <label style={{ fontWeight: 400, fontSize: 10, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                  页面底色
                  <input type="color" value={selected.bg_color || '#ffffff'}
                    style={{ width: 22, height: 18, padding: 0, border: '1px solid var(--border)', cursor: 'pointer' }}
                    onChange={e => setChapterBg(selected.id, e.target.value)} />
                </label>
                {selected.bg_color && (
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
                    onClick={() => setChapterBg(selected.id, '')}>还原默认底色</button>
                )}
              </div>
            )}

            {/* Content area */}
            {editorMode === 'source' ? (
              <textarea ref={sourceTaRef} className="form-input" value={selected.content}
                onChange={e => handleSourceChange(e.target.value)}
                style={{ flex: 1, minHeight: 120, resize: 'none', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7 }} />
            ) : (
              <div ref={previewBoxRef} style={{ flex: 1, minHeight: 0, overflowX: 'hidden', overflowY: 'auto' }}>
                <iframe
                  ref={iframeRef}
                  key={iframeKey}
                  srcDoc={displayHtml}
                  title="chapter-preview"
                  scrolling="no"
                  onLoad={() => {
                    if (editorMode === 'edit') applyContentEditable(true)
                    const doc = iframeRef.current?.contentDocument
                    if (!doc) return
                    const h = isProse ? doc.body?.scrollHeight : doc.documentElement.scrollHeight
                    if (h && h > 0) setIframeNatH(h)
                  }}
                  style={{
                    width: isProse ? '100%' : 1280,
                    height: isProse ? iframeNatH : undefined,
                    minHeight: isProse ? 300 : iframeNatH * fitScale,
                    transform: isProse ? undefined : `scale(${fitScale})`,
                    transformOrigin: 'top left',
                    marginBottom: isProse ? undefined : -(1 - fitScale) * iframeNatH,
                    border: '1px solid var(--border)',
                    borderRadius: 5,
                    background: '#fff',
                    display: 'block',
                  }}
                />
              </div>
            )}

            <div className="card-hint" style={{ marginTop: 6, marginBottom: 0, flexShrink: 0 }}>
              {isProse
                ? '默认显示排版预览；点击「源码」可编辑 Markdown 原文，点击「💾 保存修改」存入草稿。'
                : `点击「编辑文字」可对页面内文字进行修改；点击「源码」可编辑原始 HTML。改动只存入本册子的副本${selected.source_type !== 'custom' ? '，「⟳ 从源刷新」可还原为明细最新内容' : ''}。`
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
