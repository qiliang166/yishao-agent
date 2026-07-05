import { useState, useEffect } from 'react'
import { api } from '../services/api'
import { useModal } from '../components/ModalProvider'
import HelpButton from '../components/HelpButton'
import Col3StructureEditor from '../components/Col3StructureEditor'

type MainTab = 'models' | 'defaults'
type SeedSubTab = 'columns' | 'core'

const COLUMN_GROUPS = [
  { id: 'col1', label: '素材输入', hasTemplate: false, summary: '输入配置' },
  { id: 'col2', label: '文档生成', hasTemplate: false, summary: '文档配置' },
  { id: 'col3', label: '文档课件', hasTemplate: true, summary: '导出配置', tmplFile: '' },
  { id: 'col4', label: '分析PPT', hasTemplate: true, summary: '分析文档 | PPT配置', tmplFile: '' },
  { id: 'col5', label: '综合PPT', hasTemplate: true, summary: '综合文档 | PPT配置', tmplFile: '' },
  { id: 'col6', label: '课件演讲', hasTemplate: false, summary: '演讲配置' },
  { id: 'col7', label: '语音合成', hasTemplate: false, summary: '角色提示词 | SKILL' },
]

const RULES_COLUMNS = ['col3', 'col4', 'col5'] as const

interface ColumnConfig {
  id: string
  column_id: string
  label: string
  prompt: string
  skill: string
  has_template: number
  template_path: string | null
  sort_order: number
  rules?: string
}

interface SpeechConfig { id: string; label: string; prompt: string; skill: string; sort_order: number }

interface CorePromptConfig {
  id: string
  prompt_key: string
  category: string
  label: string
  content: string
  sort_order: number
  stage: string
}

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

