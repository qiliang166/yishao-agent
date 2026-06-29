import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, Voice, TTSProvider, LLMProvider } from '../services/api'
import { useModal } from '../components/ModalProvider'
import TeachingDocPanel from '../components/TeachingDocPanel'
import SlideEditModal from '../components/SlideEditModal'
import Stage3TempSettings, { StageTemps, DEFAULT_STAGE_TEMPS } from '../components/Stage3TempSettings'

// ── Types ──
interface Project {
  id: string; name: string; status: string; source_type: string
  storage_path?: string
  created_at: string; updated_at: string
}
type StageId = 1 | 2 | 3 | 4 | 5
type SubId = string

interface StageDef { id: StageId; label: string; subs: { id: SubId; label: string }[] }
interface TemplateItem { id: string; name: string; isDefault: boolean; meta: string; previewHtml: string; color: string; icon: string; colors?: string[] }

// ── Stage Definitions ──
const STAGES: StageDef[] = [
  { id: 1, label: '素材输入', subs: [{ id: '1a', label: '视频提取' }, { id: '1b', label: '文字输入' }, { id: '1c', label: '文件上传' }] },
  { id: 2, label: '文档生成', subs: [{ id: '2a', label: '标准文档' }, { id: '2b', label: '分析文档' }, { id: '2c', label: '手册文档' }] },
  { id: 3, label: '课件输出', subs: [{ id: '3a', label: '文档课件' }, { id: '3b', label: '分析PPT' }, { id: '3c', label: '综合PPT' }] },
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
          <div style={{
            height: 8,
            background: t.colors
              ? `linear-gradient(90deg, ${t.colors[0]}, ${t.colors[1]} 50%, ${t.colors[0]})`
              : t.color + '44',
          }} />
          <div className="tmpl-info">
            <div className="tmpl-name">{t.name}{t.isDefault ? <span className="default-tag">默认</span> : null}</div>
            {t.colors && (
              <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                {t.colors.map((c, i) => (
                  <div key={i} style={{
                    width: 14, height: 14, borderRadius: 3,
                    background: c,
                    border: c?.toLowerCase() === '#ffffff' || c?.toLowerCase() === '#fafaf8'
                      ? '1px solid #ddd' : '1px solid transparent',
                  }} />
                ))}
              </div>
            )}
            <div className="tmpl-meta">{t.meta}</div>
          </div>
        </div>
      ))}
    </div>
  )
}


// Dynamic stage1 prompts — loaded from column_configs, with fallbacks
const STAGE1_SKILL_FALLBACK = '## 文档标题\n**标题**：\n**分类**：\n**日期**：\n**来源**：\n\n### 一、基本信息\n| 序号 | 项目 | 内容 | 备注 |\n|------|------|------|------|\n| 1 | | | |\n\n### 二、主要内容\n| 序号 | 要点 | 详细说明 |\n|------|------|----------|\n| 1 | | |\n\n### 三、总结\n- **要点1**：\n- **要点2**：'

const STAGE1_PROMPTS_FALLBACK: Record<string, string> = {
  text: '请将用户输入的内容整理为标准文档格式。',
  video: '请根据视频相关内容提取完整信息，整理为标准文档。',
  file: '请从上传文件中提取完整内容，整理为标准文档格式。',
}

// ── Temperature input (shared across all model selectors) ──
const TemperatureInput = ({ value, onChange, id }: { value: number; onChange: (v: number) => void; id?: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
    <label style={{ whiteSpace: 'nowrap' }} htmlFor={id}>温度</label>
    <input id={id} type="number" min={0} max={2} step={0.1}
      style={{ width: 50, fontSize: 11, padding: '2px 4px', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
      value={value} onChange={e => onChange(parseFloat(e.target.value) || 0.3)} />
  </span>
)

// ── Stage 2 left-panel controls (split from TeachingDocPanel) ──
const MODEL_KEYS_S2: Record<string, string> = {
  sop: '_model_s2_sop', dao: '_model_s2_dao', yanxi: '_model_s2_yanxi',
}
const DOC_ICONS: Record<string, string> = { sop: '📃', dao: '💡', yanxi: '📖' }
const DOC_COLORS_S2: Record<string, string> = {
  sop: 'var(--success)', dao: 'var(--purple)', yanxi: 'var(--warning)',
}

function Stage2Controls({
  docType, label, steps, llmProviders,
  dataSource, onDataSourceChange,
  generating, prompt, skill, projectId,
  panelRef, setGenerating, onRefresh,
}: {
  docType: string; label: string
  steps: Record<string, string>
  llmProviders: LLMProvider[]
  dataSource: string; onDataSourceChange: (v: string) => void
  generating: boolean
  prompt: string; skill: string; projectId: string
  panelRef: React.RefObject<{ triggerGenerate: () => Promise<void>; cancel: () => void } | null>
  setGenerating: (v: boolean) => void
  onRefresh: () => Promise<void>
}) {
  const tempKey = `_temp_s2_${docType}`
  const modal = useModal()
  const mountedRef = useRef(true)
  const generatingRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])
  const modelKey = MODEL_KEYS_S2[docType]
  const icon = DOC_ICONS[docType]
  const color = DOC_COLORS_S2[docType]

  // Local model state with optimistic update — prevents <select> revert during async save
  const getDefaultModel = () => {
    const saved = steps[modelKey]
    if (saved) return saved
    const defP = llmProviders.find(p => p.is_enabled)
    if (!defP) return ''
    const defMs = Array.isArray(defP.models) ? defP.models : []
    return defMs.length > 0 ? `${defP.id}:${defMs[0]}` : ''
  }
  const [model, setModel] = useState(getDefaultModel)
  const lastModelKey = useRef(modelKey)
  const [temperature, setTemperature] = useState(() => {
    const saved = steps[tempKey]; return saved ? parseFloat(saved) : 0.3
  })
  // Re-sync when modelKey changes (tab switch) or steps loads a persisted value
  if (modelKey !== lastModelKey.current) {
    lastModelKey.current = modelKey
    setModel(getDefaultModel())
    setTemperature(steps[tempKey] ? parseFloat(steps[tempKey]) : 0.3)
  }

  // Check raw content AND AI-generated step1 results for data source availability
  const sourceText = {
    video: (steps.raw_video || steps.step1_video) ? '已有内容' : '暂无内容',
    text: (steps.raw_text || steps.step1_text) ? '已有内容' : '暂无内容',
    file: (steps.raw_file || steps.step1_file) ? '已有内容' : '暂无内容',
  }
  const getSourceText = (src: string) => {
    switch (src) {
      case 'video': return steps.raw_video || steps.step1_video || ''
      case 'text': return steps.raw_text || steps.step1_text || ''
      case 'file': return steps.raw_file || steps.step1_file || ''
      default: return ''
    }
  }

  const handleModelChange = (val: string) => {
    setModel(val)
    api.saveStep(projectId, modelKey, val).then(onRefresh)
  }

  const handleGenerate = async () => {
    const source = getSourceText(dataSource)
    if (!source) {
      modal.toast(`数据来源「${dataSource}」没有内容，请先在 Stage 1 导入素材`, 'error')
      return
    }
    if (!model) {
      modal.toast('请先选择大模型', 'error')
      return
    }
    if (generatingRef.current) return
    generatingRef.current = true
    setGenerating(true)
    try {
      await panelRef.current?.triggerGenerate()
    } catch (e: any) {
      if (mountedRef.current) modal.toast(`生成失败: ${e.message}`, 'error')
    } finally {
      generatingRef.current = false
      if (mountedRef.current) setGenerating(false)
    }
  }

  return (
    <>
      <div className="card-title" style={{ color }}>{icon} {label}生成</div>
      <div className="card-hint">基于文案提取结果，使用栏目配置中设定的提示词和SKILL生成{label}</div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginBottom: 6 }}>
        <label className="form-label">数据来源</label>
        <select className="form-select" style={{ marginBottom: 6 }}
          value={dataSource} onChange={e => onDataSourceChange(e.target.value)}>
          <option value="video">视频提取 — {sourceText.video}</option>
          <option value="text">文字输入 — {sourceText.text}</option>
          <option value="file">文件上传 — {sourceText.file}</option>
        </select>
      </div>
      <label className="form-label">大模型</label>
      <select className="form-select" style={{ marginBottom: 8 }}
        value={model} onChange={e => handleModelChange(e.target.value)}>
        <option value="">选择模型...</option>
        {llmProviders.filter(p => p.is_enabled).map(p =>
          (Array.isArray(p.models) ? p.models : []).map((m: string) => (
            <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
          ))
        )}
      </select>
      <div style={{ marginBottom: 8 }}>
        <TemperatureInput value={temperature} onChange={v => { setTemperature(v); api.saveStep(projectId, tempKey, String(v)).then(onRefresh) }} id={`temp-s2-${docType}`} />
      </div>
      <button className="btn btn-primary btn-sm w-full"
        disabled={!getSourceText(dataSource) || !model || generating}
        onClick={handleGenerate}>
        {generating ? '⏳ 生成中...' : `⚙ AI 生成 ${label}`}
      </button>
      {generating && (
        <button className="btn btn-sm" style={{ marginTop: 4, background: 'var(--warning)', color: '#fff', width: '100%' }}
          onClick={() => { panelRef.current?.cancel(); modal.toast('生成已取消', 'success') }}>取消</button>
      )}
    </>
  )
}

