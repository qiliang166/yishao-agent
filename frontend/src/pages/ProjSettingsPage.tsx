import { useState, useEffect } from 'react'
import { api, Prompt, PromptVersion, Voice } from '../services/api'
import { useModal } from '../components/ModalProvider'

type MainTab = 'models' | 'columns'

const CATEGORIES = ['笔记整理', '道与术分析', '研习手册', 'SOP', '口播稿', 'PPT Skill']

const COLUMN_GROUPS = [
  { id: 'col1', label: '文案提取', hasTemplate: false, summary: '无模板 · 3 个配置项' },
  { id: 'col2', label: '教学文档', hasTemplate: false, summary: '无模板 · 3 个配置项' },
  { id: 'col3', label: '标准SOP', hasTemplate: true, summary: '有模板 · 1 个配置项', tmplFile: 'SOP标准模板.docx' },
  { id: 'col4', label: '合成PPT', hasTemplate: true, summary: '有模板 · 2 个配置项', tmplFile: 'PPT模板.pptx' },
  { id: 'col5', label: '口播文案', hasTemplate: false, summary: '无模板 · 1 个配置项' },
  { id: 'col6', label: '语音合成', hasTemplate: false, summary: '音色库管理' },
]

interface ColumnConfig {
  id: string
  column_id: string
  label: string
  prompt: string
  skill: string
  has_template: number
  template_path: string | null
  sort_order: number
}

