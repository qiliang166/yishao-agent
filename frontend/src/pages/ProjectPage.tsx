import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, Voice, TTSProvider, LLMProvider } from '../services/api'
import { useModal } from '../components/ModalProvider'

// ── Types ──
interface Project {
  id: string; name: string; status: string; source_type: string
  storage_path?: string
  created_at: string; updated_at: string
}
type StageId = 1 | 2 | 3 | 4 | 5
type SubId = string

interface StageDef { id: StageId; label: string; subs: { id: SubId; label: string }[] }
interface TemplateItem { id: string; name: string; isDefault: boolean; meta: string; previewHtml: string; color: string; icon: string }

// ── Stage Definitions ──
const STAGES: StageDef[] = [
  { id: 1, label: '文案提取', subs: [{ id: '1a', label: '视频提取' }, { id: '1b', label: '文字输入' }, { id: '1c', label: '文件上传' }] },
  { id: 2, label: '教学文档', subs: [{ id: '2a', label: 'SOP文案' }, { id: '2b', label: '道与术文案' }, { id: '2c', label: '研学手册文案' }] },
  { id: 3, label: '输出课件', subs: [{ id: '3a', label: 'SOP课件' }, { id: '3b', label: '道术PPT' }, { id: '3c', label: '研学PPT' }] },
  { id: 4, label: '语音课件', subs: [{ id: '4a', label: '口播文案' }, { id: '4b', label: '口播语音' }] },
  { id: 5, label: '输出列表', subs: [] },
]

const CONFIG: Record<number, { model: string; tmpl: string; tmplInfo: string }> = {
  1: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: '—', tmplInfo: '' },
  2: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: '—', tmplInfo: '' },
  3: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: 'SOP标准模板.docx / PPT模板', tmplInfo: '提示词: SOP标准格式 v2.0 · SKILL: SOP表格填充' },
  4: { model: 'DeepSeek (deepseek-v4-pro)', tmpl: '标准口播模板', tmplInfo: '提示词: 口播稿生成 v1.0 · SKILL: 口播风格' },
  5: { model: '—', tmpl: '—', tmplInfo: '' },
}

// ── Download Helper ──
async function downloadFile(url: string, filename: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const objUrl = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = objUrl; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
  URL.revokeObjectURL(objUrl)
}

