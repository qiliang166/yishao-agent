import { useState, useRef, useEffect } from 'react'
import { api } from '../services/api'
import { useModal } from './ModalProvider'
import { applyEditableDoc, clearEditableDoc } from '../utils/editableDoc'
import { usePermission } from '../hooks/usePermission'
import SvgIcon from './SvgIcon'

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

export default function SlideEditModal({ open, runId, previewUrl, slideCount, providerId, model, projectId, projectName, columnId, styleId, onClose, pptxDownloadUrl, pptxFilename, downloadFormat, onDownloadHtml: _onDownloadHtml }: Props) {
  const [contentEditable, setContentEditable] = useState(false)
  const [textColor, setTextColor] = useState('#ffffff')
  const [fontSize, setFontSize] = useState('')
  const [fontFamily, setFontFamily] = useState('')
  const [savingImages, setSavingImages] = useState(false)
  const [slideImageSize, setSlideImageSize] = useState('400')
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
  const savedRangeRef = useRef<Range | null>(null)
  const slideImgRef = useRef<HTMLInputElement>(null)

  const modal = useModal()
  // 与后端 PUT /api/ppt/slide-source 的 require_perm 同码：无权限则不显示编辑入口，
  // 会员也无法借编辑模式绕过产物防复制
  const canEditSlides = usePermission('stage3.generate')

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
    applyEditableDoc(iframe.contentDocument)
  }, [iframeKey, contentEditable])

  // Track the current selection's font size / family while editing
  useEffect(() => {
    if (!contentEditable) return
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const handler = () => readCurrentFont()
    doc.addEventListener('selectionchange', handler)
    return () => doc.removeEventListener('selectionchange', handler)
  }, [contentEditable, iframeKey])

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
        // 序列化前剥离编辑态（contenteditable/注入样式/事件拦停），避免写进保存的 HTML
        clearEditableDoc(doc)
        const html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML
        api.editSlideSource(runId, html).then(r => {
          if (r.ok) {
            refreshPreview()
          } else {
            modal.toast('保存失败，请重试', 'error')
          }
        }).catch((e: any) => {
          modal.toast(`保存失败: ${e?.message || e}`, 'error')
        })
      }
      setContentEditable(false)
    } else {
      setContentEditable(true)
      const iframe = iframeRef.current
      if (iframe?.contentDocument) {
        applyEditableDoc(iframe.contentDocument)
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

  const handleInsertImage = async (file: File) => {
    try {
      const res = await api.uploadSlideImage(runId, file)
      if (res == null || !res.path) {
        modal.toast('上传失败：未返回图片地址', 'error')
        return
      }
      const iframe = iframeRef.current
      const doc = iframe?.contentDocument
      const win = iframe?.contentWindow
      if (!doc || !win) return
      win.focus()
      // Insert at current cursor (works inside <td> too)
      const ok = doc.execCommand('insertImage', false, res.path)
      if (!ok) {
        modal.toast('插入失败，请把光标放到要插入的位置后重试', 'error')
        return
      }
      // Set width on the just-inserted <img> (matched by src suffix)
      const width = parseInt(slideImageSize, 10)
      if (width > 0) {
        const imgs = doc.querySelectorAll('img')
        for (const img of Array.from(imgs).reverse()) {
          const src = img.getAttribute('src') || ''
          if (src === res.path || src.endsWith(res.path)) {
            img.style.width = width + 'px'
            img.style.maxWidth = '100%'
            break
          }
        }
      }
      modal.toast('图片已插入', 'success')
    } catch (e: any) {
      modal.toast('图片上传失败: ' + (e?.message || e), 'error')
    }
  }

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

  const applyColorToSelection = (type: 'foreground' | 'background', color: string) => {
    const range = restoreIframeSelection()
    if (!range || range.collapsed) {
      // execCommand fallback for browsers where Range restore works implicitly
      const iframe = iframeRef.current
      if (iframe?.contentDocument) {
        iframe.contentWindow?.focus()
        try {
          iframe.contentDocument.execCommand(
            type === 'foreground' ? 'foreColor' : 'backColor', false, color
          )
        } catch { /* ignore */ }
      }
      return
    }
    const styleProp = type === 'foreground' ? 'color' : 'background-color'
    const span = document.createElement('span')
    span.style.setProperty(styleProp, color)
    try {
      range.surroundContents(span)
    } catch {
      // surroundContents fails when selection crosses element boundaries
      // Fallback: extract contents, wrap in span, re-insert
      const fragment = range.extractContents()
      span.appendChild(fragment)
      range.insertNode(span)
    }
    savedRangeRef.current = null
  }

  const handleColorChange = (color: string) => {
    setTextColor(color)
    applyColorToSelection('foreground', color)
  }

  const getCurrentRange = (): Range | null => {
    const saved = savedRangeRef.current
    if (saved) return saved
    const iframe = iframeRef.current
    const win = iframe?.contentWindow
    if (!win) return null
    const sel = win.getSelection()
    if (sel && sel.rangeCount > 0) return sel.getRangeAt(0)
    return null
  }

  const wrapSelectionWithStyle = (styles: Record<string, string>): boolean => {
    const range = getCurrentRange()
    const doc = iframeRef.current?.contentDocument
    if (!doc || !range || range.collapsed) return false
    const span = doc.createElement('span')
    Object.keys(styles).forEach(k => span.style.setProperty(k, styles[k]))
    try {
      range.surroundContents(span)
    } catch {
      const fragment = range.extractContents()
      span.appendChild(fragment)
      range.insertNode(span)
    }
    savedRangeRef.current = null
    return true
  }

  const applyFontSize = (sizePx: number) => {
    if (!(sizePx > 0)) return
    wrapSelectionWithStyle({ 'font-size': sizePx + 'px' })
  }

  const applyFontFamily = (family: string) => {
    if (!family) return
    wrapSelectionWithStyle({ 'font-family': family })
  }

  const readCurrentFont = () => {
    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    const win = iframe?.contentWindow
    if (!doc || !win) return
    const sel = win.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return
    const range = sel.getRangeAt(0)
    const container = range.commonAncestorContainer
    const el = container.nodeType === 1 ? (container as Element) : (container.parentElement as Element | null)
    if (!el) return
    const cs = win.getComputedStyle(el)
    const size = parseFloat(cs.fontSize)
    if (!isNaN(size)) setFontSize(String(Math.round(size)))
    setFontFamily((cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim())
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
        const ok = await modal.confirm(`已保存 ${saved} 张图片到:\n${dir}\n\n是否下载到本地？`)
        if (ok) {
          try {
            const blob = await api.downloadSlideImages(runId)
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            const safeName = (projectName || 'slides').replace(/[\\/:*?"<>|]/g, '_')
            a.href = url; a.download = safeName + '_slides.zip'
            document.body.appendChild(a); a.click(); document.body.removeChild(a)
            URL.revokeObjectURL(url)
            modal.toast('下载完成', 'success')
          } catch (_) { modal.toast('下载失败，请重试', 'error') }
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
      const sep = previewUrl.includes('?') ? '&' : '?'
      const resp = await fetch(`${previewUrl}${sep}inline=1&_t=${Date.now()}`, { headers })
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
    }, 2000)

    try {
      const result = await api.regenerateSlide({
        run_id: runId,
        slide_seqs: seqs,
        provider_id: providerId,
        model,
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
      } else {
        modal.toast('应用修改失败，请重试', 'error')
      }
    } catch (e: any) {
      modal.toast(`应用修改失败: ${e?.message || e}`, 'error')
    }
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
            {canEditSlides && (
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
            )}
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
                {/* Undo */}
                <button onClick={() => execCmd('undo')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, minWidth: 28 }}
                  title="撤销">↶</button>
                {/* Redo */}
                <button onClick={() => execCmd('redo')}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 13, minWidth: 28 }}
                  title="重做">↷</button>
                <span style={{ width: 1, height: 16, background: 'var(--border, #e2e8f0)', margin: '0 2px' }} />
                {/* Font family */}
                <select
                  value={fontFamily}
                  onMouseDown={() => saveIframeSelection()}
                  onChange={e => { setFontFamily(e.target.value); applyFontFamily(e.target.value) }}
                  style={{
                    fontSize: 11, padding: '2px 4px', maxWidth: 96,
                    border: '1px solid var(--border, #e2e8f0)', borderRadius: 4,
                    background: 'var(--bg, #fff)', color: 'var(--text)',
                  }}
                  title="字体">
                  <option value="">字体</option>
                  <option value="SimSun">宋体</option>
                  <option value="SimHei">黑体</option>
                  <option value="Microsoft YaHei">微软雅黑</option>
                  <option value="KaiTi">楷体</option>
                  <option value="FangSong">仿宋</option>
                  <option value="Arial">Arial</option>
                  <option value="Georgia">Georgia</option>
                  <option value="Times New Roman">Times New Roman</option>
                  <option value="monospace">等宽</option>
                </select>
                {/* Font size */}
                <input
                  type="number" min={6} max={400}
                  value={fontSize}
                  onMouseDown={() => saveIframeSelection()}
                  onChange={e => setFontSize(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { applyFontSize(parseInt(fontSize, 10)) } }}
                  onBlur={() => applyFontSize(parseInt(fontSize, 10))}
                  placeholder="字号"
                  title="字号（px，回车生效）"
                  style={{ width: 48, padding: '2px 6px', fontSize: 11, border: '1px solid var(--border, #e2e8f0)', borderRadius: 4 }}
                />
                <span style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)' }}>px</span>
                <span style={{ width: 1, height: 16, background: 'var(--border, #e2e8f0)', margin: '0 2px' }} />
                {/* Text color */}
                <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                  <input type="color" value={textColor}
                    onPointerDown={(e) => { e.preventDefault(); saveIframeSelection(); }}
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
                    onPointerDown={(e) => { e.preventDefault(); saveIframeSelection(); }}
                    onChange={e => applyColorToSelection('background', e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                    title="背景色" />
                  <span className="btn btn-ghost btn-sm" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3, pointerEvents: 'none' }}>
                    <span style={{
                      display: 'inline-block', width: 13, height: 13, borderRadius: 2,
                      background: '#ffff00', border: '1px solid rgba(0,0,0,0.15)',
                    }} />A</span>
                </div>
                <span style={{ width: 1, height: 16, background: 'var(--border, #e2e8f0)', margin: '0 2px' }} />
                {/* Insert image */}
                <button onClick={() => slideImgRef.current?.click()}
                  className="btn btn-ghost btn-sm"
                  style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}
                  title="插入图片">
                  <SvgIcon name="image" size={13} /> 图片
                </button>
                <input
                  type="number" min={0} step={10} value={slideImageSize}
                  onChange={e => setSlideImageSize(e.target.value)}
                  placeholder="原图"
                  title="图片宽度（px，留空=原图）"
                  style={{ width: 56, padding: '2px 6px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4 }}
                />
                <span style={{ fontSize: 10, color: 'var(--text-muted, #94a3b8)' }}>px</span>
                <input ref={slideImgRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleInsertImage(f); e.target.value = '' }} />
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
                {downloadFormat === 'svg' ? <><SvgIcon name="download" size={14} /> SVG ZIP</> : <><SvgIcon name="download" size={14} /> PPTX</>}
              </button>
            )}
            <button onClick={handleSaveHtml} className="btn btn-ghost btn-sm" style={{ fontSize: 12 }}>
              <SvgIcon name="download" size={14} /> HTML
            </button>
            <button
              onClick={onClose}
              style={{
                width: 32, height: 32, borderRadius: 6, border: 'none',
                background: 'var(--bg-secondary, #f1f5f9)', cursor: 'pointer',
                fontSize: 16, color: 'var(--text)', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
              }}
            ><SvgIcon name="x-mark" size={16} /></button>
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
                  applyEditableDoc(iframeRef.current.contentDocument)
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
