import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'
import { usePermission } from '../hooks/usePermission'
import { useAuth } from '../contexts/AuthContext'
import Col3StructureEditor from '../components/Col3StructureEditor'

type Tab = 'general' | 'columns' | 'core'

const COLUMN_GROUPS = [
  { id: 'col1', label: '素材输入', hasTemplate: false, summary: '输入配置' },
  { id: 'col2', label: '文档生成', hasTemplate: false, summary: '文档配置' },
  { id: 'col3', label: '文档课件', hasTemplate: true, summary: '导出配置' },
  { id: 'col4', label: '分析PPT', hasTemplate: true, summary: '分析文档 | PPT配置' },
  { id: 'col5', label: '综合PPT', hasTemplate: true, summary: '综合文档 | PPT配置' },
  { id: 'col6', label: '课件演讲', hasTemplate: false, summary: '演讲配置' },
  { id: 'col7', label: '语音合成', hasTemplate: false, summary: '角色提示词 | SKILL' },
]

const RULES_COLUMNS = ['col3', 'col4', 'col5'] as const

interface ColumnConfig { id: string; column_id: string; label: string; prompt: string; skill: string; has_template: number; template_path: string | null; sort_order: number; rules?: string }
interface SpeechConfig { id: string; label: string; prompt: string; skill: string; sort_order: number }
interface CorePromptConfig { id: string; prompt_key: string; category: string; label: string; content: string; sort_order: number; stage: string }

const CORE_CATEGORIES = [
  { key: '', label: '全部' },
  { key: 'root', label: '根级别' },
  { key: 'always', label: '通用规则' },
  { key: 'by_type', label: '按类型' },
  { key: 'by_feature', label: '按功能' },
  { key: 'by_layout', label: '按布局' },
]

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  'stage1-outline': { label: '阶段1 大纲', color: '#3b82f6' },
  'stage2-structure': { label: '阶段2 结构', color: '#8b5cf6' },
  'stage3-html': { label: '阶段3 HTML', color: '#22c55e' },
  'aux': { label: '辅助', color: '#9ca3af' },
}

const FIELD_HINTS: Record<string, { prompt: string; skill: string }> = {
  col1: { prompt: '角色定义 — 文本处理阶段', skill: '输出格式模板 — 文本处理阶段' },
  col2: { prompt: '角色定义 — 文本处理阶段', skill: '输出格式模板 — 文本处理阶段' },
  col3: { prompt: '角色定义 — Stage 1 大纲生成', skill: '输出格式模板 — Stage 1 大纲生成' },
  col4: { prompt: '角色定义 — Stage 1 大纲生成，定义 AI 身份和任务口吻', skill: '幻灯片结构模板 — Stage 1 大纲生成，定义输出 JSON 字段' },
  col5: { prompt: '角色定义 — Stage 1 大纲生成，定义 AI 身份和任务口吻', skill: '幻灯片结构模板 — Stage 1 大纲生成，定义输出 JSON 字段' },
  col6: { prompt: '演讲角色定义 — 演讲稿生成阶段', skill: '演讲输出格式 — 演讲稿生成阶段' },
  col7: { prompt: '语音角色定义 — 语音合成阶段', skill: '语音输出格式 — 语音合成阶段' },
}

const hintStyle = { fontSize: 9, color: 'var(--text-secondary)', marginBottom: 4 }

function splitRules(rulesJson: string): { typographySpec: string; outlinePrompt: string; cognitivePrinciples: string } {
  try {
    const obj = JSON.parse(rulesJson || '{}')
    return {
      typographySpec: JSON.stringify(obj.design_rules || {}, null, 2),
      outlinePrompt: obj.outline_architect_prompt || '',
      cognitivePrinciples: obj.cognitive_design_principles || ''
    }
  } catch {
    return { typographySpec: '{}', outlinePrompt: '', cognitivePrinciples: '' }
  }
}

function mergeRules(typographySpec: string, outlinePrompt: string, cognitivePrinciples: string): string {
  let designRules = {}
  try { designRules = JSON.parse(typographySpec || '{}') } catch { /* keep {} */ }
  return JSON.stringify({
    design_rules: designRules,
    outline_architect_prompt: outlinePrompt,
    cognitive_design_principles: cognitivePrinciples
  }, null, 2)
}

