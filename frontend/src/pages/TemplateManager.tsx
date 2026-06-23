import { useState, useEffect, useCallback, useRef } from 'react'
import { api, Prompt, LLMProvider } from '../services/api'
import { useModal } from '../components/ModalProvider'

// ---------- types ----------

interface Template {
  id: string
  name: string
  type: string
  file_path: string
  prompt: string
  skill: string
  rules: string
  thumbnail_path: string
  linked_skill_id: string
  branding_config: string
  is_default: number
  created_at: string
}

const TEMPLATE_TABS = [
  { key: 'col4', label: '道与术 PPT', type: 'ppt', matchId: 'default-dao' },
  { key: 'col5', label: '研学 PPT', type: 'ppt', matchId: 'default-yanxi' },
  { key: 'col3', label: '标准 SOP', type: 'sop', matchId: '' },
]

// ---------- helpers ----------

function getThumbnailUrl(t: Template): string {
  if (!t.thumbnail_path) return ''
  const filename = t.thumbnail_path.split(/[\\/]/).pop() || ''
  if (!filename) return ''
  return `/api/thumbnails/${encodeURIComponent(filename)}`
}

// ---------- inline styles ----------

const inputField: React.CSSProperties = {
  width: '100%',
  height: '32px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '0 8px',
  fontSize: '11px',
  fontFamily: 'inherit',
  color: 'var(--text)',
  background: 'var(--card)',
  outline: 'none',
  boxSizing: 'border-box',
}

const textareaStyle: React.CSSProperties = {
  width: '100%',
  height: '100px',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '10px',
  fontSize: '11px',
  fontFamily: 'inherit',
  color: 'var(--text)',
  background: 'var(--card)',
  outline: 'none',
  resize: 'vertical',
  boxSizing: 'border-box',
  lineHeight: 1.5,
}

const modalCard: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '16px',
}

const labelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--text)',
  display: 'block',
  marginBottom: '6px',
}

// ---------- component ----------