// ── Template Selector Component ──
function TemplateSelector({ items, selectedId, onSelect, previewTarget }: {
  items: TemplateItem[]; selectedId: string; onSelect: (item: TemplateItem) => void; previewTarget: string
}) {
  return (
    <div className="tmpl-group">
      {items.map(t => (
        <div key={t.id}
          className={`tmpl-card${t.id === selectedId ? ' selected' : ''}`}
          onClick={() => onSelect(t)}
        >
          <div className="tmpl-thumb" style={{ background: t.color + '22', color: t.color }}>{t.icon}</div>
          <div className="tmpl-info">
            <div className="tmpl-name">{t.name}{t.isDefault ? <span className="default-tag">默认</span> : null}</div>
            <div className="tmpl-meta">{t.meta}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Template data ──
const SOP_TEMPLATES: TemplateItem[] = [
  { id: 'sop-std', name: 'SOP标准模板.docx', isDefault: true, meta: '提示词: SOP标准格式 v2.0 · SKILL: SOP表格填充', color: '#4A8B3F', icon: '📃', previewHtml: '' },
  { id: 'sop-simple', name: '简约SOP模板.docx', isDefault: false, meta: '提示词: 简约SOP v1.0 · SKILL: 简约SOP填充', color: '#4A8B3F', icon: '📄', previewHtml: '' },
  { id: 'sop-detail', name: '详细SOP模板.docx', isDefault: false, meta: '提示词: 详细SOP v1.2 · SKILL: 详细SOP填充', color: '#4A8B3F', icon: '📋', previewHtml: '' },
]
const DAO_PPT_TEMPLATES: TemplateItem[] = [
  { id: 'dao-std', name: '道与术PPT模板.pptx', isDefault: true, meta: '提示词: PPT排版 v1.0 · SKILL: 道与术PPT技能', color: '#7C3AED', icon: '📌', previewHtml: '' },
  { id: 'dao-food', name: '美食风PPT模板.pptx', isDefault: false, meta: '提示词: 美食PPT v0.9 · SKILL: 美食PPT技能', color: '#C75B39', icon: '🍽', previewHtml: '' },
]
const YANXI_PPT_TEMPLATES: TemplateItem[] = [
  { id: 'yanxi-std', name: '研学手册PPT模板.pptx', isDefault: true, meta: '提示词: PPT排版 v1.0 · SKILL: 研学手册PPT技能', color: '#4A8B3F', icon: '📚', previewHtml: '' },
  { id: 'yanxi-food', name: '美食风PPT模板.pptx', isDefault: false, meta: '提示词: 美食PPT v0.9 · SKILL: 美食PPT技能', color: '#C75B39', icon: '🍽', previewHtml: '' },
]
const KOUBO_TEMPLATES: TemplateItem[] = [
  { id: 'koubo-std', name: '标准口播模板', isDefault: true, meta: '提示词: 口播稿生成 v1.0 · SKILL: 口播风格', color: '#0891B2', icon: '📢', previewHtml: '' },
  { id: 'koubo-fast', name: '快节奏口播模板', isDefault: false, meta: '提示词: 口播稿 v0.8 · SKILL: 快节奏口播', color: '#C75B39', icon: '⚡', previewHtml: '' },
]

// Dynamic stage1 prompts — loaded from column_configs, with fallbacks
const STAGE1_SKILL_FALLBACK = '## 菜名\n**菜名**：\n**菜系**：\n**成品特征**：\n**出品标准**：\n**记录日期**：\n**制作人/来源**：\n\n### 一、食材清单\n| 序号 | 用途 | 食材名称 | 用量 | 处理方式 | 备注 |\n|------|------|----------|------|----------|------|\n| 1 | 主料 | | | | |\n| 2 | 辅料 | | | | |\n| 3 | 调料 | | | | |\n\n> **准备要点**：\n\n### 二、工具与器皿\n| 序号 | 用途 | 工具名称 |\n|------|------|----------|\n| 1 | | |\n\n### 三、制作步骤\n| 序号 | 步骤 | 步骤说明 | 关键技巧 |\n|------|------|----------|----------|\n| 1 | 预处理 | | |\n| 2 | 烹饪 | | |\n\n### 四、时间与火候总览\n| 阶段 | 时长 | 火力 | 注意事项 |\n|------|------|------|----------|\n| | | | |\n\n### 五、试吃与品鉴记录\n- **口味**：\n- **口感**：\n- **色泽**：\n\n### 六、总结与评分\n- **难度**：☆\n- **耗时**：\n- **一句话点评**：'

const STAGE1_PROMPTS_FALLBACK: Record<string, string> = {
  text: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请将用户手打输入的食谱笔记整理为标准SOP文档。',
  video: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请根据视频相关内容提取完整的食谱SOP文档。',
  file: '你是国家高级烹饪技师、菜谱SOP规范整理专家。请从上传文件中提取完整食谱内容，整理为标准SOP文档。',
}

// ── Main Component ──
export default function ProjectPage() {
  const modal = useModal()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [project, setProject] = useState<Project | null>(null)
  const [stage, setStage] = useState<StageId>(1)
  const [sub, setSub] = useState<SubId>('1a')
  const [steps, setSteps] = useState<Record<string, string>>({})
  const [savedSteps, setSavedSteps] = useState<Record<string, string>>({})

  // Stage 1 state
  const [asrProviders, setAsrProviders] = useState<any[]>([])
  const [asrProviderId, setAsrProviderId] = useState('')
  const [asrModels, setAsrModels] = useState<string[]>([])
  const [videoUrl, setVideoUrl] = useState('')
  const [asrModel, setAsrModel] = useState('fun-asr')
  const [dlStatus, setDlStatus] = useState('')
  const [dlPercent, setDlPercent] = useState(0)
  const [dlTaskId, setDlTaskId] = useState('')
  const [videoPath, setVideoPath] = useState('')
  const [textInput, setTextInput] = useState('')
  const [videoText, setVideoText] = useState('')
  const [fileText, setFileText] = useState('')
  const mode1 = sub === '1a' ? 'link' : sub === '1b' ? 'text' : 'file' as 'link' | 'text' | 'file'
  const mode1Key = sub === '1a' ? 'video' : sub === '1b' ? 'text' : 'file'
  const [vcOpen, setVcOpen] = useState(false)
  const [savedFlash, setSavedFlash] = useState(0)
  const flashSave = () => {
    setSavedFlash(Date.now())
    setTimeout(() => setSavedFlash(0), 1500)
  }
  const vcRef = useRef<HTMLDivElement>(null)
  const [vcPos, setVcPos] = useState({ x: 0, y: 0 })
  const [vcSize, setVcSize] = useState({ w: 0, h: 0 })
  const dragRef = useRef<{ down: boolean; sx: number; sy: number; px: number; py: number }>({ down: false, sx: 0, sy: 0, px: 0, py: 0 })
  const resizing = useRef(false)
  const overlayRef = useRef(false)
  const [sourceTab, setSourceTab] = useState<'merged' | 'asr' | 'subtitle'>('merged')
  const [sourceMerged, setSourceMerged] = useState('')
  const [sourceAsr, setSourceAsr] = useState('')
  const [sourceSubtitle, setSourceSubtitle] = useState('')
  const [llmProviders, setLlmProviders] = useState<LLMProvider[]>([])
  const [step1Model, setStep1Model] = useState('')
  const [step1Generating, setStep1Generating] = useState('')

  // Stage 2 state
  const [step2Generating, setStep2Generating] = useState('') // which sub is generating
  const [stage2Prompts, setStage2Prompts] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [stage1Prompts, setStage1Prompts] = useState<Record<string, string>>({})
  const [stage1Skill, setStage1Skill] = useState('')
  const [stage4KouboPrompt, setStage4KouboPrompt] = useState('')
  const [s2SopModel, setS2SopModel] = useState('')
  const [s2DaoModel, setS2DaoModel] = useState('')
  const [s2YanxiModel, setS2YanxiModel] = useState('')
  const [s2SopDataSource, setS2SopDataSource] = useState('video')
  const [s2DaoDataSource, setS2DaoDataSource] = useState('video')
  const [s2YanxiDataSource, setS2YanxiDataSource] = useState('video')

  // Stage 3 state
  const [sopSelected, setSopSelected] = useState('sop-std')
  const [daoPptSelected, setDaoPptSelected] = useState('dao-std')
  const [yanxiPptSelected, setYanxiPptSelected] = useState('yanxi-std')
  const [pptGenerating, setPptGenerating] = useState('')

  // Stage 4 state
  const [kouboSelected, setKouboSelected] = useState('koubo-std')
  const [ttsProviderId, setTtsProviderId] = useState('')
  const [ttsModel, setTtsModel] = useState('cosyvoice-v3-flash')
  const [voiceId, setVoiceId] = useState('')
  const [ttsVoices, setTtsVoices] = useState<Voice[]>([])
  const [ttsProviders, setTtsProviders] = useState<TTSProvider[]>([])
  const [kouboText, setKouboText] = useState('')
  const [ttsGenerating, setTtsGenerating] = useState(false)
  const [ttsAudioUrl, setTtsAudioUrl] = useState('')
  const [projStoragePath, setProjStoragePath] = useState('')
  const [savingPath, setSavingPath] = useState(false)

  // Load project
  useEffect(() => {
    if (!id) return
    api.getProject(id).then(p => {
      setProject(p)
      setProjStoragePath(p.storage_path || '')
    }).catch(() => navigate('/'))
    api.getSteps(id).then((s: any[]) => {
      const map: Record<string, string> = {}
      s.forEach((x: any) => { map[x.step_name] = x.content })
      setSteps(map)
      setSavedSteps({...map})
      setVideoText(map['raw_video'] || map['video_text'] || '')
      setTextInput(map['raw_text'] || '')
      setFileText(map['raw_file'] || '')
    })
    api.listColumnConfigs().then((configs: any[]) => {
      const s1p: Record<string, string> = {}
      let s1s = ''
      const s2p: Record<string, { prompt: string; skill: string }> = {}
      let kouboP = ''
      configs.forEach((c: any) => {
        if (c.column_id === 'col1') {
          const key = c.id === 'c1-text' ? 'text' : c.id === 'c1-video' ? 'video' : c.id === 'c1-file' ? 'file' : ''
          if (key) { s1p[key] = c.prompt; if (!s1s) s1s = c.skill }
        }
        if (c.column_id === 'col2') {
          const key = c.id === 'c2-sop' ? 'sop' : c.id === 'c2-dao' ? 'dao' : c.id === 'c2-yanxi' ? 'yanxi' : ''
          if (key) s2p[key] = { prompt: c.prompt, skill: c.skill }
        }
        if (c.column_id === 'col5' && c.id === 'c5-koubo') {
          kouboP = c.prompt
        }
      })
      setStage1Prompts(s1p)
      if (s1s) setStage1Skill(s1s)
      setStage2Prompts(s2p)
      if (kouboP) setStage4KouboPrompt(kouboP)
    }).catch(() => {})
    api.listTtsProviders().then((providers: TTSProvider[]) => {
      setTtsProviders(providers)
      if (providers.length > 0 && !ttsProviderId) {
        const def = providers.find(p => p.is_default) || providers[0]
        setTtsProviderId(def.id)
        const models = Array.isArray(def.models) ? def.models : []
        if (models.length > 0) setTtsModel(models[0])
      }
    }).catch(() => {})
    api.listVoices().then((v: Voice[]) => {
      setTtsVoices(v)
      if (v.length > 0 && !voiceId) {
        const def = v.find(x => x.is_default) || v[0]
        setVoiceId(def.id)
      }
    }).catch(() => {})
    api.listAsrProviders().then((providers: any[]) => {
      setAsrProviders(providers)
      const enabled = providers.filter((p: any) => p.is_enabled)
      if (enabled.length > 0) {
        const def = enabled.find((p: any) => p.is_default) || enabled[0]
        setAsrProviderId(def.id)
        const models: string[] = Array.isArray(def.models) ? def.models : (def.models || '').split(',').map((s: string) => s.trim()).filter(Boolean)
        setAsrModels(models)
        if (models.length > 0 && !models.includes(asrModel)) {
          setAsrModel(models.includes('fun-asr') ? 'fun-asr' : models[0])
        }
      }
    }).catch(() => {})
    api.listProviders().then((providers: LLMProvider[]) => {
      setLlmProviders(providers)
      const def = providers.find(p => p.is_enabled) || providers[0]
      const defModels = Array.isArray(def?.models) ? def.models : []
      const defVal = def && defModels.length > 0 ? `${def.id}:${defModels[0]}` : ''
      if (providers.length > 0 && !step1Model) {
        if (defVal) setStep1Model(defVal)
      }
      if (defVal && !s2SopModel) setS2SopModel(defVal)
      if (defVal && !s2DaoModel) setS2DaoModel(defVal)
      if (defVal && !s2YanxiModel) setS2YanxiModel(defVal)
    }).catch(() => {})
  }, [id, navigate])

  // Save step helper
  const saveStep = useCallback((stepName: string, content: string) => {
    if (!id) return
    api.saveStep(id, stepName, content)
    setSteps(prev => ({ ...prev, [stepName]: content }))
    setSavedSteps(prev => ({ ...prev, [stepName]: content }))
  }, [id])

  const step1Key = () => sub === '1a' ? 'step1_video' : sub === '1b' ? 'step1_text' : 'step1_file'
  const step2Key = () => `step2_${sub === '2a' ? 'sop' : sub === '2b' ? 'daoshuyi' : 'yanxi'}`

  // Get source text for Stage 2 based on selected data source
  const getStage2Source = (source: string) => {
    switch (source) {
      case 'video': return steps.raw_video || ''
      case 'text': return steps.raw_text || ''
      case 'file': return steps.raw_file || ''
      default: return ''
    }
  }

  // ── Stage nav ──
  const switchStage = (s: StageId) => {
    setStage(s)
    const stageDef = STAGES.find(x => x.id === s)
    if (stageDef && stageDef.subs.length > 0) setSub(stageDef.subs[0].id)
  }

  // ── Video download ──
  const handleVideoDownload = async () => {
    if (!videoUrl.trim()) {
      modal.toast('请先粘贴视频链接', 'error')
      return
    }
    setDlStatus('downloading'); setDlPercent(0)
    try {
      const result: any = await api.downloadVideo(videoUrl, undefined, id, asrModel, asrProviderId)
      setDlTaskId(result.task_id)
      pollProgress(result.task_id)
    } catch (e: any) { setDlStatus('error: ' + e.message) }
  }
  const pollProgress = async (taskId: string) => {
    const poll = async () => {
      const p: any = await api.getVideoProgress(taskId)
      setDlPercent(p.percent); setDlStatus(p.status)
      if (p.text) setVideoText(p.text)
      if (p.subtitle_text) setSourceSubtitle(p.subtitle_text)
      if (p.asr_text) setSourceAsr(p.asr_text)
      if (p.merged_text) { setSourceMerged(p.merged_text); setVideoText(p.merged_text); setSourceTab('merged') }
      else if (p.asr_text) { setSourceTab('asr') }
      else if (p.subtitle_text) { setSourceTab('subtitle') }
      if (p.video_path) setVideoPath(p.video_path)
      if (p.status === 'completed') {
        setDlStatus('done')
        modal.toast('✅ 视频下载完成', 'success')
        const rawText = p.merged_text || p.asr_text || p.text || ''
        if (rawText && id) {
          api.saveStep(id, 'raw_video', rawText)
          setSteps(prev => ({ ...prev, raw_video: rawText }))
          setSavedSteps(prev => ({ ...prev, raw_video: rawText }))
        }
        return
      }
      if (p.status === 'failed') { setDlStatus('failed'); modal.toast('❌ 下载失败', 'error'); return }
      setTimeout(poll, 1000)
    }
    poll()
  }
  // ── LLM Generate ──
  const doGenerate = async (stepKey: string, systemPrompt: string, userMessage: string, providerId?: string, model?: string) => {
    if (!id) return
    try {
      const result: any = await api.llmGenerate({
        provider_id: providerId || 'default', model: model || 'deepseek-v4-pro',
        system_prompt: systemPrompt, user_message: userMessage,
      })
      const content = result.content
      setSteps(prev => ({ ...prev, [stepKey]: content }))
      saveStep(stepKey, content)
      return content
    } catch (e: any) { modal.toast('生成失败: ' + e.message, 'error'); return null }
  }

  // ── Stage 1 Generate ──
  const doGenerateStep1 = async () => {
    const source = mode1 === 'text' ? textInput : mode1 === 'file' ? fileText : videoText
    if (!source.trim() || !id || !step1Model) return
    setStep1Generating(sub)
    try {
      const [providerId, model] = step1Model.split(':')
      const prompt = stage1Prompts[mode1Key] || STAGE1_PROMPTS_FALLBACK[mode1Key]
      const skill = stage1Skill || STAGE1_SKILL_FALLBACK
      const result: any = await api.llmGenerate({
        provider_id: providerId, model,
        system_prompt: prompt,
        user_message: `请将以下内容按指定格式整理：\n\n${source}\n\n输出格式要求：\n${skill}`,
      })
      const content = result.content
      const key = step1Key()
      setSteps(prev => ({ ...prev, [key]: content }))
      saveStep(key, content)
    } catch (e: any) { modal.toast('生成失败: ' + e.message, 'error') }
    finally { setStep1Generating('') }
  }

  // ── PPT / SOP Generation ──
  const doGeneratePPT = async (stepKey: string, content: string, tmplId: string, label: string) => {
    setPptGenerating(stepKey)
    try {
      const result: any = await api.generatePPT(content, tmplId, undefined, id)
      setGenFiles(prev => [...prev, {
        name: result.filename, type: 'PPT',
        source: label,
        url: result.download_url || '/api/download/' + encodeURIComponent(result.filename),
      }])
      modal.toast(`PPT 已生成: ${result.filename}`, 'success')
    } catch (e: any) { modal.toast('PPT生成失败: ' + e.message, 'error') }
    finally { setPptGenerating('') }
  }
  const doExportSOP = async (content: string) => {
    try {
      const result: any = await api.exportSOP(content, undefined, id)
      setGenFiles(prev => [...prev, {
        name: result.filename, type: 'Word',
        source: 'SOP课件',
        url: result.download_url || '/api/download/' + encodeURIComponent(result.filename),
      }])
      modal.toast(`SOP 已导出: ${result.filename}`, 'success')
    } catch (e: any) { modal.toast('SOP导出失败: ' + e.message, 'error') }
  }

  // ── TTS ──
  const doTTS = async () => {
    if (!kouboText.trim()) return
    setTtsGenerating(true)
    try {
      const selectedVoice = ttsVoices.find(v => v.id === voiceId)
      const result: any = await api.ttsSynthesize(
        kouboText, ttsModel,
        selectedVoice?.voice_id,
        undefined, undefined,
        id, ttsProviderId || undefined,
      )
      setTtsAudioUrl(result.audio_url)
      setGenFiles(prev => [...prev, {
        name: (project?.name || 'output') + '_口播.mp3', type: 'MP3',
        source: '口播语音',
        url: result.audio_url || '/api/audio/' + encodeURIComponent(result.filename || ''),
      }])
    } catch (e: any) { modal.toast('TTS失败: ' + e.message, 'error') }
    finally { setTtsGenerating(false) }
  }

  // Generated files tracking
  const [genFiles, setGenFiles] = useState<{ name: string; type: string; source: string; url: string }[]>([])

  // ── Stage status dots ──
  const stageDot = (s: StageId) => {
    const st = steps
    if (s === 1 && (st.step1_video || st.step1_text || st.step1_file)) return 'done'
    if (s === 2 && (st.step2_sop || st.step2_daoshuyi || st.step2_yanxi)) return 'done'
    if (s === 3 && (st.step3_sop_doc || st.step3_dao_ppt || st.step3_yan_ppt)) return 'done'
    if (s === 4 && (st.step4_koubo || st.step4_tts)) return 'done'
    if (s === 5 && genFiles.length > 0) return 'done'
    if (s === stage) return 'progress'
    return 'waiting'
  }

  if (!project) return <div className="pipeline-area"><div style={{ padding: 32 }}>加载中...</div></div>

  return (
    <div className="pipeline-area">
      {/* ═══ Project Header ═══ */}
      <div className="proj-header-bar">
        <span className="proj-header-name">{project?.name || '加载中...'}</span>
        <span className={`pc-status ${project?.status || 'draft'}`}
          style={{ cursor: 'pointer' }}
          onClick={async () => {
            if (!id) return
            const newStatus = (project?.status === 'completed') ? 'draft' : 'completed'
            await api.updateProject(id, { status: newStatus })
            setProject(prev => prev ? { ...prev, status: newStatus } : prev)
          }}>{project?.status === 'completed' ? '已完成' : '草稿'}</span>
        <button style={{
            fontSize: 12, padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
            border: (project as any)?.is_locked ? '1px solid var(--warning)' : '1px solid var(--border)',
            background: (project as any)?.is_locked ? 'var(--warning)' : 'var(--card)',
            color: (project as any)?.is_locked ? '#fff' : 'var(--text-secondary)',
          }}
          onClick={async () => {
            if (!id) return
            const locked = !(project as any)?.is_locked
            await api.updateProject(id, { is_locked: locked } as any)
            setProject(prev => prev ? { ...prev, is_locked: locked } as any : prev)
          }}>
          {(project as any)?.is_locked ? '🔒 已锁定' : '🔓 锁定'}
        </button>
      </div>

      {/* ═══ Top Nav ═══ */}
      <div className="top-nav">
        {STAGES.map((s, i) => (
          <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span className="tn-arrow">→</span>}
            <div className={`tn-item${stage === s.id ? ' active' : ''}`}
              onClick={() => switchStage(s.id)}>
              <span className="tn-num">{s.id}</span> {s.label}
              <span className={`tn-dot ${stageDot(s.id)}`} />
            </div>
          </span>
        ))}
      </div>

      {/* ═══ Sub Nav ═══ */}
      {STAGES.find(s => s.id === stage)?.subs.length ? (
        <div className="sub-nav">
          {STAGES.find(s => s.id === stage)!.subs.map((sn, i) => (
            <span key={sn.id} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              {i > 0 && <span className="sn-sep">|</span>}
              <div className={`sn-item${sub === sn.id ? ' active' : ''}`}
                onClick={() => setSub(sn.id)}>{sn.label}</div>
            </span>
          ))}
        </div>
      ) : (
        <div className="sub-nav">
          <span className="sub-nav-desc">输出列表 — 所有产出物统一下载</span>
        </div>
      )}

      {/* ═══ Content ═══ */}
      <div className="content-area">
        {/* ====== STAGE 1: 文案提取 ====== */}
        {stage === 1 && (
          <div className="panel-grid">
            <div className="panel-left">
              {/* Shared model selector */}
              <div className="card">
                <div className="card-title">🤖 模型选择</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <select className="form-select" style={{ flex: 1 }}
                    value={step1Model}
                    onChange={e => setStep1Model(e.target.value)}>
                    <option value="">选择模型...</option>
                    {llmProviders.filter(p => p.is_enabled).map(p =>
                      (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                        <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* 1a: Video Link */}
              {mode1 === 'link' && <>
                <div className="card">
                  <div className="card-title">📺 视频提取</div>
                  <div className="card-hint">粘贴视频链接 → 下载 + 语音识别 → 提取内容在下方编辑</div>
                  <input className="form-input" placeholder="粘贴视频链接（支持抖音/B站/YouTube等）"
                    value={videoUrl} onChange={e => setVideoUrl(e.target.value)} style={{ marginBottom: 6 }} />
                  <div className="form-row" style={{ gap: 6, marginBottom: 6 }}>
                    {asrProviders.filter((p: any) => p.is_enabled).length > 1 && (
                      <select className="form-select" style={{ flex: 1 }}
                        value={asrProviderId}
                        onChange={e => {
                          setAsrProviderId(e.target.value)
                          const prov = asrProviders.find((p: any) => p.id === e.target.value)
                          if (prov) {
                            const models: string[] = Array.isArray(prov.models) ? prov.models : (prov.models || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                            setAsrModels(models)
                            if (models.length > 0 && !models.includes(asrModel)) {
                              setAsrModel(models[0])
                            }
                          }
                        }}>
                        {asrProviders.filter((p: any) => p.is_enabled).map((p: any) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    )}
                    <select className="form-select" style={{ flex: 1 }}
                      value={asrModel}
                      onChange={e => setAsrModel(e.target.value)}>
                      {asrModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <button className="btn btn-primary btn-sm w-full"
                    onClick={handleVideoDownload} disabled={dlStatus === 'downloading'}>
                    ▶ 下载并识别
                  </button>
                  {dlStatus === 'downloading' && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--primary)', marginBottom: 4 }}>⏳ 正在下载... {dlPercent}%</div>
                      <div style={{ background: 'var(--border)', height: 6, borderRadius: 3 }}>
                        <div style={{ width: Math.max(dlPercent, 2) + '%', height: '100%', background: 'var(--primary)', borderRadius: 3, transition: 'width .3s' }} />
                      </div>
                    </div>
                  )}
                  {dlStatus === 'done' && <div className="form-hint" style={{ color: 'var(--success)' }}>✅ 下载完成</div>}
                  {dlStatus === 'failed' && <div className="form-hint" style={{ color: 'var(--warning)' }}>❌ 下载失败</div>}
                  {dlStatus.startsWith('error') && <div className="form-hint" style={{ color: 'var(--warning)' }}>{dlStatus}</div>}
                  <button className="btn btn-ghost btn-sm w-full" style={{ marginTop: 4 }}
                    onClick={async () => {
                      if (!videoPath && id) {
                        try {
                          const vids: any = await api.listProjectVideos(id)
                          if (vids.videos?.length > 0) setVideoPath(vids.videos[0].path)
                        } catch (_) {}
                      }
                      setVcOpen(true)
                    }} >
                    📺 播放校验
                  </button>
                  <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 8 }}
                    disabled={step1Generating === '1a' || !step1Model || !videoText.trim()}
                    onClick={doGenerateStep1}>
                    {step1Generating === '1a' ? '⏳ 生成中...' : '⚙ 整理文档'}
                  </button>
                </div>
                {videoText && (
                  <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                    <div className="card-title">📝 提取的原始文本</div>
                    <div className="card-hint">视频提取的原始字幕内容，可编辑后重新生成</div>
                    {(sourceMerged || sourceAsr || sourceSubtitle) && (
                      <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
                        {sourceMerged && (
                          <button
                            className={`btn ${sourceTab === 'merged' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                            onClick={() => { setSourceTab('merged'); setVideoText(sourceMerged) }}>
                            合并版
                          </button>
                        )}
                        {sourceAsr && (
                          <button
                            className={`btn ${sourceTab === 'asr' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                            onClick={() => { setSourceTab('asr'); setVideoText(sourceAsr) }}>
                            语音识别
                          </button>
                        )}
                        {sourceSubtitle && (
                          <button
                            className={`btn ${sourceTab === 'subtitle' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                            onClick={() => { setSourceTab('subtitle'); setVideoText(sourceSubtitle) }}
                            disabled={!sourceSubtitle}>
                            字幕
                          </button>
                        )}
                      </div>
                    )}
                    <textarea className="form-textarea" style={{ flex: 1, minHeight: 150 }}
                      value={videoText}
                      onChange={e => setVideoText(e.target.value)}
                      placeholder="视频字幕将显示在此..." />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setVideoText('')}>🗑 清空</button>
                      <button className="btn btn-primary btn-sm" disabled={!videoText.trim()}
                        onClick={() => { if (id && videoText.trim()) { saveStep('video_text', videoText); saveStep('raw_video', videoText); flashSave() } }} style={savedFlash ? { background: '#22c55e', borderColor: '#22c55e', color: '#fff' } : videoText !== (savedSteps.video_text || '') ? { background: 'var(--warning)', borderColor: 'var(--warning)', color: '#fff' } : undefined}>{savedFlash ? '✓ 已保存' : videoText !== (savedSteps.video_text || '') ? '💾 保存' : '✓ 已保存'}</button>
                    </div>
                  </div>
                )}
                <div className="card">
                  <div className="card-title">📁 项目保存路径</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="form-input" style={{ fontSize: 10, flex: 1 }}
                      value={projStoragePath}
                      onChange={e => setProjStoragePath(e.target.value)}
                      placeholder={project?.storage_path || `D:\\YISHAOAGENT\\data\\output\\${project?.name || ''}`} />
                    <button className="btn btn-ghost btn-sm" title="打开文件夹"
                      onClick={async () => {
                        const p = (projStoragePath || project?.storage_path || '').replace(/\\/g, '/')
                        if (p) {
                          try { await api.openFolder(p) } catch { modal.toast('无法打开文件夹', 'error') }
                        }
                      }}>
                      📂
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={savingPath}
                      onClick={async () => {
                        if (!id) return
                        const p = projStoragePath.trim() || (project?.storage_path || `D:\\YISHAOAGENT\\data\\output\\${project?.name || ''}`)
                        setSavingPath(true)
                        try {
                          await api.updateProject(id, { storage_path: p })
                          setProjStoragePath(p)
                          setProject(prev => prev ? { ...prev, storage_path: p } : prev)
                          modal.toast('保存路径已更新', 'success')
                        } catch (e: any) {
                          modal.toast('保存失败: ' + e.message, 'error')
                        } finally { setSavingPath(false) }
                      }}>
                      {savingPath ? '...' : '保存'}
                    </button>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>
                    留空则使用全局默认路径
                  </div>
                </div>
              </>}

              {/* 1b: Text Input */}
              {mode1 === 'text' && (
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="card-title">✏️ 文字输入</div>
                  <div className="card-hint">直接粘贴或输入食谱笔记，可编辑后重新生成</div>
                  <textarea className="form-textarea" style={{ flex: 1, minHeight: 280 }}
                    placeholder="在此粘贴或输入食谱笔记..."
                    value={textInput} onChange={e => setTextInput(e.target.value)} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTextInput('')}>🗑 清空</button>
                    <button className="btn btn-primary btn-sm" disabled={!textInput.trim()}
                      onClick={() => { if (id && textInput.trim()) { saveStep('video_text', textInput); saveStep('raw_text', textInput); flashSave() } }} style={savedFlash ? { background: '#22c55e', borderColor: '#22c55e', color: '#fff' } : textInput !== (savedSteps.video_text || '') ? { background: 'var(--warning)', borderColor: 'var(--warning)', color: '#fff' } : undefined}>{savedFlash ? '✓ 已保存' : textInput !== (savedSteps.video_text || '') ? '💾 保存' : '✓ 已保存'}</button>
                    <button className="btn btn-primary btn-sm"
                      disabled={step1Generating === '1b' || !step1Model || !textInput.trim()}
                      onClick={doGenerateStep1}>
                      {step1Generating === '1b' ? '⏳ 生成中...' : '⚙ 整理文档'}
                    </button>
                  </div>
                </div>
              )}

              {/* 1c: File Upload */}
              {mode1 === 'file' && <>
                <div className="card">
                  <div className="card-title">📄 文件上传</div>
                  <div className="card-hint">支持 .txt / .md / .docx 文件，读取后内容在下方编辑</div>
                  <input type="file" accept=".txt,.md,.docx" style={{ fontSize: 10, marginBottom: 6 }}
                    onChange={async e => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      const text = await f.text()
                      setFileText(text)
                      if (id && text) {
                        api.saveStep(id, 'raw_file', text)
                        setSteps(prev => ({ ...prev, raw_file: text }))
                        setSavedSteps(prev => ({ ...prev, raw_file: text }))
                      }
                    }} />
                  <button className="btn btn-primary btn-sm w-full"
                    disabled={step1Generating === '1c' || !step1Model || !fileText.trim()}
                    onClick={doGenerateStep1}>
                    {step1Generating === '1c' ? '⏳ 生成中...' : '⚙ 整理文档'}
                  </button>
                </div>
                <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="card-title">📝 文件原始内容</div>
                  <div className="card-hint">文件读取的原始内容，可编辑后重新生成</div>
                  <textarea className="form-textarea" style={{ flex: 1, minHeight: 200 }}
                    value={fileText}
                    onChange={e => setFileText(e.target.value)}
                    placeholder="文件内容将显示在此..." />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setFileText('')}>🗑 清空</button>
                    <button className="btn btn-primary btn-sm" disabled={!fileText.trim()}
                      onClick={() => { if (id && fileText.trim()) { saveStep('video_text', fileText); saveStep('raw_file', fileText); flashSave() } }} style={savedFlash ? { background: '#22c55e', borderColor: '#22c55e', color: '#fff' } : fileText !== (savedSteps.video_text || '') ? { background: 'var(--warning)', borderColor: 'var(--warning)', color: '#fff' } : undefined}>{savedFlash ? '✓ 已保存' : fileText !== (savedSteps.video_text || '') ? '💾 保存' : '✓ 已保存'}</button>
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">📁 项目保存路径</div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="form-input" style={{ fontSize: 10, flex: 1 }}
                      value={projStoragePath}
                      onChange={e => setProjStoragePath(e.target.value)}
                      placeholder={project?.storage_path || `D:\\YISHAOAGENT\\data\\output\\${project?.name || ''}`} />
                    <button className="btn btn-ghost btn-sm" title="打开文件夹"
                      onClick={async () => {
                        const p = (projStoragePath || project?.storage_path || '').replace(/\\/g, '/')
                        if (p) {
                          try { await api.openFolder(p) } catch { modal.toast('无法打开文件夹', 'error') }
                        }
                      }}>
                      📂
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={savingPath}
                      onClick={async () => {
                        if (!id) return
                        const p = projStoragePath.trim() || (project?.storage_path || `D:\\YISHAOAGENT\\data\\output\\${project?.name || ''}`)
                        setSavingPath(true)
                        try {
                          await api.updateProject(id, { storage_path: p })
                          setProjStoragePath(p)
                          setProject(prev => prev ? { ...prev, storage_path: p } : prev)
                          modal.toast('保存路径已更新', 'success')
                        } catch (e: any) {
                          modal.toast('保存失败: ' + e.message, 'error')
                        } finally { setSavingPath(false) }
                      }}>
                      {savingPath ? '...' : '保存'}
                    </button>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>
                    留空则使用全局默认路径
                  </div>
                </div>
              </>}
            </div>

            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="card-title">🤖 AI 生成结果</div>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 280 }}
                  value={steps[step1Key()] || ''}
                  onChange={e => { setSteps(prev => ({ ...prev, [step1Key()]: e.target.value })) }}
                  placeholder="点击左侧「生成」按钮，AI 整理后的标准 SOP 文档将显示在此..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {mode1 === 'link' ? '来源：视频提取' : mode1 === 'text' ? '来源：文字输入' : '来源：文件上传'}
                  </span>
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps[step1Key()]}
                      onClick={async () => {
                        if (!id) return
                        try {
                          const label = sub === '1a' ? '视频提取' : sub === '1b' ? '文字输入' : '文件上传'
                          const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_${label}_AI整理.txt`, steps[step1Key()] || '')
                          modal.toast(`已保存到 ${resp.path}`, 'success')
                        } catch (e: any) {
                          modal.toast('保存失败: ' + e.message, 'error')
                        }
                      }}>📥 保存到项目</button>
                    <button className="btn btn-primary btn-sm"
                      disabled={!steps[step1Key()]}
                      style={(steps[step1Key()] || '') !== (savedSteps[step1Key()] || '') ? { background: 'var(--warning)', borderColor: 'var(--warning)', color: '#fff' } : undefined}
                      onClick={() => saveStep(step1Key(), steps[step1Key()] || '')}>{(steps[step1Key()] || '') !== (savedSteps[step1Key()] || '') ? '💾 保存' : '✓ 已保存'}</button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps[step1Key()]}
                      onClick={() => { setSteps(prev => ({ ...prev, [step1Key()]: '' })); saveStep(step1Key(), '') }}>✕ 清空</button>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== STAGE 2: 教学文档 ====== */}
        {stage === 2 && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                {/* 2a: SOP文案 */}
                {sub === '2a' && <>
                  <div className="card-title" style={{ color: 'var(--success)' }}>📃 SOP文案生成</div>
                  <div className="card-hint">基于文案提取结果，使用栏目配置中设定的提示词和SKILL生成标准SOP文案</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    <div className="form-label">数据来源</div>
                    <select className="form-select" style={{ marginBottom: 6 }} value={s2SopDataSource} onChange={e => setS2SopDataSource(e.target.value)}>
                      <option value="video">视频提取 — {steps.raw_video ? '已有内容' : '暂无内容'}</option>
                      <option value="text">文字输入 — {steps.raw_text ? '已有内容' : '暂无内容'}</option>
                      <option value="file">文件上传 — {steps.raw_file ? '已有内容' : '暂无内容'}</option>
                    </select>
                  </div>
                  <div className="form-label">大模型</div>
                  <select className="form-select" style={{ marginBottom: 8 }} value={s2SopModel} onChange={e => setS2SopModel(e.target.value)}>
                    <option value="">选择模型...</option>
                    {llmProviders.filter(p => p.is_enabled).map(p =>
                      (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                        <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                      ))
                    )}
                  </select>
                  <button className="btn btn-primary btn-sm w-full"
                    disabled={!getStage2Source(s2SopDataSource) || !s2SopModel || step2Generating === '2a'}
                    onClick={async () => {
                      setStep2Generating('2a')
                      const prompt = stage2Prompts.sop?.prompt || '请将以下食谱内容整理为标准操作流程(SOP)文案。按步骤、操作、标准、备注四列整理。'
                      const [pid, mdl] = s2SopModel.split(':')
                      await doGenerate('step2_sop', prompt, getStage2Source(s2SopDataSource), pid, mdl)
                      setStep2Generating('')
                    }}>
                    {step2Generating === '2a' ? '⏳ 生成中...' : '⚙ AI 生成 SOP文案'}
                  </button>
                </>}

                {/* 2b: 道与术文案 */}
                {sub === '2b' && <>
                  <div className="card-title" style={{ color: 'var(--purple)' }}>💡 道与术文案生成</div>
                  <div className="card-hint">基于文案提取结果，使用栏目配置中设定的提示词和SKILL生成「道与术」分析文案</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    <div className="form-label">数据来源</div>
                    <select className="form-select" style={{ marginBottom: 6 }} value={s2DaoDataSource} onChange={e => setS2DaoDataSource(e.target.value)}>
                      <option value="video">视频提取 — {steps.raw_video ? '已有内容' : '暂无内容'}</option>
                      <option value="text">文字输入 — {steps.raw_text ? '已有内容' : '暂无内容'}</option>
                      <option value="file">文件上传 — {steps.raw_file ? '已有内容' : '暂无内容'}</option>
                    </select>
                  </div>
                  <div className="form-label">大模型</div>
                  <select className="form-select" style={{ marginBottom: 8 }} value={s2DaoModel} onChange={e => setS2DaoModel(e.target.value)}>
                    <option value="">选择模型...</option>
                    {llmProviders.filter(p => p.is_enabled).map(p =>
                      (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                        <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                      ))
                    )}
                  </select>
                  <button className="btn btn-primary btn-sm w-full"
                    disabled={!getStage2Source(s2DaoDataSource) || !s2DaoModel || step2Generating === '2b'}
                    onClick={async () => {
                      setStep2Generating('2b')
                      const prompt = stage2Prompts.dao?.prompt || '请分析以下食谱内容的道（原理、烹饪哲学）与术（具体技巧、手法）。'
                      const [pid, mdl] = s2DaoModel.split(':')
                      await doGenerate('step2_daoshuyi', prompt, getStage2Source(s2DaoDataSource), pid, mdl)
                      setStep2Generating('')
                    }}>
                    {step2Generating === '2b' ? '⏳ 生成中...' : '⚙ AI 生成 道与术文案'}
                  </button>
                </>}

                {/* 2c: 研学手册文案 */}
                {sub === '2c' && <>
                  <div className="card-title" style={{ color: 'var(--warning)' }}>📖 研学手册文案生成</div>
                  <div className="card-hint">基于文案提取结果，使用栏目配置中设定的提示词和SKILL生成研学手册文案</div>
                  <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
                    <div className="form-label">数据来源</div>
                    <select className="form-select" style={{ marginBottom: 6 }} value={s2YanxiDataSource} onChange={e => setS2YanxiDataSource(e.target.value)}>
                      <option value="video">视频提取 — {steps.raw_video ? '已有内容' : '暂无内容'}</option>
                      <option value="text">文字输入 — {steps.raw_text ? '已有内容' : '暂无内容'}</option>
                      <option value="file">文件上传 — {steps.raw_file ? '已有内容' : '暂无内容'}</option>
                    </select>
                  </div>
                  <div className="form-label">大模型</div>
                  <select className="form-select" style={{ marginBottom: 8 }} value={s2YanxiModel} onChange={e => setS2YanxiModel(e.target.value)}>
                    <option value="">选择模型...</option>
                    {llmProviders.filter(p => p.is_enabled).map(p =>
                      (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                        <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                      ))
                    )}
                  </select>
                  <button className="btn btn-primary btn-sm w-full"
                    disabled={!getStage2Source(s2YanxiDataSource) || !s2YanxiModel || step2Generating === '2c'}
                    onClick={async () => {
                      setStep2Generating('2c')
                      const prompt = stage2Prompts.yanxi?.prompt || '请将以下食谱内容整理为研学手册文案，包含背景知识、动手步骤、观察要点。'
                      const [pid, mdl] = s2YanxiModel.split(':')
                      await doGenerate('step2_yanxi', prompt, getStage2Source(s2YanxiDataSource), pid, mdl)
                      setStep2Generating('')
                    }}>
                    {step2Generating === '2c' ? '⏳ 生成中...' : '⚙ AI 生成 研学手册文案'}
                  </button>
                </>}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="card-title">生成 / 编辑</div>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 120 }}
                  value={steps[step2Key()] || ''}
                  onChange={e => {
                    setSteps(prev => ({ ...prev, [step2Key()]: e.target.value }))
                  }}
                  placeholder="点击生成按钮，AI生成后在此编辑..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                    {sub === '2a' ? '编辑完成后保存，即可供「标准SOP」栏目引用'
                      : sub === '2b' ? '编辑完成后保存，即可供「合成PPT」栏目引用'
                        : '编辑完成后保存，即可供「合成PPT」「口播文案」栏目引用'}
                  </span>
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setSteps(prev => ({ ...prev, [step2Key()]: '' }))
                      saveStep(step2Key(), '')
                    }}>✕ 清空</button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps[step2Key()]}
                      onClick={async () => {
                        if (!id) return
                        try {
                          const label = sub === '2a' ? 'SOP文案' : sub === '2b' ? '道与术文案' : '研学手册文案'
                          const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_${label}.txt`, steps[step2Key()] || '')
                          modal.toast(`已保存到 ${resp.path}`, 'success')
                        } catch (e: any) {
                          modal.toast('保存失败: ' + e.message, 'error')
                        }
                      }}>📥 保存到项目</button>
                    <button className="btn btn-primary btn-sm" onClick={() => {
                      saveStep(step2Key(), steps[step2Key()] || '')
                    }} style={(steps[step2Key()] || '') !== (savedSteps[step2Key()] || '') ? { background: 'var(--warning)', borderColor: 'var(--warning)', color: '#fff' } : undefined}>{(steps[step2Key()] || '') !== (savedSteps[step2Key()] || '') ? '💾 保存' : '✓ 已保存'}</button>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== STAGE 3: 输出课件 ====== */}
        {stage === 3 && sub === '3a' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">SOP 生成 + 导出</div>
                <div className="card-hint">选择模板自动关联提示词+SKILL，配置在「项目配置」→ 栏目配置</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={SOP_TEMPLATES} selectedId={sopSelected}
                  onSelect={t => setSopSelected(t.id)} previewTarget="prev3" />
                <div className="form-label" style={{ marginTop: 10 }}>品牌信息（可选）</div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input className="form-input" placeholder="版权" style={{ flex: 1 }} />
                  <input className="form-input" placeholder="签名" style={{ flex: 1 }} />
                </div>
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  onClick={() => doExportSOP(steps.step2_sop || steps.step1_video || steps.step1_text || steps.step1_file || '')}>
                  📄 AI 生成 + 导出 .docx
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">📃 模板预览 — {SOP_TEMPLATES.find(t => t.id === sopSelected)?.name}</div>
                  <div className="tmpl-preview-body" style={{ flex: 1, overflow: 'auto' }}>
                    <div className="prev-sop">
                      <div className="prev-title">【标准SOP】菜品名称</div>
                      <table><thead><tr><th>步骤</th><th>操作</th><th>标准</th><th>备注</th></tr></thead>
                        <tbody><tr><td>1</td><td>备料</td><td>食材洗净切配</td><td>—</td></tr>
                          <tr><td>2</td><td>烹饪</td><td>火候/时间</td><td>—</td></tr></tbody></table>
                      <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>标准表格格式 · 清晰步骤划分</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 3 && sub === '3b' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">📌 道术PPT</div>
                <div className="card-hint">基于道与术文案，选择模板合成PPT</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={DAO_PPT_TEMPLATES} selectedId={daoPptSelected}
                  onSelect={t => setDaoPptSelected(t.id)} previewTarget="prev3b" />
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  disabled={pptGenerating !== ''}
                  onClick={() => doGeneratePPT('step3_dao_ppt', steps.step2_daoshuyi || '', daoPptSelected, '道术PPT')}>
                  {pptGenerating === 'step3_dao_ppt' ? '⏳ 生成中...' : '📌 合成道术PPT'}
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">📌 模板预览 — {DAO_PPT_TEMPLATES.find(t => t.id === daoPptSelected)?.name}</div>
                  <div className="tmpl-preview-body" style={{ flex: 1, overflow: 'auto' }}>
                    <div className="prev-ppt">
                      <div className="prev-slide" style={{ borderTop: '3px solid var(--purple)' }}>
                        <span style={{ fontWeight: 700 }}>标题页</span>
                        <div className="slide-bar" style={{ background: 'var(--purple)' }} />
                        <span style={{ fontSize: 7 }}>道与术分析</span>
                      </div>
                      <div className="prev-slide"><span>内容页</span><div className="slide-bar" /><span style={{ fontSize: 7 }}>分析要点</span></div>
                      <div className="prev-slide"><span>内容页</span><div className="slide-bar" /><span style={{ fontSize: 7 }}>总结</span></div>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>深色商务风 · 3页布局 · 结构清晰</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 3 && sub === '3c' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">📚 研学PPT</div>
                <div className="card-hint">基于研学手册文案，选择模板合成PPT</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={YANXI_PPT_TEMPLATES} selectedId={yanxiPptSelected}
                  onSelect={t => setYanxiPptSelected(t.id)} previewTarget="prev3c" />
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  disabled={pptGenerating !== ''}
                  onClick={() => doGeneratePPT('step3_yan_ppt', steps.step2_yanxi || '', yanxiPptSelected, '研学PPT')}>
                  {pptGenerating === 'step3_yan_ppt' ? '⏳ 生成中...' : '📌 合成研学PPT'}
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">📚 模板预览 — {YANXI_PPT_TEMPLATES.find(t => t.id === yanxiPptSelected)?.name}</div>
                  <div className="tmpl-preview-body" style={{ flex: 1, overflow: 'auto' }}>
                    <div className="prev-ppt">
                      <div className="prev-slide" style={{ borderTop: '3px solid var(--success)' }}>
                        <span style={{ fontWeight: 700 }}>研学封面</span>
                        <div className="slide-bar" style={{ background: 'var(--success)' }} />
                      </div>
                      <div className="prev-slide"><span>背景</span><div className="slide-bar" /></div>
                      <div className="prev-slide"><span>步骤</span><div className="slide-bar" /></div>
                      <div className="prev-slide"><span>要点</span><div className="slide-bar" /></div>
                      <div className="prev-slide"><span>总结</span><div className="slide-bar" /></div>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>清新学术风 · 5页布局 · 体系完整</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== STAGE 4: 语音课件 ====== */}
        {stage === 4 && sub === '4a' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">口播文案</div>
                <div className="card-hint">基于研学手册文案，选择模板生成口播稿</div>
                <div className="form-label">来源</div>
                <select className="form-select" style={{ marginBottom: 8 }}><option>研学手册文案</option></select>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={KOUBO_TEMPLATES} selectedId={kouboSelected}
                  onSelect={t => setKouboSelected(t.id)} previewTarget="prev4a" />
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  onClick={async () => {
                    setStep2Generating('koubo')
                    const content = await doGenerate('step4_koubo',
                      stage4KouboPrompt || '你是一个短视频口播稿专家。请根据以下研学手册内容生成口播稿，风格亲切自然，适合美食类短视频。',
                      steps.step2_yanxi || steps.step1_video || steps.step1_text || steps.step1_file || '')
                    if (content) setKouboText(content)
                    setStep2Generating('')
                  }}>
                  {step2Generating === 'koubo' ? '⏳ 生成中...' : '📢 生成口播稿'}
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">📢 口播稿预览 — {KOUBO_TEMPLATES.find(t => t.id === kouboSelected)?.name}</div>
                  <div className="tmpl-preview-body" style={{ flex: 1, overflow: 'auto' }}>
                    <div className="prev-script">
                      {steps.step4_koubo ? (
                        steps.step4_koubo.split('\n').map((line, i) => <p key={i}>{line || ' '}</p>)
                      ) : (
                        <p style={{ color: 'var(--text-secondary)' }}>点击「生成口播稿」生成...</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 4 && sub === '4b' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">TTS 语音合成</div>
                <div className="card-hint">选择提供商、合成模型和音色，生成语音文件</div>
                <div className="form-label">来源</div>
                <select className="form-select" style={{ marginBottom: 8 }}><option>口播文案</option></select>
                <div className="form-label">TTS 提供商</div>
                <select className="form-select" style={{ marginBottom: 8 }}
                  value={ttsProviderId} onChange={e => {
                    setTtsProviderId(e.target.value)
                    const p = ttsProviders.find(x => x.id === e.target.value)
                    if (p) {
                      const models = Array.isArray(p.models) ? p.models : []
                      if (models.length > 0) setTtsModel(models[0])
                      api.listVoices(e.target.value).then(setTtsVoices).catch(() => {})
                    }
                  }}>
                  {ttsProviders.length === 0 && <option value="">暂无提供商</option>}
                  {ttsProviders.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div className="form-label">合成模型</div>
                <select className="form-select" style={{ marginBottom: 8 }}
                  value={ttsModel} onChange={e => setTtsModel(e.target.value)}>
                  {(Array.isArray(ttsProviders.find(p => p.id === ttsProviderId)?.models)
                    ? ttsProviders.find(p => p.id === ttsProviderId)!.models
                    : []).map((m: string) => <option key={m} value={m}>{m}</option>)}
                </select>
                <div className="form-label">音色</div>
                <select className="form-select" style={{ marginBottom: 10 }}
                  value={voiceId} onChange={e => setVoiceId(e.target.value)}>
                  <option value="">默认音色 (系统)</option>
                  {ttsVoices.map(v => <option key={v.id} value={v.id}>{v.name} ({v.voice_id})</option>)}
                </select>
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  disabled={ttsGenerating} onClick={doTTS}>
                  {ttsGenerating ? '⏳ 合成中...' : '🔊 语音合成'}
                </button>
                {ttsAudioUrl && (
                  <div style={{ marginTop: 8 }}>
                    <audio controls style={{ width: '100%', height: 32 }}>
                      <source src={ttsAudioUrl} type="audio/mpeg" />
                    </audio>
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}
                      onClick={() => downloadFile(ttsAudioUrl, 'tts_output.mp3')}>
                      💾 下载 .mp3
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">🎵 音色预览 — {ttsVoices.find(v => v.id === voiceId)?.name || '默认音色'}</div>
                  <div className="tmpl-preview-body" style={{ flex: 1, overflow: 'auto' }}>
                    <div className="prev-voice">
                      <div className="voice-wave" />
                      <div className="voice-meta">
                        <strong>{ttsVoices.find(v => v.id === voiceId)?.name || '系统默认音色'}</strong><br />
                        音色ID: {ttsVoices.find(v => v.id === voiceId)?.voice_id || 'longanyang'}<br />
                        {ttsVoices.find(v => v.id === voiceId)?.description || '自然亲切的女声'}
                      </div>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 6 }}>
                      {ttsVoices.find(v => v.id === voiceId)?.description || '适合美食类口播，声音柔和有亲和力'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====== STAGE 5: 输出列表 ====== */}
        {stage === 5 && (
          <div className="card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div className="card-title">所有产出物</div>
            {genFiles.length > 0 ? (
              <table className="output-table">
                <thead><tr><th>文件</th><th>类型</th><th>来源</th><th>大小</th><th>操作</th></tr></thead>
                <tbody>
                  {genFiles.map((f, i) => (
                    <tr key={i}>
                      <td>
                        {f.type === 'Word' ? '📃 ' : f.type === 'PPT' ? '📌 ' : '🎵 '}
                        {f.name}
                      </td>
                      <td>{f.type}</td>
                      <td>{f.source}</td>
                      <td style={{ fontSize: 10, color: 'var(--text-secondary)' }}>—</td>
                      <td>
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => downloadFile(f.url, f.name)}>下载</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 14 }}>
                暂无产出物。请完成前面阶段的生成后，文件将自动出现在此列表中。
              </div>
            )}
            {genFiles.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <button className="btn btn-outline btn-sm"
                  onClick={async () => {
                    for (const f of genFiles) {
                      try { await downloadFile(f.url, f.name) } catch (e: any) { /* skip failed */ }
                    }
                  }}>
                  📦 一键下载全部 ({genFiles.length} 个文件)
                </button>
                <button className="btn btn-ghost btn-sm">📁 打开文件夹</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Config Bar ═══ */}
      <div className="config-bar">
        <span className="cb-label">⚙ 当前栏目配置：</span>
        <span>模型</span> <span className="cb-val">{CONFIG[stage]?.model}</span>
        <span className="cb-sep">|</span>
        <span>模板</span> <span className="cb-val">{CONFIG[stage]?.tmpl}</span>
        {CONFIG[stage]?.tmplInfo && (
          <span style={{ fontSize: 9, color: '#999' }}>({CONFIG[stage]?.tmplInfo})</span>
        )}
        <span className="cb-sep">|</span>
        <span>项目路径</span> <span className="cb-val" style={{ color: 'var(--text-secondary)' }}>{projStoragePath || project?.storage_path || project?.name || '—'}</span>
        <a className="cb-edit" onClick={() => navigate('/proj-settings')}>前往项目配置修改</a>
      </div>

      {/* ═══ Video Check Dialog ═══ */}
      {vcOpen && (
        <div className="dialog-overlay"
          onMouseDown={e => { if (e.target === e.currentTarget) overlayRef.current = true }}
          onMouseUp={e => {
            if (e.target === e.currentTarget && overlayRef.current && !dragRef.current.down && !resizing.current) {
              setVcOpen(false)
            }
            overlayRef.current = false
          }}>
          <div className="dialog-box video-checker" ref={vcRef}
            style={{
              ...((vcPos.x || vcPos.y) ? { position: 'absolute' as const, left: vcPos.x, top: vcPos.y } : {}),
              ...((vcSize.w || vcSize.h) ? { width: vcSize.w, height: vcSize.h } : {}),
            }}>
            <div className="dialog-title" style={{ cursor: 'move', userSelect: 'none' }}
              onMouseDown={e => {
                const el = vcRef.current
                if (!el) return
                const rect = el.getBoundingClientRect()
                dragRef.current = { down: true, sx: e.clientX, sy: e.clientY, px: rect.left, py: rect.top }
                const onMove = (ev: MouseEvent) => {
                  if (!dragRef.current.down) return
                  setVcPos({ x: dragRef.current.px + (ev.clientX - dragRef.current.sx), y: dragRef.current.py + (ev.clientY - dragRef.current.sy) })
                }
                const onUp = () => {
                  setTimeout(() => { dragRef.current.down = false }, 0)
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }}>
              📺 视频播放校验 <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 8 }}>确认字幕内容是否准确</span>
            </div>
            <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>
              <div style={{ flex: 3, background: '#000', borderRadius: 8, minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {videoPath ? (
                  <video src={`/api/video/file?path=${encodeURIComponent(videoPath)}`} controls style={{ width: '100%', height: '100%', borderRadius: 8 }}
                    onError={() => modal.toast('视频加载失败', 'error')} />
                ) : (
                  <span style={{ color: '#666', fontSize: 16 }}>暂无视频文件</span>
                )}
              </div>
              <div style={{ flex: 2, display: 'flex', flexDirection: 'column' }}>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 360 }}
                  value={videoText}
                  onChange={e => setVideoText(e.target.value)} />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setVideoText('')}>
                    🗑 清空
                  </button>
                  <button className="btn btn-primary btn-sm" style={savedFlash ? { background: '#22c55e', borderColor: '#22c55e', color: '#fff' } : videoText !== (savedSteps.video_text || '') ? { background: 'var(--warning)', borderColor: 'var(--warning)', color: '#fff' } : undefined} onClick={() => {
                    if (id && videoText.trim()) { saveStep('video_text', videoText); flashSave() }
                    setVcOpen(false)
                  }}>
                    {savedFlash ? '✓ 已保存' : videoText !== (savedSteps.video_text || '') ? '💾 保存' : '✓ 已保存'}
                  </button>
                </div>
              </div>
            </div>
            <div style={{
              position: 'absolute', bottom: 0, right: 0, width: 24, height: 24, cursor: 'nwse-resize',
              background: 'linear-gradient(135deg, transparent 50%, var(--primary) 50%)',
              borderRadius: '0 0 8px 0',
            }}
              onMouseDown={e => {
                e.stopPropagation()
                e.preventDefault()
                const el = vcRef.current
                if (!el) return
                resizing.current = true
                const rect = el.getBoundingClientRect()
                const sx = e.clientX, sy = e.clientY
                const sw = rect.width, sh = rect.height
                const onMove = (ev: MouseEvent) => {
                  setVcSize({ w: Math.max(640, sw + (ev.clientX - sx)), h: Math.max(400, sh + (ev.clientY - sy)) })
                }
                const onUp = () => {
                  setTimeout(() => { resizing.current = false }, 0)
                  document.removeEventListener('mousemove', onMove)
                  document.removeEventListener('mouseup', onUp)
                }
                document.addEventListener('mousemove', onMove)
                document.addEventListener('mouseup', onUp)
              }} />
          </div>
        </div>
      )}
    </div>
  )
}
