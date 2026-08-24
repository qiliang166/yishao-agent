import { useState, useEffect, forwardRef, useImperativeHandle, useCallback, useRef, useMemo } from 'react'
import SvgIcon from './SvgIcon'
import { api } from '../services/api'
import { useModal } from './ModalProvider'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'

export interface TeachingDocPanelProps {
  docType: 'sop' | 'dao' | 'yanxi'
  projectId: string
  projectName: string
  steps: Record<string, string>
  savedSteps: Record<string, string>
  prompt: string
  skill: string
  llmProviders: { id: string; name: string; is_enabled: number; models: string[] }[]
  onRefresh: () => Promise<any>
  hideControls?: boolean
  dataSource?: string
  onDataSourceChange?: (val: string) => void
  temperature?: number
  onGeneratingChange?: (generating: boolean) => void
  onLogEntry?: (entry: { time: string; message: string }) => void
  onProgressChange?: (progress: string) => void
}

const DOC_LABELS: Record<string, string> = {
  sop: '标准文档', dao: '分析文档', yanxi: '综合文档',
}
const DOC_COLORS: Record<string, string> = {
  sop: 'var(--success)', dao: 'var(--purple)', yanxi: 'var(--warning)',
}
const DOC_ICONS: Record<string, string> = {
  sop: 'file-text', dao: 'sparkles', yanxi: 'book-open',
}
const STEP_KEYS: Record<string, string> = {
  sop: 'step2_sop', dao: 'step2_daoshuyi', yanxi: 'step2_yanxi',
}
const MODEL_KEYS: Record<string, string> = {
  sop: '_model_s2_sop', dao: '_model_s2_dao', yanxi: '_model_s2_yanxi',
}
const DEFAULT_PROMPTS: Record<string, string> = {
  sop: '请将以下内容整理为标准文档格式。',
  dao: '请分析以下内容的原理与方法。',
  yanxi: '请将以下内容整理为手册格式，包含背景知识和要点。',
}
const IMG_MAX_BYTES = 2 * 1024 * 1024

// ── HTML → Markdown converter (shared across all doc panels) ──
const turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' })
turndownService.use(gfm)
// Markdown `![](url)` can't carry a width, so keep sized images as inline HTML
turndownService.addRule('image', {
  filter: 'img',
  replacement: (_content, node) => {
    const el = node as HTMLElement
    const src = el.getAttribute('src') || ''
    const alt = el.getAttribute('alt') || ''
    const widthAttr = el.getAttribute('width')
    const styleWidth = el.style && el.style.width ? parseInt(el.style.width, 10) : 0
    const width = widthAttr || styleWidth || 0
    if (width) {
      return `<img src="${src}" alt="${alt}" width="${width}">`
    }
    return `![${alt}](${src})`
  },
})

// ── Preview tab CSS (scoped to .md-preview-container) ──
const PREVIEW_CSS = `
.md-preview { font-size:14px; line-height:1.8; color:#1a1a2e; }
.md-preview h1 { font-size:1.6em; margin:0.8em 0 0.4em; border-bottom:2px solid #e0e0e0; padding-bottom:0.3em; }
.md-preview h2 { font-size:1.35em; margin:0.7em 0 0.35em; border-bottom:1px solid #eee; padding-bottom:0.2em; }
.md-preview h3 { font-size:1.15em; margin:0.6em 0 0.3em; }
.md-preview h4 { font-size:1.05em; margin:0.5em 0 0.25em; }
.md-preview p { margin:0.5em 0; }
.md-preview ul,.md-preview ol { padding-left:1.6em; margin:0.4em 0; }
.md-preview li { margin:0.2em 0; }
.md-preview table { border-collapse:collapse; width:100%; margin:0.6em 0; }
.md-preview th,.md-preview td { border:1px solid #d0d0d0; padding:6px 10px; text-align:left; }
.md-preview th { background:#f5f5f5; font-weight:600; }
.md-preview code { background:#f0f0f0; padding:1px 5px; border-radius:3px; font-size:0.9em; }
.md-preview pre { background:#f8f8f8; border:1px solid #e0e0e0; border-radius:6px; padding:12px 16px; overflow-x:auto; }
.md-preview pre code { background:none; padding:0; }
.md-preview blockquote { border-left:3px solid #ddd; margin:0.6em 0; padding:0.4em 1em; color:#666; }
.md-preview hr { border:none; border-top:1px solid #e0e0e0; margin:1em 0; }
.md-preview img { max-width:100%; }
.md-preview a { color:var(--primary,#4a6cf7); }
.md-preview[contenteditable]:empty:before { content:attr(data-placeholder); color:#999; }
`

