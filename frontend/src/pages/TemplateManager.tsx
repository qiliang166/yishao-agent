import { useState, useEffect, useCallback, useRef } from 'react'
import { api, LLMProvider } from '../services/api'
import { useModal } from '../components/ModalProvider'
import SlideOutlineEditor from '../components/SlideOutlineEditor'

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
  slide_plan: string
  typography_profile: string
}

interface PresetInfo {
  name: string
  style_family: string
  css_vars: Record<string, string>
  colors: { accent: string; ink: string; paper: string }
}

interface StyleCardData {
  id: string
  name: string
  styleFamily: string
  colors: { primary: string; accent: string; background: string; ink: string; paper: string }
  hasOutline: boolean
  outlineCount: number
  fileName: string
  isDefault: boolean
  locked: boolean
  template: Template
}

const FAMILY_LABELS: Record<string, string> = { magazine: '杂志风', swiss: '瑞士风', preset: '预设', '' : '自定义' }
const FAMILY_COLORS: Record<string, string> = { magazine: '#8b5e3c', swiss: '#002FA7', preset: '#666', '' : 'var(--text-secondary)' }

// ---------- component ----------

function TemplateManager() {
  const modal = useModal()

  // ---------- state ----------
  const [templates, setTemplates] = useState<Template[]>([])
  const [llmProviders, setLlmProviders] = useState<LLMProvider[]>([])
  const [loading, setLoading] = useState(true)
  const [familyFilter, setFamilyFilter] = useState<string>('all')

  // modal state
  const [showModal, setShowModal] = useState(false)
  const [modalTab, setModalTab] = useState<'preset' | 'upload'>('preset')
  const [presets, setPresets] = useState<PresetInfo[]>([])
  const [selectedPreset, setSelectedPreset] = useState<PresetInfo | null>(null)
  const [formName, setFormName] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadFileName, setUploadFileName] = useState('')
  const uploadFileRef = useRef<File | null>(null)

  // action states
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const [planningId, setPlanningId] = useState<string | null>(null)
  const [pptModel, setPptModel] = useState(() => {
    try { return localStorage.getItem('tm_ppt_model') || '' } catch { return '' }
  })
  const [autoThumbnails, setAutoThumbnails] = useState<Record<string, string>>({})

  // outline editor state
  const [outlineCard, setOutlineCard] = useState<{ id: string; name: string; slidePlan: any[]; template: Template } | null>(null)

  // ---------- loading ----------

  const loadTemplates = useCallback(async () => {
    try {
      const data = await api.listTemplates()
      setTemplates(data || [])
      const pptWithoutThumb = (data || []).filter((t: Template) => t.type === 'ppt' && t.file_path && !t.thumbnail_path)
      if (pptWithoutThumb.length > 0) {
        const thumbs: Record<string, string> = {}
        pptWithoutThumb.forEach((t: Template) => { thumbs[t.id] = t.id })
        setAutoThumbnails(thumbs)
      }
    } finally { setLoading(false) }
  }, [])

  const loadProviders = useCallback(async () => {
    try { setLlmProviders(await api.listProviders() || []) } catch {}
  }, [])

  const loadPresets = useCallback(async () => {
    try { setPresets(await api.listAvailablePresets() || []) } catch {}
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])
  useEffect(() => { loadProviders() }, [loadProviders])
  useEffect(() => { loadPresets() }, [loadPresets])
  useEffect(() => { try { localStorage.setItem('tm_ppt_model', pptModel) } catch {} }, [pptModel])

  // ---------- parse style card from template ----------

  const parseStyleCard = (t: Template): StyleCardData => {
    let rules: any = {}
    try { rules = JSON.parse(t.rules || '{}') } catch {}
    const dr = rules.design_rules || {}
    const colors = dr.colors || {}
    const sf = dr.style_family || ''
    let slidePlan: any[] = []
    try { slidePlan = JSON.parse(t.slide_plan || '[]') } catch {}

    return {
      id: t.id,
      name: t.name,
      styleFamily: sf,
      colors: {
        primary: colors.primary || colors.accent || '#333',
        accent: colors.accent || colors.primary || '#666',
        background: colors.background || colors.paper || '#fff',
        ink: colors.ink || '#333',
        paper: colors.paper || colors.background || '#f5f5f5',
      },
      hasOutline: slidePlan.length > 0,
      outlineCount: slidePlan.length,
      fileName: t.file_path ? (t.file_path.split(/[\\/]/).pop() || t.file_path) : '',
      isDefault: t.is_default === 1,
      locked: rules.hasOwnProperty('locked') ? rules.locked === true : !t.file_path,
      template: t,
    }
  }

  // ---------- derived ----------

  const allCards = templates.map(parseStyleCard)
  const filteredCards = familyFilter === 'all'
    ? allCards
    : allCards.filter(c => c.styleFamily === familyFilter)

  const families = [...new Set(allCards.map(c => c.styleFamily))]
  const enabledProviders = llmProviders.filter(p => p.is_enabled)

  // ---------- handlers ----------

  const openCreateModal = () => {
    setModalTab('preset')
    setSelectedPreset(null)
    setFormName('')
    setFormError('')
    setUploadFileName('')
    uploadFileRef.current = null
    setShowModal(true)
  }

  const handleCreateFromPreset = async () => {
    if (!selectedPreset) {
      setFormError('请选择一套主题色')
      return
    }
    if (!formName.trim()) {
      setFormError('请输入风格名称')
      return
    }
    setFormError('')
    setSaving(true)
    try {
      const cssVars = selectedPreset.css_vars
      const colors: Record<string, string> = {
        primary: cssVars.accent || cssVars.ink || '#333',
        accent: cssVars.accent || cssVars.ink || '#333',
        ink: cssVars.ink || '#0a0a0a',
        paper: cssVars.paper || '#fafaf8',
        background: cssVars.paper || '#fafaf8',
      }
      if (cssVars.accent_on) colors.accent_on = cssVars.accent_on
      if (cssVars.accent_rgb) colors.accent_rgb = cssVars.accent_rgb
      if (cssVars.ink_rgb) colors.ink_rgb = cssVars.ink_rgb
      if (cssVars.paper_rgb) colors.paper_rgb = cssVars.paper_rgb

      await api.createPresetTemplate({
        name: formName.trim(),
        style_family: '',
        colors,
        fonts: { title: '微软雅黑', body: '微软雅黑', title_size: '36pt', body_size: '18pt' },
      })
      modal.toast('风格已创建', 'success')
      setShowModal(false)
      loadTemplates()
    } catch (e: any) {
      setFormError(e.message || '创建失败')
    } finally { setSaving(false) }
  }

  const handleCreateFromUpload = async () => {
    if (!uploadFileRef.current) {
      setFormError('请选择 PPTX 文件')
      return
    }
    if (!formName.trim()) {
      setFormError('请输入风格名称')
      return
    }
    setFormError('')
    setSaving(true)
    try {
      const created: any = await api.createTemplate({
        name: formName.trim(),
        type: 'ppt',
        prompt: '',
        skill: '',
        rules: '{}',
      })
      const newId = created.id
      if (!newId) { modal.toast('创建失败', 'error'); return }

      await api.uploadTemplateFile(newId, uploadFileRef.current)
      // Auto-analyze to extract colors/fonts
      setSaving(false)
      setShowModal(false)
      setAnalyzingId(newId)
      try {
        const [pid2, model2] = pptModel ? pptModel.split(':') : ['', '']
        await api.analyzeTemplate(newId, 'daoPpt', pid2, model2)
        modal.toast('风格已创建并完成色彩提取', 'success')
      } catch {
        modal.toast('风格已创建，但色彩提取失败', 'error')
      }
      setAnalyzingId(null)
      loadTemplates()
    } catch (e: any) {
      setFormError(e.message || '创建失败')
      setSaving(false)
    }
  }

  const handleAnalyze = async (t: Template) => {
    if (!t.file_path) { modal.toast('请先上传 PPTX 文件', 'error'); return }
    setAnalyzingId(t.id)
    try {
      const [pid, model] = pptModel ? pptModel.split(':') : ['', '']
      await api.analyzeTemplate(t.id, 'daoPpt', pid, model)
      modal.toast('色彩与字体已提取', 'success')
      loadTemplates()
    } catch (e: any) {
      modal.toast('提取失败: ' + e.message, 'error')
    } finally { setAnalyzingId(null) }
  }

  const handleGenerateOutline = async (card: StyleCardData) => {
    setPlanningId(card.id)
    try {
      const [pid, model] = pptModel ? pptModel.split(':') : ['', '']

      const result: any = await api.generateTemplatePlan(
        card.id, '', pid, model, 'col4')
      if (result?.ok) {
        modal.toast(`大纲已生成 (${result.count || 0} 页)`, 'success')
      } else {
        modal.toast('大纲生成失败', 'error')
      }
      loadTemplates()
    } catch (e: any) {
      modal.toast('生成失败: ' + e.message, 'error')
    } finally { setPlanningId(null) }
  }

  const handleDelete = async (t: Template) => {
    const ok = await modal.confirm(`删除风格「${t.name}」？此操作不可撤销。`)
    if (!ok) return
    try {
      await api.deleteTemplate(t.id)
      modal.toast('已删除', 'success')
      loadTemplates()
    } catch (e: any) {
      modal.toast('删除失败: ' + e.message, 'error')
    }
  }

  const handleSetDefault = async (t: Template) => {
    try {
      await api.setDefaultTemplate(t.id)
      modal.toast('已设为默认', 'success')
      loadTemplates()
    } catch (e: any) { modal.toast('设置失败: ' + e.message, 'error') }
  }

  const toggleLock = async (t: Template) => {
    let rules: any = {}
    try { rules = JSON.parse(t.rules || '{}') } catch {}
    const newLocked = !rules.locked
    rules.locked = newLocked
    try {
      await api.updateTemplate(t.id, {
        name: t.name, type: t.type, rules: JSON.stringify(rules),
      })
      modal.toast(newLocked ? '已锁定' : '已解锁', 'success')
      loadTemplates()
    } catch (e: any) { modal.toast('操作失败: ' + e.message, 'error') }
  }

  // ---------- outline editor ----------

  const openOutlineEditor = (card: StyleCardData) => {
    let plan: any[] = []
    try { plan = JSON.parse(card.template.slide_plan || '[]') } catch {}
    setOutlineCard({
      id: card.id,
      name: card.name,
      slidePlan: JSON.parse(JSON.stringify(plan)),
      template: card.template,
    })
  }

  const handleSaveOutline = async (updatedPlan: any[]) => {
    if (!outlineCard) return
    try {
      await api.updateTemplateSlidePlan(outlineCard.id, updatedPlan)
      modal.toast('大纲已保存', 'success')
      setOutlineCard(null)
      loadTemplates()
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    }
  }

  // ---------- render helpers ----------

  const renderColorSwatch = (card: StyleCardData) => {
    const c = card.colors
    const swatches = [
      { color: c.accent || c.primary, label: '主色' },
      { color: c.ink, label: '字色' },
      { color: c.paper || c.background, label: '底色' },
    ].filter(s => s.color)
    return (
      <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
        {swatches.map((sw, i) => (
          <div key={i} style={{
            width: 18, height: 18, borderRadius: 3,
            background: sw.color,
            border: sw.color.toLowerCase() === '#ffffff' || sw.color.toLowerCase() === '#fafaf8'
              ? '1px solid #ddd' : '1px solid transparent',
          }} title={sw.label} />
        ))}
      </div>
    )
  }

  // ---------- render ----------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', alignItems: 'stretch', margin: '12px 0 -1px 0' }}>
        <div className="mgmt-tabs" style={{ flex: 1, padding: '0 0 0 0' }}>
          {['all', ...families].map(f => (
            <button key={f}
              className={`mgmt-tab${familyFilter === f ? ' active' : ''}`}
              onClick={() => setFamilyFilter(f)}
            >
              {f === 'all' ? '全部' : (FAMILY_LABELS[f] || f)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: 'var(--card)', borderBottom: '1px solid var(--border)' }}>
          <select className="form-select" style={{ width: 200, height: 28, fontSize: 11 }}
            value={pptModel} onChange={e => setPptModel(e.target.value)}>
            <option value="">默认模型</option>
            {enabledProviders.map(p =>
              (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
              ))
            )}
          </select>
          <button className="btn btn-primary btn-sm" onClick={openCreateModal}>
            + 新增风格
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mgmt-content" style={{ flex: 1 }}>
        {loading ? (
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, textAlign: 'center', padding: '40px 0' }}>
            加载中...
          </p>
        ) : filteredCards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)', fontSize: 13 }}>
            <p style={{ marginBottom: 16 }}>暂无风格，创建一个吧</p>
            <button className="btn btn-primary" onClick={openCreateModal}>+ 新增风格</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
            {filteredCards.map(card => (
              <div key={card.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {/* Color preview bar */}
                <div style={{
                  height: 6,
                  background: `linear-gradient(90deg, ${card.colors.accent || card.colors.primary} 60%, ${card.colors.paper || card.colors.background} 100%)`,
                }} />

                {/* Card body */}
                <div style={{ padding: 12 }}>
                  <h4 style={{
                    fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {card.name}
                  </h4>

                  {/* Tags */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                    {card.styleFamily && (
                      <span style={{
                        fontSize: 9, fontWeight: 600,
                        color: FAMILY_COLORS[card.styleFamily] || 'var(--text-secondary)',
                        background: `${FAMILY_COLORS[card.styleFamily] || 'var(--text-secondary)'}15`,
                        padding: '1px 5px', borderRadius: 2,
                      }}>
                        {FAMILY_LABELS[card.styleFamily] || card.styleFamily}
                      </span>
                    )}
                    {card.isDefault && (
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--text-secondary)',
                        background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 2 }}>
                        默认
                      </span>
                    )}
                    {card.hasOutline && (
                      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--success)',
                        background: 'rgba(34,197,94,0.1)', padding: '1px 5px', borderRadius: 2,
                        cursor: 'pointer' }}
                        onClick={(e) => { e.stopPropagation(); openOutlineEditor(card) }}
                        title="点击查看和编辑大纲">
                        {card.outlineCount}页大纲
                      </span>
                    )}
                    {card.fileName && !card.styleFamily && (
                      <span style={{ fontSize: 9, color: 'var(--text-secondary)' }} title={card.fileName}>
                        📄
                      </span>
                    )}
                  </div>

                  {/* Color swatches */}
                  {renderColorSwatch(card)}

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
                    {card.fileName && (
                      <button className="btn btn-ghost btn-sm"
                        style={{ fontSize: 10, padding: '2px 6px' }}
                        onClick={() => handleAnalyze(card.template)}
                        disabled={analyzingId !== null || planningId !== null}>
                        {analyzingId === card.id ? '提取中...' : '分析'}
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm"
                      style={{ fontSize: 10, padding: '2px 6px' }}
                      onClick={() => handleGenerateOutline(card)}
                      disabled={analyzingId !== null || planningId !== null}>
                      {planningId === card.id ? '生成中...' : '大纲'}
                    </button>
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', cursor: 'pointer' }}
                      onClick={() => toggleLock(card.template)}
                      title={card.locked ? '点击解锁' : '点击锁定'}>
                      {card.locked ? '🔒' : '🔓'}
                    </span>
                    {!card.isDefault && (
                      <span style={{ fontSize: 10, color: 'var(--text-secondary)', cursor: 'pointer' }}
                        onClick={() => handleSetDefault(card.template)} title="设为默认">
                        默认
                      </span>
                    )}
                    <span style={{ fontSize: 10, color: card.locked ? 'var(--text-secondary)' : 'var(--warning)', cursor: card.locked ? 'not-allowed' : 'pointer' }}
                      onClick={() => { if (!card.locked) handleDelete(card.template) }} title={card.locked ? '已锁定，请先解锁' : '删除'}>
                      {card.locked ? '🔒' : '删'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ====== New Style Modal ====== */}
      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onMouseDown={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 24,
            width: 600, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0' }}>新增风格</h3>

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '1px solid var(--border)' }}>
              {[
                { key: 'preset' as const, label: '从预设创建' },
                { key: 'upload' as const, label: '上传 PPTX' },
              ].map(tab => (
                <button key={tab.key}
                  style={{
                    padding: '8px 16px', fontSize: 12, background: 'none',
                    border: 'none', borderBottom: modalTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
                    color: modalTab === tab.key ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: modalTab === tab.key ? 600 : 400,
                    cursor: 'pointer',
                  }}
                  onClick={() => { setModalTab(tab.key); setFormError('') }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Preset picker tab */}
            {modalTab === 'preset' && (
              <>
                {/* Family filter */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
                  {['all', 'magazine', 'swiss'].map(f => (
                    <button key={f} className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setSelectedPreset(null)
                        // filter presets by family
                      }}
                      style={{ fontSize: 10, padding: '2px 8px' }}>
                      {f === 'all' ? '全部' : FAMILY_LABELS[f] || f}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 200, overflow: 'auto', marginBottom: 14 }}>
                  {presets.map((p, i) => {
                    const c = p.colors
                    const isSelected = selectedPreset === p
                    return (
                      <div key={i}
                        style={{
                          padding: 10, borderRadius: 6, cursor: 'pointer',
                          border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                          background: isSelected ? 'var(--bg-hover)' : 'var(--bg)',
                        }}
                        onClick={() => { setSelectedPreset(p); setFormError('') }}
                      >
                        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <div style={{ width: 16, height: 16, borderRadius: 3, background: c.accent, border: '1px solid #ddd' }} />
                          <div style={{ width: 16, height: 16, borderRadius: 3, background: c.ink, border: '1px solid #ddd' }} />
                          <div style={{ width: 16, height: 16, borderRadius: 3, background: c.paper, border: '1px solid #ddd' }} />
                        </div>
                        {isSelected && <div style={{ fontSize: 10, color: 'var(--primary)', marginTop: 4 }}>✓ 已选择</div>}
                      </div>
                    )
                  })}
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 6 }}>风格名称</label>
                  <input
                    style={{
                      width: '100%', height: 32, border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 12,
                      color: 'var(--text)', background: 'var(--bg)', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    placeholder={selectedPreset ? selectedPreset.name : '输入风格名称'}
                    value={formName}
                    onChange={e => { setFormName(e.target.value); setFormError('') }}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateFromPreset() }}
                    autoFocus
                  />
                </div>
              </>
            )}

            {/* Upload tab */}
            {modalTab === 'upload' && (
              <>
                <div style={{
                  padding: '12px', background: 'var(--bg)', borderRadius: 'var(--radius-sm)',
                  marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {uploadFileName || '未选择文件'}
                  </span>
                  <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                    {uploadFileName ? '更换' : '选择 PPTX'}
                    <input type="file" accept=".pptx" style={{ display: 'none' }}
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) { uploadFileRef.current = f; setUploadFileName(f.name) }
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, display: 'block', marginBottom: 6 }}>风格名称</label>
                  <input
                    style={{
                      width: '100%', height: 32, border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)', padding: '0 8px', fontSize: 12,
                      color: 'var(--text)', background: 'var(--bg)', outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    placeholder="输入风格名称"
                    value={formName}
                    onChange={e => { setFormName(e.target.value); setFormError('') }}
                    onKeyDown={e => { if (e.key === 'Enter') handleCreateFromUpload() }}
                    autoFocus
                  />
                </div>
              </>
            )}

            {formError && (
              <p style={{ color: 'var(--warning)', fontSize: 12, marginTop: 12 }}>{formError}</p>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModal(false)} disabled={saving}>
                取消
              </button>
              <button className="btn btn-primary btn-sm"
                onClick={modalTab === 'preset' ? handleCreateFromPreset : handleCreateFromUpload}
                disabled={saving}>
                {saving ? '创建中...' :
                  (modalTab === 'preset' ? (selectedPreset ? '创建风格' : '请先选择主题') :
                    (uploadFileName ? '创建并提取色彩' : '请先选择文件'))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== Visual Outline Editor ====== */}
      {outlineCard && (
        <SlideOutlineEditor
          templateId={outlineCard.id}
          templateName={outlineCard.name}
          slidePlan={outlineCard.slidePlan}
          slideTypes={SLIDE_TYPES}
          onSave={handleSaveOutline}
          onClose={() => setOutlineCard(null)}
        />
      )}
    </div>
  )
}

const SLIDE_TYPES = [
  'cover', 'toc', 'chapter', 'content', 'principle', 'technique', 'table',
  'data_hero', 'timeline', 'duo_compare', 'process_flow', 'grid_cards',
  'food_archive', 'skill_card', 'troubleshoot', 'quote', 'image_hero',
  'summary', 'closing', 'appendix', 'copyright', 'section',
]

export default TemplateManager
