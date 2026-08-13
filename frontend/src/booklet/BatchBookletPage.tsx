import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import JSZip from 'jszip'
import SvgIcon from '../components/SvgIcon'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'
import {
  BookType, ContentProject, ContentItem, Chapter, Theme, PageHeaderFooter,
  mdToHtml, newChapterId, normalizeChapters, BOOK_TYPE_LABEL,
} from './types'

const STEPS = [
  { id: 1, label: '选项目与内容' },
  { id: 2, label: '封面署名' },
  { id: 3, label: '批量合成' },
]

const FIXED_KEYS: { key: 'flyleaf' | 'toc' | 'back'; label: string }[] = [
  { key: 'flyleaf', label: '扉页' },
  { key: 'toc', label: '目录' },
  { key: 'back', label: '封底' },
]

const MODE_OPTIONS: { mode: 'paged' | 'flow' | 'standard'; label: string; descA4: string; descPpt: string }[] = [
  { mode: 'paged', label: '翻页式', descA4: '电子书形态：一次一页居中显示，按钮/方向键翻页', descPpt: '幻灯片形态：一次一屏，按钮/方向键翻页' },
  { mode: 'flow', label: '网页式', descA4: '连续长页不分页，从头滚到尾', descPpt: '全部页面纵向连续滚动浏览' },
  { mode: 'standard', label: '标准页（PDF 型）', descA4: 'A4 纸页瀑布式排布，像 PDF 阅读器；打印即得一页一张 A4', descPpt: '16:9 标准页瀑布式排布，像 PDF 阅读器' },
]

interface SelEntry { project: ContentProject; checkedItems: ContentItem[] }

interface BatchCover {
  titleTemplate: string
  subtitle: string
  author: string
  org: string
  date_text: string
  logo_url: string
  flyleaf_text: string
  back_cover_text: string
  theme_id: string
  theme_colors: Record<string, string>
  desk_none: boolean
  render_mode: 'paged' | 'flow' | 'standard'
  hidden_fixed: string[]
  page_hf: PageHeaderFooter
}

const sanitizeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').trim() || '未命名'

const triggerBlobDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}

function CoverThumb({ doc, pageW, pageH, thumbW }: { doc: string; pageW: number; pageH: number; thumbW: number }) {
  if (!doc || thumbW <= 0) return null
  const scale = thumbW / pageW
  return (
    <div style={{ width: thumbW, height: Math.round(pageH * scale), overflow: 'hidden', background: '#fff', flexShrink: 0 }}>
      <iframe srcDoc={doc} sandbox="" scrolling="no" title="封面预览"
        style={{ width: pageW, height: pageH, border: 'none', transform: `scale(${scale})`, transformOrigin: 'top left', pointerEvents: 'none' }} />
    </div>
  )
}