const TeachingDocPanel = forwardRef<{ triggerGenerate: (model?: string) => Promise<void>; cancel: () => void }, TeachingDocPanelProps>(({
  docType, projectId, projectName, steps, savedSteps, prompt, skill, llmProviders, onRefresh,
  hideControls, dataSource: dataSourceProp, onDataSourceChange, temperature = 0.3,
  onGeneratingChange, onLogEntry, onProgressChange,
}, ref) => {
  const modal = useModal()
  const editorRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const lastPushedRef = useRef<string | null>(null)

  // ── Internal state ──
  const modelKey = MODEL_KEYS[docType]
  const getDefaultModel = () => {
    const saved = steps[modelKey]
    if (saved) return saved
    const defP = llmProviders.find(p => p.is_enabled)
    const defMs = Array.isArray(defP?.models) ? defP.models : []
    return defP && defMs.length > 0 ? `${defP.id}:${defMs[0]}` : ''
  }
  const tempKey = `_temp_s2_${docType}`
  const resolvedTemperature = temperature ?? (steps[tempKey] ? parseFloat(steps[tempKey]) : 0.3)
  const [model, setModel] = useState(() => getDefaultModel())
  const lastModelKey = useRef(modelKey)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  const [_dataSource, _setDataSource] = useState('video')
  const dataSource = dataSourceProp !== undefined ? dataSourceProp : _dataSource
  const setDataSource = onDataSourceChange || _setDataSource
  const [generating, setGenerating] = useState(false)
  const generatingRef = useRef(false)
  const [savedFlash, setSavedFlash] = useState(0)

  // ── Editor state ──
  const [imageSize, setImageSize] = useState('400')
  const [viewMode, setViewMode] = useState<'preview' | 'source'>('preview')

  const stepKey = STEP_KEYS[docType]
  const propContent = steps[stepKey] || ''
  const savedContent = savedSteps[stepKey] || ''

  // ── Local content state (markdown is the source of truth) ──
  const [localContent, setLocalContent] = useState(propContent)

  // Re-sync localContent when prop content changes externally (AI gen, onRefresh)
  useEffect(() => {
    setLocalContent(propContent)
  }, [propContent])

  // Re-sync localContent when stepKey changes (tab switch)
  useEffect(() => {
    setLocalContent(steps[stepKey] || '')
  }, [stepKey])

  // ── Re-sync model when docType/modelKey changes ──
  if (modelKey !== lastModelKey.current) {
    lastModelKey.current = modelKey
    const persisted = steps[modelKey] || ''
    if (persisted) setModel(persisted)
  }

  // ── Persist default model to API if not yet saved ──
  const modelSavedRef = useRef(false)
  if (!steps[modelKey] && !modelSavedRef.current) {
    modelSavedRef.current = true
    if (model) api.saveStep(projectId, modelKey, model)
  }

  // ── Data source text ──
  const getSourceText = (src: string) => {
    switch (src) {
      case 'video': return steps.raw_video || steps.step1_video || ''
      case 'text': return steps.raw_text || steps.step1_text || ''
      case 'file': return steps.raw_file || steps.step1_file || ''
      default: return ''
    }
  }

  // ── Rendered markdown (memoised) ──
  const renderedHtml = useMemo(() => {
    if (!localContent) return ''
    try {
      const html = marked.parse(localContent) as string
      return DOMPurify.sanitize(html)
    } catch {
      return ''
    }
  }, [localContent])

  // ── Push markdown render into the WYSIWYG editor on external content change / mode switch ──
  useEffect(() => {
    if (viewMode !== 'preview') return
    if (!editorRef.current) return
    if (lastPushedRef.current === localContent) return
    lastPushedRef.current = localContent
    editorRef.current.innerHTML = renderedHtml
  }, [localContent, renderedHtml, viewMode])

  // ── Commit current WYSIWYG HTML back to markdown (source of truth) ──
  const commitPreviewHtml = () => {
    const html = editorRef.current?.innerHTML ?? ''
    const md = turndownService.turndown(html)
    lastPushedRef.current = md
    setLocalContent(md)
    api.saveStep(projectId, stepKey, md)
  }

  const handleEditorInput = () => {
    commitPreviewHtml()
  }

  const handleSourceChange = (text: string) => {
    setLocalContent(text)
    api.saveStep(projectId, stepKey, text)
  }

  // ── Inline /api/logos/* references as data URIs for offline HTML ──
  const inlineLogos = useCallback(async (html: string): Promise<string> => {
    const regex = /src="(\/api\/logos\/[^"]+)"/g
    const matches = [...html.matchAll(regex)]
    if (matches.length === 0) return html
    const token = localStorage.getItem('auth_token')
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
    let out = html
    for (const m of matches) {
      const url = m[1]
      try {
        const resp = await fetch(url, { headers })
        if (!resp.ok) continue
        const blob = await resp.blob()
        const dataUri = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result as string)
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(blob)
        })
        out = out.split(`src="${url}"`).join(`src="${dataUri}"`)
      } catch {
        // keep original URL if fetch fails
      }
    }
    return out
  }, [])

  // ── Print ──
  const handlePrint = useCallback(async () => {
    if (!renderedHtml) return
    // Open synchronously within the click gesture to avoid popup blocking
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    let html = renderedHtml
    try {
      html = await inlineLogos(renderedHtml)
    } catch { /* keep original */ }
    const doc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>${DOC_LABELS[docType]}</title>
<style>${PREVIEW_CSS}
body { max-width:800px; margin:0 auto; padding:24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; }
@media print { body { max-width:none; padding:0; } }
</style>
</head>
<body><div class="md-preview">${html}</div></body>
</html>`
    w.document.write(doc)
    w.document.close()
    w.focus()
    w.print()
  }, [renderedHtml, docType, inlineLogos])

  // ── Download as self-contained HTML ──
  const handleDownloadHtml = useCallback(async () => {
    if (!renderedHtml) return
    let html = renderedHtml
    try {
      html = await inlineLogos(renderedHtml)
    } catch { /* keep original */ }
    const doc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${DOC_LABELS[docType]}</title>
<style>${PREVIEW_CSS}</style>
</head>
<body style="max-width:800px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<div class="md-preview">${html}</div>
</body>
</html>`
    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${DOC_LABELS[docType]}.html`
    a.click()
    URL.revokeObjectURL(url)
  }, [renderedHtml, docType, inlineLogos])

  // ── Generate (streaming with progress) ──
  const handleGenerate = useCallback(async (overrideModel?: string) => {
    const effectiveModel = overrideModel || model
    const sourceText = getSourceText(dataSource)
    if (!sourceText) {
      modal.toast(`数据来源「${dataSource}」没有内容，请先在 Stage 1 导入素材`, 'error')
      return
    }
    if (!effectiveModel) {
      modal.toast('请先选择大模型', 'error')
      return
    }
    if (generatingRef.current) return
    const ctrl = new AbortController(); abortRef.current = ctrl
    generatingRef.current = true
    setGenerating(true)
    onGeneratingChange?.(true)
    const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
    const label = DOC_LABELS[docType]
    try {
      const [pid, mdl] = effectiveModel.split(':')
      const systemPrompt = prompt || DEFAULT_PROMPTS[docType]
      const userMessage = skill
        ? `请将以下内容按指定格式整理：\n\n${sourceText}\n\n输出格式要求：\n${skill}`
        : sourceText

      onLogEntry?.({ time: now(), message: `开始生成 ${label}...` })
      onProgressChange?.(`正在生成 ${label}...`)

      let fullText = ''
      let lastUpdate = 0
      for await (const chunk of api.llmGenerateStream({
        provider_id: pid, model: mdl,
        system_prompt: systemPrompt, user_message: userMessage,
        temperature: resolvedTemperature, signal: ctrl.signal,
      })) {
        fullText += chunk
        if (fullText.length - lastUpdate > 300) {
          lastUpdate = fullText.length
          onProgressChange?.(`正在生成 ${label} — 已生成 ${fullText.length} 字符`)
        }
      }

      if (!mountedRef.current) return
      onLogEntry?.({ time: now(), message: `${label} 完成 (${fullText.length} 字符)` })
      onProgressChange?.('')
      if (fullText) {
        await api.saveStep(projectId, stepKey, fullText)
        onLogEntry?.({ time: now(), message: `已保存 ${stepKey} (${fullText.length} 字符)` })
        api.saveFileToProject(projectId, `${projectName}_${label}.txt`, fullText).catch(() => {})
        await onRefresh()
        onLogEntry?.({ time: now(), message: '已刷新步骤数据' })
      } else {
        modal.toast('生成失败: 模型未返回内容', 'error')
      }
    } catch (e: any) {
      if (!mountedRef.current) return
      if (e.name !== 'AbortError') {
        onLogEntry?.({ time: now(), message: `生成失败: ${e.message}` })
        modal.toast(`生成失败: ${e.message}`, 'error')
      } else {
        onLogEntry?.({ time: now(), message: '已取消' })
      }
    } finally {
      generatingRef.current = false
      if (mountedRef.current) setGenerating(false)
      abortRef.current = null
      onGeneratingChange?.(false)
    }
  }, [dataSource, model, prompt, skill, docType, projectId, stepKey, onRefresh, resolvedTemperature, onGeneratingChange, onLogEntry, onProgressChange])

  // ── Save ──
  const handleSave = useCallback(async () => {
    try {
      await api.saveStep(projectId, stepKey, localContent)
      if (!mountedRef.current) return
      setSavedFlash(Date.now())
      setTimeout(() => { if (mountedRef.current) setSavedFlash(0) }, 1500)
      await onRefresh()
      modal.toast('已保存', 'success')
    } catch (e: any) {
      if (mountedRef.current) modal.toast(`保存失败: ${e.message}`, 'error')
    }
  }, [projectId, stepKey, localContent, onRefresh])

  // ── Clear ──
  const handleClear = useCallback(async () => {
    setLocalContent('')
    await api.saveStep(projectId, stepKey, '')
    await onRefresh()
  }, [projectId, stepKey, onRefresh])

  // ── Insert image via backend upload (URL reference, inserted at cursor in WYSIWYG) ──
  const handleInsertImage = async (file: File) => {
    if (file.size > IMG_MAX_BYTES) {
      modal.toast('图片超过 2MB，请压缩后再插入', 'error')
      return
    }
    try {
      const res = await api.uploadLogo(file)
      if (res == null || !res.url) {
        modal.toast('上传失败：未返回图片地址', 'error')
        return
      }
      const width = parseInt(imageSize, 10)
      const div = editorRef.current
      if (!div) return
      div.focus()
      let ok = false
      try { ok = document.execCommand('insertImage', false, res.url) } catch { ok = false }
      if (!ok) {
        const img = document.createElement('img')
        img.src = res.url
        img.alt = '图片'
        if (width > 0) img.width = width
        div.appendChild(img)
      } else if (width > 0) {
        const imgs = div.querySelectorAll('img')
        for (const img of Array.from(imgs).reverse()) {
          const src = img.getAttribute('src') || ''
          if (src === res.url || src.endsWith(res.url)) {
            img.style.width = width + 'px'
            img.style.maxWidth = '100%'
            break
          }
        }
      }
      commitPreviewHtml()
      modal.toast('图片已插入', 'success')
    } catch (e: any) {
      modal.toast('图片上传失败: ' + (e?.message || e), 'error')
    }
  }

  // ── Insert a 3x3 table at cursor in the WYSIWYG editor ──
  const handleInsertTable = () => {
    const div = editorRef.current
    if (!div) return
    div.focus()
    const cols = 3
    let html = '<table><thead><tr>' + '<th>表头</th>'.repeat(cols) + '</tr></thead><tbody>'
    for (let i = 0; i < 2; i++) {
      html += '<tr>' + '<td></td>'.repeat(cols) + '</tr>'
    }
    html += '</tbody></table><p><br></p>'
    let ok = false
    try { ok = document.execCommand('insertHTML', false, html) } catch { ok = false }
    if (!ok) {
      const table = document.createElement('table')
      const thead = document.createElement('thead')
      const headRow = document.createElement('tr')
      for (let i = 0; i < cols; i++) {
        const th = document.createElement('th')
        th.textContent = '表头'
        headRow.appendChild(th)
      }
      thead.appendChild(headRow)
      table.appendChild(thead)
      const tbody = document.createElement('tbody')
      for (let r = 0; r < 2; r++) {
        const row = document.createElement('tr')
        for (let c = 0; c < cols; c++) row.appendChild(document.createElement('td'))
        tbody.appendChild(row)
      }
      table.appendChild(tbody)
      div.appendChild(table)
      div.appendChild(document.createElement('p'))
    }
    commitPreviewHtml()
    modal.toast('已插入表格，点击单元格可编辑', 'success')
  }

  // ── Insert a blank row below the row the cursor is in ──
  const handleInsertRow = () => {
    const div = editorRef.current
    if (!div) return
    const sel = window.getSelection()
    let tr: HTMLTableRowElement | null = null
    if (sel && sel.rangeCount > 0) {
      const anchor = sel.anchorNode as Element | null
      const el = anchor && anchor.nodeType === 1 ? anchor : (anchor?.parentElement ?? null)
      tr = el ? (el.closest('tr') as HTMLTableRowElement | null) : null
    }
    if (!tr) {
      modal.toast('请先把光标放到表格的某一行内', 'error')
      return
    }
    const newTr = tr.cloneNode(true) as HTMLTableRowElement
    newTr.querySelectorAll('td,th').forEach(c => { c.textContent = '' })
    tr.after(newTr)
    commitPreviewHtml()
    modal.toast('已在当前行下方插入一行', 'success')
  }

  // ── Save to project file ──
  const handleSaveToProject = useCallback(async () => {
    if (!localContent) return
    try {
      const label = DOC_LABELS[docType]
      const resp = await api.saveFileToProject(projectId, `${projectName}_${label}.txt`, localContent)
      modal.toast(`已保存到 ${resp.path}`, 'success')
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    }
  }, [projectId, localContent, docType])

  // ── Model change ──
  const handleModelChange = useCallback((val: string) => {
    setModel(val)
    api.saveStep(projectId, MODEL_KEYS[docType], val)
  }, [projectId, docType])

  const abortRef = useRef<AbortController | null>(null)

  // ── Expose triggerGenerate + cancel for batch ──
  useImperativeHandle(ref, () => ({
    triggerGenerate: (m?: string) => handleGenerate(m),
    cancel: () => { abortRef.current?.abort(); setGenerating(false); generatingRef.current = false },
  }), [handleGenerate])

  // ── Button helpers ──
  const getSaveLabel = () => {
    if (!localContent.trim()) return <><SvgIcon name="download" size={12} /> 保存</>
    if (localContent !== savedContent) return <><SvgIcon name="download" size={12} /> 保存</>
    return <><SvgIcon name="check" size={12} /> 已保存</>
  }
  const getSaveClass = () => {
    if (savedFlash) return 'btn-saved-flash'
    if (!localContent.trim() || localContent !== savedContent) return 'btn-dirty'
    return ''
  }

  const label = DOC_LABELS[docType]
  const color = DOC_COLORS[docType]
  const icon = DOC_ICONS[docType]
  const sourceText = {
    video: (steps.raw_video || steps.step1_video) ? '已有内容' : '暂无内容',
    text: (steps.raw_text || steps.step1_text) ? '已有内容' : '暂无内容',
    file: (steps.raw_file || steps.step1_file) ? '已有内容' : '暂无内容',
  }

  const controls = (
    <>
      <div className="card-title" style={{ color }}><SvgIcon name={icon} size={14} /> {label}生成</div>
      <div className="card-hint">基于文案提取结果，使用栏目配置中设定的提示词和SKILL生成{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
        <label className="form-label" htmlFor={`ds-${docType}`}>数据来源</label>
        <select id={`ds-${docType}`} className="form-select" style={{ marginBottom: 6 }}
          value={dataSource} onChange={e => setDataSource(e.target.value)}
          aria-label="数据来源">
          <option value="video">视频提取 — {sourceText.video}</option>
          <option value="text">文字输入 — {sourceText.text}</option>
          <option value="file">文件上传 — {sourceText.file}</option>
        </select>
      </div>
      <label className="form-label" htmlFor={`model-${docType}`}>大模型</label>
      <select id={`model-${docType}`} className="form-select" style={{ marginBottom: 8 }}
        value={model} onChange={e => handleModelChange(e.target.value)}
        aria-label="大模型">
        <option value="">选择模型...</option>
        {llmProviders.filter(p => p.is_enabled).map(p =>
          (Array.isArray(p.models) ? p.models : []).map((m: string) => (
            <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
          ))
        )}
      </select>
      <button className="btn btn-primary btn-sm w-full"
        disabled={!getSourceText(dataSource) || !model || generating}
        onClick={() => handleGenerate()}>
        {generating ? <><SvgIcon name="clock" size={12} /> 生成中...</> : <><SvgIcon name="sparkles" size={12} /> AI 生成 {label}</>}
      </button>
      {generating && (
        <button className="btn btn-sm" style={{ marginTop: 4, background: 'var(--warning)', color: '#fff', width: '100%' }}
          onClick={() => { abortRef.current?.abort(); setGenerating(false); generatingRef.current = false }}>取消</button>
      )}
    </>
  )

  // ── Switch editor mode (reset the push guard so a freshly-mounted WYSIWYG re-renders) ──
  const switchMode = (mode: 'preview' | 'source') => {
    if (mode === 'preview') lastPushedRef.current = null
    setViewMode(mode)
  }

  // ── Editor: dual-mode (preview WYSIWYG + source markdown textarea) ──
  const tabBar = (
    <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexShrink: 0, alignItems: 'center' }}>
      <button className="btn btn-ghost btn-sm" type="button"
        style={{ fontSize: 11, padding: '2px 10px', background: viewMode === 'preview' ? 'var(--primary)' : undefined, color: viewMode === 'preview' ? '#fff' : undefined }}
        onClick={() => switchMode('preview')}>
        预览
      </button>
      <button className="btn btn-ghost btn-sm" type="button"
        style={{ fontSize: 11, padding: '2px 10px', background: viewMode === 'source' ? 'var(--primary)' : undefined, color: viewMode === 'source' ? '#fff' : undefined }}
        onClick={() => switchMode('source')}>
        源码
      </button>
      <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
        {viewMode === 'preview' ? '所见即所得，可插图、编辑文字、回车换行、插入表格' : 'Markdown 源码，可自由换行、新增行、写表格'}
      </span>
    </div>
  )

  const editor = (
    <>
      <style>{PREVIEW_CSS}</style>
      {tabBar}
      {viewMode === 'source' ? (
        <textarea
          className="form-input"
          value={localContent}
          onChange={e => handleSourceChange(e.target.value)}
          placeholder="在此编辑 Markdown 源码，可直接换行、新增行，或写表格"
          style={{ flex: 1, minHeight: 280, resize: 'none', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7, width: '100%' }}
        />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 6, flexShrink: 0, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" type="button"
              title="插入图片（上传后以链接引用，可设宽度）"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={() => imgRef.current?.click()}>
              <SvgIcon name="image" size={12} /> 插入图片
            </button>
            <input
              type="number" min={0} step={10} value={imageSize}
              onChange={e => setImageSize(e.target.value)}
              placeholder="原图"
              title="图片宽度（px，留空=原图）"
              style={{ width: 64, padding: '2px 6px', fontSize: 11, border: '1px solid var(--border)', borderRadius: 4 }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>px 宽</span>
            <input ref={imgRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleInsertImage(f); e.target.value = '' }} />
            <button className="btn btn-ghost btn-sm" type="button"
              title="在光标处插入一个 3x3 表格"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={handleInsertTable}>
              <SvgIcon name="table" size={12} /> 插入表格
            </button>
            <button className="btn btn-ghost btn-sm" type="button"
              title="在光标所在行下方插入一行（需先把光标放进表格内）"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={handleInsertRow}>
              <SvgIcon name="plus" size={12} /> 插入行
            </button>
            <span style={{ flex: 1 }} />
            {localContent && (
              <>
                <button
                  onClick={handleDownloadHtml}
                  style={{
                    padding: '5px 12px', fontSize: 11, cursor: 'pointer',
                    background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4,
                  }}>
                  <SvgIcon name="download" size={12} /> 下载 HTML
                </button>
                <button
                  onClick={handlePrint}
                  style={{
                    marginLeft: 6, padding: '5px 12px', fontSize: 11, cursor: 'pointer',
                    background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 4,
                  }}>
                  <SvgIcon name="printer" size={12} /> 打印
                </button>
              </>
            )}
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={handleEditorInput}
            data-placeholder="点击生成按钮，AI生成后在此直接编辑，可输入文字、回车换行或插入图片/表格"
            className="md-preview"
            style={{
              flex: 1, minHeight: 280, overflow: 'auto',
              background: '#fff', borderRadius: 6, padding: '16px 20px',
              border: '1px solid var(--border)', outline: 'none',
            }}
          />
        </>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
          {docType === 'sop' ? '编辑完成后可供文档课件使用'
            : docType === 'dao' ? '编辑完成后即可供「合成PPT」栏目引用'
              : '编辑完成后即可供「合成PPT」「演讲文案」栏目引用'}
        </span>
        <span style={{ display: 'flex', gap: 5 }}>
          <button className="btn btn-ghost btn-sm" onClick={handleClear}
            disabled={!localContent}><SvgIcon name="x-mark" size={12} /> 清空</button>
          <button className="btn btn-ghost btn-sm" onClick={handleSaveToProject}
            disabled={!localContent}><SvgIcon name="download" size={12} /> 存到项目</button>
          <button className={`btn btn-primary btn-sm ${getSaveClass()}`}
            disabled={!localContent.trim()}
            onClick={handleSave}>{getSaveLabel()}</button>
        </span>
      </div>
    </>
  )

  if (hideControls) return editor
  return <>{controls}{editor}</>
})

export default TeachingDocPanel