export default function ProjSettingsPage() {
  const modal = useModal()
  const [mainTab, setMainTab] = useState<MainTab>('models')

  // Password gate state
  const [passwordEnabled, setPasswordEnabled] = useState(false)
  const [sessionVerified, setSessionVerified] = useState(false)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [pendingTab, setPendingTab] = useState<MainTab | null>(null)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [passwordChecking, setPasswordChecking] = useState(false)
  const [providers, setProviders] = useState<any[]>([])
  const [prompts, setPrompts] = useState<Prompt[]>([])

  // Column configs state
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([])
  const [colValues, setColValues] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [colSaving, setColSaving] = useState<Record<string, boolean>>({})

  // Accordion state
  const [openCols, setOpenCols] = useState<Set<string>>(new Set())

  // Prompt modals
  const [showPromptForm, setShowPromptForm] = useState(false)
  const [editPromptId, setEditPromptId] = useState<string | null>(null)
  const [pfName, setPfName] = useState('')
  const [pfCat, setPfCat] = useState('')
  const [pfSystem, setPfSystem] = useState('')
  const [pfSkill, setPfSkill] = useState('')
  const [pfNote, setPfNote] = useState('')
  const [pfSaving, setPfSaving] = useState(false)
  const [showVersions, setShowVersions] = useState<{ promptName: string; versions: PromptVersion[] } | null>(null)

  // Template modals
  const [showTmplForm, setShowTmplForm] = useState(false)
  const [editTmplId, setEditTmplId] = useState<string | null>(null)
  const [tfName, setTfName] = useState('')
  const [tfType, setTfType] = useState('ppt')
  const [tfSkill, setTfSkill] = useState('')
  const [tfSaving, setTfSaving] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])

  // Provider form
  const [showProviderForm, setShowProviderForm] = useState(false)
  const [editProviderId, setEditProviderId] = useState<string | null>(null)
  const [pvName, setPvName] = useState('')
  const [pvKey, setPvKey] = useState('')
  const [pvUrl, setPvUrl] = useState('')
  const [pvModels, setPvModels] = useState('')
  const [pvSaving, setPvSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)

  // TTS state
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

  // Voice state
  const [voices, setVoices] = useState<Voice[]>([])
  const [showVoiceForm, setShowVoiceForm] = useState(false)
  const [editVoiceId, setEditVoiceId] = useState<string | null>(null)
  const [vfName, setVfName] = useState('')
  const [vfProviderId, setVfProviderId] = useState('')
  const [vfVoiceId, setVfVoiceId] = useState('')
  const [vfDesc, setVfDesc] = useState('')
  const [vfDefault, setVfDefault] = useState(false)
  const [vfSaving, setVfSaving] = useState(false)
  const [previewingId, setPreviewingId] = useState<string | null>(null)

  // ASR Provider state
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

  const load = () => {
    api.listProviders().then(setProviders).catch(() => {})
    api.listPrompts().then(setPrompts).catch(() => {})
    api.listTemplates().then(setTemplates).catch(() => {})
    api.listTtsProviders().then(setTtsProviders).catch(() => {})
    api.listVoices().then(setVoices).catch(() => {})
    api.listAsrProviders().then(setAsrProviders).catch(() => {})
    api.listColumnConfigs().then((configs: ColumnConfig[]) => {
      setColumnConfigs(configs)
      const vals: Record<string, { prompt: string; skill: string }> = {}
      configs.forEach(c => { vals[c.id] = { prompt: c.prompt, skill: c.skill } })
      setColValues(vals)
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
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // Auto-show password dialog on load if protection enabled
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

  // Tab click guard
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

  // Password submission
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

  // ── Prompt actions ──
  const openNewPrompt = () => {
    setEditPromptId(null); setPfName(''); setPfCat('')
    setPfSystem(''); setPfSkill(''); setPfNote('')
    setShowPromptForm(true)
  }
  const openEditPrompt = (p: Prompt) => {
    setEditPromptId(p.id); setPfName(p.name); setPfCat(p.category)
    setPfSystem((p as any).system_prompt || ''); setPfSkill((p as any).skill_template || '')
    setPfNote(''); setShowPromptForm(true)
  }
  const savePrompt = async () => {
    if (!pfName.trim() || !pfCat.trim()) return
    setPfSaving(true)
    try {
      if (editPromptId) {
        await api.updatePrompt(editPromptId, { name: pfName, category: pfCat, system_prompt: pfSystem || undefined, skill_template: pfSkill || undefined, change_note: pfNote || undefined })
      } else {
        await api.createPrompt({ name: pfName, category: pfCat, system_prompt: pfSystem, skill_template: pfSkill })
      }
      setShowPromptForm(false); load()
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setPfSaving(false) }
  }
  const deletePrompt = async (id: string) => {
    const ok = await modal.confirm('确定删除此提示词？')
    if (!ok) return
    try { await api.deletePrompt(id); load() } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }
  const viewVersions = async (p: Prompt) => {
    try {
      const versions = await api.getPromptVersions(p.id)
      setShowVersions({ promptName: p.name, versions })
    } catch (e: any) { modal.toast('获取版本失败: ' + e.message, 'error') }
  }

  // ── Template actions ──
  const openNewTmpl = () => {
    setEditTmplId(null); setTfName(''); setTfType('ppt'); setTfSkill('')
    setShowTmplForm(true)
  }
  const saveTmpl = async () => {
    if (!tfName.trim()) return
    setTfSaving(true)
    try {
      if (editTmplId) {
        await api.updateTemplate(editTmplId, { name: tfName, type: tfType, linked_skill_id: tfSkill || undefined } as any)
      } else {
        await api.createTemplate({ name: tfName, type: tfType, linked_skill_id: tfSkill || undefined })
      }
      setShowTmplForm(false); load()
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setTfSaving(false) }
  }
  const deleteTmpl = async (id: string) => {
    const ok = await modal.confirm('确定删除此模板？')
    if (!ok) return
    try { await api.deleteTemplate(id); load() } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }
  const downloadTmpl = (t: any) => {
    const a = document.createElement('a')
    a.href = '/api/download/' + encodeURIComponent(t.file_path || t.name)
    a.download = t.file_path || t.name
    a.click()
  }

  // ── Provider actions ──
  const openEditProvider = (p: any) => {
    setEditProviderId(p.id)
    setPvName(p.name || '')
    setPvKey(p.api_key || '')
    setPvUrl(p.base_url || '')
    setPvModels(Array.isArray(p.models) ? p.models.join(', ') : (p.models || ''))
    setShowProviderForm(true)
  }
  const openNewProvider = () => {
    setEditProviderId(null)
    setPvName('')
    setPvKey('')
    setPvUrl('https://api.deepseek.com/v1')
    setPvModels('deepseek-chat, deepseek-reasoner')
    setShowProviderForm(true)
  }
  const saveProvider = async () => {
    if (!pvName.trim()) { modal.toast('请输入名称', 'error'); return }
    setPvSaving(true)
    try {
      const models = pvModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (editProviderId) {
        await api.updateProvider(editProviderId, { name: pvName.trim(), api_key: pvKey, base_url: pvUrl, models })
      } else {
        await api.createProvider({ name: pvName.trim(), api_key: pvKey, base_url: pvUrl, models })
      }
      await api.listProviders().then(setProviders)
      setShowProviderForm(false)
      modal.toast(editProviderId ? '提供商已更新' : '提供商已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setPvSaving(false) }
  }
  const testProvider = async (id: string) => {
    setTestingId(id)
    try {
      const result: any = await api.testProvider(id)
      if (result.ok) {
        modal.toast(`连接成功 (${(result.models || []).length} 个模型可用)`, 'success')
      } else {
        modal.toast('连接失败: ' + (result.error || '未知错误'), 'error')
      }
    } catch (e: any) { modal.toast('测试失败: ' + e.message, 'error') }
    finally { setTestingId(null) }
  }
  const deleteProvider = async (id: string, name: string) => {
    const ok = await modal.confirm(`确定删除提供商「${name}」？`)
    if (!ok) return
    try {
      await api.deleteProvider(id)
      await api.listProviders().then(setProviders)
      modal.toast('已删除', 'success')
    } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  // ── TTS Provider actions ──
  const openNewTtsProvider = () => {
    setEditTtsProviderId(null)
    setTpvName('')
    setTpvKey('')
    setTpvUrl('https://dashscope.aliyuncs.com/api/v1')
    setTpvModels('cosyvoice-v3-flash, cosyvoice-v3-plus')
    setTpvDefault(false)
    setShowTtsProviderForm(true)
  }
  const openEditTtsProvider = (p: any) => {
    setEditTtsProviderId(p.id)
    setTpvName(p.name || '')
    setTpvKey(p.api_key || '')
    setTpvUrl(p.base_url || '')
    setTpvModels(Array.isArray(p.models) ? p.models.join(', ') : (p.models || ''))
    setTpvDefault(!!p.is_default)
    setShowTtsProviderForm(true)
  }
  const saveTtsProvider = async () => {
    if (!tpvName.trim()) { modal.toast('请输入名称', 'error'); return }
    setTpvSaving(true)
    try {
      const models = tpvModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (editTtsProviderId) {
        await api.updateTtsProvider(editTtsProviderId, { name: tpvName.trim(), api_key: tpvKey, base_url: tpvUrl, models, is_default: tpvDefault ? 1 : 0 })
      } else {
        await api.createTtsProvider({ name: tpvName.trim(), api_key: tpvKey, base_url: tpvUrl, models, is_default: tpvDefault ? 1 : 0 })
      }
      await api.listTtsProviders().then(setTtsProviders)
      setShowTtsProviderForm(false)
      modal.toast(editTtsProviderId ? 'TTS 提供商已更新' : 'TTS 提供商已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setTpvSaving(false) }
  }
  const testTtsProvider = async (id: string) => {
    setTtsTestingId(id)
    try {
      const result: any = await api.testTtsProvider(id)
      if (result.ok) {
        modal.toast('TTS 连接成功', 'success')
      } else {
        modal.toast('TTS 连接失败: ' + (result.error || '未知错误'), 'error')
      }
    } catch (e: any) { modal.toast('测试失败: ' + e.message, 'error') }
    finally { setTtsTestingId(null) }
  }
  const deleteTtsProvider = async (id: string, name: string) => {
    const ok = await modal.confirm(`确定删除 TTS 提供商「${name}」？`)
    if (!ok) return
    try {
      await api.deleteTtsProvider(id)
      await api.listTtsProviders().then(setTtsProviders)
      modal.toast('已删除', 'success')
    } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  // ── Voice actions ──
  const openNewVoice = () => {
    setEditVoiceId(null)
    setVfName('')
    setVfProviderId(ttsProviders[0]?.id || '')
    setVfVoiceId('')
    setVfDesc('')
    setVfDefault(false)
    setShowVoiceForm(true)
  }
  const openEditVoice = (v: Voice) => {
    setEditVoiceId(v.id)
    setVfName(v.name)
    setVfProviderId(v.provider_id)
    setVfVoiceId(v.voice_id)
    setVfDesc(v.description || '')
    setVfDefault(!!v.is_default)
    setShowVoiceForm(true)
  }
  const saveVoice = async () => {
    if (!vfName.trim() || !vfProviderId || !vfVoiceId.trim()) {
      modal.toast('请填写名称、提供商和音色ID', 'error'); return
    }
    setVfSaving(true)
    try {
      if (editVoiceId) {
        await api.updateVoice(editVoiceId, { name: vfName.trim(), provider_id: vfProviderId, voice_id: vfVoiceId.trim(), description: vfDesc, is_default: vfDefault ? 1 : 0 })
      } else {
        await api.createVoice({ name: vfName.trim(), provider_id: vfProviderId, voice_id: vfVoiceId.trim(), description: vfDesc, is_default: vfDefault ? 1 : 0 })
      }
      await api.listVoices().then(setVoices)
      setShowVoiceForm(false)
      modal.toast(editVoiceId ? '音色已更新' : '音色已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setVfSaving(false) }
  }
  const previewVoice = async (id: string) => {
    setPreviewingId(id)
    try {
      const result: any = await api.previewVoice(id)
      if (result.audio_url) {
        const audio = new Audio(result.audio_url)
        await audio.play()
      } else {
        modal.toast('预览失败: 未获取到音频', 'error')
      }
    } catch (e: any) { modal.toast('预览失败: ' + e.message, 'error') }
    finally { setPreviewingId(null) }
  }
  const deleteVoice = async (id: string, name: string) => {
    const ok = await modal.confirm(`确定删除音色「${name}」？`)
    if (!ok) return
    try {
      await api.deleteVoice(id)
      await api.listVoices().then(setVoices)
      modal.toast('已删除', 'success')
    } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  // ── ASR Provider actions ──
  const openNewAsrProvider = () => {
    setEditAsrProviderId(null)
    setApvName('')
    setApvKey('')
    setApvUrl('https://dashscope.aliyuncs.com')
    setApvModels('fun-asr, qwen3-asr-flash')
    setApvDefault(false)
    setShowAsrProviderForm(true)
  }
  const openEditAsrProvider = (p: any) => {
    setEditAsrProviderId(p.id)
    setApvName(p.name || '')
    setApvKey(p.api_key || '')
    setApvUrl(p.base_url || '')
    setApvModels(Array.isArray(p.models) ? p.models.join(', ') : (p.models || ''))
    setApvDefault(!!p.is_default)
    setShowAsrProviderForm(true)
  }
  const saveAsrProvider = async () => {
    if (!apvName.trim()) { modal.toast('请输入名称', 'error'); return }
    setApvSaving(true)
    try {
      const models = apvModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (editAsrProviderId) {
        await api.updateAsrProvider(editAsrProviderId, { name: apvName.trim(), api_key: apvKey, base_url: apvUrl, models, is_default: apvDefault ? 1 : 0 })
      } else {
        await api.createAsrProvider({ name: apvName.trim(), api_key: apvKey, base_url: apvUrl, models, is_default: apvDefault ? 1 : 0 })
      }
      await api.listAsrProviders().then(setAsrProviders)
      setShowAsrProviderForm(false)
      modal.toast(editAsrProviderId ? 'ASR 提供商已更新' : 'ASR 提供商已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setApvSaving(false) }
  }
  const testAsrProvider = async (id: string) => {
    setAsrTestingId(id)
    try {
      const result: any = await api.testAsrProvider(id)
      if (result.ok) {
        modal.toast('ASR 连接成功', 'success')
      } else {
        modal.toast('ASR 连接失败: ' + (result.error || '未知错误'), 'error')
      }
    } catch (e: any) { modal.toast('测试失败: ' + e.message, 'error') }
    finally { setAsrTestingId(null) }
  }
  const deleteAsrProvider = async (id: string, name: string) => {
    const ok = await modal.confirm(`确定删除 ASR 提供商「${name}」？`)
    if (!ok) return
    try {
      await api.deleteAsrProvider(id)
      await api.listAsrProviders().then(setAsrProviders)
      modal.toast('已删除', 'success')
    } catch (e: any) { modal.toast('删除失败: ' + e.message, 'error') }
  }

  return (
    <div>
      {/* Tab Bar — mgmt-tabs style */}
      <div className="mgmt-tabs">
        <button className={`mgmt-tab${mainTab === 'models' ? ' active' : ''}`}
          onClick={() => handleTabClick('models')}>模型设置</button>
        <button className={`mgmt-tab${mainTab === 'columns' ? ' active' : ''}`}
          onClick={() => handleTabClick('columns')}>栏目配置</button>
      </div>
      <div className="mgmt-content">
        {(!passwordEnabled || sessionVerified) ? (<>
          {/* ═══ Tab: 模型设置 ═══ */}
          {mainTab === 'models' && (
          <div>
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
                          <button className="btn btn-ghost btn-sm" onClick={() => testProvider(p.id)}
                            disabled={testingId === p.id}>
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
                          <td>{p.name}</td>
                          <td style={{ fontSize: 11 }}>{p.base_url}</td>
                          <td style={{ color: p.is_enabled ? 'var(--success)' : 'var(--text-secondary)' }}>
                            {p.is_enabled ? '已连接' : '未配置'}
                          </td>
                          <td style={{ display: 'flex', gap: 5 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => testTtsProvider(p.id)}
                              disabled={ttsTestingId === p.id}>
                              {ttsTestingId === p.id ? '测试中...' : '测试'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openEditTtsProvider(p)}>编辑</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                              onClick={() => deleteTtsProvider(p.id, p.name)}>删除</button>
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
                            <td>{p.name}</td>
                            <td style={{ fontSize: 11 }}>{p.base_url}</td>
                            <td style={{ color: p.is_enabled ? 'var(--success)' : 'var(--text-secondary)' }}>
                              {p.is_enabled ? '已连接' : '未配置'}
                            </td>
                            <td style={{ display: 'flex', gap: 5 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => testAsrProvider(p.id)}
                                disabled={asrTestingId === p.id}>
                                {asrTestingId === p.id ? '测试中...' : '测试'}
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEditAsrProvider(p)}>编辑</button>
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                                onClick={() => deleteAsrProvider(p.id, p.name)}>删除</button>
                            </td>
                          </tr>
                        ))}
                        {asrProviders.length === 0 && (
                          <tr><td colSpan={4} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无 ASR 提供商</td></tr>
                        )}
                      </tbody>
                    </table>
                    <button className="btn btn-outline btn-sm" style={{ marginBottom: 12 }} onClick={openNewAsrProvider}>+ 添加 ASR 提供商</button>
                  </div>
                </div>
              </div>
          </div>
        )}

        {/* ═══ Tab: 栏目配置 ═══ */}
        {mainTab === 'columns' && (
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 10 }}>
              每个栏目配置模板/提示词/SKILL，新建项目时按栏目调取默认配置。有模板的栏目上传模板后AI自动分析生成提示词+SKILL，无模板的栏目直接手写。
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
                  {col.id === 'col6' ? (
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 8 }}>
                        管理自定义音色，合成语音时从音色库中选择。每个音色关联一个 TTS 提供商。
                      </div>
                      <table className="output-table" style={{ marginBottom: 8, tableLayout: 'fixed' }}>
                        <colgroup><col width="20%" /><col width="20%" /><col width="20%" /><col width="10%" /><col width="30%" /></colgroup>
                        <thead><tr><th>名称</th><th>提供商</th><th>音色 ID</th><th>默认</th><th>操作</th></tr></thead>
                        <tbody>
                          {voices.map((v: Voice) => {
                            const provider = ttsProviders.find(p => p.id === v.provider_id)
                            return (
                              <tr key={v.id}>
                                <td style={{ fontWeight: 600 }}>{v.name}</td>
                                <td style={{ fontSize: 11 }}>{provider?.name || v.provider_id}</td>
                                <td style={{ fontSize: 11 }}>{v.voice_id}</td>
                                <td>{v.is_default ? '✓' : ''}</td>
                                <td style={{ display: 'flex', gap: 5 }}>
                                  <button className="btn btn-ghost btn-sm" onClick={() => previewVoice(v.id)}
                                    disabled={previewingId === v.id}>
                                    {previewingId === v.id ? '...' : '▶'}
                                  </button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => openEditVoice(v)}>编辑</button>
                                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                                    onClick={() => deleteVoice(v.id, v.name)}>删除</button>
                                </td>
                              </tr>
                            )
                          })}
                          {voices.length === 0 && (
                            <tr><td colSpan={5} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无自定义音色，请添加</td></tr>
                          )}
                        </tbody>
                      </table>
                      <button className="btn btn-outline btn-sm" onClick={openNewVoice}>+ 添加音色</button>
                    </div>
                  ) : (
                    <>
                      {columnConfigs.filter(c => c.column_id === col.id).map(config => (
                        <div key={config.id} className="ac-sub-item">
                          <div className="ac-sub-item-header">{config.label}</div>
                          <div className="ac-field-row">
                            <div className="ac-field">
                              <label>提示词</label>
                              <textarea
                                value={colValues[config.id]?.prompt || ''}
                                onChange={e => setColValues(prev => ({
                                  ...prev,
                                  [config.id]: { ...prev[config.id], prompt: e.target.value }
                                }))}
                              />
                            </div>
                            <div className="ac-field">
                              <label>SKILL 输出格式</label>
                              <textarea
                                value={colValues[config.id]?.skill || ''}
                                onChange={e => setColValues(prev => ({
                                  ...prev,
                                  [config.id]: { ...prev[config.id], skill: e.target.value }
                                }))}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                            <button className="btn btn-primary btn-sm"
                              disabled={colSaving[config.id]}
                              onClick={async () => {
                                setColSaving(prev => ({ ...prev, [config.id]: true }))
                                try {
                                  await api.updateColumnConfig(config.id, {
                                    prompt: colValues[config.id]?.prompt || '',
                                    skill: colValues[config.id]?.skill || '',
                                  })
                                  modal.toast('已保存', 'success')
                                } catch (e: any) {
                                  modal.toast('保存失败: ' + e.message, 'error')
                                } finally {
                                  setColSaving(prev => ({ ...prev, [config.id]: false }))
                                }
                              }}>
                              {colSaving[config.id] ? '保存中...' : '保存'}
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                  {col.hasTemplate && columnConfigs.filter(c => c.column_id === col.id && c.has_template).map(config => (
                    <div key={config.id} style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 9, color: 'var(--text-secondary)' }}>模板文件：</span>
                      <span style={{ fontSize: 10, fontWeight: 600 }}>
                        {config.template_path || '未上传'}
                      </span>
                      <label className="btn btn-ghost btn-sm" style={{ cursor: 'pointer' }}>
                        替换
                        <input type="file" accept=".docx,.pptx" style={{ display: 'none' }}
                          onChange={async e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            try {
                              await api.uploadColumnTemplate(config.id, file)
                              modal.toast('模板已上传', 'success')
                              api.listColumnConfigs().then((configs: ColumnConfig[]) => {
                                setColumnConfigs(configs)
                                const vals: Record<string, { prompt: string; skill: string }> = {}
                                configs.forEach(c => { vals[c.id] = { prompt: c.prompt, skill: c.skill } })
                                setColValues(vals)
                              }).catch(() => {})
                            } catch (err: any) {
                              modal.toast('上传失败: ' + err.message, 'error')
                            }
                          }} />
                      </label>
                      {config.template_path && (
                        <button className="btn btn-ghost btn-sm" onClick={() => {
                          const a = document.createElement('a')
                          a.href = '/api/download/' + encodeURIComponent(config.template_path || '')
                          a.download = config.template_path || ''
                          a.click()
                        }}>下载</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* 提示词快速管理入口 */}
            <div style={{ marginTop: 16, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>提示词库</span>
                <button className="btn btn-primary btn-sm" onClick={openNewPrompt}>+ 新建提示词</button>
              </div>
              <table className="output-table">
                <thead><tr><th>名称</th><th>分类</th><th>当前版本</th><th>默认</th><th>操作</th></tr></thead>
                <tbody>
                  {prompts.map((p: any) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 600 }}>{p.name}</td>
                      <td>{p.category}</td>
                      <td>{p.current_version || 'v1.0'}</td>
                      <td>{p.is_default ? '✓' : ''}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditPrompt(p)}>编辑</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => viewVersions(p)}>版本</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={() => deletePrompt(p.id)}>删除</button>
                      </td>
                    </tr>
                  ))}
                  {prompts.length === 0 && (
                    <tr><td colSpan={5} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无提示词</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* 模板快速管理入口 */}
            <div style={{ marginTop: 16, padding: '10px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>模板库</span>
                <button className="btn btn-primary btn-sm" onClick={openNewTmpl}>+ 新建模板</button>
              </div>
              <table className="output-table">
                <thead><tr><th>名称</th><th>类型</th><th>关联 Skill</th><th>默认</th><th>操作</th></tr></thead>
                <tbody>
                  {templates.map((t: any) => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600 }}>{t.name}</td>
                      <td>{t.type === 'ppt' ? 'PPT' : t.type === 'sop' ? 'SOP' : t.type}</td>
                      <td style={{ fontSize: 12 }}>{t.linked_skill_id || '—'}</td>
                      <td>{t.is_default ? '✓' : ''}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => downloadTmpl(t)}>下载</button>
                        <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }} onClick={() => deleteTmpl(t.id)}>删除</button>
                      </td>
                    </tr>
                  ))}
                  {templates.length === 0 && (
                    <tr><td colSpan={5} style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>暂无模板</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>) : (
          <div style={{ textAlign: 'center' as const, padding: 40, color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
            <div style={{ fontSize: 13, marginBottom: 8 }}>此页面需要密码验证</div>
            <button className="btn btn-primary btn-sm" onClick={() => {
              setPendingTab('models')
              setShowPasswordDialog(true)
              setPasswordInput('')
              setPasswordError('')
            }}>输入密码</button>
          </div>
        )}
      </div>

      {/* ═══ Prompt Form Modal ═══ */}
      {showPromptForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowPromptForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 500 }}>
            <div className="dialog-title">{editPromptId ? '编辑提示词' : '新建提示词'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={pfName} onChange={e => setPfName(e.target.value)} placeholder="提示词名称" />
            <div className="form-label" style={{ marginTop: 12 }}>分类</div>
            <select className="form-select" value={pfCat} onChange={e => setPfCat(e.target.value)}>
              <option value="">选择分类...</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="form-label" style={{ marginTop: 12 }}>System Prompt</div>
            <textarea className="form-textarea" rows={4} value={pfSystem} onChange={e => setPfSystem(e.target.value)} placeholder="系统提示词..." />
            <div className="form-label" style={{ marginTop: 12 }}>Skill Template</div>
            <textarea className="form-textarea" rows={4} value={pfSkill} onChange={e => setPfSkill(e.target.value)} placeholder="输出格式模板..." />
            {editPromptId && (
              <>
                <div className="form-label" style={{ marginTop: 12 }}>变更说明</div>
                <input className="form-input" value={pfNote} onChange={e => setPfNote(e.target.value)} placeholder="此次修改的说明（可选）" />
              </>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowPromptForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={savePrompt} disabled={pfSaving}>{pfSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Version History Modal ═══ */}
      {showVersions && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowVersions(null) }}>
          <div className="dialog-box" style={{ minWidth: 500 }}>
            <div className="dialog-title">版本历史 — {showVersions.promptName}</div>
            <table className="output-table">
              <thead><tr><th>版本</th><th>变更说明</th><th>时间</th></tr></thead>
              <tbody>
                {showVersions.versions.map((v: PromptVersion) => (
                  <tr key={v.version}>
                    <td style={{ fontWeight: 600 }}>{v.version}</td>
                    <td style={{ fontSize: 12 }}>{v.change_note || '—'}</td>
                    <td style={{ fontSize: 11 }}>{v.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowVersions(null)}>关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Template Form Modal ═══ */}
      {showTmplForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowTmplForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 420 }}>
            <div className="dialog-title">{editTmplId ? '编辑模板' : '新建模板'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={tfName} onChange={e => setTfName(e.target.value)} placeholder="模板名称" />
            <div className="form-label" style={{ marginTop: 12 }}>类型</div>
            <select className="form-select" value={tfType} onChange={e => setTfType(e.target.value)}>
              <option value="ppt">PPT</option>
              <option value="sop">SOP</option>
            </select>
            <div className="form-label" style={{ marginTop: 12 }}>关联 Skill</div>
            <select className="form-select" value={tfSkill} onChange={e => setTfSkill(e.target.value)}>
              <option value="">无</option>
              {prompts.map(p => <option key={p.id} value={p.id}>{p.name} ({p.category})</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowTmplForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveTmpl} disabled={tfSaving}>{tfSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Provider Form Modal ═══ */}
      {showProviderForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowProviderForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 480 }}>
            <div className="dialog-title">{editProviderId ? '编辑提供商' : '添加 LLM 提供商'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={pvName} onChange={e => setPvName(e.target.value)} placeholder="如 DeepSeek" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>API Key</div>
            <input className="form-input" value={pvKey} onChange={e => setPvKey(e.target.value)} placeholder="sk-..." />
            <div className="form-label" style={{ marginTop: 12 }}>Base URL</div>
            <input className="form-input" value={pvUrl} onChange={e => setPvUrl(e.target.value)} placeholder="https://api.deepseek.com/v1" />
            <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div>
            <input className="form-input" value={pvModels} onChange={e => setPvModels(e.target.value)} placeholder="deepseek-chat, deepseek-reasoner" />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowProviderForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveProvider} disabled={pvSaving}>{pvSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TTS Provider Form Modal ═══ */}
      {showTtsProviderForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowTtsProviderForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 480 }}>
            <div className="dialog-title">{editTtsProviderId ? '编辑 TTS 提供商' : '添加 TTS 提供商'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={tpvName} onChange={e => setTpvName(e.target.value)} placeholder="如 DashScope" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>API Key</div>
            <input className="form-input" value={tpvKey} onChange={e => setTpvKey(e.target.value)} placeholder="sk-..." />
            <div className="form-label" style={{ marginTop: 12 }}>Base URL</div>
            <input className="form-input" value={tpvUrl} onChange={e => setTpvUrl(e.target.value)} placeholder="https://dashscope.aliyuncs.com/api/v1" />
            <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div>
            <input className="form-input" value={tpvModels} onChange={e => setTpvModels(e.target.value)} placeholder="cosyvoice-v3-flash, cosyvoice-v3-plus" />
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

      {/* ═══ Voice Form Modal ═══ */}
      {showVoiceForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowVoiceForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 420 }}>
            <div className="dialog-title">{editVoiceId ? '编辑音色' : '添加音色'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={vfName} onChange={e => setVfName(e.target.value)} placeholder="如 温柔女声" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>提供商</div>
            <select className="form-select" value={vfProviderId} onChange={e => setVfProviderId(e.target.value)}>
              <option value="">选择提供商...</option>
              {ttsProviders.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="form-label" style={{ marginTop: 12 }}>音色 ID</div>
            <input className="form-input" value={vfVoiceId} onChange={e => setVfVoiceId(e.target.value)} placeholder="如 longanyang 或克隆音色ID" />
            <div className="form-label" style={{ marginTop: 12 }}>描述（可选）</div>
            <input className="form-input" value={vfDesc} onChange={e => setVfDesc(e.target.value)} placeholder="如 温柔甜美的年轻女声" />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={vfDefault} onChange={e => setVfDefault(e.target.checked)} />
              <span style={{ fontSize: 12 }}>设为默认音色</span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowVoiceForm(false)}>取消</button>
              <button className="btn btn-primary btn-sm" onClick={saveVoice} disabled={vfSaving}>{vfSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ ASR Provider Form Modal ═══ */}
      {showAsrProviderForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowAsrProviderForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 480 }}>
            <div className="dialog-title">{editAsrProviderId ? '编辑 ASR 提供商' : '添加 ASR 提供商'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={apvName} onChange={e => setApvName(e.target.value)} placeholder="如 DashScope" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>API Key</div>
            <input className="form-input" value={apvKey} onChange={e => setApvKey(e.target.value)} placeholder="sk-..." />
            <div className="form-label" style={{ marginTop: 12 }}>Base URL</div>
            <input className="form-input" value={apvUrl} onChange={e => setApvUrl(e.target.value)} placeholder="https://dashscope.aliyuncs.com" />
            <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div>
            <input className="form-input" value={apvModels} onChange={e => setApvModels(e.target.value)} placeholder="fun-asr, qwen3-asr-flash" />
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

      {/* ═══ Password Gate Dialog ═══ */}
      {showPasswordDialog && (
        <div className="dialog-overlay" onClick={e => {
          if (e.target === e.currentTarget) { setShowPasswordDialog(false); setPendingTab(null) }
        }}>
          <div className="dialog-box" style={{ minWidth: 360 }}>
            <div className="dialog-title">需要密码验证</div>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              访问{pendingTab === 'models' ? '模型设置' : '栏目配置'}需要输入管理员密码。
            </p>
            <input className="form-input" type="password"
              value={passwordInput}
              onChange={e => { setPasswordInput(e.target.value); setPasswordError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handlePasswordSubmit() }}
              placeholder="请输入密码" autoFocus />
            {passwordError && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 6 }}>{passwordError}</div>
            )}
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 8 }}>
              忘记密码？请到全局设置中重置密码。
            </div>
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
