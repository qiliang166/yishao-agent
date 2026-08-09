import { useState, useEffect, useCallback, useRef } from 'react'
import { api, LLMProvider, notifyNoProvider } from '../services/api'
import { usePermission } from '../hooks/usePermission'
import Col3StructureEditor from '../components/Col3StructureEditor'

interface GeneratedConfigs {
  column_configs: any[]
  speech_configs: any[]
  tts_configs: any[]
  core_prompt_configs: any[]
}

interface SectionState {
  editing: Record<string, string>
}

interface SavedItem {
  id: string
  name: string
  industry_topic: string
  purpose_description: string
  provider_info: any
  created_at: string
  updated_at: string
}

const SECTION_LABELS: Record<string, string> = {
  column_configs: '栏目配置',
  speech_configs: '演讲配置',
  tts_configs: '语音合成配置',
  core_prompt_configs: '核心提示词',
}

const DRAFT_KEY = 'prompt_studio_draft'

export default function PromptStudioPage() {
  const canManagePrompt = usePermission('prompt.manage')
  // ── Top tab ──
  const [topTab, setTopTab] = useState<'generate' | 'saves'>('generate')

  // ── Input state ──
  const [industryTopic, setIndustryTopic] = useState('')
  const [purposeDesc, setPurposeDesc] = useState('')
  const [refWorkspaceId, setRefWorkspaceId] = useState('')

  // ── Provider / model selection ──
  const [providers, setProviders] = useState<LLMProvider[]>([])
  const [selProviderId, setSelProviderId] = useState('')
  const [selModel, setSelModel] = useState('')

  // ── Generation state ──
  const [generating, setGenerating] = useState(false)
  const [progressLines, setProgressLines] = useState<string[]>([])
  const [configs, setConfigs] = useState<GeneratedConfigs | null>(null)
  const [provider, setProvider] = useState<{ id: string; model: string } | null>(null)

  // ── Workspace list for apply target ──
  const [workspaces, setWorkspaces] = useState<any[]>([])
  const [applying, setApplying] = useState(false)
  const [applyTarget, setApplyTarget] = useState('')
  const [newWsName, setNewWsName] = useState('')
  const [creatingWs, setCreatingWs] = useState(false)

  // ── Accordion & editing state ──
  const [sections, setSections] = useState<Record<string, SectionState>>({})
  const [resultTab, setResultTab] = useState('column_configs')
  const [toastMsg, setToastMsg] = useState('')
  const [errorLog, setErrorLog] = useState<string[]>([])
  const toastTimer = useRef<any>(null)

  // ── Save to list state ──
  const [saveName, setSaveName] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Saved list state ──
  const [saves, setSaves] = useState<SavedItem[]>([])
  const [savesLoading, setSavesLoading] = useState(false)
  const [expandedSaveId, setExpandedSaveId] = useState<string | null>(null)
  const [expandedConfigs, setExpandedConfigs] = useState<GeneratedConfigs | null>(null)
  const [saveSections, setSaveSections] = useState<Record<string, SectionState>>({})
  const [saveResultTab, setSaveResultTab] = useState('column_configs')
  const [saveApplyTarget, setSaveApplyTarget] = useState('')
  const [saveApplying, setSaveApplying] = useState(false)
  const [saveEditing, setSaveEditing] = useState(false)
  const [genCol3VisualEdit, setGenCol3VisualEdit] = useState(false)
  const [saveCol3VisualEdit, setSaveCol3VisualEdit] = useState(false)

  // ── Template editor state ──
  const [showTemplateEditor, setShowTemplateEditor] = useState(false)
  const [templateSystemPrompt, setTemplateSystemPrompt] = useState('')
  const [templateUserMessage, setTemplateUserMessage] = useState('')
  const [templateSaving, setTemplateSaving] = useState(false)

  const loadTemplates = useCallback(async () => {
    try {
      const t = await api.getPromptStudioTemplates()
      setTemplateSystemPrompt(t.system_prompt)
      setTemplateUserMessage(t.user_message)
    } catch (e) {
      setToastMsg(`加载模板失败: ${e}`)
    }
  }, [])

  const handleSaveTemplates = async () => {
    setTemplateSaving(true)
    try {
      await api.updatePromptStudioTemplate('system_prompt', templateSystemPrompt)
      await api.updatePromptStudioTemplate('user_message', templateUserMessage)
      setToastMsg('模板已保存')
    } catch (e) {
      setToastMsg(`保存模板失败: ${e}`)
    } finally {
      setTemplateSaving(false)
    }
  }

  // Debounce timer for localStorage save
  const saveTimer = useRef<any>(null)

  // ── Load draft from localStorage on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) {
        const draft = JSON.parse(raw)
        if (draft.industryTopic) setIndustryTopic(draft.industryTopic)
        if (draft.purposeDesc) setPurposeDesc(draft.purposeDesc)
        if (draft.refWorkspaceId) setRefWorkspaceId(draft.refWorkspaceId)
        if (draft.configs) setConfigs(draft.configs)
        if (draft.provider) setProvider(draft.provider)
        if (draft.selProviderId) setSelProviderId(draft.selProviderId)
        if (draft.selModel) setSelModel(draft.selModel)
      }
    } catch {}

    api.listProviders().then(list => {
      setProviders(list)
      if (!list || list.length === 0) notifyNoProvider()
      const savedPid = localStorage.getItem(DRAFT_KEY) ? JSON.parse(localStorage.getItem(DRAFT_KEY)!).selProviderId : ''
      const savedModel = localStorage.getItem(DRAFT_KEY) ? JSON.parse(localStorage.getItem(DRAFT_KEY)!).selModel : ''
      if (savedPid && list.find(p => p.id === savedPid && p.is_enabled)) {
        setSelProviderId(savedPid)
        const prov = list.find(p => p.id === savedPid)
        const models = _parseModels(prov)
        if (savedModel && models.includes(savedModel)) {
          setSelModel(savedModel)
        } else {
          setSelModel(models[0] || '')
        }
      } else {
        const first = list.find(p => p.is_enabled)
        if (first) {
          setSelProviderId(first.id)
          const models = _parseModels(first)
          setSelModel(models[0] || '')
        }
      }
    }).catch(() => {})

    api.listWorkspaces(1, 100, { mine: true }).then(d => setWorkspaces(d.workspaces || [])).catch(() => {})
  }, [])

  // ── Save draft to localStorage (debounced 1s) ──
  const saveDraft = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const draft = { industryTopic, purposeDesc, refWorkspaceId, configs, provider, selProviderId, selModel }
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    }, 1000)
  }, [industryTopic, purposeDesc, refWorkspaceId, configs, provider, selProviderId, selModel])

  useEffect(() => { saveDraft() }, [saveDraft])

  const toast = (msg: string) => {
    setToastMsg(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    const isError = msg.includes('失败') || msg.includes('错误')
    toastTimer.current = setTimeout(() => setToastMsg(''), isError ? 15000 : 5000)
  }

  const logError = (msg: string) => {
    const ts = new Date().toLocaleTimeString('zh-CN')
    const line = `[${ts}] ${msg}`
    setErrorLog(prev => [...prev, line])
    toast(msg)
  }

  // Initialize section states when configs are loaded
  useEffect(() => {
    if (!configs) return
    const newSections: Record<string, SectionState> = {}
    for (const key of Object.keys(configs)) {
      const existing = sections[key]
      newSections[key] = {
        editing: existing ? existing.editing : {},
      }
    }
    setSections(newSections)
  }, [configs])

  const _parseModels = (p: LLMProvider | undefined): string[] => {
    if (!p) return []
    if (Array.isArray(p.models)) return p.models
    if (typeof p.models === 'string') {
      try { return JSON.parse(p.models) } catch { return [] }
    }
    return []
  }

  const selectedProviderModels = (() => {
    const p = providers.find(x => x.id === selProviderId)
    return _parseModels(p)
  })()

  // ── Poll progress during generation ──
  useEffect(() => {
    if (!generating) return
    setProgressLines([])
    const timer = setInterval(async () => {
      try {
        const res = await api.getPromptStudioProgress()
        if (res?.lines) setProgressLines(res.lines)
      } catch {}
    }, 2000)
    return () => clearInterval(timer)
  }, [generating])

  // ── Generate ──
  const handleGenerate = async () => {
    if (!industryTopic.trim() || !purposeDesc.trim()) {
      toast('请填写行业主题和用途描述')
      return
    }
    if (!selProviderId || !selModel) {
      toast('请选择生成模型')
      return
    }
    setGenerating(true)
    try {
      const result = await api.generatePrompts({
        industry_topic: industryTopic.trim(),
        purpose_description: purposeDesc.trim(),
        reference_workspace_id: refWorkspaceId.trim() || undefined,
        provider_id: selProviderId,
        model: selModel,
      })
      if (result?.configs) {
        setConfigs(result.configs as unknown as GeneratedConfigs)
        setProvider(result.provider)
        setSaveName(`${industryTopic.trim()} — 提示词配置`)
        setErrorLog([]) // clear old errors on success
        toast('生成完成，请逐项审核后应用或保存到列表')
      }
    } catch (e: any) {
      logError(`生成失败: ${e.message || e}`)
    } finally {
      setGenerating(false)
    }
  }

  // ── Apply ──
  const handleApply = async () => {
    if (!applyTarget || !configs) {
      toast('请选择目标工作区')
      return
    }
    const wsName = workspaces.find(w => w.id === applyTarget)?.name || applyTarget
    if (!confirm(`应用将覆盖工作区「${wsName}」现有的全部提示词配置（栏目/演讲/语音/核心提示词），是否继续？`)) return
    setApplying(true)
    try {
      await api.applyPrompts({ workspace_id: applyTarget, configs: configs as unknown as Record<string, any[]> })
      toast('配置已应用到工作区')
    } catch (e: any) {
      logError(`应用失败: ${e.message || e}`)
    } finally {
      setApplying(false)
    }
  }

  // ── Save to list ──
  const handleSaveToList = async () => {
    if (!configs) { toast('没有可保存的配置'); return }
    const name = saveName.trim()
    if (!name) { toast('请输入保存名称'); return }
    setSaving(true)
    try {
      await api.createPromptSave({
        name,
        industry_topic: industryTopic,
        purpose_description: purposeDesc,
        configs: configs as unknown as Record<string, any[]>,
        provider_info: provider || undefined,
      })
      toast('已保存到列表')
    } catch (e: any) {
      logError(`保存失败: ${e.message || e}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Workspace ops ──
  const handleCreateWorkspace = async () => {
    const name = newWsName.trim()
    if (!name) { toast('请输入工作区名称'); return }
    setCreatingWs(true)
    try {
      const ws = await api.createWorkspace(name) as any
      setWorkspaces(prev => [...prev, ws])
      setApplyTarget(ws.id)
      setNewWsName('')
      toast(`工作区"${name}"已创建并选中`)
    } catch (e: any) {
      logError(`创建工作区失败: ${e.message || e}`)
    } finally {
      setCreatingWs(false)
    }
  }

  // ── Export / Import ──
  const handleExport = () => {
    if (!configs) return
    const blob = new Blob([JSON.stringify(configs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `prompt-studio-${Date.now()}.json`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast('已导出 JSON')
  }

  const handleImport = () => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = '.json'
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0]
      if (!file) return
      try {
        const text = await file.text()
        const parsed = JSON.parse(text)
        if (!parsed.column_configs || !parsed.core_prompt_configs) {
          toast('无效的配置文件：缺少必要字段')
          return
        }
        setConfigs(parsed)
        toast('已导入配置，请审核后应用')
      } catch { toast('文件解析失败') }
    }
    input.click()
  }

  const updateEditing = (sectionKey: string, id: string, value: string) => {
    setSections(prev => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], editing: { ...prev[sectionKey]?.editing, [id]: value } },
    }))
  }

  const commitEdit = (sectionKey: string, id: string, field: string) => {
    const newVal = sections[sectionKey]?.editing?.[id]
    if (newVal === undefined) return
    setConfigs(prev => {
      if (!prev) return prev
      const updated = { ...prev }
      const list = (updated as any)[sectionKey] as any[]
      const idx = list.findIndex((item: any) => item.id === id)
      if (idx >= 0) list[idx] = { ...list[idx], [field]: newVal }
      return updated
    })
    setSections(prev => {
      const edits = { ...prev[sectionKey]?.editing }
      delete edits[id]
      return { ...prev, [sectionKey]: { ...prev[sectionKey], editing: edits } }
    })
  }

  const stageStyle = (stage: string) => {
    switch (stage) {
      case 'stage1-outline': return { bg: '#dbeafe', color: '#1d4ed8', label: '阶段1' }
      case 'stage2-structure': return { bg: '#ede9fe', color: '#6d28d9', label: '阶段2' }
      case 'stage3-html': return { bg: '#dcfce7', color: '#15803d', label: '阶段3' }
      default: return { bg: '#f3f4f6', color: '#6b7280', label: '辅助' }
    }
  }

  const renderConfigItem = (
    sectionKey: string, item: any,
    editState: Record<string, string>,
    onEdit: (sectionKey: string, id: string, val: string) => void,
    onCommit: (sectionKey: string, id: string, field: string) => void,
    visualEditor?: { show: boolean; onToggle: () => void; onSkillChange: (skill: string) => void },
  ) => {
    const id = item.id

    if (sectionKey === 'column_configs') {
      const isCol3 = item.column_id === 'col3'
      return (
        <div key={id} className="card" style={{ marginBottom: 10 }}>
          <div className="card-title" style={{ marginBottom: 6 }}>
            {item.column_id} — {item.label}
            {isCol3 && visualEditor && (
              <button
                className="btn btn-ghost btn-sm"
                onClick={visualEditor.onToggle}
                style={{ marginLeft: 10, fontSize: 10, padding: '2px 6px' }}
              >
                {visualEditor.show ? '收起可视化编辑器' : '可视化编辑结构'}
              </button>
            )}
          </div>
          {isCol3 && visualEditor?.show && (
            <div style={{ marginBottom: 10, padding: 8, border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg)' }}>
              <Col3StructureEditor
                initialSkill={editState[id] !== undefined ? editState[id] : (item.skill || '[]')}
                onSaved={(skill) => visualEditor.onSkillChange(skill)}
              />
            </div>
          )}
          {['prompt', 'skill'].map(field => (
            <div key={field} style={{ marginBottom: 8 }}>
              <label className="form-label">{field === 'prompt' ? '提示词（角色定义）' : 'SKILL（输出模板）'}</label>
              <textarea
                className="form-textarea"
                value={editState[id] !== undefined ? editState[id] : (item[field] || '')}
                onChange={e => onEdit(sectionKey, id, e.target.value)}
                onBlur={() => onCommit(sectionKey, id, field)}
                rows={field === 'prompt' ? 3 : 5}
              />
            </div>
          ))}
          <div style={{ marginBottom: 8 }}>
            <label className="form-label">Rules (JSON)</label>
            <textarea
              className="form-textarea"
              value={editState[id + '_rules'] !== undefined ? editState[id + '_rules'] : (typeof item.rules === 'string' ? item.rules : JSON.stringify(item.rules, null, 2))}
              onChange={e => onEdit(sectionKey, id + '_rules', e.target.value)}
              onBlur={() => onCommit(sectionKey, id, 'rules')}
              rows={4}
            />
          </div>
        </div>
      )
    }

    if (sectionKey === 'speech_configs' || sectionKey === 'tts_configs') {
      return (
        <div key={id} className="card" style={{ marginBottom: 10 }}>
          <div className="card-title" style={{ marginBottom: 6 }}>{item.label}</div>
          {['prompt', 'skill'].map(field => (
            <div key={field} style={{ marginBottom: 8 }}>
              <label className="form-label">{field}</label>
              <textarea
                className="form-textarea"
                value={editState[id] !== undefined ? editState[id] : (item[field] || '')}
                onChange={e => onEdit(sectionKey, id, e.target.value)}
                onBlur={() => onCommit(sectionKey, id, field)}
                rows={3}
              />
            </div>
          ))}
        </div>
      )
    }

    if (sectionKey === 'core_prompt_configs') {
      const st = stageStyle(item.stage)
      return (
        <div key={id} className="card" style={{ marginBottom: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 500,
              background: st.bg, color: st.color,
            }}>{st.label}</span>
            <span style={{ fontWeight: 600, fontSize: 11 }}>{item.label}</span>
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginBottom: 3 }}>{item.prompt_key} · {item.category}</div>
          <textarea
            className="form-textarea"
            value={editState[id] !== undefined ? editState[id] : (item.content || '')}
            onChange={e => onEdit(sectionKey, id, e.target.value)}
            onBlur={() => onCommit(sectionKey, id, 'content')}
            rows={3}
            style={{ fontSize: 10 }}
          />
        </div>
      )
    }

    return null
  }

  // ── Load saves list ──
  const loadSaves = async () => {
    setSavesLoading(true)
    try {
      const data = await api.listPromptSaves()
      setSaves(data.saves || [])
    } catch (e: any) {
      logError(`加载列表失败: ${e.message || e}`)
    } finally {
      setSavesLoading(false)
    }
  }

  useEffect(() => {
    if (topTab === 'saves') loadSaves()
  }, [topTab])

  // ── Expand a saved config ──
  const handleExpandSave = async (saveId: string) => {
    if (expandedSaveId === saveId) {
      setExpandedSaveId(null)
      setExpandedConfigs(null)
      setSaveSections({})
      return
    }
    try {
      const data = await api.getPromptSave(saveId)
      const cfg = data.save.configs as GeneratedConfigs
      setExpandedSaveId(saveId)
      setExpandedConfigs(cfg)
      const secs: Record<string, SectionState> = {}
      for (const key of Object.keys(cfg)) {
        secs[key] = { editing: {} }
      }
      setSaveSections(secs)
      setSaveResultTab('column_configs')
      setSaveEditing(false)
    } catch (e: any) {
      logError(`加载详情失败: ${e.message || e}`)
    }
  }

  // ── Edit save configs (inline) ──
  const updateSaveEditing = (sectionKey: string, id: string, value: string) => {
    setSaveSections(prev => ({
      ...prev,
      [sectionKey]: { ...prev[sectionKey], editing: { ...prev[sectionKey]?.editing, [id]: value } },
    }))
    if (!saveEditing) setSaveEditing(true)
  }

  const commitSaveEdit = (sectionKey: string, id: string, field: string) => {
    const newVal = saveSections[sectionKey]?.editing?.[id]
    if (newVal === undefined) return
    setExpandedConfigs(prev => {
      if (!prev) return prev
      const updated = { ...prev }
      const list = (updated as any)[sectionKey] as any[]
      const idx = list.findIndex((item: any) => item.id === id)
      if (idx >= 0) list[idx] = { ...list[idx], [field]: newVal }
      return updated
    })
    setSaveSections(prev => {
      const edits = { ...prev[sectionKey]?.editing }
      delete edits[id]
      return { ...prev, [sectionKey]: { ...prev[sectionKey], editing: edits } }
    })
  }

  // ── Save edits to backend ──
  const handleUpdateSave = async () => {
    if (!expandedSaveId || !expandedConfigs) return
    try {
      await api.updatePromptSave(expandedSaveId, { configs: expandedConfigs as unknown as Record<string, any[]> })
      setSaveEditing(false)
      toast('修改已保存')
    } catch (e: any) {
      logError(`更新失败: ${e.message || e}`)
    }
  }

  // ── Apply saved config ──
  const handleApplySave = async (saveId: string) => {
    if (!saveApplyTarget) { toast('请选择目标工作区'); return }
    const wsName = workspaces.find(w => w.id === saveApplyTarget)?.name || saveApplyTarget
    if (!confirm(`应用将覆盖工作区「${wsName}」现有的全部提示词配置（栏目/演讲/语音/核心提示词），是否继续？`)) return
    setSaveApplying(true)
    try {
      let cfg = expandedConfigs
      if (!cfg || expandedSaveId !== saveId) {
        const data = await api.getPromptSave(saveId)
        cfg = data.save.configs
      }
      await api.applyPrompts({ workspace_id: saveApplyTarget, configs: cfg as unknown as Record<string, any[]> })
      toast('配置已应用到工作区')
    } catch (e: any) {
      logError(`应用失败: ${e.message || e}`)
    } finally {
      setSaveApplying(false)
    }
  }

  // ── Delete save ──
  const handleDeleteSave = async (saveId: string) => {
    if (!confirm('确定删除此条保存记录？')) return
    try {
      await api.deletePromptSave(saveId)
      if (expandedSaveId === saveId) {
        setExpandedSaveId(null)
        setExpandedConfigs(null)
        setSaveSections({})
      }
      setSaves(prev => prev.filter(s => s.id !== saveId))
      toast('已删除')
    } catch (e: any) {
      logError(`删除失败: ${e.message || e}`)
    }
  }

  const formatDate = (d: string) => {
    if (!d) return ''
    return new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  // ══════════════════════════════════════════════
  // Render: Generate Tab (unchanged from original)
  // ══════════════════════════════════════════════

  const renderGenerateTab = () => (
    <div style={{ display: 'flex', gap: 20 }}>
      {/* Left: Input Area */}
      <div style={{ width: 320, flexShrink: 0 }}>
        <div className="card" style={{ position: 'sticky', top: 24 }}>
          <div className="card-title">输入参数</div>

          <div style={{ marginBottom: 10 }}>
            <label className="form-label">行业主题</label>
            <input
              type="text"
              className="form-input"
              value={industryTopic}
              onChange={e => setIndustryTopic(e.target.value)}
              placeholder="例如：新能源汽车维修、金融风控、医疗器械..."
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label className="form-label">用途描述</label>
            <textarea
              className="form-textarea"
              value={purposeDesc}
              onChange={e => setPurposeDesc(e.target.value)}
              placeholder="例如：为新入职技师制作培训课件，包含理论知识和实操流程..."
              rows={3}
            />
          </div>

          <div style={{ marginBottom: 10 }}>
            <label className="form-label">参考工作区（可选）</label>
            <select
              className="form-select"
              value={refWorkspaceId}
              onChange={e => setRefWorkspaceId(e.target.value)}
            >
              <option value="">使用默认种子配置</option>
              {workspaces.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label className="form-label">生成模型</label>
            <select
              className="form-select"
              value={selProviderId}
              onChange={e => {
                setSelProviderId(e.target.value)
                const p = providers.find(x => x.id === e.target.value)
                const models = _parseModels(p)
                setSelModel(models[0] || '')
              }}
              style={{ marginBottom: 4 }}
            >
              {providers.filter(p => p.is_enabled).length === 0 && (
                <option value="">无可用提供商</option>
              )}
              {providers.filter(p => p.is_enabled).map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {selectedProviderModels.length > 1 && (
              <select
                className="form-select"
                value={selModel}
                onChange={e => setSelModel(e.target.value)}
              >
                {selectedProviderModels.map(m => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            )}
            {selectedProviderModels.length <= 1 && selModel && (
              <div className="form-input" style={{ color: 'var(--text-secondary)' }}>{selModel}</div>
            )}
          </div>

          <div style={{ marginBottom: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <label className="form-label">新建工作区</label>
            <div className="form-row">
              <input
                type="text"
                className="form-input"
                value={newWsName}
                onChange={e => setNewWsName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateWorkspace()}
                placeholder="工作区名称..."
              />
              {canManagePrompt && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleCreateWorkspace}
                  disabled={creatingWs || !newWsName.trim()}
                  style={{ flex: 'none' }}
                >
                  {creatingWs ? '...' : '创建'}
                </button>
              )}
            </div>
          </div>

          {canManagePrompt && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={generating || !industryTopic.trim() || !purposeDesc.trim() || !selProviderId || !selModel}
              style={{ flex: 1 }}
            >
              {generating ? '生成中...' : '生成全部配置'}
            </button>
            <button
              className="btn btn-sm"
              onClick={() => {
                setIndustryTopic('')
                setPurposeDesc('')
                setRefWorkspaceId('')
                setConfigs(null)
                setProgressLines([])
                localStorage.removeItem(DRAFT_KEY)
                toast('已清空')
              }}
              disabled={generating}
              style={{ flex: 'none' }}
            >
              清空
            </button>
          </div>
          )}

          <div className="form-hint">
            生成 44 条配置（5个栏目 + 3个演讲 + 3个语音 + 33个核心提示词），预计需 30-60 秒。生成后请在右侧逐项审核再应用。
          </div>

          {/* Template Editor Toggle */}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <button
              className="btn btn-sm"
              onClick={() => {
                const next = !showTemplateEditor
                setShowTemplateEditor(next)
                if (next) loadTemplates()
              }}
              style={{ fontSize: 11 }}
            >
              {showTemplateEditor ? '▾' : '▸'} 编辑生成提示词模板
            </button>
            {showTemplateEditor && (
              <div style={{ marginTop: 8 }}>
                <label className="form-label">System Prompt（平台说明 + 配置规范 + 适配规则）</label>
                <textarea
                  className="form-textarea"
                  value={templateSystemPrompt}
                  onChange={e => setTemplateSystemPrompt(e.target.value)}
                  rows={8}
                  style={{ fontSize: 10, fontFamily: 'monospace' }}
                />
                <label className="form-label" style={{ marginTop: 8 }}>User Message（参考配置 + 生成指令）</label>
                <textarea
                  className="form-textarea"
                  value={templateUserMessage}
                  onChange={e => setTemplateUserMessage(e.target.value)}
                  rows={5}
                  style={{ fontSize: 10, fontFamily: 'monospace' }}
                />
                {canManagePrompt && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={handleSaveTemplates}
                    disabled={templateSaving}
                    style={{ marginTop: 6, width: '100%' }}
                  >
                    {templateSaving ? '保存中...' : '保存模板'}
                  </button>
                )}
                <div className="form-hint" style={{ marginTop: 4 }}>
                  占位符 {`{{industry_topic}}`} {`{{purpose_description}}`} {`{{ref_summary}}`} {`{{ref_json}}`} 将在生成时自动替换。
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Results */}
      <div style={{ flex: 1, minWidth: 0, padding: '0 16px 0 0' }}>
        {!configs && !generating && errorLog.length === 0 && (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎨</div>
            <div className="card-title">输入行业主题和用途，开始生成</div>
            <div className="form-hint" style={{ marginTop: 4 }}>所有编辑自动保存在浏览器本地，刷新页面不会丢失</div>
          </div>
        )}

        {errorLog.length > 0 && (
          <div className="card" style={{ padding: 12, marginBottom: 12, border: '1px solid var(--danger)', background: '#fff5f5' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontWeight: 600, color: 'var(--danger)', fontSize: 12 }}>错误日志（可截图发给管理员）</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setErrorLog([])} style={{ fontSize: 10, padding: '1px 6px' }}>
                清除
              </button>
            </div>
            <div style={{
              background: '#1e1e1e', color: '#f48771', fontFamily: 'Consolas, monospace',
              fontSize: 12, padding: 10, borderRadius: 4, maxHeight: 200, overflowY: 'auto',
              lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {errorLog.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          </div>
        )}

        {generating && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{
              background: '#1e1e1e', color: '#d4d4d4', fontFamily: 'Consolas, monospace',
              fontSize: 12, padding: 12, borderRadius: 6, maxHeight: 300, overflowY: 'auto',
              lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            }}>
              {progressLines.length > 0
                ? progressLines.map((line, i) => <div key={i}>{line}</div>)
                : <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div className="spinner" /><span>正在生成全部配置，请稍候...</span>
                  </div>
              }
            </div>
          </div>
        )}

        {configs && !generating && (
          <div>
            {/* Tabs */}
            <div className="mgmt-tabs">
              {Object.keys(configs).map(key => {
                const items = (configs as any)[key] as any[]
                return (
                  <button
                    key={key}
                    className={`mgmt-tab${resultTab === key ? ' active' : ''}`}
                    onClick={() => setResultTab(key)}
                  >
                    {SECTION_LABELS[key] || key} ({items?.length || 0})
                  </button>
                )
              })}
            </div>

            {/* Tab Content */}
            <div className="mgmt-content">
              {((configs as any)[resultTab] || []).map((item: any) => renderConfigItem(
                resultTab, item, sections[resultTab]?.editing || {}, updateEditing, commitEdit,
                item.column_id === 'col3' ? {
                  show: genCol3VisualEdit,
                  onToggle: () => setGenCol3VisualEdit(prev => !prev),
                  onSkillChange: (skill) => {
                    setConfigs(prev => {
                      if (!prev) return prev
                      const updated = { ...prev }
                      const list = [...updated.column_configs]
                      const idx = list.findIndex((x: any) => x.id === item.id)
                      if (idx >= 0) list[idx] = { ...list[idx], skill }
                      updated.column_configs = list
                      return updated
                    })
                  },
                } : undefined,
              ))}
            </div>

            {/* Save name + Action Bar */}
            <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select
                className="form-select"
                value={applyTarget}
                onChange={e => setApplyTarget(e.target.value)}
                style={{ flex: 1, maxWidth: 300 }}
              >
                <option value="">选择目标工作区...</option>
                {workspaces.map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <input
                type="text"
                className="form-input"
                value={newWsName}
                onChange={e => setNewWsName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateWorkspace()}
                placeholder="新建..."
                style={{ width: 100 }}
              />
              {canManagePrompt && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={handleCreateWorkspace}
                  disabled={creatingWs || !newWsName.trim()}
                  style={{ flex: 'none' }}
                >
                  + 新建
                </button>
              )}
              {canManagePrompt && (
                <button
                  className="btn btn-primary"
                  onClick={handleApply}
                  disabled={applying || !applyTarget}
                >
                  {applying ? '应用中...' : '应用到工作区'}
                </button>
              )}
              <div style={{ flex: 1 }} />
              <input
                type="text"
                className="form-input"
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                placeholder="保存名称..."
                style={{ width: 160 }}
              />
              {canManagePrompt && (
                <button className="btn btn-ghost" onClick={handleSaveToList} disabled={saving}>
                  {saving ? '保存中...' : '保存到列表'}
                </button>
              )}
              {canManagePrompt && <button className="btn btn-ghost" onClick={handleExport}>导出 JSON</button>}
              {canManagePrompt && (
                <button className="btn btn-ghost" onClick={handleImport}>导入 JSON</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ══════════════════════════════════════════════
  // Render: Saves List Tab
  // ══════════════════════════════════════════════

  const renderSavesTab = () => (
    <div style={{ display: 'flex', gap: 20 }}>
      {/* Left: Saved list */}
      <div style={{ width: 380, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>已保存的配置列表</span>
          <button className="btn btn-ghost btn-sm" onClick={loadSaves} disabled={savesLoading}
            style={{ fontSize: 11, padding: '2px 8px' }}>
            {savesLoading ? '加载中...' : '刷新'}
          </button>
        </div>

        {!savesLoading && saves.length === 0 && (
          <div className="card" style={{ padding: 40, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              暂无保存的配置。在"生成提示词"标签页生成配置后，点击"保存到列表"即可在此查看。
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 'calc(100vh - 220px)', overflowY: 'auto' }}>
          {saves.map(s => (
            <div key={s.id} style={{
              border: expandedSaveId === s.id ? '2px solid var(--primary)' : '1px solid var(--border)',
              borderRadius: 6, padding: 10, background: 'var(--bg-secondary)', cursor: 'pointer',
            }}>
              <div onClick={() => handleExpandSave(s.id)} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.industry_topic}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{s.provider_info?.model || ''}</span>
                  <span>{formatDate(s.updated_at)}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <select
                  className="form-select"
                  value={saveApplyTarget}
                  onChange={e => setSaveApplyTarget(e.target.value)}
                  style={{ flex: 1, fontSize: 11 }}
                >
                  <option value="">选择工作区...</option>
                  {workspaces.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                <button
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={(e) => { e.stopPropagation(); handleApplySave(s.id) }}
                  disabled={saveApplying || !saveApplyTarget}
                >
                  {saveApplying ? '...' : '应用'}
                </button>
                {canManagePrompt && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11, padding: '2px 8px', color: 'var(--danger)' }}
                    onClick={(e) => { e.stopPropagation(); handleDeleteSave(s.id) }}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Expanded config detail */}
      <div style={{ flex: 1, minWidth: 0, padding: '0 16px 0 0' }}>
        {!expandedSaveId && (
          <div className="card" style={{ padding: 60, textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              点击左侧列表中的配置项查看详情
            </div>
          </div>
        )}

        {expandedSaveId && expandedConfigs && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {saves.find(s => s.id === expandedSaveId)?.name || ''}
              </span>
              {saveEditing && (
                <span style={{ fontSize: 10, color: 'var(--warning)' }}>已修改，请保存</span>
              )}
              <div style={{ flex: 1 }} />
              {saveEditing && (
                <button className="btn btn-primary btn-sm" onClick={handleUpdateSave} style={{ fontSize: 11 }}>
                  保存修改
                </button>
              )}
            </div>

            <div className="mgmt-tabs">
              {Object.keys(expandedConfigs).map(key => {
                const items = (expandedConfigs as any)[key] as any[]
                return (
                  <button
                    key={key}
                    className={`mgmt-tab${saveResultTab === key ? ' active' : ''}`}
                    onClick={() => setSaveResultTab(key)}
                  >
                    {SECTION_LABELS[key] || key} ({items?.length || 0})
                  </button>
                )
              })}
            </div>

            <div className="mgmt-content">
              {((expandedConfigs as any)[saveResultTab] || []).map((item: any) =>
                renderConfigItem(
                  saveResultTab, item, saveSections[saveResultTab]?.editing || {}, updateSaveEditing, commitSaveEdit,
                  item.column_id === 'col3' ? {
                    show: saveCol3VisualEdit,
                    onToggle: () => setSaveCol3VisualEdit(prev => !prev),
                    onSkillChange: (skill) => {
                      setExpandedConfigs(prev => {
                        if (!prev) return prev
                        const updated = { ...prev }
                        const list = [...updated.column_configs]
                        const idx = list.findIndex((x: any) => x.id === item.id)
                        if (idx >= 0) list[idx] = { ...list[idx], skill }
                        updated.column_configs = list
                        return updated
                      })
                      if (!saveEditing) setSaveEditing(true)
                    },
                  } : undefined,
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // ══════════════════════════════════════════════
  // Main Render
  // ══════════════════════════════════════════════

  return (
    <div>
      <div className="mgmt-tabs">
        <button
          className={`mgmt-tab${topTab === 'generate' ? ' active' : ''}`}
          onClick={() => setTopTab('generate')}
        >
          生成提示词
        </button>
        <button
          className={`mgmt-tab${topTab === 'saves' ? ' active' : ''}`}
          onClick={() => setTopTab('saves')}
        >
          生成列表
        </button>
      </div>
      <div className="mgmt-content">
        {topTab === 'generate' ? renderGenerateTab() : renderSavesTab()}
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="toast-popup" style={{
          position: 'fixed', bottom: 24, right: 24, padding: '10px 20px',
          background: 'var(--bg-inverse, #333)', color: '#fff', borderRadius: 8,
          fontSize: 13, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 9999,
        }}>
          {toastMsg}
        </div>
      )}
    </div>
  )
}