export default function BatchBookletPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { confirm, toast } = useModal()
  const base = location.pathname.startsWith('/app') ? '/app/booklets' : '/booklets'

  const [bookType] = useState<BookType>(() => {
    const p = new URLSearchParams(window.location.search)
    return p.get('book_type') === 'ppt' ? 'ppt' : 'a4'
  })

  const [step, setStep] = useState(1)

  // Step 1 状态
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([])
  const [wsId, setWsId] = useState('')
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [projects, setProjects] = useState<ContentProject[]>([])
  const [loadingTree, setLoadingTree] = useState(false)
  const [selection, setSelection] = useState<Record<string, SelEntry>>({})

  // Step 2 状态
  const [cover, setCover] = useState<BatchCover>({
    titleTemplate: '{name}',
    subtitle: '',
    author: '',
    org: '',
    date_text: '',
    logo_url: '',
    flyleaf_text: '',
    back_cover_text: '',
    theme_id: '',
    theme_colors: {},
    desk_none: false,
    render_mode: 'paged',
    hidden_fixed: [],
    page_hf: {},
  })
  const [themes, setThemes] = useState<Theme[]>([])
  const [uploading, setUploading] = useState(false)
  const logoRef = useRef<HTMLInputElement>(null)

  // Step 2 封面预览状态
  const [coverDoc, setCoverDoc] = useState('')
  const [coverError, setCoverError] = useState('')
  const previewRef = useRef<HTMLDivElement>(null)
  const [previewW, setPreviewW] = useState(0)
  const [previewH, setPreviewH] = useState(0)
  const fetchTimer = useRef<ReturnType<typeof setTimeout>>()

  // Step 3 状态
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: [] as string[] })

  useEffect(() => {
    api.bookletAvailableContent(bookType)
      .then(d => {
        const ws = d?.workspaces || []
        setWorkspaces(ws)
        if (ws.length > 0) setWsId((prev: string) => prev || ws[0].id)
      })
      .catch((e: any) => toast(`加载工作区失败: ${e?.message || e}`, 'error'))
    api.bookletThemes()
      .then(list => { if (list != null) setThemes(list) })
      .catch((e: any) => toast(`加载主题失败: ${e?.message || e}`, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!wsId) return
    setLoadingTree(true)
    api.bookletAvailableContent(bookType, wsId, categoryId || undefined)
      .then(d => {
        if (d?.projects != null) setProjects(d.projects)
        if (d?.categories != null) setCategories(d.categories)
      })
      .catch((e: any) => toast(`加载明细失败: ${e?.message || e}`, 'error'))
      .finally(() => setLoadingTree(false))
  }, [wsId, categoryId, bookType])

  const selectedEntries = Object.values(selection)
  const totalChapters = selectedEntries.reduce((n, e) => n + e.checkedItems.length, 0)

  const toggleProject = (p: ContentProject) => {
    setSelection(prev => {
      const next = { ...prev }
      if (next[p.id]) {
        delete next[p.id]
      } else {
        next[p.id] = { project: p, checkedItems: p.items.filter(i => i.available) }
      }
      return next
    })
  }

  const toggleItem = (projectId: string, item: ContentItem) => {
    setSelection(prev => {
      const entry = prev[projectId]
      if (!entry) return prev
      const exists = entry.checkedItems.some(i => i.source_type === item.source_type && i.source_key === item.source_key)
      const checkedItems = exists
        ? entry.checkedItems.filter(i => !(i.source_type === item.source_type && i.source_key === item.source_key))
        : [...entry.checkedItems, item]
      return { ...prev, [projectId]: { ...entry, checkedItems } }
    })
  }

  const setCoverPatch = (patch: Partial<BatchCover>) =>
    setCover(prev => ({ ...prev, ...patch }))

  const setPageHf = (patch: Partial<PageHeaderFooter>) =>
    setCover(prev => ({ ...prev, page_hf: { ...(prev.page_hf || {}), ...patch } }))

  const toggleFixed = (key: string, show: boolean) => {
    setCover(prev => {
      const hidden = new Set(prev.hidden_fixed)
      if (show) hidden.delete(key)
      else hidden.add(key)
      return { ...prev, hidden_fixed: Array.from(hidden) }
    })
  }

  useEffect(() => {
    if (step !== 2) return
    const el = previewRef.current
    if (!el) return
    const update = () => { setPreviewW(el.clientWidth); setPreviewH(el.clientHeight) }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [step])

  const fetchCover = useCallback(() => {
    const firstEntry = selectedEntries[0]
    const previewTitle = cover.titleTemplate.replace(/\{name\}/g, firstEntry?.project.name || '{name}')
    const firstItem = firstEntry?.checkedItems[0]
    const viMode = bookType === 'a4' && !!firstItem && firstItem.source_type !== 'step_md'
    const theme = themes.find(t => t.id === cover.theme_id) || themes[0]
    setCoverError('')
    api.bookletCoverPreview({
      book_type: bookType,
      title: previewTitle,
      subtitle: cover.subtitle,
      author: cover.author,
      org: cover.org,
      date_text: cover.date_text,
      flyleaf_text: cover.flyleaf_text,
      back_cover_text: cover.back_cover_text,
      logo_url: cover.logo_url,
      theme_id: cover.theme_id || '',
      theme_colors: (theme?.colors || {}) as Record<string, string>,
      desk_none: !!cover.desk_none,
      vi_mode: viMode,
      page_hf: cover.page_hf || {},
    }).then(doc => { if (doc) { setCoverDoc(doc); setCoverError('') } })
      .catch((e: any) => {
        console.warn('封面预览加载失败:', e)
        setCoverError('封面预览暂时不可用，请检查后端服务')
      })
  }, [selectedEntries, cover, themes, bookType])

  useEffect(() => {
    if (!themes.length) return
    clearTimeout(fetchTimer.current)
    fetchTimer.current = setTimeout(fetchCover, 250)
    return () => clearTimeout(fetchTimer.current)
  }, [fetchCover, themes])

  const handleUploadLogo = async (file: File) => {
    setUploading(true)
    try {
      const r = await api.uploadLogo(file)
      if (r != null && r.url) {
        setCoverPatch({ logo_url: r.url })
        toast('LOGO 已上传', 'success')
      }
    } catch (e: any) {
      toast(`上传失败: ${e?.message || e}`, 'error')
    } finally {
      setUploading(false)
    }
  }

  const buildCover = () => ({
    org: cover.org,
    date_text: cover.date_text,
    flyleaf_text: cover.flyleaf_text,
    back_cover_text: cover.back_cover_text,
    logo_url: cover.logo_url,
    theme_id: cover.theme_id,
    theme_colors: cover.theme_colors,
    desk_none: cover.desk_none,
    render_mode: cover.render_mode,
    hidden_fixed: cover.hidden_fixed,
    page_hf: cover.page_hf,
  })

  const generateOne = async (entry: SelEntry): Promise<{ title: string; html: string }> => {
    const title = (cover.titleTemplate.replace(/\{name\}/g, entry.project.name) || entry.project.name).trim()
    const b = await api.createBooklet(title, bookType)
    if (b == null || !b.id) throw new Error('创建草稿失败')
    const chapters: Chapter[] = []
    for (const item of entry.checkedItems) {
      const r = await api.bookletContentItem(entry.project.id, item.source_type, item.source_key)
      if (r != null && r.content != null) {
        const isMd = r.content_format === 'md'
        chapters.push({
          id: newChapterId(),
          title: `${entry.project.name} · ${item.label}`,
          source_type: item.source_type,
          project_id: entry.project.id,
          project_name: entry.project.name,
          source_key: item.source_key,
          content: r.content,
          content_html: isMd ? mdToHtml(r.content) : r.content,
          content_format: isMd ? 'md' : 'html',
          enabled: true,
        })
      }
    }
    if (chapters.length === 0) throw new Error('无可用内容')
    await api.updateBooklet(b.id, {
      title,
      subtitle: cover.subtitle,
      author: cover.author,
      cover: buildCover(),
      chapters: normalizeChapters(chapters),
    })
    const html = await api.renderBooklet(b.id, cover.render_mode)
    if (html == null) throw new Error('合成返回空')
    return { title, html }
  }

  const handleBatchGenerate = async () => {
    const entries = selectedEntries.filter(e => e.checkedItems.length > 0)
    if (entries.length === 0) {
      toast('请先在左侧选择至少一个含内容的项目', 'error')
      setStep(1)
      return
    }
    if (!cover.titleTemplate.trim()) {
      toast('书名不能为空', 'error')
      setStep(2)
      return
    }
    const ok = await confirm(
      `将为 ${entries.length} 个项目各生成一本${BOOK_TYPE_LABEL[bookType]}，共 ${entries.length} 本，并打包成一个压缩包下载。\n\n确定开始批量合成吗？`
    )
    if (!ok) return

    setGenerating(true)
    setProgress({ done: 0, total: entries.length, failed: [] })
    const zip = new JSZip()
    const usedNames = new Set<string>()
    let okCount = 0
    const failed: string[] = []
    for (const entry of entries) {
      try {
        const { title, html } = await generateOne(entry)
        let fileName = sanitizeFileName(title)
        if (usedNames.has(fileName)) {
          let i = 2
          while (usedNames.has(`${fileName}-${i}`)) i++
          fileName = `${fileName}-${i}`
        }
        usedNames.add(fileName)
        zip.file(`${fileName}.html`, html)
        okCount++
      } catch (e: any) {
        failed.push(`${entry.project.name}: ${e?.message || e}`)
      }
      setProgress({ done: okCount + failed.length, total: entries.length, failed: [...failed] })
    }

    if (okCount === 0) {
      setGenerating(false)
      toast(`批量合成失败：${failed[0] || '没有成功生成任何一本'}`, 'error')
      return
    }

    try {
      const blob = await zip.generateAsync({ type: 'blob' })
      triggerBlobDownload(blob, `批量电子书-${okCount}本.zip`)
      toast(
        failed.length > 0 ? `已打包 ${okCount} 本，${failed.length} 本失败（${failed[0]}）` : `已打包 ${okCount} 本电子书`,
        failed.length > 0 ? 'error' : 'success'
      )
    } catch (e: any) {
      toast(`打包失败: ${e?.message || e}`, 'error')
    } finally {
      setGenerating(false)
    }
  }

  const hf = cover.page_hf || {}
  const hfEnabled = !!hf.enabled
  const renderMode = cover.render_mode

  const previewPageW = bookType === 'ppt' ? 1280 : 794
  const previewPageH = bookType === 'ppt' ? 720 : 1123
  const previewAspect = previewPageW / previewPageH
  const maxPreviewW = Math.max(0, previewW - 32)
  const maxPreviewH = Math.max(0, previewH - 32)
  let thumbW = maxPreviewW || 480
  if (maxPreviewW > 0 && maxPreviewH > 0 && maxPreviewW / previewAspect > maxPreviewH) {
    thumbW = Math.round(maxPreviewH * previewAspect)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <div className="proj-header-bar" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border)', background: 'var(--card)' }}>
        <button className="btn btn-ghost btn-sm" onClick={() => navigate(base)}>← 返回</button>
        <span style={{ fontSize: 14, fontWeight: 600 }}><SvgIcon name="book-open" size={14} /> 批量新建</span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{BOOK_TYPE_LABEL[bookType]}</span>
      </div>

      <div className="top-nav">
        {STEPS.map((s, i) => (
          <div key={s.id} style={{ display: 'flex', alignItems: 'center' }}>
            {i > 0 && <span className="tn-arrow">›</span>}
            <div className={`tn-item ${step === s.id ? 'active' : ''} ${step > s.id ? 'done' : ''}`}
              onClick={() => setStep(s.id)}>
              <span className="tn-num">{s.id}</span> {s.label}
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, padding: 14, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {step === 1 && (
          <div className="panel-grid">
            <div className="panel-left" style={{ overflow: 'hidden' }}>
              <div className="card" style={{ flex: 1, minHeight: 120, display: 'flex', flexDirection: 'column' }}>
                <div className="card-title" style={{ flexShrink: 0 }}><SvgIcon name="folder" size={14} /> 选择项目（每个项目生成一本）</div>
                <div className="card-hint" style={{ flexShrink: 0 }}>勾选项目，展开后默认全选该项目已生成的内容，可逐项取消。</div>
                <select className="form-input" value={wsId} onChange={e => { setWsId(e.target.value); setCategoryId('') }} style={{ flexShrink: 0 }}>
                  {workspaces.length === 0 && <option value="">（无可用工作区）</option>}
                  {workspaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {categories.length > 0 && (
                  <select className="form-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}
                    style={{ flexShrink: 0, marginTop: 6 }}>
                    <option value="">全部分类</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
                <div style={{ marginTop: 10, flex: 1, minHeight: 0, overflowY: 'auto' }}>
                  {loadingTree ? (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 10 }}>加载中...</div>
                  ) : projects.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 10 }}>该工作区暂无可调取的明细</div>
                  ) : projects.map((p, idx) => {
                    const entry = selection[p.id]
                    const selected = !!entry
                    const availCount = p.items.filter(i => i.available).length
                    return (
                      <div key={p.id} style={{ marginBottom: 8 }}>
                        <label style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px',
                          borderBottom: '1px solid var(--border)', cursor: 'pointer',
                        }}>
                          <input type="checkbox" checked={selected}
                            onChange={() => toggleProject(p)}
                            disabled={availCount === 0} />
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0, width: 18, textAlign: 'right', userSelect: 'none' }}>{idx + 1}</span>
                          <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <span title={p.name} style={{ fontSize: 12, fontWeight: 500 }}>{p.name}</span>
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)', marginLeft: 6 }}>
                              {[p.author, availCount > 0 ? `${availCount} 个文件` : ''].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                          {availCount === 0 && <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>无内容</span>}
                        </label>
                        {selected && p.items.length > 0 && (
                          <div style={{ padding: '2px 4px 2px 46px' }}>
                            {p.items.map(item => {
                              const checked = entry.checkedItems.some(i => i.source_type === item.source_type && i.source_key === item.source_key)
                              return (
                                <label key={item.source_type + item.source_key + item.label}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px',
                                    fontSize: 12, cursor: item.available ? 'pointer' : 'not-allowed',
                                    opacity: item.available ? 1 : 0.45,
                                  }}>
                                  <input type="checkbox" checked={checked} disabled={!item.available}
                                    onChange={() => toggleItem(p.id, item)} />
                                  <span>{item.label}</span>
                                  {!item.available && <span style={{ fontSize: 10 }}>（尚未生成）</span>}
                                </label>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div className="card-title"><SvgIcon name="book-open" size={14} /> 已选项目</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 0' }}>
                  已选 {selectedEntries.length} 个项目，共 {totalChapters} 章
                </div>
                {selectedEntries.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: 20, textAlign: 'center' }}>
                    左侧勾选项目后显示在这里
                  </div>
                ) : (
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {selectedEntries.map(e => (
                      <div key={e.project.id} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        <div style={{ fontWeight: 500 }}>{e.project.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          {e.checkedItems.length > 0 ? e.checkedItems.map(i => i.label).join('、') : '（无已生成内容，将跳过）'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="panel-grid">
            <div className="panel-left" style={{ overflowY: 'auto' }}>
              <div className="card" style={{ flexShrink: 0 }}>
                <div className="card-title"><SvgIcon name="file-text" size={14} /> 封面与署名（批量应用到所有册子）</div>
                <div className="form-group">
                  <label className="form-label">书名（变量 <code>{'{name}'}</code> = 项目名）</label>
                  <input className="form-input" value={cover.titleTemplate}
                    placeholder="例如：食品安全培训-{name}"
                    onChange={e => setCoverPatch({ titleTemplate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">副标题</label>
                  <input className="form-input" value={cover.subtitle} placeholder="选填"
                    onChange={e => setCoverPatch({ subtitle: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">署名（作者/编者）</label>
                  <input className="form-input" value={cover.author} placeholder="例如：张三"
                    onChange={e => setCoverPatch({ author: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">单位</label>
                  <input className="form-input" value={cover.org} placeholder="选填"
                    onChange={e => setCoverPatch({ org: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">日期文字</label>
                  <input className="form-input" value={cover.date_text} placeholder="留空则用合成当天日期"
                    onChange={e => setCoverPatch({ date_text: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">LOGO</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {cover.logo_url && (
                      <img src={cover.logo_url} alt="logo" style={{ height: 32, maxWidth: 90, objectFit: 'contain' }} />
                    )}
                    <button className="btn btn-ghost btn-sm" disabled={uploading} onClick={() => logoRef.current?.click()}>
                      {uploading ? '上传中...' : cover.logo_url ? '更换' : <><SvgIcon name="folder" size={14} /> 上传 LOGO</>}
                    </button>
                    {cover.logo_url && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setCoverPatch({ logo_url: '' })}>移除</button>
                    )}
                    <input ref={logoRef} type="file" accept=".png,.jpg,.jpeg,.gif,.svg,.webp" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadLogo(f); e.target.value = '' }} />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">扉页文字（封面背面的编制说明）</label>
                  <textarea className="form-input" value={cover.flyleaf_text} placeholder="选填"
                    onChange={e => setCoverPatch({ flyleaf_text: e.target.value })}
                    style={{ height: 56, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">封底文字</label>
                  <textarea className="form-input" value={cover.back_cover_text} placeholder="选填"
                    onChange={e => setCoverPatch({ back_cover_text: e.target.value })}
                    style={{ height: 56, resize: 'vertical', fontFamily: 'inherit' }} />
                </div>
              </div>

              <div className="card" style={{ flexShrink: 0 }}>
                <div className="card-title"><SvgIcon name="file-text" size={14} /> 固定页</div>
                <div className="card-hint" style={{ marginTop: 0 }}>取消勾选 = 合成时隐藏该固定页</div>
                <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
                  {FIXED_KEYS.map(f => (
                    <label key={f.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!cover.hidden_fixed.includes(f.key)}
                        onChange={e => toggleFixed(f.key, e.target.checked)} />
                      {f.label}
                    </label>
                  ))}
                </div>
              </div>

              {bookType === 'a4' && (
                <div className="card" style={{ flexShrink: 0 }}>
                  <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span><SvgIcon name="file-text" size={14} /> 正文页眉页脚</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer', fontWeight: 400 }}>
                      <input type="checkbox" checked={hfEnabled}
                        onChange={e => setPageHf({ enabled: e.target.checked })} />
                      启用
                    </label>
                  </div>
                  {hfEnabled && (
                    <>
                      <div className="form-group" style={{ marginTop: 4 }}>
                        <label className="form-label">页眉左侧</label>
                        <input className="form-input" value={hf.header_left ?? '{书名}'}
                          onChange={e => setPageHf({ header_left: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">页眉居中</label>
                        <input className="form-input" value={hf.header_center ?? ''} placeholder="选填"
                          onChange={e => setPageHf({ header_center: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">页眉右侧</label>
                        <input className="form-input" value={hf.header_right ?? '{章节}'}
                          onChange={e => setPageHf({ header_right: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">页脚左侧</label>
                        <input className="form-input" value={hf.footer_left ?? ''} placeholder="选填，如单位名称"
                          onChange={e => setPageHf({ footer_left: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">页脚居中</label>
                        <input className="form-input" value={hf.footer_center ?? ''} placeholder="选填"
                          onChange={e => setPageHf({ footer_center: e.target.value })} />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label">页脚右侧</label>
                        <input className="form-input" value={hf.footer_right ?? '{页码} / {总页数}'}
                          onChange={e => setPageHf({ footer_right: e.target.value })} />
                      </div>
                    </>
                  )}
                  {!hfEnabled && (
                    <div className="card-hint" style={{ marginTop: 6, marginBottom: 0 }}>
                      启用后可在每页正文顶部添加页眉、底部添加页脚。
                    </div>
                  )}
                </div>
              )}

              <div className="card" style={{ flexShrink: 0 }}>
                <div className="card-title"><SvgIcon name="palette" size={14} /> 主题配色</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
                  {themes.map(t => (
                    <div key={t.id} onClick={() => setCoverPatch({ theme_id: t.id, theme_colors: {} })}
                      style={{
                        padding: '6px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 11,
                        border: `2px solid ${cover.theme_id === t.id ? 'var(--primary)' : 'var(--border)'}`,
                      }}>
                      <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                        {[t.colors.primary, t.colors.accent, t.colors.bg].map((c, i) => (
                          <span key={i} style={{ width: 14, height: 14, borderRadius: 3, background: c, border: '1px solid var(--border)' }} />
                        ))}
                      </div>
                      <div>{t.name}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!cover.desk_none}
                      onChange={e => setCoverPatch({ desk_none: e.target.checked })} />
                    不要页面外背景色（合成后页面四周用白色底）
                  </label>
                </div>
              </div>
            </div>
            <div className="panel-right" style={{ overflow: 'hidden' }}>
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div className="card-title"><SvgIcon name="eye" size={14} /> 封面实时预览</div>
                <div ref={previewRef} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--bg-secondary)', borderRadius: 6, padding: 16, minHeight: 0 }}>
                  {coverError && !coverDoc ? (
                    <div style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', padding: 20 }}>
                      <div style={{ marginBottom: 8 }}><SvgIcon name="alert-triangle" size={14} /></div>
                      <div>{coverError}</div>
                    </div>
                  ) : (
                    <CoverThumb doc={coverDoc} pageW={previewPageW} pageH={previewPageH} thumbW={thumbW} />
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card" style={{ flexShrink: 0 }}>
                <div className="card-title"><SvgIcon name="package" size={14} /> 合成信息</div>
                <div style={{ fontSize: 12, lineHeight: 2.1 }}>
                  <div>类型：{bookType === 'ppt' ? <><SvgIcon name="monitor" size={14} /> PPT 合辑版（横版 16:9）</> : <><SvgIcon name="book-open" size={14} /> A4 书册版（可打印）</>}</div>
                  <div>预计产出：<strong>{selectedEntries.filter(e => e.checkedItems.length > 0).length}</strong> 本（每本一个项目）</div>
                  <div>书名模板：{cover.titleTemplate}</div>
                  <div>合成方式：{MODE_OPTIONS.find(m => m.mode === renderMode)?.label}</div>
                </div>
              </div>

              <div className="card" style={{ flexShrink: 0 }}>
                <div className="card-title">合成方式</div>
                {MODE_OPTIONS.map((opt, i) => (
                  <label key={opt.mode} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, cursor: 'pointer', marginBottom: i < MODE_OPTIONS.length - 1 ? 8 : 0 }}>
                    <input type="radio" name="bk-batch-render-mode" checked={renderMode === opt.mode}
                      onChange={() => setCoverPatch({ render_mode: opt.mode })} style={{ marginTop: 2 }} />
                    <span>
                      <strong>{opt.label}</strong>
                      <span style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {bookType === 'a4' ? opt.descA4 : opt.descPpt}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              <div className="card" style={{ flexShrink: 0 }}>
                <div className="card-title"><SvgIcon name="download" size={14} /> 批量合成</div>
                <div className="card-hint">
                  顺序为每个项目生成一本电子书，全部打包成一个压缩包一次下载。合成后草稿会保留在「我的画册」，可继续编辑。
                </div>
                <button className="btn btn-primary" style={{ width: '100%', padding: '10px 0', fontSize: 14 }}
                  disabled={generating} onClick={handleBatchGenerate}>
                  {generating ? <><SvgIcon name="clock" size={14} /> 合成中... {progress.done}/{progress.total}</> : <><SvgIcon name="download" size={14} /> 开始批量合成</>}
                </button>
                {generating && progress.total > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(progress.done / progress.total) * 100}%`, background: 'var(--primary)', transition: 'width .2s' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 6 }}>
                      已完成 {progress.done} / {progress.total}
                      {progress.failed.length > 0 && <span style={{ color: 'var(--danger, #dc2626)' }}>　失败 {progress.failed.length}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div className="card-title"><SvgIcon name="eye" size={14} /> 合成清单</div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                  {selectedEntries.map(e => {
                    const title = (cover.titleTemplate.replace(/\{name\}/g, e.project.name) || e.project.name).trim()
                    const skippable = e.checkedItems.length === 0
                    return (
                      <div key={e.project.id} style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        <div style={{ fontWeight: 500, opacity: skippable ? 0.5 : 1 }}>{title}</div>
                        <div style={{ fontSize: 10, color: skippable ? 'var(--danger, #dc2626)' : 'var(--text-secondary)' }}>
                          {skippable ? '无已生成内容，将跳过' : `${e.checkedItems.length} 章 · ${e.checkedItems.map(i => i.label).join('、')}`}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, padding: '8px 14px', borderTop: '1px solid var(--border)', background: 'var(--card)' }}>
        <button className="btn btn-ghost btn-sm" disabled={step === 1} onClick={() => setStep(step - 1)}>← 上一步</button>
        <span style={{ flex: 1 }} />
        {step < STEPS.length && (
          <button className="btn btn-primary btn-sm" onClick={() => setStep(step + 1)}>下一步 →</button>
        )}
      </div>
    </div>
  )
}