function TemplateManager() {
  const modal = useModal()

  // ---------- state ----------
  const [templates, setTemplates] = useState<Template[]>([])
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [activeTab, setActiveTab] = useState('col4')
  const [loading, setLoading] = useState(true)

  // modal drag & resize
  const [modalPos, setModalPos] = useState({ x: 0, y: 0 })
  const [modalSize, setModalSize] = useState({ w: 0, h: 0 })
  const [dragging, setDragging] = useState<{ startX: number; startY: number; posX: number; posY: number } | null>(null)
  const [resizing, setResizing] = useState<{ startX: number; startY: number; startW: number; startH: number } | null>(null)
  const dragPosRef = useRef({ x: 0, y: 0 })
  const modalRef = useRef<HTMLDivElement | null>(null)


  // drag effect — uses useEffect cleanup to guarantee listener removal
  useEffect(() => {
    if (!dragging) return
    const onMove = (ev: MouseEvent) => {
      const x = Math.max(-200, dragging.posX + ev.clientX - dragging.startX)
      const y = Math.max(-200, dragging.posY + ev.clientY - dragging.startY)
      dragPosRef.current = { x, y }
      setModalPos({ x, y })
    }
    const onUp = () => setDragging(null)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  // resize effect
  useEffect(() => {
    if (!resizing) return
    const onMove = (ev: MouseEvent) => {
      setModalSize({
        w: Math.max(380, resizing.startW + ev.clientX - resizing.startX),
        h: Math.max(300, resizing.startH + ev.clientY - resizing.startY),
      })
    }
    const onUp = () => setResizing(null)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [resizing])

  // create / edit modal
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formType, setFormType] = useState('ppt')
  const [formPrompt, setFormPrompt] = useState('')
  const [formSkill, setFormSkill] = useState('')
  const [formRules, setFormRules] = useState('{}')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  // analyze
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [llmProviders, setLlmProviders] = useState<LLMProvider[]>([])
  const [analyzeProvider, setAnalyzeProvider] = useState('')
  const [analyzeModel, setAnalyzeModel] = useState('')
  const [slidePreview, setSlidePreview] = useState<{ slides: string[]; templateName: string } | null>(null)
  const [slideLoading, setSlideLoading] = useState(false)
  const [slideIndex, setSlideIndex] = useState(0)
  const [autoThumbnails, setAutoThumbnails] = useState<Record<string, string>>({})

  // ---------- slide preview ----------

  const openSlidePreview = async (t: Template) => {
    if (!t.file_path) return
    setSlidePreview({ slides: [], templateName: t.name })
    setSlideIndex(0)
    setSlideLoading(true)
    try {
      const slides = await api.previewSlides(t.id)
      setSlidePreview({ slides, templateName: t.name })
    } catch (err: any) {
      console.error('Slide preview failed:', err)
      setSlidePreview(null)
    } finally {
      setSlideLoading(false)
    }
  }

  const closeSlidePreview = () => {
    setSlidePreview(null)
    setSlideIndex(0)
  }

  // Keyboard nav for slide preview
  useEffect(() => {
    if (!slidePreview) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setSlideIndex(i => Math.max(0, i - 1))
      else if (e.key === 'ArrowRight') setSlideIndex(i => Math.min(slidePreview.slides.length - 1, i + 1))
      else if (e.key === 'Escape') closeSlidePreview()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [slidePreview])

  // ---------- data loading ----------

  const loadProviders = useCallback(async () => {
    try {
      const providers = await api.listProviders()
      setLlmProviders(providers || [])
    } catch (err: any) {
      console.error('Failed to load LLM providers:', err)
    }
  }, [])

  const loadTemplates = useCallback(async () => {
    try {
      const data = await api.listTemplates()
      setTemplates(data)
      // Auto-fetch slide thumbnails for PPT templates without uploaded thumbnails
      const pptWithoutThumb = data.filter((t: Template) => t.type === 'ppt' && t.file_path && !t.thumbnail_path)
      if (pptWithoutThumb.length > 0) {
        const thumbs: Record<string, string> = {}
        await Promise.all(pptWithoutThumb.map(async (t: Template) => {
          try {
            const slides = await api.previewSlides(t.id)
            if (slides && slides.length > 0) thumbs[t.id] = slides[0]
          } catch { /* ignore */ }
        }))
        setAutoThumbnails(thumbs)
      }
    } catch (err: any) {
      console.error('Failed to load templates:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadPrompts = useCallback(async () => {
    try {
      const data = await api.listPrompts()
      setPrompts(data)
    } catch (err: any) {
      console.error('Failed to load prompts:', err)
    }
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])
  useEffect(() => { loadPrompts() }, [loadPrompts])
  useEffect(() => { loadProviders() }, [loadProviders])

  // ---------- derived ----------

  const activeTabDef = TEMPLATE_TABS.find(t => t.key === activeTab) || TEMPLATE_TABS[0]

  const activeTemplates = templates.filter(t => {
    if (activeTabDef.matchId) {
      return t.id === activeTabDef.matchId
    }
    return t.type === activeTabDef.type
  })

  const getSkillName = (skillId: string): string => {
    if (!skillId) return ''
    const p = prompts.find(pp => pp.id === skillId)
    return p ? p.name : skillId
  }

  const enabledProviders = llmProviders.filter(p => p.is_enabled)

  // ---------- modal handlers ----------

  const resetModalGeometry = () => {
    dragPosRef.current = { x: 0, y: 0 }
    setModalPos({ x: 0, y: 0 })
    setModalSize({ w: 0, h: 0 })
    setDragging(null)
    setResizing(null)
  }

  const openCreate = () => {
    setEditingId(null)
    setFormName('')
    setFormType(activeTabDef.type)
    setFormPrompt('')
    setFormSkill('')
    setFormRules('{}')
    setFormError('')
    resetModalGeometry()
    setShowModal(true)
  }

  const openEdit = (t: Template) => {
    setEditingId(t.id)
    setFormName(t.name)
    setFormType(t.type)
    setFormPrompt(t.prompt || '')
    setFormSkill(t.skill || '')
    setFormRules(t.rules || '{}')
    setFormError('')
    resetModalGeometry()
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    resetModalGeometry()
  }

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragging({
      startX: e.clientX,
      startY: e.clientY,
      posX: dragPosRef.current.x,
      posY: dragPosRef.current.y,
    })
  }

  const onResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = modalRef.current?.getBoundingClientRect()
    const baseW = modalSize.w || (rect ? rect.width : 720)
    const baseH = modalSize.h || (rect ? rect.height : 560)
    setResizing({
      startX: e.clientX,
      startY: e.clientY,
      startW: baseW,
      startH: baseH,
    })
  }

  const handleSave = async () => {
    if (!formName.trim()) {
      setFormError('请输入模板名称')
      return
    }
    setFormError('')
    setSaving(true)
    try {
      if (editingId) {
        await api.updateTemplate(editingId, {
          name: formName.trim(),
          type: formType,
          prompt: formPrompt,
          skill: formSkill,
          rules: formRules,
        })
        modal.toast('模板已更新', 'success')
      } else {
        await api.createTemplate({
          name: formName.trim(),
          type: formType,
          prompt: formPrompt,
          skill: formSkill,
          rules: formRules,
        })
        modal.toast('模板已创建', 'success')
      }
      closeModal()
      loadTemplates()
    } catch (err: any) {
      modal.toast('保存失败: ' + err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (t: Template) => {
    const ok = await modal.confirm(`删除模板「${t.name}」？此操作不可撤销。`)
    if (!ok) return
    try {
      await api.deleteTemplate(t.id)
      modal.toast('已删除', 'success')
      loadTemplates()
    } catch (err: any) {
      modal.toast('删除失败: ' + err.message, 'error')
    }
  }

  const handleSetDefault = async (t: Template) => {
    try {
      await api.setDefaultTemplate(t.id)
      modal.toast('已设为默认', 'success')
      loadTemplates()
    } catch (err: any) {
      modal.toast('设置失败: ' + err.message, 'error')
    }
  }

  const handleFileUpload = async (t: Template, file: File) => {
    try {
      const result = await api.uploadTemplateFile(t.id, file)
      modal.toast('文件已上传' + (result.file_path ? ` → ${result.filename}` : ''), 'success')
      loadTemplates()
    } catch (err: any) {
      modal.toast('上传失败: ' + err.message, 'error')
    }
  }

  const handleThumbnailUpload = async (t: Template, file: File) => {
    try {
      await api.uploadTemplateThumbnail(t.id, file)
      modal.toast('缩略图已上传', 'success')
      loadTemplates()
    } catch (err: any) {
      modal.toast('缩略图上传失败: ' + err.message, 'error')
    }
  }

  const handleResetThumbnail = async (t: Template) => {
    try {
      await api.resetTemplateThumbnail(t.id)
      modal.toast('已恢复默认缩略图', 'success')
      loadTemplates()
    } catch (err: any) {
      modal.toast('恢复失败: ' + err.message, 'error')
    }
  }

  const handleAnalyze = async (t: Template) => {
    if (!t.file_path) {
      modal.toast('请先上传 PPTX 模板文件', 'error')
      return
    }
    const stageType = t.id.includes('yanxi') ? 'yanxiPpt' : 'daoPpt'
    setAnalyzingId(t.id)
    try {
      const result = await api.analyzeTemplate(t.id, stageType, analyzeProvider, analyzeModel)
      const prompt = result.prompt || ''
      const skill = result.skill || ''
      if (prompt) {
        await api.updateTemplate(t.id, {
          name: t.name,
          type: t.type,
          prompt,
          skill,
        })
        modal.toast('智能解析完成，prompt + SKILL 已更新', 'success')
      } else {
        modal.toast('解析完成，但未返回 prompt。请重试或检查 LLM 配置。', 'error')
      }
      loadTemplates()
    } catch (err: any) {
      modal.toast('解析失败: ' + err.message, 'error')
    } finally {
      setAnalyzingId(null)
    }
  }

  // ---------- render ----------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* ====== mgmt-tabs bar ====== */}
      <div className="mgmt-tabs">
        {TEMPLATE_TABS.map(tab => (
          <button
            key={tab.key}
            className={`mgmt-tab${activeTab === tab.key ? ' active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ====== Content ====== */}
      <div className="mgmt-content">
        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '40px 0' }}>
            加载中...
          </p>
        ) : (
          <>
            {/* Toolbar: new button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={openCreate}>
                + 新建模板
              </button>
            </div>

            {/* Cards or empty */}
            {activeTemplates.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                <p style={{ marginBottom: '16px' }}>暂无{activeTabDef.label}模板</p>
                <button className="btn btn-primary" onClick={openCreate}>+ 新建模板</button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px' }}>
                {activeTemplates.map(t => {
                  const thumbUrl = getThumbnailUrl(t)
                  const autoUrl = autoThumbnails[t.id] ? api.slideUrl(autoThumbnails[t.id]) : ''
                  const displayUrl = thumbUrl || autoUrl
                  const hasThumb = !!displayUrl
                  const fileName = t.file_path ? (t.file_path.split(/[\\/]/).pop() || t.file_path) : ''

                  return (
                    <div key={t.id}>
                      {/* ====== Card ====== */}
                      <div
                        className="card"
                        style={{
                          padding: 0,
                          overflow: 'hidden',
                        }}
                      >
                        {/* Thumbnail area — 16:9 to match PPT slide ratio */}
                        <div style={{
                          aspectRatio: '16 / 9',
                          background: '#1a1a1a',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          position: 'relative',
                          overflow: 'hidden',
                        }}>
                          {displayUrl ? (
                            <img
                              src={displayUrl}
                              alt={t.name}
                              style={{ width: '100%', height: '100%', objectFit: 'contain', transform: 'scale(0.9)' }}
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          ) : null}
                          <div style={{
                            position: 'absolute',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '6px',
                            color: 'var(--text-secondary)',
                            opacity: hasThumb ? 0 : 1,
                          }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}>
                              <rect x="2" y="2" width="20" height="20" rx="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <path d="M21 15l-5-5L5 21" />
                            </svg>
                            <span style={{ fontSize: '11px' }}>
                              {t.type === 'ppt' ? 'PPT 预览' : 'SOP 预览'}
                            </span>
                            <span style={{ fontSize: '9px', opacity: 0.5 }}>建议 320×240</span>
                          </div>
                        </div>

                        {/* Card info bar */}
                        <div style={{ padding: '8px 10px' }}>
                          <h4 style={{
                            fontSize: '11px', fontWeight: 600, color: 'var(--text)', margin: 0,
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {t.name}
                          </h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6 }}>
                            <span style={{
                              fontSize: '10px', fontWeight: 600, flexShrink: 0,
                              color: t.type === 'ppt' ? 'var(--primary)' : 'var(--color-accent)',
                              background: t.type === 'ppt' ? 'rgba(139, 26, 26, 0.08)' : 'rgba(212, 165, 116, 0.15)',
                              padding: '1px 6px', borderRadius: '3px',
                            }}>
                              {t.type === 'ppt' ? 'PPT' : 'SOP'}
                            </span>
                            {t.is_default === 1 && (
                              <span style={{
                                fontSize: '10px', fontWeight: 600, flexShrink: 0,
                                color: 'var(--success)',
                                background: 'rgba(74, 139, 63, 0.1)',
                                padding: '1px 6px', borderRadius: '3px',
                              }}>
                                默认
                              </span>
                            )}
                            {fileName && (
                              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', flexShrink: 0 }}
                                title={fileName}>📄</span>
                            )}
                            {fileName && (
                              <span onClick={(e) => { e.preventDefault(); openSlidePreview(t); }}
                                style={{ fontSize: '10px', color: 'var(--text-secondary)', cursor: 'pointer',
                                  flexShrink: 0, lineHeight: 1,
                                }}>
                                预览
                              </span>
                            )}
                            {/* Thumbnail controls on card */}
                            {thumbUrl && (
                              <img src={thumbUrl} alt="thumb" style={{
                                width: '22px', height: '16px', objectFit: 'cover',
                                borderRadius: '2px', border: '1px solid var(--border)', flexShrink: 0,
                              }} />
                            )}
                            <label style={{
                              fontSize: '10px', color: 'var(--text-secondary)', cursor: 'pointer',
                              flexShrink: 0, lineHeight: 1,
                            }} title="建议 320×240">
                              {thumbUrl ? '更换' : '缩略图'}
                              <input type="file" accept="image/*" style={{ display: 'none' }}
                                onChange={e => {
                                  const f = e.target.files?.[0]
                                  if (f) handleThumbnailUpload(t, f)
                                  e.target.value = ''
                                }}
                              />
                            </label>
                            {thumbUrl && (
                              <span style={{
                                fontSize: '10px', color: 'var(--text-secondary)', cursor: 'pointer',
                                flexShrink: 0, lineHeight: 1,
                              }}
                                onClick={() => handleResetThumbnail(t)}>
                                默认
                              </span>
                            )}
                            <div style={{ flex: 1 }} />
                            <span style={{
                              fontSize: '10px', color: 'var(--text-secondary)', cursor: 'pointer',
                              flexShrink: 0, lineHeight: 1,
                            }} title="编辑模板"
                              onClick={() => openEdit(t)}>
                              编辑
                            </span>
                            {t.is_default !== 1 && (
                              <span style={{
                                fontSize: '10px', color: 'var(--warning)', cursor: 'pointer',
                                flexShrink: 0, lineHeight: 1,
                              }} title="删除模板"
                                onClick={() => handleDelete(t)}>
                                删除
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ====== Create / Edit Modal ====== */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onMouseDown={e => { if (e.target === e.currentTarget) closeModal() }}>
          <div ref={modalRef} style={{
            ...modalCard,
            width: modalSize.w ? modalSize.w : '720px',
            height: modalSize.h ? modalSize.h : 'auto',
            maxWidth: '95vw',
            maxHeight: '95vh',
            minWidth: '380px',
            minHeight: '300px',
            padding: '24px',
            position: 'relative',
            overflow: 'auto',
            transform: `translate(${modalPos.x}px, ${modalPos.y}px)`,
          }} onClick={e => e.stopPropagation()}>
            {/* Draggable title bar */}
            <div style={{
              cursor: 'move', userSelect: 'none',
              marginBottom: '20px',
            }} onMouseDown={onDragStart}>
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0 }}>
                {editingId ? '编辑模板' : '新建模板'}
              </h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* File upload row (edit mode only) */}
              {editingId && (() => {
                const editingTpl = templates.find(tp => tp.id === editingId)
                const efName = editingTpl?.file_path ? (editingTpl.file_path.split(/[\\/]/).pop() || editingTpl.file_path) : ''
                return (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                    padding: '10px 12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
                  }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '180px' }}
                      title={efName || '未上传'}>
                      {efName ? '📌 ' + efName : '📄 未上传模板文件'}
                    </span>
                    <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                      {efName ? '更换' : '上传 PPTX'}
                      <input type="file" accept=".pptx" style={{ display: 'none' }}
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f && editingId) handleFileUpload(editingTpl!, f)
                          e.target.value = ''
                        }}
                      />
                    </label>
                    {efName && (
                      <button className="btn btn-primary btn-sm"
                        onClick={() => editingTpl && handleAnalyze(editingTpl)}
                        disabled={analyzingId === editingId}>
                        {analyzingId === editingId ? '解析中...' : '智能解析'}
                      </button>
                    )}
                  </div>
                )
              })()}
              {/* Row 1: Model + Name */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>模型选择</label>
                  <select
                    style={{ ...inputField, cursor: 'pointer' }}
                    value={analyzeProvider ? `${analyzeProvider}:${analyzeModel}` : ''}
                    disabled={enabledProviders.length === 0}
                    onChange={e => {
                      const val = e.target.value
                      if (val) {
                        const [pid, mdl] = val.split(':')
                        setAnalyzeProvider(pid)
                        setAnalyzeModel(mdl)
                      } else {
                        setAnalyzeProvider('')
                        setAnalyzeModel('')
                      }
                    }}
                  >
                    <option value="">默认模型</option>
                    {enabledProviders.map(p =>
                      (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                        <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                      ))
                    )}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>名称</label>
                  <input
                    style={inputField}
                    placeholder="输入模板名称"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                    autoFocus
                  />
                </div>
              </div>

              {/* Prompt + Skill */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={labelStyle}>提示词 (Prompt)</label>
                  <textarea
                    value={formPrompt}
                    onChange={e => setFormPrompt(e.target.value)}
                    placeholder="由智能解析自动生成"
                    style={{ ...textareaStyle, height: '100px' }}
                  />
                </div>
                <div>
                  <label style={labelStyle}>输出格式 (SKILL)</label>
                  <textarea
                    value={formSkill}
                    onChange={e => setFormSkill(e.target.value)}
                    placeholder="由智能解析自动生成"
                    style={{ ...textareaStyle, height: '100px' }}
                  />
                </div>
              </div>

              {/* Rules */}
              <div>
                <label style={labelStyle}>设计规则 (Rules JSON)</label>
                <textarea
                  value={formRules}
                  onChange={e => setFormRules(e.target.value)}
                  placeholder='{}'
                  style={{ ...textareaStyle, height: '60px' }}
                />
              </div>
            </div>

            {formError && (
              <p style={{ color: 'var(--warning)', fontSize: '13px', marginTop: '12px' }}>{formError}</p>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="btn btn-ghost btn-sm" onClick={closeModal} disabled={saving}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
            </div>

            {/* Resize handle */}
            <div
              style={{
                position: 'absolute', bottom: 0, right: 0,
                width: '20px', height: '20px', cursor: 'nwse-resize',
                background: 'linear-gradient(135deg, transparent 50%, var(--border) 50%)',
                borderRadius: '0 0 var(--radius) 0',
              }}
              onMouseDown={onResizeStart}
            />
          </div>
        </div>
      )}

      {/* Slide preview modal */}
      {slidePreview && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 10001,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'fadeIn 0.15s ease',
        }} onClick={closeSlidePreview}>
          <div style={{
            background: 'var(--card)',
            borderRadius: '10px',
            width: '85vw', maxWidth: '780px',
            height: '75vh', maxHeight: '540px',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 16px 60px rgba(0,0,0,0.35)',
            overflow: 'hidden',
          }} onClick={e => e.stopPropagation()}>
            {/* Top bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 18px', borderBottom: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>
                {slidePreview.templateName}
                <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 10 }}>
                  {slidePreview.slides.length > 0 ? `${slideIndex + 1} / ${slidePreview.slides.length}` : '加载中...'}
                </span>
              </span>
              <span onClick={closeSlidePreview} style={{
                cursor: 'pointer', fontSize: '18px', lineHeight: 1, color: 'var(--text-secondary)',
                padding: '4px 8px', borderRadius: '4px',
              }}>✕</span>
            </div>

            {/* Main slide area */}
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'relative', minHeight: 0, padding: '12px 56px',
              background: 'var(--bg)',
            }}>
              {slideLoading ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>正在导出幻灯片...</div>
              ) : slidePreview.slides.length === 0 ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>无幻灯片</div>
              ) : (
                <>
                  <button onClick={() => setSlideIndex(i => Math.max(0, i - 1))}
                    disabled={slideIndex === 0}
                    style={{
                      position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                      background: slideIndex === 0 ? 'transparent' : 'var(--bg-hover)',
                      border: '1px solid var(--border)', borderRadius: '50%', width: 38, height: 38,
                      cursor: slideIndex === 0 ? 'default' : 'pointer',
                      color: slideIndex === 0 ? 'var(--text-secondary)' : 'var(--text)', fontSize: '20px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: slideIndex === 0 ? 0.3 : 1,
                    }}>
                    ‹
                  </button>
                  <img
                    src={api.slideUrl(slidePreview.slides[slideIndex])}
                    alt={`Slide ${slideIndex + 1}`}
                    style={{
                      maxWidth: '100%', maxHeight: '100%',
                      objectFit: 'contain',
                      borderRadius: '4px',
                      boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
                    }}
                  />
                  <button onClick={() => setSlideIndex(i => Math.min(slidePreview.slides.length - 1, i + 1))}
                    disabled={slideIndex === slidePreview.slides.length - 1}
                    style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      background: slideIndex === slidePreview.slides.length - 1 ? 'transparent' : 'var(--bg-hover)',
                      border: '1px solid var(--border)', borderRadius: '50%', width: 38, height: 38,
                      cursor: slideIndex === slidePreview.slides.length - 1 ? 'default' : 'pointer',
                      color: slideIndex === slidePreview.slides.length - 1 ? 'var(--text-secondary)' : 'var(--text)', fontSize: '20px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: slideIndex === slidePreview.slides.length - 1 ? 0.3 : 1,
                    }}>
                    ›
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail strip */}
            {!slideLoading && slidePreview.slides.length > 0 && (
              <div style={{
                flexShrink: 0, padding: '10px 16px',
                display: 'flex', gap: '8px', justifyContent: 'center',
                overflowX: 'auto', borderTop: '1px solid var(--border)',
              }}>
                {slidePreview.slides.map((s, i) => (
                  <div key={s} onClick={() => setSlideIndex(i)}
                    style={{
                      width: '72px', height: '41px', flexShrink: 0,
                      cursor: 'pointer', overflow: 'hidden',
                      borderRadius: '3px',
                      border: i === slideIndex ? '2px solid var(--primary)' : '2px solid transparent',
                      opacity: i === slideIndex ? 1 : 0.5,
                      transition: 'opacity 0.15s, border 0.15s',
                    }}>
                    <img src={api.slideUrl(s)} alt={`缩略图 ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default TemplateManager