export default function WorkspaceSettingsPage() {
  const { wid } = useParams<{ wid: string }>()
  const modal = useModal()
  const canSaveProject = usePermission('config.project')
  const canManageMembers = usePermission('member.manage')
  const { user } = useAuth()
  const [wsCreatedBy, setWsCreatedBy] = useState<string | null>(null)
  const isOwner = () => {
    if (!user) return false
    if (wsCreatedBy == null) return user.permissions?.includes('project.edit_all') ?? false
    if (user.permissions?.includes('project.edit_all')) return true
    return wsCreatedBy === user.user_id
  }
  const canEdit = canSaveProject && isOwner()
  const [tab, setTab] = useState<Tab>('general')

  // Workspace info
  const [wsName, setWsName] = useState('')
  const [wsStatus, setWsStatus] = useState('draft')
  const [wsDesc, setWsDesc] = useState('')
  const [wsLogo, setWsLogo] = useState('')
  const [wsLogoUploading, setWsLogoUploading] = useState(false)
  const [wsRoleIds, setWsRoleIds] = useState<string[]>([])
  const [memberRoles, setMemberRoles] = useState<{id:string;name:string}[]>([])
  const [wsSaving, setWsSaving] = useState(false)

  // Project categories
  const [categories, setCategories] = useState<{id:string;name:string}[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [catAdding, setCatAdding] = useState(false)
  const [editingCatId, setEditingCatId] = useState<string | null>(null)
  const [editingCatName, setEditingCatName] = useState('')

  // Column configs
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([])
  const [colValues, setColValues] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [colSaving, setColSaving] = useState<Record<string, boolean>>({})
  const [colTypographySpec, setColTypographySpec] = useState<Record<string, string>>({})
  const [colOutlinePrompt, setColOutlinePrompt] = useState<Record<string, string>>({})
  const [colCognitivePrinciples, setColCognitivePrinciples] = useState<Record<string, string>>({})
  const [colRulesOpen, setColRulesOpen] = useState<Set<string>>(new Set())
  const [colRulesSaving, setColRulesSaving] = useState<Record<string, boolean>>({})
  const [colVisualEdit, setColVisualEdit] = useState<Set<string>>(new Set())
  const [openCols, setOpenCols] = useState<Set<string>>(new Set())

  // Speech configs (col6)
  const [speechConfigs, setSpeechConfigs] = useState<SpeechConfig[]>([])
  const [speechValues, setSpeechValues] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [speechSaving, setSpeechSaving] = useState<Record<string, boolean>>({})

  // TTS configs (col7)
  const [ttsConfigs, setTtsConfigs] = useState<SpeechConfig[]>([])
  const [ttsValues, setTtsValues] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [ttsSaving, setTtsSaving] = useState<Record<string, boolean>>({})

  // Core prompt configs
  const [coreConfigs, setCoreConfigs] = useState<CorePromptConfig[]>([])
  const [coreCategory, setCoreCategory] = useState('')
  const [corePage, setCorePage] = useState(1)
  const corePageSize = 30
  const [coreValues, setCoreValues] = useState<Record<string, string>>({})
  const [coreSaving, setCoreSaving] = useState<Record<string, boolean>>({})
  const [editingCoreId, setEditingCoreId] = useState<string | null>(null)

  // Loading
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Export/Import
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exportingFull, setExportingFull] = useState(false)
  const [importingFull, setImportingFull] = useState(false)
  const fileInputFullRef = useRef<HTMLInputElement>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [importZipFile, setImportZipFile] = useState<File | null>(null)

  const loadAll = async () => {
    if (!wid) return
    setLoading(true)
    try {
      // Load workspace info
      const ws: any = await api.getWorkspace(wid)
      setWsName(ws.name || '')
      setWsStatus(ws.status || 'draft')
      setWsDesc(ws.description || '')
      setWsLogo(ws.logo || '')
      setWsRoleIds(ws.role_ids || [])
      setWsCreatedBy(ws.created_by ?? null)

      api.listCategories(wid).then(d => setCategories((d?.categories || []) as {id:string;name:string}[])).catch(() => {})

      // Try loading workspace configs; if empty, copy from seed
      let cc = await api.listColumnConfigs(wid)
      if (!cc || cc.length === 0) {
        await api.copySeedConfigs(wid)
        cc = await api.listColumnConfigs(wid)
      }
      setColumnConfigs(cc as ColumnConfig[])
      const cv: Record<string, { prompt: string; skill: string }> = {}
      const typo: Record<string, string> = {}
      const outline: Record<string, string> = {}
      const cognitive: Record<string, string> = {}
      ;(cc as ColumnConfig[]).forEach(c => {
        cv[c.id] = { prompt: c.prompt, skill: c.skill }
        const { typographySpec, outlinePrompt, cognitivePrinciples } = splitRules(c.rules || '{}')
        typo[c.id] = typographySpec
        outline[c.id] = outlinePrompt
        cognitive[c.id] = cognitivePrinciples
      })
      setColValues(cv)
      setColTypographySpec(typo)
      setColOutlinePrompt(outline)
      setColCognitivePrinciples(cognitive)

      let sc = await api.listSpeechConfigs(wid)
      if (!sc || sc.length === 0) {
        await api.copySeedConfigs(wid)
        sc = await api.listSpeechConfigs(wid)
      }
      setSpeechConfigs(sc as SpeechConfig[])
      const sv: Record<string, { prompt: string; skill: string }> = {}
      ;(sc as SpeechConfig[]).forEach(c => { sv[c.id] = { prompt: c.prompt, skill: c.skill } })
      setSpeechValues(sv)

      let tc = await api.listTtsConfigs(wid)
      if (!tc || tc.length === 0) {
        await api.copySeedConfigs(wid)
        tc = await api.listTtsConfigs(wid)
      }
      setTtsConfigs(tc as SpeechConfig[])
      const tv: Record<string, { prompt: string; skill: string }> = {}
      ;(tc as SpeechConfig[]).forEach(c => { tv[c.id] = { prompt: c.prompt, skill: c.skill } })
      setTtsValues(tv)

      let cpc = await api.listCorePromptConfigs(wid)
      if (!cpc || cpc.length === 0) {
        await api.copySeedConfigs(wid)
        cpc = await api.listCorePromptConfigs(wid)
      }
      setCoreConfigs(cpc as CorePromptConfig[])
      const cpcv: Record<string, string> = {}
      ;(cpc as CorePromptConfig[]).forEach(c => { cpcv[c.id] = c.content || '' })
      setCoreValues(cpcv)

      // Load member roles for role-based visibility editor
      if (canManageMembers) {
        api.listRoles('member').then(roles => setMemberRoles(roles as {id:string;name:string}[])).catch(() => {})
      }

      setError('')
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [wid])

  const saveWorkspace = async () => {
    if (!wid || !wsName.trim()) return
    setWsSaving(true)
    try {
      await api.updateWorkspace(wid, { name: wsName.trim(), status: wsStatus, description: wsDesc.trim(), logo: wsLogo.trim(), role_ids: wsRoleIds })
      modal.toast('已保存', 'success')
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    } finally { setWsSaving(false) }
  }

  const addCategory = async () => {
    if (!wid || !newCatName.trim()) return
    setCatAdding(true)
    try {
      const cat: any = await api.createCategory(wid, newCatName.trim())
      if (cat != null) {
        setCategories(prev => [...prev, { id: cat.id, name: cat.name }])
        setNewCatName('')
      }
    } catch (e: any) {
      modal.toast('添加失败: ' + e.message, 'error')
    } finally { setCatAdding(false) }
  }

  const saveCategoryName = async (catId: string) => {
    if (!wid || !editingCatName.trim()) return
    try {
      await api.updateCategory(wid, catId, editingCatName.trim())
      setCategories(prev => prev.map(c => c.id === catId ? { ...c, name: editingCatName.trim() } : c))
      setEditingCatId(null)
    } catch (e: any) {
      modal.toast('重命名失败: ' + e.message, 'error')
    }
  }

  const removeCategory = async (catId: string, catName: string) => {
    if (!wid) return
    const ok = await modal.confirm(`确定删除分类「${catName}」？引用该分类的明细将变为无分类。`)
    if (!ok) return
    try {
      await api.deleteCategory(wid, catId)
      setCategories(prev => prev.filter(c => c.id !== catId))
      modal.toast('已删除', 'success')
    } catch (e: any) {
      modal.toast('删除失败: ' + e.message, 'error')
    }
  }

  const handleExportConfigs = async () => {
    if (!wid) return
    setExporting(true)
    try {
      const data = await api.exportWorkspaceConfigs(wid)
      const json = JSON.stringify(data, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workspace-${wid}-configs-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      modal.toast('配置已导出', 'success')
    } catch (e: any) {
      modal.toast('导出失败: ' + e.message, 'error')
    } finally {
      setExporting(false)
    }
  }

  const handleImportConfigs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !wid) return
    setImporting(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.configs) {
        modal.toast('无效的配置文件：缺少 configs 字段', 'error')
        return
      }
      const result = await api.importWorkspaceConfigs(wid, { configs: data.configs })
      if (result.ok) {
        modal.toast('配置已导入: ' + JSON.stringify(result.applied), 'success')
        loadAll()
      }
    } catch (e: any) {
      modal.toast('导入失败: ' + e.message, 'error')
    } finally {
      setImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleExportFull = async () => {
    if (!wid) return
    setExportingFull(true)
    try {
      const blob = await api.exportWorkspaceFull(wid)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workspace-${wid}-full-${new Date().toISOString().slice(0, 10)}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      modal.toast('完整数据已导出', 'success')
    } catch (e: any) {
      modal.toast('导出失败: ' + e.message, 'error')
    } finally {
      setExportingFull(false)
    }
  }

  const doImportFull = async (file: File) => {
    setImportingFull(true)
    try {
      const result = await api.importWorkspaceFull(file)
      if (result.ok) {
        modal.toast(`导入成功！新工作区: ${result.workspace_id}`, 'success')
        setShowImportDialog(false)
        setImportZipFile(null)
      }
    } catch (err: any) {
      modal.toast('导入失败: ' + err.message, 'error')
    } finally {
      setImportingFull(false)
      if (fileInputFullRef.current) fileInputFullRef.current.value = ''
    }
  }

  const handleImportFull = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    await doImportFull(file)
  }

  const toggleCol = (id: string) => {
    setOpenCols(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const saveColRules = async (configId: string, colId: string) => {
    const typographySpec = colTypographySpec[configId] || '{}'
    try {
      JSON.parse(typographySpec)
    } catch {
      modal.toast('排版提取规则 JSON 格式错误', 'error')
      return
    }
    const rulesText = mergeRules(
      typographySpec,
      colOutlinePrompt[configId] || '',
      colCognitivePrinciples[configId] || ''
    )
    setColRulesSaving(prev => ({ ...prev, [configId]: true }))
    try {
      await api.updateColumnConfig(configId, { rules: rulesText })
      modal.toast('规则已保存', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setColRulesSaving(prev => ({ ...prev, [configId]: false })) }
  }

  const filteredCoreConfigs = coreCategory
    ? coreConfigs.filter(c => c.category === coreCategory)
    : coreConfigs

  const coreTotalPages = Math.ceil(filteredCoreConfigs.length / corePageSize)
  const coreStart = (corePage - 1) * corePageSize
  const corePageItems = filteredCoreConfigs.slice(coreStart, coreStart + corePageSize)

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>加载中...</div>
  }

  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--warning)' }}>加载失败: {error}</div>
  }

  return (
    <div>
      <div className="mgmt-tabs">
        <button className={`mgmt-tab${tab === 'general' ? ' active' : ''}`}
          onClick={() => setTab('general')}>项目设置</button>
        <button className={`mgmt-tab${tab === 'columns' ? ' active' : ''}`}
          onClick={() => setTab('columns')}>栏目配置</button>
        <button className={`mgmt-tab${tab === 'core' ? ' active' : ''}`}
          onClick={() => setTab('core')}>核心配置</button>
      </div>

      <div className="mgmt-content">

        {/* ═══ Tab: 项目设置 ═══ */}
        {tab === 'general' && (
          <div style={{ maxWidth: 500 }}>
            <div className="form-group">
              <label className="form-label">项目名称</label>
              <input className="form-input" type="text" value={wsName}
                onChange={e => setWsName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">项目图标</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {wsLogo ? (
                  <>
                    <img src={wsLogo} style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} alt="" />
                    <button className="btn btn-ghost btn-sm" onClick={() => setWsLogo('')}>移除</button>
                  </>
                ) : (
                  <span style={{ width: 48, height: 48, borderRadius: 8, background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, color: 'var(--text-secondary)' }}>🖼</span>
                )}
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  {wsLogoUploading ? '上传中...' : '上传图片'}
                  <input type="file" accept="image/*" style={{ display: 'none' }}
                    onChange={async e => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      setWsLogoUploading(true)
                      try {
                        const data = await api.uploadLogo(file)
                        setWsLogo(data.url)
                      } catch (err: any) {
                        modal.toast('上传失败: ' + err.message, 'error')
                      } finally {
                        setWsLogoUploading(false)
                      }
                    }} />
                </label>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">项目简介</label>
              <textarea className="form-input" rows={4} value={wsDesc}
                onChange={e => setWsDesc(e.target.value)}
                placeholder="简要描述该项目的用途和内容..."
                style={{ resize: 'vertical' }} disabled={!canEdit} />
            </div>
            <div className="form-group">
              <label className="form-label">状态</label>
              <select className="form-input" value={wsStatus}
                onChange={e => setWsStatus(e.target.value)}>
                <option value="draft">草稿</option>
                <option value="completed">已完成</option>
              </select>
            </div>
            {canManageMembers && memberRoles.length > 0 && (
              <div className="form-group">
                <label className="form-label">可见角色</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {memberRoles.map(r => {
                    const checked = wsRoleIds.includes(r.id)
                    return (
                      <label key={r.id} style={{
                        display: 'flex', alignItems: 'center', gap: 4, fontSize: 12,
                        padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                        background: checked ? 'var(--primary-light)' : 'var(--card-bg)',
                        border: checked ? '1px solid var(--primary)' : '1px solid var(--border)',
                        color: checked ? 'var(--primary)' : 'var(--text-secondary)',
                        fontWeight: checked ? 600 : 400,
                      }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => setWsRoleIds(prev =>
                            prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                          )}
                          style={{ display: 'none' }} />
                        {r.name}
                      </label>
                    )
                  })}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>
                  勾选后，该角色下所有会员将自动可见此项目
                </div>
              </div>
            )}
            <div className="form-group">
              <label className="form-label">明细分类</label>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                本项目专属的明细分类，新建明细时可选择，列表页可按分类筛选
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {categories.map(cat => (
                  <div key={cat.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--card-bg)' }}>
                    {editingCatId === cat.id ? (
                      <>
                        <input className="form-input" style={{ flex: 1, padding: '4px 8px', fontSize: 12 }}
                          value={editingCatName} autoFocus
                          onChange={e => setEditingCatName(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveCategoryName(cat.id); if (e.key === 'Escape') setEditingCatId(null) }} />
                        <button className="btn btn-primary btn-sm" onClick={() => saveCategoryName(cat.id)}>保存</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditingCatId(null)}>取消</button>
                      </>
                    ) : (
                      <>
                        <span style={{ flex: 1, fontSize: 12 }}>{cat.name}</span>
                        {canEdit && <>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}
                            onClick={() => { setEditingCatId(cat.id); setEditingCatName(cat.name) }}>重命名</button>
                          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, color: 'var(--warning)' }}
                            onClick={() => removeCategory(cat.id, cat.name)}>删除</button>
                        </>}
                      </>
                    )}
                  </div>
                ))}
                {categories.length === 0 && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', padding: '4px 0' }}>暂无分类</div>
                )}
                {canEdit && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-input" style={{ flex: 1, padding: '4px 8px', fontSize: 12 }}
                      placeholder="新分类名称" value={newCatName}
                      onChange={e => setNewCatName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addCategory() }} />
                    <button className="btn btn-primary btn-sm" disabled={catAdding || !newCatName.trim()} onClick={addCategory}>
                      {catAdding ? '添加中...' : '添加'}
                    </button>
                  </div>
                )}
              </div>
            </div>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={saveWorkspace} disabled={wsSaving}>
              {wsSaving ? '保存中...' : '保存'}
            </button>}

            {/* Config export/import */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>配置迁移</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 12 }}>
                导出当前工作区的全部配置（栏目/演讲/语音/核心提示词）为 JSON 文件，或从 JSON 文件导入配置。
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" disabled={exporting} onClick={handleExportConfigs}>
                  {exporting ? '导出中...' : '导出配置'}
                </button>
                <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                  {importing ? '导入中...' : '导入配置'}
                  <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }}
                    onChange={handleImportConfigs} />
                </label>
              </div>
            </div>

            {/* Full data export/import */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>数据导出/导入</div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 12 }}>
                导出当前工作区的全部数据（项目、素材、结果、文件）为 ZIP 文件，或从 ZIP 文件导入创建新工作区。
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-ghost btn-sm" disabled={exportingFull} onClick={handleExportFull}>
                  {exportingFull ? '导出中...' : '导出完整数据 (ZIP)'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => { setShowImportDialog(true); setImportZipFile(null) }}>
                  {importingFull ? '导入中...' : '导入完整数据 (ZIP)'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Tab: 栏目配置 ═══ */}
        {tab === 'columns' && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text)', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 6, marginBottom: 12, lineHeight: 1.7 }}>
              栏目配置定义了<strong>7 个工作阶段</strong>的提示词模板：素材输入 → 文档生成 → 文档课件 → 分析PPT → 综合PPT → 课件演讲 → 语音合成。每个阶段可独立配置角色提示词和输出格式（SKILL），修改仅影响当前项目。
            </div>

            {COLUMN_GROUPS.map(col => (
              <div key={col.id} className={`ac-group${openCols.has(col.id) ? ' open' : ''}`}>
                <div className="ac-head" onClick={() => toggleCol(col.id)}>
                  <span className={`ac-num${!col.hasTemplate ? ' no-tmpl' : ''}`}>{col.id.slice(-1)}</span>
                  <span className="ac-title">{col.label}</span>
                  <span className="ac-summary">{col.summary}</span>
                  <span className="ac-arrow">▼</span>
                </div>
                <div className="ac-body">
                  {col.id === 'col7' ? (
                    <>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        为三种语音合成场景分别配置角色提示词和输出格式。提示词定义角色口吻和风格，SKILL 定义输出格式模板。
                      </div>
                      {ttsConfigs.map(config => (
                        <div key={config.id} className="ac-sub-item">
                          <div className="ac-sub-item-header">{config.label} — 语音合成角色</div>
                          <div className="ac-field-row">
                            <div className="ac-field">
                              <label>角色提示词</label>
                              <div style={hintStyle}>{FIELD_HINTS.col7.prompt}</div>
                              <textarea
                                value={ttsValues[config.id]?.prompt || ''}
                                onChange={e => setTtsValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], prompt: e.target.value } }))}
                              />
                            </div>
                            <div className="ac-field">
                              <label>SKILL 输出格式</label>
                              <div style={hintStyle}>{FIELD_HINTS.col7.skill}</div>
                              <textarea
                                value={ttsValues[config.id]?.skill || ''}
                                onChange={e => setTtsValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], skill: e.target.value } }))}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                            {canEdit && <button className="btn btn-primary btn-sm" disabled={ttsSaving[config.id]}
                              onClick={async () => {
                                setTtsSaving(prev => ({ ...prev, [config.id]: true }))
                                try {
                                  await api.updateTtsConfig(config.id, { prompt: ttsValues[config.id]?.prompt || '', skill: ttsValues[config.id]?.skill || '' })
                                  modal.toast('已保存', 'success')
                                } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                                finally { setTtsSaving(prev => ({ ...prev, [config.id]: false })) }
                              }}>
                              {ttsSaving[config.id] ? '保存中...' : '保存'}
                            </button>}
                          </div>
                        </div>
                      ))}
                      {ttsConfigs.length === 0 && (
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 8 }}>暂无配置</div>
                      )}
                    </>
                  ) : col.id === 'col6' ? (
                    <>
                      {speechConfigs.map(config => (
                        <div key={config.id} className="ac-sub-item">
                          <div className="ac-sub-item-header">{config.label}</div>
                          <div className="ac-field-row">
                            <div className="ac-field">
                              <label>提示词</label>
                              <div style={hintStyle}>{FIELD_HINTS.col6.prompt}</div>
                              <textarea
                                value={speechValues[config.id]?.prompt || ''}
                                onChange={e => setSpeechValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], prompt: e.target.value } }))}
                              />
                            </div>
                            <div className="ac-field">
                              <label>SKILL 输出格式</label>
                              <div style={hintStyle}>{FIELD_HINTS.col6.skill}</div>
                              <textarea
                                value={speechValues[config.id]?.skill || ''}
                                onChange={e => setSpeechValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], skill: e.target.value } }))}
                              />
                            </div>
                          </div>
                          {canEdit && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                            <button className="btn btn-primary btn-sm" disabled={speechSaving[config.id]}
                              onClick={async () => {
                                setSpeechSaving(prev => ({ ...prev, [config.id]: true }))
                                try {
                                  await api.updateSpeechConfig(config.id, { prompt: speechValues[config.id]?.prompt || '', skill: speechValues[config.id]?.skill || '' })
                                  modal.toast('已保存', 'success')
                                } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                                finally { setSpeechSaving(prev => ({ ...prev, [config.id]: false })) }
                              }}>
                              {speechSaving[config.id] ? '保存中...' : '保存'}
                            </button>
                          </div>}
                        </div>
                      ))}
                      {speechConfigs.length === 0 && (
                        <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 8 }}>暂无配置</div>
                      )}
                    </>
                  ) : (<>
                    {columnConfigs.filter(c => c.column_id === col.id).map(config => (
                      <div key={config.id} className="ac-sub-item">
                        <div className="ac-sub-item-header">{config.label}</div>
                        <div className="ac-field-row">
                          <div className="ac-field">
                            <label>提示词</label>
                            <div style={hintStyle}>{FIELD_HINTS[col.id]?.prompt || ''}</div>
                            <textarea
                              value={colValues[config.id]?.prompt || ''}
                              onChange={e => setColValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], prompt: e.target.value } }))}
                            />
                          </div>
                          <div className="ac-field">
                            <label>SKILL 输出格式</label>
                            <div style={hintStyle}>{FIELD_HINTS[col.id]?.skill || ''}</div>
                            <textarea
                              value={colValues[config.id]?.skill || ''}
                              onChange={e => setColValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], skill: e.target.value } }))}
                            />
                          </div>
                        </div>
                        {/* col3 visual structure editor toggle */}
                        {col.id === 'col3' && (
                          <div style={{ marginTop: 8 }}>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: 11 }}
                              onClick={() => setColVisualEdit(prev => {
                                const next = new Set(prev)
                                if (next.has(config.id)) next.delete(config.id)
                                else next.add(config.id)
                                return next
                              })}
                            >
                              {colVisualEdit.has(config.id) ? '收起可视化编辑器' : '可视化编辑结构'}
                            </button>
                            {colVisualEdit.has(config.id) && (
                              <div style={{ marginTop: 8, padding: 12, border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg-primary)' }}>
                                <Col3StructureEditor
                                  initialSkill={colValues[config.id]?.skill || '[]'}
                                  onSaved={(skill) => {
                                    setColValues(prev => ({ ...prev, [config.id]: { ...prev[config.id], skill } }))
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        )}
                        {canEdit && <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                          <button className="btn btn-primary btn-sm" disabled={colSaving[config.id]}
                            onClick={async () => {
                              setColSaving(prev => ({ ...prev, [config.id]: true }))
                              try {
                                await api.updateColumnConfig(config.id, { prompt: colValues[config.id]?.prompt || '', skill: colValues[config.id]?.skill || '' })
                                modal.toast('已保存', 'success')
                              } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                              finally { setColSaving(prev => ({ ...prev, [config.id]: false })) }
                            }}>
                            {colSaving[config.id] ? '保存中...' : '保存'}
                          </button>
                        </div>}
                        {RULES_COLUMNS.includes(col.id as any) && (() => {
                          const isCol3 = col.id === 'col3'
                          return (
                          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                            <div
                              style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
                              onClick={() => setColRulesOpen(prev => { const next = new Set(prev); if (next.has(col.id)) next.delete(col.id); else next.add(col.id); return next })}>
                              <span>{colRulesOpen.has(col.id) ? '▼' : '▶'}</span> {isCol3 ? '导出规则设置 — 控制文档画布尺寸、页边距等' : '生成规则设置 — 控制页面类型、版式定义、提示词、质量检查清单'}
                            </div>
                            {colRulesOpen.has(col.id) && (
                              <div style={{ marginBottom: 8 }}>
                                {/* Editor 1: typography spec (always) */}
                                <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4 }}>
                                  {isCol3 ? '导出规则（JSON）' : '排版提取规则（JSON）— 从上传的 PPTX 模板中自动提取字体、行高参数'}
                                </div>
                                <textarea
                                  value={colTypographySpec[config.id] || '{}'}
                                  onChange={e => setColTypographySpec(prev => ({ ...prev, [config.id]: e.target.value }))}
                                  style={{ width: '100%', minHeight: isCol3 ? 120 : 100, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', tabSize: 2 }}
                                  placeholder='{"typography_spec": {...}}'
                                />
                                {!isCol3 && (
                                  <>
                                    {/* Editor 2: outline architect prompt */}
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, marginTop: 10 }}>
                                      大纲结构师提示词（Markdown）— Stage 1 大纲生成，优先级高于磁盘场景文件
                                    </div>
                                    <textarea
                                      value={colOutlinePrompt[config.id] || ''}
                                      onChange={e => setColOutlinePrompt(prev => ({ ...prev, [config.id]: e.target.value }))}
                                      style={{ width: '100%', minHeight: 220, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', tabSize: 2 }}
                                      placeholder="# PPT Structure Architect..."
                                    />
                                    {/* Editor 3: cognitive design principles */}
                                    <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, marginTop: 10 }}>
                                      认知设计原则（Markdown）— Stage 1 大纲生成，优先级高于磁盘场景文件
                                    </div>
                                    <textarea
                                      value={colCognitivePrinciples[config.id] || ''}
                                      onChange={e => setColCognitivePrinciples(prev => ({ ...prev, [config.id]: e.target.value }))}
                                      style={{ width: '100%', minHeight: 140, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', tabSize: 2 }}
                                      placeholder="# Cognitive Design Principles..."
                                    />
                                  </>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                  {canEdit && <button className="btn btn-primary btn-sm" disabled={colRulesSaving[config.id]}
                                    onClick={() => saveColRules(config.id, col.id)}>
                                    {colRulesSaving[config.id] ? '保存中...' : '保存规则'}
                                  </button>}
                                </div>
                              </div>
                            )}
                          </div>
                          )})()}
                      </div>
                    ))}
                    {columnConfigs.filter(c => c.column_id === col.id).length === 0 && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 8 }}>无配置项</div>
                    )}
                  </>)}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Tab: 核心配置 ═══ */}
        {tab === 'core' && (
          <div>
            <div style={{ fontSize: 11, color: 'var(--text)', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 6, marginBottom: 12, lineHeight: 1.7 }}>
              核心配置是 PPT 生成流程中的<strong>底层提示词变量</strong>，按类别组织（根级别、通用规则、按类型、按功能、按布局）。修改仅影响当前项目，不影响其他项目的提示词。
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
              {CORE_CATEGORIES.map(cat => (
                <button key={cat.key}
                  className={`btn btn-sm ${coreCategory === cat.key ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => { setCoreCategory(cat.key); setCorePage(1) }}>
                  {cat.label}
                </button>
              ))}
            </div>
            <div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {corePageItems.map(config => (
                        <div key={config.id} style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', flexShrink: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', cursor: 'pointer',
                            background: editingCoreId === config.id ? 'var(--bg-secondary)' : 'transparent' }}
                            onClick={() => canEdit && setEditingCoreId(editingCoreId === config.id ? null : config.id)}>
                            <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>
                              <span style={{ fontSize: 9, color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 3, marginRight: 8 }}>
                                {config.category}
                              </span>
                              {config.label}
                              {config.stage && STAGE_LABELS[config.stage] && (
                                <span style={{ fontSize: 9, color: STAGE_LABELS[config.stage].color, background: STAGE_LABELS[config.stage].color + '18', padding: '1px 6px', borderRadius: 3, marginLeft: 6 }}>
                                  {STAGE_LABELS[config.stage].label}
                                </span>
                              )}
                            </span>
                            <span style={{ fontSize: 9, color: 'var(--text-secondary)', marginRight: 8 }}>
                              {config.content ? `${(config.content.length / 1024).toFixed(1)}KB` : '空'}
                            </span>
                            <span style={{ fontSize: 10, color: editingCoreId === config.id ? 'var(--text-secondary)' : 'var(--primary)' }}>
                              {editingCoreId === config.id ? '收起' : '编辑'}
                            </span>
                          </div>
                          {editingCoreId === config.id && (
                            <div style={{ padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
                              <textarea
                                value={coreValues[config.id] || ''}
                                onChange={e => setCoreValues(prev => ({ ...prev, [config.id]: e.target.value }))}
                                style={{ width: '100%', minHeight: 200, fontFamily: 'monospace', fontSize: 11 }}
                              />
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditingCoreId(null)}>取消</button>
                                <button className="btn btn-primary btn-sm" disabled={coreSaving[config.id]}
                                  onClick={async () => {
                                    setCoreSaving(prev => ({ ...prev, [config.id]: true }))
                                    try {
                                      await api.updateCorePromptConfig(config.id, { content: coreValues[config.id] || '' })
                                      modal.toast('已保存', 'success')
                                    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                                    finally { setCoreSaving(prev => ({ ...prev, [config.id]: false })) }
                                  }}>
                                  {coreSaving[config.id] ? '保存中...' : '保存'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    {filteredCoreConfigs.length === 0 && (
                      <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 12, textAlign: 'center' }}>加载中...</div>
                    )}
                    {coreTotalPages > 1 && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '8px 10px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-secondary)' }}>
                        <button className="btn btn-ghost btn-sm" disabled={corePage <= 1} onClick={() => setCorePage(p => p - 1)}>上一页</button>
                        <span>第 {corePage} / {coreTotalPages} 页（共 {filteredCoreConfigs.length} 条）</span>
                        <button className="btn btn-ghost btn-sm" disabled={corePage >= coreTotalPages} onClick={() => setCorePage(p => p + 1)}>下一页</button>
                      </div>
                    )}
            </div>
          </div>
        )}
      </div>

      {/* Import ZIP Dialog */}
      {showImportDialog && (
        <div className="dialog-overlay"
          onMouseDown={(e: any) => { if (e.target === e.currentTarget) { setShowImportDialog(false); setImportZipFile(null) } }}
          onClick={(e: any) => { if (e.target === e.currentTarget) { setShowImportDialog(false); setImportZipFile(null) } }}>
          <div className="dialog-box" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">导入完整数据</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16 }}>
              选择 ZIP 文件导入，将创建新工作区并还原全部项目数据和文件资源。
            </div>
            {!importZipFile ? (
              <label style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 100, border: '2px dashed var(--border)', borderRadius: 8,
                cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13
              }}>
                <input type="file" accept=".zip" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) setImportZipFile(f) }} />
                点击选择 ZIP 文件，或拖拽到此处
              </label>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: 12,
                background: 'var(--bg-secondary)', borderRadius: 8
              }}>
                <span style={{ fontSize: 13, flex: 1 }}>{importZipFile.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                  {(importZipFile.size / 1024 / 1024).toFixed(1)} MB
                </span>
                <button className="btn btn-ghost btn-sm" onClick={() => { setImportZipFile(null); if (fileInputFullRef.current) fileInputFullRef.current.value = '' }}>
                  换文件
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowImportDialog(false); setImportZipFile(null) }}>取消</button>
              <button className="btn btn-primary btn-sm" disabled={!importZipFile || importingFull}
                onClick={() => { if (importZipFile) doImportFull(importZipFile) }}>
                {importingFull ? '导入中...' : '确认导入'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