export default function ProjSettingsPage() {
  const modal = useModal()
  const [mainTab, setMainTab] = useState<MainTab>('models')
  const [seedSubTab, setSeedSubTab] = useState<SeedSubTab>('columns')

  const [passwordEnabled, setPasswordEnabled] = useState(false)
  const [sessionVerified, setSessionVerified] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [pendingTab, setPendingTab] = useState<MainTab | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordChecking, setPasswordChecking] = useState(false)
  const [providers, setProviders] = useState<any[]>([])

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

  // Speech configs
  const [speechConfigs, setSpeechConfigs] = useState<SpeechConfig[]>([])
  const [speechValues, setSpeechValues] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [speechSaving, setSpeechSaving] = useState<Record<string, boolean>>({})

  // TTS configs
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

  // Accordion state
  const [openCols, setOpenCols] = useState<Set<string>>(new Set())

  // Scenario file editor
  const [scenarioFiles, setScenarioFiles] = useState<Record<string, {name: string; size: number; source: string}[]>>({})
  const [editingScFile, setEditingScFile] = useState<{colId: string; filename: string} | null>(null)
  const [scFileContent, setScFileContent] = useState('')
  const [scFileSaving, setScFileSaving] = useState(false)

  const loadScenarioFiles = (colId: string) => {
    api.listScenarioFiles(colId).then(data => {
      setScenarioFiles(prev => ({ ...prev, [colId]: data.files }))
    }).catch(() => {})
  }
  const openScenarioFile = async (colId: string, filename: string) => {
    setEditingScFile({ colId, filename })
    setScFileContent('')
    try {
      const data = await api.getScenarioFile(colId, filename)
      setScFileContent(data.content || '')
    } catch { setScFileContent('') }
  }
  const saveScenarioFile = async () => {
    if (!editingScFile) return
    setScFileSaving(true)
    try {
      await api.saveScenarioFile(editingScFile.colId, editingScFile.filename, scFileContent)
      modal.toast('已保存', 'success')
      loadScenarioFiles(editingScFile.colId)
      setEditingScFile(null)
    } catch (e: any) {
      modal.toast('保存失败: ' + e.message, 'error')
    } finally { setScFileSaving(false) }
  }

  // Provider form
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [editProviderId, setEditProviderId] = useState<string | null>(null)
  const [pvName, setPvName] = useState('')
  const [pvKey, setPvKey] = useState('')
  const [pvUrl, setPvUrl] = useState('')
  const [pvModels, setPvModels] = useState('')
  const [pvSaving, setPvSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)

  // TTS
  const [ttsProviders, setTtsProviders] = useState<any[]>([])
  const [showTtsProviderForm, setShowTtsProviderForm] = useState(false)
  const [editTtsProviderId, setEditTtsProviderId] = useState<string | null>(null)
  const [tpvName, setTpvName] = useState('')
  const [tpvKey, setTpvKey] = useState('')
  const [tpvUrl, setTpvUrl] = useState('')
  const [tpvModels, setTpvModels] = useState('')
  const [tpvDefault, setTpvDefault] = useState(false)
  const [tpvSaving, setTpvSaving] = useState(false)
  const [ttsTestingId, setTtsTestingId] = useState<string | null>(null)

  // ASR
  const [asrProviders, setAsrProviders] = useState<any[]>([])
  const [showAsrProviderForm, setShowAsrProviderForm] = useState(false)
  const [editAsrProviderId, setEditAsrProviderId] = useState<string | null>(null)
  const [apvName, setApvName] = useState('')
  const [apvKey, setApvKey] = useState('')
  const [apvUrl, setApvUrl] = useState('')
  const [apvModels, setApvModels] = useState('')
  const [apvDefault, setApvDefault] = useState(false)
  const [apvSaving, setApvSaving] = useState(false)
  const [asrTestingId, setAsrTestingId] = useState<string | null>(null)

  // Image
  const [imageProviders, setImageProviders] = useState<any[]>([])
  const [showImageProviderForm, setShowImageProviderForm] = useState(false)
  const [editImageProviderId, setEditImageProviderId] = useState<string | null>(null)
  const [ipvName, setIpvName] = useState('')
  const [ipvKey, setIpvKey] = useState('')
  const [ipvUrl, setIpvUrl] = useState('')
  const [ipvModels, setIpvModels] = useState('')
  const [ipvDefault, setIpvDefault] = useState(false)
  const [ipvSaving, setIpvSaving] = useState(false)
  const [imageTestingId, setImageTestingId] = useState<string | null>(null)

  const load = () => {
    api.listProviders().then(setProviders).catch(() => {})
    api.listTtsProviders().then(setTtsProviders).catch(() => {})
    api.listAsrProviders().then(setAsrProviders).catch(() => {})
    api.listImageProviders().then(setImageProviders).catch(() => {})
    api.listColumnConfigs().then((configs: ColumnConfig[]) => {
      setColumnConfigs(configs)
      const vals: Record<string, { prompt: string; skill: string }> = {}
      const typo: Record<string, string> = {}
      const outline: Record<string, string> = {}
      const cognitive: Record<string, string> = {}
      configs.forEach(c => {
        vals[c.id] = { prompt: c.prompt, skill: c.skill }
        const { typographySpec, outlinePrompt, cognitivePrinciples } = splitRules(c.rules || '{}')
        typo[c.column_id] = typographySpec
        outline[c.column_id] = outlinePrompt
        cognitive[c.column_id] = cognitivePrinciples
      })
      setColValues(vals)
      setColTypographySpec(typo)
      setColOutlinePrompt(outline)
      setColCognitivePrinciples(cognitive)
    }).catch(() => {})
    api.listSpeechConfigs().then((configs: SpeechConfig[]) => {
      setSpeechConfigs(configs)
      const vals: Record<string, { prompt: string; skill: string }> = {}
      configs.forEach(c => { vals[c.id] = { prompt: c.prompt, skill: c.skill } })
      setSpeechValues(vals)
    }).catch(() => {})
    api.listTtsConfigs().then((configs: SpeechConfig[]) => {
      setTtsConfigs(configs)
      const vals: Record<string, { prompt: string; skill: string }> = {}
      configs.forEach(c => { vals[c.id] = { prompt: c.prompt, skill: c.skill } })
      setTtsValues(vals)
    }).catch(() => {})
    api.listCorePromptConfigs().then((configs: CorePromptConfig[]) => {
      setCoreConfigs(configs)
      const vals: Record<string, string> = {}
      configs.forEach(c => { vals[c.id] = c.content || '' })
      setCoreValues(vals)
    }).catch(() => {})
    api.getSettings().then(data => {
      const s = data.settings || {}
      if (s.admin_password_enabled === '1') setPasswordEnabled(true)
    }).catch(() => {})
  }
  useEffect(() => { load() }, [])

  const toggleCol = (id: string) => {
    setOpenCols(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else {
        next.add(id)
        if (RULES_COLUMNS.includes(id as any) && !scenarioFiles[id]) {
          loadScenarioFiles(id)
        }
      }
      return next
    })
  }

  useEffect(() => {
    if (passwordEnabled && !sessionVerified) {
      const timer = setTimeout(() => {
        setPendingTab('models')
        setShowPasswordDialog(true)
        setPasswordInput('')
        setPasswordError('')
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [passwordEnabled])

  const handleTabClick = (tab: MainTab) => {
    if (passwordEnabled && !sessionVerified) {
      setPendingTab(tab)
      setShowPasswordDialog(true)
      setPasswordInput('')
      setPasswordError('')
    } else {
      setMainTab(tab)
    }
  }

  const handlePasswordSubmit = async () => {
    if (!passwordInput.trim()) { setPasswordError('请输入密码'); return }
    setPasswordChecking(true); setPasswordError('')
    try {
      await api.verifyPassword(passwordInput)
      setSessionVerified(true)
      setShowPasswordDialog(false)
      if (pendingTab) { setMainTab(pendingTab); setPendingTab(null) }
    } catch (err: any) {
      setPasswordError(err.message || '密码错误')
    } finally { setPasswordChecking(false) }
  }

  // Provider actions (unchanged)
  const openEditProvider = (p: any) => {
    setEditProviderId(p.id); setPvName(p.name || ''); setPvKey(p.api_key || '')
    setPvUrl(p.base_url || ''); setPvModels(Array.isArray(p.models) ? p.models.join(', ') : (p.models || ''))
    setShowProviderForm(true)
  }
  const openNewProvider = () => {
    setEditProviderId(null); setPvName(''); setPvKey(''); setPvUrl('https://api.deepseek.com/v1')
    setPvModels('deepseek-chat, deepseek-reasoner'); setShowProviderForm(true)
  }
  const saveProvider = async () => {
    if (!pvName.trim()) { modal.toast('请输入名称', 'error'); return }
    setPvSaving(true)
    try {
      const models = pvModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (editProviderId) await api.updateProvider(editProviderId, { name: pvName.trim(), api_key: pvKey, base_url: pvUrl, models })
      else await api.createProvider({ name: pvName.trim(), api_key: pvKey, base_url: pvUrl, models })
      await api.listProviders().then(setProviders); setShowProviderForm(false)
      modal.toast(editProviderId ? '提供商已更新' : '提供商已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setPvSaving(false) }
  }
  const testProvider = async (id: string) => {
    setTestingId(id)
    try {
      const result: any = await api.testProvider(id)
      if (result.ok) modal.toast(`连接成功 (${(result.models || []).length} 个模型可用)`, 'success')
      else modal.toast('连接失败: ' + (result.error || '未知错误'), 'error')
    } catch (e: any) { modal.toast('测试失败: ' + e.message, 'error') }
    finally { setTestingId(null) }
  }
  const deleteProvider = async (id: string, name: string) => {
    if (!await modal.confirm(`确定删除提供商「${name}」？`)) return
    try { await api.deleteProvider(id); await api.listProviders().then(setProviders); modal.toast('已删除', 'success') }
    catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  // TTS Provider actions
  const openNewTtsProvider = () => {
    setEditTtsProviderId(null); setTpvName(''); setTpvKey(''); setTpvUrl('https://dashscope.aliyuncs.com/api/v1')
    setTpvModels('cosyvoice-v3-flash, cosyvoice-v3-plus'); setTpvDefault(false); setShowTtsProviderForm(true)
  }
  const openEditTtsProvider = (p: any) => {
    setEditTtsProviderId(p.id); setTpvName(p.name || ''); setTpvKey(p.api_key || '')
    setTpvUrl(p.base_url || ''); setTpvModels(Array.isArray(p.models) ? p.models.join(', ') : (p.models || ''))
    setTpvDefault(!!p.is_default); setShowTtsProviderForm(true)
  }
  const saveTtsProvider = async () => {
    if (!tpvName.trim()) { modal.toast('请输入名称', 'error'); return }
    setTpvSaving(true)
    try {
      const models = tpvModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (editTtsProviderId) await api.updateTtsProvider(editTtsProviderId, { name: tpvName.trim(), api_key: tpvKey, base_url: tpvUrl, models, is_default: tpvDefault ? 1 : 0 })
      else await api.createTtsProvider({ name: tpvName.trim(), api_key: tpvKey, base_url: tpvUrl, models, is_default: tpvDefault ? 1 : 0 })
      await api.listTtsProviders().then(setTtsProviders); setShowTtsProviderForm(false)
      modal.toast(editTtsProviderId ? 'TTS 提供商已更新' : 'TTS 提供商已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setTpvSaving(false) }
  }
  const testTtsProvider = async (id: string) => {
    setTtsTestingId(id)
    try {
      const result: any = await api.testTtsProvider(id)
      if (result.ok) modal.toast('TTS 连接成功', 'success')
      else modal.toast('TTS 连接失败: ' + (result.error || '未知错误'), 'error')
    } catch (e: any) { modal.toast('测试失败: ' + e.message, 'error') }
    finally { setTtsTestingId(null) }
  }
  const deleteTtsProvider = async (id: string, name: string) => {
    if (!await modal.confirm(`确定删除 TTS 提供商「${name}」？`)) return
    try { await api.deleteTtsProvider(id); await api.listTtsProviders().then(setTtsProviders); modal.toast('已删除', 'success') }
    catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  // ASR Provider actions
  const openNewAsrProvider = () => {
    setEditAsrProviderId(null); setApvName(''); setApvKey(''); setApvUrl('https://dashscope.aliyuncs.com')
    setApvModels('fun-asr, qwen3-asr-flash'); setApvDefault(false); setShowAsrProviderForm(true)
  }
  const openEditAsrProvider = (p: any) => {
    setEditAsrProviderId(p.id); setApvName(p.name || ''); setApvKey(p.api_key || '')
    setApvUrl(p.base_url || ''); setApvModels(Array.isArray(p.models) ? p.models.join(', ') : (p.models || ''))
    setApvDefault(!!p.is_default); setShowAsrProviderForm(true)
  }
  const saveAsrProvider = async () => {
    if (!apvName.trim()) { modal.toast('请输入名称', 'error'); return }
    setApvSaving(true)
    try {
      const models = apvModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (editAsrProviderId) await api.updateAsrProvider(editAsrProviderId, { name: apvName.trim(), api_key: apvKey, base_url: apvUrl, models, is_default: apvDefault ? 1 : 0 })
      else await api.createAsrProvider({ name: apvName.trim(), api_key: apvKey, base_url: apvUrl, models, is_default: apvDefault ? 1 : 0 })
      await api.listAsrProviders().then(setAsrProviders); setShowAsrProviderForm(false)
      modal.toast(editAsrProviderId ? 'ASR 提供商已更新' : 'ASR 提供商已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setApvSaving(false) }
  }
  const testAsrProvider = async (id: string) => {
    setAsrTestingId(id)
    try {
      const result: any = await api.testAsrProvider(id)
      if (result.ok) modal.toast('ASR 连接成功', 'success')
      else modal.toast('ASR 连接失败: ' + (result.error || '未知错误'), 'error')
    } catch (e: any) { modal.toast('测试失败: ' + e.message, 'error') }
    finally { setAsrTestingId(null) }
  }
  const deleteAsrProvider = async (id: string, name: string) => {
    if (!await modal.confirm(`确定删除 ASR 提供商「${name}」？`)) return
    try { await api.deleteAsrProvider(id); await api.listAsrProviders().then(setAsrProviders); modal.toast('已删除', 'success') }
    catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  // Image Provider actions
  const openNewImageProvider = () => {
    setEditImageProviderId(null); setIpvName(''); setIpvKey(''); setIpvUrl('https://dashscope.aliyuncs.com/compatible-mode/v1')
    setIpvModels('wanx-v1'); setIpvDefault(false); setShowImageProviderForm(true)
  }
  const openEditImageProvider = async (p: any) => {
    setEditImageProviderId(p.id); setIpvName(p.name || ''); setIpvKey('')
    setIpvUrl(p.base_url || ''); setIpvModels(Array.isArray(p.models) ? p.models.join(', ') : (p.models || ''))
    setIpvDefault(!!p.is_default); setShowImageProviderForm(true)
    // Fetch full (unmasked) API key from server for editing
    try {
      const detail = await api.getImageProvider(p.id)
      setIpvKey((detail as any).api_key || '')
    } catch { /* keep empty if fetch fails */ }
  }
  const saveImageProvider = async () => {
    if (!ipvName.trim()) { modal.toast('请输入名称', 'error'); return }
    setIpvSaving(true)
    try {
      const models = ipvModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (editImageProviderId) await api.updateImageProvider(editImageProviderId, { name: ipvName.trim(), api_key: ipvKey, base_url: ipvUrl, models, is_default: ipvDefault ? 1 : 0 })
      else await api.createImageProvider({ name: ipvName.trim(), api_key: ipvKey, base_url: ipvUrl, models, is_default: ipvDefault ? 1 : 0 })
      await api.listImageProviders().then(setImageProviders); setShowImageProviderForm(false)
      modal.toast(editImageProviderId ? '图片提供商已更新' : '图片提供商已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setIpvSaving(false) }
  }
  const testImageProvider = async (id: string) => {
    setImageTestingId(id)
    try {
      const result: any = await api.testImageProvider(id)
      if (result.ok) modal.toast('图片生成连接成功', 'success')
      else modal.toast('图片生成连接失败: ' + (result.error || '未知错误'), 'error')
    } catch (e: any) { modal.toast('测试失败: ' + e.message, 'error') }
    finally { setImageTestingId(null) }
  }
  const deleteImageProvider = async (id: string, name: string) => {
    if (!await modal.confirm(`确定删除图片提供商「${name}」？`)) return
    try { await api.deleteImageProvider(id); await api.listImageProviders().then(setImageProviders); modal.toast('已删除', 'success') }
    catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  // Core prompt save
  const saveCorePrompt = async (id: string) => {
    setCoreSaving(prev => ({ ...prev, [id]: true }))
    try {
      await api.updateCorePromptConfig(id, { content: coreValues[id] || '' })
      modal.toast('已保存', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setCoreSaving(prev => ({ ...prev, [id]: false })) }
  }

  // Rules save — merge 3 editors into one rules JSON
  const saveColRules = async (columnId: string, cfgId: string) => {
    const typographySpec = colTypographySpec[columnId] || '{}'
    try {
      JSON.parse(typographySpec)
    } catch {
      modal.toast('排版提取规则 JSON 格式错误', 'error')
      return
    }
    const rulesText = mergeRules(
      typographySpec,
      colOutlinePrompt[columnId] || '',
      colCognitivePrinciples[columnId] || ''
    )
    setColRulesSaving(prev => ({ ...prev, [columnId]: true }))
    try {
      await api.updateColumnConfig(cfgId, { rules: rulesText })
      modal.toast('规则已保存', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setColRulesSaving(prev => ({ ...prev, [columnId]: false })) }
  }

  const filteredCoreConfigs = coreCategory
    ? coreConfigs.filter(c => c.category === coreCategory)
    : coreConfigs

  const coreTotalPages = Math.ceil(filteredCoreConfigs.length / corePageSize)
  const coreStart = (corePage - 1) * corePageSize
  const corePageItems = filteredCoreConfigs.slice(coreStart, coreStart + corePageSize)

  return (
    <div>
      <div className="mgmt-tabs">
        <button className={`mgmt-tab${mainTab === 'models' ? ' active' : ''}`}
          onClick={() => handleTabClick('models')}>模型设置</button>
        <button className={`mgmt-tab${mainTab === 'defaults' ? ' active' : ''}`}
          onClick={() => handleTabClick('defaults')}>默认提示词</button>
        <div style={{ flex: 1 }} />
        <HelpButton location="proj-settings" />
      </div>
      <div className="mgmt-content">
        {(!passwordEnabled || sessionVerified) ? (<>

          {/* ═══ Tab: 模型设置 ═══ */}
          {mainTab === 'models' && (
          <div>
            <table className="output-table" style={{ marginBottom: 8, tableLayout: 'fixed' }}>
              <colgroup><col width="16%" /><col width="44%" /><col width="10%" /><col width="30%" /></colgroup>
              <thead><tr><th>名称</th><th>Base URL</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>
                {providers.map((p: any) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td style={{ fontSize: 11 }}>{p.base_url}</td>
                    <td style={{ color: p.is_enabled ? 'var(--success)' : 'var(--text-secondary)' }}>
                      {p.is_enabled ? '已连接' : '未配置'}
                    </td>
                    <td style={{ display: 'flex', gap: 5 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => testProvider(p.id)} disabled={testingId === p.id}>
                        {testingId === p.id ? '测试中...' : '测试'}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => openEditProvider(p)}>编辑</button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                        onClick={() => deleteProvider(p.id, p.name)}>删除</button>
                    </td>
                  </tr>
                ))}
                {providers.length === 0 && (
                  <tr><td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无提供商，请在「全局设置」中添加</td></tr>
                )}
              </tbody>
            </table>
            <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={openNewProvider}>+ 添加 LLM 提供商</button>

            {/* TTS Providers */}
            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>TTS 语音提供商</div>
              <table className="output-table" style={{ marginBottom: 8, tableLayout: 'fixed' }}>
                <colgroup><col width="16%" /><col width="44%" /><col width="10%" /><col width="30%" /></colgroup>
                <thead><tr><th>名称</th><th>Base URL</th><th>状态</th><th>操作</th></tr></thead>
                <tbody>
                  {ttsProviders.map((p: any) => (
                    <tr key={p.id}>
                      <td>{p.name}</td><td style={{ fontSize: 11 }}>{p.base_url}</td>
                      <td style={{ color: p.is_enabled ? 'var(--success)' : 'var(--text-secondary)' }}>{p.is_enabled ? '已连接' : '未配置'}</td>
                      <td style={{ display: 'flex', gap: 5 }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => testTtsProvider(p.id)} disabled={ttsTestingId === p.id}>
                          {ttsTestingId === p.id ? '测试中...' : '测试'}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditTtsProvider(p)}>编辑</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={() => deleteTtsProvider(p.id, p.name)}>删除</button>
                      </td>
                    </tr>
                  ))}
                  {ttsProviders.length === 0 && (
                    <tr><td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无 TTS 提供商</td></tr>
                  )}
                </tbody>
              </table>
              <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={openNewTtsProvider}>+ 添加 TTS 提供商</button>

              {/* ASR Providers */}
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>ASR 语音识别提供商</div>
                <table className="output-table" style={{ marginBottom: 8, tableLayout: 'fixed' }}>
                  <colgroup><col width="16%" /><col width="44%" /><col width="10%" /><col width="30%" /></colgroup>
                  <thead><tr><th>名称</th><th>Base URL</th><th>状态</th><th>操作</th></tr></thead>
                  <tbody>
                    {asrProviders.map((p: any) => (
                      <tr key={p.id}>
                        <td>{p.name}</td><td style={{ fontSize: 11 }}>{p.base_url}</td>
                        <td style={{ color: p.is_enabled ? 'var(--success)' : 'var(--text-secondary)' }}>{p.is_enabled ? '已连接' : '未配置'}</td>
                        <td style={{ display: 'flex', gap: 5 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => testAsrProvider(p.id)} disabled={asrTestingId === p.id}>
                            {asrTestingId === p.id ? '测试中...' : '测试'}
                          </button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEditAsrProvider(p)}>编辑</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={() => deleteAsrProvider(p.id, p.name)}>删除</button>
                        </td>
                      </tr>
                    ))}
                    {asrProviders.length === 0 && (
                      <tr><td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无 ASR 提供商</td></tr>
                    )}
                  </tbody>
                </table>
                <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={openNewAsrProvider}>+ 添加 ASR 提供商</button>

                {/* Image Providers */}
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>图片生成提供商</div>
                  <table className="output-table" style={{ marginBottom: 8, tableLayout: 'fixed' }}>
                    <colgroup><col width="16%" /><col width="44%" /><col width="10%" /><col width="30%" /></colgroup>
                    <thead><tr><th>名称</th><th>Base URL</th><th>状态</th><th>操作</th></tr></thead>
                    <tbody>
                      {imageProviders.map((p: any) => (
                        <tr key={p.id}>
                          <td>{p.name}</td><td style={{ fontSize: 11 }}>{p.base_url}</td>
                          <td style={{ color: p.is_enabled ? 'var(--success)' : 'var(--text-secondary)' }}>{p.is_enabled ? '已连接' : '未配置'}</td>
                          <td style={{ display: 'flex', gap: 5 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => testImageProvider(p.id)} disabled={imageTestingId === p.id}>
                              {imageTestingId === p.id ? '测试中...' : '测试'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEditImageProvider(p)}>编辑</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={() => deleteImageProvider(p.id, p.name)}>删除</button>
                          </td>
                        </tr>
                      ))}
                      {imageProviders.length === 0 && (
                        <tr><td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无图片生成提供商</td></tr>
                      )}
                    </tbody>
                  </table>
                  <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={openNewImageProvider}>+ 添加图片生成提供商</button>
                </div>
              </div>
            </div>
          </div>
          )}

          {/* ═══ Tab: 默认提示词 ═══ */}
          {mainTab === 'defaults' && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 10 }}>
                默认提示词是每个提示词的「说明书」—— 描述作用、输入变量、编写要点。新建项目时，这些说明书会被复制到项目里，用户在项目设置中按自己行业需求重写。
              </div>

              <div className="mgmt-tabs" style={{ marginBottom: 12 }}>
                <button className={`mgmt-tab${seedSubTab === 'columns' ? ' active' : ''}`}
                  onClick={() => setSeedSubTab('columns')}>栏目配置</button>
                <button className={`mgmt-tab${seedSubTab === 'core' ? ' active' : ''}`}
                  onClick={() => setSeedSubTab('core')}>核心配置</button>
              </div>

              {seedSubTab === 'columns' && (<>
              <div style={{ fontSize: 11, color: 'var(--text)', background: 'var(--bg-secondary)', padding: '10px 14px', borderRadius: 6, marginBottom: 12, lineHeight: 1.7 }}>
                栏目配置定义了<strong>7 个工作阶段</strong>的提示词模板：素材输入 → 文档生成 → 文档课件 → 分析PPT → 综合PPT → 课件演讲 → 语音合成。每个阶段可独立配置角色提示词和输出格式（SKILL），新建项目时自动复制到项目中使用。
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
                              <button className="btn btn-primary btn-sm" disabled={ttsSaving[config.id]}
                                onClick={async () => {
                                  setTtsSaving(prev => ({ ...prev, [config.id]: true }))
                                  try {
                                    await api.updateTtsConfig(config.id, { prompt: ttsValues[config.id]?.prompt || '', skill: ttsValues[config.id]?.skill || '' })
                                    modal.toast('已保存', 'success')
                                  } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                                  finally { setTtsSaving(prev => ({ ...prev, [config.id]: false })) }
                                }}>
                                {ttsSaving[config.id] ? '保存中...' : '保存'}
                              </button>
                            </div>
                          </div>
                        ))}
                        {ttsConfigs.length === 0 && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 8 }}>语音配置加载中...</div>
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
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
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
                            </div>
                          </div>
                        ))}
                        {speechConfigs.length === 0 && (
                          <div style={{ color: 'var(--text-secondary)', fontSize: 13, padding: 8 }}>演讲配置加载中...</div>
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
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
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
                          </div>
                        </div>
                      ))}
                      {RULES_COLUMNS.includes(col.id as any) && (() => {
                        const cfgId = columnConfigs.filter(c => c.column_id === col.id)[0]?.id || ''
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
                                value={colTypographySpec[col.id] || '{}'}
                                onChange={e => setColTypographySpec(prev => ({ ...prev, [col.id]: e.target.value }))}
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
                                    value={colOutlinePrompt[col.id] || ''}
                                    onChange={e => setColOutlinePrompt(prev => ({ ...prev, [col.id]: e.target.value }))}
                                    style={{ width: '100%', minHeight: 220, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', tabSize: 2 }}
                                    placeholder="# PPT Structure Architect..."
                                  />
                                  {/* Editor 3: cognitive design principles */}
                                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 4, marginTop: 10 }}>
                                    认知设计原则（Markdown）— Stage 1 大纲生成，优先级高于磁盘场景文件
                                  </div>
                                  <textarea
                                    value={colCognitivePrinciples[col.id] || ''}
                                    onChange={e => setColCognitivePrinciples(prev => ({ ...prev, [col.id]: e.target.value }))}
                                    style={{ width: '100%', minHeight: 140, fontFamily: 'monospace', fontSize: 11, resize: 'vertical', tabSize: 2 }}
                                    placeholder="# Cognitive Design Principles..."
                                  />
                                </>
                              )}
                              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                                <button className="btn btn-primary btn-sm" disabled={colRulesSaving[col.id]}
                                  onClick={() => saveColRules(col.id, cfgId)}>
                                  {colRulesSaving[col.id] ? '保存中...' : '保存规则'}
                                </button>
                              </div>
                            </div>
                          )}
                          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)' }}>
                            设计规则文件 — 当前栏目独立副本，修改不影响其他栏目
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            {(scenarioFiles[col.id] || []).map(f => (
                              <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4, background: editingScFile?.colId === col.id && editingScFile?.filename === f.name ? 'var(--bg-secondary)' : 'transparent' }}>
                                <span style={{ flex: 1, fontSize: 11, fontWeight: editingScFile?.colId === col.id && editingScFile?.filename === f.name ? 600 : 400 }}>{f.name}</span>
                                <span style={{ fontSize: 9, color: f.source === 'custom' ? 'var(--success)' : 'var(--text-secondary)', background: f.source === 'custom' ? 'rgba(34,197,94,0.1)' : 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 3 }}>
                                  {f.source === 'custom' ? '已自定义' : '默认'}
                                </span>
                                <span style={{ fontSize: 9, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'right' }}>{f.size > 1024 ? `${(f.size/1024).toFixed(1)}k` : `${f.size}B`}</span>
                                <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 8px' }} onClick={() => openScenarioFile(col.id, f.name)}>编辑</button>
                              </div>
                            ))}
                            {(!scenarioFiles[col.id] || scenarioFiles[col.id].length === 0) && (
                              <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>点击展开栏目以加载文件列表</span>
                            )}
                          </div>
                          {editingScFile && editingScFile.colId === col.id && (
                            <div style={{ marginTop: 8 }}>
                              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4 }}>编辑: {editingScFile.filename}</div>
                              <textarea value={scFileContent} onChange={e => setScFileContent(e.target.value)}
                                style={{ width: '100%', minHeight: 260, fontFamily: 'monospace', fontSize: 11 }} />
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditingScFile(null)}>取消</button>
                                <button className="btn btn-primary btn-sm" onClick={saveScenarioFile} disabled={scFileSaving}>
                                  {scFileSaving ? '保存中...' : '保存文件'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        )})()}
                    </>)}
                  </div>
                </div>
              ))}
              </>)}
              {seedSubTab === 'core' && (<>

              {/* ═══ Core Prompts Section ═══ */}
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    这些是 PPT 生成流程中的底层提示词，按类别组织。修改后新建项目会使用新版本。已有项目不受影响。
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
                                  onClick={() => setEditingCoreId(editingCoreId === config.id ? null : config.id)}>
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
                                        onClick={() => saveCorePrompt(config.id)}>
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
              </>)}
            </div>
          )}

        </>) : (
          <div style={{ textAlign: 'center' as const, padding: 40, color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>此页面需要密码验证</div>
            <button className="btn btn-primary btn-sm" onClick={() => {
              setPendingTab('models'); setShowPasswordDialog(true); setPasswordInput(''); setPasswordError('')
            }}>输入密码</button>
          </div>
        )}
      </div>

      {/* ═══ Modals (unchanged) ═══ */}
      {showProviderForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowProviderForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 480 }}>
            <div className="dialog-title">{editProviderId ? '编辑提供商' : '添加 LLM 提供商'}</div>
            <div className="form-label">名称</div><input className="form-input" value={pvName} onChange={e => setPvName(e.target.value)} placeholder="如 DeepSeek" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>API Key</div><input className="form-input" value={pvKey} onChange={e => setPvKey(e.target.value)} placeholder="sk-..." />
            <div className="form-label" style={{ marginTop: 12 }}>Base URL</div><input className="form-input" value={pvUrl} onChange={e => setPvUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />
            <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div><input className="form-input" value={pvModels} onChange={e => setPvModels(e.target.value)} placeholder="deepseek-chat, deepseek-reasoner" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowProviderForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveProvider} disabled={pvSaving}>{pvSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {showTtsProviderForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowTtsProviderForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 480 }}>
            <div className="dialog-title">{editTtsProviderId ? '编辑 TTS 提供商' : '添加 TTS 提供商'}</div>
            <div className="form-label">名称</div><input className="form-input" value={tpvName} onChange={e => setTpvName(e.target.value)} placeholder="如 DashScope" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>API Key</div><input className="form-input" value={tpvKey} onChange={e => setTpvKey(e.target.value)} placeholder="sk-..." />
            <div className="form-label" style={{ marginTop: 12 }}>Base URL</div><input className="form-input" value={tpvUrl} onChange={e => setTpvUrl(e.target.value)} placeholder="https://dashscope.aliyuncs.com/api/v1" />
            <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div><input className="form-input" value={tpvModels} onChange={e => setTpvModels(e.target.value)} placeholder="cosyvoice-v3-flash, cosyvoice-v3-plus" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={tpvDefault} onChange={e => setTpvDefault(e.target.checked)} />
              <span style={{ fontSize: 12 }}>设为默认提供商</span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTtsProviderForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveTtsProvider} disabled={tpvSaving}>{tpvSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {showAsrProviderForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAsrProviderForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 480 }}>
            <div className="dialog-title">{editAsrProviderId ? '编辑 ASR 提供商' : '添加 ASR 提供商'}</div>
            <div className="form-label">名称</div><input className="form-input" value={apvName} onChange={e => setApvName(e.target.value)} placeholder="如 DashScope" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>API Key</div><input className="form-input" value={apvKey} onChange={e => setApvKey(e.target.value)} placeholder="sk-..." />
            <div className="form-label" style={{ marginTop: 12 }}>Base URL</div><input className="form-input" value={apvUrl} onChange={e => setApvUrl(e.target.value)} placeholder="https://dashscope.aliyuncs.com" />
            <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div><input className="form-input" value={apvModels} onChange={e => setApvModels(e.target.value)} placeholder="fun-asr, qwen3-asr-flash" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={apvDefault} onChange={e => setApvDefault(e.target.checked)} />
              <span style={{ fontSize: 12 }}>设为默认提供商</span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAsrProviderForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveAsrProvider} disabled={apvSaving}>{apvSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {showImageProviderForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowImageProviderForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 480 }}>
            <div className="dialog-title">{editImageProviderId ? '编辑图片生成提供商' : '添加图片生成提供商'}</div>
            <div className="form-label">名称</div><input className="form-input" value={ipvName} onChange={e => setIpvName(e.target.value)} placeholder="如 通义万相" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>API Key</div><input className="form-input" value={ipvKey} onChange={e => setIpvKey(e.target.value)} placeholder="sk-..." />
            <div className="form-label" style={{ marginTop: 12 }}>Base URL</div><input className="form-input" value={ipvUrl} onChange={e => setIpvUrl(e.target.value)} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
            <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div><input className="form-input" value={ipvModels} onChange={e => setIpvModels(e.target.value)} placeholder="wanx-v1" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={ipvDefault} onChange={e => setIpvDefault(e.target.checked)} />
              <span style={{ fontSize: 12 }}>设为默认提供商</span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowImageProviderForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveImageProvider} disabled={ipvSaving}>{ipvSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Password Dialog */}
      {showPasswordDialog && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) { setShowPasswordDialog(false); setPendingTab(null) } }}>
          <div className="dialog-box" style={{ minWidth: 360 }}>
            <div className="dialog-title">需要密码验证</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              访问{pendingTab === 'models' ? '模型设置' : '种子数据'}需要输入管理员密码。
            </p>
            <input className="form-input" type="password" value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handlePasswordSubmit() }} placeholder="请输入密码" autoFocus />
            {passwordError && <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 6 }}>{passwordError}</div>}
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 8 }}>忘记密码？请到全局设置中重置密码。</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setShowPasswordDialog(false); setPendingTab(null) }}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={handlePasswordSubmit} disabled={passwordChecking}>
                {passwordChecking ? '验证中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
