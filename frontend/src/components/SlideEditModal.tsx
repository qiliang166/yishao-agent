import { useState, useRef, useEffect } from 'react'
import { api } from '../services/api'
import { useModal } from './ModalProvider'

interface Props {
  open: boolean
  runId: string
  previewUrl: string
  slideCount: number
  providerId?: string
  model?: string
  projectId?: string
  projectName?: string
  columnId?: string
  styleId?: string
  onClose: () => void
  pptxDownloadUrl?: string
  pptxFilename?: string
  downloadFormat?: string
  onDownloadHtml?: () => void
}

export default function SlideEditModal({ open, runId, previewUrl, slideCount, providerId: _pid, model: _model, projectId, projectName, columnId, styleId, onClose, pptxDownloadUrl, pptxFilename, downloadFormat, onDownloadHtml: _onDownloadHtml }: Props) {
  const [contentEditable, setContentEditable] = useState(false)
  const [textColor, setTextColor] = useState('#ffffff')
  const [savingImages, setSavingImages] = useState(false)
  const [colorScheme, setColorScheme] = useState('deep-blue')
  const [colorSchemes, setColorSchemes] = useState<{id:string;label:string;primary:string;accent:string;background:string;text:string;card_bg:string}[]>([])
  const [recoloring, setRecoloring] = useState(false)
  const [iframeKey, setIframeKey] = useState(0)
  const [activeTab, setActiveTab] = useState<'preview' | 'source' | 'regenerate'>('preview')
  const [sourceCode, setSourceCode] = useState('')
  const [sourceLoading, setSourceLoading] = useState(false)
  const [sourceSaving, setSourceSaving] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findIdx, setFindIdx] = useState(0)
  const [findMatches, setFindMatches] = useState<number[]>([])
  // Regeneration state
  const [pageInput, setPageInput] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [regenerateLog, setRegenerateLog] = useState('')
  const [newPageUrl, setNewPageUrl] = useState('')
  const [newPagePartialUrl, setNewPagePartialUrl] = useState('')
  const [regeneratedSlides, setRegeneratedSlides] = useState<{seq:number;html:string}[]>([])
  const sourceOriginRef = useRef('')
  const sourceTextareaRef = useRef<HTMLTextAreaElement>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const newpageIframeRef = useRef<HTMLIFrameElement>(null)

  const modal = useModal()

  useEffect(() => {
    if (open) {
      setIframeKey(0)
      setActiveTab('preview')
      setSourceCode('')
      setRegenerating(false)
      setRegenerateLog('')
      setRecoloring(false)
      api.listColorSchemes(styleId || 'business').then(cs => { if (cs?.length) { setColorSchemes(cs); setColorScheme(cs[0].id) } }).catch(() => {})
      setContentEditable(false)
      // Restore persisted regenerate-tab state so it survives modal close/reopen
      if (runId) {
        api.getRegenerateState(runId).then(r => {
          if (r?.state) {
            setPageInput(r.state.page_input || '')
            setNewPageUrl(r.state.new_page_url || '')
            setNewPagePartialUrl(r.state.new_page_partial_url || '')
            setRegeneratedSlides(r.state.regenerated_slides || [])
          }
        }).catch(() => {})
      }
    }
  }, [open])

  // Re-inject contentEditable when iframe reloads while edit mode is on
  useEffect(() => {
    if (!contentEditable) return
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return
    const doc = iframe.contentDocument
    doc.body.setAttribute('contenteditable', 'true')
    doc.body.style.cursor = 'text'
  }, [iframeKey, contentEditable])

  const refreshPreview = () => setIframeKey(k => k + 1)

  const handleRecolor = async (schemeId: string) => {
    setColorScheme(schemeId)
    setRecoloring(true)
    try {
      const result = await api.recolorSlide({
        run_id: runId,
        slide_seq: 1,
        style: styleId || 'business',
        color_scheme: schemeId,
      })
      if (result != null && result.ok && result.changed) {
        refreshPreview()
      }
    } catch (e: any) {
      modal.toast(`换色失败: ${e?.message || e}`, 'error')
    } finally {
      setRecoloring(false)
    }
  }

  const handleToggleEdit = () => {
    if (contentEditable) {
      const iframe = iframeRef.current
      if (iframe?.contentDocument) {
        const doc = iframe.contentDocument
        doc.body.removeAttribute('contenteditable')
        doc.body.style.cursor = ''
        const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
        api.editSlideSource(runId, html).then(r => {
          if (r.ok) {
            refreshPreview()
          }
        }).catch(() => {})
      }
      setContentEditable(false)
    } else {
      setContentEditable(true)
      const iframe = iframeRef.current
      if (iframe?.contentDocument) {
        const doc = iframe.contentDocument
        doc.body.setAttribute('contenteditable', 'true')
        doc.body.style.cursor = 'text'
      }
    }
  }

  const execCmd = (command: string, value?: string) => {
    const iframe = iframeRef.current
    if (!iframe?.contentDocument) return
    iframe.contentWindow?.focus()
    try {
      iframe.contentDocument.execCommand(command, false, value)
    } catch {
      // silently ignore
    }
  }

  const handleColorChange = (color: string) => {
    setTextColor(color)
    execCmd('foreColor', color)
  }

  const handleRestore = async () => {
    const ok = await modal.confirm('恢复为AI生成的原始版本，所有编辑将丢失。是否确认？')
    if (!ok) return
    try {
      const result = await api.restoreFromBackup(runId)
      if (result.ok) {
        refreshPreview()
        modal.toast('已从备份恢复', 'success')
      }
    } catch (e: any) {
      modal.toast(`恢复失败: ${e?.message || e}`, 'error')
    }
  }

  const handleSaveImages = async () => {
    if (savingImages) return
    setSavingImages(true)
    try {
      const result = await api.saveSlideImages(runId)
      if (result?.ok) {
        const saved = result.saved || 0
        const dir = result.dir || ''
        const ok = await modal.confirm(`已保存 ${saved} 张图片到:\n${dir}\n\n是否打开文件夹？`)
        if (ok && dir) {
          try { await api.openFolder(dir) } catch (_) { /* ignore */ }
        }
      } else {
        modal.toast('保存图片失败，请重试', 'error')
      }
    } catch (e: any) {
      modal.toast(`保存图片失败: ${e?.message || e}`, 'error')
    } finally {
      setSavingImages(false)
    }
  }

  const handleSaveZip = async () => {
    if (!pptxDownloadUrl) {
      modal.toast('缺少下载链接', 'error')
      return
    }
    try {
      const token = localStorage.getItem('auth_token')
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const resp = await fetch(pptxDownloadUrl + '?_t=' + Date.now(), { headers })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = (pptxFilename || 'slides') + '.zip'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      modal.toast('已开始下载: ' + ((pptxFilename || 'slides') + '.zip'), 'success')
    } catch (e: any) {
      modal.toast(`下载失败: ${e?.message || e}`, 'error')
    }
  }

  const handleSaveHtml = async () => {
    try {
      const token = localStorage.getItem('auth_token')
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const resp = await fetch(previewUrl + '?_t=' + Date.now(), { headers })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      let html = await resp.text()
      html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = (pptxFilename || 'slides').replace(/\.pptx$/i, '') + '.html'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      modal.toast('已开始下载: ' + ((pptxFilename || 'slides').replace(/\.pptx$/i, '') + '.html'), 'success')
    } catch (e: any) {
      modal.toast(`下载失败: ${e?.message || e}`, 'error')
    }
  }

  const parsePages = (raw: string): number[] => {
    const seen = new Set<number>()
    for (const part of raw.split(/[,;，；]/)) {
      const n = parseInt(part.trim(), 10)
      if (!isNaN(n) && n >= 1 && n <= slideCount && !seen.has(n)) {
        seen.add(n)
      }
    }
    return Array.from(seen).sort((a, b) => a - b)
  }

  const handleRegenerate = async () => {
    const seqs = parsePages(pageInput)
    if (regenerating || seqs.length === 0) return
    setRegenerating(true)
    setRegenerateLog('')
    setNewPageUrl('')
    setNewPagePartialUrl('')
    setRegeneratedSlides([])

    // Poll progress log every 10 seconds
    const pollTimer = setInterval(async () => {
      try {
        const r = await api.getRegenerateLog(runId)
        if (r.log) setRegenerateLog(r.log)
      } catch (_) { /* log not available yet */ }
    }, 10000)

    try {
      const result = await api.regenerateSlide({
        run_id: runId,
        slide_seqs: seqs,
        column_id: columnId,
      })
      clearInterval(pollTimer)
      // Final log fetch
      try {
        const r = await api.getRegenerateLog(runId)
        if (r.log) setRegenerateLog(r.log)
      } catch (_) { /* ignore */ }
      if (result != null && result.ok && result.preview_url) {
        setNewPageUrl(result.preview_url + '?_t=' + Date.now())
        setNewPagePartialUrl((result.partial_url || result.preview_url) + '?_t=' + Date.now())
        // Per-slide data for targeted splice — prefer backend-provided slides,
        // fallback to extracting from full HTML by data-seq
        let slides = result.slides || []
        if (slides.length === 0 && result.html && result.slide_seqs) {
          const parser = new DOMParser()
          const doc = parser.parseFromString(result.html, 'text/html')
          slides = result.slide_seqs.map(seq => {
            const sec = doc.querySelector(`section[data-seq="${seq}"]`)
            return { seq, html: sec ? sec.outerHTML : '' }
          }).filter(s => s.html)
        }
        setRegeneratedSlides(slides)
        setActiveTab('regenerate')
        // Persist regenerate state so it survives modal close/reopen
        api.saveRegenerateState(runId, {
          page_input: pageInput,
          new_page_url: result.preview_url + '?_t=' + Date.now(),
          new_page_partial_url: (result.partial_url || result.preview_url) + '?_t=' + Date.now(),
          regenerated_slides: slides,
        }).catch(() => {})
      }
    } catch (e: any) {
      clearInterval(pollTimer)
      modal.toast(`重新生成失败: ${e?.message || e}`, 'error')
    } finally {
      setRegenerating(false)
    }
  }

  const handleApplyNewPage = async () => {
    if (regeneratedSlides.length === 0) {
      modal.toast('没有可应用的再生结果', 'error')
      return
    }
    try {
      const seqs = regeneratedSlides.map(s => s.seq).join(', ')
      const result = await api.spliceSlides(runId, regeneratedSlides)
      if (result.ok && result.replaced > 0) {
        setActiveTab('preview')
        setIframeKey(k => k + 1)
        // Re-save regenerate state so it survives after apply
        api.saveRegenerateState(runId, {
          page_input: pageInput,
          new_page_url: newPageUrl,
          new_page_partial_url: newPagePartialUrl,
          regenerated_slides: regeneratedSlides,
        }).catch(() => {})
        modal.toast(`已替换第 ${seqs} 页，其他页未受影响`, 'success')
      } else {
        modal.toast('应用失败', 'error')
      }
    } catch (e: any) {
      modal.toast(`应用失败: ${e?.message || e}`, 'error')
    }
  }

  const handleDiscardNewPage = () => {
    setNewPageUrl('')
    setNewPagePartialUrl('')
    setRegeneratedSlides([])
    setPageInput('')
    setActiveTab('preview')
    // Clear persisted state on discard
    api.clearRegenerateState(runId).catch(() => {})
  }

  const fetchSource = async () => {
    setSourceLoading(true)
    try {
      const url = previewUrl + '?_t=' + Date.now()
      const token = localStorage.getItem('auth_token')
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
      const resp = await fetch(url, { headers })
      const html = await resp.text()
      setSourceCode(html)
      sourceOriginRef.current = html
    } catch (e: any) {
      setSourceCode('<!-- 加载失败: ' + (e.message || e) + ' -->')
    } finally {
      setSourceLoading(false)
    }
  }

  const handleTabSwitch = async (tab: 'preview' | 'source' | 'regenerate') => {
    if (tab === 'preview' && activeTab === 'source' && sourceCode.trim() && sourceCode !== sourceOriginRef.current) {
      await handleApplySource()
      return
    }
    setActiveTab(tab)
    if (tab === 'source') {
      fetchSource()
    }
  }

  const handleApplySource = async () => {
    if (sourceSaving || !sourceCode.trim()) return
    setSourceSaving(true)
    try {
      const result = await api.editSlideSource(runId, sourceCode)
      if (result.ok) {
        refreshPreview()
        setActiveTab('preview')
      }
    } catch (_) { /* ignore */ }
    finally {
      setSourceSaving(false)
    }
  }

  const doFind = (query: string, idx?: number) => {
    setFindQuery(query)
    if (!query.trim()) {
      setFindMatches([])
      setFindIdx(0)
      return
    }
    const lower = sourceCode.toLowerCase()
    const q = query.toLowerCase()
    const positions: number[] = []
    let p = 0
    while ((p = lower.indexOf(q, p)) !== -1) {
      positions.push(p)
      p += q.length
    }
    setFindMatches(positions)
    if (positions.length === 0) {
      setFindIdx(0)
      return
    }
    const next = Math.min(idx ?? 0, positions.length - 1)
    setFindIdx(next)
    if (idx !== undefined) {
      const ta = sourceTextareaRef.current
      if (ta) {
        const pos = positions[next]
        ta.focus()
        ta.setSelectionRange(pos, pos + query.length)
        const before = sourceCode.substring(0, pos)
        const line = before.split('\n').length - 1
        const lineH = parseFloat(getComputedStyle(ta).lineHeight) || 19.2
        ta.scrollTop = Math.max(0, line * lineH - ta.clientHeight * 0.35)
      }
    }
  }

  const findNext = () => {
    if (findMatches.length === 0) return
    const next = (findIdx + 1) % findMatches.length
    doFind(findQuery, next)
  }

  const findPrev = () => {
    if (findMatches.length === 0) return
    const prev = (findIdx - 1 + findMatches.length) % findMatches.length
    doFind(findQuery, prev)
  }

  if (!open) return null

  const tabs: ('preview' | 'source' | 'regenerate')[] = ['preview', 'regenerate', 'source']
  const tabLabels: Record<string, string> = { preview: '预览', source: '源码', regenerate: '重新生成' }

  return (
    <>
    <style>{`.src-editor::selection { background: rgba(212,149,106,0.5); }`}</style>
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.6)', zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        width: '95vw', height: '95vh',
        background: 'var(--bg, #fff)',
        borderRadius: 12,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 8px 48px rgba(0,0,0,0.3)',
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 20px', borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginRight: 12 }}>HTML 编辑</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {colorSchemes.length > 0 && colorSchemes.map(cs => (
              <button key={cs.id}
                onClick={() => handleRecolor(cs.id)}
                disabled={recoloring}
                title={cs.label}
                style={{
                  width: 18, height: 18, borderRadius: '50%',
                  background: cs.primary,
                  border: colorScheme === cs.id ? '2px solid var(--text)' : '2px solid var(--border)',
                  cursor: recoloring ? 'not-allowed' : 'pointer', padding: 0,
                  boxShadow: colorScheme === cs.id ? '0 0 0 2px ' + cs.accent : 'none',
                  opacity: recoloring ? 0.5 : 1,
                }}
              />
            ))}
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleToggleEdit}
              className="btn btn-ghost btn-sm"
              style={{
                fontSize: 12,
                background: contentEditable ? 'var(--primary)' : undefined,
                color: contentEditable ? '#fff' : undefined,
              }}
            >
              {contentEditable ? '完成编辑' : '编辑文字'}
            </button>
            {contentEditable && (
              <div style={{
                display: 'flex', gap: 2, alignItems: 'center',
                padding: '0 4px', background: 'var(--bg-secondary, #f1f5f9)',
                borderRadius: 6,
              }}>
                {/* Bold */}
                <button onClick={() => execCmd('bold')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, fontWeight: 700, minWidth: 28 }}
                  title="加粗">B</button>
                {/* Italic */}
                <button onClick={() => execCmd('italic')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, fontStyle: 'italic', minWidth: 28 }}
                  title="斜体">I</button>
                {/* Underline */}
                <button onClick={() => execCmd('underline')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, textDecoration: 'underline', minWidth: 28 }}
                  title="下划线">U</button>
                {/* Strikethrough */}
                <button onClick={() => execCmd('strikeThrough')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, textDecoration: 'line-through', minWidth: 28 }}
                  title="删除线">S</button>
                <span style={{ width: 1, height: 16, background: 'var(--border, #e2e8f0)', margin: '0 2px' }} />
                {/* Font size - */}
                <button onClick={() => execCmd('decreaseFontSize')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12, minWidth: 22 }}
                  title="缩小字号">A-</button>
                {/* Font size + */}
                <button onClick={() => execCmd('increaseFontSize')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12, minWidth: 22 }}
                  title="增大字号">A+</button>
                <span style={{ width: 1, height: 16, background: 'var(--border, #e2e8f0)', margin: '0 2px' }} />
                {/* Text color */}
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <input type="color" value={textColor}
                    onChange={e => handleColorChange(e.target.value)}
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
                    onChange={e => execCmd('backColor', e.target.value)}
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
            <button
              onClick={() => window.open(previewUrl + '?_t=' + Date.now(), '_blank')}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12 }}
            >
              预览
            </button>
            <button
              onClick={handleRestore}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12, color: '#dc2626' }}
            >
              恢复
            </button>
            <button
              onClick={handleSaveImages}
              disabled={savingImages}
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 12 }}
            >
              {savingImages ? '...' : '保存图片'}
            </button>
            {pptxDownloadUrl && (
              <button onClick={handleSaveZip} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
                {downloadFormat === 'svg' ? '⬇ SVG ZIP' : '⬇ PPTX'}
              </button>
            )}
            <button onClick={handleSaveHtml} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
              ⬇ HTML
            </button>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 6, border: 'none',
                background: 'var(--bg-secondary, #f1f5f9)', cursor: 'pointer',
                fontSize: 16, color: 'var(--text)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex', gap: 0, flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          padding: '0 20px',
        }}>
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => handleTabSwitch(tab)}
              style={{
                padding: '8px 16px', fontSize: 12, border: 'none',
                background: 'transparent', cursor: 'pointer',
                color: activeTab === tab ? 'var(--text)' : 'var(--text-muted)',
                borderBottom: activeTab === tab ? '2px solid var(--primary, #2563eb)' : '2px solid transparent',
                fontWeight: activeTab === tab ? 600 : 400,
              }}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {/* Preview / Source / Regenerate area */}
        <div style={{
          flex: '1 1 0', minHeight: 0, overflow: 'hidden',
          background: '#0f172a',
          borderBottom: '1px solid var(--border)',
        }}>
          {activeTab === 'preview' ? (
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={previewUrl + (previewUrl.includes('?') ? '&' : '?') + '_t=' + iframeKey}
              onLoad={() => {
                if (contentEditable && iframeRef.current?.contentDocument) {
                  const doc = iframeRef.current.contentDocument
                  doc.body.setAttribute('contenteditable', 'true')
                  doc.body.style.cursor = 'text'
                }
              }}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block',
              }}
              title="幻灯片预览"
            />
          ) : activeTab === 'source' ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Find bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px',
                background: '#0f172a', borderBottom: '1px solid #334155',
                flexShrink: 0,
              }}>
                <input
                  value={findQuery}
                  onChange={e => doFind(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); (e.shiftKey ? findPrev : findNext)() }
                    if (e.key === 'Escape') { setFindQuery(''); setFindMatches([]); setFindIdx(0) }
                  }}
                  placeholder="查找..."
                  style={{
                    width: 180, padding: '3px 8px', fontSize: 12,
                    background: '#1e293b', color: '#e2e8f0',
                    border: '1px solid #334155', borderRadius: 4,
                    outline: 'none',
                  }}
                />
                {findMatches.length > 0 && (
                  <span style={{ fontSize: 11, color: '#94a3b8', minWidth: 40, textAlign: 'center' }}>
                    {findIdx + 1}/{findMatches.length}
                  </span>
                )}
                <button
                  onClick={findPrev}
                  disabled={findMatches.length === 0}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px', opacity: findMatches.length ? 1 : 0.3 }}
                >▲</button>
                <button
                  onClick={findNext}
                  disabled={findMatches.length === 0}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px', opacity: findMatches.length ? 1 : 0.3 }}
                >▼</button>
              </div>
              {sourceLoading ? (
                <div style={{ color: '#94a3b8', fontSize: 12, padding: 16 }}>加载中...</div>
              ) : (
                <textarea
                  ref={sourceTextareaRef}
                  className="src-editor"
                  value={sourceCode}
                  onChange={e => setSourceCode(e.target.value)}
                  style={{
                    flex: 1, width: '100%', resize: 'none',
                    background: '#1e293b', color: '#e2e8f0',
                    border: 'none', padding: 16,
                    fontFamily: 'monospace', fontSize: 12,
                    lineHeight: 1.6, tabSize: 2,
                    outline: 'none',
                  }}
                  spellCheck={false}
                />
              )}
              <div style={{
                padding: '8px 16px', display: 'flex', gap: 8,
                background: '#1e293b', borderTop: '1px solid #334155',
                justifyContent: 'flex-end',
              }}>
                <button
                  onClick={() => { setActiveTab('preview'); setSourceCode('') }}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12 }}
                >
                  取消
                </button>
                <button
                  onClick={handleApplySource}
                  disabled={sourceSaving || !sourceCode.trim()}
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 12 }}
                >
                  {sourceSaving ? '...' : '应用修改'}
                </button>
              </div>
            </div>
          ) : (
            /* Regenerate tab */
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Input bar */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 16px',
                background: '#0f172a', borderBottom: '1px solid #334155',
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                  输入页码（如 3,5,8）
                </span>
                <input
                  value={pageInput}
                  onChange={e => setPageInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleRegenerate() }}
                  disabled={regenerating}
                  placeholder="3,5,8"
                  style={{
                    width: 120, padding: '4px 8px', fontSize: 12,
                    background: '#1e293b', color: '#e2e8f0',
                    border: '1px solid #334155', borderRadius: 4,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleRegenerate}
                  disabled={regenerating || !pageInput.trim()}
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 12, padding: '4px 12px' }}
                >
                  {regenerating ? '...' : '重新生成'}
                </button>
                {newPageUrl && (
                  <>
                    <div style={{ flex: 1 }} />
                    <button
                      onClick={handleDiscardNewPage}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 12 }}
                    >
                      放弃
                    </button>
                    <button
                      onClick={handleApplyNewPage}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: 12 }}
                    >
                      应用
                    </button>
                  </>
                )}
              </div>
              {/* Results (shown after regeneration) */}
              {newPageUrl ? (
                <iframe
                  ref={newpageIframeRef}
                  src={newPagePartialUrl || newPageUrl}
                  style={{
                    flex: 1, width: '100%',
                    border: 'none', display: 'block',
                  }}
                  title="重新生成预览"
                />
              ) : (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#64748b', fontSize: 13,
                  padding: 16,
                }}>
                  {regenerateLog ? (
                    <pre style={{
                      width: '100%', height: '100%',
                      margin: 0, padding: 16,
                      background: '#1e293b', color: '#94a3b8',
                      borderRadius: 6, overflow: 'auto',
                      fontFamily: 'monospace', fontSize: 12,
                      lineHeight: 1.8, whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                    }}>
                      {regenerateLog}
                    </pre>
                  ) : (
                    '输入页码并点击"重新生成"，日志将在此处显示'
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  )
}
