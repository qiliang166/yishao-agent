import { useState, useEffect } from 'react'
import { api, Voice } from '../services/api'
import { useModal } from '../components/ModalProvider'

type MainTab = 'models' | 'columns'

const COLUMN_GROUPS = [
  { id: 'col1', label: '素材输入', hasTemplate: false, summary: '输入配置' },
  { id: 'col2', label: '文档生成', hasTemplate: false, summary: '文档配置' },
  { id: 'col3', label: '文档导出', hasTemplate: true, summary: '导出配置', tmplFile: '' },
  { id: 'col4', label: 'PPT 生成 A', hasTemplate: true, summary: 'PPT配置', tmplFile: '' },
  { id: 'col5', label: 'PPT 生成 B', hasTemplate: true, summary: 'PPT配置', tmplFile: '' },
  { id: 'col6', label: '口播生成', hasTemplate: false, summary: '口播配置' },
  { id: 'col7', label: '语音合成', hasTemplate: false, summary: '音色库管理' },
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
  // Column configs state
  const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([])
  const [colValues, setColValues] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [colSaving, setColSaving] = useState<Record<string, boolean>>({})

  // Accordion state
  const [openCols, setOpenCols] = useState<Set<string>>(new Set())

  // Scenario file editor state (per-column design rule files)
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

  // Image Provider state
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
    api.listVoices().then(setVoices).catch(() => {})
    api.listAsrProviders().then(setAsrProviders).catch(() => {})
    api.listImageProviders().then(setImageProviders).catch(() => {})
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
      if (next.has(id)) next.delete(id); else {
        next.add(id)
        // Load scenario files for PPT columns
        if ((id === 'col4' || id === 'col5') && !scenarioFiles[id]) {
          loadScenarioFiles(id)
        }
      }
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

  // ── Image Provider actions ──
  const openNewImageProvider = () => {
    setEditImageProviderId(null)
    setIpvName('')
    setIpvKey('')
    setIpvUrl('https://dashscope.aliyuncs.com/compatible-mode/v1')
    setIpvModels('wanx-v1')
    setIpvDefault(false)
    setShowImageProviderForm(true)
  }
  const openEditImageProvider = (p: any) => {
    setEditImageProviderId(p.id)
    setIpvName(p.name || '')
    setIpvKey(p.api_key || '')
    setIpvUrl(p.base_url || '')
    setIpvModels(Array.isArray(p.models) ? p.models.join(', ') : (p.models || ''))
    setIpvDefault(!!p.is_default)
    setShowImageProviderForm(true)
  }
  const saveImageProvider = async () => {
    if (!ipvName.trim()) { modal.toast('请输入名称', 'error'); return }
    setIpvSaving(true)
    try {
      const models = ipvModels.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (editImageProviderId) {
        await api.updateImageProvider(editImageProviderId, { name: ipvName.trim(), api_key: ipvKey, base_url: ipvUrl, models, is_default: ipvDefault ? 1 : 0 })
      } else {
        await api.createImageProvider({ name: ipvName.trim(), api_key: ipvKey, base_url: ipvUrl, models, is_default: ipvDefault ? 1 : 0 })
      }
      await api.listImageProviders().then(setImageProviders)
      setShowImageProviderForm(false)
      modal.toast(editImageProviderId ? '图片提供商已更新' : '图片提供商已添加', 'success')
    } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
    finally { setIpvSaving(false) }
  }
  const testImageProvider = async (id: string) => {
    setImageTestingId(id)
    try {
      const result: any = await api.testImageProvider(id)
      if (result.ok) {
        modal.toast('图片生成连接成功', 'success')
      } else {
        modal.toast('图片生成连接失败: ' + (result.error || '未知错误'), 'error')
      }
    } catch (e: any) { modal.toast('测试失败: ' + e.message, 'error') }
    finally { setImageTestingId(null) }
  }
  const deleteImageProvider = async (id: string, name: string) => {
    const ok = await modal.confirm(`确定删除图片提供商「${name}」？`)
    if (!ok) return
    try {
      await api.deleteImageProvider(id)
      await api.listImageProviders().then(setImageProviders)
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

                  {/* Image Providers */}
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>图片生成提供商</div>
                    <table className="output-table" style={{ marginBottom: 8, tableLayout: 'fixed' }}>
                      <colgroup><col width="16%" /><col width="44%" /><col width="10%" /><col width="30%" /></colgroup>
                      <thead><tr><th>名称</th><th>Base URL</th><th>状态</th><th>操作</th></tr></thead>
                      <tbody>
                        {imageProviders.map((p: any) => (
                          <tr key={p.id}>
                            <td>{p.name}</td>
                            <td style={{ fontSize: 11 }}>{p.base_url}</td>
                            <td style={{ color: p.is_enabled ? 'var(--success)' : 'var(--text-secondary)' }}>
                              {p.is_enabled ? '已连接' : '未配置'}
                            </td>
                            <td style={{ display: 'flex', gap: 5 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => testImageProvider(p.id)}
                                disabled={imageTestingId === p.id}>
                                {imageTestingId === p.id ? '测试中...' : '测试'}
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEditImageProvider(p)}>编辑</button>
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}
                                onClick={() => deleteImageProvider(p.id, p.name)}>删除</button>
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
                  {col.id === 'col7' ? (
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
                                  const payload: any = {
                                    prompt: colValues[config.id]?.prompt || '',
                                    skill: colValues[config.id]?.skill || '',
                                  }
                                  await api.updateColumnConfig(config.id, payload)
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
                      {/* Scenario design rule files — PPT columns only */}
                      {(col.id === 'col4' || col.id === 'col5') && (
                        <div style={{marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)'}}>
                          <div style={{fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'var(--text-secondary)'}}>
                            设计规则文件 — 当前栏目独立副本，修改不影响其他栏目
                          </div>
                          <div style={{display: 'flex', flexDirection: 'column', gap: 3}}>
                            {(scenarioFiles[col.id] || []).map(f => (
                              <div key={f.name} style={{display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4, background: editingScFile?.colId === col.id && editingScFile?.filename === f.name ? 'var(--bg-secondary)' : 'transparent'}}>
                                <span style={{flex: 1, fontSize: 11, fontWeight: editingScFile?.colId === col.id && editingScFile?.filename === f.name ? 600 : 400}}>{f.name}</span>
                                <span style={{fontSize: 9, color: f.source === 'custom' ? 'var(--success)' : 'var(--text-secondary)', background: f.source === 'custom' ? 'rgba(34,197,94,0.1)' : 'var(--bg-tertiary)', padding: '1px 6px', borderRadius: 3}}>
                                  {f.source === 'custom' ? '已自定义' : '默认'}
                                </span>
                                <span style={{fontSize: 9, color: 'var(--text-secondary)', minWidth: 40, textAlign: 'right'}}>{f.size > 1024 ? `${(f.size/1024).toFixed(1)}k` : `${f.size}B`}</span>
                                <button className="btn btn-ghost btn-sm" style={{fontSize: 10, padding: '1px 8px'}}
                                  onClick={() => openScenarioFile(col.id, f.name)}>
                                  编辑
                                </button>
                              </div>
                            ))}
                            {(!scenarioFiles[col.id] || scenarioFiles[col.id].length === 0) && (
                              <span style={{fontSize: 10, color: 'var(--text-secondary)'}}>点击展开栏目以加载文件列表</span>
                            )}
                          </div>
                          {/* Inline editor */}
                          {editingScFile && editingScFile.colId === col.id && (
                            <div style={{marginTop: 8}}>
                              <div style={{fontSize: 10, color: 'var(--text-secondary)', marginBottom: 4}}>
                                编辑: {editingScFile.filename}
                              </div>
                              <textarea
                                value={scFileContent}
                                onChange={e => setScFileContent(e.target.value)}
                                style={{width: '100%', minHeight: 260, fontFamily: 'monospace', fontSize: 11}}
                              />
                              <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 6}}>
                                <button className="btn btn-ghost btn-sm" onClick={() => setEditingScFile(null)}>取消</button>
                                <button className="btn btn-primary btn-sm" onClick={saveScenarioFile} disabled={scFileSaving}>
                                  {scFileSaving ? '保存中...' : '保存文件'}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

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

      {/* ═══ Image Provider Form Modal ═══ */}
      {showImageProviderForm && (
        <div className="dialog-overlay" onClick={e => { if (e.target === e.currentTarget) setShowImageProviderForm(false) }}>
          <div className="dialog-box" style={{ minWidth: 480 }}>
            <div className="dialog-title">{editImageProviderId ? '编辑图片生成提供商' : '添加图片生成提供商'}</div>
            <div className="form-label">名称</div>
            <input className="form-input" value={ipvName} onChange={e => setIpvName(e.target.value)} placeholder="如 通义万相" autoFocus />
            <div className="form-label" style={{ marginTop: 12 }}>API Key</div>
            <input className="form-input" value={ipvKey} onChange={e => setIpvKey(e.target.value)} placeholder="sk-..." />
            <div className="form-label" style={{ marginTop: 12 }}>Base URL</div>
            <input className="form-input" value={ipvUrl} onChange={e => setIpvUrl(e.target.value)} placeholder="https://dashscope.aliyuncs.com/compatible-mode/v1" />
            <div className="form-label" style={{ marginTop: 12 }}>模型列表（逗号分隔）</div>
            <input className="form-input" value={ipvModels} onChange={e => setIpvModels(e.target.value)} placeholder="wanx-v1" />
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