// ── Main Component ──
export default function ProjectPage() {
  const modal = useModal()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  async function downloadFile(url: string, filename: string) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = objUrl; a.download = filename
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(objUrl)
    modal.toast('已开始下载: ' + filename, 'success')
  }

  const [project, setProject] = useState<Project | null>(null)
  const styleColorMap = useRef<Record<string, any>>({})
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
  const getSaveBtnLabel = (content: string, savedKey: string) => {
    if (!content.trim()) return '💾 保存'
    if (content !== (savedSteps[savedKey] || '')) return '💾 保存'
    return '✓ 已保存'
  }
  const getSaveBtnClass = (content: string, savedKey: string) => {
    if (savedFlash) return 'btn-saved-flash'
    if (!content.trim()) return 'btn-dirty'
    if (content !== (savedSteps[savedKey] || '')) return 'btn-dirty'
    return ''
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
  const [step1Models, setStep1Models] = useState<Record<string, string>>({})
  const [s1Temperatures, setS1Temperatures] = useState<Record<string, number>>({ video: 0.3, text: 0.3, file: 0.3 })
  const step1Model = step1Models[mode1Key] || ''
  const s1Temperature = s1Temperatures[mode1Key] || 0.3
  const [step1Generating, setStep1Generating] = useState<Record<string, boolean>>({})

  // Stage 2 state
  const [step2Generating, setStep2Generating] = useState<Record<string, boolean>>({})
  const [s2DataSources, setS2DataSources] = useState<Record<string, string>>({ sop: 'video', dao: 'video', yanxi: 'video' })
  const [showModelPicker, setShowModelPicker] = useState(false)
  const overlayMouseDownRef = useRef(false)
  const [modelPickerValues, setModelPickerValues] = useState<Record<string, string>>({})
  const sopRef = useRef<{ triggerGenerate: () => Promise<void>; cancel: () => void }>(null)
  const daoRef = useRef<{ triggerGenerate: () => Promise<void>; cancel: () => void }>(null)
  const yanxiRef = useRef<{ triggerGenerate: () => Promise<void>; cancel: () => void }>(null)

  const handleS2DataSourceChange = (tab: string, val: string) => {
    setS2DataSources(prev => ({ ...prev, [tab]: val }))
    if (id) api.saveStep(id, `_ds_s2_${tab}`, val)
  }
  const [stage2Prompts, setStage2Prompts] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [stage1Prompts, setStage1Prompts] = useState<Record<string, string>>({})
  const [stage1Skill, setStage1Skill] = useState('')
  const [stage4KouboPrompt, setStage4KouboPrompt] = useState('')
  // Stage 3 state
  const [sopSelected, setSopSelected] = useState('sop-std')
  const [daoPptSelected, setDaoPptSelected] = useState('dao-std')
  const [yanxiPptSelected, setYanxiPptSelected] = useState('yanxi-std')
  const [stage3Prompts, setStage3Prompts] = useState<Record<string, { prompt: string; skill: string }>>({})
  const [s3SopModel, setS3SopModel] = useState('')
  const [s3DaoPptModel, setS3DaoPptModel] = useState('')
  const [s3YanxiPptModel, setS3YanxiPptModel] = useState('')
  const [s3SopTemp, setS3SopTemp] = useState(0.3)
  const [s3DaoPptTemp, setS3DaoPptTemp] = useState(0.3)
  const [s3YanxiPptTemp, setS3YanxiPptTemp] = useState(0.3)
  const [s3DaoTemps, setS3DaoTemps] = useState<StageTemps>({ ...DEFAULT_STAGE_TEMPS })
  const [s3YanxiTemps, setS3YanxiTemps] = useState<StageTemps>({ ...DEFAULT_STAGE_TEMPS })
  const [s3DaoTempOpen, setS3DaoTempOpen] = useState(false)
  const [s3YanxiTempOpen, setS3YanxiTempOpen] = useState(false)
  const [s3SopTempOpen, setS3SopTempOpen] = useState(false)
  const [s3SopTemps, setS3SopTemps] = useState<StageTemps>({ ...DEFAULT_STAGE_TEMPS })
  const [globalBranding, setGlobalBranding] = useState<{ copyright: string; signature: string }>({ copyright: '', signature: '' })
  const [pptGenerating, setPptGenerating] = useState<Record<string, boolean>>({})
  const [pptProgress, setPptProgress] = useState<{ phase_label: string; message: string; slides_done?: number; slides_total?: number; preview_url?: string } | null>(null)
  const [pptLog, setPptLog] = useState<{ time: string; message: string }[]>([])
  const [docGenLog, setDocGenLog] = useState<{ time: string; message: string }[]>([])
  const [docGenProgress, setDocGenProgress] = useState<{ phase_label: string; message: string; stepKey?: string } | null>(null)
  const [progressivePreviewUrl, setProgressivePreviewUrl] = useState<Record<string, string>>({})
  const pptPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pptLogPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pptLogContainerRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<Record<string, AbortController>>({})
  const [pptSlidePlans, setPptSlidePlans] = useState<Record<string, { slides: any[]; filename: string; downloadUrl: string; templateId: string; previewUrl?: string; zipUrl?: string; format?: string }>>({})
  const [pptOutline, setPptOutline] = useState<Record<string, { outline_json: any[]; outline_text: string }>>({})
  const [pptOutlineLoading, setPptOutlineLoading] = useState<Record<string, boolean>>({})
  const [pptColorScheme, setPptColorScheme] = useState<Record<string, string>>({})
  const [pptColorSchemes, setPptColorSchemes] = useState<{id:string;label:string;primary:string;accent:string;background:string;text:string;card_bg:string}[]>([])
  const [pptSavingOutline, setPptSavingOutline] = useState<Record<string, boolean>>({})
  const [previewHtml, setPreviewHtml] = useState<Record<string, string>>({})
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({})
  const [previewTab, setPreviewTab] = useState<Record<string, 'ppt' | 'html' | 'json'>>({})
  const [editPanelOpen, setEditPanelOpen] = useState<Record<string, boolean>>({})
  const [pptEditMode, setPptEditMode] = useState<Record<string, boolean>>({})
  const [daoPptTemplates, setDaoPptTemplates] = useState<TemplateItem[]>([])
  const [yanxiPptTemplates, setYanxiPptTemplates] = useState<TemplateItem[]>([])
  const [templatesMap, setTemplatesMap] = useState<Record<string, { prompt: string; skill: string; hasFile: boolean }>>({})

  // Stage 4 state
  const [s4KouboModel, setS4KouboModel] = useState('')
  const [kouboSelected, setKouboSelected] = useState('')
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
    let hasModelOverride = false
    api.getSteps(id).then((s: any[]) => {
      const map: Record<string, string> = {}
      s.forEach((x: any) => { map[x.step_name] = x.content })
      setSteps(prev => ({ ...prev, ...map }))
      setSavedSteps(prev => ({ ...prev, ...map }))
      setVideoText(map['raw_video'] || map['video_text'] || '')
      setTextInput(map['raw_text'] || '')
      setFileText(map['raw_file'] || '')
      // Restore saved model selections
      if (map['_model_s1_video'] || map['_model_s1_text'] || map['_model_s1_file']) {
        setStep1Models({
          video: map['_model_s1_video'] || '',
          text: map['_model_s1_text'] || '',
          file: map['_model_s1_file'] || '',
        })
        hasModelOverride = true
      }
      // Also restore legacy single key for backward compatibility
      if (!hasModelOverride && map['_model_step1']) {
        setStep1Models({ video: map['_model_step1'], text: map['_model_step1'], file: map['_model_step1'] })
        hasModelOverride = true
      }
      if (map['_temp_s1_video']) { setS1Temperatures(prev => ({ ...prev, video: parseFloat(map['_temp_s1_video']) || 0.3 })) }
      if (map['_temp_s1_text']) { setS1Temperatures(prev => ({ ...prev, text: parseFloat(map['_temp_s1_text']) || 0.3 })) }
      if (map['_temp_s1_file']) { setS1Temperatures(prev => ({ ...prev, file: parseFloat(map['_temp_s1_file']) || 0.3 })) }
      if (map['_model_step3_sop']) { setS3SopModel(map['_model_step3_sop']); hasModelOverride = true }
      if (map['_model_step3_dao_ppt']) { setS3DaoPptModel(map['_model_step3_dao_ppt']); hasModelOverride = true }
      if (map['_model_step3_yan_ppt']) { setS3YanxiPptModel(map['_model_step3_yan_ppt']); hasModelOverride = true }
      if (map['_temp_step3_sop']) { setS3SopTemp(parseFloat(map['_temp_step3_sop']) || 0.3) }
      if (map['_temp_step3_dao_ppt']) { setS3DaoPptTemp(parseFloat(map['_temp_step3_dao_ppt']) || 0.3) }
      if (map['_temp_step3_yan_ppt']) { setS3YanxiPptTemp(parseFloat(map['_temp_step3_yan_ppt']) || 0.3) }
      // Restore per-stage temps (13 fields each)
      const _loadTemps = (prefix: string): StageTemps => {
        const t = { ...DEFAULT_STAGE_TEMPS }
        const keys = Object.keys(t) as (keyof StageTemps)[]
        for (const k of keys) {
          const val = map[`${prefix}${k}`]
          if (val) { (t as any)[k] = parseFloat(val) || (DEFAULT_STAGE_TEMPS as any)[k] }
        }
        return t
      }
      if (Object.keys(map).some(k => k.startsWith('_temps_dao_'))) {
        setS3DaoTemps(_loadTemps('_temps_dao_'))
      }
      if (Object.keys(map).some(k => k.startsWith('_temps_yanxi_'))) {
        setS3YanxiTemps(_loadTemps('_temps_yanxi_'))
      }
      if (Object.keys(map).some(k => k.startsWith('_temps_sop_'))) {
        setS3SopTemps(_loadTemps('_temps_sop_'))
        const sopVal = map['_temps_sop_sop']
        if (sopVal) { setS3SopTemp(parseFloat(sopVal) || 0.3) }
      }
      // Restore saved template selections
      if (map['_tmpl_step3_dao_ppt']) setDaoPptSelected(map['_tmpl_step3_dao_ppt'])
      if (map['_tmpl_step3_yan_ppt']) setYanxiPptSelected(map['_tmpl_step3_yan_ppt'])
      // Restore saved color schemes per step
      if (map['_color_scheme_step3_dao_ppt']) setPptColorScheme(prev => ({ ...prev, step3_dao_ppt: map['_color_scheme_step3_dao_ppt'] }))
      if (map['_color_scheme_step3_yan_ppt']) setPptColorScheme(prev => ({ ...prev, step3_yan_ppt: map['_color_scheme_step3_yan_ppt'] }))
      // Restore saved PPT slide plans
      ;['step3_sop_doc', 'step3_dao_ppt', 'step3_yan_ppt'].forEach(sk => {
        const key = `_ppt_plan_${sk}`
        if (map[key]) { try { setPptSlidePlans(prev => ({ ...prev, [sk]: JSON.parse(map[key]) })) } catch {} }
        const htmlKey = `_preview_html_${sk}`
        if (map[htmlKey] && map[htmlKey].startsWith('__SVG__')) {
          setPreviewHtml(prev => ({...prev, [sk]: map[htmlKey]}))
        } else if (map[key]) {
          // Has plan data but no HTML preview — show slide list tab by default
          setPreviewTab(prev => ({...prev, [sk]: 'ppt'}))
        }
      })
      // Restore saved PPT outlines (human-readable text + structured JSON)
      ;['step3_dao_ppt', 'step3_yan_ppt'].forEach(sk => {
        const textKey = sk
        const jsonKey = `_ppt_outline_json_${sk}`
        const text = map[textKey]
        const jsonStr = map[jsonKey]
        if (text || jsonStr) {
          let outline_json: any[] = []
          try { if (jsonStr) outline_json = JSON.parse(jsonStr) } catch {}
          setPptOutline(prev => ({...prev, [sk]: { outline_json, outline_text: text || '' }}))
        }
      })
      // Restore per-tab data source selections
      setS2DataSources(prev => ({
        sop: map['_ds_s2_sop'] || prev.sop,
        dao: map['_ds_s2_dao'] || prev.dao,
        yanxi: map['_ds_s2_yanxi'] || prev.yanxi,
      }))
    })
    api.listColumnConfigs().then((configs: any[]) => {
      const s1p: Record<string, string> = {}
      let s1s = ''
      const s2p: Record<string, { prompt: string; skill: string }> = {}
      const s3p: Record<string, { prompt: string; skill: string }> = {}
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
        if (c.column_id === 'col3') {
          const key = c.id === 'c3-sop' ? 'sop' : ''
          if (key) s3p[key] = { prompt: c.prompt, skill: c.skill }
        }
        if (c.column_id === 'col4') {
          if (c.id === 'c4-dao') s3p['daoPpt'] = { prompt: c.prompt, skill: c.skill }
        }
        if (c.column_id === 'col5') {
          if (c.id === 'c4-yanxi') s3p['yanxiPpt'] = { prompt: c.prompt, skill: c.skill }
        }
        if (c.column_id === 'col6' && c.id === 'c5-koubo') {
          kouboP = c.prompt
        }
      })
      setStage1Prompts(s1p)
      if (s1s) setStage1Skill(s1s)
      setStage2Prompts(s2p)
      setStage3Prompts(s3p)
      if (kouboP) setStage4KouboPrompt(kouboP)
    }).catch(() => {})
    // Load templates for Stage 3 PPT columns
    const loadTemplates = (stageType: string) =>
      api.listTemplatesForStage(stageType).then((items: any[]) => {
        const tmplItems: TemplateItem[] = items.map((t: any) => {
          const isStyle = t.type === 'style'
          const sc = isStyle ? styleColorMap.current[t.id.replace('style-', '')] : null
          return {
            id: t.id, name: t.name, isDefault: t.isDefault,
            meta: isStyle ? (sc?.mood || '') : t.prompt ? `提示词: ${t.prompt.slice(0, 30)}...` : '暂无提示词',
            color: sc?.primary || (isStyle ? '#e67e22' : '#7C3AED'),
            icon: isStyle ? '' : t.hasFile ? '📌' : '📄',
            colors: isStyle && sc ? [sc.primary, sc.accent, sc.background, sc.text].filter(Boolean) : undefined,
            previewHtml: '',
          }
        })
        const map: Record<string, { prompt: string; skill: string; hasFile: boolean }> = {}
        items.forEach((t: any) => { map[t.id] = { prompt: t.prompt || '', skill: t.skill || '', hasFile: t.hasFile } })
        return { tmplItems, map, items }
      }).catch(() => ({ tmplItems: [], map: {}, items: [] }))
    // Pre-fetch color schemes
    api.listColorSchemes('business').then(cs => { if (cs?.length) setPptColorSchemes(cs) }).catch(() => {})
    // Pre-fetch style colors before loading templates
    api.listStyles().then((styles: any[]) => {
      (styles || []).forEach((s: any) => {
        styleColorMap.current[s.id] = {
          primary: s.colors?.primary || '#1a365d',
          accent: s.colors?.accent || '#e67e22',
          background: s.colors?.background || '#ffffff',
          text: s.colors?.text || '#1a202c',
          mood: s.mood || '',
        }
      })
    }).catch(() => {}).finally(() => {
      loadTemplates('daoPpt').then(({ tmplItems, map, items }) => {
      setDaoPptTemplates(tmplItems)
      if (tmplItems.length > 0) {
        const def = items.find((t: any) => t.isDefault) || items[0]
        setDaoPptSelected(def.id)
      }
      setTemplatesMap(prev => ({ ...prev, ...map }))
    })
    loadTemplates('yanxiPpt').then(({ tmplItems, map, items }) => {
      setYanxiPptTemplates(tmplItems)
      if (tmplItems.length > 0) {
        const def = items.find((t: any) => t.isDefault) || items[0]
        setYanxiPptSelected(def.id)
      }
      setTemplatesMap(prev => ({ ...prev, ...map }))
    })
    })  // end finally
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
      if (hasModelOverride) return  // persisted models already loaded, skip defaults
      const def = providers.find(p => p.is_enabled) || providers[0]
      const defModels = Array.isArray(def?.models) ? def.models : []
      const defVal = def && defModels.length > 0 ? `${def.id}:${defModels[0]}` : ''
      if (defVal) {
        setStep1Models((prev: Record<string, string>) => ({
          video: prev.video || defVal,
          text: prev.text || defVal,
          file: prev.file || defVal,
        }))
        setS3SopModel((prev: string) => prev || defVal)
        setS3DaoPptModel((prev: string) => prev || defVal)
        setS3YanxiPptModel((prev: string) => prev || defVal)
      }
    }).catch(() => {})
    api.getSettings().then(data => {
      const s = data.settings || {}
      if (s.branding_copyright || s.branding_signature) {
        setGlobalBranding({ copyright: s.branding_copyright || '', signature: s.branding_signature || '' })
      }
    }).catch(() => {})
  }, [id, navigate])

  // Auto-load saved PPT results on mount (fallback for results not in step state)
  useEffect(() => {
    if (!id) return
    api.listPptResults(id).then((results: any[]) => {
      ;(results || []).forEach((r: any) => {
        const stepName = r._step_name || ''
        // Extract stepKey from _ppt_plan_step3_dao_ppt or _ppt_result_<run_id>
        let stepKey = ''
        const planMatch = stepName.match(/^_ppt_plan_(step3_\w+)$/)
        if (planMatch) {
          stepKey = planMatch[1]
        } else if (stepName.startsWith('_ppt_result_')) {
          stepKey = step3Key()
        }
        if (!stepKey || pptSlidePlans[stepKey]) return // already loaded
        // Build planData from result fields (handle both slides and slide_plan keys)
        const slides = r.slides || r.slide_plan
        if (!slides || !slides.length) return
        const planData = {
          slides,
          filename: r.filename || `svg-deck-${r.run_id || 'unknown'}`,
          downloadUrl: r.downloadUrl || r.zip_url || '',
          previewUrl: r.preview_url || r.previewUrl || '',
          zipUrl: r.zip_url || r.zipUrl || '',
          templateId: r.template_id || r.templateId || '',
          format: r.format || 'svg',
        }
        setPptSlidePlans(prev => ({ ...prev, [stepKey]: planData }))
        if (r.preview_url || r.previewUrl) {
          setPreviewHtml(prev => ({...prev, [stepKey]: '__SVG__' + (r.preview_url || r.previewUrl)}))
          setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
        } else {
          setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
        }
      })
    }).catch(() => {})
  }, [id])

  // Save step helper
  const saveStep = useCallback((stepName: string, content: string) => {
    if (!id) return
    api.saveStep(id, stepName, content)
    setSteps(prev => ({ ...prev, [stepName]: content }))
    setSavedSteps(prev => ({ ...prev, [stepName]: content }))
  }, [id])

  const step1Key = () => sub === '1a' ? 'step1_video' : sub === '1b' ? 'step1_text' : 'step1_file'
  const step3Key = () => sub === '3a' ? 'step3_sop_doc' : sub === '3b' ? 'step3_dao_ppt' : 'step3_yan_ppt'

  // Extract run_id, provider, model for the edit panel
  const editPanelProps = () => {
    const key = step3Key()
    const plan = pptSlidePlans[key]
    const previewUrl = plan?.previewUrl || ''
    const m = previewUrl.match(/\/api\/exports\/(.+?)\/index\.html/)
    const runId = m ? m[1] : ''
    const slideCount = plan?.slides?.length || 0
    const model = key === 'step3_dao_ppt' ? s3DaoPptModel : s3YanxiPptModel
    const [pid, mdl] = model ? model.split(':') : ['', '']
    return { runId, slideCount, providerId: pid, model: mdl, previewUrl }
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
  // ── LLM Generate (streaming with progress) ──
  const doGenerate = async (stepKey: string, systemPrompt: string, userMessage: string, providerId?: string, model?: string, temperature: number = 0.3, signal?: AbortSignal) => {
    if (!id) return
    const labelMap: Record<string, string> = { step2_sop: '标准文档', step2_daoshuyi: '分析文档', step2_yanxi: '手册文档' }
    const label = labelMap[stepKey] || stepKey
    const now = () => new Date().toLocaleTimeString('zh-CN', { hour12: false })
    try {
      setDocGenLog(prev => [...prev, { time: now(), message: `开始生成 ${label}...` }])
      setDocGenProgress({ phase_label: `正在生成 ${label}`, message: '准备中...', stepKey })

      let fullText = ''
      let lastUpdate = 0
      for await (const chunk of api.llmGenerateStream({
        provider_id: providerId || 'default',
        model: model || 'deepseek-v4-pro',
        system_prompt: systemPrompt,
        user_message: userMessage,
        temperature,
        signal,
      })) {
        fullText += chunk
        // Update progress every ~300 chars (throttle to avoid excessive re-renders)
        if (fullText.length - lastUpdate > 300) {
          lastUpdate = fullText.length
          setDocGenProgress({ phase_label: `正在生成 ${label}`, message: `已生成 ${fullText.length} 字符`, stepKey })
        }
      }

      setDocGenLog(prev => [...prev, { time: now(), message: `${label} 完成 (${fullText.length} 字符)` }])
      setDocGenProgress({ phase_label: `${label} 已完成`, message: `${fullText.length} 字符`, stepKey })
      setSteps(prev => ({ ...prev, [stepKey]: fullText }))
      saveStep(stepKey, fullText)
      return fullText
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setDocGenLog(prev => [...prev, { time: now(), message: `${label} 失败: ${e.message}` }])
        modal.toast('生成失败: ' + e.message, 'error')
      } else {
        setDocGenLog(prev => [...prev, { time: now(), message: `${label} 已取消` }])
      }
      return null
    }
  }

  // ── Stage 1 Generate ──
  const doGenerateStep1 = async () => {
    const source = mode1 === 'text' ? textInput : mode1 === 'file' ? fileText : videoText
    if (!source.trim() || !id || !step1Model) return
    if (step1Generating[sub]) return
    const stepKey = `step1_${sub}`
    const ctrl = new AbortController(); abortRef.current[stepKey] = ctrl
    setStep1Generating(prev => ({ ...prev, [sub]: true }))
    try {
      const [providerId, model] = step1Model.split(':')
      const prompt = stage1Prompts[mode1Key] || STAGE1_PROMPTS_FALLBACK[mode1Key]
      const skill = stage1Skill || STAGE1_SKILL_FALLBACK
      const result: any = await api.llmGenerate({
        provider_id: providerId, model,
        system_prompt: prompt,
        user_message: `请将以下内容按指定格式整理：\n\n${source}\n\n输出格式要求：\n${skill}`,
        temperature: s1Temperature,
        signal: ctrl.signal,
      })
      const content = result.content
      const key = step1Key()
      setSteps(prev => ({ ...prev, [key]: content }))
      saveStep(key, content)
    } catch (e: any) { if (e.name !== 'AbortError') modal.toast('生成失败: ' + e.message, 'error') }
    finally { setStep1Generating(prev => ({ ...prev, [sub]: false })); delete abortRef.current[stepKey] }
  }

  // ── Batch Generate All Stage 2 Docs ──
  const STAGE2_CONFIGS = [
    { stepKey: 'step2_sop', modelKey: '_model_s2_sop', promptKey: 'sop', tempKey: '_temp_s2_sop', label: '标准文档', fallbackPrompt: '请将以下内容整理为标准文档格式。' },
    { stepKey: 'step2_daoshuyi', modelKey: '_model_s2_dao', promptKey: 'dao', tempKey: '_temp_s2_dao', label: '分析文档', fallbackPrompt: '请分析以下内容的原理与方法。' },
    { stepKey: 'step2_yanxi', modelKey: '_model_s2_yanxi', promptKey: 'yanxi', tempKey: '_temp_s2_yanxi', label: '手册文档', fallbackPrompt: '请将以下内容整理为手册格式，包含背景知识和要点。' },
  ]

  // Core generation logic shared by doBatchGenerate and handleModelPickerConfirm
  const executeBatchGenerate = async (resolvedModels: Record<string, string>) => {
    const s2ContentKeys: Record<string, string> = {
      '2a': 'step2_sop', '2b': 'step2_daoshuyi', '2c': 'step2_yanxi',
    }
    const currentS2Content = steps[s2ContentKeys[sub] || ''] || ''
    const otherS2Content = STAGE2_CONFIGS.reduce((acc, c) => acc || steps[c.stepKey] || '', '')
    const stage1Source = steps.raw_video || steps.raw_text || steps.raw_file || ''
    const source = currentS2Content || otherS2Content || stage1Source

    if (!source) {
      modal.toast('没有可用的数据源。请先在 Stage 1 导入素材。', 'error')
      delete abortRef.current['step2_batch']
      return
    }

    const ctrl = new AbortController(); abortRef.current['step2_batch'] = ctrl

    // When called from Stage 1, auto-set all Stage 2 data sources
    if (stage === 1) {
      const dsMap: Record<string, string> = { '1a': 'video', '1b': 'text', '1c': 'file' }
      const ds = dsMap[sub] || 'video'
      ;['sop', 'dao', 'yanxi'].forEach(col => {
        setS2DataSources(prev => ({ ...prev, [col]: ds }))
        if (id) api.saveStep(id, `_ds_s2_${col}`, ds)
      })
    }

    const subMap: Record<string, string> = {
      step2_sop: '2a', step2_daoshuyi: '2b', step2_yanxi: '2c',
    }

    const tasks = STAGE2_CONFIGS.map(c => {
      const model = resolvedModels[c.modelKey]
      if (!model) return null
      const [pid, mdl] = model.split(':')
      const prompt = stage2Prompts[c.promptKey]?.prompt || c.fallbackPrompt
      const skill = stage2Prompts[c.promptKey]?.skill || ''
      const userMessage = skill
        ? `请将以下内容按指定格式整理：\n\n${source}\n\n输出格式要求：\n${skill}`
        : source
      const subKey = subMap[c.stepKey] || ''
      const temperature = steps[c.tempKey] ? parseFloat(steps[c.tempKey]) : 0.3
      if (subKey) setStep2Generating(prev => ({ ...prev, [subKey]: true }))
      return doGenerate(c.stepKey, prompt, userMessage, pid, mdl, temperature, ctrl.signal)
        .then(r => {
          if (subKey) setStep2Generating(prev => ({ ...prev, [subKey]: false }))
          return { label: c.label, ok: r != null }
        })
        .catch(() => {
          if (subKey) setStep2Generating(prev => ({ ...prev, [subKey]: false }))
          return { label: c.label, ok: false }
        })
    }).filter(Boolean)

    try {
      const results = await Promise.all(tasks)
      const ok = results.filter((r: any) => r.ok)
      const fail = results.filter((r: any) => !r.ok)
      if (fail.length === 0) {
        modal.toast('三篇文案已全部生成', 'success')
      } else if (ok.length === 0) {
        modal.toast(`全部生成失败: ${fail.map((f: any) => f.label).join('、')}`, 'error')
      } else {
        modal.toast(`${ok.map((o: any) => o.label).join('、')} 生成成功; ${fail.map((f: any) => f.label).join('、')} 失败`, 'error')
      }
    } catch (e: any) {
      setStep2Generating({})
      if (e.name !== 'AbortError') modal.toast('批量生成失败: ' + e.message, 'error')
    } finally {
      delete abortRef.current['step2_batch']
      setDocGenProgress(null)
      try {
        const s = await api.getSteps(id!)
        const map: Record<string, string> = {}
        s.forEach((x: any) => { map[x.step_name] = x.content })
        setSteps(prev => ({ ...prev, ...map }))
        setSavedSteps(prev => ({ ...prev, ...map }))
      } catch {}
    }
  }

  const doBatchGenerate = () => {
    const defP = llmProviders.find(p => p.is_enabled)
    const defMs = (defP && Array.isArray(defP.models)) ? defP.models : []
    const defModel = (defMs.length > 0 && defP) ? `${defP.id}:${defMs[0]}` : ''
    const defaults: Record<string, string> = {}
    STAGE2_CONFIGS.forEach(c => {
      defaults[c.modelKey] = steps[c.modelKey] || defModel
    })
    setModelPickerValues(defaults)
    setShowModelPicker(true)
  }

  // ── Model Picker: confirm → save models → regenerate ──
  const handleModelPickerConfirm = async () => {
    if (!id) return
    const configs = [
      { modelKey: '_model_s2_sop' as const },
      { modelKey: '_model_s2_dao' as const },
      { modelKey: '_model_s2_yanxi' as const },
    ]
    // Save selections
    try {
      for (const c of configs) {
        const val = modelPickerValues[c.modelKey]
        if (val) {
          await api.saveStep(id, c.modelKey, val)
        }
      }
    } catch {
      modal.toast('设置不成功', 'error')
      return
    }
    setShowModelPicker(false)
    // Update local state
    try {
      const s = await api.getSteps(id)
      const map: Record<string, string> = {}
      s.forEach((x: any) => { map[x.step_name] = x.content })
      setSteps(prev => ({ ...prev, ...map }))
      setSavedSteps(prev => ({ ...prev, ...map }))
    } catch {}
    executeBatchGenerate(modelPickerValues)
  }

  const modelPickerAll = [
    { modelKey: '_model_s2_sop', label: '标准文档' },
    { modelKey: '_model_s2_dao', label: '分析文档' },
    { modelKey: '_model_s2_yanxi', label: '手册文档' },
  ]

  // ── PPT / SOP Generation ──
  const getPptModel = (key: string): string => {
    if (key === 'step3_dao_ppt') return s3DaoPptModel
    if (key === 'step3_yan_ppt') return s3YanxiPptModel
    return ''
  }
  const doGeneratePlan = async (stepKey: string, content: string, tmplId: string, model: string, columnId: string, temperature: number = 0.3, tempOutline?: number, tempGeneration?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number) => {
    setPptGenerating(prev => ({...prev, [stepKey]: true}))
    const ctrl = new AbortController(); abortRef.current[stepKey] = ctrl
    try {
      const [pid, mdl] = model ? model.split(':') : ['', '']
      const result: any = await api.generatePPTPlan(content, tmplId, pid, mdl, columnId, ctrl.signal, temperature, tempOutline, tempGeneration, tempStageOutline, tempStageGeneration, tempStageReview)
      const plan = result.slide_plan || []
      const planJson = JSON.stringify(plan, null, 2)
      setSteps(prev => ({ ...prev, [stepKey]: planJson }))
      saveStep(stepKey, planJson)
      modal.toast(`大纲已生成: ${plan.length} 页幻灯片`, 'success')
    } catch (e: any) { if (e.name !== 'AbortError') modal.toast('生成大纲失败: ' + e.message, 'error') }
    finally { setPptGenerating(prev => { const n = {...prev}; delete n[stepKey]; return n }); delete abortRef.current[stepKey] }
  }

  const clearPptPolling = () => {
    if (pptPollRef.current) { clearInterval(pptPollRef.current); pptPollRef.current = null }
    setPptProgress(null)
    setProgressivePreviewUrl({})
  }

  const clearPptLogPolling = () => {
    if (pptLogPollRef.current) { clearInterval(pptLogPollRef.current); pptLogPollRef.current = null }
  }

  const startPptLogPolling = () => {
    clearPptLogPolling()
    setPptLog([])
    const poll = () => {
      api.getPptLog(id!).then(logs => {
        if (logs && logs.length > 0) setPptLog(logs)
      }).catch(() => {})
    }
    poll() // immediate first fetch
    pptLogPollRef.current = setInterval(poll, 10000)
  }

  // Auto-scroll log container to bottom when new entries arrive
  useEffect(() => {
    if (pptLogContainerRef.current) {
      pptLogContainerRef.current.scrollTop = pptLogContainerRef.current.scrollHeight
    }
  }, [pptLog])

  const doGenerateOutline = async (stepKey: string, content: string, tmplId: string, model: string, columnId: string, temperature: number = 0.3, tempOutline?: number, tempKeyword?: number, tempResearch?: number, tempFill?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number) => {
    setPptOutlineLoading(prev => ({...prev, [stepKey]: true}))
    startPptLogPolling()
    const ctrl = new AbortController()
    abortRef.current[stepKey] = ctrl
    try {
      const [pid, mdl] = model ? model.split(':') : ['', '']
      const result = await api.generateOutline(content, tmplId, pid, mdl, columnId, ctrl.signal, temperature, tempOutline, tempKeyword, tempResearch, tempFill, tempStageOutline, tempStageGeneration, tempStageReview, id)
      if (result && result.outline_json?.length > 0) {
        setPptOutline(prev => ({...prev, [stepKey]: result}))
        setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
        saveStep(stepKey, result.outline_text || '')
        if (result.outline_json?.length) saveStep(`_ppt_outline_json_${stepKey}`, JSON.stringify(result.outline_json))
        modal.toast(`大纲已生成：${result.outline_json.length} 页`, 'success')
      } else {
        modal.toast('大纲生成失败：返回为空', 'error')
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') modal.toast('生成已取消', 'success')
      else modal.toast(`大纲生成失败: ${e?.message || e}`, 'error')
    } finally {
      delete abortRef.current[stepKey]
      setPptOutlineLoading(prev => ({...prev, [stepKey]: false}))
      // Final fetch to catch last entries before stopping polling
      api.getPptLog(id!).then(logs => {
        if (logs && logs.length > 0) setPptLog(logs)
      }).catch(() => {})
      clearPptLogPolling()
    }
  }

  const doGeneratePPT = async (stepKey: string, content: string, tmplId: string, label: string, _prompt: string, model: string, columnId: string, temperature: number = 0.3, tempKeyword?: number, tempResearch?: number, tempOutline?: number, tempFill?: number, tempCards?: number, tempHtml?: number, tempSvgBatch?: number, tempSvgSingle?: number, tempReview?: number, tempFix?: number, tempHolistic?: number, tempHolisticFix?: number, tempStageOutline?: number, tempStageGeneration?: number, tempStageReview?: number) => {
    setPptGenerating(prev => ({...prev, [stepKey]: true}))
    clearPptPolling()
    startPptLogPolling()
    // Clear stale preview/edit data from previous generation so buttons don't show old results
    setPptSlidePlans(prev => { const n = { ...prev }; delete n[stepKey]; return n })
    setPreviewHtml(prev => { const n = { ...prev }; delete n[stepKey]; return n })
    setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
    const ctrl = new AbortController(); abortRef.current[stepKey] = ctrl
    let pollFailCount = 0
    pptPollRef.current = setInterval(() => {
      api.getPptStatus(id!).then(s => {
        pollFailCount = 0
        setPptProgress(s)
        if (s?.preview_url) setProgressivePreviewUrl(prev => ({ ...prev, [stepKey]: s.preview_url }))
      }).catch(() => {
        pollFailCount++
        if (pollFailCount >= 2) {
          ctrl.abort()
          modal.toast('后端连接丢失，生成已中断', 'error')
        }
      })
    }, 10000)
    try {
      const branding = (globalBranding.copyright || globalBranding.signature) ? globalBranding : undefined
      const [pid, mdl] = model ? model.split(':') : ['', '']
      const outlineJson = pptOutline[stepKey]?.outline_json
      const validOutlinePlan = outlineJson?.length ? outlineJson : undefined
      const result: any = await api.generatePPT(content, tmplId, branding, id, pid, mdl, validOutlinePlan, ctrl.signal, columnId, pptColorScheme[stepKey] || 'deep-blue', temperature, tempKeyword, tempResearch, tempOutline, tempFill, tempCards, tempHtml, tempSvgBatch, tempSvgSingle, tempReview, tempFix, tempHolistic, tempHolisticFix, tempStageOutline, tempStageGeneration, tempStageReview)

      if (result.format === 'svg') {
        // SVG output — PPT-Agent Bento Grid
        setGenFiles(prev => [...prev, {
          name: `svg-deck-${result.run_id}.zip`, type: 'SVG',
          source: label,
          url: result.zip_url,
        }])
        const planData = {
          slides: result.slide_plan || [], filename: `svg-deck-${result.run_id}`,
          downloadUrl: result.zip_url,
          previewUrl: result.preview_url,
          zipUrl: result.zip_url,
          templateId: tmplId,
          format: 'svg',
        }
        setPptSlidePlans(prev => ({ ...prev, [stepKey]: planData }))
        saveStep(`_ppt_plan_${stepKey}`, JSON.stringify(planData))
        setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
        const htmlUrl = '__SVG__' + result.preview_url
        setPreviewHtml(prev => ({...prev, [stepKey]: htmlUrl}))
        saveStep(`_preview_html_${stepKey}`, htmlUrl)
        modal.toast(`SVG 幻灯片已生成: ${result.slide_count || 0} 页`, 'success')
      } else {
        // PPTX output — legacy format
        setGenFiles(prev => [...prev, {
          name: result.filename, type: 'PPT',
          source: label,
          url: result.download_url || '/api/download/' + encodeURIComponent(result.filename),
        }])
        if (result.slide_plan) {
          const planData = {
            slides: result.slide_plan, filename: result.filename,
            downloadUrl: result.download_url || '/api/download/' + encodeURIComponent(result.filename),
            templateId: tmplId,
            format: 'pptx',
          }
          setPptSlidePlans(prev => ({ ...prev, [stepKey]: planData }))
          saveStep(`_ppt_plan_${stepKey}`, JSON.stringify(planData))
          setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
          setPreviewHtml(prev => ({...prev, [stepKey]: ''}))
        }
        modal.toast(`PPT 已生成: ${result.filename}`, 'success')
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        const msg = e?.message || String(e) || '未知错误'
        modal.toast('PPT 生成失败: ' + msg, 'error')
      }
    } finally { setPptGenerating(prev => { const n = {...prev}; delete n[stepKey]; return n }); delete abortRef.current[stepKey]; clearPptPolling(); api.getPptLog(id!).then(logs => { if (logs && logs.length > 0) setPptLog(logs) }).catch(() => {}); clearPptLogPolling() }
  }

  const handleCancelGenerate = (stepKey: string) => {
    if (abortRef.current[stepKey]) { abortRef.current[stepKey].abort(); clearPptPolling(); modal.toast('已取消生成', 'success') }
  }

  const refreshPreview = async (stepKey: string) => {
    let plan = pptSlidePlans[stepKey]
    if (!plan && id) {
      // 清空按钮只清了内存状态，后端数据还在，尝试恢复
      setPreviewLoading(prev => ({...prev, [stepKey]: true}))
      try {
        const steps = await api.getSteps(id)
        const map: Record<string, string> = {}
        steps.forEach((x: any) => { map[x.step_name] = x.content })
        const planKey = `_ppt_plan_${stepKey}`
        const htmlKey = `_preview_html_${stepKey}`
        if (map[planKey]) {
          plan = JSON.parse(map[planKey])
          // 兼容旧格式：从 _preview_html_* 补全缺失字段
          if (!plan.format && map[htmlKey]) {
            plan.format = map[htmlKey].startsWith('__SVG__') ? 'svg' : 'pptx'
          }
          if (!plan.previewUrl && map[htmlKey]) {
            plan.previewUrl = map[htmlKey].replace(/^__SVG__/, '')
          }
          if (!plan.zipUrl && plan.previewUrl) {
            const m = plan.previewUrl.match(/\/api\/exports\/(.+?)\/index\.html/)
            if (m) plan.zipUrl = `/api/ppt/export-zip/${m[1]}`
          }
          setPptSlidePlans(prev => ({ ...prev, [stepKey]: plan }))
          if (map[htmlKey]) {
            setPreviewHtml(prev => ({...prev, [stepKey]: map[htmlKey]}))
            setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
          }
        }
      } catch { /* ignore */ }
    }
    if (!plan) {
      setPreviewLoading(prev => { const n = {...prev}; delete n[stepKey]; return n })
      modal.toast('暂无 PPT 数据，请先生成', 'error')
      return
    }
    setPreviewLoading(prev => ({...prev, [stepKey]: true}))
    setPreviewTab(prev => ({...prev, [stepKey]: 'ppt'}))
    try {
      if (plan.format === 'svg' && plan.previewUrl) {
        setPreviewHtml(prev => ({...prev, [stepKey]: '__SVG__' + plan.previewUrl}))
      } else if (plan.previewUrl) {
        setPreviewHtml(prev => ({...prev, [stepKey]: plan.previewUrl as string}))
      } else {
        modal.toast('此计划暂无预览', 'error')
      }
    } catch (e: any) { modal.toast('预览失败: ' + e.message, 'error') }
    finally { setPreviewLoading(prev => { const n = {...prev}; delete n[stepKey]; return n }) }
  }

  const handleDownloadHtml = async (stepKey: string) => {
    const plan = pptSlidePlans[stepKey]
    if (!plan?.previewUrl) {
      if (plan?.format === 'svg' && plan.zipUrl) {
        modal.toast('SVG 格式请使用「⬇ SVG ZIP」下载完整包', 'error')
      } else {
        modal.toast('此 PPT 暂无 HTML 预览（仅 SVG 格式支持 HTML 预览）', 'error')
      }
      return
    }
    try {
      const resp = await fetch(plan.previewUrl)
      if (!resp.ok) {
        modal.toast(`HTML导出失败: 服务器返回 ${resp.status}`, 'error')
        return
      }
      let html = await resp.text()
      html = html.replace(/<script>[\s\S]*?<\/script>/gi, '')
      const blob = new Blob([html], { type: 'text/html' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = (plan.filename || 'slides').replace(/\.pptx$/i, '') + '.html'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      URL.revokeObjectURL(url)
      modal.toast('已开始下载: ' + ((plan.filename || 'slides').replace(/\.pptx$/i, '') + '.html'), 'success')
    } catch (e: any) { modal.toast('HTML导出失败: ' + e.message, 'error') }
  }

  const doExportSOP = async (content: string, prompt: string, model: string, branding?: Record<string, string>, temperature: number = 0.3) => {
    try {
      // Step 1: AI generation with column prompt
      let aiContent = content
      if (model && prompt) {
        const [pid, mdl] = model.split(':')
        const result = await doGenerate('step3_sop_doc', prompt, content, pid, mdl, temperature)
        if (result) aiContent = result
      }
      // Step 2: Export as DOCX
      const result: any = await api.exportSOP(aiContent, branding, id)
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
  const [filesLoaded, setFilesLoaded] = useState(false)

  // Load existing files from project folder on mount
  useEffect(() => {
    if (!id || filesLoaded) return
    api.getProjectFiles(id).then((data: any) => {
      const existing = (data.files || []).map((f: any) => ({
        name: f.filename,
        type: f.type,
        source: '项目文件',
        url: f.download_url,
      }))
      setGenFiles(prev => {
        const existingNames = new Set(existing.map((e: any) => e.name))
        const sessionOnly = prev.filter(p => !existingNames.has(p.name))
        return [...existing, ...sessionOnly]
      })
      setFilesLoaded(true)
    }).catch(() => {})
  }, [id, filesLoaded])

  // Global generation tracking — visible across all stages
  const isAnyS1 = Object.values(step1Generating).some(Boolean)
  const isAnyS2 = Object.values(step2Generating).some(Boolean)
  const isGlobalGenerating = isAnyS1 || isAnyS2 || Object.keys(pptGenerating).length > 0 || ttsGenerating
  const globalGenLabel = Object.keys(pptGenerating).length > 0 ? 'PPT 合成中'
    : ttsGenerating ? '语音合成中'
    : isAnyS2 ? 'AI 生成文档中'
    : isAnyS1 ? '整理文档中'
    : '处理中'

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
        {isGlobalGenerating && (
          <span style={{
            marginLeft: 12, fontSize: 11, color: 'var(--primary)',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            animation: 'pulse 1.5s infinite',
          }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: 'var(--primary)', animation: 'blink 0.8s infinite',
            }} />
            ⏳ {globalGenLabel} (切换栏目不影响)
            {pptProgress && (
              <span style={{ fontWeight: 500, marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                {pptProgress.phase_label}
                {pptProgress.slides_total ? (
                  <span style={{ marginLeft: 6 }}>
                    <span style={{
                      display: 'inline-block', width: 120, height: 4, background: 'var(--border)',
                      borderRadius: 2, verticalAlign: 'middle', marginRight: 6, position: 'relative'
                    }}>
                      <span style={{
                        display: 'inline-block', width: `${Math.round((pptProgress.slides_done || 0) / pptProgress.slides_total * 100)}%`,
                        height: 4, background: 'var(--primary)', borderRadius: 2,
                        position: 'absolute', left: 0, top: 0, transition: 'width 0.3s'
                      }} />
                    </span>
                    {pptProgress.slides_done}/{pptProgress.slides_total} 页
                  </span>
                ) : ''}
                {pptProgress.message ? <span style={{ marginLeft: 6 }}>— {pptProgress.message}</span> : ''}
              </span>
            )}
            {docGenProgress && !pptProgress && (
              <span style={{ fontWeight: 500, marginLeft: 8, fontSize: 11, color: 'var(--text-secondary)' }}>
                {docGenProgress.phase_label}
                {docGenProgress.message ? <span style={{ marginLeft: 6 }}>— {docGenProgress.message}</span> : ''}
              </span>
            )}
          </span>
        )}
      </div>

      {/* ═══ Top Nav ═══ */}
      <div className="top-nav">
        {STAGES.filter(s => s.id <= 3).map((s, i) => (
          <span key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span className="tn-arrow">→</span>}
            <div className={`tn-item${stage === s.id ? ' active' : ''}`}
              onClick={() => switchStage(s.id)}>
              <span className="tn-num">{s.id}</span> {s.label}
              <span className={`tn-dot ${stageDot(s.id)}`} />
            </div>
          </span>
        ))}
        <span style={{ borderLeft: '1px solid var(--border)', height: 20, margin: '0 6px', alignSelf: 'center' }} />
        {STAGES.filter(s => s.id >= 4).map((s, i) => (
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
                    onChange={e => {
                      const val = e.target.value
                      setStep1Models(prev => ({ ...prev, [mode1Key]: val }))
                      saveStep(`_model_s1_${mode1Key}`, val)
                    }}>
                    <option value="">选择模型...</option>
                    {llmProviders.filter(p => p.is_enabled).map(p =>
                      (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                        <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                      ))
                    )}
                  </select>
                  <TemperatureInput value={s1Temperature} onChange={v => { setS1Temperatures(prev => ({ ...prev, [mode1Key]: v })); saveStep(`_temp_s1_${mode1Key}`, String(v)) }} id="temp-s1" />
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
                    disabled={step1Generating['1a'] || !step1Model || !videoText.trim()}
                    onClick={doGenerateStep1}>
                    {step1Generating['1a'] ? '⏳ 生成中...' : '⚙ 整理文档'}
                  </button>
                  {step1Generating['1a'] && (
                    <button className="btn btn-sm" style={{ marginTop: 4, background: 'var(--warning)', color: '#fff', width: '100%' }}
                      onClick={() => { abortRef.current['step1_1a']?.abort(); modal.toast('已取消生成', 'success') }}>取消</button>
                  )}
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
                      <button className={`btn btn-primary btn-sm ${getSaveBtnClass(videoText, 'video_text')}`} disabled={!videoText.trim()}
                        onClick={() => { if (id && videoText.trim()) { saveStep('video_text', videoText); saveStep('raw_video', videoText); flashSave() } }}>{getSaveBtnLabel(videoText, 'video_text')}</button>
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
                  <div className="card-hint">直接粘贴或输入内容，可编辑后重新生成</div>
                  <textarea className="form-textarea" style={{ flex: 1, minHeight: 280 }}
                    placeholder="在此粘贴或输入内容..."
                    value={textInput} onChange={e => setTextInput(e.target.value)} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => setTextInput('')}>🗑 清空</button>
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(textInput, 'raw_text')}`} disabled={!textInput.trim()}
                      onClick={() => { if (id && textInput.trim()) { saveStep('raw_text', textInput); flashSave() } }}>{getSaveBtnLabel(textInput, 'raw_text')}</button>
                    <button className="btn btn-primary btn-sm"
                      disabled={step1Generating['1b'] || !step1Model || !textInput.trim()}
                      onClick={doGenerateStep1}>
                      {step1Generating['1b'] ? '⏳ 生成中...' : '⚙ 整理文档'}
                    </button>
                    {step1Generating['1b'] && (
                      <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff' }}
                        onClick={() => { abortRef.current['step1_1b']?.abort(); modal.toast('已取消生成', 'success') }}>取消</button>
                    )}
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
                    disabled={step1Generating['1c'] || !step1Model || !fileText.trim()}
                    onClick={doGenerateStep1}>
                    {step1Generating['1c'] ? '⏳ 生成中...' : '⚙ 整理文档'}
                  </button>
                  {step1Generating['1c'] && (
                    <button className="btn btn-sm" style={{ marginTop: 4, background: 'var(--warning)', color: '#fff', width: '100%' }}
                      onClick={() => { abortRef.current['step1_1c']?.abort(); modal.toast('已取消生成', 'success') }}>取消</button>
                  )}
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
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(fileText, 'raw_file')}`} disabled={!fileText.trim()}
                      onClick={() => { if (id && fileText.trim()) { saveStep('raw_file', fileText); flashSave() } }}>{getSaveBtnLabel(fileText, 'raw_file')}</button>
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

              {/* Document generation log — same style as PPT log */}
              {docGenLog.length > 0 && (
                <div style={{ maxHeight: 180, overflowY: 'auto', background: 'var(--bg)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11, lineHeight: '18px', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', marginTop: 8 }}>
                  {docGenLog.slice(-6).map((entry, i) => (
                    <div key={i} style={{ marginBottom: 2 }}>
                      <span style={{ color: '#888' }}>[{entry.time}]</span> {entry.message}
                    </div>
                  ))}
                </div>
              )}
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
                    <button className="btn btn-outline btn-sm"
                      disabled={!!Object.values(step2Generating).some(Boolean) || (!steps.raw_video && !steps.raw_text && !steps.raw_file && !steps.step2_sop && !steps.step2_daoshuyi && !steps.step2_yanxi)}
                      onClick={doBatchGenerate}>
                      {Object.values(step2Generating).some(Boolean) ? '⏳ 生成中...' : '⚡ 生成所有文案'}
                    </button>
                    {Object.values(step2Generating).some(Boolean) && (
                      <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff' }}
                        onClick={() => { abortRef.current['step2_batch']?.abort(); modal.toast('已取消生成', 'success') }}>取消</button>
                    )}
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(steps[step1Key()] || '', step1Key())}`}
                      disabled={!steps[step1Key()]}
                      onClick={() => { saveStep(step1Key(), steps[step1Key()] || ''); flashSave() }}>{getSaveBtnLabel(steps[step1Key()] || '', step1Key())}</button>
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
                <div style={{ display: sub === '2a' ? 'contents' : 'none' }}>
                  <Stage2Controls docType="sop" label="SOP文案"
                    steps={steps} llmProviders={llmProviders}
                    dataSource={s2DataSources['sop'] || 'video'} onDataSourceChange={(v) => handleS2DataSourceChange('sop', v)}
                    generating={!!step2Generating['2a']}
                    prompt={stage2Prompts.sop?.prompt || ''}
                    skill={stage2Prompts.sop?.skill || ''}
                    projectId={id!}
                    panelRef={sopRef}
                    setGenerating={(v) => setStep2Generating(prev => ({ ...prev, '2a': v }))}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
                </div>
                <div style={{ display: sub === '2b' ? 'contents' : 'none' }}>
                  <Stage2Controls docType="dao" label="分析文档"
                    steps={steps} llmProviders={llmProviders}
                    dataSource={s2DataSources['dao'] || 'video'} onDataSourceChange={(v) => handleS2DataSourceChange('dao', v)}
                    generating={!!step2Generating['2b']}
                    prompt={stage2Prompts.dao?.prompt || ''}
                    skill={stage2Prompts.dao?.skill || ''}
                    projectId={id!}
                    panelRef={daoRef}
                    setGenerating={(v) => setStep2Generating(prev => ({ ...prev, '2b': v }))}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
                </div>
                <div style={{ display: sub === '2c' ? 'contents' : 'none' }}>
                  <Stage2Controls docType="yanxi" label="手册文档"
                    steps={steps} llmProviders={llmProviders}
                    dataSource={s2DataSources['yanxi'] || 'video'} onDataSourceChange={(v) => handleS2DataSourceChange('yanxi', v)}
                    generating={!!step2Generating['2c']}
                    prompt={stage2Prompts.yanxi?.prompt || ''}
                    skill={stage2Prompts.yanxi?.skill || ''}
                    projectId={id!}
                    panelRef={yanxiRef}
                    setGenerating={(v) => setStep2Generating(prev => ({ ...prev, '2c': v }))}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
                </div>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: sub === '2a' ? 'contents' : 'none' }}>
                  <TeachingDocPanel ref={sopRef} docType="sop" projectId={id!}
                    steps={steps} savedSteps={savedSteps}
                    prompt={stage2Prompts.sop?.prompt || ''}
                    skill={stage2Prompts.sop?.skill || ''}
                    llmProviders={llmProviders}
                   
                    hideControls dataSource={s2DataSources['sop'] || 'video'}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
                </div>
                <div style={{ display: sub === '2b' ? 'contents' : 'none' }}>
                  <TeachingDocPanel ref={daoRef} docType="dao" projectId={id!}
                    steps={steps} savedSteps={savedSteps}
                    prompt={stage2Prompts.dao?.prompt || ''}
                    skill={stage2Prompts.dao?.skill || ''}
                    llmProviders={llmProviders}
                   
                    hideControls dataSource={s2DataSources['dao'] || 'video'}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
                </div>
                <div style={{ display: sub === '2c' ? 'contents' : 'none' }}>
                  <TeachingDocPanel ref={yanxiRef} docType="yanxi" projectId={id!}
                    steps={steps} savedSteps={savedSteps}
                    prompt={stage2Prompts.yanxi?.prompt || ''}
                    skill={stage2Prompts.yanxi?.skill || ''}
                    llmProviders={llmProviders}
                   
                    hideControls dataSource={s2DataSources['yanxi'] || 'video'}
                    onRefresh={() => {
                      return api.getSteps(id!).then((s: any[]) => {
                        const map: Record<string, string> = {}
                        s.forEach((x: any) => { map[x.step_name] = x.content })
                        setSteps(prev => ({ ...prev, ...map }))
                        setSavedSteps(prev => ({ ...prev, ...map }))
                      })
                    }} />
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
                <div className="card-title">生成课件</div>
                <div className="card-hint">选择模板自动关联提示词+SKILL，配置在「项目配置」→ 栏目配置</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={[]} selectedId={sopSelected}
                  onSelect={t => setSopSelected(t.id)} previewTarget="prev3" />
                <div className="form-label">大模型</div>
                <select className="form-select" style={{ marginBottom: 8 }} value={s3SopModel} onChange={e => { setS3SopModel(e.target.value); saveStep('_model_step3_sop', e.target.value) }}>
                  <option value="">选择模型...</option>
                  {llmProviders.filter(p => p.is_enabled).map(p =>
                    (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                    ))
                  )}
                </select>
                <div className="form-label">温度设置</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setS3SopTempOpen(true)}>⚙ 温度设置 (SOP 生成 + 3 阶段)</button>
                <div className="form-label" style={{ marginTop: 10 }}>品牌信息</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {globalBranding.copyright || globalBranding.signature
                    ? `版权: ${globalBranding.copyright || '—'} · 签名: ${globalBranding.signature || '—'}`
                    : '未配置，在「全局设置」→ 通用设置 中配置'}
                </div>
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  disabled={!s3SopModel}
                  onClick={() => doExportSOP(
                    steps.step2_sop || steps.step1_video || steps.step1_text || steps.step1_file || '',
                    stage3Prompts.sop?.prompt || '请根据内容编写标准文档。',
                    s3SopModel,
                    (globalBranding.copyright || globalBranding.signature) ? globalBranding : undefined,
                    s3SopTemps.sop
                  )}>
                  📄 生成课件
                </button>
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="card-title">生成 / 编辑</div>
                <textarea className="form-textarea" style={{ flex: 1, minHeight: 120 }}
                  value={steps[step3Key()] || ''}
                  onChange={e => setSteps(prev => ({ ...prev, [step3Key()]: e.target.value }))}
                  placeholder="点击生成按钮，AI生成后在此编辑..." />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>编辑后保存，然后导出为 .docx 文档</span>
                  <span style={{ display: 'flex', gap: 5 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      setSteps(prev => ({ ...prev, [step3Key()]: '' }))
                      saveStep(step3Key(), '')
                    }}>✕ 清空</button>
                    <button className="btn btn-ghost btn-sm"
                      disabled={!steps[step3Key()]}
                      onClick={async () => {
                        if (!id) return
                        try {
                          const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_SOP文档.txt`, steps[step3Key()] || '')
                          modal.toast(`已保存到 ${resp.path}`, 'success')
                        } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                      }}>📥 保存到项目</button>
                    <button className={`btn btn-primary btn-sm ${getSaveBtnClass(steps[step3Key()] || '', step3Key())}`}
                      onClick={() => { saveStep(step3Key(), steps[step3Key()] || ''); flashSave() }}>
                      {getSaveBtnLabel(steps[step3Key()] || '', step3Key())}
                    </button>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {stage === 3 && sub === '3b' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">📌 分析PPT</div>
                <div className="card-hint">基于分析文档，选择模板合成PPT</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={daoPptTemplates} selectedId={daoPptSelected}
                  onSelect={t => { setDaoPptSelected(t.id); saveStep('_tmpl_step3_dao_ppt', t.id) }} previewTarget="prev3b" />
                {pptColorSchemes.length > 1 && (
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <div className="form-label">配色方案</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {pptColorSchemes.map(cs => {
                        const key = step3Key()
                        const current = pptColorScheme[key] || 'deep-blue'
                        return (
                        <button key={cs.id}
                          onClick={() => { setPptColorScheme(prev => ({ ...prev, [key]: cs.id })); saveStep(`_color_scheme_${key}`, cs.id) }}
                          title={cs.label}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', fontSize: 11,
                            borderRadius: 6, border: current === cs.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: current === cs.id ? 'var(--bg-hover)' : 'var(--bg)',
                            cursor: 'pointer',
                          }}>
                          <span style={{ width: 14, height: 14, borderRadius: '50%', background: cs.primary, display: 'inline-block', flexShrink: 0 }} />
                          {cs.label}
                        </button>
                      )})}
                    </div>
                  </div>
                )}
                <div className="form-label">大模型</div>
                <select className="form-select" style={{ marginBottom: 8 }} value={s3DaoPptModel} onChange={e => { setS3DaoPptModel(e.target.value); saveStep('_model_step3_dao_ppt', e.target.value) }}>
                  <option value="">选择模型...</option>
                  {llmProviders.filter(p => p.is_enabled).map(p =>
                    (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                    ))
                  )}
                </select>
                <div className="form-label">温度设置</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setS3DaoTempOpen(true)}>⚙ 温度设置 (SOP 生成 + 3 阶段)</button>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-sm"
                    style={{ flex: 1 }}
                    disabled={!daoPptSelected || !(steps.step2_daoshuyi || '') || !s3DaoPptModel || pptOutlineLoading['step3_dao_ppt']}
                    onClick={() => doGenerateOutline('step3_dao_ppt', steps.step2_daoshuyi || '', daoPptSelected, s3DaoPptModel, 'col4', s3DaoPptTemp, s3DaoTemps.outline, s3DaoTemps.keyword, s3DaoTemps.research, s3DaoTemps.fill, s3DaoTemps.stageOutline, s3DaoTemps.stageGeneration, s3DaoTemps.stageReview)}>
                    {pptOutlineLoading['step3_dao_ppt'] ? '⏳ 生成中...' : '📋 生成大纲'}
                  </button>
                  {pptOutlineLoading['step3_dao_ppt'] && (
                    <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff', flex: '0 0 auto' }}
                      onClick={() => handleCancelGenerate('step3_dao_ppt')}>取消</button>
                  )}
                  <button className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    disabled={!daoPptSelected || !(steps.step2_daoshuyi || '') || !s3DaoPptModel || pptGenerating['step3_dao_ppt']}
                    onClick={() => doGeneratePPT('step3_dao_ppt', steps.step2_daoshuyi || '', daoPptSelected, '分析PPT',
                      stage3Prompts.daoPpt?.prompt || '请将分析文档内容转化为PPT大纲。',
                      s3DaoPptModel, 'col4', s3DaoPptTemp, s3DaoTemps.keyword, s3DaoTemps.research, s3DaoTemps.outline, s3DaoTemps.fill, s3DaoTemps.cards, s3DaoTemps.html, s3DaoTemps.svg_batch, s3DaoTemps.svg_single, s3DaoTemps.review, s3DaoTemps.fix, s3DaoTemps.holistic, s3DaoTemps.holistic_fix, s3DaoTemps.stageOutline, s3DaoTemps.stageGeneration, s3DaoTemps.stageReview)}>
                    {pptGenerating['step3_dao_ppt'] ? '⏳ 合成中...' : '📌 合成PPT'}
                  </button>
                </div>
                {pptGenerating['step3_dao_ppt'] && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)', flex: 1 }}
                      onClick={() => handleCancelGenerate('step3_dao_ppt')}>取消生成</button>
                  </div>
                )}
                {!daoPptSelected || !(steps.step2_daoshuyi || '') || !s3DaoPptModel ? (
                  <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                    {[
                      !daoPptSelected ? '请选择模板' : '',
                      !(steps.step2_daoshuyi || '') ? '请先生成分析文档' : '',
                      !s3DaoPptModel ? '请选择大模型' : '',
                    ].filter(Boolean).join(' | ')}
                  </div>
                ) : null}
                {(pptLog.length > 0 || pptOutlineLoading['step3_dao_ppt'] || pptGenerating['step3_dao_ppt']) && (
                  <div ref={pptLogContainerRef} style={{ maxHeight: 180, overflowY: 'auto', background: 'var(--bg)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11, lineHeight: '18px', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', marginTop: 8 }}>
                    {pptLog.length === 0 ? (
                      <div style={{ color: '#888' }}>等待日志...</div>
                    ) : (
                      pptLog.map((entry, i) => (
                        <div key={i} style={{ marginBottom: 2 }}>
                          <span style={{ color: '#888' }}>[{entry.time}]</span> {entry.message}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: 8, flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 0 }}>
                    <button className="btn btn-ghost btn-sm"
                      style={{ borderBottom: (previewTab[step3Key()] || 'ppt') === 'ppt' ? '2px solid var(--primary)' : '2px solid transparent', borderRadius: 0, fontWeight: (previewTab[step3Key()] || 'ppt') === 'ppt' ? 600 : 400 }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'ppt'}))}>大纲内容</button>
                    <button className="btn btn-ghost btn-sm"
                      style={{ borderBottom: (previewTab[step3Key()] || 'ppt') === 'json' ? '2px solid var(--primary)' : '2px solid transparent', borderRadius: 0, fontWeight: (previewTab[step3Key()] || 'ppt') === 'json' ? 600 : 400 }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'json'}))}>JSON</button>
                  </div>
                </div>
                {((previewTab[step3Key()] || 'ppt') === 'ppt') ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {pptOutlineLoading['step3_dao_ppt'] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                        <div style={{ fontSize: 24, animation: 'spin 2s linear infinite' }}>⏳</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          AI 正在分析内容并生成大纲...<br />
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>预计 30-60 秒，请耐心等待</span>
                        </div>
                      </div>
                    ) : pptOutline[step3Key()] ? (
                      <textarea
                        style={{
                          flex: 1, width: '100%', border: 'none', resize: 'none',
                          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
                          color: 'var(--text)', background: 'var(--bg)',
                          outline: 'none', padding: 8, borderRadius: 4,
                        }}
                        value={pptOutline[step3Key()].outline_text}
                        readOnly={!pptEditMode[step3Key()]}
                        onChange={(e) => {
                          const md = e.target.value
                          setPptOutline(prev => ({
                            ...prev,
                            [step3Key()]: { ...prev[step3Key()], outline_text: md }
                          }))
                        }}
                        placeholder="大纲内容将显示在这里..."
                      />
                    ) : pptGenerating['step3_dao_ppt'] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                        <div style={{ fontSize: 24, animation: 'spin 2s linear infinite' }}>⏳</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          AI 正在合成幻灯片...
                        </div>
                      </div>
                    ) : pptSlidePlans[step3Key()] ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>已生成 {pptSlidePlans[step3Key()].slides.length} 页幻灯片</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm"
                            disabled={!pptSlidePlans[step3Key()]?.previewUrl}
                            onClick={() => pptSlidePlans[step3Key()]?.previewUrl && window.open(pptSlidePlans[step3Key()].previewUrl + '?_t=' + Date.now(), '_blank')}>
                            预览
                          </button>
                          {pptSlidePlans[step3Key()].format === 'svg' ? (
                            <button className="btn btn-ghost btn-sm"
                              onClick={async () => { const z = pptSlidePlans[step3Key()].zipUrl; if (z) downloadFile(z, pptSlidePlans[step3Key()].filename + '.zip') }}>
                              ⬇ SVG ZIP
                            </button>
                          ) : (
                            <>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => downloadFile(pptSlidePlans[step3Key()].downloadUrl, pptSlidePlans[step3Key()].filename)}>
                                ⬇ PPTX
                              </button>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => handleDownloadHtml(step3Key())}>
                                ⬇ HTML
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                        <div style={{ fontSize: 36, opacity: 0.3 }}>📋</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          点击左侧 <span style={{ fontWeight: 600, color: 'var(--primary)' }}>📋 生成大纲</span> 开始分析
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10, textAlign: 'center' }}>
                          生成大纲后可在此编辑精修<br />确认无误后再点击 合成PPT
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const key = step3Key()
                          setPptEditMode(prev => ({...prev, [key]: !prev[key]}))
                        }}>
                        {pptEditMode[step3Key()] ? '👁 查看' : '✏ 编辑'}
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        disabled={!pptOutline[step3Key()] && !steps[step3Key()]}
                        onClick={async () => {
                          if (!id) return
                          const text = pptOutline[step3Key()]?.outline_text || steps[step3Key()] || ''
                          const label = step3Key() === 'step3_dao_ppt' ? '分析PPT' : '综合PPT'
                          try {
                            const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_${label}大纲.txt`, text)
                            modal.toast(`已保存到 ${resp.path}`, 'success')
                          } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                        }}>📥 保存到项目</button>
                      <button className={`btn btn-primary btn-sm ${getSaveBtnClass(pptOutline[step3Key()]?.outline_text || steps[step3Key()] || '', step3Key())} ${pptSavingOutline[step3Key()] ? 'btn-disabled' : ''}`}
                        disabled={pptSavingOutline[step3Key()]}
                        onClick={async () => {
                          const key = step3Key();
                          const currentText = pptOutline[key]?.outline_text || '';
                          const savedText = steps[key] || '';
                          const textChanged = currentText !== savedText;
                          const model = getPptModel(key);

                          if (textChanged && model) {
                            setPptSavingOutline(prev => ({...prev, [key]: true}));
                            try {
                              const [pid, mdl] = model.split(':');
                              const result = await api.convertOutlineToJson(currentText, pptOutline[key]?.outline_json || [], pid, mdl);
                              if (result?.outline_json?.length) {
                                setPptOutline(prev => ({...prev, [key]: {...prev[key], outline_json: result.outline_json}}));
                                saveStep(`_ppt_outline_json_${key}`, JSON.stringify(result.outline_json));
                              }
                            } catch (e: any) {
                              modal.toast(`大纲转换失败: ${e?.message || e}`, 'error');
                            } finally {
                              setPptSavingOutline(prev => ({...prev, [key]: false}));
                            }
                          }

                          saveStep(key, currentText);
                          flashSave();
                        }}>
                        {pptSavingOutline[step3Key()] ? '⏳ 转换中...' : getSaveBtnLabel(pptOutline[step3Key()]?.outline_text || steps[step3Key()] || '', step3Key())}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        const key = step3Key()
                        setPptSlidePlans(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPptOutline(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPreviewHtml(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPreviewLoading(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPptEditMode(prev => { const n = { ...prev }; delete n[key]; return n })
                      }}>✕ 清空</button>
                      <span style={{ flex: 1 }} />
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const key = step3Key()
                          setEditPanelOpen(prev => ({ ...prev, [key]: !prev[key] }))
                        }}
                        style={{ background: editPanelOpen[step3Key()] ? 'var(--primary)' : undefined, color: editPanelOpen[step3Key()] ? '#fff' : undefined }}>
                        {editPanelOpen[step3Key()] ? '✕ 关闭' : 'HTML编辑'}
                      </button>
                      {pptSlidePlans[step3Key()]?.previewUrl && (
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => window.open(pptSlidePlans[step3Key()].previewUrl + '?_t=' + Date.now(), '_blank')}>
                          预览
                        </button>
                      )}
                      {pptSlidePlans[step3Key()]?.format === 'svg' ? (
                        <button className="btn btn-ghost btn-sm"
                          onClick={async () => { const z = pptSlidePlans[step3Key()].zipUrl; if (z) downloadFile(z, (pptSlidePlans[step3Key()].filename || 'svg-deck') + '.zip') }}>
                          ⬇ SVG ZIP
                        </button>
                      ) : pptSlidePlans[step3Key()] ? (
                        <>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => downloadFile(pptSlidePlans[step3Key()].downloadUrl, pptSlidePlans[step3Key()].filename)}>
                            ⬇ PPTX
                          </button>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => handleDownloadHtml(step3Key())}>
                            ⬇ HTML
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : (previewTab[step3Key()] === 'json') ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <pre style={{
                      flex: 1, width: '100%', border: 'none', margin: 0,
                      fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
                      color: 'var(--text)', background: 'var(--bg)',
                      overflow: 'auto', padding: 8, borderRadius: 4,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {pptOutline[step3Key()] ? JSON.stringify(pptOutline[step3Key()].outline_json, null, 2) : '暂无大纲数据'}
                    </pre>
                  </div>
                ) : (
                  <></>
                )}
                <SlideEditModal
                  open={!!(editPanelOpen[step3Key()] && editPanelProps().runId)}
                  runId={editPanelProps().runId}
                  previewUrl={editPanelProps().previewUrl}
                  slideCount={editPanelProps().slideCount}
                  providerId={editPanelProps().providerId}
                  model={editPanelProps().model}
                  pptxDownloadUrl={pptSlidePlans[step3Key()]?.downloadUrl}
                  pptxFilename={pptSlidePlans[step3Key()]?.filename}
                  downloadFormat={pptSlidePlans[step3Key()]?.format}
                  projectId={id}
                  projectName={project?.name}
                  onDownloadHtml={() => handleDownloadHtml(step3Key())}
                  onClose={() => {
                    const key = step3Key()
                    setEditPanelOpen(prev => ({ ...prev, [key]: false }))
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {stage === 3 && sub === '3c' && (
          <div className="panel-grid">
            <div className="panel-left">
              <div className="card">
                <div className="card-title">📚 综合PPT</div>
                <div className="card-hint">基于手册文档，选择模板合成PPT</div>
                <div className="form-label">选择模板</div>
                <TemplateSelector items={yanxiPptTemplates} selectedId={yanxiPptSelected}
                  onSelect={t => { setYanxiPptSelected(t.id); saveStep('_tmpl_step3_yan_ppt', t.id) }} previewTarget="prev3c" />
                {pptColorSchemes.length > 1 && (
                  <div style={{ marginTop: 8, marginBottom: 8 }}>
                    <div className="form-label">配色方案</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {pptColorSchemes.map(cs => {
                        const key = step3Key()
                        const current = pptColorScheme[key] || 'deep-blue'
                        return (
                        <button key={cs.id}
                          onClick={() => { setPptColorScheme(prev => ({ ...prev, [key]: cs.id })); saveStep(`_color_scheme_${key}`, cs.id) }}
                          title={cs.label}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '4px 10px', fontSize: 11,
                            borderRadius: 6, border: current === cs.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                            background: current === cs.id ? 'var(--bg-hover)' : 'var(--bg)',
                            cursor: 'pointer',
                          }}>
                          <span style={{ width: 14, height: 14, borderRadius: '50%', background: cs.primary, display: 'inline-block', flexShrink: 0 }} />
                          {cs.label}
                        </button>
                      )})}
                    </div>
                  </div>
                )}
                <div className="form-label">大模型</div>
                <select className="form-select" style={{ marginBottom: 8 }} value={s3YanxiPptModel} onChange={e => { setS3YanxiPptModel(e.target.value); saveStep('_model_step3_yan_ppt', e.target.value) }}>
                  <option value="">选择模型...</option>
                  {llmProviders.filter(p => p.is_enabled).map(p =>
                    (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} / {m}</option>
                    ))
                  )}
                </select>
                <div className="form-label">温度设置</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setS3YanxiTempOpen(true)}>⚙ 温度设置 (SOP 生成 + 3 阶段)</button>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button className="btn btn-sm"
                    style={{ flex: 1 }}
                    disabled={!yanxiPptSelected || !(steps.step2_yanxi || '') || !s3YanxiPptModel || pptOutlineLoading['step3_yan_ppt']}
                    onClick={() => doGenerateOutline('step3_yan_ppt', steps.step2_yanxi || '', yanxiPptSelected, s3YanxiPptModel, 'col5', s3YanxiPptTemp, s3YanxiTemps.outline, s3YanxiTemps.keyword, s3YanxiTemps.research, s3YanxiTemps.fill, s3YanxiTemps.stageOutline, s3YanxiTemps.stageGeneration, s3YanxiTemps.stageReview)}>
                    {pptOutlineLoading['step3_yan_ppt'] ? '⏳ 生成中...' : '📋 生成大纲'}
                  </button>
                  {pptOutlineLoading['step3_yan_ppt'] && (
                    <button className="btn btn-sm" style={{ background: 'var(--warning)', color: '#fff', flex: '0 0 auto' }}
                      onClick={() => handleCancelGenerate('step3_yan_ppt')}>取消</button>
                  )}
                  <button className="btn btn-primary btn-sm"
                    style={{ flex: 1 }}
                    disabled={!yanxiPptSelected || !(steps.step2_yanxi || '') || !s3YanxiPptModel || pptGenerating['step3_yan_ppt']}
                    onClick={() => doGeneratePPT('step3_yan_ppt', steps.step2_yanxi || '', yanxiPptSelected, '综合PPT',
                      stage3Prompts.yanxiPpt?.prompt || '请将手册内容转化为PPT。',
                      s3YanxiPptModel, 'col5', s3YanxiPptTemp, s3YanxiTemps.keyword, s3YanxiTemps.research, s3YanxiTemps.outline, s3YanxiTemps.fill, s3YanxiTemps.cards, s3YanxiTemps.html, s3YanxiTemps.svg_batch, s3YanxiTemps.svg_single, s3YanxiTemps.review, s3YanxiTemps.fix, s3YanxiTemps.holistic, s3YanxiTemps.holistic_fix, s3YanxiTemps.stageOutline, s3YanxiTemps.stageGeneration, s3YanxiTemps.stageReview)}>
                    {pptGenerating['step3_yan_ppt'] ? '⏳ 合成中...' : '📌 合成PPT'}
                  </button>
                </div>
                {pptGenerating['step3_yan_ppt'] && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)', flex: 1 }}
                      onClick={() => handleCancelGenerate('step3_yan_ppt')}>取消生成</button>
                  </div>
                )}
                {!yanxiPptSelected || !(steps.step2_yanxi || '') || !s3YanxiPptModel ? (
                  <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 4 }}>
                    {[
                      !yanxiPptSelected ? '请选择模板' : '',
                      !(steps.step2_yanxi || '') ? '请先生成手册文档' : '',
                      !s3YanxiPptModel ? '请选择大模型' : '',
                    ].filter(Boolean).join(' | ')}
                  </div>
                ) : null}
                {(pptLog.length > 0 || pptOutlineLoading['step3_yan_ppt'] || pptGenerating['step3_yan_ppt']) && (
                  <div ref={pptLogContainerRef} style={{ maxHeight: 180, overflowY: 'auto', background: 'var(--bg)', color: 'var(--text-secondary)', fontFamily: 'monospace', fontSize: 11, lineHeight: '18px', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)', marginTop: 8 }}>
                    {pptLog.length === 0 ? (
                      <div style={{ color: '#888' }}>等待日志...</div>
                    ) : (
                      pptLog.map((entry, i) => (
                        <div key={i} style={{ marginBottom: 2 }}>
                          <span style={{ color: '#888' }}>[{entry.time}]</span> {entry.message}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', marginBottom: 8, flexShrink: 0 }}>
                  <div style={{ display: 'flex', gap: 0 }}>
                    <button className="btn btn-ghost btn-sm"
                      style={{ borderBottom: (previewTab[step3Key()] || 'ppt') === 'ppt' ? '2px solid var(--primary)' : '2px solid transparent', borderRadius: 0, fontWeight: (previewTab[step3Key()] || 'ppt') === 'ppt' ? 600 : 400 }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'ppt'}))}>大纲内容</button>
                    <button className="btn btn-ghost btn-sm"
                      style={{ borderBottom: (previewTab[step3Key()] || 'ppt') === 'json' ? '2px solid var(--primary)' : '2px solid transparent', borderRadius: 0, fontWeight: (previewTab[step3Key()] || 'ppt') === 'json' ? 600 : 400 }}
                      onClick={() => setPreviewTab(prev => ({...prev, [step3Key()]: 'json'}))}>JSON</button>
                  </div>
                </div>
                {((previewTab[step3Key()] || 'ppt') === 'ppt') ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    {pptOutlineLoading['step3_yan_ppt'] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                        <div style={{ fontSize: 24, animation: 'spin 2s linear infinite' }}>⏳</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          AI 正在分析内容并生成大纲...<br />
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>预计 30-60 秒，请耐心等待</span>
                        </div>
                      </div>
                    ) : pptOutline[step3Key()] ? (
                      <textarea
                        style={{
                          flex: 1, width: '100%', border: 'none', resize: 'none',
                          fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
                          color: 'var(--text)', background: 'var(--bg)',
                          outline: 'none', padding: 8, borderRadius: 4,
                        }}
                        value={pptOutline[step3Key()].outline_text}
                        readOnly={!pptEditMode[step3Key()]}
                        onChange={(e) => {
                          const md = e.target.value
                          setPptOutline(prev => ({
                            ...prev,
                            [step3Key()]: { ...prev[step3Key()], outline_text: md }
                          }))
                        }}
                        placeholder="大纲内容将显示在这里..."
                      />
                    ) : pptGenerating['step3_yan_ppt'] ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
                        <div style={{ fontSize: 24, animation: 'spin 2s linear infinite' }}>⏳</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          AI 正在合成幻灯片...
                        </div>
                      </div>
                    ) : pptSlidePlans[step3Key()] ? (
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12 }}>已生成 {pptSlidePlans[step3Key()].slides.length} 页幻灯片</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm"
                            disabled={!pptSlidePlans[step3Key()]?.previewUrl}
                            onClick={() => pptSlidePlans[step3Key()]?.previewUrl && window.open(pptSlidePlans[step3Key()].previewUrl + '?_t=' + Date.now(), '_blank')}>
                            预览
                          </button>
                          {pptSlidePlans[step3Key()].format === 'svg' ? (
                            <button className="btn btn-ghost btn-sm"
                              onClick={async () => { const z = pptSlidePlans[step3Key()].zipUrl; if (z) downloadFile(z, pptSlidePlans[step3Key()].filename + '.zip') }}>
                              ⬇ SVG ZIP
                            </button>
                          ) : (
                            <>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => downloadFile(pptSlidePlans[step3Key()].downloadUrl, pptSlidePlans[step3Key()].filename)}>
                                ⬇ PPTX
                              </button>
                              <button className="btn btn-ghost btn-sm"
                                onClick={() => handleDownloadHtml(step3Key())}>
                                ⬇ HTML
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10 }}>
                        <div style={{ fontSize: 36, opacity: 0.3 }}>📋</div>
                        <div style={{ color: 'var(--text-secondary)', fontSize: 12, textAlign: 'center' }}>
                          点击左侧 <span style={{ fontWeight: 600, color: 'var(--primary)' }}>📋 生成大纲</span> 开始分析
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 10, textAlign: 'center' }}>
                          生成大纲后可在此编辑精修<br />确认无误后再点击 合成PPT
                        </div>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 4, marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const key = step3Key()
                          setPptEditMode(prev => ({...prev, [key]: !prev[key]}))
                        }}>
                        {pptEditMode[step3Key()] ? '👁 查看' : '✏ 编辑'}
                      </button>
                      <button className="btn btn-ghost btn-sm"
                        disabled={!pptOutline[step3Key()] && !steps[step3Key()]}
                        onClick={async () => {
                          if (!id) return
                          try {
                            const text = pptOutline[step3Key()]?.outline_text || steps[step3Key()] || ''
                            const resp = await api.saveFileToProject(id, `${project?.name || '文档'}_综合PPT大纲.txt`, text)
                            modal.toast(`已保存到 ${resp.path}`, 'success')
                          } catch (e: any) { modal.toast('保存失败: ' + e.message, 'error') }
                        }}>📥 保存到项目</button>
                      <button className={`btn btn-primary btn-sm ${getSaveBtnClass(pptOutline[step3Key()]?.outline_text || steps[step3Key()] || '', step3Key())} ${pptSavingOutline[step3Key()] ? 'btn-disabled' : ''}`}
                        disabled={pptSavingOutline[step3Key()]}
                        onClick={async () => {
                          const key = step3Key();
                          const currentText = pptOutline[key]?.outline_text || '';
                          const savedText = steps[key] || '';
                          const textChanged = currentText !== savedText;
                          const model = getPptModel(key);

                          if (textChanged && model) {
                            setPptSavingOutline(prev => ({...prev, [key]: true}));
                            try {
                              const [pid, mdl] = model.split(':');
                              const result = await api.convertOutlineToJson(currentText, pptOutline[key]?.outline_json || [], pid, mdl);
                              if (result?.outline_json?.length) {
                                setPptOutline(prev => ({...prev, [key]: {...prev[key], outline_json: result.outline_json}}));
                                saveStep(`_ppt_outline_json_${key}`, JSON.stringify(result.outline_json));
                              }
                            } catch (e: any) {
                              modal.toast(`大纲转换失败: ${e?.message || e}`, 'error');
                            } finally {
                              setPptSavingOutline(prev => ({...prev, [key]: false}));
                            }
                          }

                          saveStep(key, currentText);
                          flashSave();
                        }}>
                        {pptSavingOutline[step3Key()] ? '⏳ 转换中...' : getSaveBtnLabel(pptOutline[step3Key()]?.outline_text || steps[step3Key()] || '', step3Key())}
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => {
                        const key = step3Key()
                        setPptSlidePlans(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPptOutline(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPreviewHtml(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPreviewLoading(prev => { const n = { ...prev }; delete n[key]; return n })
                        setPptEditMode(prev => { const n = { ...prev }; delete n[key]; return n })
                      }}>✕ 清空</button>
                      <span style={{ flex: 1 }} />
                      <button className="btn btn-ghost btn-sm"
                        onClick={() => {
                          const key = step3Key()
                          setEditPanelOpen(prev => ({ ...prev, [key]: !prev[key] }))
                        }}
                        style={{ background: editPanelOpen[step3Key()] ? 'var(--primary)' : undefined, color: editPanelOpen[step3Key()] ? '#fff' : undefined }}>
                        {editPanelOpen[step3Key()] ? '✕ 关闭' : 'HTML编辑'}
                      </button>
                      {pptSlidePlans[step3Key()]?.previewUrl && (
                        <button className="btn btn-ghost btn-sm"
                          onClick={() => window.open(pptSlidePlans[step3Key()].previewUrl + '?_t=' + Date.now(), '_blank')}>
                          预览
                        </button>
                      )}
                      {pptSlidePlans[step3Key()]?.format === 'svg' ? (
                        <button className="btn btn-ghost btn-sm"
                          onClick={async () => { const z = pptSlidePlans[step3Key()].zipUrl; if (z) downloadFile(z, (pptSlidePlans[step3Key()].filename || 'svg-deck') + '.zip') }}>
                          ⬇ SVG ZIP
                        </button>
                      ) : pptSlidePlans[step3Key()] ? (
                        <>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => downloadFile(pptSlidePlans[step3Key()].downloadUrl, pptSlidePlans[step3Key()].filename)}>
                            ⬇ PPTX
                          </button>
                          <button className="btn btn-ghost btn-sm"
                            onClick={() => handleDownloadHtml(step3Key())}>
                            ⬇ HTML
                          </button>
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : (previewTab[step3Key()] === 'json') ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                    <pre style={{
                      flex: 1, width: '100%', border: 'none', margin: 0,
                      fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
                      color: 'var(--text)', background: 'var(--bg)',
                      overflow: 'auto', padding: 8, borderRadius: 4,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {pptOutline[step3Key()] ? JSON.stringify(pptOutline[step3Key()].outline_json, null, 2) : '暂无大纲数据'}
                    </pre>
                  </div>
                ) : (
                  <></>
                )}
                <SlideEditModal
                  open={!!(editPanelOpen[step3Key()] && editPanelProps().runId)}
                  runId={editPanelProps().runId}
                  previewUrl={editPanelProps().previewUrl}
                  slideCount={editPanelProps().slideCount}
                  providerId={editPanelProps().providerId}
                  model={editPanelProps().model}
                  pptxDownloadUrl={pptSlidePlans[step3Key()]?.downloadUrl}
                  pptxFilename={pptSlidePlans[step3Key()]?.filename}
                  downloadFormat={pptSlidePlans[step3Key()]?.format}
                  projectId={id}
                  projectName={project?.name}
                  onDownloadHtml={() => handleDownloadHtml(step3Key())}
                  onClose={() => {
                    const key = step3Key()
                    setEditPanelOpen(prev => ({ ...prev, [key]: false }))
                  }}
                />
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
                <div className="card-hint">基于文档内容，生成口播稿</div>
                <div className="form-label">来源</div>
                <select className="form-select" style={{ marginBottom: 8 }}><option>手册文档</option></select>
                <div className="form-label">大模型</div>
                <select className="form-select" style={{ marginBottom: 8 }}
                  value={s4KouboModel} onChange={e => { setS4KouboModel(e.target.value); saveStep('_model_s4_koubo', e.target.value) }}>
                  <option value="">默认 (DeepSeek)</option>
                  {llmProviders.map(p => (
                    Array.isArray(p.models) ? p.models.map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>{p.name} ({m})</option>
                    )) : null
                  ))}
                </select>
                <button className="btn btn-primary btn-sm w-full" style={{ marginTop: 10 }}
                  disabled={step2Generating['koubo']}
                  onClick={async () => {
                    const ctrl = new AbortController(); abortRef.current['step4_koubo'] = ctrl
                    setStep2Generating(prev => ({ ...prev, koubo: true }))
                    try {
                      let prompt = stage4KouboPrompt || '请根据以下内容生成口播稿，风格亲切自然。'
                      let pid = '', mdl = ''
                      if (s4KouboModel) { [pid, mdl] = s4KouboModel.split(':') }
                      const content = await doGenerate('step4_koubo', prompt,
                        steps.step2_yanxi || steps.step1_video || steps.step1_text || steps.step1_file || '',
                        pid, mdl, 0.3, ctrl.signal)
                      if (content) setKouboText(content)
                    } finally { setStep2Generating(prev => ({ ...prev, koubo: false })); delete abortRef.current['step4_koubo'] }
                  }}>
                  {step2Generating['koubo'] ? '⏳ 生成中...' : '📢 生成口播稿'}
                </button>
                {step2Generating['koubo'] && (
                  <button className="btn btn-sm" style={{ marginTop: 4, background: 'var(--warning)', color: '#fff', width: '100%' }}
                    onClick={() => { abortRef.current['step4_koubo']?.abort(); modal.toast('已取消生成', 'success') }}>取消</button>
                )}
              </div>
            </div>
            <div className="panel-right">
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div className="tmpl-preview" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div className="tmpl-preview-header">📢 口播稿预览</div>
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
                      {ttsVoices.find(v => v.id === voiceId)?.description || ''}
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
                        {f.type === 'Word' ? '📃 ' : f.type === 'PPT' ? '📌 ' : f.type === 'SVG' ? '🎨 ' : '🎵 '}
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
                  <button className={`btn btn-primary btn-sm ${getSaveBtnClass(videoText, 'video_text')}`} onClick={() => {
                    if (id && videoText.trim()) { saveStep('video_text', videoText); flashSave() }
                    setVcOpen(false)
                  }}>
                    {getSaveBtnLabel(videoText, 'video_text')}
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

      {/* ── Stage3 Temp Settings Modals ── */}
      <Stage3TempSettings open={s3DaoTempOpen} initialTemps={s3DaoTemps} onApply={temps => { setS3DaoTemps(temps); Object.keys(temps).forEach(k => saveStep(`_temps_dao_${k}`, String((temps as any)[k]))); setS3DaoTempOpen(false) }} onClose={() => setS3DaoTempOpen(false)} />
      <Stage3TempSettings open={s3YanxiTempOpen} initialTemps={s3YanxiTemps} onApply={temps => { setS3YanxiTemps(temps); Object.keys(temps).forEach(k => saveStep(`_temps_yanxi_${k}`, String((temps as any)[k]))); setS3YanxiTempOpen(false) }} onClose={() => setS3YanxiTempOpen(false)} />
      <Stage3TempSettings open={s3SopTempOpen} initialTemps={s3SopTemps} onApply={temps => { setS3SopTemps(temps); setS3SopTemp(temps.sop); Object.keys(temps).forEach(k => saveStep(`_temps_sop_${k}`, String((temps as any)[k]))); setS3SopTempOpen(false) }} onClose={() => setS3SopTempOpen(false)} />

      {/* ── Model Picker Modal ── */}
      {showModelPicker && (
        <div className="dialog-overlay"
          onMouseDown={(e: any) => { overlayMouseDownRef.current = e.target === e.currentTarget }}
          onClick={() => { if (overlayMouseDownRef.current) setShowModelPicker(false) }}>
          <div className="dialog-box" style={{ width: 440 }} onClick={e => e.stopPropagation()}>
            <div className="dialog-title">选择 Stage 2 大模型</div>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
              为以下栏目配置大模型，已选中的将自动沿用：
            </p>
            {modelPickerAll.map(c => (
              <div key={c.modelKey} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  {c.label} {steps[c.modelKey] ? <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 400 }}>已配置</span> : <span style={{ fontSize: 10, color: 'var(--warning)', fontWeight: 400 }}>未配置</span>}
                </label>
                <select
                  className="form-input"
                  value={modelPickerValues[c.modelKey] || ''}
                  onChange={e => setModelPickerValues(prev => ({ ...prev, [c.modelKey]: e.target.value }))}
                >
                  <option value="">-- 选择模型 --</option>
                  {llmProviders.filter(p => p.is_enabled).flatMap(p =>
                    (Array.isArray(p.models) ? p.models : []).map((m: string) => (
                      <option key={`${p.id}:${m}`} value={`${p.id}:${m}`}>
                        {p.name} / {m}
                      </option>
                    ))
                  )}
                </select>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowModelPicker(false)}>取消</button>
              <button className="btn btn-primary btn-sm"
                disabled={modelPickerAll.some(c => !modelPickerValues[c.modelKey])}
                onClick={handleModelPickerConfirm}
              >确认并生成</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
