import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { api, Project } from '../services/api'
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
  'stage4-postprocess': { label: '阶段4 后处理', color: '#f59e0b' },
}

function splitRules(rules: string) {
  try {
    const parsed = JSON.parse(rules)
    return {
      typographySpec: JSON.stringify(parsed.typographySpec || parsed.typography_spec || {}, null, 2),
      outlinePrompt: parsed.outlinePrompt || parsed.outline_prompt || '',
      cognitivePrinciples: parsed.cognitivePrinciples || parsed.cognitive_principles || '',
    }
  } catch {
    return { typographySpec: '{}', outlinePrompt: '', cognitivePrinciples: '' }
  }
}

function mergeRules(typographySpec: string, outlinePrompt: string, cognitivePrinciples: string) {
  return JSON.stringify({
    typography_spec: JSON.parse(typographySpec || '{}'),
    outline_prompt: outlinePrompt,
    cognitive_principles: cognitivePrinciples,
  }, null, 2)
}

export default function WorkspaceSettingsPage() {
  const { wid } = useParams<{ wid: string }>()
  const modal = useModal()
  const canEdit = usePermission('config.edit')
  const canManageMembers = usePermission('workspace.manage_members')
  const { user } = useAuth()
  const isSuperAdmin = user?.permissions?.includes('admin.access')
  const canEditWs = canEdit || isSuperAdmin

  const [tab, setTab] = useState<Tab>('general')

  // Workspace info
  const [wsName, setWsName] = useState('')
  const [wsStatus, setWsStatus] = useState('draft')
  const [wsDesc, setWsDesc] = useState('')
  const [wsLogo, setWsLogo] = useState('')
  const [wsSaving, setWsSaving] = useState(false)
  const [wsLogoUploading, setWsLogoUploading] = useState(false)
  const [wsCreatedBy, setWsCreatedBy] = useState<string | null>(null)

  // Member role management
  const [memberRoles, setMemberRoles] = useState<{id:string;name:string}[]>([])
  const [wsRoleIds, setWsRoleIds] = useState<string[]>([])

  // Categories
  const [categories, setCategories] = useState<{id:string;name:string}[]>([])
  const [newCatName, setNewCatName] = useState('')
  const [catAdding, setCatAdding] = useState(false)

  // Column configs
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([])
  const [openCols, setOpenCols] = useState<Set<string>>(new Set())
  const [colValues, setColValues] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [colSaving, setColSaving] = useState<Record<string, boolean>>({})
  const [colTypographySpec, setColTypographySpec] = useState<Record<string, string>>({})
  const [colOutlinePrompt, setColOutlinePrompt] = useState<Record<string, string>>({})
  const [colCognitivePrinciples, setColCognitivePrinciples] = useState<Record<string, string>>({})
  const [colRulesSaving, setColRulesSaving] = useState<Record<string, boolean>>({})

  // Speech configs
  const [speechConfigs, setSpeechConfigs] = useState<SpeechConfig[]>([])
  const [openSpeechCols, setOpenSpeechCols] = useState<Set<string>>(new Set())
  const [speechValues, setSpeechValues] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [speechSaving, setSpeechSaving] = useState<Record<string, boolean>>({})

  // TTS configs
  const [ttsConfigs, setTtsConfigs] = useState<any[]>([])
  const [openTtsCols, setOpenTtsCols] = useState<Set<string>>(new Set())
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
  const importOverlayRef = useRef(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [exportProjects, setExportProjects] = useState<Project[]>([])
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(new Set())
  const [exportLoadingProjects, setExportLoadingProjects] = useState(false)
  const exportOverlayRef = useRef(false)

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
      setTtsConfigs(tc as any[])
      const tv: Record<string, { prompt: string; skill: string }> = {}
      ;(tc as any[]).forEach(c => { tv[c.id] = { prompt: c.prompt, skill: c.skill } })
      setTtsValues(tv)

      const cp = await api.listCorePromptConfigs(wid)
      setCoreConfigs(cp as CorePromptConfig[])
      const cv2: Record<string, string> = {}
      ;(cp as CorePromptConfig[]).forEach(c => { cv2[c.id] = c.content })
      setCoreValues(cv2)

      // Load member roles for role-based visibility
      if (canManageMembers) {
        api.listRoles().then(d => setMemberRoles((d || []) as {id:string;name:string}[])).catch(() => {})
      }
    } catch (e: any) {
      setError(e.message || '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [wid])

  const saveWorkspace = async () => {
    if (!wid) return
    setWsSaving(true)
    try {
      await api.updateWorkspace(wid, { name: wsName, description: wsDesc, logo: wsLogo, status: wsStatus, role_ids: wsRoleIds })
      modal.toast('已保存', 'success')
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    } finally {
      setWsSaving(false)
    }
  }

  const addCategory = async () => {
    if (!wid || !newCatName.trim()) return
    setCatAdding(true)
    try {
      await api.createCategory(wid, newCatName.trim())
      setNewCatName('')
      const d = await api.listCategories(wid)
      setCategories((d?.categories || []) as {id:string;name:string}[])
      modal.toast('已添加', 'success')
    } catch (e: any) {
      modal.toast('添加失败: ' + e.message, 'error')
    } finally {
      setCatAdding(false)
    }
  }

  const deleteCategory = async (cid: string) => {
    if (!wid) return
    try {
      await api.deleteCategory(wid!, cid)
      const d = await api.listCategories(wid)
      setCategories((d?.categories || []) as {id:string;name:string}[])
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
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workspace-configs-${wid}-${new Date().toISOString().slice(0, 10)}.json`
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

  const doExportFull = async (projectIds?: string[]) => {
    if (!wid) return
    const suffix = projectIds && projectIds.length > 0 ? `-${projectIds.length}items` : '-full'
    const filename = `workspace-${wid}${suffix}-${new Date().toISOString().slice(0, 10)}.zip`

    // Close dialog first so overlay doesn't interfere with download
    setShowExportDialog(false)
    setExportProjects([])
    setExportingFull(true)

    try {
      const blob = await api.exportWorkspaceFull(wid, projectIds)

      // Try native Save As dialog (localhost/HTTPS only)
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: filename,
            types: [{ description: 'ZIP file', accept: { 'application/zip': ['.zip'] } }],
          })
          const writable = await handle.createWritable()
          await writable.write(blob)
          await writable.close()
          modal.toast(`已导出: ${filename}`, 'success')
          return
        } catch (e: any) {
          if (e.name === 'AbortError') return // user cancelled
        }
      }

      // Fallback: create blob URL and trigger download via hidden link
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      // Keep the element briefly in case browser needs it
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 60000)
      modal.toast(`已导出到下载文件夹: ${filename}`, 'success')
    } catch (e: any) {
      modal.toast('导出失败: ' + e.message, 'error')
    } finally {
      setExportingFull(false)
    }
  }

  const handleExportFull = async () => {
    if (!wid) return
    setShowExportDialog(true)
    setExportLoadingProjects(true)
    setExportSelectedIds(new Set())
    try {
      const data = await api.listProjects(1, 9999, wid)
      setExportProjects(data.projects || [])
    } catch { modal.toast('加载项目列表失败', 'error') }
    finally { setExportLoadingProjects(false) }
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
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--warning)' }}>{error}</div>
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 40 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 20px 0' }}>项目设置</h1>

      {/* Tab bar */}
      <div className="mgmt-tabs" style={{ display: 'flex', gap: 4, marginBottom: 20 }}>
        <button className={`mgmt-tab${tab === 'general' ? ' active' : ''}`}
          onClick={() => setTab('general')}>基本设置</button>
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
                          )} />
                        {r.name}
                      </label>
                    )
                  })}
                </div>
              </div>
            )}
            {/* Categories */}
            <div className="form-group">
              <label className="form-label">项目分类</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                {categories.map(c => (
                  <span key={c.id} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 4, fontSize: 12,
                    background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  }}>
                    {c.name}
                    <span style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 10 }}
                      onClick={() => deleteCategory(c.id)}>×</span>
                  </span>
                ))}
              </div>
              {canEdit && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input className="form-input" type="text" placeholder="新分类名称"
                    value={newCatName} onChange={e => setNewCatName(e.target.value)}
                    style={{ flex: 1 }} />
                  <button className="btn btn-primary btn-sm" disabled={catAdding || !newCatName.trim()} onClick={addCategory}>
                    {catAdding ? '添加中...' : '添加'}
                  </button>
                </div>
              )}
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
            {COLUMN_GROUPS.map(group => {
              const configs = columnConfigs.filter(c => c.column_id === group.id).sort((a, b) => a.sort_order - b.sort_order)
              return (
                <div key={group.id} style={{ marginBottom: 20 }}>
                  <div style={{
                    fontSize: 14, fontWeight: 600, marginBottom: 8,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{
                      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                      background: configs.length > 0 ? 'var(--success)' : 'var(--border)',
                    }} />
                    {group.label}
                    <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontWeight: 400 }}>
                      {configs.length} 个配置 | {group.summary}
                    </span>
                  </div>
                  {configs.map(c => (
                    <div key={c.id} style={{
                      border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', cursor: 'pointer',
                        background: openCols.has(c.id) ? 'var(--bg-hover)' : 'var(--card-bg)',
                      }} onClick={() => toggleCol(c.id)}>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          {openCols.has(c.id) ? '▼' : '▶'}
                        </span>
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{c.label}</span>
                        {group.hasTemplate && (
                          <span style={{
                            fontSize: 10, padding: '1px 6px', borderRadius: 3,
                            background: c.has_template ? 'var(--primary-light)' : 'var(--bg-secondary)',
                            color: c.has_template ? 'var(--primary)' : 'var(--text-secondary)',
                          }}>
                            {c.has_template ? '模板' : '无模板'}
                          </span>
                        )}
                      </div>
                      {openCols.has(c.id) && (
                        <div style={{ padding: '0 14px 14px 14px' }}>
                          <div className="form-group" style={{ marginTop: 8 }}>
                            <label className="form-label">Label</label>
                            <input className="form-input" type="text"
                              value={colValues[c.id]?.prompt || c.prompt || ''}
                              onChange={e => setColValues(prev => ({
                                ...prev,
                                [c.id]: { ...(prev[c.id] || { prompt: c.prompt, skill: c.skill }), prompt: e.target.value }
                              }))} />
                          </div>
                          <div className="form-group">
                            <label className="form-label">Skill (提示词)</label>
                            <textarea className="form-input" rows={6}
                              value={colValues[c.id]?.skill || c.skill || ''}
                              onChange={e => setColValues(prev => ({
                                ...prev,
                                [c.id]: { ...(prev[c.id] || { prompt: c.prompt, skill: c.skill }), skill: e.target.value }
                              }))} />
                          </div>
                          {RULES_COLUMNS.includes(group.id as any) && (
                            <>
                              <div className="form-group">
                                <label className="form-label">排版提取规则 (JSON)</label>
                                <textarea className="form-input" rows={4}
                                  value={colTypographySpec[c.id] || '{}'}
                                  onChange={e => setColTypographySpec(prev => ({ ...prev, [c.id]: e.target.value }))}
                                  style={{ fontFamily: 'monospace', fontSize: 11 }} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">大纲 Prompt</label>
                                <textarea className="form-input" rows={2}
                                  value={colOutlinePrompt[c.id] || ''}
                                  onChange={e => setColOutlinePrompt(prev => ({ ...prev, [c.id]: e.target.value }))} />
                              </div>
                              <div className="form-group">
                                <label className="form-label">认知原则</label>
                                <textarea className="form-input" rows={2}
                                  value={colCognitivePrinciples[c.id] || ''}
                                  onChange={e => setColCognitivePrinciples(prev => ({ ...prev, [c.id]: e.target.value }))} />
                              </div>
                            </>
                          )}
                          <button className="btn btn-primary btn-sm"
                            disabled={colSaving[c.id]}
                            onClick={() => {
                              setColSaving(prev => ({ ...prev, [c.id]: true }))
                              const v = colValues[c.id]
                              const payload: any = {}
                              if (v?.prompt !== undefined) payload.prompt = v.prompt
                              if (v?.skill !== undefined) payload.skill = v.skill
                              api.updateColumnConfig(c.id, payload)
                                .then(() => { modal.toast('已保存', 'success') })
                                .catch((e: any) => modal.toast('保存失败: ' + e.message, 'error'))
                                .finally(() => setColSaving(prev => ({ ...prev, [c.id]: false })))
                            }}>
                            {colSaving[c.id] ? '保存中...' : '保存'}
                          </button>
                          {RULES_COLUMNS.includes(group.id as any) && (
                            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }}
                              disabled={colRulesSaving[c.id]}
                              onClick={() => saveColRules(c.id, group.id)}>
                              {colRulesSaving[c.id] ? '保存中...' : '保存规则'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}

        {/* ═══ Tab: 核心配置 ═══ */}
        {tab === 'core' && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              {CORE_CATEGORIES.map(cat => (
                <button key={cat.key}
                  className={`btn btn-ghost btn-sm`}
                  style={{
                    fontWeight: coreCategory === cat.key ? 700 : 400,
                    color: coreCategory === cat.key ? 'var(--primary)' : 'var(--text-secondary)',
                    borderBottom: coreCategory === cat.key ? '2px solid var(--primary)' : '2px solid transparent',
                    borderRadius: 0,
                  }}
                  onClick={() => { setCoreCategory(cat.key); setCorePage(1) }}>
                  {cat.label}
                </button>
              ))}
            </div>
            {corePageItems.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>暂无配置</p>
            ) : (
              <>
                {corePageItems.map(c => {
                  const stageInfo = STAGE_LABELS[c.stage] || { label: c.stage || '其他', color: '#6b7280' }
                  return (
                    <div key={c.id} style={{
                      border: '1px solid var(--border)', borderRadius: 8, marginBottom: 12, padding: 14,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{
                          fontSize: 10, padding: '1px 6px', borderRadius: 3,
                          background: stageInfo.color + '22', color: stageInfo.color,
                        }}>{stageInfo.label}</span>
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{c.prompt_key}</span>
                        <span style={{ flex: 1 }} />
                        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{c.category}</span>
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8 }}>{c.label}</div>
                      {editingCoreId === c.id ? (
                        <div>
                          <textarea className="form-input" rows={10}
                            value={coreValues[c.id] || c.content || ''}
                            onChange={e => setCoreValues(prev => ({ ...prev, [c.id]: e.target.value }))}
                            style={{ fontFamily: 'monospace', fontSize: 11 }} />
                          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button className="btn btn-primary btn-sm"
                              disabled={coreSaving[c.id]}
                              onClick={() => {
                                setCoreSaving(prev => ({ ...prev, [c.id]: true }))
                                api.updateCorePromptConfig(c.id, { content: coreValues[c.id] || '' })
                                  .then(() => { modal.toast('已保存', 'success'); setEditingCoreId(null) })
                                  .catch((e: any) => modal.toast('保存失败: ' + e.message, 'error'))
                                  .finally(() => setCoreSaving(prev => ({ ...prev, [c.id]: false })))
                              }}>
                              {coreSaving[c.id] ? '保存中...' : '保存'}
                            </button>
                            <button className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setCoreValues(prev => ({ ...prev, [c.id]: c.content }))
                                setEditingCoreId(null)
                              }}>取消</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <pre style={{
                            fontSize: 10, whiteSpace: 'pre-wrap', maxHeight: 120, overflow: 'auto',
                            background: 'var(--bg-secondary)', padding: 8, borderRadius: 4,
                            margin: '0 0 8px 0', color: 'var(--text-secondary)',
                          }}>{coreValues[c.id] || c.content || ''}</pre>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => setEditingCoreId(c.id)}>编辑</button>
                        </div>
                      )}
                    </div>
                  )
                })}
                {coreTotalPages > 1 && (
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 16 }}>
                    {Array.from({ length: coreTotalPages }, (_, i) => (
                      <button key={i} className={`btn btn-ghost btn-sm`}
                        style={{
                          fontWeight: corePage === i + 1 ? 700 : 400,
                          color: corePage === i + 1 ? 'var(--primary)' : 'var(--text-secondary)',
                        }}
                        onClick={() => setCorePage(i + 1)}>
                        {i + 1}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Export ZIP Dialog */}
      {showExportDialog && (
        <div className="dialog-overlay"
          onMouseDown={(e: any) => { exportOverlayRef.current = e.target === e.currentTarget }}
          onClick={() => { if (exportOverlayRef.current) { setShowExportDialog(false); setExportProjects([]) } }}>
          <div className="dialog-box" style={{ width: 460, maxHeight: '80vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">导出完整数据</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12 }}>
              选择要导出的项目，或直接导出全部数据。
            </div>
            {exportLoadingProjects ? (
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: 24 }}>加载项目列表...</p>
            ) : (
              <>
                <div style={{ flex: 1, overflowY: 'auto', maxHeight: 360, border: '1px solid var(--border)', borderRadius: 6 }}>
                  {exportProjects.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center', padding: 24 }}>暂无项目</p>
                  ) : (
                    <>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                        background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)',
                        fontSize: 11, cursor: 'pointer', userSelect: 'none'
                      }} onClick={() => {
                        setExportSelectedIds(prev =>
                          prev.size === exportProjects.length
                            ? new Set()
                            : new Set(exportProjects.map(p => p.id))
                        )
                      }}>
                        <input type="checkbox" readOnly
                          checked={exportProjects.length > 0 && exportSelectedIds.size === exportProjects.length}
                          style={{ pointerEvents: 'none' }} />
                        <span style={{ color: 'var(--text-secondary)' }}>
                          {exportSelectedIds.size > 0 ? `已选 ${exportSelectedIds.size} / ${exportProjects.length} 项` : '全选'}
                        </span>
                      </div>
                      {exportProjects.map(p => (
                        <div key={p.id} style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
                          borderBottom: '1px solid var(--border)', fontSize: 12, cursor: 'pointer',
                          background: exportSelectedIds.has(p.id) ? 'var(--primary-light)' : undefined,
                        }} onClick={() => {
                          setExportSelectedIds(prev => {
                            const next = new Set(prev)
                            next.has(p.id) ? next.delete(p.id) : next.add(p.id)
                            return next
                          })
                        }}>
                          <input type="checkbox" readOnly checked={exportSelectedIds.has(p.id)} style={{ pointerEvents: 'none' }} />
                          <span style={{ color: 'var(--text-secondary)', minWidth: 28, textAlign: 'center' }}>{exportProjects.indexOf(p) + 1}</span>
                          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{p.project_code || ''}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowExportDialog(false); setExportProjects([]) }}>取消</button>
              <button className="btn btn-ghost btn-sm" disabled={exportSelectedIds.size === 0 || exportingFull}
                onClick={() => doExportFull([...exportSelectedIds])}>
                {exportingFull ? '导出中...' : `导出选中 (${exportSelectedIds.size})`}
              </button>
              <button className="btn btn-primary btn-sm" disabled={exportingFull}
                onClick={() => doExportFull()}>
                {exportingFull ? '导出中...' : '导出全部'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import ZIP Dialog */}
      {showImportDialog && (
        <div className="dialog-overlay"
          onMouseDown={(e: any) => { importOverlayRef.current = e.target === e.currentTarget }}
          onClick={() => { if (importOverlayRef.current) { setShowImportDialog(false); setImportZipFile(null) } }}>
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
